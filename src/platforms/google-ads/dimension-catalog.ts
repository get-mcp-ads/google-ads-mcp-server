/**
 * google-ads-mcp-server: an open-source MCP server for the Google Ads API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
// ============================================
// GOOGLE ADS DIMENSION CATALOG
// Complete catalog of Google Ads dimensions
// Including resource attributes and segments
// ============================================

import {
  GoogleAdsDimensionDefinition,
  GoogleAdsDimensionCategory,
} from "./types.js";

// ============================================
// ENTITY DIMENSIONS (Resource Attributes)
// These are fields on resources, NOT segments
// ============================================

const ENTITY_DIMENSIONS: GoogleAdsDimensionDefinition[] = [
  {
    key: "campaignId",
    name: "Campaign ID",
    description: "Unique identifier for the campaign",
    category: "entity",
    apiField: "campaign.id",
    isSegment: false,
    isResourceAttribute: true,
    compatibleResources: [
      "campaign",
      "ad_group",
      "ad_group_ad",
      "keyword_view",
      "search_term_view",
      "shopping_performance_view",
      "geographic_view",
      "user_location_view",
      "landing_page_view",
      "campaign_audience_view",
      "ad_group_audience_view",
      "campaign_criterion",
      "ad_group_criterion",
      "asset_group",
    ],
  },
  {
    key: "campaignName",
    name: "Campaign Name",
    description: "The name of the campaign",
    category: "entity",
    apiField: "campaign.name",
    isSegment: false,
    isResourceAttribute: true,
    compatibleResources: [
      "campaign",
      "ad_group",
      "ad_group_ad",
      "keyword_view",
      "search_term_view",
      "shopping_performance_view",
      "geographic_view",
      "user_location_view",
      "landing_page_view",
      "campaign_audience_view",
      "ad_group_audience_view",
      "campaign_criterion",
      "ad_group_criterion",
      "asset_group",
    ],
  },
  {
    key: "campaignStatus",
    name: "Campaign Status",
    description: "Current status of the campaign (ENABLED, PAUSED, REMOVED)",
    category: "entity",
    apiField: "campaign.status",
    isSegment: false,
    isResourceAttribute: true,
    possibleValues: ["ENABLED", "PAUSED", "REMOVED", "UNKNOWN", "UNSPECIFIED"],
    compatibleResources: [
      "campaign",
      "ad_group",
      "ad_group_ad",
      "keyword_view",
      "search_term_view",
      "shopping_performance_view",
    ],
  },
  {
    key: "campaignType",
    name: "Campaign Type",
    description:
      "The advertising channel type of the campaign (SEARCH, DISPLAY, SHOPPING, VIDEO, etc.)",
    category: "entity",
    apiField: "campaign.advertising_channel_type",
    isSegment: false,
    isResourceAttribute: true,
    possibleValues: [
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
      "UNKNOWN",
    ],
    compatibleResources: [
      "campaign",
      "ad_group",
      "ad_group_ad",
      "keyword_view",
      "search_term_view",
      "shopping_performance_view",
    ],
  },
  {
    key: "campaignSubType",
    name: "Campaign Sub Type",
    description: "The advertising channel sub type of the campaign",
    category: "entity",
    apiField: "campaign.advertising_channel_sub_type",
    isSegment: false,
    isResourceAttribute: true,
    compatibleResources: [
      "campaign",
      "ad_group",
      "ad_group_ad",
      "keyword_view",
      "search_term_view",
    ],
  },
  {
    key: "campaignBiddingStrategy",
    name: "Campaign Bidding Strategy",
    description:
      "The bidding strategy type used by the campaign (TARGET_CPA, MAXIMIZE_CONVERSIONS, etc.)",
    category: "bidding",
    apiField: "campaign.bidding_strategy_type",
    isSegment: false,
    isResourceAttribute: true,
    possibleValues: [
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
      "COMMISSION",
      "UNKNOWN",
    ],
    compatibleResources: ["campaign", "ad_group", "ad_group_ad"],
  },
  {
    key: "adGroupId",
    name: "Ad Group ID",
    description: "Unique identifier for the ad group",
    category: "entity",
    apiField: "ad_group.id",
    isSegment: false,
    isResourceAttribute: true,
    compatibleResources: [
      "ad_group",
      "ad_group_ad",
      "keyword_view",
      "search_term_view",
      "ad_group_audience_view",
      "ad_group_criterion",
    ],
  },
  {
    key: "adGroupName",
    name: "Ad Group Name",
    description: "The name of the ad group",
    category: "entity",
    apiField: "ad_group.name",
    isSegment: false,
    isResourceAttribute: true,
    compatibleResources: [
      "ad_group",
      "ad_group_ad",
      "keyword_view",
      "search_term_view",
      "ad_group_audience_view",
      "ad_group_criterion",
    ],
  },
  {
    key: "adGroupStatus",
    name: "Ad Group Status",
    description: "Current status of the ad group (ENABLED, PAUSED, REMOVED)",
    category: "entity",
    apiField: "ad_group.status",
    isSegment: false,
    isResourceAttribute: true,
    possibleValues: ["ENABLED", "PAUSED", "REMOVED", "UNKNOWN", "UNSPECIFIED"],
    compatibleResources: [
      "ad_group",
      "ad_group_ad",
      "keyword_view",
      "search_term_view",
      "ad_group_audience_view",
      "ad_group_criterion",
    ],
  },
  {
    key: "adId",
    name: "Ad ID",
    description: "Unique identifier for the ad",
    category: "entity",
    apiField: "ad_group_ad.ad.id",
    isSegment: false,
    isResourceAttribute: true,
    compatibleResources: ["ad_group_ad"],
  },
  {
    key: "adGroupAdAdId",
    name: "Ad Group Ad ID",
    description: "Alias for ad_group_ad.ad.id. Useful for agents that request fully-qualified ad_group_ad fields.",
    category: "entity",
    apiField: "ad_group_ad.ad.id",
    isSegment: false,
    isResourceAttribute: true,
    compatibleResources: ["ad_group_ad"],
  },
  {
    key: "adGroupAdAdName",
    name: "Ad Group Ad Name",
    description: "Alias for ad_group_ad.ad.name when available from the Google Ads API.",
    category: "entity",
    apiField: "ad_group_ad.ad.name",
    isSegment: false,
    isResourceAttribute: true,
    compatibleResources: ["ad_group_ad"],
  },
  {
    key: "adName",
    name: "Ad Name",
    description: "Ad name when available from ad_group_ad.ad.name.",
    category: "entity",
    apiField: "ad_group_ad.ad.name",
    isSegment: false,
    isResourceAttribute: true,
    compatibleResources: ["ad_group_ad"],
  },
  {
    key: "adType",
    name: "Ad Type",
    description:
      "The type of the ad (RESPONSIVE_SEARCH_AD, RESPONSIVE_DISPLAY_AD, VIDEO_AD, etc.)",
    category: "ad_format",
    apiField: "ad_group_ad.ad.type",
    isSegment: false,
    isResourceAttribute: true,
    possibleValues: [
      "RESPONSIVE_SEARCH_AD",
      "RESPONSIVE_DISPLAY_AD",
      "EXPANDED_TEXT_AD",
      "VIDEO_AD",
      "IMAGE_AD",
      "CALL_AD",
      "SHOPPING_PRODUCT_AD",
      "SHOPPING_SMART_AD",
      "APP_AD",
      "APP_ENGAGEMENT_AD",
      "DISCOVERY_MULTI_ASSET_AD",
      "DISCOVERY_CAROUSEL_AD",
      "UNKNOWN",
    ],
    compatibleResources: ["ad_group_ad"],
  },
  {
    key: "keywordText",
    name: "Keyword Text",
    description: "The text of the keyword criterion (e.g., 'polo ralph lauren')",
    category: "entity",
    apiField: "ad_group_criterion.keyword.text",
    isSegment: false,
    isResourceAttribute: true,
    compatibleResources: ["keyword_view", "ad_group_criterion"],
  },
  {
    key: "keywordMatchType",
    name: "Keyword Match Type",
    description: "The match type of the keyword (EXACT, PHRASE, BROAD)",
    category: "entity",
    apiField: "ad_group_criterion.keyword.match_type",
    isSegment: false,
    isResourceAttribute: true,
    possibleValues: ["EXACT", "PHRASE", "BROAD", "UNKNOWN", "UNSPECIFIED"],
    compatibleResources: ["keyword_view", "ad_group_criterion"],
  },
  {
    key: "qualityScore",
    name: "Quality Score",
    description: "The current quality score of the keyword (1-10). Only available on keyword_view.",
    category: "entity",
    apiField: "ad_group_criterion.quality_info.quality_score",
    isSegment: false,
    isResourceAttribute: true,
    compatibleResources: ["keyword_view", "ad_group_criterion"],
  },
  {
    key: "customerId",
    name: "Customer ID",
    description: "The Google Ads account (customer) ID",
    category: "entity",
    apiField: "customer.id",
    isSegment: false,
    isResourceAttribute: true,
    compatibleResources: [
      "customer",
      "campaign",
      "ad_group",
      "ad_group_ad",
      "keyword_view",
      "search_term_view",
    ],
  },
  {
    key: "customerName",
    name: "Customer Name",
    description: "The descriptive name of the Google Ads account",
    category: "entity",
    apiField: "customer.descriptive_name",
    isSegment: false,
    isResourceAttribute: true,
    compatibleResources: [
      "customer",
      "campaign",
      "ad_group",
      "ad_group_ad",
      "keyword_view",
      "search_term_view",
    ],
  },
];

// ============================================
// TIME SEGMENTS
// ============================================

const TIME_DIMENSIONS: GoogleAdsDimensionDefinition[] = [
  {
    key: "date",
    name: "Date",
    description: "The date of the data point (YYYY-MM-DD format)",
    category: "time",
    apiField: "segments.date",
    isSegment: true,
    isResourceAttribute: false,
  },
  {
    key: "dayOfWeek",
    name: "Day of Week",
    description: "The day of the week (MONDAY through SUNDAY)",
    category: "time",
    apiField: "segments.day_of_week",
    isSegment: true,
    isResourceAttribute: false,
    possibleValues: [
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
      "SUNDAY",
    ],
  },
  {
    key: "hour",
    name: "Hour of Day",
    description:
      "The hour of the day (0-23). Requires date segment to be present.",
    category: "time",
    apiField: "segments.hour",
    isSegment: true,
    isResourceAttribute: false,
    requiresSegment: "date",
    possibleValues: [
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
      "13",
      "14",
      "15",
      "16",
      "17",
      "18",
      "19",
      "20",
      "21",
      "22",
      "23",
    ],
  },
  {
    key: "month",
    name: "Month",
    description: "The month of the data point (YYYY-MM format)",
    category: "time",
    apiField: "segments.month",
    isSegment: true,
    isResourceAttribute: false,
  },
  {
    key: "week",
    name: "Week",
    description:
      "The week of the data point (date of the Monday of the week, YYYY-MM-DD format)",
    category: "time",
    apiField: "segments.week",
    isSegment: true,
    isResourceAttribute: false,
  },
  {
    key: "quarter",
    name: "Quarter",
    description:
      "The quarter of the data point (first day of the quarter, YYYY-MM-DD format)",
    category: "time",
    apiField: "segments.quarter",
    isSegment: true,
    isResourceAttribute: false,
  },
  {
    key: "year",
    name: "Year",
    description: "The year of the data point",
    category: "time",
    apiField: "segments.year",
    isSegment: true,
    isResourceAttribute: false,
  },
];

// ============================================
// DEVICE SEGMENTS
// ============================================

const DEVICE_DIMENSIONS: GoogleAdsDimensionDefinition[] = [
  {
    key: "device",
    name: "Device",
    description:
      "The device type where the impression or interaction occurred",
    category: "device",
    apiField: "segments.device",
    isSegment: true,
    isResourceAttribute: false,
    possibleValues: [
      "MOBILE",
      "DESKTOP",
      "TABLET",
      "CONNECTED_TV",
      "OTHER",
      "UNKNOWN",
      "UNSPECIFIED",
    ],
  },
  {
    key: "slot",
    name: "Ad Slot",
    description: "The position on the page where the ad was shown",
    category: "device",
    apiField: "segments.slot",
    isSegment: true,
    isResourceAttribute: false,
    possibleValues: [
      "SEARCH_TOP",
      "SEARCH_OTHER",
      "CONTENT",
      "MIXED",
      "UNSPECIFIED",
    ],
  },
];

// ============================================
// NETWORK SEGMENTS
// ============================================

const NETWORK_DIMENSIONS: GoogleAdsDimensionDefinition[] = [
  {
    key: "adNetworkType",
    name: "Ad Network Type",
    description:
      "The ad network where the impression was served (Search, Display, YouTube, etc.)",
    category: "network",
    apiField: "segments.ad_network_type",
    isSegment: true,
    isResourceAttribute: false,
    possibleValues: [
      "SEARCH",
      "SEARCH_PARTNERS",
      "CONTENT",
      "YOUTUBE_SEARCH",
      "YOUTUBE_WATCH",
      "MIXED",
      "CROSS_NETWORK",
      "UNKNOWN",
      "UNSPECIFIED",
    ],
  },
];

// ============================================
// CONVERSION SEGMENTS
// ============================================

const CONVERSION_DIMENSIONS: GoogleAdsDimensionDefinition[] = [
  {
    key: "conversionAction",
    name: "Conversion Action",
    description:
      "The conversion action resource name. Segments data by individual conversion actions. Incompatible with many impression share metrics.",
    category: "conversion",
    apiField: "segments.conversion_action",
    isSegment: true,
    isResourceAttribute: false,
    incompatibleWith: [
      "searchImpressionShare",
      "searchBudgetLostImpressionShare",
      "searchRankLostImpressionShare",
      "searchTopImpressionShare",
      "searchAbsoluteTopImpressionShare",
      "searchExactMatchImpressionShare",
      "contentImpressionShare",
      "contentBudgetLostImpressionShare",
      "contentRankLostImpressionShare",
    ],
  },
  {
    key: "conversionActionName",
    name: "Conversion Action Name",
    description: "The human-readable name of the conversion action",
    category: "conversion",
    apiField: "segments.conversion_action_name",
    isSegment: true,
    isResourceAttribute: false,
    incompatibleWith: [
      "searchImpressionShare",
      "searchBudgetLostImpressionShare",
      "searchRankLostImpressionShare",
      "searchTopImpressionShare",
      "searchAbsoluteTopImpressionShare",
      "searchExactMatchImpressionShare",
      "contentImpressionShare",
      "contentBudgetLostImpressionShare",
      "contentRankLostImpressionShare",
    ],
  },
  {
    key: "conversionActionCategory",
    name: "Conversion Action Category",
    description:
      "The category of the conversion action (PURCHASE, LEAD, SIGNUP, etc.)",
    category: "conversion",
    apiField: "segments.conversion_action_category",
    isSegment: true,
    isResourceAttribute: false,
    incompatibleWith: [
      "searchImpressionShare",
      "searchBudgetLostImpressionShare",
      "searchRankLostImpressionShare",
      "searchTopImpressionShare",
      "searchAbsoluteTopImpressionShare",
      "searchExactMatchImpressionShare",
      "contentImpressionShare",
      "contentBudgetLostImpressionShare",
      "contentRankLostImpressionShare",
    ],
  },
  {
    key: "externalConversionSource",
    name: "External Conversion Source",
    description:
      "The external source of the conversion (GOOGLE_ANALYTICS, FIREBASE, UPLOAD, etc.)",
    category: "conversion",
    apiField: "segments.external_conversion_source",
    isSegment: true,
    isResourceAttribute: false,
    incompatibleWith: [
      "searchImpressionShare",
      "searchBudgetLostImpressionShare",
      "searchRankLostImpressionShare",
      "searchTopImpressionShare",
      "searchAbsoluteTopImpressionShare",
      "searchExactMatchImpressionShare",
      "contentImpressionShare",
      "contentBudgetLostImpressionShare",
      "contentRankLostImpressionShare",
    ],
  },
];

// ============================================
// DEMOGRAPHIC SEGMENTS
// ============================================

const DEMOGRAPHIC_DIMENSIONS: GoogleAdsDimensionDefinition[] = [
  {
    key: "ageRange",
    name: "Age Range",
    description: "The age range of the user who saw or interacted with the ad",
    category: "demographic",
    apiField: "segments.age_range",
    isSegment: true,
    isResourceAttribute: false,
    possibleValues: [
      "AGE_RANGE_18_24",
      "AGE_RANGE_25_34",
      "AGE_RANGE_35_44",
      "AGE_RANGE_45_54",
      "AGE_RANGE_55_64",
      "AGE_RANGE_65_UP",
      "AGE_RANGE_UNDETERMINED",
      "UNKNOWN",
      "UNSPECIFIED",
    ],
  },
  {
    key: "gender",
    name: "Gender",
    description: "The gender of the user who saw or interacted with the ad",
    category: "demographic",
    apiField: "segments.gender",
    isSegment: true,
    isResourceAttribute: false,
    possibleValues: ["MALE", "FEMALE", "UNDETERMINED", "UNKNOWN", "UNSPECIFIED"],
  },
];

// ============================================
// GEOGRAPHIC SEGMENTS
// ============================================

const GEOGRAPHIC_DIMENSIONS: GoogleAdsDimensionDefinition[] = [
  {
    key: "geoTargetCountry",
    name: "Geo Target Country",
    description:
      "The country geo target constant resource name for geographic segmentation",
    category: "geographic",
    apiField: "segments.geo_target_country",
    isSegment: true,
    isResourceAttribute: false,
  },
  {
    key: "geoTargetRegion",
    name: "Geo Target Region",
    description:
      "The region (state/province) geo target constant resource name for geographic segmentation",
    category: "geographic",
    apiField: "segments.geo_target_region",
    isSegment: true,
    isResourceAttribute: false,
  },
  {
    key: "geoTargetMetro",
    name: "Geo Target Metro",
    description:
      "The metro area (DMA) geo target constant resource name for geographic segmentation",
    category: "geographic",
    apiField: "segments.geo_target_metro",
    isSegment: true,
    isResourceAttribute: false,
  },
];

// ============================================
// CAMPAIGN TYPE ATTRIBUTES
// ============================================

const CAMPAIGN_TYPE_DIMENSIONS: GoogleAdsDimensionDefinition[] = [
  {
    key: "advertisingChannelType",
    name: "Advertising Channel Type",
    description:
      "The advertising channel type of the campaign (SEARCH, SHOPPING, PERFORMANCE_MAX, etc.). Alias for campaignType.",
    category: "campaign_type",
    apiField: "campaign.advertising_channel_type",
    isSegment: false,
    isResourceAttribute: true,
    possibleValues: [
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
      "UNKNOWN",
    ],
  },
  {
    key: "advertisingChannelSubType",
    name: "Advertising Channel Sub Type",
    description:
      "The advertising channel sub type of the campaign. Alias for campaignSubType.",
    category: "campaign_type",
    apiField: "campaign.advertising_channel_sub_type",
    isSegment: false,
    isResourceAttribute: true,
  },
];

// ============================================
// SHOPPING / PRODUCT DIMENSIONS (Segments)
// Available on shopping_performance_view
// ============================================

const SHOPPING_DIMENSIONS: GoogleAdsDimensionDefinition[] = [
  {
    key: "productItemId",
    name: "Product Item ID (SKU)",
    description: "The Merchant Center Item ID (SKU) of the product",
    category: "shopping",
    apiField: "segments.product_item_id",
    isSegment: true,
    isResourceAttribute: false,
    compatibleResources: ["shopping_performance_view", "asset_group_listing_group_filter"],
  },
  {
    key: "productBrand",
    name: "Product Brand",
    description: "The brand of the product from the Merchant Center feed",
    category: "shopping",
    apiField: "segments.product_brand",
    isSegment: true,
    isResourceAttribute: false,
    compatibleResources: ["shopping_performance_view", "asset_group_listing_group_filter"],
  },
  {
    key: "productTitle",
    name: "Product Title",
    description: "The title of the product from the Merchant Center feed",
    category: "shopping",
    apiField: "segments.product_title",
    isSegment: true,
    isResourceAttribute: false,
    compatibleResources: ["shopping_performance_view"],
  },
  {
    key: "productCategoryLevel1",
    name: "Product Category (L1)",
    description: "Google product taxonomy level 1 (e.g., Apparel & Accessories)",
    category: "shopping",
    apiField: "segments.product_category_level1",
    isSegment: true,
    isResourceAttribute: false,
    compatibleResources: ["shopping_performance_view", "asset_group_listing_group_filter"],
  },
  {
    key: "productCategoryLevel2",
    name: "Product Category (L2)",
    description: "Google product taxonomy level 2",
    category: "shopping",
    apiField: "segments.product_category_level2",
    isSegment: true,
    isResourceAttribute: false,
    compatibleResources: ["shopping_performance_view", "asset_group_listing_group_filter"],
  },
  {
    key: "productCategoryLevel3",
    name: "Product Category (L3)",
    description: "Google product taxonomy level 3",
    category: "shopping",
    apiField: "segments.product_category_level3",
    isSegment: true,
    isResourceAttribute: false,
    compatibleResources: ["shopping_performance_view", "asset_group_listing_group_filter"],
  },
  {
    key: "productCategoryLevel4",
    name: "Product Category (L4)",
    description: "Google product taxonomy level 4",
    category: "shopping",
    apiField: "segments.product_category_level4",
    isSegment: true,
    isResourceAttribute: false,
    compatibleResources: ["shopping_performance_view", "asset_group_listing_group_filter"],
  },
  {
    key: "productCategoryLevel5",
    name: "Product Category (L5)",
    description: "Google product taxonomy level 5",
    category: "shopping",
    apiField: "segments.product_category_level5",
    isSegment: true,
    isResourceAttribute: false,
    compatibleResources: ["shopping_performance_view", "asset_group_listing_group_filter"],
  },
  {
    key: "productTypeL1",
    name: "Product Type (L1)",
    description: "Merchant-defined product type level 1",
    category: "shopping",
    apiField: "segments.product_type_l1",
    isSegment: true,
    isResourceAttribute: false,
    compatibleResources: ["shopping_performance_view", "asset_group_listing_group_filter"],
  },
  {
    key: "productTypeL2",
    name: "Product Type (L2)",
    description: "Merchant-defined product type level 2",
    category: "shopping",
    apiField: "segments.product_type_l2",
    isSegment: true,
    isResourceAttribute: false,
    compatibleResources: ["shopping_performance_view", "asset_group_listing_group_filter"],
  },
  {
    key: "productTypeL3",
    name: "Product Type (L3)",
    description: "Merchant-defined product type level 3",
    category: "shopping",
    apiField: "segments.product_type_l3",
    isSegment: true,
    isResourceAttribute: false,
    compatibleResources: ["shopping_performance_view", "asset_group_listing_group_filter"],
  },
  {
    key: "productTypeL4",
    name: "Product Type (L4)",
    description: "Merchant-defined product type level 4",
    category: "shopping",
    apiField: "segments.product_type_l4",
    isSegment: true,
    isResourceAttribute: false,
    compatibleResources: ["shopping_performance_view", "asset_group_listing_group_filter"],
  },
  {
    key: "productTypeL5",
    name: "Product Type (L5)",
    description: "Merchant-defined product type level 5",
    category: "shopping",
    apiField: "segments.product_type_l5",
    isSegment: true,
    isResourceAttribute: false,
    compatibleResources: ["shopping_performance_view", "asset_group_listing_group_filter"],
  },
  {
    key: "productCustomAttribute0",
    name: "Custom Label 0",
    description: "Custom label 0 from Merchant Center feed",
    category: "shopping",
    apiField: "segments.product_custom_attribute0",
    isSegment: true,
    isResourceAttribute: false,
    compatibleResources: ["shopping_performance_view", "asset_group_listing_group_filter"],
  },
  {
    key: "productCustomAttribute1",
    name: "Custom Label 1",
    description: "Custom label 1 from Merchant Center feed",
    category: "shopping",
    apiField: "segments.product_custom_attribute1",
    isSegment: true,
    isResourceAttribute: false,
    compatibleResources: ["shopping_performance_view", "asset_group_listing_group_filter"],
  },
  {
    key: "productCustomAttribute2",
    name: "Custom Label 2",
    description: "Custom label 2 from Merchant Center feed",
    category: "shopping",
    apiField: "segments.product_custom_attribute2",
    isSegment: true,
    isResourceAttribute: false,
    compatibleResources: ["shopping_performance_view", "asset_group_listing_group_filter"],
  },
  {
    key: "productCustomAttribute3",
    name: "Custom Label 3",
    description: "Custom label 3 from Merchant Center feed",
    category: "shopping",
    apiField: "segments.product_custom_attribute3",
    isSegment: true,
    isResourceAttribute: false,
    compatibleResources: ["shopping_performance_view", "asset_group_listing_group_filter"],
  },
  {
    key: "productCustomAttribute4",
    name: "Custom Label 4",
    description: "Custom label 4 from Merchant Center feed",
    category: "shopping",
    apiField: "segments.product_custom_attribute4",
    isSegment: true,
    isResourceAttribute: false,
    compatibleResources: ["shopping_performance_view", "asset_group_listing_group_filter"],
  },
  {
    key: "productChannel",
    name: "Product Channel",
    description: "Whether the product is sold online or locally",
    category: "shopping",
    apiField: "segments.product_channel",
    isSegment: true,
    isResourceAttribute: false,
    compatibleResources: ["shopping_performance_view"],
    possibleValues: ["ONLINE", "LOCAL"],
  },
  {
    key: "productChannelExclusivity",
    name: "Product Channel Exclusivity",
    description: "Whether the product is sold exclusively in one channel",
    category: "shopping",
    apiField: "segments.product_channel_exclusivity",
    isSegment: true,
    isResourceAttribute: false,
    compatibleResources: ["shopping_performance_view"],
    possibleValues: ["SINGLE_CHANNEL", "MULTI_CHANNEL"],
  },
  {
    key: "productCondition",
    name: "Product Condition",
    description: "Condition of the product from the feed",
    category: "shopping",
    apiField: "segments.product_condition",
    isSegment: true,
    isResourceAttribute: false,
    compatibleResources: ["shopping_performance_view"],
    possibleValues: ["NEW", "REFURBISHED", "USED"],
  },
  {
    key: "productCountry",
    name: "Product Country",
    description: "The target country of the product in the Merchant Center feed",
    category: "shopping",
    apiField: "segments.product_country",
    isSegment: true,
    isResourceAttribute: false,
    compatibleResources: ["shopping_performance_view"],
  },
  {
    key: "productLanguage",
    name: "Product Language",
    description: "The language of the product listing",
    category: "shopping",
    apiField: "segments.product_language",
    isSegment: true,
    isResourceAttribute: false,
    compatibleResources: ["shopping_performance_view"],
  },
  {
    key: "productStoreId",
    name: "Product Store ID",
    description: "The store ID for Local Inventory Ads",
    category: "shopping",
    apiField: "segments.product_store_id",
    isSegment: true,
    isResourceAttribute: false,
    compatibleResources: ["shopping_performance_view"],
  },
  {
    key: "productAggregatorId",
    name: "Product Aggregator ID",
    description: "The aggregator ID of the product (for multi-client accounts)",
    category: "shopping",
    apiField: "segments.product_aggregator_id",
    isSegment: true,
    isResourceAttribute: false,
    compatibleResources: ["shopping_performance_view"],
  },
  {
    key: "productMerchantId",
    name: "Product Merchant ID",
    description: "The Merchant Center ID of the product",
    category: "shopping",
    apiField: "segments.product_merchant_id",
    isSegment: true,
    isResourceAttribute: false,
    compatibleResources: ["shopping_performance_view"],
  },
];

// ============================================
// BUDGET DIMENSIONS (campaign_budget resource attributes)
// ============================================

const BUDGET_DIMENSIONS: GoogleAdsDimensionDefinition[] = [
  {
    key: "campaignBudgetAmount",
    name: "Daily Budget",
    description: "Daily budget amount in micro-currency (divide by 1,000,000 for standard currency). Shows the configured daily budget.",
    category: "budget",
    apiField: "campaign_budget.amount_micros",
    isSegment: false,
    isResourceAttribute: true,
    compatibleResources: ["campaign", "campaign_budget"],
  },
  {
    key: "campaignBudgetTotal",
    name: "Total Budget (Lifetime)",
    description: "Total lifetime budget in micro-currency. Only set for campaigns with lifetime budgets (period = CUSTOM_PERIOD).",
    category: "budget",
    apiField: "campaign_budget.total_amount_micros",
    isSegment: false,
    isResourceAttribute: true,
    compatibleResources: ["campaign", "campaign_budget"],
  },
  {
    key: "campaignBudgetPeriod",
    name: "Budget Period",
    description: "Whether the budget is daily or lifetime (DAILY or CUSTOM_PERIOD)",
    category: "budget",
    apiField: "campaign_budget.period",
    isSegment: false,
    isResourceAttribute: true,
    possibleValues: ["DAILY", "CUSTOM_PERIOD", "UNKNOWN", "UNSPECIFIED"],
    compatibleResources: ["campaign", "campaign_budget"],
  },
  {
    key: "campaignBudgetDeliveryMethod",
    name: "Budget Delivery Method",
    description: "How the budget is spent across the day (STANDARD or ACCELERATED)",
    category: "budget",
    apiField: "campaign_budget.delivery_method",
    isSegment: false,
    isResourceAttribute: true,
    possibleValues: ["STANDARD", "ACCELERATED", "UNKNOWN", "UNSPECIFIED"],
    compatibleResources: ["campaign", "campaign_budget"],
  },
  {
    key: "campaignBudgetExplicitlyShared",
    name: "Budget Shared",
    description: "Whether this budget is shared across multiple campaigns",
    category: "budget",
    apiField: "campaign_budget.explicitly_shared",
    isSegment: false,
    isResourceAttribute: true,
    compatibleResources: ["campaign", "campaign_budget"],
  },
];

// ============================================
// BIDDING TARGET DIMENSIONS (campaign resource attributes)
// ============================================

const BIDDING_TARGET_DIMENSIONS: GoogleAdsDimensionDefinition[] = [
  {
    key: "campaignTargetRoas",
    name: "Target ROAS",
    description: "Target return on ad spend value. Set when using TARGET_ROAS or MAXIMIZE_CONVERSION_VALUE with target ROAS.",
    category: "bidding",
    apiField: "campaign.target_roas.target_roas",
    isSegment: false,
    isResourceAttribute: true,
    compatibleResources: ["campaign"],
  },
  {
    key: "campaignMaximizeConversionValueTargetRoas",
    name: "Max Conv. Value Target ROAS",
    description: "Target ROAS for MAXIMIZE_CONVERSION_VALUE bidding strategy.",
    category: "bidding",
    apiField: "campaign.maximize_conversion_value.target_roas",
    isSegment: false,
    isResourceAttribute: true,
    compatibleResources: ["campaign"],
  },
  {
    key: "campaignTargetCpaMicros",
    name: "Target CPA",
    description: "Target cost-per-acquisition in micro-currency. Set when using TARGET_CPA bidding strategy.",
    category: "bidding",
    apiField: "campaign.target_cpa.target_cpa_micros",
    isSegment: false,
    isResourceAttribute: true,
    compatibleResources: ["campaign"],
  },
  {
    key: "campaignMaximizeConversionsTargetCpaMicros",
    name: "Max Conv. Target CPA",
    description: "Optional target CPA for MAXIMIZE_CONVERSIONS bidding strategy in micro-currency.",
    category: "bidding",
    apiField: "campaign.maximize_conversions.target_cpa_micros",
    isSegment: false,
    isResourceAttribute: true,
    compatibleResources: ["campaign"],
  },
  {
    key: "campaignTargetImpressionShareLocation",
    name: "Target IS Location",
    description: "Where to target impressions for TARGET_IMPRESSION_SHARE strategy (ANYWHERE_ON_PAGE, TOP_OF_PAGE, ABSOLUTE_TOP_OF_PAGE).",
    category: "bidding",
    apiField: "campaign.target_impression_share.location",
    isSegment: false,
    isResourceAttribute: true,
    possibleValues: ["ANYWHERE_ON_PAGE", "TOP_OF_PAGE", "ABSOLUTE_TOP_OF_PAGE", "UNKNOWN", "UNSPECIFIED"],
    compatibleResources: ["campaign"],
  },
  {
    key: "campaignTargetImpressionShareFraction",
    name: "Target IS Fraction",
    description: "Target percentage of impressions for TARGET_IMPRESSION_SHARE (in micros, divide by 1,000,000).",
    category: "bidding",
    apiField: "campaign.target_impression_share.location_fraction_micros",
    isSegment: false,
    isResourceAttribute: true,
    compatibleResources: ["campaign"],
  },
  {
    key: "campaignTargetImpressionShareCpcCeiling",
    name: "Target IS CPC Ceiling",
    description: "Maximum CPC bid ceiling for TARGET_IMPRESSION_SHARE in micro-currency.",
    category: "bidding",
    apiField: "campaign.target_impression_share.cpc_bid_ceiling_micros",
    isSegment: false,
    isResourceAttribute: true,
    compatibleResources: ["campaign"],
  },
  {
    key: "campaignOptimizationScore",
    name: "Optimization Score",
    description: "Campaign optimization score between 0 and 1 (multiply by 100 for percentage).",
    category: "bidding",
    apiField: "campaign.optimization_score",
    isSegment: false,
    isResourceAttribute: true,
    compatibleResources: ["campaign"],
  },
  {
    key: "campaignStartDate",
    name: "Campaign Start Date",
    description: "The start date and time of the campaign in the account time zone (YYYY-MM-DD HH:mm:ss).",
    category: "entity",
    apiField: "campaign.start_date_time",
    isSegment: false,
    isResourceAttribute: true,
    compatibleResources: ["campaign"],
  },
  {
    key: "campaignEndDate",
    name: "Campaign End Date",
    description: "The end date and time of the campaign in the account time zone (YYYY-MM-DD HH:mm:ss), if set.",
    category: "entity",
    apiField: "campaign.end_date_time",
    isSegment: false,
    isResourceAttribute: true,
    compatibleResources: ["campaign"],
  },
];

// ============================================
// INTERACTION DIMENSIONS (click_type, etc.)
// ============================================

const INTERACTION_DIMENSIONS: GoogleAdsDimensionDefinition[] = [
  {
    key: "clickType",
    name: "Click Type",
    description: "Type of click (headline, sitelink, call, etc.)",
    category: "interaction",
    apiField: "segments.click_type",
    isSegment: true,
    isResourceAttribute: false,
    incompatibleWith: [
      "conversionAction",
      "conversionActionName",
      "conversionActionCategory",
      "externalConversionSource",
    ],
    possibleValues: [
      "URL_CLICKS",
      "CALLS",
      "APP_DEEP_LINK",
      "WEBSITE",
      "PRODUCT_LISTING_AD_CLICKS",
      "SITELINKS",
      "GET_DIRECTIONS",
      "OFFER_PRINTS",
      "BREADCRUMBS",
      "CALL_TRACKING",
      "MOBILE_CALL_TRACKING",
      "LOCATION_EXPANSION",
      "STORE_LOCATOR",
      "VIDEO_WEBSITE_CLICKS",
      "VIDEO_CALL_TO_ACTION_CLICKS",
      "VIDEO_APP_STORE_CLICKS",
      "VIDEO_CARD_ACTION_HEADLINE_CLICKS",
      "VIDEO_END_CAP_CLICKS",
    ],
  },
  {
    key: "adDestinationType",
    name: "Ad Destination Type",
    description: "The destination type that users interact with",
    category: "interaction",
    apiField: "segments.ad_destination_type",
    isSegment: true,
    isResourceAttribute: false,
  },
  {
    key: "interactionOnThisExtension",
    name: "Interaction on This Extension",
    description: "Whether the interaction happened on this specific extension vs. the ad itself",
    category: "interaction",
    apiField: "segments.interaction_on_this_extension",
    isSegment: true,
    isResourceAttribute: false,
  },
];

// ============================================
// COMBINE ALL DIMENSIONS
// ============================================

// ============================================
// SEARCH LIFT (API v26, FROM lift_measurement_config only)
// ============================================

const SEARCH_LIFT_DIMENSIONS: GoogleAdsDimensionDefinition[] = [
  {
    key: "liftMeasurementConfigId",
    name: "Lift Study ID",
    description: "ID of the lift measurement configuration (lift study)",
    category: "entity",
    apiField: "lift_measurement_config.lift_measurement_config_id",
    isSegment: false,
    isResourceAttribute: true,
    compatibleResources: ["lift_measurement_config"],
  },
  {
    key: "liftMeasurementConfigName",
    name: "Lift Study Name",
    description: "Name of the lift study",
    category: "entity",
    apiField: "lift_measurement_config.name",
    isSegment: false,
    isResourceAttribute: true,
    compatibleResources: ["lift_measurement_config"],
  },
  {
    key: "searchLiftKeywordBundle",
    name: "Search Lift Keyword Bundle",
    description: "Resource name of the keyword bundle measured in a Search Lift study",
    category: "entity",
    apiField: "segments.search_lift_keyword_bundle",
    isSegment: true,
    isResourceAttribute: false,
    compatibleResources: ["lift_measurement_config"],
  },
  {
    key: "searchProperty",
    name: "Search Property",
    description: "Search property where the measured search happened",
    category: "network",
    apiField: "segments.search_property",
    isSegment: true,
    isResourceAttribute: false,
    compatibleResources: ["lift_measurement_config"],
    incompatibleWith: ["segments.age_range", "segments.device", "segments.gender"],
    possibleValues: ["GOOGLE_SEARCH", "YOUTUBE", "UNKNOWN", "UNSPECIFIED"],
  },
];

export const GOOGLE_ADS_DIMENSION_CATALOG: GoogleAdsDimensionDefinition[] = [
  ...ENTITY_DIMENSIONS,
  ...TIME_DIMENSIONS,
  ...DEVICE_DIMENSIONS,
  ...NETWORK_DIMENSIONS,
  ...CONVERSION_DIMENSIONS,
  ...DEMOGRAPHIC_DIMENSIONS,
  ...GEOGRAPHIC_DIMENSIONS,
  ...CAMPAIGN_TYPE_DIMENSIONS,
  ...BUDGET_DIMENSIONS,
  ...BIDDING_TARGET_DIMENSIONS,
  ...SHOPPING_DIMENSIONS,
  ...INTERACTION_DIMENSIONS,
  ...SEARCH_LIFT_DIMENSIONS,
];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get all Google Ads dimensions
 */
export function getGoogleAdsDimensions(): GoogleAdsDimensionDefinition[] {
  return GOOGLE_ADS_DIMENSION_CATALOG;
}

/**
 * Get dimension definition by key
 */
export function getGoogleAdsDimensionByKey(
  key: string
): GoogleAdsDimensionDefinition | undefined {
  return GOOGLE_ADS_DIMENSION_CATALOG.find((d) => d.key === key);
}

/**
 * Get dimensions by category
 */
export function getGoogleAdsDimensionsByCategory(
  category: GoogleAdsDimensionCategory
): GoogleAdsDimensionDefinition[] {
  return GOOGLE_ADS_DIMENSION_CATALOG.filter((d) => d.category === category);
}

/**
 * Get only segment dimensions (isSegment=true)
 */
export function getGoogleAdsSegments(): GoogleAdsDimensionDefinition[] {
  return GOOGLE_ADS_DIMENSION_CATALOG.filter((d) => d.isSegment === true);
}

/**
 * Get only resource attribute dimensions (isResourceAttribute=true)
 */
export function getGoogleAdsResourceAttributes(): GoogleAdsDimensionDefinition[] {
  return GOOGLE_ADS_DIMENSION_CATALOG.filter(
    (d) => d.isResourceAttribute === true
  );
}

/**
 * Convert dimension keys to their corresponding GAQL API fields
 */
export function googleAdsDimensionKeysToApiFields(keys: string[]): string[] {
  return keys
    .map((key) => {
      const dimension = getGoogleAdsDimensionByKey(key);
      return dimension?.apiField || null;
    })
    .filter((field): field is string => field !== null);
}

export default GOOGLE_ADS_DIMENSION_CATALOG;
