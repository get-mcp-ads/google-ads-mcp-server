/**
 * google-ads-mcp-server: an open-source MCP server for the Google Ads API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
// ============================================
// GOOGLE ADS API CLIENT (READ-ONLY)
// Google Ads API client, adapted for MCP server
// Auto-refreshes OAuth tokens, rate-limited
// ============================================

import {
  GoogleAdsCustomer,
  GoogleAdsRow,
  GoogleAdsInsightRow,
  GoogleAdsQueryRequest,
  GoogleAdsQueryDebugInfo,
  GoogleAdsApiException,
  GoogleAdsDerivedMetrics,
  GOOGLE_ADS_API_BASE_URL,
  MICRO_CURRENCY_FACTOR,
  CAMEL_TO_SNAKE_METRIC_MAP,
  CAMEL_TO_SNAKE_SEGMENT_MAP,
  stripCustomerId,
  GenerateKeywordHistoricalMetricsRequest,
  GenerateKeywordHistoricalMetricsResponse,
  GenerateKeywordIdeasRequest,
  GenerateKeywordIdeasResponse,
  GenerateKeywordForecastMetricsRequest,
  GenerateKeywordForecastMetricsResponse,
  GenerateAdGroupThemesRequest,
  GenerateAdGroupThemesResponse,
  SearchGoogleAdsFieldsRequest,
  SearchGoogleAdsFieldsResponse,
  SuggestGeoTargetConstantsRequest,
  SuggestGeoTargetConstantsResponse,
} from "./types.js";

export { GoogleAdsApiException } from "./types.js";
import { planQuery } from "./query-planner.js";
import { calculateMetrics } from "./calculated-metrics.js";
import { logger } from "../../core/logger.js";
import { KeywordPlannerRateLimiter, RateLimiter } from "../../core/rate-limiter.js";
import { isGoogleAdsReadOnlyServicePath } from "./read-rpc.js";
import { NO_REDIRECT, refuseRedirect } from "../../core/redirects.js";
import { GoogleTokenSource } from "../../core/google-oauth.js";
import { MAX_API_RESPONSE_BYTES, MAX_SMALL_RESPONSE_BYTES, readBoundedJson } from "../../core/http.js";
import { accountIsAllowed, assertUrlAccountAllowed } from "../../core/account-scope.js";

const DEFAULT_GOOGLE_ADS_REQUEST_TIMEOUT_MS = 30_000;

/**
 * Add the missing sentence to a permission error, when it is the likely one.
 *
 * `USER_PERMISSION_DENIED` on a customer that is managed by an MCC almost
 * always means the call did not name that MCC, not that access is missing.
 * Google's message says neither, so the reader goes looking for a permission
 * that is already granted.
 *
 * Only added when no manager was announced. When one was, the cause is
 * genuinely access, and a hint about a header would send the reader the wrong
 * way, which is worse than saying nothing.
 */
function withManagerHint(message: string, url: string, announcedManager?: string): string {
  if (announcedManager) return message;
  if (!/permission|PERMISSION_DENIED/i.test(message)) return message;

  const customer = url.match(/customers\/(\d+)/)?.[1];
  return (
    `${message} ` +
    `This account may sit under a manager (MCC). Google refuses such requests unless the ` +
    `call names the manager in login-customer-id. Set GOOGLE_ADS_LOGIN_CUSTOMER_ID to the ` +
    `manager's ID` +
    (customer ? `, or check with google_ads_get_account_hierarchy which manager holds ${customer}` : "") +
    `.`
  );
}

function googleAdsRequestTimeoutMs(): number {
  const parsed = Number(process.env["GOOGLE_ADS_REQUEST_TIMEOUT_MS"]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GOOGLE_ADS_REQUEST_TIMEOUT_MS;
}

// ============================================
// CLIENT CONFIG
// ============================================

export interface GoogleAdsClientConfig {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  loginCustomerId?: string;
  /** Customer IDs every request is limited to. Undefined: no allowlist. */
  allowedAccountIds?: readonly string[];
  /** Shared with the write tools, so one process refreshes one token. */
  tokenSource?: GoogleTokenSource;
}

/** Internal discovery reads a manager only to find which manager holds an allowed account. */
export type RequestScope = "account" | "manager-discovery";

// ============================================
// GOOGLE ADS CLIENT CLASS
// ============================================

export class GoogleAdsClient {
  private developerToken: string;
  private loginCustomerId?: string;
  private readonly allowedAccountIds?: readonly string[];
  private readonly tokenSource: GoogleTokenSource;
  /**
   * Le gestionnaire résolu pour un compte, ou `undefined` s'il n'en a pas.
   *
   * La distinction compte : `undefined` mémorisé veut dire « on a cherché et il
   * n'y en a pas », ce qui évite de refaire la découverte à chaque appel sur un
   * compte accessible en direct.
   */
  private managerCache = new Map<string, string | undefined>();
  private rateLimiter = new RateLimiter();
  private keywordPlannerRateLimiter = new KeywordPlannerRateLimiter();

  constructor(config: GoogleAdsClientConfig) {
    this.developerToken = config.developerToken;
    this.allowedAccountIds = config.allowedAccountIds;
    this.tokenSource = config.tokenSource ?? new GoogleTokenSource(
      { clientId: config.clientId, clientSecret: config.clientSecret, refreshToken: config.refreshToken },
      "GOOGLE_ADS_REFRESH_TOKEN",
    );
    this.loginCustomerId = config.loginCustomerId
      ? stripCustomerId(config.loginCustomerId)
      : undefined;
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private getHeaders(accessToken: string, loginCustomerId?: string): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": this.developerToken,
      "Content-Type": "application/json",
    };

    // A per-request manager overrides the configured one. Nothing is sent when
    // neither exists: announcing a manager an account does not have fails just
    // as hard as omitting one it does.
    const manager = loginCustomerId ?? this.loginCustomerId;
    if (manager) {
      headers["login-customer-id"] = stripCustomerId(manager);
    }

    return headers;
  }

  /**
   * The manager account to announce when querying a given customer.
   *
   * Google rejects any request against an account managed by an MCC unless the
   * call names that MCC in `login-customer-id`. The rejection is a bare
   * `USER_PERMISSION_DENIED` that names neither the account nor the manager, so
   * it reads as missing access rather than as a missing header, and that is
   * where people lose an afternoon.
   *
   * `GOOGLE_ADS_LOGIN_CUSTOMER_ID` solves it when you know the answer in
   * advance. This resolves it when you do not: if the customer is not directly
   * accessible, the accessible managers are asked which accounts they hold, and
   * the one holding this customer is used.
   *
   * Resolved once and cached for the life of the client. The hierarchy of an
   * advertising account does not change between two tool calls, and paying two
   * extra requests on every query to discover that it has not would be worse
   * than the problem.
   */
  private async resolveLoginCustomerId(customerId: string): Promise<string | undefined> {
    if (this.loginCustomerId) return this.loginCustomerId;

    const wanted = stripCustomerId(customerId);
    if (this.managerCache.has(wanted)) return this.managerCache.get(wanted);

    try {
      const accessible = (await this.listAccessibleCustomers()).map(name => stripCustomerId(name.replace(/^customers\//, "")));
      // Directly accessible: it answers for itself, and naming a manager would
      // break the call rather than fix it.
      if (accessible.includes(wanted)) {
        this.managerCache.set(wanted, undefined);
        return undefined;
      }

      for (const candidate of accessible) {
        const children = await this.getClientAccounts(candidate, "manager-discovery");
        for (const child of children) {
          if (stripCustomerId(child.id) === wanted) {
            this.managerCache.set(wanted, candidate);
            return candidate;
          }
        }
      }
    } catch (error) {
      // Discovery is a convenience, never a precondition. If it fails the query
      // still runs, and the error it produces is the one worth reporting.
      logger.debug(
        "google-ads",
        `Could not resolve a manager for ${wanted}: ${error instanceof Error ? error.message : error}`,
      );
    }

    this.managerCache.set(wanted, undefined);
    return undefined;
  }

  private async request<T>(
    url: string,
    options: RequestInit = {},
    beforeAttempt?: () => Promise<void>,
    deadlineAtMs?: number,
    loginCustomerId?: string,
    scope: RequestScope = "account"
  ): Promise<T> {
    // Checked before a token is even requested: a refused account costs nothing.
    if (scope === "account") assertUrlAccountAllowed(this.allowedAccountIds, url);
    const accessToken = await this.tokenSource.getAccessToken();

    return this.rateLimiter.execute<T>(async () => {
      // Some Google Ads services (notably Keyword Planner) impose a stricter
      // per-customer quota. Run this hook for every physical HTTP attempt so
      // OAuth latency, concurrent calls, and automatic retries cannot bunch
      // requests together after an earlier logical-call-level wait.
      await beforeAttempt?.();

      // Hard timeout to prevent hanging requests from blocking agent sessions.
      const controller = new AbortController();
      const configuredTimeoutMs = googleAdsRequestTimeoutMs();
      const remainingTimeMs = deadlineAtMs === undefined
        ? configuredTimeoutMs
        : deadlineAtMs - Date.now();
      if (remainingTimeMs <= 0) {
        throw new GoogleAdsApiException(
          "Google Ads request skipped because the MCP tool time budget was exhausted",
          408,
          "TIME_BUDGET_EXHAUSTED"
        );
      }
      const timeoutMs = Math.min(configuredTimeoutMs, remainingTimeMs);
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          // Forced after the spread: once a bearer token is attached, a redirect
          // must never be followed, or the credential would be forwarded to
          // whatever host the redirect names.
          redirect: "error",
          headers: {
            ...this.getHeaders(accessToken, loginCustomerId),
            ...options.headers,
          },
        });
        refuseRedirect(response, "Google Ads API");

        if (!response.ok) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const errorBody = await readBoundedJson(response, MAX_SMALL_RESPONSE_BYTES, "Google Ads API error").catch(() => ({})) as any;
          const errorDetails = errorBody?.error;

          // Let tool handlers decide whether an API failure is fatal. Some discovery
          // paths intentionally catch permission errors and return structured fallbacks.
          logger.debug("google-ads", `API Error: ${response.status}`, errorBody);

          const gaErrors = errorDetails?.details?.[0]?.errors
            ?? errorBody?.[0]?.error?.details?.[0]?.errors;
          const requestId = errorDetails?.details?.[0]?.requestId
            ?? errorBody?.[0]?.error?.details?.[0]?.requestId;
          const detailedMessage = gaErrors?.[0]?.message
            || errorDetails?.message
            || `Request failed: ${response.statusText}`;

          throw new GoogleAdsApiException(
            withManagerHint(detailedMessage, url, loginCustomerId),
            response.status,
            errorDetails?.status,
            requestId,
            gaErrors
          );
        }

        const payload = await readBoundedJson<T>(response, MAX_API_RESPONSE_BYTES, "Google Ads API");
        if (typeof payload === "string") {
          throw new GoogleAdsApiException("Google Ads API returned a reply that is not JSON.", 502, "INVALID_RESPONSE");
        }
        return payload;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new GoogleAdsApiException(
            `Google Ads API request timed out after ${Math.round(timeoutMs / 1000)} seconds`,
            408,
            "TIMEOUT"
          );
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    });
  }

  // ============================================
  // CORE QUERY METHODS
  // ============================================

  /**
   * Execute a GAQL query using SearchStream (streaming, no pagination)
   * Preferred for reporting: lower latency
   */
  async searchStream(customerId: string, gaqlQuery: string, scope: RequestScope = "account"): Promise<GoogleAdsRow[]> {
    const cleanCustomerId = stripCustomerId(customerId);
    // Before manager discovery, so a refused account triggers no request at all.
    if (scope === "account") assertUrlAccountAllowed(this.allowedAccountIds, `${GOOGLE_ADS_API_BASE_URL}/customers/${cleanCustomerId}`);
    const url = `${GOOGLE_ADS_API_BASE_URL}/customers/${cleanCustomerId}/googleAds:searchStream`;
    const manager = await this.resolveLoginCustomerId(cleanCustomerId);

    const response = await this.request<Array<{ results?: GoogleAdsRow[]; fieldMask?: string; requestId?: string }>>(
      url,
      {
        method: "POST",
        body: JSON.stringify({ query: gaqlQuery }),
      },
      undefined,
      undefined,
      manager,
      scope
    );

    // SearchStream returns an array of batches, each containing results
    const allRows: GoogleAdsRow[] = [];
    for (const batch of response) {
      if (batch.results) {
        allRows.push(...batch.results);
      }
    }

    return allRows;
  }

  /**
   * Execute a GAQL query using Search.
   * Google Ads v23 uses a fixed response page size; limit rows with GAQL LIMIT.
   */
  async search(
    customerId: string,
    gaqlQuery: string,
    pageToken?: string
  ): Promise<{ results: GoogleAdsRow[]; nextPageToken?: string; totalResultsCount?: string }> {
    const cleanCustomerId = stripCustomerId(customerId);
    assertUrlAccountAllowed(this.allowedAccountIds, `${GOOGLE_ADS_API_BASE_URL}/customers/${cleanCustomerId}`);
    const url = `${GOOGLE_ADS_API_BASE_URL}/customers/${cleanCustomerId}/googleAds:search`;
    const manager = await this.resolveLoginCustomerId(cleanCustomerId);

    const body: Record<string, unknown> = { query: gaqlQuery };
    if (pageToken) body.pageToken = pageToken;

    return this.request(
      url,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      undefined,
      undefined,
      manager
    );
  }

  // ============================================
  // KEYWORD PLANNER (PLANLESS, READ-ONLY RPCS)
  // ============================================

  /**
   * Return historical Keyword Planner metrics for a supplied keyword list.
   * This POST is a read-only custom method and does not create a saved plan.
   */
  async generateKeywordHistoricalMetrics(
    customerId: string,
    body: GenerateKeywordHistoricalMetricsRequest
  ): Promise<GenerateKeywordHistoricalMetricsResponse> {
    const cleanCustomerId = stripCustomerId(customerId);
    const url = `${GOOGLE_ADS_API_BASE_URL}/customers/${cleanCustomerId}:generateKeywordHistoricalMetrics`;
    return this.request(
      url,
      { method: "POST", body: JSON.stringify(body) },
      () => this.keywordPlannerRateLimiter.acquire(cleanCustomerId)
    );
  }

  /**
   * Generate keyword ideas and their historical metrics without saving a plan.
   */
  async generateKeywordIdeas(
    customerId: string,
    body: GenerateKeywordIdeasRequest
  ): Promise<GenerateKeywordIdeasResponse> {
    const cleanCustomerId = stripCustomerId(customerId);
    const url = `${GOOGLE_ADS_API_BASE_URL}/customers/${cleanCustomerId}:generateKeywordIdeas`;
    return this.request(
      url,
      { method: "POST", body: JSON.stringify(body) },
      () => this.keywordPlannerRateLimiter.acquire(cleanCustomerId)
    );
  }

  /**
   * Forecast a temporary keyword campaign without mutating the Google Ads account.
   */
  async generateKeywordForecastMetrics(
    customerId: string,
    body: GenerateKeywordForecastMetricsRequest,
    deadlineAtMs?: number
  ): Promise<GenerateKeywordForecastMetricsResponse> {
    const cleanCustomerId = stripCustomerId(customerId);
    const url = `${GOOGLE_ADS_API_BASE_URL}/customers/${cleanCustomerId}:generateKeywordForecastMetrics`;
    return this.request(
      url,
      { method: "POST", body: JSON.stringify(body) },
      () => this.keywordPlannerRateLimiter.acquire(cleanCustomerId),
      deadlineAtMs
    );
  }

  /**
   * Search Google's live GAQL field catalog so callers can discover every
   * resource, attribute, segment, metric, enum, and compatibility edge.
   */
  async searchGoogleAdsFields(
    body: SearchGoogleAdsFieldsRequest
  ): Promise<SearchGoogleAdsFieldsResponse> {
    const url = `${GOOGLE_ADS_API_BASE_URL}/googleAdsFields:search`;
    return this.request(url, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /** Resolve human-readable locations or known IDs to targetable geo constants. */
  async suggestGeoTargetConstants(
    body: SuggestGeoTargetConstantsRequest
  ): Promise<SuggestGeoTargetConstantsResponse> {
    const url = `${GOOGLE_ADS_API_BASE_URL}/geoTargetConstants:suggest`;
    return this.request(url, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * Organize keyword ideas into existing ad groups without mutating them.
   * This belongs to KeywordPlanIdeaService and shares its strict quota.
   */
  async generateAdGroupThemes(
    customerId: string,
    body: GenerateAdGroupThemesRequest
  ): Promise<GenerateAdGroupThemesResponse> {
    const cleanCustomerId = stripCustomerId(customerId);
    const url = `${GOOGLE_ADS_API_BASE_URL}/customers/${cleanCustomerId}:generateAdGroupThemes`;
    return this.request(
      url,
      { method: "POST", body: JSON.stringify(body) },
      () => this.keywordPlannerRateLimiter.acquire(cleanCustomerId)
    );
  }

  /**
   * Execute an explicitly allowlisted read/generate/suggest/list service path.
   * The client rechecks the shared operation catalog plus path, method, and
   * mutation-word defenses before attaching credentials.
   */
  async runReadOnlyService<T = Record<string, unknown>>(
    relativePath: string,
    method: "GET" | "POST",
    body?: Record<string, unknown>,
    query?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    if (method !== "GET" && method !== "POST") {
      throw new Error("Google Ads read-only services support only GET or POST.");
    }
    const path = relativePath.replace(/^\/+|\/+$/g, "");
    if (!path || path.length > 300 || path.includes("..") || /[?#]/.test(path)) {
      throw new Error("Invalid Google Ads read-only service path.");
    }
    if (!/^[A-Za-z0-9_:/.-]+$/.test(path)) {
      throw new Error("Google Ads read-only service path contains unsupported characters.");
    }
    if (/\b(?:mutate|create|update|delete|remove|upload|apply|dismiss|start|book|resolve|cancel|run)\b/i.test(path.replace(/([a-z])([A-Z])/g, "$1 $2"))) {
      throw new Error("Mutation-like Google Ads service paths are blocked.");
    }
    if (!isGoogleAdsReadOnlyServicePath(path, method)) {
      throw new Error("Google Ads service path is not in the read-only service allowlist.");
    }
    if (method === "GET" && !/\/(?:getIdentityVerification|invoices|paymentsAccounts)$/.test(path)) {
      throw new Error("GET is only allowed for identity verification, invoices, and payments accounts.");
    }
    if (method === "POST" && /\/(?:getIdentityVerification|invoices|paymentsAccounts)$/.test(path)) {
      throw new Error("This Google Ads read endpoint requires GET.");
    }

    const url = new URL(path.startsWith(":")
      ? `${GOOGLE_ADS_API_BASE_URL}${path}`
      : `${GOOGLE_ADS_API_BASE_URL}/${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return this.request<T>(url.toString(), {
      method,
      redirect: "error",
      ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
    });
  }

  // ============================================
  // ACCOUNT MANAGEMENT
  // ============================================

  /**
   * List all accessible customer IDs (for MCC accounts)
   * Returns resource names like "customers/1234567890"
   */
  async listAccessibleCustomers(): Promise<string[]> {
    const url = `${GOOGLE_ADS_API_BASE_URL}/customers:listAccessibleCustomers`;

    const response = await this.request<{ resourceNames: string[] }>(url);
    return response.resourceNames;
  }

  /**
   * Get customer details by ID
   */
  async getCustomer(customerId: string): Promise<GoogleAdsCustomer> {
    const cleanCustomerId = stripCustomerId(customerId);
    const gaql = `
      SELECT
        customer.id,
        customer.descriptive_name,
        customer.currency_code,
        customer.time_zone,
        customer.manager,
        customer.test_account
      FROM customer
      LIMIT 1
    `;

    const rows = await this.searchStream(cleanCustomerId, gaql);
    if (rows.length === 0) {
      throw new GoogleAdsApiException(
        `Customer ${customerId} not found`,
        404,
        "NOT_FOUND"
      );
    }

    const row = rows[0];
    return {
      id: String(row.customer?.id || cleanCustomerId),
      descriptiveName: row.customer?.descriptiveName || "Unknown Account",
      currencyCode: row.customer?.currencyCode || "",
      timeZone: row.customer?.timeZone || "",
      manager: row.customer?.manager || false,
      testAccount: row.customer?.testAccount || false,
      resourceName: row.customer?.resourceName || `customers/${cleanCustomerId}`,
    };
  }

  /**
   * Get all accessible customer accounts with their details
   */
  async getAllCustomers(): Promise<GoogleAdsCustomer[]> {
    // With an allowlist, the allowed accounts are the whole visible world:
    // managers outside it are never described, only used to reach accounts.
    const resourceNames = this.allowedAccountIds
      ? this.allowedAccountIds.map(id => `customers/${id}`)
      : await this.listAccessibleCustomers();
    const customers: GoogleAdsCustomer[] = [];

    for (const resourceName of resourceNames) {
      const customerId = resourceName.replace("customers/", "");
      try {
        const customer = await this.getCustomer(customerId);
        customers.push(customer);
      } catch (error) {
        // Skip accounts we can't access (e.g., suspended accounts)
        logger.warn("google-ads", `Skipping customer ${customerId}: ${error instanceof Error ? error.message : error}`);
      }
    }

    return customers;
  }

  /**
   * Get client accounts under a Manager (MCC) account
   * Uses customer_client resource to list sub-accounts
   */
  async getClientAccounts(mccId: string, scope: RequestScope = "account"): Promise<GoogleAdsCustomer[]> {
    const cleanMccId = stripCustomerId(mccId);
    const gaql = `
      SELECT
        customer_client.id,
        customer_client.descriptive_name,
        customer_client.currency_code,
        customer_client.time_zone,
        customer_client.manager,
        customer_client.test_account,
        customer_client.level,
        customer_client.status
      FROM customer_client
      WHERE customer_client.level <= 1
        AND customer_client.status = 'ENABLED'
    `;

    const rows = await this.searchStream(cleanMccId, gaql, scope);
    const clients: GoogleAdsCustomer[] = [];

    for (const row of rows) {
      const cc = row.customerClient as Record<string, unknown> | undefined;
      if (!cc) continue;

      const id = String(cc.id || "");
      // Skip the MCC itself (level 0), and every account outside the allowlist.
      if (id === cleanMccId) continue;
      if (scope === "account" && !accountIsAllowed(this.allowedAccountIds, id)) continue;

      clients.push({
        id,
        descriptiveName: (cc.descriptiveName as string) || "Unnamed Account",
        currencyCode: (cc.currencyCode as string) || "USD",
        timeZone: (cc.timeZone as string) || "America/New_York",
        manager: (cc.manager as boolean) || false,
        testAccount: (cc.testAccount as boolean) || false,
        resourceName: `customers/${id}`,
      });
    }

    return clients;
  }

  // ============================================
  // HIGH-LEVEL QUERY EXECUTION
  // ============================================

  /**
   * Execute a query request with automatic query planning
   */
  async executeQuery(
    request: GoogleAdsQueryRequest
  ): Promise<{
    data: (GoogleAdsInsightRow & Partial<GoogleAdsDerivedMetrics>)[];
    debug: GoogleAdsQueryDebugInfo;
  }> {
    const startTime = Date.now();
    const plan = planQuery(request);

    const errors: string[] = [...plan.errors];
    const warnings: string[] = [...plan.warnings];
    const gaqlQueries: string[] = [];

    // Check if plan has errors
    if (plan.errors.length > 0) {
      return {
        data: [],
        debug: {
          requestCount: 0,
          totalRows: 0,
          executionTimeMs: Date.now() - startTime,
          errors,
          warnings,
          rawRequests: [],
          rawResponses: [],
          calculatedMetrics: plan.calculatedMetrics,
          joinKeys: plan.joinKeys,
          gaqlQueries: [],
        },
      };
    }

    const rawRequests: unknown[] = [];
    const rawResponses: unknown[] = [];
    const queryResults: GoogleAdsInsightRow[][] = [];

    // Execute each GAQL query in the plan
    for (const query of plan.queries) {
      gaqlQueries.push(query.gaql);
      rawRequests.push({ gaql: query.gaql, resource: query.resource });

      try {
        const apiRows = (await this.search(request.customerId, query.gaql)).results ?? [];
        rawResponses.push(apiRows.slice(0, 5)); // Only store first 5 for debug

        // Flatten nested rows
        const flatRows = apiRows.map((row) => flattenGoogleAdsRow(row));
        queryResults.push(flatRows);
      } catch (error) {
        rawResponses.push({
          error: error instanceof Error ? error.message : "Unknown error",
        });
        errors.push(
          error instanceof Error ? error.message : "Query execution failed"
        );
        queryResults.push([]);
      }
    }

    // Merge results based on merge strategy
    let allRows: GoogleAdsInsightRow[];

    if (plan.mergeStrategy === "join" && queryResults.length > 1 && plan.joinKeys.length > 0) {
      // JOIN: Use first query as base, merge subsequent queries by join keys
      allRows = [...(queryResults[0] || [])];

      for (let qi = 1; qi < queryResults.length; qi++) {
        const supplementaryRows = queryResults[qi];
        if (supplementaryRows.length === 0) continue;

        // Build lookup map from supplementary rows keyed by join key composite
        const lookup = new Map<string, GoogleAdsInsightRow>();
        for (const row of supplementaryRows) {
          const compositeKey = plan.joinKeys
            .map((jk) => String(row[jk] ?? ""))
            .join("|||");
          lookup.set(compositeKey, row);
        }

        // Merge supplementary metrics into base rows
        for (const baseRow of allRows) {
          const compositeKey = plan.joinKeys
            .map((jk) => String(baseRow[jk] ?? ""))
            .join("|||");
          const match = lookup.get(compositeKey);
          if (match) {
            // Merge all fields from the supplementary row that don't exist in base
            for (const [key, value] of Object.entries(match)) {
              if (!(key in baseRow)) {
                (baseRow as Record<string, unknown>)[key] = value;
              }
            }
          }
        }
      }
    } else if (queryResults.length === 1) {
      allRows = queryResults[0] || [];
    } else {
      // UNION or fallback: concatenate all rows
      allRows = queryResults.flat();
    }

    // Calculate only the derived metrics the caller actually requested
    const requestedCalc = new Set(plan.calculatedMetrics);
    const enrichedRows = requestedCalc.size > 0
      ? allRows.map((row) => {
          const all = calculateMetrics(row);
          const picked: Record<string, unknown> = {};
          for (const key of requestedCalc) {
            if (key in all && (all as Record<string, unknown>)[key] !== null) {
              picked[key] = (all as Record<string, unknown>)[key];
            }
          }
          return { ...row, ...picked };
        })
      : allRows;

    return {
      data: enrichedRows,
      debug: {
        requestCount: plan.queries.length,
        totalRows: enrichedRows.length,
        executionTimeMs: Date.now() - startTime,
        errors,
        warnings,
        rawRequests,
        rawResponses,
        calculatedMetrics: plan.calculatedMetrics,
        joinKeys: plan.joinKeys,
        gaqlQueries,
      },
    };
  }
}

// ============================================
// ROW FLATTENING
// ============================================

const KNOWN_MICRO_FIELDS = new Set([
  "campaign_budget.amount_micros",
  "campaign_budget.total_amount_micros",
  "campaign.target_cpa.target_cpa_micros",
  "campaign.maximize_conversions.target_cpa_micros",
  "campaign.target_impression_share.cpc_bid_ceiling_micros",
  "campaign.target_impression_share.location_fraction_micros",
]);

function convertValueIfNumeric(flatKey: string, value: unknown): unknown {
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) {
    const num = parseFloat(value);
    if (KNOWN_MICRO_FIELDS.has(flatKey)) {
      return num / MICRO_CURRENCY_FACTOR;
    }
    return num;
  }
  return value;
}

/**
 * Flatten a nested GoogleAdsRow into a flat GoogleAdsInsightRow
 * Converts camelCase API fields to snake_case GAQL-style keys
 *
 * Input:  { campaign: { id: "123", name: "My Campaign" }, metrics: { impressions: "5000", costMicros: "25000000" } }
 * Output: { "campaign.id": "123", "campaign.name": "My Campaign", "metrics.impressions": 5000, "metrics.cost_micros": 25000000, "metrics.cost": 25.0 }
 */
export function flattenGoogleAdsRow(row: GoogleAdsRow): GoogleAdsInsightRow {
  const flat: GoogleAdsInsightRow = {};

  // Flatten each top-level key
  for (const [topKey, topValue] of Object.entries(row)) {
    if (topValue === null || topValue === undefined) continue;
    if (typeof topValue !== "object") continue;

    const obj = topValue as Record<string, unknown>;

    // Map top-level camelCase to GAQL resource names
    const resourceName = camelToSnakeResource(topKey);

    for (const [fieldKey, fieldValue] of Object.entries(obj)) {
      if (fieldValue === null || fieldValue === undefined) continue;

      // Convert field name from camelCase to snake_case
      let snakeField: string;
      if (topKey === "metrics" && CAMEL_TO_SNAKE_METRIC_MAP[fieldKey]) {
        snakeField = CAMEL_TO_SNAKE_METRIC_MAP[fieldKey];
      } else if (topKey === "segments" && CAMEL_TO_SNAKE_SEGMENT_MAP[fieldKey]) {
        snakeField = CAMEL_TO_SNAKE_SEGMENT_MAP[fieldKey];
      } else {
        snakeField = camelToSnake(fieldKey);
      }

      const flatKey = `${resourceName}.${snakeField}`;

      // Convert string numbers to actual numbers for metrics
      if (topKey === "metrics") {
        const numValue =
          typeof fieldValue === "string" ? parseFloat(fieldValue) : fieldValue;
        flat[flatKey] = numValue;

        // Auto-convert micro currency fields
        if (snakeField === "cost_micros" && typeof numValue === "number") {
          flat["metrics.cost"] = numValue / MICRO_CURRENCY_FACTOR;
        } else if (snakeField === "average_cpc" && typeof numValue === "number") {
          flat["metrics.average_cpc"] = numValue / MICRO_CURRENCY_FACTOR;
        } else if (snakeField === "average_cpm" && typeof numValue === "number") {
          flat["metrics.average_cpm"] = numValue / MICRO_CURRENCY_FACTOR;
        } else if (snakeField === "cost_per_conversion" && typeof numValue === "number") {
          flat["metrics.cost_per_conversion"] = numValue / MICRO_CURRENCY_FACTOR;
        } else if (snakeField === "cost_per_all_conversions" && typeof numValue === "number") {
          flat["metrics.cost_per_all_conversions"] = numValue / MICRO_CURRENCY_FACTOR;
        } else if (snakeField === "active_view_cpm" && typeof numValue === "number") {
          flat["metrics.active_view_cpm"] = numValue / MICRO_CURRENCY_FACTOR;
        } else if (snakeField === "average_cost" && typeof numValue === "number") {
          flat["metrics.average_cost"] = numValue / MICRO_CURRENCY_FACTOR;
        } else if (snakeField === "average_cpe" && typeof numValue === "number") {
          flat["metrics.average_cpe"] = numValue / MICRO_CURRENCY_FACTOR;
        } else if (snakeField === "average_cpv" && typeof numValue === "number") {
          flat["metrics.average_cpv"] = numValue / MICRO_CURRENCY_FACTOR;
        } else if (snakeField === "trueview_average_cpv" && typeof numValue === "number") {
          flat["metrics.trueview_average_cpv"] = numValue / MICRO_CURRENCY_FACTOR;
        } else if (snakeField === "search_lift_cost_micros" && typeof numValue === "number") {
          // Kept beside the raw micros, like metrics.cost beside metrics.cost_micros.
          flat["metrics.search_lift_cost"] = numValue / MICRO_CURRENCY_FACTOR;
        }
      } else if (typeof fieldValue === "object" && !Array.isArray(fieldValue)) {
        // Handle nested objects (e.g., adGroupAd.ad, adGroupCriterion.keyword)
        const nested = fieldValue as Record<string, unknown>;
        for (const [nestedKey, nestedValue] of Object.entries(nested)) {
          if (nestedValue === null || nestedValue === undefined) continue;
          if (typeof nestedValue === "object" && !Array.isArray(nestedValue)) {
            // One more level deep (e.g., keyword.info.text)
            const deepNested = nestedValue as Record<string, unknown>;
            for (const [deepKey, deepValue] of Object.entries(deepNested)) {
              if (deepValue === null || deepValue === undefined) continue;
              const deepFlatKey = `${resourceName}.${snakeField}.${camelToSnake(nestedKey)}.${camelToSnake(deepKey)}`;
              flat[deepFlatKey] = convertValueIfNumeric(deepFlatKey, deepValue);
            }
          } else {
            const nestedFlatKey = `${resourceName}.${snakeField}.${camelToSnake(nestedKey)}`;
            flat[nestedFlatKey] = convertValueIfNumeric(nestedFlatKey, nestedValue);
          }
        }
      } else {
        flat[flatKey] = convertValueIfNumeric(flatKey, fieldValue);
      }
    }
  }

  return flat;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Convert camelCase to snake_case
 */
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Map top-level API response keys to GAQL resource names
 */
function camelToSnakeResource(key: string): string {
  const map: Record<string, string> = {
    campaign: "campaign",
    adGroup: "ad_group",
    adGroupAd: "ad_group_ad",
    adGroupCriterion: "ad_group_criterion",
    adGroupAdAssetView: "ad_group_ad_asset_view",
    adGroupAsset: "ad_group_asset",
    campaignAsset: "campaign_asset",
    keywordView: "keyword_view",
    searchTermView: "search_term_view",
    dynamicSearchAdsSearchTermView: "dynamic_search_ads_search_term_view",
    paidOrganicSearchTermView: "paid_organic_search_term_view",
    shoppingPerformanceView: "shopping_performance_view",
    shoppingProduct: "shopping_product",
    geographicView: "geographic_view",
    userLocationView: "user_location_view",
    landingPageView: "landing_page_view",
    expandedLandingPageView: "expanded_landing_page_view",
    detailPlacementView: "detail_placement_view",
    managedPlacementView: "managed_placement_view",
    topicView: "topic_view",
    displayKeywordView: "display_keyword_view",
    campaignAudienceView: "campaign_audience_view",
    adGroupAudienceView: "ad_group_audience_view",
    ageRangeView: "age_range_view",
    genderView: "gender_view",
    parentalStatusView: "parental_status_view",
    incomeRangeView: "income_range_view",
    campaignCriterion: "campaign_criterion",
    assetGroup: "asset_group",
    assetGroupAsset: "asset_group_asset",
    assetGroupListingGroupFilter: "asset_group_listing_group_filter",
    assetGroupSignal: "asset_group_signal",
    campaignSearchTermInsight: "campaign_search_term_insight",
    video: "video",
    customer: "customer",
    customerClient: "customer_client",
    campaignBudget: "campaign_budget",
    biddingStrategy: "bidding_strategy",
    campaignSimulation: "campaign_simulation",
    adGroupSimulation: "ad_group_simulation",
    biddingStrategySimulation: "bidding_strategy_simulation",
    conversionAction: "conversion_action",
    changeEvent: "change_event",
    changeStatus: "change_status",
    label: "label",
    experiment: "experiment",
    liftMeasurementConfig: "lift_measurement_config",
    metrics: "metrics",
    segments: "segments",
  };
  return map[key] || camelToSnake(key);
}
