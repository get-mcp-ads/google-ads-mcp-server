import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.resolve(repoRoot, "..", "..");
const binName = process.platform === "win32" ? "tsx.cmd" : "tsx";
const localTsxBin = path.join(repoRoot, "node_modules", ".bin", binName);
const workspaceTsxBin = path.join(workspaceRoot, "node_modules", ".bin", binName);
const tsxBin = fs.existsSync(localTsxBin) ? localTsxBin : workspaceTsxBin;

function cleanEnv(extra) {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => typeof value === "string")),
    ...extra,
  };
}

test("Google Ads MCP exposes core tools and resources over stdio", async () => {
  const client = new Client({ name: "google-ads-mcp-smoke", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: tsxBin,
    args: ["src/cli.ts"],
    cwd: repoRoot,
    env: cleanEnv({
      GOOGLE_ADS_DEVELOPER_TOKEN: "test-developer-token",
      GOOGLE_ADS_CLIENT_ID: "test-client-id",
      GOOGLE_ADS_CLIENT_SECRET: "test-client-secret",
      GOOGLE_ADS_REFRESH_TOKEN: "test-refresh-token",
      LOG_LEVEL: "error",
    }),
    stderr: "pipe",
  });

  try {
    await client.connect(transport, { timeout: 15000 });
    const tools = await client.listTools(undefined, { timeout: 15000 });
    const toolNames = tools.tools.map((tool) => tool.name);
    assert.equal(toolNames.length, 35);

    for (const name of [
      "google_ads_list_accounts",
      "google_ads_get_insights",
      "google_ads_validate_query",
      "google_ads_get_pmax_asset_diagnostics",
      "google_ads_generate_keyword_historical_metrics",
      "google_ads_generate_keyword_ideas",
      "google_ads_generate_keyword_forecast_metrics",
      "google_ads_generate_ad_group_themes",
      "google_ads_suggest_geo_targets",
      "google_ads_search_fields",
      "google_ads_run_readonly_rpc",
    ]) {
      assert.ok(toolNames.includes(name), `missing tool ${name}`);
    }

    const resources = await client.listResources(undefined, { timeout: 15000 });
    const resourceUris = resources.resources.map((resource) => resource.uri);

    for (const uri of [
      "google-ads://manifest",
      "google-ads://metrics",
      "google-ads://compatibility",
    ]) {
      assert.ok(resourceUris.includes(uri), `missing resource ${uri}`);
    }

    const manifestResource = await client.readResource(
      { uri: "google-ads://manifest" },
      { timeout: 15000 }
    );
    const manifestText = manifestResource.contents.find(
      (content) => content.uri === "google-ads://manifest" && typeof content.text === "string"
    )?.text;
    assert.ok(manifestText, "manifest resource did not return JSON text");
    const manifest = JSON.parse(manifestText);
    assert.equal(manifest.tools.length, 35);
    for (const name of [
      "google_ads_generate_keyword_historical_metrics",
      "google_ads_generate_keyword_ideas",
      "google_ads_generate_keyword_forecast_metrics",
      "google_ads_generate_ad_group_themes",
      "google_ads_suggest_geo_targets",
      "google_ads_search_fields",
      "google_ads_run_readonly_rpc",
    ]) {
      assert.ok(manifest.tools.some((tool) => tool.name === name), `manifest missing tool ${name}`);
    }
  } finally {
    await transport.close().catch(() => undefined);
  }
});
