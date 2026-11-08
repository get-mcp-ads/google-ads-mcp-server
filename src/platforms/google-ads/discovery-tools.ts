/**
 * google-ads-mcp-server: an open-source MCP server for the Google Ads API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { formatMcpToolError } from "../../core/errors.js";
import type { GoogleAdsClient } from "./client.js";
import type {
  GenerateAdGroupThemesRequest,
  GoogleAdsFieldCategory,
  SuggestGeoTargetConstantsRequest,
} from "./types.js";

type ToolSuccessFormatter = (data: unknown) => {
  content: Array<{ type: "text"; text: string }>;
};

const FIELD_COLUMNS = [
  "name",
  "category",
  "data_type",
  "selectable",
  "filterable",
  "sortable",
  "is_repeated",
  "type_url",
  "enum_values",
  "selectable_with",
  "attribute_resources",
  "metrics",
  "segments",
].join(", ");

const customerIdSchema = z.string().regex(
  /^\d[\d-]*\d$|^\d$/,
  "Expected a numeric Google Ads customer ID, with or without dashes"
);
const numericIdSchema = z.string().regex(/^\d+$/, "Expected a numeric Google Ads ID");
const fieldCategorySchema = z.enum([
  "RESOURCE",
  "ATTRIBUTE",
  "SEGMENT",
  "METRIC",
]);

function quoteFieldQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function validateGoogleAdsFieldsQuery(rawQuery: string): string {
  const query = rawQuery.replace(/^\uFEFF/, "").trim().replace(/\s+/g, " ");
  const lexical = query.replace(/'(?:\\.|[^'\\])*'/g, "''");
  if (query.length < 6 || query.length > 50_000) {
    throw new Error("GoogleAdsField query length must be between 6 and 50,000 characters.");
  }
  if (!/^SELECT\b/i.test(lexical)) {
    throw new Error("GoogleAdsField discovery accepts only SELECT queries.");
  }
  if ((lexical.match(/\bSELECT\b/gi) ?? []).length !== 1) {
    throw new Error("Exactly one GoogleAdsField SELECT query is allowed.");
  }
  if (/;|--|\/\*|\*\/|\0/.test(query)) {
    throw new Error("Semicolons, comments, and NUL bytes are not allowed.");
  }
  if (/\b(?:MUTATE|INSERT|UPDATE|DELETE|REMOVE|CREATE|ALTER|DROP|CALL|GRANT|REVOKE)\b/i.test(lexical)) {
    throw new Error("Mutation or administrative keywords are not allowed.");
  }
  return query;
}

export function buildGoogleAdsFieldsQuery(input: {
  query?: string;
  nameContains?: string;
  category?: GoogleAdsFieldCategory;
  selectable?: boolean;
  filterable?: boolean;
  sortable?: boolean;
}): string {
  if (input.query) return validateGoogleAdsFieldsQuery(input.query);

  const filters: string[] = [];
  if (input.nameContains) {
    filters.push(`name LIKE '%${quoteFieldQuery(input.nameContains)}%'`);
  }
  if (input.category) filters.push(`category = ${input.category}`);
  if (input.selectable !== undefined) filters.push(`selectable = ${input.selectable}`);
  if (input.filterable !== undefined) filters.push(`filterable = ${input.filterable}`);
  if (input.sortable !== undefined) filters.push(`sortable = ${input.sortable}`);
  const where = filters.length ? ` WHERE ${filters.join(" AND ")}` : "";
  return `SELECT ${FIELD_COLUMNS}${where} ORDER BY name`;
}

function safeInteger(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

function idFromResourceName(resourceName: string | undefined): string | null {
  return resourceName?.split("/").pop() ?? null;
}

export function registerGoogleAdsDiscoveryTools(
  server: McpServer,
  client: GoogleAdsClient,
  ok: ToolSuccessFormatter
): void {
  server.tool(
    "google_ads_search_fields",
    "Search Google's live GoogleAdsField catalog. Discovers every queryable GAQL resource, attribute, segment, metric, enum value, and selectable-with compatibility relationship. Read-only and useful before a raw GAQL query.",
    {
      query: z.string().trim().min(6).max(50_000).optional().describe("Optional raw GoogleAdsField SELECT query. When provided it replaces the structured filters."),
      nameContains: z.string().trim().min(1).max(250).optional().describe("Case-sensitive field-name substring, e.g. conversion or asset_group"),
      category: fieldCategorySchema.optional(),
      selectable: z.boolean().optional(),
      filterable: z.boolean().optional(),
      sortable: z.boolean().optional(),
      pageSize: z.number().int().min(1).max(10_000).prefault(500),
      pageToken: z.string().trim().min(1).max(10_000).optional(),
    },
    async ({ query, nameContains, category, selectable, filterable, sortable, pageSize, pageToken }) => {
      try {
        if (query && (nameContains || category || selectable !== undefined || filterable !== undefined || sortable !== undefined)) {
          throw new Error("Use either query or the structured field filters, not both.");
        }
        const resolvedQuery = buildGoogleAdsFieldsQuery({
          query,
          nameContains,
          category,
          selectable,
          filterable,
          sortable,
        });
        const response = await client.searchGoogleAdsFields({
          query: resolvedQuery,
          pageSize,
          ...(pageToken ? { pageToken } : {}),
        });
        const fields = response.results ?? [];
        return ok({
          dataKind: "google_ads_field_catalog",
          query: resolvedQuery,
          fields,
          count: fields.length,
          totalResultsCount: safeInteger(response.totalResultsCount),
          totalResultsCountRaw: response.totalResultsCount ?? null,
          nextPageToken: response.nextPageToken ?? null,
          readOnly: true,
          warnings: [],
          limitations: ["Field availability and selectable-with relationships are version-specific; this response reflects the configured Google Ads API version."],
          nextActions: ["Use discovered field names with google_ads_run_gaql."],
        });
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );

  server.tool(
    "google_ads_suggest_geo_targets",
    "Resolve up to 25 location names or geo target IDs to Google Ads geoTargetConstants. Returns criterion IDs, canonical names, target types, status, parents, locale, and approximate reach. Read-only.",
    {
      locationNames: z.array(z.string().trim().min(1).max(250)).min(1).max(25).optional(),
      geoTargetIds: z.array(numericIdSchema).min(1).max(25).optional(),
      locale: z.string().trim().regex(/^[A-Za-z]{2,3}(?:[-_][A-Za-z]{2,4})?$/, "Expected a locale such as en, fr, or pt-BR").prefault("en"),
      countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/, "Expected an ISO-3166 alpha-2 country code").optional().transform((value) => value?.toUpperCase()),
    },
    async ({ locationNames, geoTargetIds, locale, countryCode }) => {
      try {
        if (Boolean(locationNames?.length) === Boolean(geoTargetIds?.length)) {
          throw new Error("Provide exactly one of locationNames or geoTargetIds.");
        }
        const request: SuggestGeoTargetConstantsRequest = {
          locale,
          ...(countryCode ? { countryCode } : {}),
          ...(locationNames
            ? { locationNames: { names: [...new Set(locationNames)] } }
            : { geoTargets: { geoTargetConstants: [...new Set(geoTargetIds)].map((id) => `geoTargetConstants/${id}`) } }),
        };
        const response = await client.suggestGeoTargetConstants(request);
        const suggestions = (response.geoTargetConstantSuggestions ?? []).map((suggestion) => ({
          searchTerm: suggestion.searchTerm ?? null,
          locale: suggestion.locale ?? locale,
          reach: safeInteger(suggestion.reach),
          reachRaw: suggestion.reach ?? null,
          criterionId: idFromResourceName(suggestion.geoTargetConstant?.resourceName),
          geoTargetConstant: suggestion.geoTargetConstant ?? null,
          parents: suggestion.geoTargetConstantParents ?? [],
        }));
        return ok({
          dataKind: "geo_target_suggestions",
          suggestions,
          count: suggestions.length,
          request,
          readOnly: true,
          warnings: [],
          limitations: ["Reach is approximate and rounded by Google."],
          nextActions: ["Pass returned criterionId values as geoTargetIds to Keyword Planner tools or GAQL filters."],
        });
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );

  server.tool(
    "google_ads_generate_ad_group_themes",
    "Organize supplied keywords into existing Google Ads ad groups. Returns suggested ad group/campaign pairings, normalized keyword text, and suggested match type without creating or editing keywords. Read-only Keyword Planner RPC.",
    {
      customerId: customerIdSchema.describe("Serving customer ID containing the existing ad groups"),
      keywords: z.array(z.string().trim().min(1).max(80)).min(1).max(1_000),
      adGroupIds: z.array(numericIdSchema).min(1).max(200).describe("Existing ad group IDs in the same customer account"),
    },
    async ({ customerId, keywords, adGroupIds }) => {
      try {
        const cleanCustomerId = customerId.replace(/-/g, "");
        const request: GenerateAdGroupThemesRequest = {
          keywords: [...new Set(keywords)],
          adGroups: [...new Set(adGroupIds)].map(
            (id) => `customers/${cleanCustomerId}/adGroups/${id}`
          ),
        };
        const response = await client.generateAdGroupThemes(cleanCustomerId, request);
        const suggestions = response.adGroupKeywordSuggestions ?? [];
        const unusableAdGroups = response.unusableAdGroups ?? [];
        return ok({
          dataKind: "keyword_ad_group_themes",
          suggestions,
          suggestionCount: suggestions.length,
          unusableAdGroups,
          unusableAdGroupCount: unusableAdGroups.length,
          requestedKeywordCount: request.keywords.length,
          requestedAdGroupCount: request.adGroups.length,
          readOnly: true,
          warnings: unusableAdGroups.length
            ? ["Google could not use one or more supplied ad groups; inspect unusableAdGroups for their campaign context."]
            : [],
          limitations: ["This RPC suggests organization into existing ad groups; it does not create themes, ad groups, or keywords."],
          nextActions: ["Review match types and groupings before applying changes through the Google Ads UI or a separately authorized mutation workflow."],
        });
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );
}
