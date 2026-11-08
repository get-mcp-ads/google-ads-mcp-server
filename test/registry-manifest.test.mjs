/**
 * package.json and server.json both carry the version, the npm package name and
 * the registry name. They have to agree: the MCP Registry verifies ownership by
 * matching `mcpName` in the published npm package against the server name, so a
 * drift here is not a cosmetic problem, it is a failed publish.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) =>
  JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), "utf8"));

const pkg = read("package.json");
const server = read("server.json");

test("server.json and package.json agree on the registry name", () => {
  assert.equal(
    pkg.mcpName,
    server.name,
    "package.json mcpName must equal server.json name, or the registry refuses the publish",
  );
  assert.match(pkg.mcpName, /^com\.getmcpads\/[a-z-]+$/);
});

test("server.json and package.json agree on the version", () => {
  assert.equal(pkg.version, server.version, "bump both, or the registry listing goes stale");
  const npmPackage = server.packages?.find((p) => p.registryType === "npm");
  assert.ok(npmPackage, "server.json must declare the npm package");
  assert.equal(npmPackage.identifier, pkg.name);
  assert.equal(npmPackage.version, pkg.version);
});

test("server.json points at this repository and its product page", () => {
  assert.equal(server.repository.source, "github");
  assert.equal(server.repository.url, pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, ""));
  assert.equal(server.websiteUrl, pkg.homepage);
  assert.match(server.websiteUrl, /^https:\/\/www\.getmcpads\.com\/tools\//);
});

test("the description fits what the registry accepts", () => {
  // The official schema caps description at 100 characters.
  assert.ok(server.description.length <= 100, `${server.description.length} characters, max 100`);
  assert.ok(server.title.length <= 100);
});

test("every declared environment variable is documented in .env.example", () => {
  const env = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  const declared = server.packages.flatMap((p) => p.environmentVariables ?? []).map((v) => v.name);
  const undocumented = declared.filter((name) => !env.includes(name));
  assert.deepEqual(undocumented, [], `Declared in server.json but absent from .env.example: ${undocumented}`);
});

test("the version the server announces matches the package", () => {
  // PACKAGE_VERSION is a literal in src/server.ts, so nothing stops a release
  // from bumping package.json and leaving the handshake announcing the old
  // number. A client reading the version would then be told something false.
  const source = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
  const announced = source.match(/PACKAGE_VERSION = "([0-9]+\.[0-9]+\.[0-9]+)"/)?.[1];
  assert.equal(announced, pkg.version, "src/server.ts and package.json disagree on the version");
});
