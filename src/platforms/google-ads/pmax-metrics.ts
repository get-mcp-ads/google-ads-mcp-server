/** Copyright 2026 GetMCPAds. SPDX-License-Identifier: Apache-2.0 */
/** Numeric fields selectable with asset_group_asset in the supported v23 API.
 * https://developers.google.com/google-ads/api/fields/v23/asset_group_asset
 * Do not substitute campaign/keyword metrics: they are not asset performance.
 */
export const PMAX_METRIC_FIELDS = [
  "metrics.impressions", "metrics.clicks", "metrics.cost_micros", "metrics.conversions", "metrics.conversions_value",
  "metrics.all_conversions", "metrics.all_conversions_from_interactions_rate",
  "metrics.all_conversions_from_interactions_value_per_interaction", "metrics.all_conversions_value", "metrics.all_conversions_value_per_cost",
  "metrics.average_cost", "metrics.average_cpc", "metrics.average_cpe", "metrics.average_cpm",
  "metrics.conversions_from_interactions_rate", "metrics.conversions_from_interactions_value_per_interaction", "metrics.conversions_value_per_cost",
  "metrics.cost_per_all_conversions", "metrics.cost_per_conversion", "metrics.cross_device_conversions", "metrics.cross_device_conversions_value",
  "metrics.ctr", "metrics.engagement_rate", "metrics.engagements", "metrics.interaction_rate", "metrics.interactions",
  "metrics.trueview_average_cpv", "metrics.value_per_all_conversions", "metrics.value_per_conversion", "metrics.video_trueview_view_rate",
  "metrics.video_trueview_views", "metrics.view_through_conversions",
] as const;
