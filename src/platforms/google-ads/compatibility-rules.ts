/**
 * google-ads-mcp-server: an open-source MCP server for the Google Ads API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
// ============================================
// GOOGLE ADS COMPATIBILITY RULES
// Validation logic for metric/segment/resource combinations
// ============================================

import { GoogleAdsResourceType } from "./types.js";
import { GOOGLE_ADS_DIMENSION_CATALOG } from "./dimension-catalog.js";

// ============================================
// RESOURCE-METRIC COMPATIBILITY
// ============================================

/**
 * Metrics that are only available on specific resources
 */
export const RESOURCE_RESTRICTED_METRICS: Record<string, GoogleAdsResourceType[]> = {
  // Quality score only on keyword_view (via ad_group_criterion)
  "metrics.historical_quality_score": ["keyword_view"],
  "metrics.historical_creative_quality_score": ["keyword_view"],
  "metrics.historical_landing_page_quality_score": ["keyword_view"],
  "metrics.historical_search_predicted_ctr": ["keyword_view"],

  // Video quartile metrics not on keyword_view
  "metrics.video_quartile_p25_rate": ["campaign", "ad_group", "ad_group_ad", "video"],
  "metrics.video_quartile_p50_rate": ["campaign", "ad_group", "ad_group_ad", "video"],
  "metrics.video_quartile_p75_rate": ["campaign", "ad_group", "ad_group_ad", "video"],
  "metrics.video_quartile_p100_rate": ["campaign", "ad_group", "ad_group_ad", "video"],
  "metrics.video_trueview_views": ["campaign", "ad_group", "ad_group_ad", "video"],
  "metrics.video_trueview_view_rate": ["campaign", "ad_group", "ad_group_ad", "video"],

  // Search Lift metrics (API v26): selectable only FROM lift_measurement_config
  "metrics.relative_search_lift": ["lift_measurement_config"],
  "metrics.relative_search_lift_p90_lower_bound": ["lift_measurement_config"],
  "metrics.relative_search_lift_p90_upper_bound": ["lift_measurement_config"],
  "metrics.incremental_searches_p_value": ["lift_measurement_config"],
  "metrics.search_lift_cost_micros": ["lift_measurement_config"],
  "metrics.search_lift_impressions": ["lift_measurement_config"],
  "metrics.normalized_incremental_searches": ["lift_measurement_config"],
  "metrics.normalized_incremental_searches_p90_lower_bound": ["lift_measurement_config"],
  "metrics.normalized_incremental_searches_p90_upper_bound": ["lift_measurement_config"],
  "metrics.normalized_incremental_searches_per_cost": ["lift_measurement_config"],
  "metrics.normalized_incremental_searches_per_cost_p90_lower_bound": ["lift_measurement_config"],
  "metrics.normalized_incremental_searches_per_cost_p90_upper_bound": ["lift_measurement_config"],
  "metrics.normalized_incremental_searches_per_impression": ["lift_measurement_config"],
  "metrics.normalized_incremental_searches_per_impression_p90_lower_bound": ["lift_measurement_config"],
  "metrics.normalized_incremental_searches_per_impression_p90_upper_bound": ["lift_measurement_config"],
};

/**
 * Impression share metrics with their allowed resources
 * (NOT limited to campaign -- API v23 supports ad_group, keyword_view, ad_group_criterion too)
 */
export const IMPRESSION_SHARE_METRICS: Record<string, GoogleAdsResourceType[]> = {
  "metrics.search_impression_share": ["campaign", "ad_group", "keyword_view", "ad_group_criterion"],
  "metrics.search_budget_lost_impression_share": ["campaign"],
  "metrics.search_rank_lost_impression_share": ["campaign", "ad_group", "keyword_view", "ad_group_criterion"],
  "metrics.search_top_impression_share": ["campaign", "ad_group", "keyword_view", "ad_group_criterion"],
  "metrics.search_absolute_top_impression_share": ["campaign", "ad_group", "keyword_view", "ad_group_criterion"],
  "metrics.search_exact_match_impression_share": ["campaign", "ad_group", "keyword_view", "ad_group_criterion"],
  "metrics.search_budget_lost_absolute_top_impression_share": ["campaign"],
  "metrics.search_budget_lost_top_impression_share": ["campaign"],
  "metrics.search_rank_lost_absolute_top_impression_share": ["campaign", "ad_group", "keyword_view", "ad_group_criterion"],
  "metrics.search_rank_lost_top_impression_share": ["campaign", "ad_group", "keyword_view", "ad_group_criterion"],
  "metrics.content_impression_share": ["campaign", "ad_group"],
  "metrics.content_budget_lost_impression_share": ["campaign"],
  "metrics.content_rank_lost_impression_share": ["campaign", "ad_group"],
};

// ============================================
// SEGMENT COMPATIBILITY
// ============================================

/**
 * Segments that cannot be used together
 */
export const INCOMPATIBLE_SEGMENT_PAIRS: Array<[string, string]> = [
  // click_type cannot combine with conversion segments
  ["segments.click_type", "segments.conversion_action"],
  ["segments.click_type", "segments.conversion_action_name"],
  ["segments.click_type", "segments.conversion_action_category"],
  // date-dependent segments
  // No explicit incompatibilities beyond hour requiring date
  // Search Lift (API v26): search_property is not selectable with demographic or device segments
  ["segments.search_property", "segments.age_range"],
  ["segments.search_property", "segments.device"],
  ["segments.search_property", "segments.gender"],
];

/**
 * Search Lift segments (API v26), selectable only FROM lift_measurement_config
 */
const SEARCH_LIFT_SEGMENTS = ["segments.search_lift_keyword_bundle", "segments.search_property"];

/**
 * Segments that require another segment to be present
 */
export const SEGMENT_DEPENDENCIES: Record<string, string> = {
  "segments.hour": "segments.date",
};

/**
 * Segments that are incompatible with impression share metrics
 */
export const IMPRESSION_SHARE_INCOMPATIBLE_SEGMENTS = [
  "segments.conversion_action",
  "segments.conversion_action_name",
  "segments.conversion_action_category",
  "segments.external_conversion_source",
  "segments.click_type",
  "segments.ad_destination_type",
];

/**
 * Shopping product segments -- only valid on these resources
 */
const SHOPPING_SEGMENT_ALLOWED_RESOURCES: GoogleAdsResourceType[] = [
  "shopping_performance_view",
  "asset_group_listing_group_filter",
];

/**
 * All shopping product segment fields
 */
const SHOPPING_PRODUCT_SEGMENTS = [
  "segments.product_item_id",
  "segments.product_brand",
  "segments.product_title",
  "segments.product_category_level1",
  "segments.product_category_level2",
  "segments.product_category_level3",
  "segments.product_category_level4",
  "segments.product_category_level5",
  "segments.product_type_l1",
  "segments.product_type_l2",
  "segments.product_type_l3",
  "segments.product_type_l4",
  "segments.product_type_l5",
  "segments.product_custom_attribute0",
  "segments.product_custom_attribute1",
  "segments.product_custom_attribute2",
  "segments.product_custom_attribute3",
  "segments.product_custom_attribute4",
  "segments.product_channel",
  "segments.product_channel_exclusivity",
  "segments.product_condition",
  "segments.product_country",
  "segments.product_language",
  "segments.product_store_id",
  "segments.product_aggregator_id",
  "segments.product_merchant_id",
];

/**
 * Segments incompatible with specific resources (non-shopping restrictions)
 */
export const RESOURCE_INCOMPATIBLE_SEGMENTS: Record<string, string[]> = {
  customer: [
    "segments.conversion_action",
    "segments.conversion_action_name",
    "segments.age_range",
    "segments.gender",
  ],
  shopping_performance_view: [
    "segments.age_range",
    "segments.gender",
    "segments.slot",
  ],
  // PMax asset group has limited segment support
  asset_group: [
    "segments.conversion_action",
    "segments.conversion_action_name",
    "segments.click_type",
    "segments.product_item_id",
    "segments.product_brand",
  ],
};

// ============================================
// VALIDATION FUNCTIONS
// ============================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a query selection (metrics + segments + resource)
 */
export function validateQuerySelection(
  metricApiFields: string[],
  segmentApiFields: string[],
  resource: GoogleAdsResourceType,
  dimensionKeys?: string[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Check resource-restricted metrics
  for (const metric of metricApiFields) {
    const allowedResources = RESOURCE_RESTRICTED_METRICS[metric];
    if (allowedResources && !allowedResources.includes(resource)) {
      errors.push(
        `Metric "${metric}" is not available on resource "${resource}". Available on: ${allowedResources.join(", ")}`
      );
    }
  }

  // 2. Check impression share metrics against their per-metric allowed resources
  for (const metric of metricApiFields) {
    const allowedResources = IMPRESSION_SHARE_METRICS[metric];
    if (allowedResources && !allowedResources.includes(resource)) {
      errors.push(
        `Metric "${metric}" is not available on resource "${resource}". Available on: ${allowedResources.join(", ")}`
      );
    }
  }

  const hasImpressionShareMetrics = metricApiFields.some((m) => m in IMPRESSION_SHARE_METRICS);

  // 3. Check segment dependencies
  for (const segment of segmentApiFields) {
    const required = SEGMENT_DEPENDENCIES[segment];
    if (required && !segmentApiFields.includes(required)) {
      errors.push(
        `Segment "${segment}" requires "${required}" to also be selected`
      );
    }
  }

  // 4. Check incompatible segment pairs
  for (const [seg1, seg2] of INCOMPATIBLE_SEGMENT_PAIRS) {
    if (segmentApiFields.includes(seg1) && segmentApiFields.includes(seg2)) {
      errors.push(
        `Segments "${seg1}" and "${seg2}" cannot be used together`
      );
    }
  }

  // 5. Check impression share metrics with incompatible segments
  if (hasImpressionShareMetrics) {
    const incompatibleSegments = segmentApiFields.filter((s) =>
      IMPRESSION_SHARE_INCOMPATIBLE_SEGMENTS.includes(s)
    );
    if (incompatibleSegments.length > 0) {
      // This is a warning, not error -- the query planner will split the query
      warnings.push(
        `Impression share metrics are incompatible with segments: ${incompatibleSegments.join(", ")}. Query will be split automatically.`
      );
    }
  }

  // 6. Check shopping segments against resource (ERROR, not warning)
  const selectedShoppingSegments = segmentApiFields.filter((s) =>
    SHOPPING_PRODUCT_SEGMENTS.includes(s)
  );
  if (selectedShoppingSegments.length > 0 && !SHOPPING_SEGMENT_ALLOWED_RESOURCES.includes(resource)) {
    errors.push(
      `Shopping segments (${selectedShoppingSegments.join(", ")}) are only available on: ${SHOPPING_SEGMENT_ALLOWED_RESOURCES.join(", ")}. Current resource: "${resource}"`
    );
  }

  // 6b. Search Lift segments exist only on lift_measurement_config
  const selectedLiftSegments = segmentApiFields.filter((s) => SEARCH_LIFT_SEGMENTS.includes(s));
  if (selectedLiftSegments.length > 0 && resource !== "lift_measurement_config") {
    errors.push(
      `Search Lift segments (${selectedLiftSegments.join(", ")}) are only available on: lift_measurement_config. Current resource: "${resource}"`
    );
  }

  // 7. Check other resource-incompatible segments
  const restricted = RESOURCE_INCOMPATIBLE_SEGMENTS[resource];
  if (restricted) {
    const offending = segmentApiFields.filter((s) => restricted.includes(s));
    if (offending.length > 0) {
      errors.push(
        `Segments ${offending.join(", ")} are not compatible with resource "${resource}"`
      );
    }
  }

  // 8. Validate dimension compatibility with resource
  if (dimensionKeys && dimensionKeys.length > 0) {
    for (const dimKey of dimensionKeys) {
      const dim = GOOGLE_ADS_DIMENSION_CATALOG.find((d) => d.key === dimKey);
      if (dim?.compatibleResources && dim.compatibleResources.length > 0) {
        if (!dim.compatibleResources.includes(resource)) {
          warnings.push(
            `Dimension "${dim.name}" (${dim.apiField}) may not be available on resource "${resource}"`
          );
        }
      }
    }
  }

  // 9. Info about aggregated vs daily data
  if (!segmentApiFields.includes("segments.date") && !segmentApiFields.includes("segments.month") && !segmentApiFields.includes("segments.week")) {
    warnings.push(
      "No time segment (date/week/month) selected -- results will be aggregated over the full date range. Add segments.date for daily breakdown."
    );
  }

  // 10. Warn about large result sets
  if (segmentApiFields.length > 3) {
    warnings.push(
      "Multiple segments selected -- this may produce a very large number of rows"
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if a metric needs to be split into a separate query
 */
export function requiresSeparateQuery(
  metricApiField: string,
  _otherMetrics: string[]
): boolean {
  // Auction insight metrics require a completely different query
  if (metricApiField.startsWith("metrics.auction_insight")) {
    return true;
  }
  return false;
}

/**
 * Get all incompatible segments for a given set of metrics
 */
export function getIncompatibleSegments(metricApiFields: string[]): string[] {
  const incompatible = new Set<string>();

  const hasImpressionShare = metricApiFields.some((m) => m in IMPRESSION_SHARE_METRICS);

  if (hasImpressionShare) {
    for (const seg of IMPRESSION_SHARE_INCOMPATIBLE_SEGMENTS) {
      incompatible.add(seg);
    }
  }

  return Array.from(incompatible);
}
