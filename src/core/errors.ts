/**
 * google-ads-mcp-server: an open-source MCP server for the Google Ads API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
export class PlatformApiError extends Error {
  constructor(
    public readonly platform: string, public readonly code: number, message: string,
    public readonly isRateLimit: boolean = false, public readonly isAuth: boolean = false,
    public readonly isPermission: boolean = false, public readonly suggestion: string = "",
    public readonly retryAfter?: number,
  ) { super(message); this.name = "PlatformApiError"; }

  toMcpError() {
    return { error: this.message, platform: this.platform, code: this.code,
      isRateLimit: this.isRateLimit, isAuth: this.isAuth, suggestion: this.suggestion,
      ...(this.retryAfter !== undefined && { retryAfter: this.retryAfter }) };
  }
}

export class RateLimitError extends PlatformApiError {
  constructor(retryAfter?: number) {
    super("google-ads", 429, "Rate limit exceeded", true, false, false,
      retryAfter ? `Wait ${retryAfter}s` : "Wait and retry with backoff", retryAfter);
  }
}

export class AuthError extends PlatformApiError {
  constructor(message?: string) {
    super("google-ads", 401, message ?? "Auth failed. Check credentials.",
      false, true, false, "Verify GOOGLE_ADS_DEVELOPER_TOKEN, CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN");
  }
}

export function formatMcpToolError(error: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  if (error instanceof PlatformApiError)
    return { content: [{ type: "text", text: JSON.stringify(error.toMcpError(), null, 2) }], isError: true };

  // Preserve actionable Google Ads REST details without coupling core errors to
  // the platform-specific exception class (and without returning credentials).
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    const code = typeof record["code"] === "number" ? record["code"] : undefined;
    const status = typeof record["status"] === "string" ? record["status"] : undefined;
    if (code !== undefined || status !== undefined) {
      const message = error instanceof Error ? error.message : String(record["message"] ?? "Google Ads API request failed");
      const requestId = typeof record["requestId"] === "string" ? record["requestId"] : undefined;
      const suggestion = typeof record["suggestion"] === "string" ? record["suggestion"] : undefined;
      const details = Array.isArray(record["errors"])
        ? record["errors"].map((detail) => {
            if (typeof detail !== "object" || detail === null) return detail;
            const item = detail as Record<string, unknown>;
            return { errorCode: item["errorCode"], message: item["message"] };
          })
        : undefined;

      return {
        content: [{ type: "text", text: JSON.stringify({
          error: message,
          platform: "google-ads",
          code,
          status,
          requestId,
          isRateLimit: code === 429 || status === "RESOURCE_EXHAUSTED",
          isAuth: code === 401 || code === 403,
          suggestion,
          details,
        }, null, 2) }],
        isError: true,
      };
    }
  }

  const msg = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text", text: JSON.stringify({ error: msg }, null, 2) }], isError: true };
}
