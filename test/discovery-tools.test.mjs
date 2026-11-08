import assert from "node:assert/strict";
import { test } from "node:test";
import { GoogleAdsClient } from "../src/platforms/google-ads/client.ts";
import {
  buildGoogleAdsFieldsQuery,
  validateGoogleAdsFieldsQuery,
} from "../src/platforms/google-ads/discovery-tools.ts";
import { KeywordPlannerRateLimiter } from "../src/core/rate-limiter.ts";

test("field discovery builds structured queries and rejects non-read-only statements", () => {
  assert.equal(
    buildGoogleAdsFieldsQuery({
      nameContains: "conversion",
      category: "METRIC",
      selectable: true,
    }),
    "SELECT name, category, data_type, selectable, filterable, sortable, is_repeated, type_url, enum_values, selectable_with, attribute_resources, metrics, segments WHERE name LIKE '%conversion%' AND category = METRIC AND selectable = true ORDER BY name"
  );
  assert.equal(
    validateGoogleAdsFieldsQuery("SELECT name, enum_values WHERE name = 'campaign.status'"),
    "SELECT name, enum_values WHERE name = 'campaign.status'"
  );
  assert.throws(
    () => validateGoogleAdsFieldsQuery("DELETE FROM google_ads_field"),
    /only SELECT/
  );
  assert.throws(
    () => validateGoogleAdsFieldsQuery("SELECT name; SELECT category"),
    /Exactly one|Semicolons/
  );
});

test("REST client exposes field discovery, geo suggestions, and ad group themes", async () => {
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
    return new Response(JSON.stringify({}), {
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
      loginCustomerId: "999-888-7777",
    });
    client.keywordPlannerRateLimiter = new KeywordPlannerRateLimiter(1);

    await client.searchGoogleAdsFields({ query: "SELECT name", pageSize: 100 });
    await client.suggestGeoTargetConstants({
      locale: "fr",
      countryCode: "FR",
      locationNames: { names: ["Paris"] },
    });
    await client.generateAdGroupThemes("123-456-7890", {
      keywords: ["galerie paris"],
      adGroups: ["customers/1234567890/adGroups/42"],
    });

    const apiCalls = calls.filter((call) => call.url !== "https://oauth2.googleapis.com/token");
    assert.deepEqual(apiCalls.map((call) => call.url), [
      "https://googleads.googleapis.com/v26/googleAdsFields:search",
      "https://googleads.googleapis.com/v26/geoTargetConstants:suggest",
      "https://googleads.googleapis.com/v26/customers/1234567890:generateAdGroupThemes",
    ]);
    assert.deepEqual(JSON.parse(apiCalls[0].init.body), {
      query: "SELECT name",
      pageSize: 100,
    });
    assert.deepEqual(JSON.parse(apiCalls[1].init.body).locationNames, {
      names: ["Paris"],
    });
    assert.deepEqual(JSON.parse(apiCalls[2].init.body).adGroups, [
      "customers/1234567890/adGroups/42",
    ]);
    assert.equal(apiCalls[0].init.headers["login-customer-id"], "9998887777");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
