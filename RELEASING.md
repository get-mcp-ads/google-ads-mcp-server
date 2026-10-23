# Publishing releases

A version tag publishes a release. The workflow `.github/workflows/release.yml` runs on every tag `vX.Y.Z` and publishes, in this order, the npm package, the GitHub release and the MCP Registry entry.

## Before tagging

1. Set the same version in `package.json`, `server.json` (twice) and `src/server.ts`. The test suite fails when they differ.
2. Add a `## X.Y.Z - YYYY-MM-DD` section to `CHANGELOG.md`. Its text becomes the GitHub release notes.
3. Update the README: What's new, the install tag, upgrade notes and tool counts.
4. Run `npm run catalog` so `server-card.json` matches the tools.
5. Merge the reviewed pull request after CI succeeds on Node 22, 24 and 26.

## Tagging

```bash
git checkout main && git pull
git tag v2.1.0
git push origin v2.1.0
```

## What the workflow does

1. Checks out the tag, installs with `npm ci`, audits runtime dependencies, typechecks, builds and runs the tests.
2. Refuses a tag that is not a stable version or does not match `package.json`.
3. Publishes the package to npm with provenance, through npm trusted publishing. No npm token is stored in the repository. The package needs a trusted publisher on npmjs.com that names this repository and `release.yml`.
4. Creates the GitHub release for the tag, with the matching `CHANGELOG.md` section as notes, and marks it Latest.
5. Publishes `server.json` to the MCP Registry, authenticated through the `getmcpads.com` DNS key in the `MCP_DNS_PRIVATE_KEY` secret. The registry reads `mcpName` from the published npm package, which is why npm comes first.

Each step skips cleanly when its target already holds the version. When a step fails, fix the cause and run the workflow again from the Actions tab with **Run workflow**, giving the existing tag.
