import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { expectedReadme, parseChangelog, repositoryUrl } from "../scripts/release-history.mjs";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json"));

test("the README release history matches CHANGELOG.md", () => {
  const readme = read("README.md");
  assert.equal(readme, expectedReadme(readme, read("CHANGELOG.md"), repositoryUrl(pkg)),
    "Run `npm run release-history` after editing CHANGELOG.md.");
});

test("every release is dated and the latest one is the package version", () => {
  const releases = parseChangelog(read("CHANGELOG.md"));
  assert.ok(releases.length > 0, "CHANGELOG.md has no release");
  assert.equal(releases[0].version, pkg.version, "the first CHANGELOG entry must be the package version");
  for (const release of releases) {
    assert.match(release.date ?? "", /^\d{4}-\d{2}-\d{2}$/, `${release.version} needs a date`);
    assert.ok(release.changes.length > 0, `${release.version} lists no change`);
  }
  const dates = releases.map((release) => release.date);
  assert.deepEqual(dates, [...dates].sort().reverse(), "releases must be listed newest first");
});
