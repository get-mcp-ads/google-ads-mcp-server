/**
 * google-ads-mcp-server: an open-source MCP server for the Google Ads API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
// ============================================
// GOOGLE ADS CALCULATED METRICS
// Client-side metric computation
// ============================================

import {
  GoogleAdsInsightRow,
  GoogleAdsDerivedMetrics,
  MICRO_CURRENCY_FACTOR,
} from "./types.js";

// ============================================
// INDIVIDUAL METRIC CALCULATORS
// ============================================

/**
 * Calculate ROAS (Return on Ad Spend)
 * Formula: conversions_value / (cost_micros / 1,000,000)
 */
function calcRoas(row: GoogleAdsInsightRow): number | null {
  const costMicros = row["metrics.cost_micros"];
  const value = row["metrics.conversions_value"];
  if (typeof costMicros !== "number" || typeof value !== "number") return null;
  if (costMicros <= 0) return null;
  const cost = costMicros / MICRO_CURRENCY_FACTOR;
  return value / cost;
}

/**
 * Calculate All Conversions ROAS
 */
function calcAllConversionsRoas(row: GoogleAdsInsightRow): number | null {
  const costMicros = row["metrics.cost_micros"];
  const value = row["metrics.all_conversions_value"];
  if (typeof costMicros !== "number" || typeof value !== "number") return null;
  if (costMicros <= 0) return null;
  const cost = costMicros / MICRO_CURRENCY_FACTOR;
  return value / cost;
}

/**
 * Calculate Value per Conversion
 */
function calcValuePerConversion(row: GoogleAdsInsightRow): number | null {
  const conversions = row["metrics.conversions"];
  const value = row["metrics.conversions_value"];
  if (typeof conversions !== "number" || typeof value !== "number") return null;
  if (conversions <= 0) return null;
  return value / conversions;
}

/**
 * Calculate All Conversions Value per Conversion
 */
function calcAllConversionsValuePerConversion(row: GoogleAdsInsightRow): number | null {
  const conversions = row["metrics.all_conversions"];
  const value = row["metrics.all_conversions_value"];
  if (typeof conversions !== "number" || typeof value !== "number") return null;
  if (conversions <= 0) return null;
  return value / conversions;
}

/**
 * Calculate CPC in dollars (from micros)
 */
function calcCpcDollars(row: GoogleAdsInsightRow): number | null {
  const costMicros = row["metrics.cost_micros"];
  const clicks = row["metrics.clicks"];
  if (typeof costMicros !== "number" || typeof clicks !== "number") return null;
  if (clicks <= 0) return null;
  return costMicros / MICRO_CURRENCY_FACTOR / clicks;
}

/**
 * Calculate CPM in dollars (from micros)
 */
function calcCpmDollars(row: GoogleAdsInsightRow): number | null {
  const costMicros = row["metrics.cost_micros"];
  const impressions = row["metrics.impressions"];
  if (typeof costMicros !== "number" || typeof impressions !== "number") return null;
  if (impressions <= 0) return null;
  return (costMicros / MICRO_CURRENCY_FACTOR / impressions) * 1000;
}

/**
 * Calculate conversion rate
 * Formula: conversions / clicks * 100
 */
function calcConversionRate(row: GoogleAdsInsightRow): number | null {
  const conversions = row["metrics.conversions"];
  const clicks = row["metrics.clicks"];
  if (typeof conversions !== "number" || typeof clicks !== "number") return null;
  if (clicks <= 0) return null;
  return (conversions / clicks) * 100;
}

/**
 * Calculate Hook Rate (video p25 as proxy for initial attention)
 * For Google Ads: video_quartile_p25_rate is already a rate (0-1)
 */
function calcHookRate(row: GoogleAdsInsightRow): number | null {
  const p25 = row["metrics.video_quartile_p25_rate"];
  if (typeof p25 !== "number") return null;
  return p25 * 100;
}

/**
 * Calculate Hold Rate
 * Formula: video_quartile_p50_rate / video_quartile_p25_rate * 100
 */
function calcHoldRate(row: GoogleAdsInsightRow): number | null {
  const p25 = row["metrics.video_quartile_p25_rate"];
  const p50 = row["metrics.video_quartile_p50_rate"];
  if (typeof p25 !== "number" || typeof p50 !== "number") return null;
  if (p25 <= 0) return null;
  return (p50 / p25) * 100;
}

/**
 * Calculate Completion Rate
 * Formula: video_quartile_p100_rate / video_quartile_p25_rate * 100
 */
function calcCompletionRate(row: GoogleAdsInsightRow): number | null {
  const p25 = row["metrics.video_quartile_p25_rate"];
  const p100 = row["metrics.video_quartile_p100_rate"];
  if (typeof p25 !== "number" || typeof p100 !== "number") return null;
  if (p25 <= 0) return null;
  return (p100 / p25) * 100;
}

/**
 * Calculate Total Impression Share Lost
 * Formula: search_budget_lost_IS + search_rank_lost_IS
 */
function calcImpressionShareLostTotal(row: GoogleAdsInsightRow): number | null {
  const budgetLost = row["metrics.search_budget_lost_impression_share"];
  const rankLost = row["metrics.search_rank_lost_impression_share"];
  if (typeof budgetLost !== "number" && typeof rankLost !== "number") return null;
  return ((budgetLost as number) || 0) + ((rankLost as number) || 0);
}

// ============================================
// MAIN CALCULATION FUNCTION
// ============================================

/**
 * Calculate all custom metrics for a single row
 */
export function calculateMetrics(
  row: GoogleAdsInsightRow
): Partial<GoogleAdsDerivedMetrics> {
  return {
    roas: calcRoas(row),
    allConversionsRoas: calcAllConversionsRoas(row),
    valuePerConversion: calcValuePerConversion(row),
    allConversionsValuePerConversion: calcAllConversionsValuePerConversion(row),
    costPerClickDollars: calcCpcDollars(row),
    costPerMilleDollars: calcCpmDollars(row),
    conversionRate: calcConversionRate(row),
    hookRate: calcHookRate(row),
    holdRate: calcHoldRate(row),
    completionRate: calcCompletionRate(row),
    impressionShareLostTotal: calcImpressionShareLostTotal(row),
  };
}

/**
 * Calculate spend share across all rows (requires full dataset)
 */
export function calculateSpendShare(
  rows: GoogleAdsInsightRow[]
): GoogleAdsInsightRow[] {
  const totalCostMicros = rows.reduce((sum, row) => {
    const cost = row["metrics.cost_micros"];
    return sum + (typeof cost === "number" ? cost : 0);
  }, 0);

  if (totalCostMicros <= 0) return rows;

  return rows.map((row) => {
    const cost = row["metrics.cost_micros"];
    const share =
      typeof cost === "number" ? (cost / totalCostMicros) * 100 : null;
    return { ...row, spendShare: share };
  });
}

/**
 * Enrich rows with all calculated metrics
 */
export function enrichWithCalculatedMetrics(
  rows: GoogleAdsInsightRow[],
  requestedCalculated: string[],
  includeSpendShare: boolean = false
): (GoogleAdsInsightRow & Partial<GoogleAdsDerivedMetrics>)[] {
  let enrichedRows = rows.map((row) => ({
    ...row,
    ...calculateMetrics(row),
  }));

  if (includeSpendShare || requestedCalculated.includes("spendShare")) {
    enrichedRows = calculateSpendShare(enrichedRows) as typeof enrichedRows;
  }

  return enrichedRows;
}
