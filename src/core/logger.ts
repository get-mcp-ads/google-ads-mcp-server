/**
 * google-ads-mcp-server: an open-source MCP server for the Google Ads API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
type LogLevel = "debug" | "info" | "warn" | "error";
const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
let currentLevel: LogLevel = (process.env["LOG_LEVEL"] as LogLevel) ?? "info";

function log(level: LogLevel, platform: string | null, message: string, data?: unknown): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[currentLevel]) return;
  console.error(JSON.stringify({
    ts: new Date().toISOString(), level, ...(platform && { platform }), msg: message,
    ...(data !== undefined && { data }),
  }));
}

export const logger = {
  debug: (p: string, m: string, d?: unknown) => log("debug", p, m, d),
  info: (p: string, m: string, d?: unknown) => log("info", p, m, d),
  warn: (p: string, m: string, d?: unknown) => log("warn", p, m, d),
  error: (p: string, m: string, d?: unknown) => log("error", p, m, d),
  system: (m: string, d?: unknown) => log("info", null, m, d),
  setLevel: (l: LogLevel) => { currentLevel = l; },
};
