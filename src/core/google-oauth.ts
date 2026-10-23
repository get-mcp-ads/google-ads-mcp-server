/**
 * google-ads-mcp-server: an open-source MCP server for the Google Ads API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
import { MAX_SMALL_RESPONSE_BYTES, readBoundedJson } from "./http.js";

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const TOKEN_TIMEOUT_MS = 15_000;

/**
 * Token endpoint errors after which this refresh token never works again.
 * Deliberately narrow: `invalid_client` and `unauthorized_client` point at the
 * client ID or secret, which the next restart may fix, so they stay ordinary
 * errors. `admin_policy_enforced` is a Google Workspace administrator blocking
 * the OAuth client.
 */
const REAUTHORIZE_ERRORS = new Set(["invalid_grant", "admin_policy_enforced"]);

export type GoogleOAuthCredentials = { clientId: string; clientSecret: string; refreshToken: string };

/** The refresh token was refused for good. Only a new one, and a restart, fix it. */
export class GoogleReauthorizationRequired extends Error {
  readonly code = 401;
  readonly status = "REAUTHORIZATION_REQUIRED";
  readonly suggestion: string;
  constructor(readonly oauthError: string, envName: string, detail: string) {
    const why = oauthError === "admin_policy_enforced"
      ? "the Google Workspace administrator blocks this OAuth client"
      : "Google reports the refresh token as expired or revoked";
    const action = `Run the OAuth consent flow again, set ${envName} to the new refresh token and restart the server.`;
    super(`Google authorization must be renewed: ${why} (${oauthError}${detail ? `: ${detail}` : ""}). ${action}`);
    this.name = "GoogleReauthorizationRequired";
    this.suggestion = `${action} Until then every call fails here without contacting Google.`;
  }
}

/** Any other refusal from the token endpoint, such as a wrong client secret. */
export class GoogleTokenRefreshError extends Error {
  readonly status = "TOKEN_REFRESH_FAILED";
  constructor(readonly code: number, readonly oauthError: string | undefined, detail: string) {
    super(`Google token refresh failed (${code}${oauthError ? `, ${oauthError}` : ""})${detail ? `: ${detail}` : ""}.`);
    this.name = "GoogleTokenRefreshError";
  }
}

/**
 * Access tokens minted from one refresh token, kept in memory only.
 *
 * Every API call of the process shares one source, so a refused refresh token
 * is detected once. After `invalid_grant` the source stops asking Google and
 * answers every caller with the same re-authorization error: retrying a revoked
 * token cannot succeed, and repeating it on every tool call would only add load.
 */
export class GoogleTokenSource {
  private accessToken = "";
  private expiresAt = 0;
  private pending: Promise<string> | undefined;
  private refused: GoogleReauthorizationRequired | undefined;

  constructor(
    private readonly credentials: GoogleOAuthCredentials,
    private readonly refreshTokenEnv: string,
  ) {}

  async getAccessToken(): Promise<string> {
    if (this.refused) throw this.refused;
    if (this.accessToken && Date.now() < this.expiresAt - 60_000) return this.accessToken;
    this.pending ??= this.refresh().finally(() => { this.pending = undefined; });
    return this.pending;
  }

  /** Forget the cached access token, for example after the API rejected it. */
  invalidate(): void {
    this.accessToken = "";
    this.expiresAt = 0;
  }

  private async refresh(): Promise<string> {
    let response: Response;
    try {
      response = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: this.credentials.refreshToken,
          client_id: this.credentials.clientId,
          client_secret: this.credentials.clientSecret,
        }),
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === "TimeoutError"
        ? `no answer within ${TOKEN_TIMEOUT_MS / 1000} seconds`
        : "the request could not be sent";
      throw new GoogleTokenRefreshError(503, undefined, reason);
    }

    const body = await readBoundedJson<Record<string, unknown>>(response, MAX_SMALL_RESPONSE_BYTES, "Google token");
    const record = typeof body === "object" && body !== null ? body : {};
    if (!response.ok) {
      const oauthError = typeof record["error"] === "string" ? record["error"] : undefined;
      const detail = typeof record["error_description"] === "string" ? record["error_description"].slice(0, 200) : "";
      if (oauthError && REAUTHORIZE_ERRORS.has(oauthError)) {
        this.refused = new GoogleReauthorizationRequired(oauthError, this.refreshTokenEnv, detail);
        throw this.refused;
      }
      throw new GoogleTokenRefreshError(response.status, oauthError, detail);
    }

    const token = record["access_token"];
    if (typeof token !== "string" || !token) {
      throw new GoogleTokenRefreshError(response.status, undefined, "the reply carried no access token");
    }
    const expiresIn = typeof record["expires_in"] === "number" ? record["expires_in"] : 3600;
    this.accessToken = token;
    this.expiresAt = Date.now() + expiresIn * 1000;
    return token;
  }
}

const sources = new WeakMap<object, GoogleTokenSource>();

/** One token source per configuration object, shared by reads and writes. */
export function tokenSourceFor(config: GoogleOAuthCredentials, refreshTokenEnv: string): GoogleTokenSource {
  let source = sources.get(config);
  if (!source) {
    source = new GoogleTokenSource(config, refreshTokenEnv);
    sources.set(config, source);
  }
  return source;
}
