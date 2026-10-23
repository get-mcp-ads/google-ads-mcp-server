import { randomUUID } from "node:crypto";
/** Copyright 2026 GetMCPAds. SPDX-License-Identifier: Apache-2.0 */
import { z } from "zod";
import type { ToolShape } from "../../tool-quality.js";
import { toMicroCurrency, toMicros, toMinorUnits, toPlainAmount } from "../../core/money.js";
import { registerGoogleExtendedWrites } from "./extended-writes.js";
import { tokenSourceFor } from "../../core/google-oauth.js";
import { assertUrlAccountAllowed } from "../../core/account-scope.js";
import { MAX_API_RESPONSE_BYTES, MAX_SMALL_RESPONSE_BYTES, readBoundedJson } from "../../core/http.js";
import { GOOGLE_ADS_API_BASE_URL } from "./types.js";
type Handler = (args: Record<string, unknown>) => Promise<unknown>;
type Collector = { tool: (n: string, d: string, s: ToolShape, h: Handler) => void };

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function ko(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

/**
 * Toute écriture est un aperçu tant que `confirm` n'est pas vrai.
 *
 * C'est un assistant qui compose ces appels : il peut se tromper de compte, de
 * campagne ou d'ordre de grandeur sur un budget. Un aperçu obligatoire rend
 * l'erreur visible avant qu'elle ne coûte de l'argent, et donne à l'humain le
 * point d'arrêt que le protocole ne garantit pas.
 */
function preview(action: string, details: Record<string, unknown>) {
  return ok({
    applied: false,
    action,
    change: details,
    message:
      "Preview only, nothing was changed. Repeat the same call with confirm: true " +
      "to apply this change to the live account.",
  });
}

const confirmSchema = z
  .boolean()
  .optional()
  .describe("Set to true to actually apply the change. Without it, the tool only previews.");

/** A write gets longer than a read, but never an unbounded wait. */
const WRITE_TIMEOUT_MS = 60_000;

/** Numeric IDs only: an ID is a URL path segment, and nothing else may reach the path. */
const customerIdSchema = z.string().regex(/^\d[\d-]*\d$|^\d$/, "Expected a numeric Google Ads customer ID, with or without dashes");
const numericIdSchema = z.string().regex(/^\d+$/, "Expected a numeric Google Ads ID");

async function request(url: string, init: RequestInit, contexte: string, allowed?: readonly string[]): Promise<unknown> {
  assertUrlAccountAllowed(allowed, url);
  let response: Response;
  try {
    response = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(WRITE_TIMEOUT_MS) });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      // No retry: the change may have reached Google before the reply was lost.
      throw new Error(`${contexte}: Google Ads did not answer within ${WRITE_TIMEOUT_MS / 1000} seconds. The change may have been applied. Read the account before trying again.`);
    }
    throw error;
  }
  const parsed = await readBoundedJson(response, response.ok ? MAX_API_RESPONSE_BYTES : MAX_SMALL_RESPONSE_BYTES, contexte);
  if (!response.ok) {
    if (url.startsWith(ADS_BASE + "/")) {
      const error = (parsed as { error?: { message?: string; details?: { errors?: { errorCode?: unknown; message?: string; location?: unknown }[] }[] } })?.error;
      const details = error?.details?.flatMap(d => d.errors ?? []).map(e => ({ code: e.errorCode, message: e.message, location: e.location }));
      throw new Error(`${contexte}: ${JSON.stringify(details?.length ? details : error?.message ?? parsed).slice(0, 3000)}`);
    }
    throw new Error(`${contexte} : ${typeof parsed === "string" ? parsed.slice(0, 300) : JSON.stringify(parsed).slice(0, 300)}`);
  }
  return parsed;
}

const ADS_BASE = GOOGLE_ADS_API_BASE_URL;

export function registerGoogleAdsWrites(c: Collector, config: Record<string, string>): void {
  registerGoogleExtendedWrites(c, config);
  // The same token source as the read tools: one refresh, and one clear error
  // when Google has revoked the refresh token.
  const tokens = tokenSourceFor(config as never, "GOOGLE_ADS_REFRESH_TOKEN");
  const allowed = (config as unknown as { allowedAccountIds?: readonly string[] }).allowedAccountIds;
  const send = (url: string, init: RequestInit, contexte: string) => request(url, init, contexte, allowed);

  const headers = async (loginCustomerId?: string) => {
    const h: Record<string, string> = {
      authorization: `Bearer ${await tokens.getAccessToken()}`,
      "developer-token": config.developerToken,
      "content-type": "application/json",
    };
    const manager = loginCustomerId ?? config.loginCustomerId;
    if (manager) h["login-customer-id"] = manager.replace(/-/g, "");
    return h;
  };

  c.tool(
    "google_ads_update_campaign_status",
    "Pause, re-enable or remove a Google Ads campaign. Previews by default: without " +
      "confirm: true, the tool describes the change without applying it.",
    {
      customerId: customerIdSchema.describe("Google Ads customer ID, with or without dashes."),
      campaignId: numericIdSchema.describe("Campaign ID."),
      status: z.enum(["PAUSED", "ENABLED", "REMOVED"]).describe("New status."),
      loginCustomerId: customerIdSchema.optional().describe("Manager account, if the customer sits under an MCC."),
      confirm: confirmSchema,
    },
    async (a) => {
      const { customerId, campaignId, status, loginCustomerId, confirm } = a as Record<string, string | boolean>;
      const cid = String(customerId).replace(/-/g, "");
      if (!confirm) {
        return preview("google_ads_update_campaign_status", { customer: cid, campaign: campaignId, newStatus: status });
      }
      const result = await send(
        `${ADS_BASE}/customers/${cid}/campaigns:mutate`,
        {
          method: "POST",
          headers: await headers(loginCustomerId as string | undefined),
          body: JSON.stringify({
            operations: [
              status === "REMOVED"
                ? { remove: `customers/${cid}/campaigns/${campaignId}` }
                : { update: { resourceName: `customers/${cid}/campaigns/${campaignId}`, status }, updateMask: "status" },
            ],
          }),
        },
        "Google Ads status update",
      );
      return ok({ applied: true, action: "google_ads_update_campaign_status", result: result });
    },
  );

  c.tool(
    "google_ads_create_campaign",
    "Create a Google Ads campaign. It is always created PAUSED and there is no option to " +
      "create it active: someone has to look at it before it spends. Creates the campaign " +
      "budget too. Previews by default.",
    {
      customerId: customerIdSchema.describe("Google Ads customer ID, with or without dashes."),
      name: z.string().describe("Campaign name."),
      channelType: z
        .enum(["SEARCH", "DISPLAY", "SHOPPING", "PERFORMANCE_MAX", "DEMAND_GEN"])
        .describe("Advertising channel. Classic VIDEO creation is not supported by Google Ads API; Demand Gen is a distinct, supported video-capable campaign type."),
      dailyBudget: z.number().positive().describe("Daily budget in the account currency."),
      loginCustomerId: customerIdSchema.optional().describe("Manager account ID, when the customer sits under an MCC. Omit otherwise."),
      brandGuidelinesEnabled: z.literal(false).optional().describe("For Performance Max, explicitly pass false to create an empty paused campaign without campaign-level brand assets. Brand-enabled creation is not supported by this tool."),
      euPoliticalAdvertising: z.boolean().optional().describe("Required for execution: explicitly declare whether this campaign contains EU political advertising."),
      merchantId: z.string().regex(/^\d+$/).optional().describe("Merchant Center account ID; required for Shopping."),
      feedLabel: z.string().optional().describe("Merchant Center feed label for Shopping."),
      validateOnly: z.boolean().optional().describe("Validate the atomic request with Google without creating any resources."),
      confirm: confirmSchema,
    },
    async (a) => {
      const { customerId, name, channelType, dailyBudget, loginCustomerId, confirm } = a as Record<
        string,
        string | number | boolean
      >;
      const cid = String(customerId).replace(/-/g, "");
      const micros = toMicros(Number(dailyBudget));
      if (!confirm && !a.validateOnly) {
        return preview("google_ads_create_campaign", {
          customer: cid,
          name,
          channelType,
          dailyBudget,
          inMicros: micros,
          status: "PAUSED",
          euPoliticalAdvertising: a.euPoliticalAdvertising ?? "declaration required before execution",
          brandGuidelinesEnabled: a.brandGuidelinesEnabled, merchantId: a.merchantId, feedLabel: a.feedLabel,
          biddingStrategy: ["PERFORMANCE_MAX", "DEMAND_GEN"].includes(String(channelType)) ? "MAXIMIZE_CONVERSIONS" : "MANUAL_CPC",
        });
      }

      if (channelType === "VIDEO") throw new Error("Google Ads API cannot create VIDEO campaigns. Use an explicitly requested DEMAND_GEN video campaign through google_ads_apply_plan.");
      if (typeof a.euPoliticalAdvertising !== "boolean") throw new Error("Declare euPoliticalAdvertising explicitly before creating the campaign.");
      if (channelType === "PERFORMANCE_MAX" && a.brandGuidelinesEnabled !== false) throw new Error("Performance Max requires explicit brandGuidelinesEnabled: false for empty paused creation; brand assets are not supported by this tool.");
      if (channelType === "SHOPPING" && !a.merchantId) throw new Error("Shopping requires merchantId for an accessible Merchant Center account.");
      const budgetName = `customers/${cid}/campaignBudgets/-1`;
      const campaignData = {
        name, status: "PAUSED", advertisingChannelType: channelType, campaignBudget: budgetName,
        containsEuPoliticalAdvertising: a.euPoliticalAdvertising ? "CONTAINS_EU_POLITICAL_ADVERTISING" : "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
        ...(["PERFORMANCE_MAX", "DEMAND_GEN"].includes(String(channelType)) ? { maximizeConversions: {}, ...(channelType === "PERFORMANCE_MAX" ? {brandGuidelinesEnabled: false} : {}) } : { manualCpc: {} }),
        ...(channelType === "SHOPPING" ? { shoppingSetting: { merchantId: a.merchantId, campaignPriority: 0, feedLabel: a.feedLabel } } : {}),
      };
      // Atomic request: failure cannot leave an orphan budget behind.
      const result = await send(`${ADS_BASE}/customers/${cid}/googleAds:mutate`, {
        method: "POST", headers: await headers((loginCustomerId as string | undefined) ?? config.loginCustomerId),
        body: JSON.stringify({ partialFailure: false, validateOnly: a.validateOnly === true, mutateOperations: [
          { campaignBudgetOperation: { create: { resourceName: budgetName, name: `${name} budget ${randomUUID()}`, amountMicros: String(micros), deliveryMethod: "STANDARD", explicitlyShared: false } } },
          { campaignOperation: { create: campaignData } },
        ] }),
      }, "Google Ads campaign creation") as { mutateOperationResponses?: { campaignBudgetResult?: {resourceName: string}; campaignResult?: {resourceName: string} }[] };
      return ok({ applied: a.validateOnly !== true, validatedByGoogle: a.validateOnly === true,
        action: "google_ads_create_campaign", status: "PAUSED",
        budget: result.mutateOperationResponses?.[0]?.campaignBudgetResult?.resourceName,
        result: { results: result.mutateOperationResponses?.flatMap(r => r.campaignResult ? [r.campaignResult] : []) ?? [] },
      });
    },
  );

  c.tool(
    "google_ads_update_campaign_budget",
    "Change the daily budget of a Google Ads campaign. The amount is in the account currency " +
      "(12.50 for 12.50 EUR). Previews by default.",
    {
      customerId: customerIdSchema.describe("Google Ads customer ID, with or without dashes."),
      budgetId: numericIdSchema.describe("Campaign budget ID (campaign_budget.id)."),
      dailyAmount: z.number().positive().describe("New daily budget, in the account currency."),
      loginCustomerId: customerIdSchema.optional().describe("Manager account ID, when the customer sits under an MCC. Omit otherwise."),
      confirm: confirmSchema,
    },
    async (a) => {
      const { customerId, budgetId, dailyAmount, loginCustomerId, confirm } = a as Record<string, string | number | boolean>;
      const cid = String(customerId).replace(/-/g, "");
      const micros = toMicros(Number(dailyAmount));
      if (!confirm) {
        return preview("google_ads_update_campaign_budget", {
          customer: cid, budget: budgetId, newDailyBudget: dailyAmount, inMicros: micros,
        });
      }
      const result = await send(
        `${ADS_BASE}/customers/${cid}/campaignBudgets:mutate`,
        {
          method: "POST",
          headers: await headers(loginCustomerId as string | undefined),
          body: JSON.stringify({
            operations: [
              {
                update: { resourceName: `customers/${cid}/campaignBudgets/${budgetId}`, amountMicros: String(micros) },
                updateMask: "amount_micros",
              },
            ],
          }),
        },
        "Google Ads budget update",
      );
      return ok({ applied: true, action: "google_ads_update_campaign_budget", result: result });
    },
  );

  c.tool(
    "google_ads_rename_campaign",
    "Rename a Google Ads campaign. The name is the only thing that changes: delivery, budget " +
      "and targeting are untouched. Previews by default.",
    {
      customerId: customerIdSchema.describe("Google Ads customer ID, with or without dashes."),
      campaignId: numericIdSchema.describe("Campaign ID."),
      name: z.string().min(1).max(255).describe("New campaign name."),
      loginCustomerId: customerIdSchema.optional().describe("Manager account ID, when the customer sits under an MCC. Omit otherwise."),
      confirm: confirmSchema,
    },
    async (a) => {
      const { customerId, campaignId, name, loginCustomerId, confirm } = a as Record<string, string | boolean>;
      const cid = String(customerId).replace(/-/g, "");
      if (!confirm) return preview("google_ads_rename_campaign", { customer: cid, campaign: campaignId, newName: name });
      const result = await send(
        `${ADS_BASE}/customers/${cid}/campaigns:mutate`,
        {
          method: "POST",
          headers: await headers(loginCustomerId as string | undefined),
          body: JSON.stringify({
            operations: [{ update: { resourceName: `customers/${cid}/campaigns/${campaignId}`, name }, updateMask: "name" }],
          }),
        },
        "Google Ads rename",
      );
      return ok({ applied: true, action: "google_ads_rename_campaign", result });
    },
  );

  // Ad group and asset group follow google_ads_rename_campaign exactly. Ads
  // have no counterpart: Ad.name is immutable once the ad exists.
  for (const [tool, label, param, resource, max] of [
    ["google_ads_rename_adgroup", "ad group", "adGroupId", "adGroups", 254],
    ["google_ads_rename_asset_group", "Performance Max asset group", "assetGroupId", "assetGroups", 128],
  ] as const) {
    c.tool(
      tool,
      `Rename a Google Ads ${label}. The name is the only thing that changes: delivery, bids and ` +
        "assets are untouched. Previews by default.",
      {
        customerId: customerIdSchema.describe("Google Ads customer ID, with or without dashes."),
        [param]: numericIdSchema.describe(`${label[0].toUpperCase()}${label.slice(1)} ID.`),
        name: z.string().min(1).max(max).refine(v => !/[\r\n\0]/.test(v), "Line breaks are not allowed.").describe(`New ${label} name.`),
        loginCustomerId: customerIdSchema.optional().describe("Manager account ID, when the customer sits under an MCC. Omit otherwise."),
        confirm: confirmSchema,
      },
      async (a) => {
        const cid = String(a.customerId).replace(/-/g, "");
        const id = String(a[param]);
        const { name, loginCustomerId, confirm } = a as Record<string, string | boolean>;
        if (!confirm) return preview(tool, { customer: cid, [param]: id, newName: name });
        const result = await send(
          `${ADS_BASE}/customers/${cid}/${resource}:mutate`,
          {
            method: "POST",
            headers: await headers(loginCustomerId as string | undefined),
            body: JSON.stringify({
              operations: [{ update: { resourceName: `customers/${cid}/${resource}/${id}`, name }, updateMask: "name" }],
            }),
          },
          `Google Ads ${label} rename`,
        );
        return ok({ applied: true, action: tool, result });
      },
    );
  }

  c.tool(
    "google_ads_rename_account",
    "Rename a Google Ads account (its descriptive name). Nothing else changes. Previews by default.",
    {
      customerId: customerIdSchema.describe("Google Ads customer ID, with or without dashes."),
      name: z.string().min(1).max(255).describe("New descriptive name of the account."),
      loginCustomerId: customerIdSchema.optional().describe("Manager account ID, when the customer sits under an MCC. Omit otherwise."),
      confirm: confirmSchema,
    },
    async (a) => {
      const { customerId, name, loginCustomerId, confirm } = a as Record<string, string | boolean>;
      const cid = String(customerId).replace(/-/g, "");
      if (!confirm) return preview("google_ads_rename_account", { customer: cid, newName: name });
      // CustomerService takes a single operation, and only updates.
      const result = await send(
        `${ADS_BASE}/customers/${cid}:mutate`,
        {
          method: "POST",
          headers: await headers(loginCustomerId as string | undefined),
          body: JSON.stringify({
            operation: { update: { resourceName: `customers/${cid}`, descriptiveName: name }, updateMask: "descriptive_name" },
          }),
        },
        "Google Ads account rename",
      );
      return ok({ applied: true, action: "google_ads_rename_account", result });
    },
  );

  c.tool(
    "google_ads_update_campaign_schedule",
    "Change the start or end date of a Google Ads campaign. Dates are YYYY-MM-DD in the " +
      "account time zone. Previews by default.",
    {
      customerId: customerIdSchema.describe("Google Ads customer ID, with or without dashes."),
      campaignId: numericIdSchema.describe("Campaign ID."),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Start date, YYYY-MM-DD, in the account time zone."),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
        .describe("Use 2037-12-30 to clear the end date (run indefinitely)."),
      loginCustomerId: customerIdSchema.optional().describe("Manager account ID, when the customer sits under an MCC. Omit otherwise."),
      confirm: confirmSchema,
    },
    async (a) => {
      const { customerId, campaignId, startDate, endDate, loginCustomerId, confirm } = a as Record<string, string | boolean>;
      if (!startDate && !endDate) return ko("Provide startDate, endDate, or both.");
      for (const date of [startDate, endDate]) {
        if (date && (Number.isNaN(Date.parse(String(date))) || new Date(String(date)).toISOString().slice(0, 10) !== date)) return ko("Invalid calendar date.");
      }
      if (startDate && endDate && String(startDate) > String(endDate)) {
        return ko(`startDate ${startDate} is after endDate ${endDate}.`);
      }
      const cid = String(customerId).replace(/-/g, "");
      const update: Record<string, unknown> = { resourceName: `customers/${cid}/campaigns/${campaignId}` };
      const mask: string[] = [];
      if (startDate) { update.startDateTime = `${startDate} 00:00:00`; mask.push("start_date_time"); }
      if (endDate) { if (endDate !== "2037-12-30") update.endDateTime = `${endDate} 23:59:59`; mask.push("end_date_time"); }
      if (!confirm) return preview("google_ads_update_campaign_schedule", { customer: cid, campaign: campaignId, startDate, endDate });
      const result = await send(
        `${ADS_BASE}/customers/${cid}/campaigns:mutate`,
        {
          method: "POST",
          headers: await headers(loginCustomerId as string | undefined),
          body: JSON.stringify({ operations: [{ update, updateMask: mask.join(",") }] }),
        },
        "Google Ads schedule update",
      );
      return ok({ applied: true, action: "google_ads_update_campaign_schedule", result });
    },
  );

  c.tool(
    "google_ads_update_adgroup_status",
    "Pause, re-enable or remove a Google Ads ad group. Previews by default.",
    {
      customerId: customerIdSchema.describe("Google Ads customer ID, with or without dashes."),
      adGroupId: numericIdSchema.describe("Ad group ID."),
      status: z.enum(["PAUSED", "ENABLED", "REMOVED"]).describe("New status."),
      loginCustomerId: customerIdSchema.optional().describe("Manager account ID, when the customer sits under an MCC. Omit otherwise."),
      confirm: confirmSchema,
    },
    async (a) => {
      const { customerId, adGroupId, status, loginCustomerId, confirm } = a as Record<string, string | boolean>;
      const cid = String(customerId).replace(/-/g, "");
      if (!confirm) return preview("google_ads_update_adgroup_status", { customer: cid, adGroup: adGroupId, newStatus: status });
      const result = await send(
        `${ADS_BASE}/customers/${cid}/adGroups:mutate`,
        {
          method: "POST",
          headers: await headers(loginCustomerId as string | undefined),
          body: JSON.stringify({
            operations: [status === "REMOVED"
              ? { remove: `customers/${cid}/adGroups/${adGroupId}` }
              : { update: { resourceName: `customers/${cid}/adGroups/${adGroupId}`, status }, updateMask: "status" }],
          }),
        },
        "Google Ads ad group status",
      );
      return ok({ applied: true, action: "google_ads_update_adgroup_status", result });
    },
  );

  c.tool(
    "google_ads_update_adgroup_bid",
    "Change the default CPC bid of a Google Ads ad group. The amount is in the account " +
      "currency (1.20 for 1.20 EUR). Has no effect on a campaign using an automated bidding " +
      "strategy. Previews by default.",
    {
      customerId: customerIdSchema.describe("Google Ads customer ID, with or without dashes."),
      adGroupId: numericIdSchema.describe("Ad group ID."),
      cpcBid: z.number().positive().describe("New default CPC bid, in the account currency."),
      loginCustomerId: customerIdSchema.optional().describe("Manager account ID, when the customer sits under an MCC. Omit otherwise."),
      confirm: confirmSchema,
    },
    async (a) => {
      const { customerId, adGroupId, cpcBid, loginCustomerId, confirm } = a as Record<string, string | number | boolean>;
      const cid = String(customerId).replace(/-/g, "");
      const micros = toMicros(Number(cpcBid));
      if (!confirm) return preview("google_ads_update_adgroup_bid", { customer: cid, adGroup: adGroupId, newCpcBid: cpcBid, inMicros: micros });
      const result = await send(
        `${ADS_BASE}/customers/${cid}/adGroups:mutate`,
        {
          method: "POST",
          headers: await headers(loginCustomerId as string | undefined),
          body: JSON.stringify({
            operations: [{
              update: { resourceName: `customers/${cid}/adGroups/${adGroupId}`, cpcBidMicros: String(micros) },
              updateMask: "cpc_bid_micros",
            }],
          }),
        },
        "Google Ads ad group bid",
      );
      return ok({ applied: true, action: "google_ads_update_adgroup_bid", result });
    },
  );
}

// ─────────────────────────────── Meta ───────────────────────────────
