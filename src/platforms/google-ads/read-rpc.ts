/**
 * google-ads-mcp-server: an open-source MCP server for the Google Ads API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { formatMcpToolError } from "../../core/errors.js";
import type { GoogleAdsClient } from "./client.js";

type ToolSuccessFormatter = (data: unknown) => {
  content: Array<{ type: "text"; text: string }>;
};

const READ_ONLY_OPERATION_NAMES = [
  "generateAudienceCompositionInsights",
  "generateAudienceDefinition",
  "generateAudienceOverlapInsights",
  "generateBenchmarksMetrics",
  "generateCreatorInsights",
  "generateReachForecast",
  "generateShareablePreviews",
  "generateSuggestedTargetingInsights",
  "generateTargetingSuggestionMetrics",
  "generateTrendingInsights",
  "searchAudienceInsightsAttributes",
  "suggestBrands",
  "suggestKeywordThemes",
  "suggestSmartCampaignAd",
  "suggestSmartCampaignBudgetOptions",
  "suggestTravelAssets",
  "listInsightsEligibleDates",
  "suggestKeywordThemeConstants",
  "generateConversionRates",
  "listBenchmarksAvailableDates",
  "listBenchmarksLocations",
  "listBenchmarksProducts",
  "listBenchmarksSources",
  "listPlannableLocations",
  "listPlannableProducts",
  "listPlannableUserInterests",
  "listPlannableUserLists",
  "getIdentityVerification",
  "listInvoices",
  "listPaymentsAccounts",
] as const;

export type GoogleAdsReadOnlyOperation = typeof READ_ONLY_OPERATION_NAMES[number];

interface OperationConfig {
  scope: "customer" | "global";
  method: "GET" | "POST";
  path: string;
  purpose: string;
}

const CREDENTIAL_REQUEST_KEYS = new Set([
  "accesstoken", "refreshtoken", "developertoken", "authorization",
  "clientsecret", "password", "apikey", "oauthtoken", "idtoken", "bearertoken",
]);

export const GOOGLE_ADS_READ_ONLY_OPERATIONS: Record<GoogleAdsReadOnlyOperation, OperationConfig> = {
  generateAudienceCompositionInsights: { scope: "customer", method: "POST", path: ":generateAudienceCompositionInsights", purpose: "Audience composition and index insights" },
  generateAudienceDefinition: { scope: "customer", method: "POST", path: ":generateAudienceDefinition", purpose: "Resolve an audience description into an audience definition" },
  generateAudienceOverlapInsights: { scope: "customer", method: "POST", path: ":generateAudienceOverlapInsights", purpose: "Audience overlap insights" },
  generateBenchmarksMetrics: { scope: "customer", method: "POST", path: ":generateBenchmarksMetrics", purpose: "Industry benchmark metrics" },
  generateCreatorInsights: { scope: "customer", method: "POST", path: ":generateCreatorInsights", purpose: "YouTube creator insights" },
  generateReachForecast: { scope: "customer", method: "POST", path: ":generateReachForecast", purpose: "Reach Planner forecast" },
  generateShareablePreviews: { scope: "customer", method: "POST", path: ":generateShareablePreviews", purpose: "Generate shareable ad previews without mutating ads" },
  generateSuggestedTargetingInsights: { scope: "customer", method: "POST", path: ":generateSuggestedTargetingInsights", purpose: "Suggested targeting insights" },
  generateTargetingSuggestionMetrics: { scope: "customer", method: "POST", path: ":generateTargetingSuggestionMetrics", purpose: "Targeting suggestion reach metrics" },
  generateTrendingInsights: { scope: "customer", method: "POST", path: ":generateTrendingInsights", purpose: "Trending search/audience insights" },
  searchAudienceInsightsAttributes: { scope: "customer", method: "POST", path: ":searchAudienceInsightsAttributes", purpose: "Search audience insight attributes" },
  suggestBrands: { scope: "customer", method: "POST", path: ":suggestBrands", purpose: "Suggest brand entities for audience insights" },
  suggestKeywordThemes: { scope: "customer", method: "POST", path: ":suggestKeywordThemes", purpose: "Smart Campaign keyword theme suggestions" },
  suggestSmartCampaignAd: { scope: "customer", method: "POST", path: ":suggestSmartCampaignAd", purpose: "Smart Campaign ad suggestions" },
  suggestSmartCampaignBudgetOptions: { scope: "customer", method: "POST", path: ":suggestSmartCampaignBudgetOptions", purpose: "Smart Campaign budget options" },
  suggestTravelAssets: { scope: "customer", method: "POST", path: ":suggestTravelAssets", purpose: "Travel asset suggestions" },
  listInsightsEligibleDates: { scope: "global", method: "POST", path: "audienceInsights:listInsightsEligibleDates", purpose: "Eligible dates for audience insights" },
  suggestKeywordThemeConstants: { scope: "global", method: "POST", path: "keywordThemeConstants:suggest", purpose: "Keyword theme constant suggestions" },
  generateConversionRates: { scope: "global", method: "POST", path: ":generateConversionRates", purpose: "Reach Planner conversion-rate generation" },
  listBenchmarksAvailableDates: { scope: "global", method: "POST", path: ":listBenchmarksAvailableDates", purpose: "Available benchmark dates" },
  listBenchmarksLocations: { scope: "global", method: "POST", path: ":listBenchmarksLocations", purpose: "Benchmark locations" },
  listBenchmarksProducts: { scope: "global", method: "POST", path: ":listBenchmarksProducts", purpose: "Benchmark products" },
  listBenchmarksSources: { scope: "global", method: "POST", path: ":listBenchmarksSources", purpose: "Benchmark sources" },
  listPlannableLocations: { scope: "global", method: "POST", path: ":listPlannableLocations", purpose: "Reach Planner locations" },
  listPlannableProducts: { scope: "global", method: "POST", path: ":listPlannableProducts", purpose: "Reach Planner products" },
  listPlannableUserInterests: { scope: "global", method: "POST", path: ":listPlannableUserInterests", purpose: "Reach Planner user interests" },
  listPlannableUserLists: { scope: "global", method: "POST", path: ":listPlannableUserLists", purpose: "Reach Planner user lists" },
  getIdentityVerification: { scope: "customer", method: "GET", path: "/getIdentityVerification", purpose: "Advertiser identity-verification status" },
  listInvoices: { scope: "customer", method: "GET", path: "/invoices", purpose: "Billing invoices" },
  listPaymentsAccounts: { scope: "customer", method: "GET", path: "/paymentsAccounts", purpose: "Payments account metadata" },
};

export function isGoogleAdsReadOnlyServicePath(
  path: string,
  method: "GET" | "POST"
): boolean {
  const customerSuffix = /^customers\/\d+([:/].+)$/.exec(path)?.[1];
  return Object.values(GOOGLE_ADS_READ_ONLY_OPERATIONS).some((config) =>
    config.method === method
    && (config.scope === "customer" ? customerSuffix === config.path : path === config.path)
  );
}

export function validateGoogleAdsReadOnlyRequest(
  value: unknown,
  path = "request",
  depth = 0,
  state = { nodes: 0 }
): void {
  state.nodes += 1;
  if (state.nodes > 5_000) throw new Error("Request contains too many JSON values.");
  if (depth > 10) throw new Error("Request nesting is limited to 10 levels.");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path} must contain finite numbers.`);
    return;
  }
  if (typeof value === "string") {
    if (value.length > 20_000) throw new Error(`${path} string exceeds 20,000 characters.`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 2_000) throw new Error(`${path} array exceeds 2,000 entries.`);
    value.forEach((item, index) => validateGoogleAdsReadOnlyRequest(item, `${path}[${index}]`, depth + 1, state));
    return;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > 500) throw new Error(`${path} object exceeds 500 fields.`);
    for (const [key, item] of entries) {
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) throw new Error(`Invalid request key ${path}.${key}.`);
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (CREDENTIAL_REQUEST_KEYS.has(normalizedKey)) {
        throw new Error(`Credentials are not accepted in ${path}.${key}.`);
      }
      validateGoogleAdsReadOnlyRequest(item, `${path}.${key}`, depth + 1, state);
    }
    return;
  }
  throw new Error(`${path} must contain JSON-compatible values.`);
}

export function buildGoogleAdsReadOnlyPath(
  operation: GoogleAdsReadOnlyOperation,
  customerId?: string
): { path: string; config: OperationConfig } {
  const config = GOOGLE_ADS_READ_ONLY_OPERATIONS[operation];
  if (!config) throw new Error(`Unsupported read-only operation: ${operation}.`);
  if (config.scope === "customer") {
    const cleanCustomerId = customerId?.replace(/-/g, "");
    if (!cleanCustomerId || !/^\d+$/.test(cleanCustomerId)) {
      throw new Error(`${operation} requires a numeric customerId.`);
    }
    return { path: `customers/${cleanCustomerId}${config.path}`, config };
  }
  return { path: config.path, config };
}

export function registerGoogleAdsReadOnlyRpcTool(
  server: McpServer,
  client: GoogleAdsClient,
  ok: ToolSuccessFormatter
): void {
  server.tool(
    "google_ads_run_readonly_rpc",
    "Advanced read-only escape hatch for allowlisted Google Ads services outside GAQL: Audience Insights, Reach Planner, benchmarks, creator/trending insights, targeting suggestions, Smart Campaign suggestions, identity verification, invoices, and payments accounts. The operation is an enum; arbitrary paths and all mutations/uploads are impossible.",
    {
      operation: z.enum(READ_ONLY_OPERATION_NAMES),
      customerId: z.string().regex(/^\d[\d-]*\d$|^\d$/).optional().describe("Required for customer-scoped operations; omit for global planning catalogs"),
      request: z.record(z.string(), z.unknown()).prefault({}).describe("Official REST JSON request body for POST operations, or query parameters for GET operations"),
    },
    async ({ operation, customerId, request }) => {
      try {
        validateGoogleAdsReadOnlyRequest(request);
        const encodedLength = JSON.stringify(request).length;
        if (encodedLength > 100_000) throw new Error("Encoded request exceeds 100,000 characters.");
        const { path, config } = buildGoogleAdsReadOnlyPath(operation, customerId);
        let response: Record<string, unknown>;
        if (config.method === "GET") {
          const query: Record<string, string | number | boolean | undefined> = {};
          for (const [key, value] of Object.entries(request)) {
            if (!["string", "number", "boolean"].includes(typeof value)) {
              throw new Error(`GET query parameter ${key} must be a string, number, or boolean.`);
            }
            query[key] = value as string | number | boolean;
          }
          response = await client.runReadOnlyService(path, "GET", undefined, query);
        } else {
          response = await client.runReadOnlyService(path, "POST", request);
        }
        return ok({
          dataKind: "google_ads_readonly_rpc",
          operation,
          purpose: config.purpose,
          scope: config.scope,
          method: config.method,
          response,
          readOnly: true,
          warnings: operation === "generateShareablePreviews"
            ? ["The returned preview URL is shareable and can expose ad creative until it expires; disclose it only to intended recipients."]
            : [],
          limitations: [
            "The request body follows Google's native REST schema and is intentionally not translated into this server's metric aliases.",
            "Availability depends on developer-token access level, account eligibility, OAuth permissions, and operation-specific quotas.",
          ],
          nextActions: ["Use google_ads_search_fields and google_ads_run_gaql for queryable resources; use this tool only for non-GAQL services."],
          debug: { requestCount: 1 },
        });
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );
}
