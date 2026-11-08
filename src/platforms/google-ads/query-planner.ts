/**
 * google-ads-mcp-server: an open-source MCP server for the Google Ads API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
// ============================================
// GOOGLE ADS GAQL QUERY PLANNER
// ============================================
// Plans, validates, and builds GAQL queries
// Handles metric/segment splitting for incompatible combinations

import type {
  GoogleAdsQueryRequest,
  GoogleAdsQueryPlan,
  GoogleAdsGaqlQuery,
  GoogleAdsResourceType,
} from "./types.js";
import { GOOGLE_ADS_METRIC_CATALOG } from "./metric-catalog.js";
import { GOOGLE_ADS_DIMENSION_CATALOG } from "./dimension-catalog.js";
import { validateQuerySelection } from "./compatibility-rules.js";
import { buildFilterClause } from "./filter-catalog.js";

// ============================================
// HELPERS -- Resolve catalog keys to API fields
// ============================================

/**
 * Convert snake_case to camelCase: "average_cpc" -> "averageCpc"
 */
function snakeToCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

/**
 * Special aliases for metric names that don't follow simple snake->camel rules.
 * The copilot system prompt tells Claude to use "cost" (not "costMicros"),
 * since the backend auto-converts micros to dollars.
 */
const METRIC_KEY_ALIASES: Record<string, string> = {
  cost: "costMicros",
  cost_micros: "costMicros",
};

/**
 * Find a metric in the catalog using flexible key matching:
 * 1. Exact catalog key match (e.g., "costMicros")
 * 2. Alias lookup (e.g., "cost" -> "costMicros")
 * 3. snake_case -> camelCase conversion (e.g., "average_cpc" -> "averageCpc")
 * 4. API field match with "metrics." prefix (e.g., "cost_micros" -> "metrics.cost_micros")
 * 5. Exact API field match (e.g., "metrics.cost_micros")
 */
function findMetricByKey(key: string) {
  // 1. Exact catalog key match
  let metric = GOOGLE_ADS_METRIC_CATALOG.find((m) => m.key === key);
  if (metric) return metric;

  // 2. Alias lookup
  const aliased = METRIC_KEY_ALIASES[key];
  if (aliased) {
    metric = GOOGLE_ADS_METRIC_CATALOG.find((m) => m.key === aliased);
    if (metric) return metric;
  }

  // 3. snake_case -> camelCase conversion
  const camelKey = snakeToCamel(key);
  if (camelKey !== key) {
    metric = GOOGLE_ADS_METRIC_CATALOG.find((m) => m.key === camelKey);
    if (metric) return metric;
  }

  // 4. API field match with "metrics." prefix
  const withPrefix = key.startsWith("metrics.") ? key : `metrics.${key}`;
  metric = GOOGLE_ADS_METRIC_CATALOG.find((m) => m.apiField === withPrefix);
  if (metric) return metric;

  // 5. Exact API field match (for keys already containing "metrics.")
  if (key.startsWith("metrics.")) {
    metric = GOOGLE_ADS_METRIC_CATALOG.find((m) => m.apiField === key);
    if (metric) return metric;
  }

  return null;
}

/**
 * Find a dimension in the catalog using flexible key matching:
 * 1. Exact catalog key match (e.g., "date", "campaignName")
 * 2. snake_case -> camelCase conversion (e.g., "campaign_name" -> "campaignName")
 * 3. Exact API field match (e.g., "segments.date", "campaign.name")
 */
function findDimensionByKey(key: string) {
  // 1. Exact catalog key
  let dim = GOOGLE_ADS_DIMENSION_CATALOG.find((d) => d.key === key);
  if (dim) return dim;

  // 2. snake_case -> camelCase
  const camelKey = snakeToCamel(key);
  if (camelKey !== key) {
    dim = GOOGLE_ADS_DIMENSION_CATALOG.find((d) => d.key === camelKey);
    if (dim) return dim;
  }

  // 3. Exact API field match (handles "segments.date", "campaign.name", etc.)
  dim = GOOGLE_ADS_DIMENSION_CATALOG.find((d) => d.apiField === key);
  if (dim) return dim;

  return null;
}

export function resolveMetricApiField(key: string): string | null {
  return findMetricByKey(key)?.apiField || null;
}

function resolveDimensionApiField(key: string): string | null {
  return findDimensionByKey(key)?.apiField || null;
}

function isCalculatedMetric(key: string): boolean {
  const metric = findMetricByKey(key);
  return metric?.type === "calculated";
}

function getMetricDependencies(key: string): string[] {
  const metric = findMetricByKey(key);
  return metric?.dependencies || [];
}

function getMetricIncompatibleSegments(key: string): string[] {
  const metric = findMetricByKey(key);
  return metric?.incompatibleSegments || [];
}

const TIME_SEGMENT_FIELDS = new Set([
  "segments.date",
  "segments.week",
  "segments.month",
  "segments.quarter",
  "segments.year",
]);

function hasTimeSegment(segmentApiFields: string[]): boolean {
  return segmentApiFields.some((field) => TIME_SEGMENT_FIELDS.has(field));
}

function defaultMetricOrderBy(
  explicitOrderBy: string | undefined,
  limit: number | undefined,
  metricApiFields: string[],
  segmentApiFields: string[]
): string | undefined {
  if (explicitOrderBy) return explicitOrderBy;
  if (!limit || limit <= 0) return undefined;
  if (metricApiFields.length === 0) return undefined;
  if (hasTimeSegment(segmentApiFields)) return undefined;

  return metricApiFields[0];
}

// ============================================
// GAQL BUILDER
// ============================================

function buildGaql(
  selectFields: string[],
  resource: GoogleAdsResourceType,
  whereClause: string[],
  orderBy?: string,
  orderDirection?: "ASC" | "DESC",
  limit?: number
): string {
  const parts: string[] = [];

  // SELECT
  parts.push(`SELECT ${selectFields.join(", ")}`);

  // FROM
  parts.push(`FROM ${resource}`);

  // WHERE
  if (whereClause.length > 0) {
    parts.push(`WHERE ${whereClause.join(" AND ")}`);
  }

  // ORDER BY
  if (orderBy) {
    parts.push(`ORDER BY ${orderBy} ${orderDirection || "DESC"}`);
  }

  // LIMIT
  if (limit && limit > 0) {
    parts.push(`LIMIT ${limit}`);
  }

  return parts.join("\n");
}

// ============================================
// DATE WHERE CLAUSE
// ============================================

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function inclusiveLastNDaysRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() - 1);

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
  };
}

function buildDateWhereClause(
  startDate?: string,
  endDate?: string,
  datePreset?: string
): { clause: string | null; warnings: string[] } {
  if (datePreset) {
    if (datePreset === "LAST_90_DAYS") {
      const range = inclusiveLastNDaysRange(90);
      return {
        clause: `segments.date BETWEEN '${range.startDate}' AND '${range.endDate}'`,
        warnings: ["LAST_90_DAYS is not a valid GAQL DURING literal; translated to an explicit 90-day BETWEEN range."],
      };
    }

    return { clause: `segments.date DURING ${datePreset}`, warnings: [] };
  }

  if (startDate && endDate) {
    return { clause: `segments.date BETWEEN '${startDate}' AND '${endDate}'`, warnings: [] };
  }

  return { clause: null, warnings: [] };
}

// ============================================
// MAIN QUERY PLANNER
// ============================================

export function planQuery(request: GoogleAdsQueryRequest): GoogleAdsQueryPlan {
  const {
    resource,
    metrics,
    dimensions = [],
    filters = [],
    startDate,
    endDate,
    datePreset,
    orderBy,
    orderDirection,
    limit,
  } = request;

  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Separate calculated vs API metrics
  const calculatedMetricKeys = metrics.filter((k) => isCalculatedMetric(k));
  const apiMetricKeys = metrics.filter((k) => !isCalculatedMetric(k));

  // 2. Resolve calculated metric dependencies -> add to API metrics
  const dependencyApiFields = new Set<string>();
  for (const calcKey of calculatedMetricKeys) {
    for (const depKey of getMetricDependencies(calcKey)) {
      const field = resolveMetricApiField(depKey);
      if (field) {
        dependencyApiFields.add(field);
      }
    }
  }

  // 3. Resolve API metric keys to fields
  const metricApiFields: string[] = [];
  for (const key of apiMetricKeys) {
    const field = resolveMetricApiField(key);
    if (field) {
      metricApiFields.push(field);
    } else {
      warnings.push(`Metric "${key}" not found in catalog, skipping`);
    }
  }

  // Add dependency fields not already in the list
  for (const depField of dependencyApiFields) {
    if (!metricApiFields.includes(depField)) {
      metricApiFields.push(depField);
    }
  }

  // 4. Resolve dimension keys to fields
  const dimensionApiFields: string[] = [];
  const segmentApiFields: string[] = [];

  for (const key of dimensions) {
    const dim = findDimensionByKey(key);
    if (!dim) {
      warnings.push(`Dimension "${key}" not found in catalog, skipping`);
      continue;
    }
    dimensionApiFields.push(dim.apiField);
    if (dim.isSegment) {
      segmentApiFields.push(dim.apiField);
    }
  }

  // 5. Validate metric/segment/resource compatibility
  const validation = validateQuerySelection(
    metricApiFields,
    segmentApiFields,
    resource,
    dimensions
  );

  if (!validation.valid) {
    return {
      queries: [],
      mergeStrategy: "none",
      joinKeys: [],
      warnings: validation.warnings,
      errors: validation.errors,
      estimatedApiCalls: 0,
      calculatedMetrics: calculatedMetricKeys,
    };
  }

  warnings.push(...validation.warnings);

  // 6. Check for incompatible metric/segment combinations that need splitting
  const incompatibleMetricKeys: string[] = [];
  const compatibleMetricKeys: string[] = [];

  for (const key of apiMetricKeys) {
    const incompatSegs = getMetricIncompatibleSegments(key);
    const hasConflict = segmentApiFields.some((seg) =>
      incompatSegs.includes(seg)
    );
    if (hasConflict) {
      incompatibleMetricKeys.push(key);
    } else {
      compatibleMetricKeys.push(key);
    }
  }

  // 7. Build WHERE clauses
  const whereClause: string[] = [];

  // Date filter
  const dateClause = buildDateWhereClause(startDate, endDate, datePreset);
  warnings.push(...dateClause.warnings);
  if (dateClause.clause) {
    // Ensure segments.date is in SELECT when using date filter
    if (!dimensionApiFields.includes("segments.date") && !datePreset) {
      // Date filter doesn't require segments.date in SELECT
      // GAQL allows filtering on segments.date without selecting it
    }
    whereClause.push(dateClause.clause);
  }

  // User filters
  for (const filter of filters) {
    const clause = buildFilterClause(
      filter.field,
      filter.operator,
      filter.value
    );
    if (clause) {
      whereClause.push(clause);
    }
  }

  // When LIMIT is present without an explicit ORDER BY, Google Ads can return
  // old paused entities first, making active accounts look empty. Use the first
  // selected metric as a stable default for non-time-series top lists.
  const effectiveOrderBy = defaultMetricOrderBy(
    orderBy,
    limit,
    metricApiFields,
    segmentApiFields
  );
  const effectiveOrderDirection = orderBy ? orderDirection : "DESC";

  // 8. Build GAQL queries
  const queries: GoogleAdsGaqlQuery[] = [];

  if (incompatibleMetricKeys.length > 0 && compatibleMetricKeys.length > 0) {
    // SPLIT: Two queries -- compatible metrics with all dims, incompatible metrics without conflicting segments
    const compatibleFields = compatibleMetricKeys
      .map(resolveMetricApiField)
      .filter((f): f is string => f !== null);

    // Also add dependency fields to compatible query
    const compatibleWithDeps = [...compatibleFields];
    for (const depField of dependencyApiFields) {
      if (!compatibleWithDeps.includes(depField)) {
        compatibleWithDeps.push(depField);
      }
    }

    // Query 1: Compatible metrics with all dimensions
    const selectFields1 = [...dimensionApiFields, ...compatibleWithDeps];
    if (selectFields1.length > 0) {
      queries.push({
        gaql: buildGaql(
          selectFields1,
          resource,
          whereClause,
          effectiveOrderBy,
          effectiveOrderDirection,
          limit
        ),
        resource,
        selectFields: selectFields1,
        metrics: compatibleMetricKeys,
        dimensions,
        description: `Main query with ${compatibleMetricKeys.length} compatible metrics`,
      });
    }

    // Query 2: Incompatible metrics without conflicting segments
    const incompatibleFields = incompatibleMetricKeys
      .map(resolveMetricApiField)
      .filter((f): f is string => f !== null);

    // Find safe dimensions (remove conflicting segments)
    const allIncompatSegs = new Set<string>();
    for (const key of incompatibleMetricKeys) {
      for (const seg of getMetricIncompatibleSegments(key)) {
        allIncompatSegs.add(seg);
      }
    }

    const safeDimensionFields = dimensionApiFields.filter(
      (d) => !allIncompatSegs.has(d)
    );
    const safeDimensionKeys = dimensions.filter((key) => {
      const dim = findDimensionByKey(key);
      return dim && !allIncompatSegs.has(dim.apiField);
    });

    const selectFields2 = [...safeDimensionFields, ...incompatibleFields];
    if (selectFields2.length > 0) {
      queries.push({
        gaql: buildGaql(
          selectFields2,
          resource,
          whereClause,
          effectiveOrderBy,
          effectiveOrderDirection,
          limit
        ),
        resource,
        selectFields: selectFields2,
        metrics: incompatibleMetricKeys,
        dimensions: safeDimensionKeys,
        description: `Split query for ${incompatibleMetricKeys.length} metrics incompatible with selected segments`,
      });

      warnings.push(
        `Query was split into ${queries.length} requests due to metric/segment incompatibilities`
      );
    }
  } else {
    // SINGLE query -- all metrics and dimensions are compatible
    const allMetricFields = metricApiFields;
    const selectFields = [...dimensionApiFields, ...allMetricFields];

    if (selectFields.length === 0) {
      errors.push("No metrics or dimensions selected");
      return {
        queries: [],
        mergeStrategy: "none",
        joinKeys: [],
        warnings,
        errors,
        estimatedApiCalls: 0,
        calculatedMetrics: calculatedMetricKeys,
      };
    }

    queries.push({
      gaql: buildGaql(
        selectFields,
        resource,
        whereClause,
        effectiveOrderBy,
        effectiveOrderDirection,
        limit
      ),
      resource,
      selectFields,
      metrics: apiMetricKeys,
      dimensions,
      description: `Query ${resource} with ${metricApiFields.length} metrics and ${dimensionApiFields.length} dimensions`,
    });
  }

  // 9. Determine merge strategy
  let mergeStrategy: "join" | "union" | "none" = "none";
  const joinKeys: string[] = [];

  if (queries.length > 1) {
    mergeStrategy = "join";
    // Join on shared dimension fields
    const firstQueryDims = new Set(queries[0].dimensions);
    const secondQueryDims = new Set(queries[1].dimensions);
    for (const dim of firstQueryDims) {
      if (secondQueryDims.has(dim)) {
        const field = resolveDimensionApiField(dim);
        if (field) joinKeys.push(field);
      }
    }
    // If no shared dims, fall back to union
    if (joinKeys.length === 0) {
      mergeStrategy = "union";
    }
  }

  return {
    queries,
    mergeStrategy,
    joinKeys,
    warnings,
    errors,
    estimatedApiCalls: queries.length,
    calculatedMetrics: calculatedMetricKeys,
  };
}

// ============================================
// QUERY PREVIEW (for debug UI)
// ============================================

export function generateQueryPreview(plan: GoogleAdsQueryPlan): string {
  const lines: string[] = [];

  lines.push("=== Google Ads Query Plan ===");
  lines.push(`Total Queries: ${plan.queries.length}`);
  lines.push(`Merge Strategy: ${plan.mergeStrategy}`);
  if (plan.joinKeys.length > 0) {
    lines.push(`Join Keys: ${plan.joinKeys.join(", ")}`);
  }
  if (plan.calculatedMetrics.length > 0) {
    lines.push(`Calculated Metrics: ${plan.calculatedMetrics.join(", ")}`);
  }
  lines.push("");

  if (plan.errors.length > 0) {
    lines.push("Errors:");
    plan.errors.forEach((e) => lines.push(`  x ${e}`));
    lines.push("");
  }

  if (plan.warnings.length > 0) {
    lines.push("Warnings:");
    plan.warnings.forEach((w) => lines.push(`  ! ${w}`));
    lines.push("");
  }

  plan.queries.forEach((query, i) => {
    lines.push(`--- Query ${i + 1} ---`);
    lines.push(query.gaql);
    lines.push(`Description: ${query.description}`);
    lines.push("");
  });

  return lines.join("\n");
}

export default { planQuery, generateQueryPreview };
