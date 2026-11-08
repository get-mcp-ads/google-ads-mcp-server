/**
 * google-ads-mcp-server: an open-source MCP server for the Google Ads API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */

/** Largest API response body this server reads, so one reply cannot exhaust memory. */
export const MAX_API_RESPONSE_BYTES = 64 * 1024 * 1024;
/** Error bodies and token replies are small. Anything larger is refused. */
export const MAX_SMALL_RESPONSE_BYTES = 1024 * 1024;

export class ResponseTooLargeError extends Error {
  readonly code = 413;
  readonly status = "RESPONSE_TOO_LARGE";
  constructor(label: string, limit: number) {
    super(`${label} response exceeds the ${limit} byte limit. Narrow the query or lower its LIMIT.`);
    this.name = "ResponseTooLargeError";
  }
}

/** Read at most `limit` bytes of a response body. */
export async function readBoundedText(response: Response, limit: number, label: string): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) {
    await response.body?.cancel().catch(() => undefined);
    throw new ResponseTooLargeError(label, limit);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      throw new ResponseTooLargeError(label, limit);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** Bounded read, parsed as JSON. Text that is not JSON comes back as a string. */
export async function readBoundedJson<T = unknown>(response: Response, limit: number, label: string): Promise<T | string> {
  const text = await readBoundedText(response, limit, label);
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text;
  }
}
