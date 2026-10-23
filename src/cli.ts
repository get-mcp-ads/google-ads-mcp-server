#!/usr/bin/env node
/**
 * google-ads-mcp-server: an open-source MCP server for the Google Ads API.
 * Copyright 2026 GetMCPAds. https://www.getmcpads.com
 * SPDX-License-Identifier: Apache-2.0
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, startupNotices } from "./config.js";
import { createServer } from "./server.js";
import { logger } from "./core/logger.js";
import { nodeRuntimeWarning } from "./runtime-check.js";

async function main(): Promise<void> {
  // stdout carries the MCP protocol; warnings and notices go to stderr only.
  const runtimeWarning = nodeRuntimeWarning();
  if (runtimeWarning) process.stderr.write(`${runtimeWarning}\n`);

  try {
    const config = loadConfig();
    for (const notice of startupNotices()) process.stderr.write(`${notice}\n`);
    logger.setLevel(config.logLevel);
    const server = createServer(config);
    await server.connect(new StdioServerTransport());
    logger.system("Stdio transport connected");
  } catch (error) {
    logger.error("cli", "Fatal error", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
main();
