import { test } from "node:test";
import assert from "node:assert/strict";
import { nodeRuntimeWarning } from "../src/runtime-check.ts";

test("patched releases start without a warning", () => {
  for (const version of ["22.23.4", "22.24.0", "24.22.1", "24.30.2", "26.12.1", "26.13.0", "27.0.0"]) {
    assert.equal(nodeRuntimeWarning(version), undefined, version);
  }
});

test("an older release of a supported line names the release to install", () => {
  assert.match(nodeRuntimeWarning("22.23.3"), /22\.23\.4/);
  assert.match(nodeRuntimeWarning("22.12.0"), /22\.23\.4/);
  assert.match(nodeRuntimeWarning("24.22.0"), /24\.22\.1/);
  assert.match(nodeRuntimeWarning("26.12.0"), /26\.12\.1/);
});

test("an unsupported line is told which lines carry the fixes", () => {
  for (const version of ["20.19.5", "23.11.1", "25.9.0"]) {
    assert.match(nodeRuntimeWarning(version), /22\.23\.4, 24\.22\.1, 26\.12\.1/, version);
  }
});
