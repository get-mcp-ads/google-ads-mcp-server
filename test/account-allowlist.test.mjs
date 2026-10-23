/**
 * GOOGLE_ADS_ACCOUNT_IDS limits every tool to the listed customers.
 *
 * The check runs before any request: a refused customer costs no token
 * refresh and no API call. Discovery answers list only allowed accounts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { parseAccountIds, assertUrlAccountAllowed } from "../src/core/account-scope.ts";
import { readWriteFlag, startupNotices } from "../src/config.ts";
import { createServer } from "../src/server.ts";
import { GoogleAdsClient } from "../src/platforms/google-ads/client.ts";

const ALLOWED = "1111111111";
const OTHER = "2222222222";

function stubFetch(handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? String(init.body) : undefined });
    return handler(String(url), init);
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function connect(config, callback) {
  const server = createServer({
    developerToken: "dev", clientId: "id", clientSecret: "secret", refreshToken: "refresh", logLevel: "error", ...config,
  });
  const client = new Client({ name: "allowlist-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  try {
    await callback(client);
  } finally {
    await client.close();
    await server.close();
  }
}

test("the variable accepts ten-digit IDs with or without dashes, and refuses anything else", () => {
  assert.equal(parseAccountIds(undefined), undefined);
  assert.equal(parseAccountIds("  "), undefined);
  assert.deepEqual(parseAccountIds("111-111-1111, 2222222222,1111111111"), [ALLOWED, OTHER]);
  assert.throws(() => parseAccountIds("123"), /GOOGLE_ADS_ACCOUNT_IDS/);
  assert.throws(() => parseAccountIds("1111111111,act_1"), /ten-digit/);
});

test("true enables writes; the values 2.0 accepted still do, with a deprecation notice", () => {
  assert.deepEqual(readWriteFlag("true"), { enabled: true });
  for (const value of ["1", "yes", "on", "TRUE", " Yes "]) {
    const flag = readWriteFlag(value);
    assert.equal(flag.enabled, true, value);
    assert.match(flag.notice, /3\.0\.0 will accept only true/, value);
  }
  for (const value of [undefined, "", "false", "FALSE"]) assert.deepEqual(readWriteFlag(value), { enabled: false }, String(value));
  for (const value of ["0", "enable", "2"]) {
    const flag = readWriteFlag(value);
    assert.equal(flag.enabled, false, value);
    assert.match(flag.notice, /Write tools stay disabled/, value);
  }
});

test("startup recommends the allowlist only while it is unset", () => {
  assert.ok(startupNotices({}).some((line) => /GOOGLE_ADS_ACCOUNT_IDS is not set[\s\S]*required in 3\.0\.0/.test(line)));
  assert.deepEqual(startupNotices({ GOOGLE_ADS_ACCOUNT_IDS: ALLOWED, GOOGLE_ADS_ENABLE_WRITES: "true" }), []);
});

test("URLs naming another customer are refused, URLs naming none pass", () => {
  assert.throws(
    () => assertUrlAccountAllowed([ALLOWED], `https://googleads.googleapis.com/v26/customers/${OTHER}:generateKeywordIdeas`),
    /not in GOOGLE_ADS_ACCOUNT_IDS/,
  );
  assertUrlAccountAllowed([ALLOWED], `https://googleads.googleapis.com/v26/customers/${ALLOWED}/googleAds:search`);
  assertUrlAccountAllowed([ALLOWED], "https://googleads.googleapis.com/v26/googleAdsFields:search");
  assertUrlAccountAllowed(undefined, `https://googleads.googleapis.com/v26/customers/${OTHER}/googleAds:search`);
});

test("a read or a write on another customer fails before any request", async () => {
  const stub = stubFetch((url) => { throw new Error(`unexpected request ${url}`); });
  try {
    await connect({ allowedAccountIds: [ALLOWED], enableWrites: true }, async (client) => {
      for (const [name, args] of [
        ["google_ads_get_campaigns", { customerId: OTHER }],
        ["google_ads_run_gaql", { customerId: "222-222-2222", query: "SELECT campaign.id FROM campaign" }],
        ["google_ads_rename_adgroup", { customerId: OTHER, adGroupId: "42", name: "FR", confirm: true }],
        ["google_ads_update_campaign_budget", { customerId: OTHER, budgetId: "7", dailyAmount: 10, confirm: true }],
      ]) {
        const result = await client.callTool({ name, arguments: args });
        assert.equal(result.isError, true, name);
        assert.match(result.content[0].text, /not in GOOGLE_ADS_ACCOUNT_IDS/, name);
      }
    });
    assert.equal(stub.calls.length, 0);
  } finally {
    stub.restore();
  }
});

test("the client refuses another customer even when called directly", async () => {
  const stub = stubFetch(() => json({ access_token: "access" }));
  try {
    const client = new GoogleAdsClient({
      developerToken: "dev", clientId: "id", clientSecret: "secret", refreshToken: "refresh", allowedAccountIds: [ALLOWED],
    });
    await assert.rejects(client.generateKeywordIdeas(OTHER, {}), /not in GOOGLE_ADS_ACCOUNT_IDS/);
    await assert.rejects(client.searchStream(OTHER, "SELECT customer.id FROM customer"), /not in GOOGLE_ADS_ACCOUNT_IDS/);
    assert.equal(stub.calls.length, 0);
  } finally {
    stub.restore();
  }
});

test("account discovery lists the allowed accounts only", async () => {
  const stub = stubFetch((url, init) => {
    if (url.includes("oauth2")) return json({ access_token: "access", expires_in: 3600 });
    if (url.endsWith("customers:listAccessibleCustomers")) {
      return json({ resourceNames: [`customers/${ALLOWED}`, `customers/${OTHER}`] });
    }
    const customer = url.match(/customers\/(\d+)\//)?.[1];
    const query = JSON.parse(String(init.body)).query;
    if (/FROM customer_client/.test(query)) {
      return json([{ results: [
        { customerClient: { id: customer, manager: true } },
        { customerClient: { id: OTHER, descriptiveName: "Hidden" } },
      ] }]);
    }
    return json([{ results: [{ customer: { id: customer, descriptiveName: `Account ${customer}`, manager: false } }] }]);
  });
  try {
    await connect({ allowedAccountIds: [ALLOWED] }, async (client) => {
      const result = await client.callTool({ name: "google_ads_list_accounts", arguments: {} });
      const payload = JSON.parse(result.content[0].text);
      assert.deepEqual(payload.accounts.map((account) => account.id), [ALLOWED]);
      const health = JSON.parse((await client.callTool({ name: "google_ads_health_check", arguments: {} })).content[0].text);
      assert.deepEqual(health.accessibleCustomers.map((account) => account.id), [ALLOWED]);
      assert.deepEqual(health.accountAllowlist, { configured: true, count: 1 });
    });
    assert.ok(stub.calls.every((call) => !call.url.includes(`customers/${OTHER}/`)), "no request may address the other customer");
  } finally {
    stub.restore();
  }
});
