# Contributing

Thanks for considering a contribution. This project is maintained by
[GetMCPAds](https://www.getmcpads.com) and is open to outside patches.

## Getting set up

```bash
git clone https://github.com/get-mcp-ads/google-ads-mcp-server.git
cd google-ads-mcp-server
npm install
cp .env.example .env
```

Then run the checks:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

All four must pass. CI runs them on Node 22, 24 and 26.

## Ground rules

**Never commit a token.** `.env` is gitignored. Before opening a PR, re-read
your diff for anything starting with `1//`, which is the prefix of a Google
refresh token.

**Tests use recorded or synthetic data.** Do not add a test that needs live
credentials to pass; CI has none.

**Metric and breakdown catalogues are the load-bearing part.** If you add or
change an entry in `metric-catalog.ts`, `dimension-catalog.ts`,
`filter-catalog.ts` or `compatibility-rules.ts`, say in the PR description
where the rule comes from: a link to the Google Ads documentation, or the API error
you observed. A plausible-looking rule that is wrong is worse than a missing
one, because the query planner trusts it.

**Write tools must preview first.** Any new write tool has to accept `confirm`
and return a preview when it is absent. A tool that mutates an account on the
first call will not be merged.

**Keep it self-contained.** Runtime dependencies are `@modelcontextprotocol/sdk`
and `zod`. Adding a third needs a good reason.

## Pinned API version

The Google Ads API version is pinned in `src/platforms/google-ads/types.ts`
(`GOOGLE_ADS_API_VERSION`). We move it deliberately, not automatically, because
Google sunsets versions on a schedule and a bump can silently change the shape
of a response. Tests assert the version in the URLs they expect, so a bump means
updating them too, on purpose.

## Credentials never reach the logs or the network beyond Google

Two tests enforce this: one fails if any `fetch` omits `redirect: "error"`, and
one fails if a host other than `googleads.googleapis.com` or
`oauth2.googleapis.com` appears in the source. Both are load-bearing, not
decoration. If your change needs a new host, say why in the PR.

## Commit and PR style

- One logical change per PR.
- Explain *why*, not just *what*. The diff already says what.
- If you fix a bug, add the test that would have caught it.

## Reporting bugs

Open an issue with: what you called, what you expected, what you got, and the
Google Ads API version in use. Redact IDs and tokens.

For anything security-related, do not open an issue. See [SECURITY.md](SECURITY.md).

## Licence

By contributing, you agree that your contributions are licensed under the
Apache License 2.0, as stated in [LICENSE](LICENSE).
