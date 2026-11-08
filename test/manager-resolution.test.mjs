/**
 * The manager account, resolved rather than configured.
 *
 * Google refuses any request against an account held by an MCC unless the call
 * names that MCC in `login-customer-id`. The refusal is a bare
 * `USER_PERMISSION_DENIED` naming neither the account nor the manager, so it
 * reads as missing access rather than as a missing header.
 *
 * `GOOGLE_ADS_LOGIN_CUSTOMER_ID` answers it when you already know. These tests
 * cover the case where you do not, and the sentence added to the error when
 * resolution could not help.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(here, "..", "src", "platforms", "google-ads", "client.ts"), "utf8");

test("a manager is resolved for a customer that is not directly accessible", () => {
  assert.match(SOURCE, /private async resolveLoginCustomerId/);
  // Discovery reads the manager only to find the account; GOOGLE_ADS_ACCOUNT_IDS
  // still decides which accounts the tools may reach.
  assert.match(SOURCE, /getClientAccounts\(candidate, "manager-discovery"\)/);
});

test("nothing is announced for a directly accessible customer", () => {
  // Naming a manager an account does not have fails exactly as hard as
  // omitting one it does. The early return is the whole point.
  assert.match(SOURCE, /accessible\.includes\(wanted\)[\s\S]{0,120}return undefined/);
});

test("the configured value still wins", () => {
  // Someone who set GOOGLE_ADS_LOGIN_CUSTOMER_ID has said what they want, and
  // discovery must not second-guess it or spend requests confirming it.
  assert.match(SOURCE, /if \(this\.loginCustomerId\) return this\.loginCustomerId;/);
});

test("resolution is cached, including when the answer is none", () => {
  assert.match(SOURCE, /managerCache/);
  assert.match(SOURCE, /this\.managerCache\.set\(wanted, undefined\)/);
});

test("a failed discovery does not fail the query", () => {
  // Discovery is a convenience. If it throws, the query still runs and the
  // error worth reporting is the query's own.
  assert.match(SOURCE, /catch \(error\)[\s\S]{0,320}Could not resolve a manager/);
});

test("both query paths resolve before sending", () => {
  const calls = SOURCE.match(/await this\.resolveLoginCustomerId\(/g) ?? [];
  assert.equal(calls.length, 2, "searchStream and search must both resolve");
});

test("a permission error gains the sentence Google leaves out", () => {
  assert.match(SOURCE, /function withManagerHint/);
  assert.match(SOURCE, /login-customer-id/);
  assert.match(SOURCE, /google_ads_get_account_hierarchy/);
});

test("the hint is withheld when a manager was announced", () => {
  // A manager was named and access was still refused: the cause really is
  // permissions, and a hint about a header would send the reader the wrong way.
  assert.match(SOURCE, /if \(announcedManager\) return message;/);
});

test("the hint only fires on permission errors", () => {
  assert.match(SOURCE, /permission\|PERMISSION_DENIED/);
});
