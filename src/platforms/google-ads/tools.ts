/**
 * google-ads-mcp-server: an open-source MCP server for the Google Ads API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
import { PMAX_METRIC_FIELDS } from "./pmax-metrics";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GoogleAdsClient } from "./client.js";
import { planQuery, generateQueryPreview, resolveMetricApiField } from "./query-planner.js";
import { validateQuerySelection } from "./compatibility-rules.js";
import { formatMcpToolError } from "../../core/errors.js";
import type { GoogleAdsConfig } from "../../config.js";
import { GOOGLE_ADS_API_VERSION, stripCustomerId, type GoogleAdsRow } from "./types.js";
import { registerGoogleAdsKeywordPlannerTools } from "./keyword-planner.js";
import { registerGoogleAdsDiscoveryTools } from "./discovery-tools.js";
import { registerGoogleAdsReadOnlyRpcTool } from "./read-rpc.js";
import { tokenSourceFor } from "../../core/google-oauth.js";
import { AccountNotAllowedError, accountIsAllowed } from "../../core/account-scope.js";

const customerIdSchema = z.string().describe("Google Ads customer ID (without dashes, e.g., 1234567890)");
const loginCustomerIdSchema = z.string().optional().describe("MCC Manager account ID (required for sub-accounts managed by an MCC)");
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected date format YYYY-MM-DD");
const numericIdSchema = z.string().regex(/^\d+$/, "Expected a numeric Google Ads ID");
const gaqlEnumSchema = z.string().regex(/^[A-Z0-9_]+$/, "Expected an uppercase Google Ads enum value");
const ZERO_METRIC_LIMIT_WARNING = "All returned rows have zero metric values and rowCount equals the requested limit. The response may be truncated before active entities; retry with a higher limit or pass orderBy on a non-zero metric.";

type AgentResponseRecord = Record<string, unknown>;

function isAgentResponseRecord(value: unknown): value is AgentResponseRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwnField(value: AgentResponseRecord, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function getDebugRecord(payload: AgentResponseRecord): AgentResponseRecord {
  return isAgentResponseRecord(payload["debug"]) ? payload["debug"] : {};
}

function getRequestCount(payload: AgentResponseRecord): number {
  const debug = getDebugRecord(payload);
  const requestCount = debug["requestCount"];
  return typeof requestCount === "number" ? requestCount : 1;
}

function getWarnings(payload: AgentResponseRecord): unknown[] {
  if (Array.isArray(payload["warnings"])) return payload["warnings"];

  const debug = getDebugRecord(payload);
  return Array.isArray(debug["warnings"]) ? debug["warnings"] : [];
}

function withAgentResponseContract(data: unknown): unknown {
  if (!isAgentResponseRecord(data)) return data;

  return {
    ...data,
    warnings: hasOwnField(data, "warnings") ? data["warnings"] : getWarnings(data),
    limitations: hasOwnField(data, "limitations") ? data["limitations"] : [],
    nextActions: hasOwnField(data, "nextActions") ? data["nextActions"] : [],
    debug: {
      ...getDebugRecord(data),
      source: "google_ads",
      apiVersion: GOOGLE_ADS_API_VERSION,
      requestCount: getRequestCount(data),
    },
  };
}

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(withAgentResponseContract(data), null, 2) }] };
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function metricFieldKeys(metrics: string[]): string[] {
  const keys = new Set<string>();
  for (const metric of metrics) {
    const apiField = resolveMetricApiField(metric);
    if (apiField) keys.add(apiField);
    if (apiField === "metrics.cost_micros") keys.add("metrics.cost");
  }
  return [...keys];
}

function allReturnedMetricValuesAreZero(rows: Array<Record<string, unknown>>, metrics: string[]): boolean {
  const keys = metricFieldKeys(metrics);
  if (rows.length === 0 || keys.length === 0) return false;

  let sawMetricValue = false;
  for (const row of rows) {
    for (const key of keys) {
      const value = numericValue(row[key]);
      if (value === null) continue;
      sawMetricValue = true;
      if (value !== 0) return false;
    }
  }

  return sawMetricValue;
}

function oneLineGaql(query: string): string {
  return query.replace(/\s+/g, " ").trim();
}

function quoteGaqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function buildWhere(clauses: string[]): string {
  return clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseIsoDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid date "${value}". Expected YYYY-MM-DD.`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date "${value}".`);
  }

  return parsed;
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function daysBetween(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}

function requireDateRange(startDate?: string, endDate?: string): string[] {
  if (!startDate || !endDate) {
    throw new Error("startDate and endDate are required together in YYYY-MM-DD format.");
  }
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (start > end) throw new Error("startDate must be on or before endDate.");
  return [`segments.date BETWEEN '${startDate}' AND '${endDate}'`];
}

function optionalDateRange(startDate?: string, endDate?: string): string[] {
  if (!startDate && !endDate) return [];
  return requireDateRange(startDate, endDate);
}

function normalizeGetInsightsDateInput(input: {
  startDate?: string;
  endDate?: string;
  datePreset?: string;
}): { startDate?: string; endDate?: string; datePreset?: string; warnings: string[] } {
  if (input.datePreset !== "LAST_90_DAYS") {
    return { ...input, warnings: [] };
  }

  const end = addDays(parseIsoDate(formatIsoDate(new Date())), -1);
  const start = addDays(end, -89);
  const startDate = formatIsoDate(start);
  const endDate = formatIsoDate(end);

  return {
    startDate,
    endDate,
    datePreset: undefined,
    warnings: [`Translated preset LAST_90_DAYS to BETWEEN ${startDate} AND ${endDate} because LAST_90_DAYS is not a native GAQL DURING value.`],
  };
}

function normalizeChangeEventRange(
  startDate: string | undefined,
  endDate: string | undefined
): { startDate: string; endExclusiveDate: string; warnings: string[] } {
  const warnings: string[] = [];
  const today = parseIsoDate(formatIsoDate(new Date()));
  const oldestAllowed = addDays(today, -30);

  let end = endDate ? parseIsoDate(endDate) : today;
  if (end > today) {
    warnings.push("endDate was in the future; using today because change_event only supports recent history.");
    end = today;
  }
  if (end < oldestAllowed) {
    warnings.push("endDate was older than the change_event 30-day retention window; using today.");
    end = today;
  }

  let start = startDate ? parseIsoDate(startDate) : addDays(end, -14);
  if (start < oldestAllowed) {
    warnings.push("startDate was older than the change_event 30-day retention window; clamped to the oldest supported date.");
    start = oldestAllowed;
  }

  if (start > end) throw new Error("startDate must be on or before endDate after applying the 30-day change_event window.");

  if (daysBetween(start, end) > 30) {
    warnings.push("change_event supports a maximum 30-day window; startDate was clamped.");
    start = addDays(end, -30);
    if (start < oldestAllowed) start = oldestAllowed;
  }

  return {
    startDate: formatIsoDate(start),
    endExclusiveDate: formatIsoDate(addDays(end, 1)),
    warnings,
  };
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function arrayOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function assetIdFromResourceName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.match(/\/assets\/(\d+)$/)?.[1];
}

/**
 * URLs dérivées d'un asset YouTube : l'API Google Ads n'expose aucun fichier
 * vidéo (les vidéos PMax/DemandGen vivent sur YouTube et leurs ToS interdisent
 * le téléchargement); on affiche via embed et vignettes publiques stables.
 */
function youtubeDerivedUrls(videoId: unknown): Record<string, string> | undefined {
  if (typeof videoId !== "string" || !/^[A-Za-z0-9_-]{5,20}$/.test(videoId)) return undefined;
  return {
    watch_url: `https://www.youtube.com/watch?v=${videoId}`,
    embed_url: `https://www.youtube.com/embed/${videoId}`,
    thumbnail_url: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    thumbnail_fallback_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

/** Collecte récursivement toutes les références customers/X/assets/ID d'un sous-arbre. */
function collectAssetIds(value: unknown, into: Set<string>): void {
  const id = assetIdFromResourceName(value);
  if (id) {
    into.add(id);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectAssetIds(item, into);
    return;
  }
  const record = recordOf(value);
  if (record) for (const item of Object.values(record)) collectAssetIds(item, into);
}

async function runGaqlWithFallback(
  client: GoogleAdsClient,
  customerId: string,
  attempts: Array<{ label: string; gaql: string; failureWarning?: string }>
): Promise<{ rows: GoogleAdsRow[]; gaql: string; queryLabel: string; warnings: string[] }> {
  const warnings: string[] = [];
  let lastError: unknown;

  for (const attempt of attempts) {
    try {
      const rows = await client.searchStream(customerId, attempt.gaql);
      if (warnings.length > 0) warnings.push(`Executed fallback query "${attempt.label}".`);
      return { rows, gaql: attempt.gaql, queryLabel: attempt.label, warnings };
    } catch (error) {
      lastError = error;
      if (attempt.failureWarning) {
        warnings.push(`${attempt.failureWarning}: ${getErrorMessage(error)}`);
      }
    }
  }

  throw lastError;
}

export function registerGoogleAdsTools(server: McpServer, config: GoogleAdsConfig): void {
  const client = new GoogleAdsClient({
    developerToken: config.developerToken,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    refreshToken: config.refreshToken,
    loginCustomerId: config.loginCustomerId,
    allowedAccountIds: config.allowedAccountIds,
    tokenSource: tokenSourceFor(config, "GOOGLE_ADS_REFRESH_TOKEN"),
  });
  const allowedAccountIds = config.allowedAccountIds;

  // ── 1. google_ads_list_accounts ────────────────────────────────────
  server.tool(
    "google_ads_list_accounts",
    "List Google Ads customer accounts accessible with the current credentials. If an accessible customer is a manager account, also attempts to include enabled child accounts from customer_client.",
    {},
    async () => {
      try {
        const customers = await client.getAllCustomers();
        const warnings: string[] = [];
        const accountMap = new Map<string, typeof customers[number]>();

        for (const customer of customers) {
          accountMap.set(stripCustomerId(customer.id), customer);
        }

        const managerCustomers = customers.filter((customer) => customer.manager);
        for (const manager of managerCustomers) {
          try {
            const childAccounts = await client.getClientAccounts(manager.id);
            for (const child of childAccounts) {
              const childId = stripCustomerId(child.id);
              if (!accountMap.has(childId)) {
                accountMap.set(childId, {
                  ...child,
                  resourceName: child.resourceName || `customers/${childId}`,
                });
              }
            }
          } catch (error) {
            warnings.push(`Could not discover child accounts for manager ${stripCustomerId(manager.id)}. Use google_ads_get_account_hierarchy for details. ${getErrorMessage(error)}`);
          }
        }

        const accounts = Array.from(accountMap.values());
        return ok({
          accounts,
          count: accounts.length,
          directlyAccessibleCount: customers.length,
          discoveredChildCount: Math.max(0, accounts.length - customers.length),
          managerAccountCount: managerCustomers.length,
          warnings,
        });
      } catch (e) { return formatMcpToolError(e); }
    },
  );

  // ── 2. google_ads_get_account_details ──────────────────────────────
  server.tool(
    "google_ads_get_account_details",
    "Get detailed information for a specific Google Ads customer account.",
    { customerId: customerIdSchema },
    async ({ customerId }) => {
      try {
        const customer = await client.getCustomer(customerId);
        return ok(customer);
      } catch (e) { return formatMcpToolError(e); }
    },
  );

  // ── 3. google_ads_run_gaql ─────────────────────────────────────────
  server.tool(
    "google_ads_run_gaql",
    `Execute a raw GAQL (Google Ads Query Language) query. Full flexibility for any reporting need.
Example: SELECT campaign.name, metrics.impressions FROM campaign WHERE campaign.status = 'ENABLED' AND segments.date DURING LAST_30_DAYS ORDER BY metrics.impressions DESC LIMIT 100`,
    {
      customerId: customerIdSchema,
      query: z.string().min(10).describe("GAQL query string (SELECT ... FROM ... WHERE ...)"),
    },
    async ({ customerId, query }) => {
      try {
        const rows = await client.searchStream(customerId, query);
        return ok({ data: rows, rowCount: rows.length, gaql: query });
      } catch (e) { return formatMcpToolError(e); }
    },
  );

  // ── 4. google_ads_get_insights ─────────────────────────────────────
  server.tool(
    "google_ads_get_insights",
    `Query Google Ads performance insights with intelligent query planning. Auto-generates GAQL, handles metric/segment incompatibilities by splitting queries.
Use google-ads://metrics for available metrics, google-ads://dimensions for dimensions.`,
    {
      customerId: customerIdSchema,
      resource: z.string()
        .optional().default("campaign").describe("GAQL FROM clause resource type (campaign, ad_group, ad_group_ad, keyword_view, shopping_performance_view, asset_group, geographic_view, video, search_term_view, landing_page_view, etc.)"),
      metrics: z.array(z.string()).min(1).describe("Metric keys (e.g., impressions, clicks, cost_micros, conversions)"),
      dimensions: z.array(z.string()).optional().describe("Dimension keys (e.g., date, campaignName, device)"),
      startDate: z.string().optional().describe("Start date YYYY-MM-DD"),
      endDate: z.string().optional().describe("End date YYYY-MM-DD"),
      datePreset: z.enum([
        "TODAY", "YESTERDAY", "LAST_7_DAYS", "LAST_14_DAYS", "LAST_30_DAYS",
        "LAST_90_DAYS", "THIS_MONTH", "LAST_MONTH", "THIS_QUARTER", "LAST_QUARTER",
      ]).optional().describe("Predefined date range"),
      orderBy: z.string().optional().describe("Optional GAQL field to order by, e.g. metrics.impressions or campaign.name"),
      orderDirection: z.enum(["ASC", "DESC"]).optional().default("DESC"),
      limit: z.number().int().min(1).max(10000).optional().default(500),
    },
    async ({ customerId, resource, metrics, dimensions, startDate, endDate, datePreset, orderBy, orderDirection, limit }) => {
      try {
        const startTime = Date.now();
        const dateInput = normalizeGetInsightsDateInput({ startDate, endDate, datePreset });
        const plan = planQuery({
          customerId,
          resource: resource as import("./types.js").GoogleAdsResourceType,
          metrics,
          dimensions: dimensions ?? [],
          filters: [],
          startDate: dateInput.startDate,
          endDate: dateInput.endDate,
          datePreset: dateInput.datePreset as import("./types.js").GoogleAdsDatePreset | undefined,
          orderBy,
          orderDirection,
          limit,
        });

        if (plan.errors.length > 0) {
          return ok({
            error: "Query validation failed",
            errors: plan.errors,
            warnings: plan.warnings,
            gaqlPreview: generateQueryPreview(plan),
          });
        }

        const result = await client.executeQuery({
          customerId,
          resource: resource as import("./types.js").GoogleAdsResourceType,
          metrics,
          dimensions: dimensions ?? [],
          filters: [],
          startDate: dateInput.startDate,
          endDate: dateInput.endDate,
          datePreset: dateInput.datePreset as import("./types.js").GoogleAdsDatePreset | undefined,
          orderBy,
          orderDirection,
          limit,
        });

        const debugWarnings = Array.isArray(result.debug.warnings) ? result.debug.warnings : [];
        const debugErrors = Array.isArray(result.debug.errors) ? result.debug.errors : [];
        const zeroMetricLimitWarnings = result.data.length === limit && allReturnedMetricValuesAreZero(result.data, metrics)
          ? [ZERO_METRIC_LIMIT_WARNING]
          : [];
        const warnings = [...dateInput.warnings, ...debugWarnings, ...zeroMetricLimitWarnings];

        return ok({
          status: debugErrors.length > 0 ? "error" : "ok",
          data: result.data,
          rowCount: result.data.length,
          errors: debugErrors,
          warnings,
          debug: {
            ...result.debug,
            warnings,
            executionTimeMs: Date.now() - startTime,
            gaqlPreview: generateQueryPreview(plan),
          },
        });
      } catch (e) { return formatMcpToolError(e); }
    },
  );

  // ── 5. google_ads_get_campaigns ────────────────────────────────────
  server.tool(
    "google_ads_get_campaigns",
    "List campaigns for a Google Ads account with status, budget, channel type, and bidding strategy.",
    {
      customerId: customerIdSchema,
      statusFilter: z.enum(["ENABLED", "PAUSED", "REMOVED"]).optional(),
      limit: z.number().int().min(1).max(1000).optional().default(100),
    },
    async ({ customerId, statusFilter, limit }) => {
      try {
        let gaql = `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.bidding_strategy_type, campaign_budget.amount_micros FROM campaign`;
        if (statusFilter) gaql += ` WHERE campaign.status = '${statusFilter}'`;
        gaql += ` ORDER BY campaign.name ASC LIMIT ${limit}`;
        const rows = await client.searchStream(customerId, gaql);
        return ok({ campaigns: rows, count: rows.length });
      } catch (e) { return formatMcpToolError(e); }
    },
  );

  // ── 6. google_ads_get_adgroups ─────────────────────────────────────
  server.tool(
    "google_ads_get_adgroups",
    "List ad groups for a Google Ads account, optionally filtered by campaign.",
    {
      customerId: customerIdSchema,
      campaignId: z.string().optional().describe("Filter by campaign ID"),
      statusFilter: z.enum(["ENABLED", "PAUSED", "REMOVED"]).optional(),
      limit: z.number().int().min(1).max(1000).optional().default(100),
    },
    async ({ customerId, campaignId, statusFilter, limit }) => {
      try {
        let gaql = `SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.type, campaign.id, campaign.name FROM ad_group`;
        const where: string[] = [];
        if (campaignId) where.push(`campaign.id = ${campaignId}`);
        if (statusFilter) where.push(`ad_group.status = '${statusFilter}'`);
        if (where.length > 0) gaql += ` WHERE ${where.join(" AND ")}`;
        gaql += ` ORDER BY ad_group.name ASC LIMIT ${limit}`;
        const rows = await client.searchStream(customerId, gaql);
        return ok({ adGroups: rows, count: rows.length });
      } catch (e) { return formatMcpToolError(e); }
    },
  );

  // ── 7. google_ads_get_keyword_performance ───────────────────────────
  server.tool(
    "google_ads_get_keyword_performance",
    "Get keyword-level performance data from keyword_view resource. Shows quality score, impressions, clicks, cost.",
    {
      customerId: customerIdSchema,
      startDate: z.string().describe("Start date YYYY-MM-DD"),
      endDate: z.string().describe("End date YYYY-MM-DD"),
      limit: z.number().int().min(1).max(1000).optional().default(100),
    },
    async ({ customerId, startDate, endDate, limit }) => {
      try {
        const gaql = `SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.quality_info.quality_score, campaign.name, ad_group.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.ctr FROM keyword_view WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' AND ad_group_criterion.status = 'ENABLED' ORDER BY metrics.impressions DESC LIMIT ${limit}`;
        const rows = await client.searchStream(customerId, gaql);
        return ok({ keywords: rows, count: rows.length });
      } catch (e) { return formatMcpToolError(e); }
    },
  );

  // ── 8. google_ads_validate_query ───────────────────────────────────
  server.tool(
    "google_ads_validate_query",
    "Validate metric/dimension/resource compatibility BEFORE executing a query. Checks segment restrictions and resource availability.",
    {
      metrics: z.array(z.string()).min(1).describe("Metric keys to validate"),
      dimensions: z.array(z.string()).optional().describe("Dimension keys to validate"),
      resource: z.string()
        .optional().default("campaign"),
    },
    async ({ metrics, dimensions, resource }) => {
      try {
        const result = validateQuerySelection(metrics, dimensions ?? [], resource as import("./types.js").GoogleAdsResourceType, dimensions ?? []);
        return ok(result);
      } catch (e) { return formatMcpToolError(e); }
    },
  );

  // ── 9. google_ads_health_check ────────────────────────────────────
  server.tool(
    "google_ads_health_check",
    "Read-only connectivity check. Verifies credential presence, Google Ads API access, login customer visibility, API version, and actionable warnings without returning secrets.",
    {},
    async () => {
      const warnings: string[] = [];
      const credentialPresence = {
        developerToken: Boolean(config.developerToken),
        clientId: Boolean(config.clientId),
        clientSecret: Boolean(config.clientSecret),
        refreshToken: Boolean(config.refreshToken),
        loginCustomerId: Boolean(config.loginCustomerId),
      };

      try {
        const accessibleCustomers = await client.getAllCustomers();
        const loginCustomerId = config.loginCustomerId ? stripCustomerId(config.loginCustomerId) : null;
        const customerIds = new Set(accessibleCustomers.map(customer => stripCustomerId(customer.id)));

        if (accessibleCustomers.length === 0) {
          warnings.push("No accessible customers were returned. Verify the OAuth user has Google Ads access and the developer token is approved.");
        }
        const unreadAllowedIds = (allowedAccountIds ?? []).filter(id => !customerIds.has(id));
        if (unreadAllowedIds.length > 0) {
          warnings.push(`These GOOGLE_ADS_ACCOUNT_IDS entries could not be read with the current credentials: ${unreadAllowedIds.join(", ")}.`);
        }
        if (loginCustomerId && !customerIds.has(loginCustomerId)) {
          warnings.push("GOOGLE_ADS_LOGIN_CUSTOMER_ID is configured but was not returned by listAccessibleCustomers; verify MCC access if child account queries fail.");
        }
        if (!loginCustomerId && accessibleCustomers.some(customer => customer.manager)) {
          // This check has no customer in hand, so it cannot show the manager a
          // real query would announce. Saying "not set" alone reads as a fault,
          // and readers have gone looking for a variable to fill while queries
          // were already working.
          warnings.push(
            "Manager accounts are accessible and GOOGLE_ADS_LOGIN_CUSTOMER_ID is not set. " +
            "The server resolves the manager of each account it queries, so this is not a fault on its own. " +
            "Setting the variable skips that discovery and is worth it when every account sits under the same MCC.",
          );
        }

        return ok({
          status: "ok",
          apiVersion: GOOGLE_ADS_API_VERSION,
          credentialsPresent: credentialPresence,
          loginCustomerId,
          accountAllowlist: allowedAccountIds ? { configured: true, count: allowedAccountIds.length } : { configured: false },
          accessibleCustomers,
          accessibleCustomerCount: accessibleCustomers.length,
          warnings,
        });
      } catch (error) {
        warnings.push("Could not list accessible customers. Check OAuth refresh token, developer token status, and Google Ads account permissions.");
        return ok({
          status: "error",
          apiVersion: GOOGLE_ADS_API_VERSION,
          credentialsPresent: credentialPresence,
          loginCustomerId: config.loginCustomerId ? stripCustomerId(config.loginCustomerId) : null,
          accountAllowlist: allowedAccountIds ? { configured: true, count: allowedAccountIds.length } : { configured: false },
          accessibleCustomers: [],
          accessibleCustomerCount: 0,
          error: getErrorMessage(error),
          warnings,
        });
      }
    },
  );

  // ── 10. google_ads_get_account_hierarchy ───────────────────────────
  server.tool(
    "google_ads_get_account_hierarchy",
    "List accessible customers and, where possible, manager/client relationships from GAQL customer_client. Falls back to accessible customers if hierarchy queries are unavailable.",
    {
      managerCustomerId: loginCustomerIdSchema,
      includeInactive: z.boolean().optional().default(false).describe("Include non-ENABLED customer_client links"),
    },
    async ({ managerCustomerId, includeInactive }) => {
      try {
        const warnings: string[] = [];
        const configuredManager = config.loginCustomerId ? stripCustomerId(config.loginCustomerId) : undefined;
        // With an allowlist, a manager is read only when it is allowed itself or
        // is the configured GOOGLE_ADS_LOGIN_CUSTOMER_ID, and only its allowed
        // clients are returned.
        if (managerCustomerId && stripCustomerId(managerCustomerId) !== configuredManager &&
            !accountIsAllowed(allowedAccountIds, managerCustomerId)) {
          throw new AccountNotAllowedError(managerCustomerId);
        }
        const accessibleCustomers = await client.getAllCustomers();
        const managerIds = managerCustomerId
          ? [stripCustomerId(managerCustomerId)]
          : (config.loginCustomerId
              ? [stripCustomerId(config.loginCustomerId)]
              : accessibleCustomers.filter(customer => customer.manager).map(customer => stripCustomerId(customer.id)));

        const relations: Array<Record<string, unknown>> = [];

        if (managerIds.length === 0) {
          warnings.push("No manager customer was detected. Returning accessible customers only.");
        }

        for (const managerId of managerIds) {
          const where = ["customer_client.level <= 10"];
          if (!includeInactive) where.push("customer_client.status = 'ENABLED'");

          const gaql = oneLineGaql(`
            SELECT
              customer_client.resource_name,
              customer_client.client_customer,
              customer_client.id,
              customer_client.descriptive_name,
              customer_client.currency_code,
              customer_client.time_zone,
              customer_client.manager,
              customer_client.test_account,
              customer_client.hidden,
              customer_client.level,
              customer_client.status
            FROM customer_client
            ${buildWhere(where)}
            ORDER BY customer_client.level ASC, customer_client.descriptive_name ASC
          `);

          try {
            const managerAllowed = accountIsAllowed(allowedAccountIds, managerId);
            const rows = await client.searchStream(managerId, gaql, managerAllowed ? "account" : "manager-discovery");
            for (const row of rows) {
              const customerClient = row.customerClient as Record<string, unknown> | undefined;
              if (!customerClient) continue;
              const customerId = String(customerClient.id ?? "");
              if (!accountIsAllowed(allowedAccountIds, customerId)) continue;
              relations.push({
                managerCustomerId: managerId,
                clientCustomerId: customerId,
                clientCustomer: customerClient.clientCustomer,
                descriptiveName: customerClient.descriptiveName,
                currencyCode: customerClient.currencyCode,
                timeZone: customerClient.timeZone,
                manager: customerClient.manager,
                testAccount: customerClient.testAccount,
                hidden: customerClient.hidden,
                level: customerClient.level,
                status: customerClient.status,
                resourceName: customerClient.resourceName,
                isSelfLink: customerId === managerId || customerClient.level === "0" || customerClient.level === 0,
              });
            }
          } catch (error) {
            warnings.push(`Could not query customer_client for manager ${managerId}; returning accessible customers fallback for that branch. ${getErrorMessage(error)}`);
          }
        }

        return ok({
          accessibleCustomers,
          accessibleCustomerCount: accessibleCustomers.length,
          inspectedManagerCustomerIds: managerIds,
          relations,
          relationCount: relations.length,
          warnings,
        });
      } catch (e) { return formatMcpToolError(e); }
    },
  );

  // ── 11. google_ads_get_conversion_actions ─────────────────────────
  server.tool(
    "google_ads_get_conversion_actions",
    "List conversion actions with status, type, category, primary/include-in-conversions flags, owner customer, and last activity dates when supported.",
    {
      customerId: customerIdSchema,
      statusFilter: z.enum(["ENABLED", "HIDDEN", "REMOVED"]).optional(),
      limit: z.number().int().min(1).max(1000).optional().default(1000),
    },
    async ({ customerId, statusFilter, limit }) => {
      try {
        const where = statusFilter ? buildWhere([`conversion_action.status = '${statusFilter}'`]) : "";
        const richGaql = oneLineGaql(`
          SELECT
            conversion_action.resource_name,
            conversion_action.id,
            conversion_action.name,
            conversion_action.status,
            conversion_action.type,
            conversion_action.category,
            conversion_action.primary_for_goal,
            conversion_action.include_in_conversions_metric,
            conversion_action.owner_customer,
            metrics.conversion_last_conversion_date,
            metrics.conversion_last_received_request_date_time
          FROM conversion_action
          ${where}
          ORDER BY conversion_action.name ASC
          LIMIT ${limit}
        `);
        const fallbackGaql = oneLineGaql(`
          SELECT
            conversion_action.resource_name,
            conversion_action.id,
            conversion_action.name,
            conversion_action.status,
            conversion_action.type,
            conversion_action.category,
            conversion_action.primary_for_goal,
            conversion_action.include_in_conversions_metric,
            conversion_action.owner_customer
          FROM conversion_action
          ${where}
          ORDER BY conversion_action.name ASC
          LIMIT ${limit}
        `);

        const result = await runGaqlWithFallback(client, customerId, [
          { label: "conversion_action_with_last_activity", gaql: richGaql, failureWarning: "Conversion action query with last activity metrics failed" },
          { label: "conversion_action_minimal", gaql: fallbackGaql },
        ]);

        return ok({ conversionActions: result.rows, count: result.rows.length, gaql: result.gaql, warnings: result.warnings });
      } catch (e) { return formatMcpToolError(e); }
    },
  );

  // ── 12. google_ads_get_change_events ───────────────────────────────
  server.tool(
    "google_ads_get_change_events",
    "Fetch recent change_event rows. Enforces Google Ads constraints: date window within the last 30 days and LIMIT <= 10000.",
    {
      customerId: customerIdSchema,
      startDate: isoDateSchema.optional().describe("Start date YYYY-MM-DD. Defaults to 14 days before endDate."),
      endDate: isoDateSchema.optional().describe("End date YYYY-MM-DD. Defaults to today."),
      resourceType: gaqlEnumSchema.optional().describe("Optional ChangeEventResourceType filter, e.g. CAMPAIGN or AD_GROUP_AD"),
      operation: gaqlEnumSchema.optional().describe("Optional ResourceChangeOperation filter, e.g. CREATE, UPDATE, REMOVE"),
      userEmail: z.string().email().optional().describe("Optional user email filter"),
      limit: z.number().int().min(1).max(10000).optional().default(1000),
    },
    async ({ customerId, startDate, endDate, resourceType, operation, userEmail, limit }) => {
      try {
        const range = normalizeChangeEventRange(startDate, endDate);
        const where = [
          `change_event.change_date_time >= '${range.startDate}'`,
          `change_event.change_date_time < '${range.endExclusiveDate}'`,
        ];
        if (resourceType) where.push(`change_event.change_resource_type = '${resourceType}'`);
        if (operation) where.push(`change_event.resource_change_operation = '${operation}'`);
        if (userEmail) where.push(`change_event.user_email = '${quoteGaqlString(userEmail)}'`);

        const gaql = oneLineGaql(`
          SELECT
            change_event.resource_name,
            change_event.change_date_time,
            change_event.user_email,
            change_event.client_type,
            change_event.change_resource_type,
            change_event.change_resource_name,
            change_event.resource_change_operation,
            change_event.changed_fields,
            change_event.campaign,
            change_event.ad_group
          FROM change_event
          ${buildWhere(where)}
          ORDER BY change_event.change_date_time DESC
          LIMIT ${limit}
        `);

        const rows = await client.searchStream(customerId, gaql);
        return ok({
          changeEvents: rows,
          count: rows.length,
          effectiveDateRange: { startDate: range.startDate, endExclusiveDate: range.endExclusiveDate },
          gaql,
          warnings: range.warnings,
        });
      } catch (e) { return formatMcpToolError(e); }
    },
  );

  // ── 13. google_ads_get_recommendations ─────────────────────────────
  server.tool(
    "google_ads_get_recommendations",
    "List Google Ads recommendations with type, resource, campaign/ad group links, dismissed state, and impact when supported.",
    {
      customerId: customerIdSchema,
      typeFilter: gaqlEnumSchema.optional().describe("Optional RecommendationType enum filter"),
      includeDismissed: z.boolean().optional().default(false),
      limit: z.number().int().min(1).max(1000).optional().default(1000),
    },
    async ({ customerId, typeFilter, includeDismissed, limit }) => {
      try {
        const where: string[] = [];
        if (!includeDismissed) where.push("recommendation.dismissed = FALSE");
        if (typeFilter) where.push(`recommendation.type = '${typeFilter}'`);

        const richGaql = oneLineGaql(`
          SELECT
            recommendation.resource_name,
            recommendation.type,
            recommendation.campaign,
            recommendation.campaigns,
            recommendation.ad_group,
            recommendation.campaign_budget,
            recommendation.dismissed,
            recommendation.impact,
            campaign.id,
            campaign.name,
            ad_group.id,
            ad_group.name
          FROM recommendation
          ${buildWhere(where)}
          ORDER BY recommendation.type ASC
          LIMIT ${limit}
        `);
        const fallbackGaql = oneLineGaql(`
          SELECT
            recommendation.resource_name,
            recommendation.type,
            recommendation.campaign,
            recommendation.campaigns,
            recommendation.ad_group,
            recommendation.campaign_budget,
            recommendation.dismissed
          FROM recommendation
          ${buildWhere(where)}
          ORDER BY recommendation.type ASC
          LIMIT ${limit}
        `);

        const result = await runGaqlWithFallback(client, customerId, [
          { label: "recommendations_with_impact", gaql: richGaql, failureWarning: "Recommendation query with attributed resources/impact failed" },
          { label: "recommendations_minimal", gaql: fallbackGaql },
        ]);

        return ok({ recommendations: result.rows, count: result.rows.length, gaql: result.gaql, warnings: result.warnings });
      } catch (e) { return formatMcpToolError(e); }
    },
  );

  // ── 14. google_ads_get_budgets ────────────────────────────────────
  server.tool(
    "google_ads_get_budgets",
    "List campaign budgets with amount, status, delivery method, and recommended budget fields when supported.",
    {
      customerId: customerIdSchema,
      statusFilter: z.enum(["ENABLED", "REMOVED", "UNKNOWN", "UNSPECIFIED"]).optional(),
      limit: z.number().int().min(1).max(1000).optional().default(1000),
    },
    async ({ customerId, statusFilter, limit }) => {
      try {
        const where = statusFilter ? buildWhere([`campaign_budget.status = '${statusFilter}'`]) : "";
        const richGaql = oneLineGaql(`
          SELECT
            campaign_budget.resource_name,
            campaign_budget.id,
            campaign_budget.name,
            campaign_budget.status,
            campaign_budget.delivery_method,
            campaign_budget.period,
            campaign_budget.type,
            campaign_budget.amount_micros,
            campaign_budget.total_amount_micros,
            campaign_budget.explicitly_shared,
            campaign_budget.reference_count,
            campaign_budget.has_recommended_budget,
            campaign_budget.recommended_budget_amount_micros,
            campaign_budget.recommended_budget_estimated_change_weekly_clicks,
            campaign_budget.recommended_budget_estimated_change_weekly_cost_micros,
            campaign_budget.recommended_budget_estimated_change_weekly_interactions,
            customer.currency_code
          FROM campaign_budget
          ${where}
          ORDER BY campaign_budget.name ASC
          LIMIT ${limit}
        `);
        const fallbackGaql = oneLineGaql(`
          SELECT
            campaign_budget.resource_name,
            campaign_budget.id,
            campaign_budget.name,
            campaign_budget.status,
            campaign_budget.delivery_method,
            campaign_budget.period,
            campaign_budget.amount_micros,
            customer.currency_code
          FROM campaign_budget
          ${where}
          ORDER BY campaign_budget.name ASC
          LIMIT ${limit}
        `);

        const result = await runGaqlWithFallback(client, customerId, [
          { label: "campaign_budget_with_recommendations", gaql: richGaql, failureWarning: "Campaign budget query with recommended budget fields failed" },
          { label: "campaign_budget_minimal", gaql: fallbackGaql },
        ]);

        return ok({ budgets: result.rows, count: result.rows.length, gaql: result.gaql, warnings: result.warnings });
      } catch (e) { return formatMcpToolError(e); }
    },
  );

  // ── 15. google_ads_get_bidding_strategies ─────────────────────────
  server.tool(
    "google_ads_get_bidding_strategies",
    "List portfolio bidding strategies. Includes metrics only when startDate/endDate are provided; otherwise returns structure only.",
    {
      customerId: customerIdSchema,
      startDate: isoDateSchema.optional().describe("Optional start date YYYY-MM-DD for metrics"),
      endDate: isoDateSchema.optional().describe("Optional end date YYYY-MM-DD for metrics"),
      typeFilter: gaqlEnumSchema.optional().describe("Optional BiddingStrategyType enum filter"),
      limit: z.number().int().min(1).max(1000).optional().default(1000),
    },
    async ({ customerId, startDate, endDate, typeFilter, limit }) => {
      try {
        const warnings: string[] = [];
        const where = optionalDateRange(startDate, endDate);
        if (typeFilter) where.push(`bidding_strategy.type = '${typeFilter}'`);

        const metricsFields = startDate || endDate
          ? `,
            metrics.impressions,
            metrics.clicks,
            metrics.cost_micros,
            metrics.conversions,
            metrics.conversions_value`
          : "";
        if (!startDate && !endDate) {
          warnings.push("No date range provided; metrics were omitted and only bidding strategy structure was returned.");
        }

        const gaql = oneLineGaql(`
          SELECT
            bidding_strategy.resource_name,
            bidding_strategy.id,
            bidding_strategy.name,
            bidding_strategy.status,
            bidding_strategy.type,
            bidding_strategy.currency_code,
            bidding_strategy.effective_currency_code,
            bidding_strategy.campaign_count
            ${metricsFields}
          FROM bidding_strategy
          ${buildWhere(where)}
          ORDER BY bidding_strategy.name ASC
          LIMIT ${limit}
        `);
        const fallbackGaql = oneLineGaql(`
          SELECT
            bidding_strategy.resource_name,
            bidding_strategy.id,
            bidding_strategy.name,
            bidding_strategy.status,
            bidding_strategy.type,
            bidding_strategy.currency_code,
            bidding_strategy.effective_currency_code,
            bidding_strategy.campaign_count
          FROM bidding_strategy
          ${typeFilter ? buildWhere([`bidding_strategy.type = '${typeFilter}'`]) : ""}
          ORDER BY bidding_strategy.name ASC
          LIMIT ${limit}
        `);

        const result = await runGaqlWithFallback(client, customerId, [
          { label: "bidding_strategy_requested", gaql, failureWarning: "Bidding strategy query with requested fields failed" },
          { label: "bidding_strategy_structure", gaql: fallbackGaql },
        ]);

        return ok({ biddingStrategies: result.rows, count: result.rows.length, gaql: result.gaql, warnings: [...warnings, ...result.warnings] });
      } catch (e) { return formatMcpToolError(e); }
    },
  );

  // ── 16. google_ads_get_search_terms ───────────────────────────────
  server.tool(
    "google_ads_get_search_terms",
    "Fetch search term performance from search_term_view or campaign_search_term_insight depending on reportType.",
    {
      customerId: customerIdSchema,
      reportType: z.enum(["search_term_view", "campaign_search_term_insight"]).optional().default("search_term_view"),
      startDate: isoDateSchema.describe("Start date YYYY-MM-DD"),
      endDate: isoDateSchema.describe("End date YYYY-MM-DD"),
      campaignId: numericIdSchema.optional().describe("Optional campaign ID filter"),
      adGroupId: numericIdSchema.optional().describe("Optional ad group ID filter. Applies directly to search_term_view and via segments.ad_group for insight reports."),
      searchTermContains: z.string().min(1).optional().describe("Optional substring filter for search_term_view"),
      limit: z.number().int().min(1).max(10000).optional().default(1000),
    },
    async ({ customerId, reportType, startDate, endDate, campaignId, adGroupId, searchTermContains, limit }) => {
      try {
        const where = requireDateRange(startDate, endDate);
        const cleanCustomerId = stripCustomerId(customerId);
        const warnings: string[] = [];

        let gaql: string;
        if (reportType === "campaign_search_term_insight") {
          if (campaignId) where.push(`campaign_search_term_insight.campaign_id = ${campaignId}`);
          if (adGroupId) where.push(`segments.ad_group = 'customers/${cleanCustomerId}/adGroups/${adGroupId}'`);
          if (searchTermContains) warnings.push("searchTermContains is ignored for campaign_search_term_insight because this report exposes category labels, not raw terms.");

          gaql = oneLineGaql(`
            SELECT
              campaign_search_term_insight.resource_name,
              campaign_search_term_insight.id,
              campaign_search_term_insight.campaign_id,
              campaign_search_term_insight.category_label,
              segments.ad_group,
              campaign.id,
              campaign.name,
              metrics.impressions,
              metrics.clicks,
              metrics.cost_micros,
              metrics.conversions,
              metrics.conversions_value,
              metrics.ctr
            FROM campaign_search_term_insight
            ${buildWhere(where)}
            ORDER BY metrics.impressions DESC
            LIMIT ${limit}
          `);
        } else {
          if (campaignId) where.push(`campaign.id = ${campaignId}`);
          if (adGroupId) where.push(`ad_group.id = ${adGroupId}`);
          if (searchTermContains) where.push(`search_term_view.search_term LIKE '%${quoteGaqlString(searchTermContains)}%'`);

          gaql = oneLineGaql(`
            SELECT
              search_term_view.resource_name,
              search_term_view.search_term,
              search_term_view.status,
              campaign.id,
              campaign.name,
              ad_group.id,
              ad_group.name,
              metrics.impressions,
              metrics.clicks,
              metrics.cost_micros,
              metrics.conversions,
              metrics.conversions_value,
              metrics.ctr,
              metrics.average_cpc
            FROM search_term_view
            ${buildWhere(where)}
            ORDER BY metrics.impressions DESC
            LIMIT ${limit}
          `);
        }

        const rows = await client.searchStream(customerId, gaql);
        return ok({ searchTerms: rows, reportType, count: rows.length, gaql, warnings });
      } catch (e) { return formatMcpToolError(e); }
    },
  );

  // ── 17. google_ads_get_landing_pages ──────────────────────────────
  server.tool(
    "google_ads_get_landing_pages",
    "Fetch landing_page_view performance with final URL, campaign/ad group context, traffic, conversion, and landing-page quality metrics when supported.",
    {
      customerId: customerIdSchema,
      startDate: isoDateSchema.describe("Start date YYYY-MM-DD"),
      endDate: isoDateSchema.describe("End date YYYY-MM-DD"),
      campaignId: numericIdSchema.optional().describe("Optional campaign ID filter"),
      limit: z.number().int().min(1).max(10000).optional().default(1000),
    },
    async ({ customerId, startDate, endDate, campaignId, limit }) => {
      try {
        const where = requireDateRange(startDate, endDate);
        if (campaignId) where.push(`campaign.id = ${campaignId}`);

        const richGaql = oneLineGaql(`
          SELECT
            landing_page_view.resource_name,
            landing_page_view.unexpanded_final_url,
            campaign.id,
            campaign.name,
            ad_group.id,
            ad_group.name,
            metrics.impressions,
            metrics.clicks,
            metrics.cost_micros,
            metrics.conversions,
            metrics.conversions_value,
            metrics.all_conversions,
            metrics.mobile_friendly_clicks_percentage,
            metrics.valid_accelerated_mobile_pages_clicks_percentage,
            metrics.speed_score
          FROM landing_page_view
          ${buildWhere(where)}
          ORDER BY metrics.clicks DESC
          LIMIT ${limit}
        `);
        const fallbackGaql = oneLineGaql(`
          SELECT
            landing_page_view.resource_name,
            landing_page_view.unexpanded_final_url,
            campaign.id,
            campaign.name,
            metrics.impressions,
            metrics.clicks,
            metrics.cost_micros,
            metrics.conversions,
            metrics.conversions_value
          FROM landing_page_view
          ${buildWhere(where)}
          ORDER BY metrics.clicks DESC
          LIMIT ${limit}
        `);

        const result = await runGaqlWithFallback(client, customerId, [
          { label: "landing_page_with_quality_metrics", gaql: richGaql, failureWarning: "Landing page query with quality metrics failed" },
          { label: "landing_page_minimal", gaql: fallbackGaql },
        ]);

        return ok({ landingPages: result.rows, count: result.rows.length, gaql: result.gaql, warnings: result.warnings });
      } catch (e) { return formatMcpToolError(e); }
    },
  );

  // ── 18. google_ads_get_pmax_assets ────────────────────────────────
  server.tool(
    "google_ads_get_pmax_assets",
    "List Performance Max asset group assets from asset_group_asset with asset group/campaign context and optional date-range performance metrics.",
    {
      customerId: customerIdSchema,
      startDate: isoDateSchema.optional().describe("Optional start date YYYY-MM-DD for performance metrics"),
      endDate: isoDateSchema.optional().describe("Optional end date YYYY-MM-DD for performance metrics"),
      metrics: z.array(z.enum(PMAX_METRIC_FIELDS)).min(1).max(32).optional().describe("Additional asset-compatible GAQL metric fields. Used with a date range; delivery metrics are always included. Omit for the default delivery/conversion fields."),
      campaignId: numericIdSchema.optional().describe("Optional Performance Max campaign ID filter"),
      assetGroupId: numericIdSchema.optional().describe("Optional asset group ID filter"),
      assetGroupIds: z.array(numericIdSchema).min(1).max(10).optional().describe("Restrict reporting to these asset groups."),
      assetId: numericIdSchema.optional().describe("Restrict reporting to one asset."),
      daily: z.boolean().optional().default(false).describe("Segment dated performance by segments.date."),
      fieldType: gaqlEnumSchema.optional().describe("Optional AssetFieldType enum filter, e.g. HEADLINE, LONG_HEADLINE, MARKETING_IMAGE"),
      statusFilter: z.enum(["ENABLED", "PAUSED", "REMOVED"]).optional(),
      limit: z.number().int().min(1).max(10000).optional().default(1000),
    },
    async ({ customerId, startDate, endDate, metrics, campaignId, assetGroupId, assetGroupIds, assetId, daily, fieldType, statusFilter, limit }) => {
      try {
        const warnings: string[] = [];
        const where = ["campaign.advertising_channel_type = 'PERFORMANCE_MAX'", ...optionalDateRange(startDate, endDate)];
        if (campaignId) where.push(`campaign.id = ${campaignId}`);
        if (assetGroupId) where.push(`asset_group.id = ${assetGroupId}`);
        if (assetGroupIds) where.push(`asset_group.id IN (${assetGroupIds.join(",")})`);
        if (assetId) where.push(`asset.id = ${assetId}`);
        if (daily && (!startDate || !endDate)) throw new Error("Daily reporting requires both startDate and endDate.");
        if (fieldType) where.push(`asset_group_asset.field_type = '${fieldType}'`);
        if (statusFilter) where.push(`asset_group_asset.status = '${statusFilter}'`);
        if (!startDate && !endDate) warnings.push("No date range provided; performance metrics were omitted and only asset structure was returned.");

        const selectedMetrics = [...new Set(["metrics.impressions", "metrics.cost_micros", ...(metrics ?? PMAX_METRIC_FIELDS.slice(0, 5))])];
        const metricsFields = startDate || endDate ? `, ${selectedMetrics.join(", ")}${daily ? ", segments.date" : ""}` : "";

        const richGaql = oneLineGaql(`
          SELECT
            campaign.id,
            campaign.name,
            asset_group.id,
            asset_group.name,
            asset_group.status,
            asset_group_asset.resource_name,
            asset_group_asset.asset,
            asset_group_asset.asset_group,
            asset_group_asset.field_type,
            asset_group_asset.source,
            asset_group_asset.status,
            asset.resource_name,
            asset.id,
            asset.name,
            asset.type,
            asset.text_asset.text,
            asset.image_asset.full_size.url,
            asset.youtube_video_asset.youtube_video_id,
            asset.youtube_video_asset.youtube_video_title
            ${metricsFields}
          FROM asset_group_asset
          ${buildWhere(where)}
          ORDER BY campaign.name ASC, asset_group.name ASC
          LIMIT ${limit}
        `);
        const fallbackGaql = oneLineGaql(`
          SELECT
            campaign.id,
            campaign.name,
            asset_group.id,
            asset_group.name,
            asset_group.status,
            asset_group_asset.resource_name,
            asset_group_asset.asset,
            asset_group_asset.asset_group,
            asset_group_asset.field_type,
            asset_group_asset.source,
            asset_group_asset.status
            ${metricsFields}
          FROM asset_group_asset
          ${buildWhere(where)}
          ORDER BY campaign.name ASC, asset_group.name ASC
          LIMIT ${limit}
        `);

        const result = await runGaqlWithFallback(client, customerId, [
          { label: "pmax_assets_with_asset_details", gaql: richGaql, failureWarning: "PMax asset query with asset details failed" },
          { label: "pmax_assets_minimal", gaql: fallbackGaql },
        ]);

        return ok({ pmaxAssets: result.rows, count: result.rows.length, gaql: result.gaql, warnings: [...warnings, ...result.warnings] });
      } catch (e) { return formatMcpToolError(e); }
    },
  );

  // ── 19. google_ads_get_simulations ────────────────────────────────
  server.tool(
    "google_ads_get_simulations",
    "Read-only planning/forecast query for campaign, ad group, or portfolio bidding simulations. Returns simulation metadata and projected point lists when available, with a metadata fallback.",
    {
      customerId: customerIdSchema,
      level: z.enum(["campaign", "ad_group", "bidding_strategy"]).optional().default("campaign").describe("Simulation resource level to query"),
      campaignId: numericIdSchema.optional().describe("Optional campaign ID filter. Applies directly to campaign simulations and as campaign context for ad group simulations."),
      adGroupId: numericIdSchema.optional().describe("Optional ad group ID filter for ad_group simulations"),
      biddingStrategyId: numericIdSchema.optional().describe("Optional portfolio bidding strategy ID filter for bidding_strategy simulations"),
      simulationStartDate: isoDateSchema.optional().describe("Optional minimum simulation start date YYYY-MM-DD"),
      simulationEndDate: isoDateSchema.optional().describe("Optional maximum simulation end date YYYY-MM-DD"),
      typeFilter: gaqlEnumSchema.optional().describe("Optional SimulationType enum, e.g. BUDGET, TARGET_CPA, TARGET_ROAS, CPC_BID"),
      modificationMethod: gaqlEnumSchema.optional().describe("Optional SimulationModificationMethod enum, e.g. UNIFORM, SCALING, DEFAULT"),
      limit: z.number().int().min(1).max(1000).optional().default(1000),
    },
    async ({ customerId, level, campaignId, adGroupId, biddingStrategyId, simulationStartDate, simulationEndDate, typeFilter, modificationMethod, limit }) => {
      try {
        const warnings: string[] = [];
        if (simulationStartDate && simulationEndDate && parseIsoDate(simulationStartDate) > parseIsoDate(simulationEndDate)) {
          throw new Error("simulationStartDate must be on or before simulationEndDate.");
        }

        let resource: string;
        let richFields: string;
        let fallbackFields: string;
        const where: string[] = [];

        if (level === "ad_group") {
          resource = "ad_group_simulation";
          richFields = `
            ad_group_simulation.resource_name,
            ad_group_simulation.ad_group_id,
            ad_group_simulation.type,
            ad_group_simulation.modification_method,
            ad_group_simulation.start_date,
            ad_group_simulation.end_date,
            ad_group_simulation.cpc_bid_point_list.points,
            ad_group_simulation.cpv_bid_point_list.points,
            ad_group_simulation.target_cpa_point_list.points,
            ad_group_simulation.target_roas_point_list.points,
            campaign.id,
            campaign.name,
            ad_group.id,
            ad_group.name,
            ad_group.status
          `;
          fallbackFields = `
            ad_group_simulation.resource_name,
            ad_group_simulation.ad_group_id,
            ad_group_simulation.type,
            ad_group_simulation.modification_method,
            ad_group_simulation.start_date,
            ad_group_simulation.end_date,
            campaign.id,
            campaign.name,
            ad_group.id,
            ad_group.name
          `;
          if (campaignId) where.push(`campaign.id = ${campaignId}`);
          if (adGroupId) where.push(`ad_group_simulation.ad_group_id = ${adGroupId}`);
          if (biddingStrategyId) warnings.push("biddingStrategyId is ignored for ad_group simulations.");
        } else if (level === "bidding_strategy") {
          resource = "bidding_strategy_simulation";
          richFields = `
            bidding_strategy_simulation.resource_name,
            bidding_strategy_simulation.bidding_strategy_id,
            bidding_strategy_simulation.type,
            bidding_strategy_simulation.modification_method,
            bidding_strategy_simulation.start_date,
            bidding_strategy_simulation.end_date,
            bidding_strategy_simulation.target_cpa_point_list.points,
            bidding_strategy_simulation.target_roas_point_list.points,
            bidding_strategy.id,
            bidding_strategy.name,
            bidding_strategy.status,
            bidding_strategy.type
          `;
          fallbackFields = `
            bidding_strategy_simulation.resource_name,
            bidding_strategy_simulation.bidding_strategy_id,
            bidding_strategy_simulation.type,
            bidding_strategy_simulation.modification_method,
            bidding_strategy_simulation.start_date,
            bidding_strategy_simulation.end_date,
            bidding_strategy.id,
            bidding_strategy.name
          `;
          if (biddingStrategyId) where.push(`bidding_strategy_simulation.bidding_strategy_id = ${biddingStrategyId}`);
          if (campaignId) warnings.push("campaignId is ignored for bidding_strategy simulations.");
          if (adGroupId) warnings.push("adGroupId is ignored for bidding_strategy simulations.");
        } else {
          resource = "campaign_simulation";
          richFields = `
            campaign_simulation.resource_name,
            campaign_simulation.campaign_id,
            campaign_simulation.type,
            campaign_simulation.modification_method,
            campaign_simulation.start_date,
            campaign_simulation.end_date,
            campaign_simulation.budget_point_list.points,
            campaign_simulation.cpc_bid_point_list.points,
            campaign_simulation.target_cpa_point_list.points,
            campaign_simulation.target_impression_share_point_list.points,
            campaign_simulation.target_roas_point_list.points,
            campaign.id,
            campaign.name,
            campaign.status,
            campaign.advertising_channel_type,
            campaign.bidding_strategy_type
          `;
          fallbackFields = `
            campaign_simulation.resource_name,
            campaign_simulation.campaign_id,
            campaign_simulation.type,
            campaign_simulation.modification_method,
            campaign_simulation.start_date,
            campaign_simulation.end_date,
            campaign.id,
            campaign.name
          `;
          if (campaignId) where.push(`campaign_simulation.campaign_id = ${campaignId}`);
          if (adGroupId) warnings.push("adGroupId is ignored for campaign simulations.");
          if (biddingStrategyId) warnings.push("biddingStrategyId is ignored for campaign simulations.");
        }

        if (simulationStartDate) where.push(`${resource}.start_date >= '${simulationStartDate}'`);
        if (simulationEndDate) where.push(`${resource}.end_date <= '${simulationEndDate}'`);
        if (typeFilter) where.push(`${resource}.type = '${typeFilter}'`);
        if (modificationMethod) where.push(`${resource}.modification_method = '${modificationMethod}'`);

        const richGaql = oneLineGaql(`
          SELECT
            ${richFields}
          FROM ${resource}
          ${buildWhere(where)}
          ORDER BY ${resource}.start_date DESC
          LIMIT ${limit}
        `);
        const fallbackGaql = oneLineGaql(`
          SELECT
            ${fallbackFields}
          FROM ${resource}
          ${buildWhere(where)}
          ORDER BY ${resource}.start_date DESC
          LIMIT ${limit}
        `);

        const result = await runGaqlWithFallback(client, customerId, [
          { label: `${resource}_with_points`, gaql: richGaql, failureWarning: "Simulation query with projected point lists failed" },
          { label: `${resource}_metadata`, gaql: fallbackGaql },
        ]);

        return ok({ simulations: result.rows, level, count: result.rows.length, gaql: result.gaql, warnings: [...warnings, ...result.warnings] });
      } catch (e) { return formatMcpToolError(e); }
    },
  );

  // ── 20. google_ads_get_paid_organic_search_terms ──────────────────
  server.tool(
    "google_ads_get_paid_organic_search_terms",
    "Read-only paid/organic search terms report. Uses paid_organic_search_term_view when available and falls back to paid-only search_term_view if organic fields are unavailable.",
    {
      customerId: customerIdSchema,
      startDate: isoDateSchema.describe("Start date YYYY-MM-DD"),
      endDate: isoDateSchema.describe("End date YYYY-MM-DD"),
      campaignId: numericIdSchema.optional().describe("Optional campaign ID filter"),
      adGroupId: numericIdSchema.optional().describe("Optional ad group ID filter"),
      searchTermContains: z.string().min(1).optional().describe("Optional search term substring filter"),
      serpType: z.enum(["ADS_AND_ORGANIC", "ADS_ONLY", "ORGANIC_ONLY", "UNKNOWN", "UNSPECIFIED"]).optional().describe("Optional search engine results page type segment filter"),
      limit: z.number().int().min(1).max(10000).optional().default(1000),
    },
    async ({ customerId, startDate, endDate, campaignId, adGroupId, searchTermContains, serpType, limit }) => {
      try {
        const paidOrganicWhere = requireDateRange(startDate, endDate);
        if (campaignId) paidOrganicWhere.push(`campaign.id = ${campaignId}`);
        if (adGroupId) paidOrganicWhere.push(`ad_group.id = ${adGroupId}`);
        if (searchTermContains) paidOrganicWhere.push(`paid_organic_search_term_view.search_term LIKE '%${quoteGaqlString(searchTermContains)}%'`);
        if (serpType) paidOrganicWhere.push(`segments.search_engine_results_page_type = '${serpType}'`);

        const fallbackWhere = requireDateRange(startDate, endDate);
        if (campaignId) fallbackWhere.push(`campaign.id = ${campaignId}`);
        if (adGroupId) fallbackWhere.push(`ad_group.id = ${adGroupId}`);
        if (searchTermContains) fallbackWhere.push(`search_term_view.search_term LIKE '%${quoteGaqlString(searchTermContains)}%'`);

        const richGaql = oneLineGaql(`
          SELECT
            paid_organic_search_term_view.resource_name,
            paid_organic_search_term_view.search_term,
            segments.search_engine_results_page_type,
            campaign.id,
            campaign.name,
            ad_group.id,
            ad_group.name,
            metrics.impressions,
            metrics.clicks,
            metrics.ctr,
            metrics.average_cpc,
            metrics.combined_clicks,
            metrics.combined_clicks_per_query,
            metrics.combined_queries,
            metrics.organic_clicks,
            metrics.organic_clicks_per_query,
            metrics.organic_impressions,
            metrics.organic_impressions_per_query,
            metrics.organic_queries
          FROM paid_organic_search_term_view
          ${buildWhere(paidOrganicWhere)}
          ORDER BY metrics.combined_clicks DESC
          LIMIT ${limit}
        `);
        const fallbackGaql = oneLineGaql(`
          SELECT
            search_term_view.resource_name,
            search_term_view.search_term,
            search_term_view.status,
            campaign.id,
            campaign.name,
            ad_group.id,
            ad_group.name,
            metrics.impressions,
            metrics.clicks,
            metrics.ctr,
            metrics.average_cpc,
            metrics.cost_micros,
            metrics.conversions,
            metrics.conversions_value
          FROM search_term_view
          ${buildWhere(fallbackWhere)}
          ORDER BY metrics.clicks DESC
          LIMIT ${limit}
        `);

        const result = await runGaqlWithFallback(client, customerId, [
          { label: "paid_organic_search_term_view", gaql: richGaql, failureWarning: "Paid/organic search term query failed; organic reporting may require eligible linked organic search data or compatible fields" },
          { label: "search_term_view_paid_only", gaql: fallbackGaql },
        ]);

        return ok({ searchTerms: result.rows, source: result.queryLabel, count: result.rows.length, gaql: result.gaql, warnings: result.warnings });
      } catch (e) { return formatMcpToolError(e); }
    },
  );

  // ── 21. google_ads_get_shopping_products ──────────────────────────
  server.tool(
    "google_ads_get_shopping_products",
    "Read-only Merchant Center product catalog/eligibility report via shopping_product. Supports account, campaign, and ad group scopes with performance metrics when the account has Shopping/PMax e-commerce data.",
    {
      customerId: customerIdSchema,
      scope: z.enum(["account", "campaign", "ad_group"]).optional().default("account").describe("shopping_product scope. ad_group scope requires campaignId and adGroupId."),
      startDate: isoDateSchema.optional().describe("Optional start date YYYY-MM-DD. Used only as a WHERE filter; shopping_product cannot segment by date."),
      endDate: isoDateSchema.optional().describe("Optional end date YYYY-MM-DD. Used only as a WHERE filter; shopping_product cannot segment by date."),
      campaignId: numericIdSchema.optional().describe("Campaign ID for campaign or ad_group scope"),
      adGroupId: numericIdSchema.optional().describe("Ad group ID for ad_group scope"),
      merchantCenterId: numericIdSchema.optional().describe("Optional Merchant Center ID filter"),
      itemId: z.string().min(1).optional().describe("Optional Merchant Center item ID filter"),
      titleContains: z.string().min(1).optional().describe("Optional product title substring filter"),
      feedLabel: z.string().min(1).optional().describe("Optional feed label filter"),
      statusFilter: z.enum(["ELIGIBLE", "ELIGIBLE_LIMITED", "NOT_ELIGIBLE", "UNKNOWN", "UNSPECIFIED"]).optional(),
      limit: z.number().int().min(1).max(10000).optional().default(1000),
    },
    async ({ customerId, scope, startDate, endDate, campaignId, adGroupId, merchantCenterId, itemId, titleContains, feedLabel, statusFilter, limit }) => {
      try {
        const warnings: string[] = [];
        const cleanCustomerId = stripCustomerId(customerId);
        const where = optionalDateRange(startDate, endDate);

        if (startDate || endDate) {
          warnings.push("shopping_product does not support date segmentation; segments.date is used only as a WHERE filter.");
        }
        if (scope === "campaign" && !campaignId) throw new Error("campaignId is required when scope is campaign.");
        if (scope === "ad_group" && (!campaignId || !adGroupId)) throw new Error("campaignId and adGroupId are required when scope is ad_group.");
        if (scope === "account" && (campaignId || adGroupId)) warnings.push("campaignId/adGroupId were provided with account scope; use scope campaign or ad_group to constrain product inclusion.");

        if (scope === "campaign" || scope === "ad_group") {
          where.push(`shopping_product.campaign = 'customers/${cleanCustomerId}/campaigns/${campaignId}'`);
        }
        if (scope === "ad_group") {
          where.push(`shopping_product.ad_group = 'customers/${cleanCustomerId}/adGroups/${adGroupId}'`);
        }
        if (merchantCenterId) where.push(`shopping_product.merchant_center_id = ${merchantCenterId}`);
        if (itemId) where.push(`shopping_product.item_id = '${quoteGaqlString(itemId)}'`);
        if (titleContains) where.push(`shopping_product.title LIKE '%${quoteGaqlString(titleContains)}%'`);
        if (feedLabel) where.push(`shopping_product.feed_label = '${quoteGaqlString(feedLabel)}'`);
        if (statusFilter) where.push(`shopping_product.status = '${statusFilter}'`);

        const contextFields = scope === "account"
          ? ""
          : `,
            campaign.id,
            campaign.name${scope === "ad_group" ? `,
            ad_group.id,
            ad_group.name` : ""}`;

        const richGaql = oneLineGaql(`
          SELECT
            shopping_product.resource_name,
            shopping_product.merchant_center_id,
            shopping_product.multi_client_account_id,
            shopping_product.item_id,
            shopping_product.title,
            shopping_product.brand,
            shopping_product.channel,
            shopping_product.channel_exclusivity,
            shopping_product.condition,
            shopping_product.availability,
            shopping_product.status,
            shopping_product.feed_label,
            shopping_product.language_code,
            shopping_product.target_countries,
            shopping_product.currency_code,
            shopping_product.price_micros,
            shopping_product.product_image_uri,
            shopping_product.category_level1,
            shopping_product.category_level2,
            shopping_product.product_type_level1,
            shopping_product.product_type_level2,
            shopping_product.custom_attribute0,
            shopping_product.issues,
            metrics.impressions,
            metrics.clicks,
            metrics.cost_micros,
            metrics.conversions,
            metrics.conversions_value,
            metrics.ctr,
            metrics.orders,
            metrics.revenue_micros,
            metrics.units_sold,
            metrics.gross_profit_micros
            ${contextFields}
          FROM shopping_product
          ${buildWhere(where)}
          ORDER BY metrics.impressions DESC
          LIMIT ${limit}
        `);
        const fallbackGaql = oneLineGaql(`
          SELECT
            shopping_product.resource_name,
            shopping_product.merchant_center_id,
            shopping_product.item_id,
            shopping_product.title,
            shopping_product.brand,
            shopping_product.status,
            shopping_product.feed_label,
            shopping_product.currency_code,
            shopping_product.price_micros
            ${contextFields}
          FROM shopping_product
          ${buildWhere(where)}
          ORDER BY shopping_product.title ASC
          LIMIT ${limit}
        `);

        const result = await runGaqlWithFallback(client, customerId, [
          { label: "shopping_product_with_metrics_and_issues", gaql: richGaql, failureWarning: "Shopping product query with performance/cart/issue fields failed" },
          { label: "shopping_product_catalog", gaql: fallbackGaql },
        ]);

        return ok({ shoppingProducts: result.rows, scope, count: result.rows.length, gaql: result.gaql, warnings: [...warnings, ...result.warnings] });
      } catch (e) { return formatMcpToolError(e); }
    },
  );

  // ── 22. google_ads_get_shopping_performance ───────────────────────
  server.tool(
    "google_ads_get_shopping_performance",
    "Read-only Shopping performance report keyed by Merchant Center product dimensions. Useful for joining spend/conversions to merchant ID, item ID, title, brand, feed label, and custom labels.",
    {
      customerId: customerIdSchema,
      startDate: isoDateSchema.describe("Start date YYYY-MM-DD"),
      endDate: isoDateSchema.describe("End date YYYY-MM-DD"),
      campaignId: numericIdSchema.optional().describe("Optional campaign ID filter"),
      adGroupId: numericIdSchema.optional().describe("Optional ad group ID filter"),
      merchantCenterId: numericIdSchema.optional().describe("Optional Merchant Center ID filter"),
      itemId: z.string().min(1).optional().describe("Optional Merchant Center item ID filter"),
      titleContains: z.string().min(1).optional().describe("Optional product title substring filter"),
      brand: z.string().min(1).optional().describe("Optional product brand filter"),
      feedLabel: z.string().min(1).optional().describe("Optional product feed label filter"),
      limit: z.number().int().min(1).max(10000).optional().default(1000),
    },
    async ({ customerId, startDate, endDate, campaignId, adGroupId, merchantCenterId, itemId, titleContains, brand, feedLabel, limit }) => {
      try {
        const where = requireDateRange(startDate, endDate);
        if (campaignId) where.push(`campaign.id = ${campaignId}`);
        if (adGroupId) where.push(`ad_group.id = ${adGroupId}`);
        if (merchantCenterId) where.push(`segments.product_merchant_id = ${merchantCenterId}`);
        if (itemId) where.push(`segments.product_item_id = '${quoteGaqlString(itemId)}'`);
        if (titleContains) where.push(`segments.product_title LIKE '%${quoteGaqlString(titleContains)}%'`);
        if (brand) where.push(`segments.product_brand = '${quoteGaqlString(brand)}'`);
        if (feedLabel) where.push(`segments.product_feed_label = '${quoteGaqlString(feedLabel)}'`);

        const baseFields = `
          campaign.id,
          campaign.name,
          ad_group.id,
          ad_group.name,
          segments.product_merchant_id,
          segments.product_item_id,
          segments.product_title,
          segments.product_brand,
          segments.product_channel,
          segments.product_condition,
          segments.product_feed_label,
          segments.product_custom_attribute0,
          segments.product_custom_attribute1,
          segments.product_custom_attribute2,
          segments.product_custom_attribute3,
          segments.product_custom_attribute4,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.conversions,
          metrics.conversions_value,
          metrics.ctr,
          metrics.average_cpc
        `;

        const richGaql = oneLineGaql(`
          SELECT
            ${baseFields},
            metrics.all_conversions,
            metrics.orders,
            metrics.revenue_micros,
            metrics.units_sold,
            metrics.gross_profit_micros,
            metrics.cost_of_goods_sold_micros,
            metrics.average_order_value_micros
          FROM shopping_performance_view
          ${buildWhere(where)}
          ORDER BY metrics.cost_micros DESC
          LIMIT ${limit}
        `);
        const fallbackGaql = oneLineGaql(`
          SELECT
            ${baseFields}
          FROM shopping_performance_view
          ${buildWhere(where)}
          ORDER BY metrics.cost_micros DESC
          LIMIT ${limit}
        `);

        const result = await runGaqlWithFallback(client, customerId, [
          { label: "shopping_performance_with_cart_metrics", gaql: richGaql, failureWarning: "Shopping performance query with cart/profit metrics failed" },
          { label: "shopping_performance_core", gaql: fallbackGaql },
        ]);

        return ok({ shoppingPerformance: result.rows, count: result.rows.length, gaql: result.gaql, warnings: result.warnings });
      } catch (e) { return formatMcpToolError(e); }
    },
  );

  // ── 23. google_ads_get_pmax_placements ────────────────────────────
  server.tool(
    "google_ads_get_pmax_placements",
    "Read-only Performance Max placement diagnostics from performance_max_placement_view. Returns placement type, display name, target URL, campaign context, and impressions only.",
    {
      customerId: customerIdSchema,
      startDate: isoDateSchema.describe("Start date YYYY-MM-DD"),
      endDate: isoDateSchema.describe("End date YYYY-MM-DD"),
      campaignId: numericIdSchema.optional().describe("Optional Performance Max campaign ID filter"),
      placementType: z.enum(["WEBSITE", "MOBILE_APPLICATION", "YOUTUBE_VIDEO", "YOUTUBE_CHANNEL", "GOOGLE_PRODUCTS", "UNKNOWN", "UNSPECIFIED"]).optional().describe("Optional PlacementType enum filter"),
      placementContains: z.string().min(1).optional().describe("Optional substring filter for the placement string"),
      limit: z.number().int().min(1).max(10000).optional().default(1000),
    },
    async ({ customerId, startDate, endDate, campaignId, placementType, placementContains, limit }) => {
      try {
        const warnings = ["performance_max_placement_view exposes impression metrics only; clicks/cost/conversions are not available on this resource."];
        const where = requireDateRange(startDate, endDate);
        if (campaignId) where.push(`campaign.id = ${campaignId}`);
        if (placementType) where.push(`performance_max_placement_view.placement_type = '${placementType}'`);
        if (placementContains) where.push(`performance_max_placement_view.placement LIKE '%${quoteGaqlString(placementContains)}%'`);

        const richGaql = oneLineGaql(`
          SELECT
            performance_max_placement_view.resource_name,
            performance_max_placement_view.display_name,
            performance_max_placement_view.placement,
            performance_max_placement_view.placement_type,
            performance_max_placement_view.target_url,
            campaign.id,
            campaign.name,
            metrics.impressions
          FROM performance_max_placement_view
          ${buildWhere(where)}
          ORDER BY metrics.impressions DESC
          LIMIT ${limit}
        `);
        const fallbackGaql = oneLineGaql(`
          SELECT
            performance_max_placement_view.resource_name,
            performance_max_placement_view.display_name,
            performance_max_placement_view.placement,
            performance_max_placement_view.placement_type,
            metrics.impressions
          FROM performance_max_placement_view
          ${buildWhere(where)}
          ORDER BY metrics.impressions DESC
          LIMIT ${limit}
        `);

        const result = await runGaqlWithFallback(client, customerId, [
          { label: "pmax_placements_with_target_url_and_campaign", gaql: richGaql, failureWarning: "PMax placement query with target URL/campaign context failed" },
          { label: "pmax_placements_core", gaql: fallbackGaql },
        ]);

        return ok({
          placements: result.rows,
          pmaxPlacements: result.rows,
          count: result.rows.length,
          gaql: result.gaql,
          warnings: [...warnings, ...result.warnings],
        });
      } catch (e) { return formatMcpToolError(e); }
    },
  );

  // ── 24. google_ads_get_pmax_asset_diagnostics ─────────────────────
  server.tool(
    "google_ads_get_pmax_asset_diagnostics",
    "Read-only Performance Max asset group diagnostics. Returns ad strength, asset coverage action items, primary status reasons, optional performance metrics, and optional top asset combinations.",
    {
      customerId: customerIdSchema,
      startDate: isoDateSchema.optional().describe("Optional start date YYYY-MM-DD for asset group metrics/top combinations"),
      endDate: isoDateSchema.optional().describe("Optional end date YYYY-MM-DD for asset group metrics/top combinations"),
      campaignId: numericIdSchema.optional().describe("Optional Performance Max campaign ID filter"),
      assetGroupId: numericIdSchema.optional().describe("Optional asset group ID filter"),
      statusFilter: z.enum(["ENABLED", "PAUSED", "REMOVED"]).optional(),
      includeTopCombinations: z.boolean().optional().default(true).describe("Also query asset_group_top_combination_view when available"),
      limit: z.number().int().min(1).max(1000).optional().default(1000),
    },
    async ({ customerId, startDate, endDate, campaignId, assetGroupId, statusFilter, includeTopCombinations, limit }) => {
      try {
        const warnings: string[] = [];
        const where = ["campaign.advertising_channel_type = 'PERFORMANCE_MAX'", ...optionalDateRange(startDate, endDate)];
        if (campaignId) where.push(`campaign.id = ${campaignId}`);
        if (assetGroupId) where.push(`asset_group.id = ${assetGroupId}`);
        if (statusFilter) where.push(`asset_group.status = '${statusFilter}'`);
        if (!startDate && !endDate) warnings.push("No date range provided; performance metrics were omitted and only asset group diagnostics were returned.");

        const metricsFields = startDate || endDate
          ? `,
            metrics.impressions,
            metrics.clicks,
            metrics.cost_micros,
            metrics.conversions,
            metrics.conversions_value,
            metrics.ctr`
          : "";
        const assetGroupOrderBy = startDate || endDate
          ? "metrics.impressions DESC"
          : "campaign.name ASC, asset_group.name ASC";

        const richGaql = oneLineGaql(`
          SELECT
            campaign.id,
            campaign.name,
            campaign.status,
            asset_group.resource_name,
            asset_group.id,
            asset_group.name,
            asset_group.status,
            asset_group.primary_status,
            asset_group.primary_status_reasons,
            asset_group.ad_strength,
            asset_group.asset_coverage.ad_strength_action_items,
            asset_group.final_urls,
            asset_group.final_mobile_urls
            ${metricsFields}
          FROM asset_group
          ${buildWhere(where)}
          ORDER BY ${assetGroupOrderBy}
          LIMIT ${limit}
        `);
        const fallbackGaql = oneLineGaql(`
          SELECT
            campaign.id,
            campaign.name,
            asset_group.resource_name,
            asset_group.id,
            asset_group.name,
            asset_group.status,
            asset_group.primary_status,
            asset_group.primary_status_reasons,
            asset_group.ad_strength
            ${metricsFields}
          FROM asset_group
          ${buildWhere(where)}
          ORDER BY ${assetGroupOrderBy}
          LIMIT ${limit}
        `);

        const assetGroups = await runGaqlWithFallback(client, customerId, [
          { label: "pmax_asset_group_diagnostics_with_coverage", gaql: richGaql, failureWarning: "PMax asset group query with asset coverage/final URL fields failed" },
          { label: "pmax_asset_group_diagnostics_core", gaql: fallbackGaql },
        ]);

        let topCombinations: GoogleAdsRow[] = [];
        let topCombinationsGaql: string | null = null;
        if (includeTopCombinations) {
          const topCombinationWhere = optionalDateRange(startDate, endDate);
          if (campaignId) topCombinationWhere.push(`campaign.id = ${campaignId}`);
          if (assetGroupId) topCombinationWhere.push(`asset_group.id = ${assetGroupId}`);

          topCombinationsGaql = oneLineGaql(`
            SELECT
              asset_group_top_combination_view.resource_name,
              asset_group_top_combination_view.asset_group_top_combinations,
              campaign.id,
              campaign.name,
              asset_group.id,
              asset_group.name
            FROM asset_group_top_combination_view
            ${buildWhere(topCombinationWhere)}
            LIMIT ${limit}
          `);

          try {
            topCombinations = await client.searchStream(customerId, topCombinationsGaql);
          } catch (error) {
            warnings.push(`PMax top combinations query failed; asset_group_top_combination_view may be unavailable for this account/API combination: ${getErrorMessage(error)}`);
          }
        }

        return ok({
          assetGroups: assetGroups.rows,
          assetGroupCount: assetGroups.rows.length,
          topCombinations,
          topCombinationCount: topCombinations.length,
          gaql: {
            assetGroups: assetGroups.gaql,
            topCombinations: topCombinationsGaql,
          },
          warnings: [...warnings, ...assetGroups.warnings],
        });
      } catch (e) { return formatMcpToolError(e); }
    },
  );

  // ── 25. google_ads_list_image_assets ──────────────────────────────
  server.tool(
    "google_ads_list_image_assets",
    "List the account's image asset library (FROM asset) with stable, publicly served full-size URLs on tpc.googlesyndication.com, dimensions, file size, and mime type. This is the whole stock and carries no notion of delivery: an asset uploaded in 2022 and never served appears exactly like one running today. Newest first, so a limit returns recent assets rather than an arbitrary slice, and the count in the response is the account total. For a visual-only gallery of assets with delivery over dates, use the hosted GetMCPAds service (Performance Max coverage). The local server returns media URLs and native report data. Shopping product imagery lives in Merchant Center, not in this library.",
    {
      customerId: customerIdSchema,
      beforeAssetId: numericIdSchema.optional().describe("Continue the descending library before this last-seen asset ID. Use the same filters."),
      assetIds: z.array(numericIdSchema).min(1).max(8).optional().describe("Resolve these exact native asset IDs, without scanning the library."),
      nameFilter: z.string().optional().describe("Only assets whose file name contains this text"),
      minWidth: z.number().int().min(1).optional().describe("Only images at least this wide, in pixels"),
      minHeight: z.number().int().min(1).optional().describe("Only images at least this tall, in pixels"),
      limit: z.number().int().min(1).max(10000).optional().default(500),
    },
    async ({ customerId, beforeAssetId, assetIds, nameFilter, minWidth, minHeight, limit }) => {
      try {
        const where = ["asset.type = 'IMAGE'"];
        if (beforeAssetId) where.push(`asset.id < ${beforeAssetId}`);
        if (assetIds?.length) where.push(`asset.id IN (${assetIds.join(",")})`);
        if (nameFilter) where.push(`asset.name LIKE '%${quoteGaqlString(nameFilter)}%'`);
        if (minWidth) where.push(`asset.image_asset.full_size.width_pixels >= ${minWidth}`);
        if (minHeight) where.push(`asset.image_asset.full_size.height_pixels >= ${minHeight}`);

        const { rows, gaql, warnings } = await runGaqlWithFallback(client, customerId, [{
          label: "image asset library",
          gaql: oneLineGaql(`
            SELECT
              asset.id, asset.name, asset.type, asset.source,
              asset.image_asset.full_size.url,
              asset.image_asset.full_size.width_pixels,
              asset.image_asset.full_size.height_pixels,
              asset.image_asset.file_size,
              asset.image_asset.mime_type
            FROM asset${buildWhere(where)} ORDER BY asset.id DESC LIMIT ${limit}`),
        }]);

        return ok({
          imageAssets: rows,
          count: rows.length,
          gaql,
          warnings,
          limitations: [
            "This is the account library, not a delivery report: it says nothing about what ran or spent in any period. Rows come newest first, so a limit returns the most recent assets. Use dated delivery reports to identify assets that actually served; the hosted GetMCPAds service provides interactive galleries.",
            "full_size.url points at tpc.googlesyndication.com/simgad and is publicly served without authentication or visible expiry: safe to display, hotlink, or download while the asset exists.",
            "Shopping/PLA product visuals come from Merchant Center feeds and never appear in this asset library.",
          ],
          nextActions: rows.length >= limit
            ? ["The LIMIT was reached; narrow with nameFilter or dimensions, or raise limit."]
            : [],
        });
      } catch (e) { return formatMcpToolError(e); }
    },
  );

  // ── 26. google_ads_list_video_assets ──────────────────────────────
  server.tool(
    "google_ads_list_video_assets",
    "List the account's YouTube video assets (FROM asset) with derived watch, embed, and public thumbnail URLs. This is the whole stock and carries no notion of delivery: an asset uploaded years ago and never served appears exactly like one running today. Newest first, so a limit returns recent assets rather than an arbitrary slice, and the count in the response is the account total. For a visual-only gallery of assets with delivery over dates, use the hosted GetMCPAds service (Performance Max coverage). The local server returns media URLs and native report data. Google Ads exposes no downloadable video file: PMax and Demand Gen videos are hosted on YouTube, so display them via embed or thumbnails.",
    {
      customerId: customerIdSchema,
      beforeAssetId: numericIdSchema.optional().describe("Continue the descending library before this last-seen asset ID. Use the same filters."),
      assetIds: z.array(numericIdSchema).min(1).max(8).optional().describe("Resolve these exact native asset IDs, without scanning the library."),
      nameFilter: z.string().optional().describe("Only assets whose name contains this text"),
      limit: z.number().int().min(1).max(10000).optional().default(500),
    },
    async ({ customerId, beforeAssetId, assetIds, nameFilter, limit }) => {
      try {
        const where = ["asset.type = 'YOUTUBE_VIDEO'"];
        if (beforeAssetId) where.push(`asset.id < ${beforeAssetId}`);
        if (assetIds?.length) where.push(`asset.id IN (${assetIds.join(",")})`);
        if (nameFilter) where.push(`asset.name LIKE '%${quoteGaqlString(nameFilter)}%'`);

        const { rows, gaql, warnings } = await runGaqlWithFallback(client, customerId, [{
          label: "video asset library",
          gaql: oneLineGaql(`
            SELECT
              asset.id, asset.name, asset.type, asset.source,
              asset.youtube_video_asset.youtube_video_id,
              asset.youtube_video_asset.youtube_video_title
            FROM asset${buildWhere(where)} ORDER BY asset.id DESC LIMIT ${limit}`),
        }]);

        const videoAssets = rows.map((row) => {
          const asset = recordOf(recordOf(row)?.asset);
          const youtube = recordOf(asset?.youtubeVideoAsset);
          return { ...row, derivedUrls: youtubeDerivedUrls(youtube?.youtubeVideoId) };
        });

        return ok({
          videoAssets,
          count: videoAssets.length,
          gaql,
          warnings,
          limitations: [
            "This is the account library, not a delivery report: it says nothing about what ran or spent in any period. Rows come newest first, so a limit returns the most recent assets. Use dated delivery reports to identify assets that actually served; the hosted GetMCPAds service provides interactive galleries.",
            "No raw video file is available through the Google Ads API and YouTube's terms forbid downloading: use derivedUrls.embed_url (iframe) or watch_url, and the publicly served, stable i.ytimg.com thumbnails (maxresdefault with hqdefault as the always-present fallback).",
          ],
          nextActions: videoAssets.length >= limit
            ? ["The LIMIT was reached; narrow with nameFilter or raise limit."]
            : [],
        });
      } catch (e) { return formatMcpToolError(e); }
    },
  );

  // ── 27. google_ads_get_demand_gen_assets ──────────────────────────
  server.tool(
    "google_ads_get_demand_gen_assets",
    "List Demand Gen ads (video responsive, multi-asset, carousel) with their referenced creatives resolved: stable image URLs and YouTube video IDs with embed and thumbnail URLs. Complements google_ads_get_pmax_assets, which covers Performance Max.",
    {
      customerId: customerIdSchema,
      campaignId: numericIdSchema.optional().describe("Optional Demand Gen campaign ID filter"),
      limit: z.number().int().min(1).max(10000).optional().default(500),
    },
    async ({ customerId, campaignId, limit }) => {
      try {
        const where = ["campaign.advertising_channel_type = 'DEMAND_GEN'"];
        if (campaignId) where.push(`campaign.id = ${campaignId}`);

        const demandGenFields = `
          ad_group_ad.ad.demand_gen_video_responsive_ad.videos,
          ad_group_ad.ad.demand_gen_video_responsive_ad.logo_images,
          ad_group_ad.ad.demand_gen_multi_asset_ad.marketing_images,
          ad_group_ad.ad.demand_gen_multi_asset_ad.square_marketing_images,
          ad_group_ad.ad.demand_gen_multi_asset_ad.portrait_marketing_images,
          ad_group_ad.ad.demand_gen_multi_asset_ad.logo_images,
          ad_group_ad.ad.demand_gen_carousel_ad.carousel_cards`;
        const baseFields = `
          campaign.id, campaign.name, ad_group.id, ad_group.name,
          ad_group_ad.status, ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type`;

        const ads = await runGaqlWithFallback(client, customerId, [
          {
            label: "demand gen ads with creative references",
            gaql: oneLineGaql(`SELECT ${baseFields}, ${demandGenFields} FROM ad_group_ad${buildWhere(where)} LIMIT ${limit}`),
            failureWarning: "Full Demand Gen creative field selection failed; falling back to ad identifiers only",
          },
          {
            label: "demand gen ads without creative fields",
            gaql: oneLineGaql(`SELECT ${baseFields} FROM ad_group_ad${buildWhere(where)} LIMIT ${limit}`),
          },
        ]);

        // Résolution des assets référencés (images stables + IDs YouTube).
        const referencedIds = new Set<string>();
        for (const row of ads.rows) {
          const ad = recordOf(recordOf(recordOf(row)?.adGroupAd)?.ad);
          if (!ad) continue;
          collectAssetIds(ad.demandGenVideoResponsiveAd, referencedIds);
          collectAssetIds(ad.demandGenMultiAssetAd, referencedIds);
          collectAssetIds(ad.demandGenCarouselAd, referencedIds);
        }

        const warnings = [...ads.warnings];
        const assetsById = new Map<string, Record<string, unknown>>();
        const idList = [...referencedIds];
        const chunkSize = 500;
        for (let index = 0; index < idList.length; index += chunkSize) {
          const chunk = idList.slice(index, index + chunkSize);
          try {
            const resolved = await client.searchStream(customerId, oneLineGaql(`
              SELECT
                asset.id, asset.name, asset.type,
                asset.image_asset.full_size.url,
                asset.image_asset.full_size.width_pixels,
                asset.image_asset.full_size.height_pixels,
                asset.youtube_video_asset.youtube_video_id,
                asset.youtube_video_asset.youtube_video_title
              FROM asset WHERE asset.id IN (${chunk.join(", ")})`));
            for (const row of resolved) {
              const asset = recordOf(recordOf(row)?.asset);
              const rawId = asset?.id;
              const id = typeof rawId === "string" || typeof rawId === "number" ? String(rawId) : undefined;
              if (!asset || !id) continue;
              const youtube = recordOf(asset.youtubeVideoAsset);
              assetsById.set(id, {
                ...asset,
                derivedUrls: youtubeDerivedUrls(youtube?.youtubeVideoId),
              });
            }
          } catch (error) {
            warnings.push(`Asset resolution failed for ${chunk.length} referenced assets: ${getErrorMessage(error)}`);
          }
        }

        const resolvedAds = ads.rows.map((row) => {
          const record = recordOf(row) ?? {};
          const ad = recordOf(recordOf(record.adGroupAd)?.ad);
          const ids = new Set<string>();
          if (ad) {
            collectAssetIds(ad.demandGenVideoResponsiveAd, ids);
            collectAssetIds(ad.demandGenMultiAssetAd, ids);
            collectAssetIds(ad.demandGenCarouselAd, ids);
          }
          return {
            ...record,
            resolvedAssets: [...ids].map((id) => assetsById.get(id) ?? { id, unresolved: true }),
          };
        });

        return ok({
          ads: resolvedAds,
          count: resolvedAds.length,
          referencedAssetCount: referencedIds.size,
          resolvedAssetCount: assetsById.size,
          gaql: ads.gaql,
          warnings,
          limitations: [
            "Demand Gen videos are YouTube assets: no raw file is available (YouTube terms), display them via resolvedAssets.derivedUrls.embed_url or the stable public i.ytimg.com thumbnails.",
            "Image full_size.url values on tpc.googlesyndication.com are publicly served with no visible expiry.",
            "Catalog-driven visuals come from Merchant Center feeds and are not part of ad creative references.",
          ],
          nextActions: resolvedAds.length >= limit
            ? ["The LIMIT was reached; filter by campaignId or raise limit."]
            : [],
        });
      } catch (e) { return formatMcpToolError(e); }
    },
  );

  registerGoogleAdsKeywordPlannerTools(server, client, ok);
  registerGoogleAdsDiscoveryTools(server, client, ok);
  registerGoogleAdsReadOnlyRpcTool(server, client, ok);
}
