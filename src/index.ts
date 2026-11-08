/**
 * google-ads-mcp-server: an open-source MCP server for the Google Ads API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
export { createServer, PACKAGE_VERSION } from "./server.js";
export { loadConfig } from "./config.js";
export type { GoogleAdsConfig } from "./config.js";
export { nodeRuntimeWarning } from "./runtime-check.js";
