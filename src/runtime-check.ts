/**
 * First Node.js release of each supported line that carries the October 21,
 * 2026 security fixes, among them a remote code execution in the Brotli
 * decoder. fetch decompresses provider responses, so older runtimes are exposed.
 */
const PATCHED_RELEASES: Record<number, string> = { 22: "22.23.4", 24: "24.22.1", 26: "26.12.1" };
const NEWEST_PATCHED_LINE = 26;

function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** A warning for stderr when this Node.js release lacks those fixes, otherwise undefined. */
export function nodeRuntimeWarning(version: string = process.versions.node): string | undefined {
  const major = Number(version.split(".")[0]);
  if (major > NEWEST_PATCHED_LINE) return undefined;
  const floor = PATCHED_RELEASES[major];
  if (floor && compareVersions(version, floor) >= 0) return undefined;
  const advice = floor
    ? `Upgrade to Node.js ${floor} or newer.`
    : "Use Node.js 22.23.4, 24.22.1, 26.12.1 or a newer release.";
  return `Node.js ${version} lacks the October 2026 security fixes. ${advice}`;
}
