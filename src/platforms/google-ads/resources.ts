/**
 * google-ads-mcp-server: an open-source MCP server for the Google Ads API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GOOGLE_ADS_METRIC_CATALOG } from "./metric-catalog.js";
import { GOOGLE_ADS_DIMENSION_CATALOG } from "./dimension-catalog.js";
import { GOOGLE_ADS_API_VERSION } from "./types.js";

const GOOGLE_ADS_TOOL_MANIFEST = {
  platform: "google-ads",
  apiVersion: GOOGLE_ADS_API_VERSION,
  safety: {
    scope: "read-only",
    mutatesData: false,
    secrets: "Tools never return developer tokens, OAuth client secrets, refresh tokens, or access tokens.",
  },
  tools: [
    { name: "google_ads_health_check", purpose: "Verify credential presence, API reachability, accessible customers, login customer visibility, and actionable warnings." },
    { name: "google_ads_list_accounts", purpose: "List Google Ads customer accounts accessible to the current credentials." },
    { name: "google_ads_get_account_details", purpose: "Get customer-level account metadata." },
    { name: "google_ads_get_account_hierarchy", purpose: "List accessible customers and MCC customer_client relationships when available." },
    { name: "google_ads_get_campaigns", purpose: "List campaigns with status, budget, channel type, and bidding strategy." },
    { name: "google_ads_get_adgroups", purpose: "List ad groups, optionally filtered by campaign/status." },
    { name: "google_ads_get_budgets", purpose: "List campaign budgets with delivery, amount, status, and recommended budget fields." },
    { name: "google_ads_get_bidding_strategies", purpose: "List portfolio bidding strategies and optional date-range metrics." },
    { name: "google_ads_get_conversion_actions", purpose: "Audit conversion actions with type, category, primary/include flags, ownership, and last activity dates." },
    { name: "google_ads_get_change_events", purpose: "Inspect recent account changes from change_event with a Google-enforced 30-day window and max 10000 rows." },
    { name: "google_ads_get_recommendations", purpose: "List optimization recommendations with linked campaign/ad group/budget and impact when available." },
    { name: "google_ads_get_search_terms", purpose: "Fetch search term performance from search_term_view or campaign_search_term_insight." },
    { name: "google_ads_get_landing_pages", purpose: "Fetch landing_page_view performance and quality metrics." },
    { name: "google_ads_get_pmax_assets", purpose: "List Performance Max asset group assets with structure and optional performance metrics." },
    { name: "google_ads_get_simulations", purpose: "Read campaign, ad group, and portfolio bidding simulations for planning/forecast analysis." },
    { name: "google_ads_get_paid_organic_search_terms", purpose: "Read paid/organic search term metrics with a paid-only search_term_view fallback." },
    { name: "google_ads_get_shopping_products", purpose: "Read Merchant Center product catalog, eligibility, issues, and optional Shopping/PMax performance metrics." },
    { name: "google_ads_get_shopping_performance", purpose: "Read Shopping performance keyed by merchant ID, item ID, title, brand, feed label, and custom labels." },
    { name: "google_ads_get_pmax_placements", purpose: "Read Performance Max placement diagnostics with impression-only placement metrics." },
    { name: "google_ads_get_pmax_asset_diagnostics", purpose: "Read Performance Max asset group diagnostics, asset coverage action items, and top combinations." },
    { name: "google_ads_get_keyword_performance", purpose: "Fetch keyword-level performance and quality score." },
    { name: "google_ads_generate_keyword_historical_metrics", purpose: "Return Keyword Planner search-volume history, competition, bids, close variants, and derived 3-month/YoY trends." },
    { name: "google_ads_generate_keyword_ideas", purpose: "Discover Keyword Planner ideas from keyword, URL, combined, or site seeds with historical metrics and pagination." },
    { name: "google_ads_generate_keyword_forecast_metrics", purpose: "Forecast campaign-level keyword impressions, clicks, cost, conversions, and optional independent per-keyword scenarios." },
    { name: "google_ads_generate_ad_group_themes", purpose: "Organize keyword ideas into existing ad groups with suggested normalized text and match types." },
    { name: "google_ads_suggest_geo_targets", purpose: "Resolve location names or criterion IDs to targetable Google Ads geo constants and approximate reach." },
    { name: "google_ads_search_fields", purpose: "Search Google's live, version-specific catalog of GAQL resources, fields, enums, and compatibility relationships." },
    { name: "google_ads_run_readonly_rpc", purpose: "Call an allowlisted non-GAQL read service for Audience Insights, Reach Planner, benchmarks, suggestions, identity, invoices, or payments metadata." },
    { name: "google_ads_get_insights", purpose: "Generate validated performance GAQL using the metric and dimension catalogs." },
    { name: "google_ads_validate_query", purpose: "Validate metric/dimension/resource compatibility before querying." },
    { name: "google_ads_run_gaql", purpose: "Run raw read-only GAQL SELECT queries for advanced reporting." },
    { name: "google_ads_list_image_assets", purpose: "List the account's image asset library with stable public full-size URLs, dimensions, and file metadata." },
    { name: "google_ads_list_video_assets", purpose: "List YouTube video assets with derived watch, embed, and public thumbnail URLs." },
    { name: "google_ads_get_demand_gen_assets", purpose: "List Demand Gen ads with their referenced image and YouTube creatives resolved." },
    {"name": "google_ads_get_video_upload", "purpose": "Read the processing state and YouTube video ID of one Google Ads upload in the selected customer"},
  ],
  resources: [
    "google-ads://manifest",
    "google-ads://recipes",
    "google-ads://metrics",
    "google-ads://dimensions",
    "google-ads://compatibility",
  ],
};

const GOOGLE_ADS_RECIPES = [
  {
    name: "Connection and access triage",
    steps: [
      "Call google_ads_health_check first.",
      "If manager accounts are present, call google_ads_get_account_hierarchy.",
      "Use returned customer IDs without dashes for all customerId parameters.",
    ],
  },
  {
    name: "Conversion tracking audit",
    steps: [
      "Call google_ads_get_conversion_actions for status/type/category/primary_for_goal coverage.",
      "Review metrics.conversion_last_conversion_date and metrics.conversion_last_received_request_date_time when present.",
      "Use google_ads_get_change_events for recent conversion action edits if suspicious changes are found.",
    ],
  },
  {
    name: "Budget and bidding review",
    steps: [
      "Call google_ads_get_budgets to inspect amount, delivery, status, and recommended budget fields.",
      "Call google_ads_get_bidding_strategies without dates for structure or with a date range for performance.",
      "Call google_ads_get_recommendations for budget and bidding recommendations before proposing changes.",
    ],
  },
  {
    name: "Search query mining",
    steps: [
      "Call google_ads_get_search_terms with reportType search_term_view for raw query performance.",
      "Use campaign_search_term_insight when Performance Max or privacy thresholds limit raw terms.",
      "Sort and filter results by impressions, cost, conversions, and search term status.",
    ],
  },
  {
    name: "Landing page and PMax asset audit",
    steps: [
      "Call google_ads_get_landing_pages for URL-level traffic, conversion, and landing-page quality metrics.",
      "Call google_ads_get_pmax_assets with a date range to include asset performance metrics.",
      "Call google_ads_get_pmax_asset_diagnostics for ad strength, asset coverage action items, primary status reasons, and top combinations.",
      "If warnings mention fallback queries, treat missing enriched fields as unavailable for that account/API combination.",
    ],
  },
  {
    name: "Keyword Planner research and forecast",
    steps: [
      "Call google_ads_generate_keyword_ideas to expand seed keywords or a landing-page/site URL.",
      "Call google_ads_suggest_geo_targets first when location criterion IDs are unknown.",
      "Call google_ads_generate_keyword_historical_metrics for monthly search history, competition, bids, close variants, and derived 3-month/YoY trends.",
      "Optionally call google_ads_generate_ad_group_themes to organize the shortlist into existing ad groups.",
      "Shortlist keywords, then call google_ads_generate_keyword_forecast_metrics with an explicit bid/budget, targeting, and future period.",
      "Treat historical searches as approximate demand and forecast impressions as campaign estimates; they are different data kinds.",
      "Request independent keyword breakdowns sparingly because Keyword Planner is limited to one request per second per customer ID.",
    ],
  },
  {
    name: "Discover the complete GAQL surface",
    steps: [
      "Call google_ads_search_fields with category RESOURCE to list queryable FROM resources.",
      "Search category METRIC, SEGMENT, or ATTRIBUTE by name and inspect selectableWith before composing a query.",
      "Run the final read-only SELECT with google_ads_run_gaql.",
    ],
  },
  {
    name: "Planning and forecast review",
    steps: [
      "Call google_ads_get_simulations at campaign, ad_group, or bidding_strategy level.",
      "Use typeFilter such as BUDGET, TARGET_CPA, TARGET_ROAS, or CPC_BID to narrow planning scenarios.",
      "If only metadata is returned, the account may not have generated simulation point lists for that entity.",
    ],
  },
  {
    name: "Paid and organic search coverage",
    steps: [
      "Call google_ads_get_paid_organic_search_terms for combined paid/organic query metrics.",
      "If the tool falls back to search_term_view_paid_only, organic fields are unavailable and the result should be treated as paid search terms only.",
      "Use serpType to focus ADS_AND_ORGANIC, ADS_ONLY, or ORGANIC_ONLY when paid_organic_search_term_view is available.",
    ],
  },
  {
    name: "Shopping and Merchant Center audit",
    steps: [
      "Call google_ads_get_shopping_products to inspect Merchant Center product eligibility, product issues, price, feed label, and item IDs.",
      "Call google_ads_get_shopping_performance to join spend/conversion metrics back to merchant ID and item ID.",
      "Use warnings from fallback queries to distinguish missing e-commerce/cart fields from true zero performance.",
    ],
  },
  {
    name: "PMax placement diagnostics",
    steps: [
      "Call google_ads_get_pmax_placements for placement type, display name, target URL, campaign, and impressions.",
      "Remember this Google Ads resource exposes impressions only; do not infer clicks, cost, or conversions from it.",
      "Use placementType and placementContains to focus websites, apps, or YouTube placements.",
    ],
  },
];

export function registerGoogleAdsResources(server: McpServer): void {
  server.resource("google-ads-manifest", "google-ads://manifest", async () => ({
    contents: [{
      uri: "google-ads://manifest",
      mimeType: "application/json",
      text: JSON.stringify(GOOGLE_ADS_TOOL_MANIFEST, null, 2),
    }],
  }));

  server.resource("google-ads-recipes", "google-ads://recipes", async () => ({
    contents: [{
      uri: "google-ads://recipes",
      mimeType: "application/json",
      text: JSON.stringify(GOOGLE_ADS_RECIPES, null, 2),
    }],
  }));

  server.resource("google-ads-metrics", "google-ads://metrics", async () => ({
    contents: [{
      uri: "google-ads://metrics",
      mimeType: "application/json",
      text: JSON.stringify(GOOGLE_ADS_METRIC_CATALOG.map(m => ({
        key: m.key, name: m.name, description: m.description,
        category: m.category, type: m.type, format: m.format,
        apiField: m.apiField,
      })), null, 2),
    }],
  }));

  server.resource("google-ads-dimensions", "google-ads://dimensions", async () => ({
    contents: [{
      uri: "google-ads://dimensions",
      mimeType: "application/json",
      text: JSON.stringify(GOOGLE_ADS_DIMENSION_CATALOG.map(d => ({
        key: d.key, name: d.name, description: d.description,
        category: d.category, apiField: d.apiField,
        isSegment: d.isSegment, isResourceAttribute: d.isResourceAttribute,
      })), null, 2),
    }],
  }));

  server.resource("google-ads-compatibility", "google-ads://compatibility", async () => ({
    contents: [{
      uri: "google-ads://compatibility",
      mimeType: "application/json",
      text: JSON.stringify({
        description: "Google Ads uses GAQL (SQL-like). The FROM clause determines the resource type. Some metrics are restricted to specific resources, and some segments are incompatible with certain metrics (especially impression_share).",
        resourceTypes: ["campaign", "ad_group", "ad_group_ad", "keyword_view", "search_term_view", "paid_organic_search_term_view", "shopping_performance_view", "shopping_product", "asset", "asset_group", "asset_group_asset", "asset_group_top_combination_view", "performance_max_placement_view", "campaign_simulation", "ad_group_simulation", "bidding_strategy_simulation"],
        queryFormat: "SELECT ... FROM resource WHERE ... ORDER BY ... LIMIT N",
      }, null, 2),
    }],
  }));
}
