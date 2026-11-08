/**
 * The README documents every tool and resource by name. A tool renamed in the
 * code and not in the README is a documentation bug, and this test fails on it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function introspect() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/cli.js"],
    env: { ...process.env, GOOGLE_ADS_DEVELOPER_TOKEN: "t", GOOGLE_ADS_CLIENT_ID: "i", GOOGLE_ADS_CLIENT_SECRET: "s", GOOGLE_ADS_REFRESH_TOKEN: "r", GOOGLE_ADS_ENABLE_WRITES: "true" },
  });
  const client = new Client({ name: "readme-check", version: "1" }, { capabilities: {} });
  await client.connect(transport);
  const definitions = (await client.listTools()).tools;
  const tools = definitions.map((t) => t.name);
  const resources = (await client.listResources()).resources.map((r) => r.uri);
  await client.close();
  return { tools, resources, definitions };
}

const README = readFileSync(new URL("../README.md", import.meta.url), "utf8");

test("README documents every tool the server exposes", async () => {
  const { tools } = await introspect();
  const cited = new Set([...README.matchAll(/`(google_ads_[a-z_]+)`/g)].map((m) => m[1]));
  // Grouped rows such as `google_ads_rename_campaign` / `_adset` / `_ad`
  const suffixes = [...README.matchAll(/`(_[a-z_]+)`/g)].map((m) => m[1]);

  const undocumented = tools.filter(
    (t) => !cited.has(t) && !suffixes.some((s) => t.endsWith(s)),
  );
  assert.deepEqual(undocumented, [], `Tools missing from README: ${undocumented.join(", ")}`);

  const invented = [...cited].filter((c) => !tools.includes(c));
  assert.deepEqual(invented, [], `README cites tools that do not exist: ${invented.join(", ")}`);
});

test("README documents every resource the server exposes", async () => {
  const { resources } = await introspect();
  const cited = new Set([...README.matchAll(/`(google-ads:\/\/[a-z0-9-]+)`/g)].map((m) => m[1]));

  const undocumented = resources.filter((r) => !cited.has(r));
  assert.deepEqual(undocumented, [], `Resources missing from README: ${undocumented.join(", ")}`);

  const invented = [...cited].filter((c) => !resources.includes(c));
  assert.deepEqual(invented, [], `README cites resources that do not exist: ${invented.join(", ")}`);
});

test("README tool counts match reality", async () => {
  const { tools, resources, definitions } = await introspect();
  const writes = definitions.filter(t => !t.annotations.readOnlyHint).map(t => t.name);
  const reads = tools.filter((t) => !writes.includes(t));

  assert.equal(reads.length, 35, "read tool count changed, update the README");
  assert.equal(writes.length, 13, "write tool count changed, update the README");
  assert.equal(resources.length, 5, "resource count changed, update the README");

  assert.match(README, new RegExp(`\\*\\*${reads.length} read tools\\*\\*`));
  assert.match(README, new RegExp(`\\*\\*${writes.length} write tools\\*\\*`));
});

test("published prose uses no em dashes", async () => {
  const { readdirSync } = await import("node:fs");
  const files = [
    "README.md", "SECURITY.md", "CONTRIBUTING.md", "CODE_OF_CONDUCT.md",
    "NOTICE", ".env.example",
  ];
  const srcFiles = [];
  const walk = (dir) => {
    for (const entry of readdirSync(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true })) {
      if (entry.isDirectory()) walk(`${dir}/${entry.name}`);
      else if (entry.name.endsWith(".ts")) srcFiles.push(`${dir}/${entry.name}`);
    }
  };
  walk("src");

  const offenders = [];
  for (const file of [...files, ...srcFiles]) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    text.split("\n").forEach((line, i) => {
      if (line.includes("—")) offenders.push(`${file}:${i + 1}`);
    });
  }
  assert.deepEqual(
    offenders,
    [],
    `Em dashes are not used in this project. Rewrite the sentence instead of swapping the character. Found at: ${offenders.join(", ")}`,
  );
});
