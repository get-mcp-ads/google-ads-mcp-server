/**
 * google-ads-mcp-server: an open-source MCP server for the Google Ads API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
// ============================================
// GOOGLE ADS API v26 TYPES FOR MCP SERVER
// Complete TypeScript interfaces for Google Ads integration
// Type definitions for the Google Ads API surface used by this server
// ============================================

// ============================================
// CORE ENUMS & TYPE ALIASES
// ============================================

/**
 * GAQL FROM resource types
 */
export type GoogleAdsResourceType =
  // Core
  | "campaign"
  | "ad_group"
  | "ad_group_ad"
  | "customer"
  // Search
  | "keyword_view"
  | "search_term_view"
  | "dynamic_search_ads_search_term_view"
  // Shopping
  | "shopping_performance_view"
  | "shopping_product"
  // PMax
  | "asset_group"
  | "asset_group_asset"
  | "asset_group_listing_group_filter"
  | "asset_group_product_group_view"
  | "asset_group_signal"
  | "asset_group_top_combination_view"
  | "campaign_search_term_insight"
  // Display & Placement
  | "detail_placement_view"
  | "performance_max_placement_view"
  | "topic_view"
  | "display_keyword_view"
  | "managed_placement_view"
  // Video
  | "video"
  // Geographic
  | "geographic_view"
  | "user_location_view"
  // Landing Pages
  | "landing_page_view"
  | "expanded_landing_page_view"
  // Audience
  | "campaign_audience_view"
  | "ad_group_audience_view"
  | "age_range_view"
  | "gender_view"
  | "parental_status_view"
  | "income_range_view"
  // Criterion & Targeting
  | "campaign_criterion"
  | "ad_group_criterion"
  // Assets & Creative
  | "ad_group_ad_asset_view"
  | "campaign_asset"
  | "ad_group_asset"
  // Budget & Bidding
  | "campaign_budget"
  | "bidding_strategy"
  | "campaign_simulation"
  | "ad_group_simulation"
  | "bidding_strategy_simulation"
  // Conversion & Tracking
  | "conversion_action"
  // Account & Organization
  | "change_event"
  | "change_status"
  | "label"
  | "paid_organic_search_term_view"
  | "experiment"
  // Measurement (API v26 Search Lift)
  | "lift_measurement_config";

/**
 * Metric categories for organization
 */
export type GoogleAdsMetricCategory =
  | "core"
  | "spend"
  | "conversion"
  | "impression_share"
  | "video"
  | "engagement"
  | "shopping"
  | "competitive"
  | "quality"
  | "cross_device"
  | "invalid_traffic"
  | "search_lift"
  | "calculated";

/**
 * Dimension categories
 */
export type GoogleAdsDimensionCategory =
  | "entity"
  | "time"
  | "device"
  | "network"
  | "conversion"
  | "demographic"
  | "geographic"
  | "campaign_type"
  | "bidding"
  | "budget"
  | "ad_format"
  | "shopping"
  | "interaction";

/**
 * Metric format types for display
 */
export type GoogleAdsMetricFormat =
  | "number"
  | "currency"
  | "micro_currency"
  | "percentage"
  | "ratio"
  | "string"
  | "duration"
  | "enum";

/**
 * Filter operator types for GAQL WHERE
 */
export type GoogleAdsFilterOperator =
  | "="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "IN"
  | "NOT IN"
  | "LIKE"
  | "NOT LIKE"
  | "CONTAINS ANY"
  | "CONTAINS ALL"
  | "CONTAINS NONE"
  | "IS NULL"
  | "IS NOT NULL"
  | "BETWEEN"
  | "DURING";

/**
 * Date presets for GAQL DURING clause
 */
export type GoogleAdsDatePreset =
  | "TODAY"
  | "YESTERDAY"
  | "LAST_7_DAYS"
  | "LAST_14_DAYS"
  | "LAST_30_DAYS"
  | "LAST_BUSINESS_WEEK"
  | "THIS_WEEK_MON_TODAY"
  | "THIS_WEEK_SUN_TODAY"
  | "LAST_WEEK_MON_SUN"
  | "LAST_WEEK_SUN_SAT"
  | "THIS_MONTH"
  | "LAST_MONTH"
  | "THIS_QUARTER"
  | "LAST_QUARTER"
  | "LAST_90_DAYS";

/**
 * Campaign status enum
 */
export type GoogleAdsCampaignStatus = "ENABLED" | "PAUSED" | "REMOVED" | "UNKNOWN" | "UNSPECIFIED";

/**
 * Campaign types (advertising channel)
 */
export type GoogleAdsChannelType =
  | "SEARCH"
  | "DISPLAY"
  | "SHOPPING"
  | "VIDEO"
  | "MULTI_CHANNEL"
  | "PERFORMANCE_MAX"
  | "DEMAND_GEN"
  | "TRAVEL"
  | "LOCAL"
  | "SMART"
  | "LOCAL_SERVICES"
  | "UNKNOWN";

/**
 * Bidding strategy types
 */
export type GoogleAdsBiddingStrategyType =
  | "TARGET_CPA"
  | "TARGET_ROAS"
  | "MAXIMIZE_CONVERSIONS"
  | "MAXIMIZE_CONVERSION_VALUE"
  | "MANUAL_CPC"
  | "MANUAL_CPM"
  | "MANUAL_CPV"
  | "ENHANCED_CPC"
  | "TARGET_IMPRESSION_SHARE"
  | "TARGET_SPEND"
  | "COMMISSION"
  | "UNKNOWN";

// ============================================
// AUTHENTICATION TYPES
// ============================================

export interface GoogleAdsApiConfig {
  accessToken: string;
  developerToken: string;
  loginCustomerId?: string;
}

// ============================================
// CUSTOMER (ACCOUNT) TYPES
// ============================================

export interface GoogleAdsCustomer {
  id: string;
  descriptiveName: string;
  currencyCode: string;
  timeZone: string;
  manager: boolean;
  testAccount: boolean;
  resourceName: string;
}

export interface GoogleAdsCustomerListResponse {
  resourceNames: string[];
}

// ============================================
// GAQL RESPONSE TYPES
// ============================================

/**
 * Raw API row - deeply nested
 */
export interface GoogleAdsRow {
  campaign?: {
    resourceName?: string;
    id?: string;
    name?: string;
    status?: string;
    advertisingChannelType?: string;
    advertisingChannelSubType?: string;
    biddingStrategyType?: string;
    campaignBudget?: string;
    startDate?: string;
    endDate?: string;
    labels?: string[];
    [key: string]: unknown;
  };
  adGroup?: {
    resourceName?: string;
    id?: string;
    name?: string;
    status?: string;
    type?: string;
    [key: string]: unknown;
  };
  adGroupAd?: {
    resourceName?: string;
    ad?: {
      id?: string;
      type?: string;
      name?: string;
      finalUrls?: string[];
      [key: string]: unknown;
    };
    status?: string;
    adStrength?: string;
    [key: string]: unknown;
  };
  keywordView?: {
    resourceName?: string;
    [key: string]: unknown;
  };
  adGroupCriterion?: {
    resourceName?: string;
    criterionId?: string;
    keyword?: {
      text?: string;
      matchType?: string;
    };
    qualityInfo?: {
      qualityScore?: number;
      creativeQualityScore?: string;
      postClickQualityScore?: string;
      searchPredictedCtr?: string;
    };
    [key: string]: unknown;
  };
  metrics?: {
    impressions?: string;
    clicks?: string;
    costMicros?: string;
    ctr?: number;
    averageCpc?: string;
    averageCpm?: string;
    conversions?: number;
    conversionsValue?: number;
    costPerConversion?: string;
    conversionsFromInteractionsRate?: number;
    allConversions?: number;
    allConversionsValue?: number;
    costPerAllConversions?: string;
    viewThroughConversions?: string;
    crossDeviceConversions?: number;
    videoViews?: string;
    videoViewRate?: number;
    videoQuartileP25Rate?: number;
    videoQuartileP50Rate?: number;
    videoQuartileP75Rate?: number;
    videoQuartileP100Rate?: number;
    interactions?: string;
    interactionRate?: number;
    engagementRate?: number;
    searchImpressionShare?: number;
    searchBudgetLostImpressionShare?: number;
    searchRankLostImpressionShare?: number;
    searchTopImpressionShare?: number;
    searchAbsoluteTopImpressionShare?: number;
    searchExactMatchImpressionShare?: number;
    contentImpressionShare?: number;
    contentBudgetLostImpressionShare?: number;
    contentRankLostImpressionShare?: number;
    topImpressionPercentage?: number;
    absoluteTopImpressionPercentage?: number;
    invalidClicks?: string;
    invalidClickRate?: number;
    reach?: string;
    frequencyCount?: number;
    averageCost?: string;
    averageCpe?: string;
    averageCpv?: string;
    activeViewCpm?: string;
    activeViewCtr?: number;
    activeViewImpressions?: string;
    activeViewMeasurability?: number;
    activeViewMeasurableCostMicros?: string;
    activeViewMeasurableImpressions?: string;
    activeViewViewability?: number;
    [key: string]: unknown;
  };
  segments?: {
    date?: string;
    dayOfWeek?: string;
    hour?: number;
    month?: string;
    week?: string;
    quarter?: string;
    year?: number;
    device?: string;
    adNetworkType?: string;
    slot?: string;
    conversionAction?: string;
    conversionActionName?: string;
    conversionActionCategory?: string;
    externalConversionSource?: string;
    clickType?: string;
    adDestinationType?: string;
    ageRange?: string;
    gender?: string;
    geoTargetCountry?: string;
    geoTargetRegion?: string;
    geoTargetMetro?: string;
    geoTargetCity?: string;
    advertisingChannelType?: string;
    advertisingChannelSubType?: string;
    productItemId?: string;
    productBrand?: string;
    productCategoryLevel1?: string;
    productCategoryLevel2?: string;
    productTypeL1?: string;
    productCustomAttribute0?: string;
    keyword?: {
      info?: {
        text?: string;
        matchType?: string;
      };
    };
    [key: string]: unknown;
  };
  customer?: {
    resourceName?: string;
    id?: string;
    descriptiveName?: string;
    currencyCode?: string;
    timeZone?: string;
    manager?: boolean;
    testAccount?: boolean;
    [key: string]: unknown;
  };
  campaignBudget?: {
    resourceName?: string;
    id?: string;
    amountMicros?: string;
    period?: string;
    totalAmountMicros?: string;
    status?: string;
    deliveryMethod?: string;
    [key: string]: unknown;
  };
  biddingStrategy?: {
    resourceName?: string;
    id?: string;
    name?: string;
    type?: string;
    [key: string]: unknown;
  };
  conversionAction?: {
    resourceName?: string;
    id?: string;
    name?: string;
    category?: string;
    type?: string;
    status?: string;
    [key: string]: unknown;
  };
  geographicView?: {
    resourceName?: string;
    countryCriterionId?: string;
    locationType?: string;
    [key: string]: unknown;
  };
  shoppingPerformanceView?: {
    resourceName?: string;
    [key: string]: unknown;
  };
  searchTermView?: {
    resourceName?: string;
    searchTerm?: string;
    [key: string]: unknown;
  };
  landingPageView?: {
    resourceName?: string;
    unexpandedFinalUrl?: string;
    [key: string]: unknown;
  };
  video?: {
    resourceName?: string;
    id?: string;
    title?: string;
    channelId?: string;
    durationMillis?: string;
    [key: string]: unknown;
  };
  assetGroup?: {
    resourceName?: string;
    id?: string;
    name?: string;
    status?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// ============================================
// FLATTENED INSIGHT ROW (for display)
// ============================================

export interface GoogleAdsInsightRow {
  // Entity fields
  "campaign.id"?: string;
  "campaign.name"?: string;
  "campaign.status"?: string;
  "campaign.advertising_channel_type"?: string;
  "campaign.advertising_channel_sub_type"?: string;
  "campaign.bidding_strategy_type"?: string;
  "ad_group.id"?: string;
  "ad_group.name"?: string;
  "ad_group.status"?: string;
  "ad_group_ad.ad.id"?: string;
  "ad_group_ad.ad.name"?: string;
  "ad_group_ad.ad.type"?: string;
  "ad_group_criterion.keyword.text"?: string;
  "ad_group_criterion.keyword.match_type"?: string;
  "ad_group_criterion.quality_info.quality_score"?: number;
  "customer.id"?: string;
  "customer.descriptive_name"?: string;

  // Metrics (converted from camelCase API response)
  "metrics.impressions"?: number;
  "metrics.clicks"?: number;
  "metrics.cost_micros"?: number;
  "metrics.cost"?: number; // converted from micros
  "metrics.ctr"?: number;
  "metrics.average_cpc"?: number; // converted from micros
  "metrics.average_cpm"?: number; // converted from micros
  "metrics.conversions"?: number;
  "metrics.conversions_value"?: number;
  "metrics.cost_per_conversion"?: number; // converted from micros
  "metrics.conversions_from_interactions_rate"?: number;
  "metrics.all_conversions"?: number;
  "metrics.all_conversions_value"?: number;
  "metrics.cost_per_all_conversions"?: number;
  "metrics.view_through_conversions"?: number;
  "metrics.cross_device_conversions"?: number;
  "metrics.video_trueview_views"?: number;
  "metrics.video_trueview_view_rate"?: number;
  "metrics.video_quartile_p25_rate"?: number;
  "metrics.video_quartile_p50_rate"?: number;
  "metrics.video_quartile_p75_rate"?: number;
  "metrics.video_quartile_p100_rate"?: number;
  "metrics.interactions"?: number;
  "metrics.interaction_rate"?: number;
  "metrics.engagement_rate"?: number;
  "metrics.search_impression_share"?: number;
  "metrics.search_budget_lost_impression_share"?: number;
  "metrics.search_rank_lost_impression_share"?: number;
  "metrics.search_top_impression_share"?: number;
  "metrics.search_absolute_top_impression_share"?: number;
  "metrics.top_impression_percentage"?: number;
  "metrics.absolute_top_impression_percentage"?: number;
  "metrics.invalid_clicks"?: number;
  "metrics.invalid_click_rate"?: number;
  "metrics.active_view_cpm"?: number;
  "metrics.active_view_ctr"?: number;
  "metrics.active_view_impressions"?: number;
  "metrics.active_view_viewability"?: number;

  // Segments
  "segments.date"?: string;
  "segments.day_of_week"?: string;
  "segments.hour"?: number;
  "segments.month"?: string;
  "segments.week"?: string;
  "segments.quarter"?: string;
  "segments.year"?: number;
  "segments.device"?: string;
  "segments.ad_network_type"?: string;
  "segments.slot"?: string;
  "segments.conversion_action"?: string;
  "segments.conversion_action_name"?: string;
  "segments.conversion_action_category"?: string;
  "segments.external_conversion_source"?: string;
  "segments.age_range"?: string;
  "segments.gender"?: string;
  "segments.geo_target_country"?: string;
  "segments.geo_target_region"?: string;
  "segments.geo_target_metro"?: string;
  "segments.advertising_channel_type"?: string;
  "segments.advertising_channel_sub_type"?: string;

  // Allow additional fields
  [key: string]: unknown;
}

// ============================================
// CALCULATED METRICS TYPES
// ============================================

export interface GoogleAdsDerivedMetrics {
  roas?: number | null;
  valuePerConversion?: number | null;
  allConversionsRoas?: number | null;
  allConversionsValuePerConversion?: number | null;
  costPerClickDollars?: number | null;
  costPerMilleDollars?: number | null;
  conversionRate?: number | null;
  hookRate?: number | null;
  holdRate?: number | null;
  completionRate?: number | null;
  impressionShareLostTotal?: number | null;
  spendShare?: number | null;
}

// ============================================
// QUERY TYPES
// ============================================

export interface GoogleAdsQueryRequest {
  customerId: string;
  resource: GoogleAdsResourceType;
  metrics: string[];
  dimensions: string[];
  filters: GoogleAdsFilter[];
  startDate?: string;
  endDate?: string;
  datePreset?: GoogleAdsDatePreset;
  orderBy?: string;
  orderDirection?: "ASC" | "DESC";
  limit?: number;
  loginCustomerId?: string;
}

export interface GoogleAdsFilter {
  field: string;
  operator: GoogleAdsFilterOperator;
  value: string | string[] | number | number[];
}

// ============================================
// QUERY PLAN TYPES
// ============================================

export interface GoogleAdsQueryPlan {
  queries: GoogleAdsGaqlQuery[];
  mergeStrategy: "join" | "union" | "none";
  joinKeys: string[];
  warnings: string[];
  errors: string[];
  estimatedApiCalls: number;
  calculatedMetrics: string[];
}

export interface GoogleAdsGaqlQuery {
  gaql: string;
  resource: GoogleAdsResourceType;
  selectFields: string[];
  metrics: string[];
  dimensions: string[];
  description: string;
}

export interface GoogleAdsQueryResult {
  rows: GoogleAdsInsightRow[];
  debug: GoogleAdsQueryDebugInfo;
  warnings?: string[];
  error?: string;
}

export interface GoogleAdsQueryDebugInfo {
  requestCount: number;
  totalRows: number;
  executionTimeMs: number;
  errors: string[];
  warnings: string[];
  rawRequests: unknown[];
  rawResponses: unknown[];
  calculatedMetrics: string[];
  joinKeys: string[];
  gaqlQueries: string[];
}

// ============================================
// METRIC CATALOG TYPES
// ============================================

export interface GoogleAdsMetricDefinition {
  key: string;
  name: string;
  description: string;
  category: GoogleAdsMetricCategory;
  format: GoogleAdsMetricFormat;
  apiField: string;
  type: "api" | "calculated";
  formula?: string;
  dependencies?: string[];
  compatibleResources?: GoogleAdsResourceType[];
  incompatibleSegments?: string[];
}

// ============================================
// DIMENSION CATALOG TYPES
// ============================================

export interface GoogleAdsDimensionDefinition {
  key: string;
  name: string;
  description: string;
  category: GoogleAdsDimensionCategory;
  apiField: string;
  isSegment: boolean;
  isResourceAttribute: boolean;
  compatibleResources?: GoogleAdsResourceType[];
  incompatibleWith?: string[];
  possibleValues?: string[];
  requiresSegment?: string;
}

// ============================================
// FILTER CATALOG TYPES
// ============================================

export interface GoogleAdsFilterDefinition {
  key: string;
  name: string;
  description: string;
  apiField: string;
  operators: GoogleAdsFilterOperator[];
  type: "enum" | "string" | "number" | "boolean" | "date";
  enumValues?: string[];
  defaultOperator?: GoogleAdsFilterOperator;
  defaultValue?: string;
}

// ============================================
// KEYWORD PLANNER (PLANLESS, READ-ONLY RPCS)
// ============================================

export type KeywordPlanNetwork = "GOOGLE_SEARCH" | "GOOGLE_SEARCH_AND_PARTNERS";
export type KeywordMatchType = "EXACT" | "PHRASE" | "BROAD";
export type MonthOfYear =
  | "JANUARY"
  | "FEBRUARY"
  | "MARCH"
  | "APRIL"
  | "MAY"
  | "JUNE"
  | "JULY"
  | "AUGUST"
  | "SEPTEMBER"
  | "OCTOBER"
  | "NOVEMBER"
  | "DECEMBER";

export interface KeywordPlanYearMonth {
  year: string;
  month: MonthOfYear;
}

export interface KeywordPlanHistoricalMetricsOptions {
  yearMonthRange?: {
    start: KeywordPlanYearMonth;
    end: KeywordPlanYearMonth;
  };
  includeAverageCpc?: boolean;
}

export interface KeywordPlanAggregateMetrics {
  aggregateMetricTypes: Array<"DEVICE">;
}

export interface GenerateKeywordHistoricalMetricsRequest {
  keywords: string[];
  geoTargetConstants?: string[];
  language?: string;
  keywordPlanNetwork?: KeywordPlanNetwork;
  includeAdultKeywords?: boolean;
  historicalMetricsOptions?: KeywordPlanHistoricalMetricsOptions;
  aggregateMetrics?: KeywordPlanAggregateMetrics;
}

export interface KeywordPlanMonthlySearchVolume {
  year?: string;
  month?: MonthOfYear | "UNSPECIFIED" | "UNKNOWN";
  monthlySearches?: string | null;
}

export interface KeywordPlanHistoricalMetrics {
  avgMonthlySearches?: string;
  competition?: "UNSPECIFIED" | "UNKNOWN" | "LOW" | "MEDIUM" | "HIGH";
  competitionIndex?: string;
  lowTopOfPageBidMicros?: string;
  highTopOfPageBidMicros?: string;
  averageCpcMicros?: string;
  monthlySearchVolumes?: KeywordPlanMonthlySearchVolume[];
}

export interface KeywordPlanDeviceSearches {
  device?: "UNSPECIFIED" | "UNKNOWN" | "MOBILE" | "TABLET" | "DESKTOP" | "CONNECTED_TV" | "OTHER";
  searchCount?: string;
}

export interface KeywordPlanAggregateMetricResults {
  deviceSearches?: KeywordPlanDeviceSearches[];
}

export interface GenerateKeywordHistoricalMetricsResult {
  text?: string;
  closeVariants?: string[];
  keywordMetrics?: KeywordPlanHistoricalMetrics;
}

export interface GenerateKeywordHistoricalMetricsResponse {
  results?: GenerateKeywordHistoricalMetricsResult[];
  aggregateMetricResults?: KeywordPlanAggregateMetricResults;
}

export interface KeywordConceptGroup {
  name?: string;
  type?: "UNSPECIFIED" | "UNKNOWN" | "BRAND" | "OTHER_BRANDS" | "NON_BRAND";
}

export interface KeywordConcept {
  name?: string;
  conceptGroup?: KeywordConceptGroup;
}

export interface KeywordAnnotations {
  concepts?: KeywordConcept[];
}

export interface GenerateKeywordIdeasRequest {
  geoTargetConstants?: string[];
  language?: string;
  keywordPlanNetwork?: KeywordPlanNetwork;
  includeAdultKeywords?: boolean;
  historicalMetricsOptions?: KeywordPlanHistoricalMetricsOptions;
  aggregateMetrics?: KeywordPlanAggregateMetrics;
  keywordAnnotation?: Array<"KEYWORD_CONCEPT">;
  pageSize?: number;
  pageToken?: string;
  keywordSeed?: { keywords: string[] };
  urlSeed?: { url: string };
  keywordAndUrlSeed?: { keywords: string[]; url: string };
  siteSeed?: { site: string };
}

export interface GenerateKeywordIdeaResult {
  text?: string;
  closeVariants?: string[];
  keywordIdeaMetrics?: KeywordPlanHistoricalMetrics;
  keywordAnnotations?: KeywordAnnotations;
}

export interface GenerateKeywordIdeasResponse {
  results?: GenerateKeywordIdeaResult[];
  nextPageToken?: string;
  totalSize?: string;
  aggregateMetricResults?: KeywordPlanAggregateMetricResults;
}

export interface KeywordInfo {
  text: string;
  matchType: KeywordMatchType;
}

export interface KeywordForecastMetrics {
  impressions?: number;
  clicks?: number;
  costMicros?: string;
  clickThroughRate?: number;
  averageCpcMicros?: string;
  conversions?: number;
  conversionRate?: number;
  averageCpaMicros?: string;
}

export interface CampaignToForecast {
  keywordPlanNetwork: KeywordPlanNetwork;
  biddingStrategy: {
    manualCpcBiddingStrategy?: { maxCpcBidMicros: string; dailyBudgetMicros?: string };
    maximizeClicksBiddingStrategy?: { dailyTargetSpendMicros: string; maxCpcBidCeilingMicros?: string };
    maximizeConversionsBiddingStrategy?: { dailyTargetSpendMicros: string };
  };
  adGroups: Array<{
    biddableKeywords: Array<{ keyword: KeywordInfo; maxCpcBidMicros?: string }>;
    negativeKeywords?: KeywordInfo[];
    maxCpcBidMicros?: string;
  }>;
  geoModifiers?: Array<{ geoTargetConstant: string; bidModifier?: number }>;
  languageConstants?: string[];
  negativeKeywords?: KeywordInfo[];
  conversionRate?: number;
}

export interface GenerateKeywordForecastMetricsRequest {
  campaign: CampaignToForecast;
  currencyCode?: string;
  forecastPeriod?: { startDate: string; endDate: string };
}

export interface GenerateKeywordForecastMetricsResponse {
  campaignForecastMetrics?: KeywordForecastMetrics;
}

export type GoogleAdsFieldCategory =
  | "UNSPECIFIED"
  | "UNKNOWN"
  | "RESOURCE"
  | "ATTRIBUTE"
  | "SEGMENT"
  | "METRIC";

export interface GoogleAdsField {
  resourceName?: string;
  name?: string;
  category?: GoogleAdsFieldCategory;
  dataType?: string;
  typeUrl?: string;
  selectable?: boolean;
  filterable?: boolean;
  sortable?: boolean;
  isRepeated?: boolean;
  enumValues?: string[];
  selectableWith?: string[];
  attributeResources?: string[];
  metrics?: string[];
  segments?: string[];
}

export interface SearchGoogleAdsFieldsRequest {
  query: string;
  pageSize?: number;
  pageToken?: string;
}

export interface SearchGoogleAdsFieldsResponse {
  results?: GoogleAdsField[];
  nextPageToken?: string;
  totalResultsCount?: string;
}

export interface GeoTargetConstant {
  resourceName?: string;
  id?: string;
  name?: string;
  canonicalName?: string;
  parentGeoTarget?: string;
  countryCode?: string;
  targetType?: string;
  status?: "UNSPECIFIED" | "UNKNOWN" | "ENABLED" | "REMOVAL_PLANNED";
}

export interface SuggestGeoTargetConstantsRequest {
  locale?: string;
  countryCode?: string;
  locationNames?: { names: string[] };
  geoTargets?: { geoTargetConstants: string[] };
}

export interface GeoTargetConstantSuggestion {
  searchTerm?: string;
  locale?: string;
  reach?: string;
  geoTargetConstant?: GeoTargetConstant;
  geoTargetConstantParents?: GeoTargetConstant[];
}

export interface SuggestGeoTargetConstantsResponse {
  geoTargetConstantSuggestions?: GeoTargetConstantSuggestion[];
}

export interface GenerateAdGroupThemesRequest {
  keywords: string[];
  adGroups: string[];
}

export interface AdGroupKeywordSuggestion {
  keywordText?: string;
  suggestedKeywordText?: string;
  suggestedMatchType?: "UNSPECIFIED" | "UNKNOWN" | "EXACT" | "PHRASE" | "BROAD";
  suggestedAdGroup?: string;
  suggestedCampaign?: string;
}

export interface UnusableAdGroup {
  adGroup?: string;
  campaign?: string;
}

export interface GenerateAdGroupThemesResponse {
  adGroupKeywordSuggestions?: AdGroupKeywordSuggestion[];
  unusableAdGroups?: UnusableAdGroup[];
}

// ============================================
// API ERROR TYPES
// ============================================

export interface GoogleAdsApiError {
  code: number;
  message: string;
  status: string;
  details?: Array<{
    "@type": string;
    errors?: Array<{
      errorCode?: Record<string, string>;
      message?: string;
      trigger?: { stringValue?: string };
      location?: { fieldPathElements?: Array<{ fieldName?: string; index?: number }> };
    }>;
    requestId?: string;
  }>;
}

export class GoogleAdsApiException extends Error {
  code: number;
  status: string;
  requestId?: string;
  errors: Array<{
    errorCode?: Record<string, string>;
    message?: string;
  }>;

  constructor(
    message: string,
    code: number,
    status?: string,
    requestId?: string,
    errors?: Array<{ errorCode?: Record<string, string>; message?: string }>
  ) {
    super(message);
    this.name = "GoogleAdsApiException";
    this.code = code;
    this.status = status || "UNKNOWN";
    this.requestId = requestId;
    this.errors = errors || [];
  }

  get isAuthError(): boolean {
    return this.code === 401 || this.code === 403;
  }

  get isRateLimitError(): boolean {
    return this.code === 429;
  }

  get isQuotaError(): boolean {
    return this.code === 429 || this.status === "RESOURCE_EXHAUSTED";
  }

  get isInvalidQueryError(): boolean {
    return this.code === 400;
  }

  get suggestion(): string {
    if (this.isAuthError) return "Re-authenticate with Google Ads";
    if (this.isRateLimitError) return "Wait and retry -- rate limit exceeded";
    if (this.isQuotaError) return "Quota exceeded -- reduce query frequency";
    if (this.isInvalidQueryError) return "Check request fields, criterion IDs, date ranges, and GAQL syntax/field compatibility when applicable";
    return "Check the error details for more information";
  }
}

// ============================================
// CONSTANTS
// ============================================

export const GOOGLE_ADS_API_VERSION = "v26";
export const GOOGLE_ADS_API_BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

export const MICRO_CURRENCY_FACTOR = 1_000_000;

/**
 * Fields that contain micro-currency values and need conversion
 */
export const MICRO_CURRENCY_FIELDS = [
  "metrics.cost_micros",
  "metrics.average_cpc",
  "metrics.average_cpm",
  "metrics.cost_per_conversion",
  "metrics.cost_per_all_conversions",
  "metrics.average_cost",
  "metrics.average_cpe",
  "metrics.average_cpv",
  "metrics.trueview_average_cpv",
  "metrics.active_view_cpm",
  "metrics.active_view_measurable_cost_micros",
  "metrics.search_lift_cost_micros",
  "campaign_budget.amount_micros",
  "campaign_budget.total_amount_micros",
] as const;

/**
 * camelCase to snake_case mapping for API response fields
 */
export const CAMEL_TO_SNAKE_METRIC_MAP: Record<string, string> = {
  impressions: "impressions",
  clicks: "clicks",
  costMicros: "cost_micros",
  ctr: "ctr",
  averageCpc: "average_cpc",
  averageCpm: "average_cpm",
  conversions: "conversions",
  conversionsValue: "conversions_value",
  costPerConversion: "cost_per_conversion",
  conversionsFromInteractionsRate: "conversions_from_interactions_rate",
  allConversions: "all_conversions",
  allConversionsValue: "all_conversions_value",
  costPerAllConversions: "cost_per_all_conversions",
  viewThroughConversions: "view_through_conversions",
  crossDeviceConversions: "cross_device_conversions",
  videoViews: "video_views",
  videoViewRate: "video_view_rate",
  videoQuartileP25Rate: "video_quartile_p25_rate",
  videoQuartileP50Rate: "video_quartile_p50_rate",
  videoQuartileP75Rate: "video_quartile_p75_rate",
  videoQuartileP100Rate: "video_quartile_p100_rate",
  interactions: "interactions",
  interactionRate: "interaction_rate",
  engagementRate: "engagement_rate",
  searchImpressionShare: "search_impression_share",
  searchBudgetLostImpressionShare: "search_budget_lost_impression_share",
  searchRankLostImpressionShare: "search_rank_lost_impression_share",
  searchTopImpressionShare: "search_top_impression_share",
  searchAbsoluteTopImpressionShare: "search_absolute_top_impression_share",
  searchExactMatchImpressionShare: "search_exact_match_impression_share",
  contentImpressionShare: "content_impression_share",
  contentBudgetLostImpressionShare: "content_budget_lost_impression_share",
  contentRankLostImpressionShare: "content_rank_lost_impression_share",
  topImpressionPercentage: "top_impression_percentage",
  absoluteTopImpressionPercentage: "absolute_top_impression_percentage",
  invalidClicks: "invalid_clicks",
  invalidClickRate: "invalid_click_rate",
  activeViewCpm: "active_view_cpm",
  activeViewCtr: "active_view_ctr",
  activeViewImpressions: "active_view_impressions",
  activeViewMeasurability: "active_view_measurability",
  activeViewMeasurableCostMicros: "active_view_measurable_cost_micros",
  activeViewMeasurableImpressions: "active_view_measurable_impressions",
  activeViewViewability: "active_view_viewability",
  reach: "reach",
  frequencyCount: "frequency_count",
  averageCost: "average_cost",
  averageCpe: "average_cpe",
  averageCpv: "average_cpv",
};

export const CAMEL_TO_SNAKE_SEGMENT_MAP: Record<string, string> = {
  date: "date",
  dayOfWeek: "day_of_week",
  hour: "hour",
  month: "month",
  week: "week",
  quarter: "quarter",
  year: "year",
  device: "device",
  adNetworkType: "ad_network_type",
  slot: "slot",
  conversionAction: "conversion_action",
  conversionActionName: "conversion_action_name",
  conversionActionCategory: "conversion_action_category",
  externalConversionSource: "external_conversion_source",
  clickType: "click_type",
  adDestinationType: "ad_destination_type",
  ageRange: "age_range",
  gender: "gender",
  geoTargetCountry: "geo_target_country",
  geoTargetRegion: "geo_target_region",
  geoTargetMetro: "geo_target_metro",
  geoTargetCity: "geo_target_city",
  advertisingChannelType: "advertising_channel_type",
  advertisingChannelSubType: "advertising_channel_sub_type",
  productItemId: "product_item_id",
  productBrand: "product_brand",
  productCategoryLevel1: "product_category_level1",
  productCategoryLevel2: "product_category_level2",
  productTypeL1: "product_type_l1",
  productCustomAttribute0: "product_custom_attribute0",
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Convert micro-currency to standard currency
 */
export function microToStandard(microAmount: number | string): number {
  const amount = typeof microAmount === "string" ? parseFloat(microAmount) : microAmount;
  return amount / MICRO_CURRENCY_FACTOR;
}

/**
 * Format a Google Ads customer ID (add dashes: 1234567890 -> 123-456-7890)
 */
export function formatCustomerId(customerId: string): string {
  const clean = customerId.replace(/-/g, "");
  if (clean.length !== 10) return customerId;
  return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
}

/**
 * Strip dashes from customer ID for API calls
 */
export function stripCustomerId(customerId: string): string {
  return customerId.replace(/-/g, "");
}
