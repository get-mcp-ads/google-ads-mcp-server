import assert from "node:assert/strict";
import { test } from "node:test";
import { GoogleAdsClient } from "../src/platforms/google-ads/client.ts";
import {
  buildGoogleAdsReadOnlyPath,
  GOOGLE_ADS_READ_ONLY_OPERATIONS,
  validateGoogleAdsReadOnlyRequest,
} from "../src/platforms/google-ads/read-rpc.ts";

test("read-only operation catalog resolves customer and global paths without arbitrary endpoints", () => {
  assert.deepEqual(
    buildGoogleAdsReadOnlyPath("generateReachForecast", "123-456-7890").path,
    "customers/1234567890:generateReachForecast"
  );
  assert.equal(
    buildGoogleAdsReadOnlyPath("listPlannableProducts").path,
    ":listPlannableProducts"
  );
  assert.equal(GOOGLE_ADS_READ_ONLY_OPERATIONS.listInvoices.method, "GET");
  assert.equal("generateInsightsFinderReport" in GOOGLE_ADS_READ_ONLY_OPERATIONS, false);
  assert.throws(
    () => buildGoogleAdsReadOnlyPath("generateInsightsFinderReport", "1234567890"),
    /Unsupported read-only operation/
  );
  assert.throws(
    () => buildGoogleAdsReadOnlyPath("generateAudienceCompositionInsights"),
    /requires a numeric customerId/
  );
  for (const key of ["accessToken", "clientSecret", "apiKey", "oauthToken"]) {
    assert.throws(
      () => validateGoogleAdsReadOnlyRequest({ [key]: "must-not-pass" }),
      /Credentials are not accepted/
    );
  }
  assert.doesNotThrow(() => validateGoogleAdsReadOnlyRequest({ pageToken: "legitimate-page-token" }));
});

test("REST client runs allowlisted POST and GET services and blocks mutation-like paths", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ url: String(input), init });
    if (String(input) === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({
        access_token: "test-access-token",
        token_type: "Bearer",
        expires_in: 3600,
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const client = new GoogleAdsClient({
      developerToken: "developer-token",
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "refresh-token",
    });
    await client.runReadOnlyService(
      "customers/1234567890:generateReachForecast",
      "POST",
      { campaignDuration: { durationInDays: 30 } }
    );
    await client.runReadOnlyService(
      ":listPlannableProducts",
      "POST",
      { plannableLocationId: "2250" }
    );
    await client.runReadOnlyService(
      "customers/1234567890/invoices",
      "GET",
      undefined,
      { issueYear: 2026, issueMonth: "JUNE" }
    );

    const apiCalls = calls.filter((call) => call.url !== "https://oauth2.googleapis.com/token");
    assert.deepEqual(apiCalls.map((call) => call.url), [
      "https://googleads.googleapis.com/v26/customers/1234567890:generateReachForecast",
      "https://googleads.googleapis.com/v26:listPlannableProducts",
      "https://googleads.googleapis.com/v26/customers/1234567890/invoices?issueYear=2026&issueMonth=JUNE",
    ]);
    assert.equal(apiCalls[0].init.method, "POST");
    assert.equal(apiCalls[0].init.redirect, "error");
    assert.equal(apiCalls[2].init.method, "GET");
    await assert.rejects(
      () => client.runReadOnlyService("customers/1234567890:mutateCampaigns", "POST", {}),
      /Mutation-like|allowlist/
    );
    await assert.rejects(
      () => client.runReadOnlyService("customers/1234567890:generateInsightsFinderReport", "POST", {}),
      /allowlist/
    );
    await assert.rejects(
      () => client.runReadOnlyService("customers/1234567890:generateUnknownReport", "POST", {}),
      /allowlist/
    );
    await assert.rejects(
      () => client.runReadOnlyService("customers/1234567890:generateReachForecast", "PUT", {}),
      /only GET or POST/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
