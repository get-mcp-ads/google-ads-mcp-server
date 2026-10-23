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
  GenerateKeywordForecastMetricsRequest,
  GenerateKeywordHistoricalMetricsRequest,
  GenerateKeywordHistoricalMetricsResult,
  GenerateKeywordIdeaResult,
  GenerateKeywordIdeasRequest,
  KeywordForecastMetrics,
  KeywordMatchType,
  KeywordPlanAggregateMetricResults,
  KeywordPlanHistoricalMetrics,
  KeywordPlanMonthlySearchVolume,
  KeywordPlanNetwork,
  KeywordPlanYearMonth,
  MonthOfYear,
} from "./types.js";

type ToolSuccessFormatter = (data: unknown) => {
  content: Array<{ type: "text"; text: string }>;
};

type BiddingStrategy = "MANUAL_CPC" | "MAXIMIZE_CLICKS" | "MAXIMIZE_CONVERSIONS";
const FORECAST_WITH_BREAKDOWN_TIME_BUDGET_MS = 45_000;

export interface KeywordPlannerHistoryInput {
  keywords: string[];
  geoTargetIds?: string[];
  languageId?: string;
  network?: KeywordPlanNetwork;
  includeAdultKeywords?: boolean;
  includeAverageCpc?: boolean;
  includeDeviceBreakdown?: boolean;
  historyMonths?: number;
  startYearMonth?: string;
  endYearMonth?: string;
}

export interface KeywordPlannerIdeasInput {
  seedKeywords?: string[];
  url?: string;
  site?: string;
  geoTargetIds?: string[];
  languageId?: string;
  network?: KeywordPlanNetwork;
  includeAdultKeywords?: boolean;
  includeAverageCpc?: boolean;
  includeDeviceBreakdown?: boolean;
  includeKeywordConcepts?: boolean;
  historyMonths?: number;
  startYearMonth?: string;
  endYearMonth?: string;
  pageSize?: number;
  pageToken?: string;
}

export interface KeywordPlannerForecastInput {
  keywords: string[];
  matchType?: KeywordMatchType;
  geoTargetIds?: string[];
  languageIds?: string[];
  biddingStrategy?: BiddingStrategy;
  maxCpcBid?: number;
  dailyBudget?: number;
  maxCpcBidCeiling?: number;
  currencyCode?: string;
  startDate?: string;
  endDate?: string;
}

const MONTHS: MonthOfYear[] = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

const MONTH_NUMBER = new Map<MonthOfYear, number>(
  MONTHS.map((month, index) => [month, index + 1])
);

const customerIdSchema = z.string().regex(/^\d[\d-]*\d$|^\d$/, "Expected a numeric Google Ads customer ID, with or without dashes");
const numericIdSchema = z.string().regex(/^\d+$/, "Expected a numeric Google Ads criterion ID");
const keywordTextSchema = z.string().trim().min(1).max(80).refine(
  (value) => value.split(/\s+/).length <= 10,
  "Google Ads keywords can contain at most 10 words"
);
const yearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected YYYY-MM");
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const networkSchema = z.enum(["GOOGLE_SEARCH", "GOOGLE_SEARCH_AND_PARTNERS"]);
const matchTypeSchema = z.enum(["EXACT", "PHRASE", "BROAD"]);
const currencyAmountSchema = z.number().finite().min(0.000001).max(1_000_000_000);

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
  ) as T;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function safeIntegerNumber(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && Number.isSafeInteger(parsed) ? parsed : null;
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function percentChange(current: number | null, baseline: number | null): number | null {
  if (current === null || baseline === null) return null;
  if (baseline === 0) return current === 0 ? 0 : null;
  return round(((current - baseline) / baseline) * 100);
}

function changeUnavailableReason(
  current: number | null,
  baseline: number | null
): "LATEST_VALUE_UNAVAILABLE" | "BASELINE_VALUE_UNAVAILABLE" | "BASELINE_IS_ZERO" | null {
  if (current === null) return "LATEST_VALUE_UNAVAILABLE";
  if (baseline === null) return "BASELINE_VALUE_UNAVAILABLE";
  if (baseline === 0 && current !== 0) return "BASELINE_IS_ZERO";
  return null;
}

function changeDirection(changePercent: number | null): "UP" | "DOWN" | "FLAT" | "UNAVAILABLE" {
  if (changePercent === null) return "UNAVAILABLE";
  if (changePercent > 0) return "UP";
  if (changePercent < 0) return "DOWN";
  return "FLAT";
}

function parseCalendarDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid date "${value}". Expected YYYY-MM-DD.`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date "${value}".`);
  }
  return parsed;
}

function inclusiveDays(startDate?: string, endDate?: string, now = new Date()): number | null {
  if (!startDate && !endDate) return null;
  if (!startDate || !endDate) {
    throw new Error("startDate and endDate must be supplied together.");
  }
  const start = parseCalendarDate(startDate);
  const end = parseCalendarDate(endDate);
  if (start > end) throw new Error("startDate must be on or before endDate.");

  const today = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  ));
  if (start <= today) {
    throw new Error("startDate must be in the future. Google evaluates this in the customer account time zone; use at least tomorrow and allow an extra day near time-zone boundaries.");
  }
  const latestAllowedEnd = new Date(today);
  latestAllowedEnd.setUTCFullYear(latestAllowedEnd.getUTCFullYear() + 1);
  if (end > latestAllowedEnd) {
    throw new Error(`endDate must be within one year of today (no later than ${latestAllowedEnd.toISOString().slice(0, 10)} for this local preflight).`);
  }
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

interface ParsedYearMonth {
  year: number;
  month: number;
}

function parseYearMonth(value: string): ParsedYearMonth {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!match) throw new Error(`Invalid year-month "${value}". Expected YYYY-MM.`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

function formatYearMonth(value: ParsedYearMonth): string {
  return `${String(value.year).padStart(4, "0")}-${String(value.month).padStart(2, "0")}`;
}

function addMonths(value: ParsedYearMonth, months: number): ParsedYearMonth {
  const absoluteMonth = value.year * 12 + value.month - 1 + months;
  return {
    year: Math.floor(absoluteMonth / 12),
    month: ((absoluteMonth % 12) + 12) % 12 + 1,
  };
}

function monthsBetweenInclusive(start: ParsedYearMonth, end: ParsedYearMonth): number {
  return (end.year - start.year) * 12 + end.month - start.month + 1;
}

function toApiYearMonth(value: ParsedYearMonth): KeywordPlanYearMonth {
  const month = MONTHS[value.month - 1];
  if (!month) throw new Error(`Invalid month number ${value.month}.`);
  return { year: String(value.year), month };
}

export interface ResolvedHistoryRange {
  startYearMonth: string;
  endYearMonth: string;
  monthCount: number;
  apiRange: { start: KeywordPlanYearMonth; end: KeywordPlanYearMonth };
}

export const MAX_KEYWORD_PLANNER_MONTHLY_POINTS = 50_000;

export function assertKeywordPlannerHistoryPointBudget(
  keywordCount: number,
  monthCount: number
): number {
  const estimatedMonthlyPointCount = keywordCount * monthCount;
  if (estimatedMonthlyPointCount > MAX_KEYWORD_PLANNER_MONTHLY_POINTS) {
    throw new Error(`This request could make Google return up to ${estimatedMonthlyPointCount.toLocaleString("en-US")} monthly points. Split the keyword list or shorten the history range; includeMonthlySearchVolumes=false only reduces the final MCP payload, not Google's upstream response.`);
  }
  return estimatedMonthlyPointCount;
}

export function resolveKeywordPlannerHistoryRange(
  startYearMonth: string | undefined,
  endYearMonth: string | undefined,
  historyMonths = 24,
  now = new Date()
): ResolvedHistoryRange {
  let start: ParsedYearMonth;
  let end: ParsedYearMonth;

  if (startYearMonth || endYearMonth) {
    if (!startYearMonth || !endYearMonth) {
      throw new Error("startYearMonth and endYearMonth must be supplied together.");
    }
    start = parseYearMonth(startYearMonth);
    end = parseYearMonth(endYearMonth);
  } else {
    if (!Number.isInteger(historyMonths) || historyMonths < 3 || historyMonths > 48) {
      throw new Error("historyMonths must be an integer between 3 and 48.");
    }
    const current = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
    end = addMonths(current, -1);
    start = addMonths(end, -(historyMonths - 1));
  }

  const monthCount = monthsBetweenInclusive(start, end);
  if (monthCount < 1) throw new Error("startYearMonth must be on or before endYearMonth.");
  if (monthCount > 48) throw new Error("Google Ads historical search metrics support at most 48 months.");

  return {
    startYearMonth: formatYearMonth(start),
    endYearMonth: formatYearMonth(end),
    monthCount,
    apiRange: { start: toApiYearMonth(start), end: toApiYearMonth(end) },
  };
}

function targetingFields(input: {
  geoTargetIds?: string[];
  languageId?: string;
  network?: KeywordPlanNetwork;
  includeAdultKeywords?: boolean;
}): Pick<
  GenerateKeywordHistoricalMetricsRequest,
  "geoTargetConstants" | "language" | "keywordPlanNetwork" | "includeAdultKeywords"
> {
  return compactObject({
    geoTargetConstants: input.geoTargetIds
      ? [...new Set(input.geoTargetIds)].map((id) => `geoTargetConstants/${id}`)
      : undefined,
    language: input.languageId ? `languageConstants/${input.languageId}` : undefined,
    keywordPlanNetwork: input.network ?? "GOOGLE_SEARCH",
    includeAdultKeywords: input.includeAdultKeywords ?? false,
  });
}

export function buildKeywordHistoricalMetricsRequest(input: KeywordPlannerHistoryInput): {
  request: GenerateKeywordHistoricalMetricsRequest;
  historyRange: ResolvedHistoryRange;
} {
  const historyRange = resolveKeywordPlannerHistoryRange(
    input.startYearMonth,
    input.endYearMonth,
    input.historyMonths ?? 24
  );

  return {
    historyRange,
    request: {
      keywords: input.keywords,
      ...targetingFields(input),
      historicalMetricsOptions: {
        yearMonthRange: historyRange.apiRange,
        includeAverageCpc: input.includeAverageCpc ?? true,
      },
      ...(input.includeDeviceBreakdown
        ? { aggregateMetrics: { aggregateMetricTypes: ["DEVICE"] } }
        : {}),
    },
  };
}

interface NormalizedMonthlyVolume {
  date: string;
  year: number;
  month: MonthOfYear;
  monthNumber: number;
  monthlySearches: number | null;
  monthlySearchesRaw: string | null;
}

export function normalizeMonthlySearchVolumes(
  volumes: KeywordPlanMonthlySearchVolume[] | undefined
): NormalizedMonthlyVolume[] {
  const normalized: NormalizedMonthlyVolume[] = [];

  for (const volume of volumes ?? []) {
    const year = finiteNumber(volume.year);
    const month = volume.month;
    if (year === null || !month || month === "UNKNOWN" || month === "UNSPECIFIED") continue;
    const monthNumber = MONTH_NUMBER.get(month);
    if (!monthNumber) continue;
    normalized.push({
      date: `${String(Math.trunc(year)).padStart(4, "0")}-${String(monthNumber).padStart(2, "0")}`,
      year: Math.trunc(year),
      month,
      monthNumber,
      monthlySearches: safeIntegerNumber(volume.monthlySearches),
      monthlySearchesRaw: volume.monthlySearches == null
        ? null
        : String(volume.monthlySearches),
    });
  }

  return normalized.sort((a, b) => a.date.localeCompare(b.date));
}

export function computeKeywordPlannerTrends(volumes: KeywordPlanMonthlySearchVolume[] | undefined) {
  const monthly = normalizeMonthlySearchVolumes(volumes);
  const latest = [...monthly].reverse().find((volume) => volume.monthlySearches !== null) ?? null;
  if (!latest) {
    return {
      latestMonth: null,
      threeMonthBaseline: null,
      threeMonthChangePercent: null,
      threeMonthDirection: "UNAVAILABLE" as const,
      threeMonthChangeUnavailableReason: "LATEST_VALUE_UNAVAILABLE" as const,
      yearAgoBaseline: null,
      yearOverYearChangePercent: null,
      yearOverYearDirection: "UNAVAILABLE" as const,
      yearOverYearChangeUnavailableReason: "LATEST_VALUE_UNAVAILABLE" as const,
      latest12Months: null,
      previous12Months: null,
      rolling12MonthYearOverYearChangePercent: null,
    };
  }

  const latestYearMonth = parseYearMonth(latest.date);
  const threeMonthDate = formatYearMonth(addMonths(latestYearMonth, -2));
  const yearAgoDate = formatYearMonth(addMonths(latestYearMonth, -12));
  const threeMonthBaseline = monthly.find((volume) => volume.date === threeMonthDate) ?? null;
  const yearAgoBaseline = monthly.find((volume) => volume.date === yearAgoDate) ?? null;
  const threeMonthChangePercent = percentChange(
    latest.monthlySearches,
    threeMonthBaseline?.monthlySearches ?? null
  );
  const yearOverYearChangePercent = percentChange(
    latest.monthlySearches,
    yearAgoBaseline?.monthlySearches ?? null
  );
  const summarizeWindow = (startOffset: number, endOffset: number) => {
    const startDate = formatYearMonth(addMonths(latestYearMonth, startOffset));
    const endDate = formatYearMonth(addMonths(latestYearMonth, endOffset));
    const values = monthly
      .filter((volume) => volume.date >= startDate && volume.date <= endDate)
      .map((volume) => volume.monthlySearches)
      .filter((value): value is number => value !== null);
    const total = values.reduce((sum, value) => sum + value, 0);
    return {
      startDate,
      endDate,
      availableMonthCount: values.length,
      totalSearches: values.length > 0 ? total : null,
      averageMonthlySearches: values.length > 0 ? round(total / values.length, 2) : null,
    };
  };
  const latest12Months = summarizeWindow(-11, 0);
  const previous12Months = summarizeWindow(-23, -12);
  const rolling12MonthYearOverYearChangePercent = latest12Months.availableMonthCount === 12
    && previous12Months.availableMonthCount === 12
    ? percentChange(
        latest12Months.averageMonthlySearches,
        previous12Months.averageMonthlySearches
      )
    : null;

  return {
    latestMonth: { date: latest.date, searches: latest.monthlySearches },
    threeMonthBaseline: threeMonthBaseline
      ? { date: threeMonthBaseline.date, searches: threeMonthBaseline.monthlySearches }
      : null,
    threeMonthChangePercent,
    threeMonthDirection: changeDirection(threeMonthChangePercent),
    threeMonthChangeUnavailableReason: changeUnavailableReason(
      latest.monthlySearches,
      threeMonthBaseline?.monthlySearches ?? null
    ),
    yearAgoBaseline: yearAgoBaseline
      ? { date: yearAgoBaseline.date, searches: yearAgoBaseline.monthlySearches }
      : null,
    yearOverYearChangePercent,
    yearOverYearDirection: changeDirection(yearOverYearChangePercent),
    yearOverYearChangeUnavailableReason: changeUnavailableReason(
      latest.monthlySearches,
      yearAgoBaseline?.monthlySearches ?? null
    ),
    latest12Months,
    previous12Months,
    rolling12MonthYearOverYearChangePercent,
  };
}

function normalizeMicros(value: string | undefined) {
  const amount = finiteNumber(value);
  return {
    micros: value ?? null,
    amount: amount === null ? null : amount / 1_000_000,
  };
}

export function normalizeKeywordHistoricalMetrics(
  metrics: KeywordPlanHistoricalMetrics | undefined,
  includeMonthlySearchVolumes = true
) {
  const monthlySearchVolumes = normalizeMonthlySearchVolumes(metrics?.monthlySearchVolumes);
  return {
    avgMonthlySearches: safeIntegerNumber(metrics?.avgMonthlySearches),
    avgMonthlySearchesRaw: metrics?.avgMonthlySearches ?? null,
    competition: metrics?.competition ?? null,
    competitionIndex: safeIntegerNumber(metrics?.competitionIndex),
    competitionIndexRaw: metrics?.competitionIndex ?? null,
    lowTopOfPageBid: normalizeMicros(metrics?.lowTopOfPageBidMicros),
    highTopOfPageBid: normalizeMicros(metrics?.highTopOfPageBidMicros),
    averageCpc: normalizeMicros(metrics?.averageCpcMicros),
    monthlySearchVolumes: includeMonthlySearchVolumes ? monthlySearchVolumes : undefined,
    trends: computeKeywordPlannerTrends(metrics?.monthlySearchVolumes),
  };
}

function normalizeHistoricalResult(
  result: GenerateKeywordHistoricalMetricsResult,
  includeMonthlySearchVolumes: boolean
) {
  return {
    keyword: result.text ?? null,
    closeVariants: result.closeVariants ?? [],
    metrics: normalizeKeywordHistoricalMetrics(
      result.keywordMetrics,
      includeMonthlySearchVolumes
    ),
  };
}

function normalizeIdeaResult(result: GenerateKeywordIdeaResult) {
  return {
    keyword: result.text ?? null,
    closeVariants: result.closeVariants ?? [],
    metrics: normalizeKeywordHistoricalMetrics(result.keywordIdeaMetrics),
    concepts: result.keywordAnnotations?.concepts ?? [],
  };
}

function normalizeAggregateMetrics(results: KeywordPlanAggregateMetricResults | undefined) {
  return {
    deviceSearches: (results?.deviceSearches ?? []).map((entry) => ({
      device: entry.device ?? null,
      searches: safeIntegerNumber(entry.searchCount),
      searchesRaw: entry.searchCount ?? null,
    })),
  };
}

export function buildKeywordIdeasRequest(input: KeywordPlannerIdeasInput): {
  request: GenerateKeywordIdeasRequest;
  historyRange: ResolvedHistoryRange;
  seedType: "KEYWORD" | "URL" | "KEYWORD_AND_URL" | "SITE";
} {
  const hasKeywords = (input.seedKeywords?.length ?? 0) > 0;
  const hasUrl = Boolean(input.url);
  const hasSite = Boolean(input.site);

  if (hasSite && (hasKeywords || hasUrl)) {
    throw new Error("site is an exclusive seed; do not combine it with seedKeywords or url.");
  }
  if (!hasSite && !hasKeywords && !hasUrl) {
    throw new Error("Provide seedKeywords, url, both seedKeywords and url, or site.");
  }

  const historyRange = resolveKeywordPlannerHistoryRange(
    input.startYearMonth,
    input.endYearMonth,
    input.historyMonths ?? 13
  );
  let seed: Pick<
    GenerateKeywordIdeasRequest,
    "keywordSeed" | "urlSeed" | "keywordAndUrlSeed" | "siteSeed"
  >;
  let seedType: "KEYWORD" | "URL" | "KEYWORD_AND_URL" | "SITE";

  if (hasSite) {
    seed = { siteSeed: { site: input.site! } };
    seedType = "SITE";
  } else if (hasKeywords && hasUrl) {
    seed = { keywordAndUrlSeed: { keywords: input.seedKeywords!, url: input.url! } };
    seedType = "KEYWORD_AND_URL";
  } else if (hasKeywords) {
    seed = { keywordSeed: { keywords: input.seedKeywords! } };
    seedType = "KEYWORD";
  } else {
    seed = { urlSeed: { url: input.url! } };
    seedType = "URL";
  }

  return {
    historyRange,
    seedType,
    request: compactObject({
      ...targetingFields(input),
      ...seed,
      historicalMetricsOptions: {
        yearMonthRange: historyRange.apiRange,
        includeAverageCpc: input.includeAverageCpc ?? true,
      },
      aggregateMetrics: input.includeDeviceBreakdown
        ? { aggregateMetricTypes: ["DEVICE" as const] }
        : undefined,
      keywordAnnotation: input.includeKeywordConcepts === false ? undefined : ["KEYWORD_CONCEPT" as const],
      pageSize: input.pageSize ?? 100,
      pageToken: input.pageToken,
    }),
  };
}

function currencyToMicros(value: number): string {
  const unroundedMicros = value * 1_000_000;
  const micros = Math.round(unroundedMicros);
  if (Math.abs(unroundedMicros - micros) > 0.000001) {
    throw new Error(`Currency amount ${value} has more than six decimal places and cannot be represented exactly in micros.`);
  }
  if (micros < 1) {
    throw new Error(`Currency amount ${value} is smaller than one micro unit.`);
  }
  if (!Number.isSafeInteger(micros)) {
    throw new Error(`Currency amount ${value} is too large to convert safely to micros.`);
  }
  return String(micros);
}

export function buildKeywordForecastRequest(
  input: KeywordPlannerForecastInput,
  now = new Date()
): {
  request: GenerateKeywordForecastMetricsRequest;
  periodDays: number | null;
} {
  const biddingStrategy = input.biddingStrategy ?? "MANUAL_CPC";
  const matchType = input.matchType ?? "BROAD";
  const periodDays = inclusiveDays(input.startDate, input.endDate, now);
  let apiBiddingStrategy: GenerateKeywordForecastMetricsRequest["campaign"]["biddingStrategy"];

  if (biddingStrategy === "MANUAL_CPC") {
    if (input.maxCpcBid === undefined) {
      throw new Error("maxCpcBid is required when biddingStrategy is MANUAL_CPC.");
    }
    apiBiddingStrategy = {
      manualCpcBiddingStrategy: compactObject({
        maxCpcBidMicros: currencyToMicros(input.maxCpcBid),
        dailyBudgetMicros: input.dailyBudget === undefined
          ? undefined
          : currencyToMicros(input.dailyBudget),
      }),
    };
  } else if (biddingStrategy === "MAXIMIZE_CLICKS") {
    if (input.dailyBudget === undefined) {
      throw new Error("dailyBudget is required when biddingStrategy is MAXIMIZE_CLICKS.");
    }
    apiBiddingStrategy = {
      maximizeClicksBiddingStrategy: compactObject({
        dailyTargetSpendMicros: currencyToMicros(input.dailyBudget),
        maxCpcBidCeilingMicros: input.maxCpcBidCeiling === undefined
          ? undefined
          : currencyToMicros(input.maxCpcBidCeiling),
      }),
    };
  } else {
    if (input.dailyBudget === undefined) {
      throw new Error("dailyBudget is required when biddingStrategy is MAXIMIZE_CONVERSIONS.");
    }
    apiBiddingStrategy = {
      maximizeConversionsBiddingStrategy: {
        dailyTargetSpendMicros: currencyToMicros(input.dailyBudget),
      },
    };
  }

  return {
    periodDays,
    request: compactObject({
      currencyCode: input.currencyCode,
      forecastPeriod: input.startDate && input.endDate
        ? { startDate: input.startDate, endDate: input.endDate }
        : undefined,
      campaign: compactObject({
        biddingStrategy: apiBiddingStrategy,
        adGroups: [{
          keywords: input.keywords.map((text) => ({ text, matchType })),
        }],
        geoTargetConstants: input.geoTargetIds
          ? [...new Set(input.geoTargetIds)].map((id) => `geoTargetConstants/${id}`)
          : undefined,
        languageConstants: input.languageIds
          ? [...new Set(input.languageIds)].map((id) => `languageConstants/${id}`)
          : undefined,
      }),
    }),
  };
}

export function normalizeKeywordForecastMetrics(
  metrics: KeywordForecastMetrics | undefined,
  periodDays: number | null
) {
  const clicks = finiteNumber(metrics?.clicks);
  const conversions = finiteNumber(metrics?.conversions);
  const cost = normalizeMicros(metrics?.costMicros);
  const averageCpc = normalizeMicros(metrics?.averageCpcMicros);
  const averageCpa = normalizeMicros(metrics?.averageCpaMicros);
  // Google stopped returning a conversion rate in API v24; conversions per click is its definition.
  const conversionRate = clicks !== null && clicks > 0 && conversions !== null
    ? conversions / clicks
    : null;

  return {
    clicks,
    cost,
    averageCpc,
    conversions,
    conversionRate: conversionRate === null ? null : round(conversionRate, 6),
    conversionRatePercent: conversionRate === null ? null : round(conversionRate * 100, 4),
    conversionRateSource: conversionRate === null ? null : "derived: conversions / clicks",
    averageCpa,
    dailyAverages: periodDays === null
      ? null
      : {
          days: periodDays,
          clicks: clicks === null ? null : round(clicks / periodDays, 4),
          cost: cost.amount === null ? null : round(cost.amount / periodDays, 6),
          conversions: conversions === null ? null : round(conversions / periodDays, 4),
        },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const trendDefinitions = {
  threeMonthChangePercent: "Percent change between the latest available month and the month two calendar months earlier, matching the Keyword Planner UI definition.",
  yearOverYearChangePercent: "Percent change between the latest available month and the same calendar month one year earlier.",
  rolling12MonthYearOverYearChangePercent: "Derived change between the average of the latest 12 available calendar slots and the preceding 12-month window; this is additional analysis, not the UI YoY column.",
  unavailableChange: "A percent is null when a baseline month is missing/null or is zero while the latest value is non-zero.",
};

export function registerGoogleAdsKeywordPlannerTools(
  server: McpServer,
  client: GoogleAdsClient,
  ok: ToolSuccessFormatter
): void {
  server.tool(
    "google_ads_generate_keyword_historical_metrics",
    "Get Keyword Planner search-volume history for supplied keywords. Returns average monthly searches, monthly volumes (up to 48 months), latest volume, computed 3-month and YoY changes, competition, CPC/bid ranges, close variants, and optional device totals. This is a read-only planless RPC.",
    {
      customerId: customerIdSchema.describe("Google Ads serving customer ID; use the client account, not its MCC manager"),
      keywords: z.array(keywordTextSchema).min(1).max(10_000).describe("Keywords to analyze; Google may combine near-exact close variants"),
      geoTargetIds: z.array(numericIdSchema).max(10).optional().default([]).describe("Geo target criterion IDs, e.g. 2250 for France; empty means all geographies"),
      languageId: numericIdSchema.optional().describe("Optional language criterion ID, e.g. 1002 for French; omit for all languages"),
      network: networkSchema.optional().default("GOOGLE_SEARCH"),
      includeAdultKeywords: z.boolean().optional().default(false),
      includeAverageCpc: z.boolean().optional().default(true).describe("Request legacy average CPC in addition to top-of-page bid ranges"),
      includeDeviceBreakdown: z.boolean().optional().default(false).describe("Return aggregate searches by device across all requested keywords"),
      includeMonthlySearchVolumes: z.boolean().optional().default(true).describe("Include every monthly point in the MCP output. Set false to trim an allowed response; Google's upstream series and the 50,000-point guard are unchanged"),
      historyMonths: z.number().int().min(3).max(48).optional().default(24).describe("History length when no explicit YYYY-MM range is supplied; 24 enables YoY calculation"),
      startYearMonth: yearMonthSchema.optional().describe("Optional inclusive historical range start YYYY-MM"),
      endYearMonth: yearMonthSchema.optional().describe("Optional inclusive historical range end YYYY-MM"),
    },
    async ({
      customerId,
      keywords,
      geoTargetIds,
      languageId,
      network,
      includeAdultKeywords,
      includeAverageCpc,
      includeDeviceBreakdown,
      includeMonthlySearchVolumes,
      historyMonths,
      startYearMonth,
      endYearMonth,
    }) => {
      try {
        const startedAt = Date.now();
        const { request, historyRange } = buildKeywordHistoricalMetricsRequest({
          keywords,
          geoTargetIds,
          languageId,
          network,
          includeAdultKeywords,
          includeAverageCpc,
          includeDeviceBreakdown,
          historyMonths,
          startYearMonth,
          endYearMonth,
        });
        const estimatedMonthlyPointCount = assertKeywordPlannerHistoryPointBudget(
          keywords.length,
          historyRange.monthCount
        );
        const response = await client.generateKeywordHistoricalMetrics(customerId, request);
        const results = (response.results ?? []).map((result) => normalizeHistoricalResult(
          result,
          includeMonthlySearchVolumes
        ));
        const warnings: string[] = [];
        if (results.length < keywords.length) {
          warnings.push("Google returned fewer rows than requested keywords because near-exact close variants are de-duplicated and some keywords can lack data.");
        }

        return ok({
          dataKind: "historical_search_volume",
          isApproximate: true,
          updatedMonthly: true,
          results,
          count: results.length,
          requestedKeywordCount: keywords.length,
          estimatedMonthlyPointCount,
          historyRange: {
            startYearMonth: historyRange.startYearMonth,
            endYearMonth: historyRange.endYearMonth,
            monthCount: historyRange.monthCount,
          },
          targeting: {
            geoTargetIds,
            languageId: languageId ?? null,
            network,
          },
          aggregateMetrics: normalizeAggregateMetrics(response.aggregateMetricResults),
          trendDefinitions,
          derivedFields: [
            "results[].metrics.trends.threeMonthChangePercent",
            "results[].metrics.trends.yearOverYearChangePercent",
            "results[].metrics.trends.rolling12MonthYearOverYearChangePercent",
          ],
          currency: "Bid and CPC amount fields are in the serving customer account currency; micros are also preserved as strings.",
          warnings,
          limitations: [
            "Search volumes and forecast-style bid values are Google estimates, not observed campaign impressions.",
            "Ad impression share shown in some Keyword Planner UI views is not exposed by GenerateKeywordHistoricalMetrics; use keyword performance reporting for serving keywords.",
          ],
          nextActions: [
            "Use google_ads_generate_keyword_forecast_metrics to estimate impressions, clicks, and cost for a selected keyword set.",
            "Use google_ads_generate_keyword_ideas to expand the keyword list.",
          ],
          debug: { requestCount: 1, executionTimeMs: Date.now() - startedAt },
        });
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );

  server.tool(
    "google_ads_generate_keyword_ideas",
    "Discover Keyword Planner ideas from up to 20 seed keywords, a URL, keywords plus URL, or a whole site. Returns historical volume, monthly trends, computed 3-month/YoY changes, competition, bids, close variants, optional concepts, and pagination. Read-only; no plan is saved.",
    {
      customerId: customerIdSchema.describe("Google Ads serving customer ID; use the client account, not its MCC manager"),
      seedKeywords: z.array(keywordTextSchema).min(1).max(20).optional(),
      url: z.string().trim().min(1).optional().describe("Specific page URL to crawl; combine with seedKeywords if desired"),
      site: z.string().trim().min(1).optional().describe("Whole-domain seed; exclusive with seedKeywords/url"),
      geoTargetIds: z.array(numericIdSchema).max(10).optional().default([]),
      languageId: numericIdSchema.optional(),
      network: networkSchema.optional().default("GOOGLE_SEARCH"),
      includeAdultKeywords: z.boolean().optional().default(false),
      includeAverageCpc: z.boolean().optional().default(true),
      includeDeviceBreakdown: z.boolean().optional().default(false),
      includeKeywordConcepts: z.boolean().optional().default(true),
      historyMonths: z.number().int().min(3).max(48).optional().default(13).describe("13 months is enough to compute latest-month YoY while limiting response size"),
      startYearMonth: yearMonthSchema.optional(),
      endYearMonth: yearMonthSchema.optional(),
      pageSize: z.number().int().min(1).max(10_000).optional().default(100).describe("Google supports up to 10,000; keep pages small for interactive MCP use and use larger pages only for controlled exports"),
      pageToken: z.string().optional().describe("nextPageToken from a prior identical request"),
    },
    async ({
      customerId,
      seedKeywords,
      url,
      site,
      geoTargetIds,
      languageId,
      network,
      includeAdultKeywords,
      includeAverageCpc,
      includeDeviceBreakdown,
      includeKeywordConcepts,
      historyMonths,
      startYearMonth,
      endYearMonth,
      pageSize,
      pageToken,
    }) => {
      try {
        const startedAt = Date.now();
        const { request, historyRange, seedType } = buildKeywordIdeasRequest({
          seedKeywords,
          url,
          site,
          geoTargetIds,
          languageId,
          network,
          includeAdultKeywords,
          includeAverageCpc,
          includeDeviceBreakdown,
          includeKeywordConcepts,
          historyMonths,
          startYearMonth,
          endYearMonth,
          pageSize,
          pageToken,
        });
        const estimatedMonthlyPointCount = assertKeywordPlannerHistoryPointBudget(
          pageSize,
          historyRange.monthCount
        );
        const response = await client.generateKeywordIdeas(customerId, request);
        const ideas = (response.results ?? []).map(normalizeIdeaResult);
        const nextPageToken = response.nextPageToken ?? null;

        return ok({
          dataKind: "keyword_ideas_with_historical_search_volume",
          isApproximate: true,
          updatedMonthly: true,
          ideas,
          count: ideas.length,
          estimatedMonthlyPointCount,
          totalSize: safeIntegerNumber(response.totalSize),
          totalSizeRaw: response.totalSize ?? null,
          nextPageToken,
          seedType,
          historyRange: {
            startYearMonth: historyRange.startYearMonth,
            endYearMonth: historyRange.endYearMonth,
            monthCount: historyRange.monthCount,
          },
          targeting: { geoTargetIds, languageId: languageId ?? null, network },
          aggregateMetrics: normalizeAggregateMetrics(response.aggregateMetricResults),
          trendDefinitions,
          derivedFields: [
            "ideas[].metrics.trends.threeMonthChangePercent",
            "ideas[].metrics.trends.yearOverYearChangePercent",
            "ideas[].metrics.trends.rolling12MonthYearOverYearChangePercent",
          ],
          currency: "Bid and CPC amount fields are in the serving customer account currency; micros are also preserved as strings.",
          warnings: nextPageToken
            ? ["More keyword ideas are available; repeat the same request with nextPageToken as pageToken."]
            : [],
          limitations: [
            "Google can canonicalize ideas and combine close variants.",
            "Keep every request field identical when following a page token.",
          ],
          nextActions: [
            "Pass selected ideas to google_ads_generate_keyword_historical_metrics for a focused history table.",
            "Forecast the final list with google_ads_generate_keyword_forecast_metrics.",
          ],
          debug: { requestCount: 1, executionTimeMs: Date.now() - startedAt },
        });
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );

  server.tool(
    "google_ads_generate_keyword_forecast_metrics",
    "Forecast clicks, CPC, cost, conversions, and CPA for a temporary keyword campaign. Supports location and language targeting, match type, three bidding strategies, explicit future dates, and an optional independent per-keyword breakdown. This read-only planless RPC does not create a campaign or saved plan.",
    {
      customerId: customerIdSchema.describe("Google Ads serving customer ID; use a relevant client account for better estimates"),
      keywords: z.array(keywordTextSchema).min(1).max(1000),
      matchType: matchTypeSchema.optional().default("BROAD"),
      geoTargetIds: z.array(numericIdSchema).max(20).optional().default([]),
      languageIds: z.array(numericIdSchema).max(10).optional().default([]),
      biddingStrategy: z.enum(["MANUAL_CPC", "MAXIMIZE_CLICKS", "MAXIMIZE_CONVERSIONS"]).optional().default("MANUAL_CPC"),
      maxCpcBid: currencyAmountSchema.optional().describe("Bid in standard account-currency units; required for MANUAL_CPC"),
      dailyBudget: currencyAmountSchema.optional().describe("Daily amount in standard currency units; required for maximize strategies and optional for MANUAL_CPC"),
      maxCpcBidCeiling: currencyAmountSchema.optional().describe("Optional standard-currency CPC ceiling for MAXIMIZE_CLICKS"),
      currencyCode: z.string().regex(/^[A-Z]{3}$/).optional().describe("Optional ISO 4217 conversion currency; account currency is used by default"),
      startDate: isoDateSchema.optional().describe("Optional inclusive future forecast start YYYY-MM-DD; supply with endDate"),
      endDate: isoDateSchema.optional().describe("Optional inclusive forecast end YYYY-MM-DD, no more than one year ahead; supply with startDate"),
      includeKeywordBreakdown: z.boolean().optional().default(false).describe("Make independent one-keyword forecast calls in addition to the combined campaign forecast"),
      keywordBreakdownLimit: z.number().int().min(1).max(20).optional().default(10).describe("Safety cap for additional rate-limited Keyword Planner requests"),
    },
    async ({
      customerId,
      keywords,
      matchType,
      geoTargetIds,
      languageIds,
      biddingStrategy,
      maxCpcBid,
      dailyBudget,
      maxCpcBidCeiling,
      currencyCode,
      startDate,
      endDate,
      includeKeywordBreakdown,
      keywordBreakdownLimit,
    }) => {
      try {
        const startedAt = Date.now();
        const baseInput: KeywordPlannerForecastInput = {
          keywords,
          matchType,
          geoTargetIds,
          languageIds,
          biddingStrategy,
          maxCpcBid,
          dailyBudget,
          maxCpcBidCeiling,
          currencyCode,
          startDate,
          endDate,
        };
        const { request, periodDays } = buildKeywordForecastRequest(baseInput);
        const deadlineAtMs = includeKeywordBreakdown
          ? startedAt + FORECAST_WITH_BREAKDOWN_TIME_BUDGET_MS
          : undefined;
        const response = await client.generateKeywordForecastMetrics(
          customerId,
          request,
          deadlineAtMs
        );
        const campaignForecast = normalizeKeywordForecastMetrics(
          response.campaignForecastMetrics,
          periodDays
        );
        const warnings: string[] = [];
        const keywordForecasts: Array<Record<string, unknown>> = [];
        let requestCount = 1;

        if (includeKeywordBreakdown) {
          const breakdownKeywords = keywords.slice(0, keywordBreakdownLimit);
          if (keywords.length > keywordBreakdownLimit) {
            warnings.push(`Independent keyword breakdown was capped at ${keywordBreakdownLimit} of ${keywords.length} keywords to protect the rate-limited planning quota.`);
          }

          if (keywords.length === 1) {
            keywordForecasts.push({ keyword: keywords[0], metrics: campaignForecast });
          } else {
            for (const keyword of breakdownKeywords) {
              if (deadlineAtMs !== undefined && Date.now() >= deadlineAtMs) {
                warnings.push("Independent keyword breakdown stopped because the 45-second forecast tool time budget was exhausted; partial results are returned.");
                break;
              }
              requestCount += 1;
              try {
                const single = buildKeywordForecastRequest({ ...baseInput, keywords: [keyword] });
                const singleResponse = await client.generateKeywordForecastMetrics(
                  customerId,
                  single.request,
                  deadlineAtMs
                );
                keywordForecasts.push({
                  keyword,
                  metrics: normalizeKeywordForecastMetrics(
                    singleResponse.campaignForecastMetrics,
                    single.periodDays
                  ),
                });
              } catch (error) {
                keywordForecasts.push({ keyword, error: errorMessage(error) });
                warnings.push(`Independent forecast failed for "${keyword}"; the combined forecast remains available.`);
                if (deadlineAtMs !== undefined && Date.now() >= deadlineAtMs) {
                  warnings.push("Independent keyword breakdown stopped because the 45-second forecast tool time budget was exhausted; partial results are returned.");
                  break;
                }
              }
            }
          }
        }

        return ok({
          dataKind: "keyword_campaign_forecast",
          aggregationLevel: "campaign",
          isEstimate: true,
          campaignForecast,
          keywordForecasts,
          keywordCount: keywords.length,
          forecastPeriod: startDate && endDate
            ? { startDate, endDate, days: periodDays }
            : { googleDefault: "next Sunday through the following Saturday in the customer account time zone" },
          settings: {
            matchType,
            geoTargetIds,
            languageIds,
            biddingStrategy,
            currencyCode: currencyCode ?? "CUSTOMER_ACCOUNT_CURRENCY",
          },
          warnings,
          limitations: [
            "Google Ads API v26 returns the planless forecast at campaign level only, for Google Search.",
            "Since API v24 Google no longer returns impressions or click-through rate for these forecasts, and no longer accepts negative keywords, a network or an expected conversion rate. conversionRate is derived as conversions divided by clicks.",
            "keywordForecasts, when requested, simulate each keyword independently; they are not additive and can differ from the combined forecast because keywords compete and overlap.",
            "Forecasts are estimates influenced by the selected customer account, bids, budget, targeting, seasonality, and expected quality.",
          ],
          nextActions: [
            "Compare multiple bid/budget scenarios with the same targeting and period.",
            "Use historical metrics first to remove low-volume or irrelevant keywords before requesting breakdowns.",
          ],
          debug: {
            requestCount,
            executionTimeMs: Date.now() - startedAt,
            timeBudgetMs: includeKeywordBreakdown
              ? FORECAST_WITH_BREAKDOWN_TIME_BUDGET_MS
              : null,
          },
        });
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );
}
