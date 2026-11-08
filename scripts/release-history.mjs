#!/usr/bin/env node
// Rewrites the release history in README.md from CHANGELOG.md: the latest
// release in full, then every earlier release with its date and first change.
// Run `npm run release-history` after editing CHANGELOG.md; a test fails when
// the README falls behind.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const START = "<!-- release-history:start -->";
export const END = "<!-- release-history:end -->";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

/** Changelog headings read `## 2.1.0 - 2026-10-23 - Optional title`. */
export function parseChangelog(text) {
  const releases = [];
  let current;
  for (const line of text.split("\n")) {
    const heading = line.match(/^## (\d+\.\d+\.\d+)(?: - (\d{4}-\d{2}-\d{2}))?(?: - (.+?))?\s*$/);
    if (heading) {
      current = { version: heading[1], date: heading[2] ?? null, title: heading[3] ?? null, changes: [] };
      releases.push(current);
    } else if (line.startsWith("## ")) {
      current = undefined;
    } else if (current && line.startsWith("- ")) {
      current.changes.push(line.slice(2).trim());
    } else if (current && current.changes.length && /^\s+\S/.test(line)) {
      current.changes[current.changes.length - 1] += ` ${line.trim()}`;
    }
  }
  return releases;
}

export function longDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

function firstSentence(text) {
  const match = text.match(/^(.+?[.!?])(?=\s+[A-Z`]|$)/);
  return (match ? match[1] : text).replace(/\|/g, "\\|");
}

export function renderHistory(releases, repoUrl) {
  const [latest, ...earlier] = releases;
  const heading = `v${latest.version}${latest.title ? `: ${latest.title}` : ""}`;
  const lines = [
    START,
    `**[${heading}](${repoUrl}/releases/tag/v${latest.version})${latest.date ? ` · ${longDate(latest.date)}` : ""}**`,
    "",
    ...latest.changes.map((change) => `- ${change}`),
  ];
  if (earlier.length) {
    lines.push("", "**Earlier releases**", "", "| Version | Date | Highlights |", "| --- | --- | --- |");
    for (const release of earlier) {
      const summary = release.title ?? firstSentence(release.changes[0] ?? "");
      lines.push(`| ${release.version} | ${release.date ? longDate(release.date) : ""} | ${summary} |`);
    }
  }
  lines.push("", `[Full changelog](CHANGELOG.md) · [All releases](${repoUrl}/releases)`, END);
  return lines.join("\n");
}

export function expectedReadme(readme, changelog, repoUrl) {
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (start === -1 || end === -1 || end < start) throw new Error(`README.md needs ${START} and ${END} markers.`);
  return readme.slice(0, start) + renderHistory(parseChangelog(changelog), repoUrl) + readme.slice(end + END.length);
}

export function repositoryUrl(pkg) {
  return pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = new URL("../", import.meta.url);
  const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
  const readme = readFileSync(new URL("README.md", root), "utf8");
  const changelog = readFileSync(new URL("CHANGELOG.md", root), "utf8");
  writeFileSync(new URL("README.md", root), expectedReadme(readme, changelog, repositoryUrl(pkg)));
  console.log("README.md release history updated from CHANGELOG.md.");
}
