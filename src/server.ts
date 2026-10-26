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
import { assertAccountAllowed } from "./core/account-scope.js";
import { formatMcpToolError } from "./core/errors.js";

export const PACKAGE_VERSION = "2.1.1";

/**
 * Refuse a `customerId` outside GOOGLE_ADS_ACCOUNT_IDS before the tool runs.
 * Every account-scoped tool, read or write, takes that parameter, so this one
 * check covers them all. The client checks each request URL again.
 */
function installAccountScope(server: McpServer, allowed: readonly string[] | undefined): void {
  if (allowed === undefined) return;
  const register = server.tool.bind(server) as (...args: unknown[]) => unknown;
  server.tool = ((name: string, description: string, schema: unknown, handler: (...args: unknown[]) => unknown) =>
    register(name, description, schema, async (...args: unknown[]) => {
      const customerId = (args[0] as Record<string, unknown> | undefined)?.["customerId"];
      if (typeof customerId === "string" && customerId) {
        try {
          assertAccountAllowed(allowed, customerId);
        } catch (error) {
          return formatMcpToolError(error);
        }
      }
      return handler(...args);
    })) as unknown as typeof server.tool;
}

export function createServer(config: GoogleAdsConfig): McpServer {
  const server = new McpServer(
    { name: "google-ads-mcp", version: PACKAGE_VERSION, title: "Google Ads", websiteUrl: "https://www.getmcpads.com/tools/google-ads", icons: [{ src: "https://mcp.getmcpads.com/icon.svg", mimeType: "image/svg+xml" }] },
    { capabilities: { tools: { listChanged: true }, resources: { subscribe: false, listChanged: true } } },
  );
  installToolQuality(server);
  installAccountScope(server, config.allowedAccountIds);
  registerGoogleAds(server, config);
  logger.system(
    `google-ads-mcp v${PACKAGE_VERSION} ready, writes ${config.enableWrites ? "enabled" : "disabled"}` +
      (config.allowedAccountIds ? `, limited to ${config.allowedAccountIds.length} account(s)` : ""),
  );
  return server;
}
