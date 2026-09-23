import { installToolQuality } from "./tool-quality.js";
/**
 * google-ads-mcp-server: an open-source MCP server for the Google Ads API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GoogleAdsConfig } from "./config.js";
import { registerGoogleAds } from "./platforms/google-ads/index.js";
import { logger } from "./core/logger.js";

export const PACKAGE_VERSION = "2.0.1";

export function createServer(config: GoogleAdsConfig): McpServer {
  const server = new McpServer(
    { name: "google-ads-mcp", version: PACKAGE_VERSION, title: "Google Ads", websiteUrl: "https://www.getmcpads.com/tools/google-ads", icons: [{ src: "https://mcp.getmcpads.com/icon.svg", mimeType: "image/svg+xml" }] },
    { capabilities: { tools: { listChanged: true }, resources: { subscribe: false, listChanged: true } } },
  );
  installToolQuality(server);
  registerGoogleAds(server, config);
  logger.system(
    `google-ads-mcp v${PACKAGE_VERSION} ready, writes ${config.enableWrites ? "enabled" : "disabled"}`,
  );
  return server;
}
