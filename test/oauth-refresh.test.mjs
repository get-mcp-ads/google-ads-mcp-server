/**
 * A revoked refresh token is detected once and reported as such.
 *
 * Google answers `invalid_grant` when a refresh token was revoked, expired or
 * issued to another client. Nothing this process does can make it work again,
 * so every later call must fail with the same re-authorization message instead
 * of asking Google again.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { GoogleTokenSource, GoogleReauthorizationRequired } from "../src/core/google-oauth.ts";
import { createServer } from "../src/server.ts";

const credentials = { clientId: "client-id", clientSecret: "client-secret-value", refreshToken: "refresh-token-value" };

function stubFetch(handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("invalid_grant becomes a re-authorization error and stops further refreshes", async () => {
  const stub = stubFetch(() => json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400));
  try {
    const source = new GoogleTokenSource(credentials, "GOOGLE_ADS_REFRESH_TOKEN");
    await assert.rejects(source.getAccessToken(), (error) => {
      assert.ok(error instanceof GoogleReauthorizationRequired);
      assert.match(error.message, /invalid_grant/);
      assert.match(error.message, /expired or revoked/);
      assert.match(error.suggestion, /GOOGLE_ADS_REFRESH_TOKEN/);
      assert.match(error.suggestion, /restart the server/);
      assert.ok(!error.message.includes("client-secret-value"));
      assert.ok(!error.message.includes("refresh-token-value"));
      return true;
    });
    await assert.rejects(source.getAccessToken(), GoogleReauthorizationRequired);
    await assert.rejects(source.getAccessToken(), GoogleReauthorizationRequired);
    assert.equal(stub.calls.length, 1, "a revoked token must not be retried");
  } finally {
    stub.restore();
  }
});

test("a Workspace administrator block is reported the same way", async () => {
  const stub = stubFetch(() => json({ error: "admin_policy_enforced" }, 400));
  try {
    const source = new GoogleTokenSource(credentials, "GOOGLE_ADS_REFRESH_TOKEN");
    await assert.rejects(source.getAccessToken(), /Workspace administrator/);
    await assert.rejects(source.getAccessToken(), GoogleReauthorizationRequired);
    assert.equal(stub.calls.length, 1);
  } finally {
    stub.restore();
  }
});

test("a wrong client secret stays an ordinary error, and the next call asks again", async () => {
  const stub = stubFetch(() => json({ error: "invalid_client", error_description: "Unauthorized" }, 401));
  try {
    const source = new GoogleTokenSource(credentials, "GOOGLE_ADS_REFRESH_TOKEN");
    await assert.rejects(source.getAccessToken(), (error) => !(error instanceof GoogleReauthorizationRequired) && /invalid_client/.test(error.message));
    await assert.rejects(source.getAccessToken(), /invalid_client/);
    assert.equal(stub.calls.length, 2);
  } finally {
    stub.restore();
  }
});

test("the token request refuses redirects, has a deadline and is cached", async () => {
  const stub = stubFetch(() => json({ access_token: "access-1", expires_in: 3600 }));
  try {
    const source = new GoogleTokenSource(credentials, "GOOGLE_ADS_REFRESH_TOKEN");
    assert.equal(await source.getAccessToken(), "access-1");
    assert.equal(await source.getAccessToken(), "access-1");
    assert.equal(stub.calls.length, 1);
    assert.equal(stub.calls[0].url, "https://oauth2.googleapis.com/token");
    assert.equal(stub.calls[0].init.redirect, "error");
    assert.ok(stub.calls[0].init.signal instanceof AbortSignal);
  } finally {
    stub.restore();
  }
});

test("reads and writes share one token source, so a revoked token is met once", async () => {
  const stub = stubFetch((url) => {
    if (url.includes("oauth2")) return json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400);
    throw new Error(`No Google Ads request may follow a revoked token: ${url}`);
  });
  const config = {
    developerToken: "dev", ...credentials, logLevel: "error", enableWrites: true,
  };
  const server = createServer(config);
  const client = new Client({ name: "oauth-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  try {
    const read = await client.callTool({ name: "google_ads_get_campaigns", arguments: { customerId: "1234567890" } });
    assert.equal(read.isError, true);
    const text = read.content[0].text;
    assert.match(text, /authorization must be renewed/);
    assert.match(text, /GOOGLE_ADS_REFRESH_TOKEN/);

    const write = await client.callTool({
      name: "google_ads_rename_campaign",
      arguments: { customerId: "1234567890", campaignId: "42", name: "FR_Search", confirm: true },
    });
    assert.equal(write.isError, true);
    assert.match(JSON.stringify(write.content), /authorization must be renewed/);
    assert.equal(stub.calls.length, 1, "one token request for the whole process");
  } finally {
    await client.close();
    await server.close();
    stub.restore();
  }
});
