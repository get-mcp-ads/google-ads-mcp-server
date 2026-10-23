/**
 * The server pins one Google Ads API version, in one place.
 *
 * v26 was adopted after checking the official v25 to v26 proto differences:
 * no resource, field or enum this server builds is removed or renamed. A
 * leftover v25 path would silently mix two API versions, so none may remain.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { GOOGLE_ADS_API_VERSION, GOOGLE_ADS_API_BASE_URL } from "../src/platforms/google-ads/types.ts";
import { GOOGLE_ADS_METRIC_CATALOG } from "../src/platforms/google-ads/metric-catalog.ts";
import { planQuery } from "../src/platforms/google-ads/query-planner.ts";
import { validateQuerySelection } from "../src/platforms/google-ads/compatibility-rules.ts";

function sourceFiles(dir = "src", acc = []) {
  for (const entry of readdirSync(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true })) {
    if (entry.isDirectory()) sourceFiles(`${dir}/${entry.name}`, acc);
    else if (entry.name.endsWith(".ts")) acc.push(`${dir}/${entry.name}`);
  }
  return acc;
}

test("API v26 is pinned once and every request path uses it", () => {
  assert.equal(GOOGLE_ADS_API_VERSION, "v26");
  assert.equal(GOOGLE_ADS_API_BASE_URL, "https://googleads.googleapis.com/v26");
  const stale = [];
  for (const file of sourceFiles()) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    if (/googleads\.googleapis\.com\/(?:resumable\/upload\/)?v\d+/.test(text)) stale.push(file);
  }
  assert.deepEqual(stale, [], "Build Google Ads URLs from GOOGLE_ADS_API_BASE_URL or GOOGLE_ADS_API_VERSION");
});

test("no field that v26 removed or renamed is used", () => {
  const removed = [
    "enhanced_conversions_for_leads_enabled", "enhancedConversionsForLeadsEnabled",
    "hotel_date_selection_type", "hotel_advance_booking_window", "hotel_length_of_stay",
    "hotel_check_in_day", "hotel_check_in_date_range", "HotelDateSelectionType",
    "HOTEL_LENGTH_OF_STAY_OVERLAPS", "HOTEL_CHECK_IN_DATE_RANGE",
  ];
  const offenders = [];
  for (const file of sourceFiles()) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    for (const name of removed) if (text.includes(name)) offenders.push(`${file}: ${name}`);
  }
  assert.deepEqual(offenders, []);
});

// Exact names from https://developers.google.com/google-ads/api/fields/v26/metrics
const SEARCH_LIFT_FIELDS = [
  "metrics.relative_search_lift",
  "metrics.relative_search_lift_p90_lower_bound",
  "metrics.relative_search_lift_p90_upper_bound",
  "metrics.incremental_searches_p_value",
  "metrics.search_lift_cost_micros",
  "metrics.search_lift_impressions",
  "metrics.normalized_incremental_searches",
  "metrics.normalized_incremental_searches_p90_lower_bound",
  "metrics.normalized_incremental_searches_p90_upper_bound",
  "metrics.normalized_incremental_searches_per_cost",
  "metrics.normalized_incremental_searches_per_cost_p90_lower_bound",
  "metrics.normalized_incremental_searches_per_cost_p90_upper_bound",
  "metrics.normalized_incremental_searches_per_impression",
  "metrics.normalized_incremental_searches_per_impression_p90_lower_bound",
  "metrics.normalized_incremental_searches_per_impression_p90_upper_bound",
];

test("the catalog carries the 15 Search Lift metrics under their official names", () => {
  const lift = GOOGLE_ADS_METRIC_CATALOG.filter((metric) => metric.category === "search_lift");
  assert.deepEqual(lift.map((metric) => metric.apiField).sort(), [...SEARCH_LIFT_FIELDS].sort());
  for (const metric of lift) assert.deepEqual(metric.compatibleResources, ["lift_measurement_config"], metric.key);
});

test("Search Lift queries read lift_measurement_config and nothing else", () => {
  const plan = planQuery({
    customerId: "1234567890",
    resource: "lift_measurement_config",
    metrics: ["relative_search_lift", "search_lift_cost_micros"],
    dimensions: ["liftMeasurementConfigName", "searchLiftKeywordBundle", "searchProperty"],
    filters: [],
    startDate: "2026-09-01",
    endDate: "2026-09-30",
  });
  assert.deepEqual(plan.errors, []);
  assert.match(plan.queries[0].gaql, /FROM lift_measurement_config/);
  assert.match(plan.queries[0].gaql, /metrics\.relative_search_lift/);
  assert.match(plan.queries[0].gaql, /segments\.search_property/);

  const onCampaign = validateQuerySelection(["metrics.relative_search_lift"], [], "campaign", []);
  assert.equal(onCampaign.valid, false);
  const liftSegmentOnCampaign = validateQuerySelection(["metrics.clicks"], ["segments.search_property"], "campaign", []);
  assert.equal(liftSegmentOnCampaign.valid, false);
  const propertyWithDevice = validateQuerySelection(
    ["metrics.relative_search_lift"], ["segments.search_property", "segments.device"], "lift_measurement_config", [],
  );
  assert.equal(propertyWithDevice.valid, false);
});
