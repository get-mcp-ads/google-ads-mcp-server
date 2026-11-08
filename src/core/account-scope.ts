/**
 * google-ads-mcp-server: an open-source MCP server for the Google Ads API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */

export const ACCOUNT_IDS_ENV = "GOOGLE_ADS_ACCOUNT_IDS";

/** Customer IDs as Google returns them: ten digits, no dashes, no `customers/` prefix. */
export function normalizeCustomerId(value: string): string {
  return String(value).trim().replace(/^customers\//, "").replace(/-/g, "");
}

/**
 * Parse GOOGLE_ADS_ACCOUNT_IDS. Unset or blank means no allowlist. A value that
 * is set but malformed is an error: silently ignoring it would widen access.
 */
export function parseAccountIds(raw: string | undefined): string[] | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const ids = [...new Set(raw.split(",").map(normalizeCustomerId).filter(Boolean))];
  if (ids.length === 0 || ids.length > 200 || ids.some(id => !/^\d{10}$/.test(id))) {
    throw new Error(`${ACCOUNT_IDS_ENV} must list 1 to 200 ten-digit Google Ads customer IDs, separated by commas.`);
  }
  return ids;
}

/** Undefined allowlist: every account the credentials reach. */
export function accountIsAllowed(allowed: readonly string[] | undefined, id: string): boolean {
  return allowed === undefined || allowed.includes(normalizeCustomerId(id));
}

export class AccountNotAllowedError extends Error {
  readonly code = 403;
  readonly status = "ACCOUNT_NOT_ALLOWED";
  readonly suggestion = `Add the customer ID to ${ACCOUNT_IDS_ENV} and restart the server, or use an account it already lists.`;
  constructor(id: string) {
    super(`Customer ${normalizeCustomerId(id)} is not in ${ACCOUNT_IDS_ENV}. Nothing was sent to Google.`);
    this.name = "AccountNotAllowedError";
  }
}

export function assertAccountAllowed(allowed: readonly string[] | undefined, id: string): void {
  if (!accountIsAllowed(allowed, id)) throw new AccountNotAllowedError(id);
}

/**
 * Check the customer a Google Ads URL addresses, before credentials are
 * attached. URLs without a customer, such as the field catalog or geo target
 * suggestions, reach no account and pass.
 */
export function assertUrlAccountAllowed(allowed: readonly string[] | undefined, url: string): void {
  if (allowed === undefined) return;
  const customer = new URL(url).pathname.match(/\/customers\/([^/:]+)/)?.[1];
  if (customer !== undefined) assertAccountAllowed(allowed, decodeURIComponent(customer));
}
