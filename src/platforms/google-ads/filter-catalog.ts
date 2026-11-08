/**
 * google-ads-mcp-server: an open-source MCP server for the Google Ads API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
// ============================================
// GOOGLE ADS FILTER CATALOG
// Definitions for GAQL WHERE clause filters
// ============================================

import {
  GoogleAdsFilterDefinition,
  GoogleAdsFilterOperator,
} from "./types.js";

// ============================================
// FILTER CATALOG
// ============================================

export const GOOGLE_ADS_FILTER_CATALOG: GoogleAdsFilterDefinition[] = [
  // ========================================
  // CAMPAIGN STATUS FILTERS
  // ========================================
  {
    key: "campaignStatus",
    name: "Campaign Status",
    description: "Filter by campaign status",
    apiField: "campaign.status",
    operators: ["=", "!=", "IN", "NOT IN"],
    type: "enum",
    enumValues: ["ENABLED", "PAUSED", "REMOVED"],
    defaultOperator: "=",
    defaultValue: "ENABLED",
  },
  {
    key: "adGroupStatus",
    name: "Ad Group Status",
    description: "Filter by ad group status",
    apiField: "ad_group.status",
    operators: ["=", "!=", "IN", "NOT IN"],
    type: "enum",
    enumValues: ["ENABLED", "PAUSED", "REMOVED"],
    defaultOperator: "=",
    defaultValue: "ENABLED",
  },
  {
    key: "adStatus",
    name: "Ad Status",
    description: "Filter by ad status",
    apiField: "ad_group_ad.status",
    operators: ["=", "!=", "IN", "NOT IN"],
    type: "enum",
    enumValues: ["ENABLED", "PAUSED", "REMOVED"],
    defaultOperator: "=",
    defaultValue: "ENABLED",
  },

  // ========================================
  // CAMPAIGN TYPE FILTERS
  // ========================================
  {
    key: "channelType",
    name: "Campaign Type",
    description: "Filter by advertising channel type",
    apiField: "campaign.advertising_channel_type",
    operators: ["=", "!=", "IN", "NOT IN"],
    type: "enum",
    enumValues: [
      "SEARCH",
      "DISPLAY",
      "SHOPPING",
      "VIDEO",
      "MULTI_CHANNEL",
      "PERFORMANCE_MAX",
      "DEMAND_GEN",
      "TRAVEL",
      "LOCAL",
      "SMART",
      "LOCAL_SERVICES",
    ],
    defaultOperator: "=",
  },
  {
    key: "channelSubType",
    name: "Campaign Sub Type",
    description: "Filter by advertising channel sub type",
    apiField: "campaign.advertising_channel_sub_type",
    operators: ["=", "!=", "IN", "NOT IN"],
    type: "enum",
    enumValues: [
      "SEARCH_MOBILE_APP",
      "DISPLAY_MOBILE_APP",
      "SEARCH_EXPRESS",
      "DISPLAY_EXPRESS",
      "SHOPPING_SMART_ADS",
      "DISPLAY_GMAIL_AD",
      "DISPLAY_SMART_CAMPAIGN",
      "VIDEO_OUTSTREAM",
      "VIDEO_ACTION",
      "VIDEO_NON_SKIPPABLE",
      "VIDEO_REACH_TARGET_FREQUENCY",
      "APP_CAMPAIGN",
      "APP_CAMPAIGN_FOR_ENGAGEMENT",
      "LOCAL_CAMPAIGN",
      "SHOPPING_COMPARISON_LISTING_ADS",
      "SMART_CAMPAIGN",
      "VIDEO_SEQUENCE",
      "APP_CAMPAIGN_FOR_PRE_REGISTRATION",
      "TRAVEL_ACTIVITIES",
    ],
    defaultOperator: "=",
  },

  // ========================================
  // BIDDING STRATEGY FILTERS
  // ========================================
  {
    key: "biddingStrategyType",
    name: "Bidding Strategy Type",
    description: "Filter by bidding strategy type",
    apiField: "campaign.bidding_strategy_type",
    operators: ["=", "!=", "IN", "NOT IN"],
    type: "enum",
    enumValues: [
      "TARGET_CPA",
      "TARGET_ROAS",
      "MAXIMIZE_CONVERSIONS",
      "MAXIMIZE_CONVERSION_VALUE",
      "MANUAL_CPC",
      "MANUAL_CPM",
      "MANUAL_CPV",
      "ENHANCED_CPC",
      "TARGET_IMPRESSION_SHARE",
      "TARGET_SPEND",
    ],
    defaultOperator: "=",
  },

  // ========================================
  // METRIC FILTERS
  // ========================================
  {
    key: "impressionsGt",
    name: "Impressions >",
    description: "Filter rows with impressions greater than value",
    apiField: "metrics.impressions",
    operators: [">", ">=", "<", "<=", "="],
    type: "number",
    defaultOperator: ">",
    defaultValue: "0",
  },
  {
    key: "clicksGt",
    name: "Clicks >",
    description: "Filter rows with clicks greater than value",
    apiField: "metrics.clicks",
    operators: [">", ">=", "<", "<=", "="],
    type: "number",
    defaultOperator: ">",
    defaultValue: "0",
  },
  {
    key: "costGt",
    name: "Cost >",
    description: "Filter rows with cost greater than value (in micros)",
    apiField: "metrics.cost_micros",
    operators: [">", ">=", "<", "<=", "="],
    type: "number",
    defaultOperator: ">",
    defaultValue: "0",
  },
  {
    key: "conversionsGt",
    name: "Conversions >",
    description: "Filter rows with conversions greater than value",
    apiField: "metrics.conversions",
    operators: [">", ">=", "<", "<=", "="],
    type: "number",
    defaultOperator: ">",
    defaultValue: "0",
  },

  // ========================================
  // ENTITY NAME FILTERS
  // ========================================
  {
    key: "campaignName",
    name: "Campaign Name",
    description: "Filter by campaign name",
    apiField: "campaign.name",
    operators: ["=", "!=", "LIKE", "NOT LIKE", "CONTAINS ANY"],
    type: "string",
    defaultOperator: "LIKE",
  },
  {
    key: "adGroupName",
    name: "Ad Group Name",
    description: "Filter by ad group name",
    apiField: "ad_group.name",
    operators: ["=", "!=", "LIKE", "NOT LIKE", "CONTAINS ANY"],
    type: "string",
    defaultOperator: "LIKE",
  },

  // ========================================
  // KEYWORD FILTERS
  // ========================================
  {
    key: "keywordMatchType",
    name: "Keyword Match Type",
    description: "Filter by keyword match type",
    apiField: "ad_group_criterion.keyword.match_type",
    operators: ["=", "!=", "IN", "NOT IN"],
    type: "enum",
    enumValues: ["EXACT", "PHRASE", "BROAD"],
    defaultOperator: "=",
  },
  {
    key: "keywordText",
    name: "Keyword Text",
    description: "Filter by keyword text",
    apiField: "ad_group_criterion.keyword.text",
    operators: ["=", "!=", "LIKE", "NOT LIKE", "CONTAINS ANY"],
    type: "string",
    defaultOperator: "LIKE",
  },

  // ========================================
  // LABEL FILTERS
  // ========================================
  {
    key: "campaignLabels",
    name: "Campaign Labels",
    description: "Filter by campaign label resource names",
    apiField: "campaign.labels",
    operators: ["CONTAINS ANY", "CONTAINS ALL", "CONTAINS NONE"],
    type: "string",
    defaultOperator: "CONTAINS ANY",
  },

  // ========================================
  // CAMPAIGN ID FILTERS
  // ========================================
  {
    key: "campaignId",
    name: "Campaign ID",
    description: "Filter by specific campaign ID",
    apiField: "campaign.id",
    operators: ["=", "!=", "IN", "NOT IN"],
    type: "number",
    defaultOperator: "=",
  },
  {
    key: "adGroupId",
    name: "Ad Group ID",
    description: "Filter by specific ad group ID",
    apiField: "ad_group.id",
    operators: ["=", "!=", "IN", "NOT IN"],
    type: "number",
    defaultOperator: "=",
  },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

export function getGoogleAdsFilters(): GoogleAdsFilterDefinition[] {
  return GOOGLE_ADS_FILTER_CATALOG;
}

export function getGoogleAdsFilterByKey(key: string): GoogleAdsFilterDefinition | undefined {
  return GOOGLE_ADS_FILTER_CATALOG.find((f) => f.key === key);
}

/**
 * Build a GAQL WHERE clause fragment from a filter
 */
export function buildFilterClause(
  apiField: string,
  operator: GoogleAdsFilterOperator,
  value: string | string[] | number | number[]
): string {
  // Handle special operators
  if (operator === "IS NULL" || operator === "IS NOT NULL") {
    return `${apiField} ${operator}`;
  }

  if (operator === "DURING") {
    return `${apiField} DURING ${value}`;
  }

  if (operator === "BETWEEN") {
    if (Array.isArray(value) && value.length === 2) {
      return `${apiField} BETWEEN '${value[0]}' AND '${value[1]}'`;
    }
    return "";
  }

  // Handle IN/NOT IN operators
  if (operator === "IN" || operator === "NOT IN" || operator === "CONTAINS ANY" || operator === "CONTAINS ALL" || operator === "CONTAINS NONE") {
    const values = Array.isArray(value) ? value : [value];
    const formatted = values.map((v) =>
      typeof v === "number" ? String(v) : `'${v}'`
    );
    return `${apiField} ${operator} (${formatted.join(", ")})`;
  }

  // Handle LIKE/NOT LIKE
  if (operator === "LIKE" || operator === "NOT LIKE") {
    return `${apiField} ${operator} '%${value}%'`;
  }

  // Standard comparison
  if (typeof value === "number") {
    return `${apiField} ${operator} ${value}`;
  }

  // String enum values should be unquoted
  const enumFields = [
    "campaign.status",
    "ad_group.status",
    "ad_group_ad.status",
    "campaign.advertising_channel_type",
    "campaign.advertising_channel_sub_type",
    "campaign.bidding_strategy_type",
    "ad_group_criterion.keyword.match_type",
  ];

  if (enumFields.includes(apiField)) {
    return `${apiField} ${operator} '${value}'`;
  }

  return `${apiField} ${operator} '${value}'`;
}
