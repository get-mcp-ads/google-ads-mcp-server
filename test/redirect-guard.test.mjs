/**
 * Every outbound call carries a bearer token or a client secret. Following a
 * redirect would forward that credential to whatever host the redirect names,
 * so no fetch in this codebase may omit `redirect: "error"`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

function sourceFiles(dir = "src", acc = []) {
  for (const entry of readdirSync(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true })) {
    if (entry.isDirectory()) sourceFiles(`${dir}/${entry.name}`, acc);
    else if (entry.name.endsWith(".ts")) acc.push(`${dir}/${entry.name}`);
  }
  return acc;
}

test("every fetch refuses to follow redirects", () => {
  const offenders = [];

  for (const file of sourceFiles()) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    let index = text.indexOf("fetch(");
    while (index !== -1) {
      // The options object of a fetch call ends at the first `});` that follows.
      const tail = text.slice(index, index + 1200);
      const end = tail.indexOf("});");
      const call = end === -1 ? tail : tail.slice(0, end);
      if (!call.includes('redirect: "error"')) {
        const line = text.slice(0, index).split("\n").length;
        offenders.push(`${file}:${line}`);
      }
      index = text.indexOf("fetch(", index + 1);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `These fetch calls may follow a redirect and leak credentials: ${offenders.join(", ")}`,
  );
});

test("the only hosts this server can reach are Google's", () => {
  const hosts = new Set();
  for (const file of sourceFiles()) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    for (const match of text.matchAll(/https:\/\/([a-z0-9.-]+)/gi)) {
      const host = match[1].replace(/\.$/, "");
      // Documentation links in comments and SPDX headers are not call targets.
      if (host === "mcp.getmcpads.com" || host === "github.com" || host === "www.getmcpads.com" ||
          host === "modelcontextprotocol.io" || host.endsWith("developers.google.com")) continue;
      hosts.add(host);
    }
  }
  assert.deepEqual(
    [...hosts].sort(),
    ["googleads.googleapis.com", "i.ytimg.com", "oauth2.googleapis.com", "www.youtube.com"],
    "A new outbound host appeared. That is a deliberate decision, not an accident.",
  );
});
