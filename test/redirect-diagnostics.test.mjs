import { test } from "node:test";
import assert from "node:assert/strict";
import { refuseRedirect } from "../src/core/redirects.ts";
test("redirect errors do not disclose signed URLs or credentials", () => {
  const response = new Response(null, {status:302,headers:{location:"https://example.com/?access_token=private-token"}});
  assert.throws(() => refuseRedirect(response, "Provider"), error => error.message.includes("302") && !error.message.includes("private-token") && !error.message.includes("example.com"));
  assert.doesNotThrow(() => refuseRedirect(new Response("{}"), "Provider"));
});
