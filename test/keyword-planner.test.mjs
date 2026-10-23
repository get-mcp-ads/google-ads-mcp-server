import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.ts";
import { GoogleAdsClient } from "../src/platforms/google-ads/client.ts";
import { KeywordPlannerRateLimiter } from "../src/core/rate-limiter.ts";
import {
  assertKeywordPlannerHistoryPointBudget,
  buildKeywordForecastRequest,
  buildKeywordHistoricalMetricsRequest,
  buildKeywordIdeasRequest,
  computeKeywordPlannerTrends,
  normalizeKeywordForecastMetrics,
  normalizeKeywordHistoricalMetrics,
} from "../src/platforms/google-ads/keyword-planner.ts";

test("historical point budget accepts the boundary and rejects oversized upstream responses", () => {
  assert.equal(assertKeywordPlannerHistoryPointBudget(1_000, 50), 50_000);
  assert.throws(
    () => assertKeywordPlannerHistoryPointBudget(1_001, 50),
    /50,050 monthly points/
  );
});

test("historical request normalizes targeting and an explicit month range", () => {
  const { request, historyRange } = buildKeywordHistoricalMetricsRequest({
    keywords: ["galerie lafayette"],
    geoTargetIds: ["2250"],
    languageId: "1002",
    network: "GOOGLE_SEARCH",
    includeDeviceBreakdown: true,
    startYearMonth: "2025-01",
    endYearMonth: "2026-06",
  });

  assert.deepEqual(request.geoTargetConstants, ["geoTargetConstants/2250"]);
  assert.equal(request.language, "languageConstants/1002");
  assert.equal(request.keywordPlanNetwork, "GOOGLE_SEARCH");
  assert.deepEqual(request.aggregateMetrics, { aggregateMetricTypes: ["DEVICE"] });
  assert.deepEqual(request.historicalMetricsOptions?.yearMonthRange, {
    start: { year: "2025", month: "JANUARY" },
    end: { year: "2026", month: "JUNE" },
  });
  assert.equal(historyRange.monthCount, 18);
});

test("trend math sorts months and matches Keyword Planner three-month and YoY definitions", () => {
  const volumes = [
    { year: "2026", month: "JUNE", monthlySearches: "120" },
    { year: "2025", month: "JUNE", monthlySearches: "150" },
    { year: "2026", month: "APRIL", monthlySearches: "100" },
    { year: "2026", month: "MAY", monthlySearches: "110" },
  ];

  const trends = computeKeywordPlannerTrends(volumes);
  assert.deepEqual(trends.latestMonth, { date: "2026-06", searches: 120 });
  assert.deepEqual(trends.threeMonthBaseline, { date: "2026-04", searches: 100 });
  assert.equal(trends.threeMonthChangePercent, 20);
  assert.deepEqual(trends.yearAgoBaseline, { date: "2025-06", searches: 150 });
  assert.equal(trends.yearOverYearChangePercent, -20);
});

test("trend math handles zero baselines and only computes rolling YoY from two full windows", () => {
  const months = [
    "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
    "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
  ];
  const fullHistory = [];
  for (let offset = 0; offset < 24; offset += 1) {
    const absoluteMonth = 2024 * 12 + 6 + offset;
    fullHistory.push({
      year: String(Math.floor(absoluteMonth / 12)),
      month: months[absoluteMonth % 12],
      monthlySearches: offset < 12 ? "100" : "200",
    });
  }
  const rolling = computeKeywordPlannerTrends(fullHistory);
  assert.equal(rolling.rolling12MonthYearOverYearChangePercent, 100);
  assert.equal(rolling.latest12Months.availableMonthCount, 12);
  assert.equal(rolling.previous12Months.availableMonthCount, 12);

  const zeroBaseline = computeKeywordPlannerTrends([
    { year: "2026", month: "APRIL", monthlySearches: "0" },
    { year: "2026", month: "JUNE", monthlySearches: "100" },
  ]);
  assert.equal(zeroBaseline.threeMonthChangePercent, null);
  assert.equal(zeroBaseline.threeMonthChangeUnavailableReason, "BASELINE_IS_ZERO");
  assert.equal(zeroBaseline.rolling12MonthYearOverYearChangePercent, null);
});

test("historical metrics preserve micros and expose normalized currency amounts", () => {
  const metrics = normalizeKeywordHistoricalMetrics({
    avgMonthlySearches: "550000",
    competition: "HIGH",
    competitionIndex: "87",
    lowTopOfPageBidMicros: "80000",
    highTopOfPageBidMicros: "1250000",
    averageCpcMicros: "450000",
  });

  assert.equal(metrics.avgMonthlySearches, 550000);
  assert.deepEqual(metrics.lowTopOfPageBid, { micros: "80000", amount: 0.08 });
  assert.deepEqual(metrics.highTopOfPageBid, { micros: "1250000", amount: 1.25 });
  assert.deepEqual(metrics.averageCpc, { micros: "450000", amount: 0.45 });

  const withoutMonthlySeries = normalizeKeywordHistoricalMetrics({
    monthlySearchVolumes: [{ year: "2026", month: "JUNE", monthlySearches: "100" }],
  }, false);
  assert.equal(withoutMonthlySeries.monthlySearchVolumes, undefined);
  assert.deepEqual(withoutMonthlySeries.trends.latestMonth, {
    date: "2026-06",
    searches: 100,
  });
});

test("idea requests enforce exactly one seed shape", () => {
  const combined = buildKeywordIdeasRequest({
    seedKeywords: ["galerie"],
    url: "https://example.com/galerie",
    startYearMonth: "2025-06",
    endYearMonth: "2026-06",
  });
  assert.equal(combined.seedType, "KEYWORD_AND_URL");
  assert.deepEqual(combined.request.keywordAndUrlSeed, {
    keywords: ["galerie"],
    url: "https://example.com/galerie",
  });
  assert.throws(
    () => buildKeywordIdeasRequest({ seedKeywords: ["galerie"], site: "example.com" }),
    /exclusive seed/
  );
  assert.throws(() => buildKeywordIdeasRequest({}), /Provide seedKeywords/);
});

test("idea handler rejects oversized monthly histories before any HTTP request", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    throw new Error("oversized idea request must not reach OAuth or Google Ads");
  };

  const server = createServer({
    developerToken: "developer-token",
    clientId: "client-id",
    clientSecret: "client-secret",
    refreshToken: "refresh-token",
  });
  const mcpClient = new Client({ name: "keyword-idea-budget-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await Promise.all([
      server.connect(serverTransport),
      mcpClient.connect(clientTransport),
    ]);
    const result = await mcpClient.callTool({
      name: "google_ads_generate_keyword_ideas",
      arguments: {
        customerId: "1234567890",
        seedKeywords: ["galerie"],
        historyMonths: 48,
        pageSize: 1_042,
      },
    });

    assert.equal(result.isError, true);
    const textContent = result.content.find((content) => content.type === "text");
    assert.ok(textContent && "text" in textContent);
    const payload = JSON.parse(textContent.text);
    assert.match(payload.error, /50,016 monthly points/);
    assert.equal(fetchCount, 0);
  } finally {
    await mcpClient.close().catch(() => undefined);
    await server.close().catch(() => undefined);
    globalThis.fetch = originalFetch;
  }
});

test("forecast request converts standard currency to micros and normalizes response rates", () => {
  const fixedNow = new Date("2026-07-16T12:00:00Z");
  const { request, periodDays } = buildKeywordForecastRequest({
    keywords: ["galerie lafayette"],
    matchType: "EXACT",
    negativeKeywords: ["jobs"],
    geoTargetIds: ["2250"],
    languageIds: ["1002"],
    biddingStrategy: "MANUAL_CPC",
    maxCpcBid: 1.5,
    dailyBudget: 100,
    conversionRate: 0.02,
    currencyCode: "EUR",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
  }, fixedNow);

  assert.equal(periodDays, 31);
  assert.deepEqual(request.campaign.biddingStrategy, {
    manualCpcBiddingStrategy: {
      maxCpcBidMicros: "1500000",
      dailyBudgetMicros: "100000000",
    },
  });
  assert.equal(
    request.campaign.adGroups[0]?.biddableKeywords[0]?.keyword.matchType,
    "EXACT"
  );
  assert.deepEqual(request.campaign.geoModifiers, [
    { geoTargetConstant: "geoTargetConstants/2250" },
  ]);
  assert.deepEqual(request.campaign.languageConstants, ["languageConstants/1002"]);

  const normalized = normalizeKeywordForecastMetrics({
    impressions: 3100,
    clicks: 155,
    costMicros: "77500000",
    clickThroughRate: 0.05,
    averageCpcMicros: "500000",
    conversions: 3.1,
    conversionRate: 0.02,
    averageCpaMicros: "25000000",
  }, periodDays);
  assert.equal(normalized.cost.amount, 77.5);
  assert.equal(normalized.clickThroughRatePercent, 5);
  assert.equal(normalized.conversionRatePercent, 2);
  assert.equal(normalized.dailyAverages?.impressions, 100);

  assert.throws(
    () => buildKeywordForecastRequest({ keywords: ["test"], maxCpcBid: 1.0000001 }),
    /more than six decimal places/
  );
  assert.throws(
    () => buildKeywordForecastRequest({
      keywords: ["test"],
      maxCpcBid: 1,
      startDate: "2026-07-16",
      endDate: "2026-07-20",
    }, fixedNow),
    /must be in the future/
  );
  assert.throws(
    () => buildKeywordForecastRequest({
      keywords: ["test"],
      maxCpcBid: 1,
      startDate: "2026-08-01",
      endDate: "2027-07-17",
    }, fixedNow),
    /within one year/
  );

  const deduplicated = buildKeywordForecastRequest({
    keywords: ["test"],
    maxCpcBid: 1,
    geoTargetIds: ["2250", "2250"],
    languageIds: ["1002", "1002"],
  }, fixedNow);
  assert.deepEqual(deduplicated.request.campaign.geoModifiers, [
    { geoTargetConstant: "geoTargetConstants/2250" },
  ]);
  assert.deepEqual(deduplicated.request.campaign.languageConstants, [
    "languageConstants/1002",
  ]);
});

test("REST client calls the pinned-version planless historical endpoint with normalized headers", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ url: String(input), init });
    if (String(input) === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({
        access_token: "test-access-token",
        token_type: "Bearer",
        expires_in: 3600,
        scope: "https://www.googleapis.com/auth/adwords",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const client = new GoogleAdsClient({
      developerToken: "developer-token",
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "refresh-token",
      loginCustomerId: "999-888-7777",
    });
    await client.generateKeywordHistoricalMetrics("123-456-7890", {
      keywords: ["galerie lafayette"],
    });

    assert.equal(calls.length, 2);
    assert.equal(
      calls[1].url,
      "https://googleads.googleapis.com/v26/customers/1234567890:generateKeywordHistoricalMetrics"
    );
    assert.equal(calls[1].init.headers["developer-token"], "developer-token");
    assert.equal(calls[1].init.headers["login-customer-id"], "9998887777");
    assert.deepEqual(JSON.parse(calls[1].init.body), {
      keywords: ["galerie lafayette"],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("REST client uses the pinned-version planless ideas and forecast endpoints without mutating resources", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ url: String(input), init });
    if (String(input) === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({
        access_token: "test-access-token",
        token_type: "Bearer",
        expires_in: 3600,
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ results: [], campaignForecastMetrics: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const client = new GoogleAdsClient({
      developerToken: "developer-token",
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "refresh-token",
    });
    client.keywordPlannerRateLimiter = new KeywordPlannerRateLimiter(1);

    await client.generateKeywordIdeas("1234567890", {
      keywordSeed: { keywords: ["galerie"] },
      pageSize: 100,
    });
    await client.generateKeywordForecastMetrics("1234567890", {
      campaign: {
        keywordPlanNetwork: "GOOGLE_SEARCH",
        biddingStrategy: {
          manualCpcBiddingStrategy: { maxCpcBidMicros: "1000000" },
        },
        adGroups: [{
          biddableKeywords: [{ keyword: { text: "galerie", matchType: "BROAD" } }],
        }],
      },
    });

    const planningCalls = calls.filter((call) => call.url !== "https://oauth2.googleapis.com/token");
    assert.deepEqual(planningCalls.map((call) => call.url), [
      "https://googleads.googleapis.com/v26/customers/1234567890:generateKeywordIdeas",
      "https://googleads.googleapis.com/v26/customers/1234567890:generateKeywordForecastMetrics",
    ]);
    assert.deepEqual(JSON.parse(planningCalls[0].init.body), {
      keywordSeed: { keywords: ["galerie"] },
      pageSize: 100,
    });
    assert.equal(
      JSON.parse(planningCalls[1].init.body).campaign.adGroups[0].biddableKeywords[0].keyword.text,
      "galerie"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Keyword Planner quota is acquired immediately before every concurrent HTTP attempt", async () => {
  const originalFetch = globalThis.fetch;
  const rpcStartedAt = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({
        access_token: "test-access-token",
        token_type: "Bearer",
        expires_in: 3600,
        scope: "https://www.googleapis.com/auth/adwords",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    rpcStartedAt.push(Date.now());
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const client = new GoogleAdsClient({
      developerToken: "developer-token",
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "refresh-token",
    });
    // Use a short interval in this unit test; production defaults to 1,050 ms.
    client.keywordPlannerRateLimiter = new KeywordPlannerRateLimiter(20);

    // Warm the OAuth token so the assertion isolates physical planning RPCs.
    await client.generateKeywordHistoricalMetrics("1234567890", { keywords: ["warm"] });
    rpcStartedAt.length = 0;

    await Promise.all([
      client.generateKeywordHistoricalMetrics("1234567890", { keywords: ["one"] }),
      client.generateKeywordIdeas("1234567890", { keywordSeed: { keywords: ["two"] } }),
    ]);

    assert.equal(rpcStartedAt.length, 2);
    assert.ok(
      rpcStartedAt[1] - rpcStartedAt[0] >= 18,
      `planning HTTP attempts were only ${rpcStartedAt[1] - rpcStartedAt[0]}ms apart`
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Keyword Planner quota hook runs again for a retried physical attempt", async () => {
  const originalFetch = globalThis.fetch;
  let quotaChecks = 0;
  let planningAttempt = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({
        access_token: "test-access-token",
        token_type: "Bearer",
        expires_in: 3600,
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    planningAttempt += 1;
    assert.equal(quotaChecks, planningAttempt, "each physical request must acquire quota first");
    if (planningAttempt === 1) {
      return new Response(JSON.stringify({
        error: { message: "Planning quota exhausted", status: "RESOURCE_EXHAUSTED" },
      }), { status: 429, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const client = new GoogleAdsClient({
      developerToken: "developer-token",
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "refresh-token",
    });
    client.keywordPlannerRateLimiter = { async acquire(customerId) {
      assert.equal(customerId, "1234567890");
      quotaChecks += 1;
    } };
    // Replace the generic limiter with a deterministic immediate retry so the
    // test checks hook placement without waiting for production backoff.
    client.rateLimiter = {
      async execute(attempt) {
        try {
          return await attempt();
        } catch {
          return attempt();
        }
      },
    };

    await client.generateKeywordHistoricalMetrics("1234567890", { keywords: ["retry"] });
    assert.equal(planningAttempt, 2);
    assert.equal(quotaChecks, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("historical Keyword Planner handler returns the stable MCP contract end to end", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (String(input) === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({
        access_token: "test-access-token",
        token_type: "Bearer",
        expires_in: 3600,
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      results: [{
        text: "galerie lafayette",
        closeVariants: ["galeries lafayette"],
        keywordMetrics: {
          avgMonthlySearches: "550000",
          competition: "HIGH",
          competitionIndex: "80",
          lowTopOfPageBidMicros: "80000",
          highTopOfPageBidMicros: "120000",
          monthlySearchVolumes: [
            { year: "2025", month: "JUNE", monthlySearches: "600000" },
            { year: "2026", month: "APRIL", monthlySearches: "500000" },
            { year: "2026", month: "JUNE", monthlySearches: "550000" },
          ],
        },
      }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const server = createServer({
    developerToken: "developer-token",
    clientId: "client-id",
    clientSecret: "client-secret",
    refreshToken: "refresh-token",
  });
  const mcpClient = new Client({ name: "keyword-planner-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await Promise.all([
      server.connect(serverTransport),
      mcpClient.connect(clientTransport),
    ]);
    const result = await mcpClient.callTool({
      name: "google_ads_generate_keyword_historical_metrics",
      arguments: {
        customerId: "1234567890",
        keywords: ["galerie lafayette"],
        geoTargetIds: ["2250"],
        startYearMonth: "2025-06",
        endYearMonth: "2026-06",
      },
    });
    assert.notEqual(result.isError, true);
    const textContent = result.content.find((content) => content.type === "text");
    assert.ok(textContent && "text" in textContent);
    const payload = JSON.parse(textContent.text);
    assert.equal(payload.dataKind, "historical_search_volume");
    assert.equal(payload.results[0].metrics.trends.threeMonthChangePercent, 10);
    assert.equal(payload.results[0].metrics.trends.yearOverYearChangePercent, -8.33);
    assert.equal(payload.debug.source, "google_ads");
    assert.equal(payload.debug.apiVersion, "v26");
    assert.equal(payload.debug.requestCount, 1);
    assert.deepEqual(payload.warnings, []);
  } finally {
    await mcpClient.close().catch(() => undefined);
    await server.close().catch(() => undefined);
    globalThis.fetch = originalFetch;
  }
});
