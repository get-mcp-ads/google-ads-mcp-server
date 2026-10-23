# Changelog

## 2.1.0 - 2026-10-23 - Renames, Google Ads API v26 and Search Lift
- Add `google_ads_rename_account`, `google_ads_rename_adgroup` and `google_ads_rename_asset_group` from the hosted gateway. Each previews by default and sends the name alone on `confirm: true`.
- Fix `google_ads_generate_keyword_forecast_metrics` for the current API: keywords, locations and languages use the request shape Google introduced in API v24. Negative keywords, a network and an expected conversion rate are no longer accepted, because Google removed them. Google no longer returns impressions or click-through rate for these forecasts; the conversion rate is derived from conversions and clicks.
- Move from Google Ads API v25 to v26. The official v25 to v26 proto differences remove or rename no resource, field or enum this server builds. Raw GAQL follows v26.
- Add the 15 Search Lift metrics of API v26, the `lift_measurement_config` resource, its ID and name, and the `search_lift_keyword_bundle` and `search_property` segments, with their compatibility rules.
- Share one access token between reads and writes. A refused refresh token (`invalid_grant`, `admin_policy_enforced`) now produces one re-authorization message and no further token requests.
- Add the optional `GOOGLE_ADS_ACCOUNT_IDS` allowlist, checked before every request and applied to account discovery. Unset, the server prints a recommendation on stderr. It becomes required in 3.0.0.
- Keep accepting `1`, `yes` and `on` for `GOOGLE_ADS_ENABLE_WRITES`, with a deprecation line on stderr. 3.0.0 will accept only `true`.
- Add timeouts to the write and token requests, bound every response body, and accept only numeric IDs in the simple write tools.
- Require Node.js `^22.23.4 || ^24.22.1 || >=26.12.1`, warn on stderr at startup and in `npm run doctor` on older releases, and test Node 22, 24 and 26 in CI.
- Update `@modelcontextprotocol/sdk` to 1.32.1 and regenerate the lockfile.
- Publish from version tags with `release.yml`, which replaces `publish-mcp.yml`. Add Dependabot.

## 2.0.1 - 2026-09-23 - Public repository restored

- Restore public source hosting under the get-mcp-ads GitHub organization.
- Update repository and support links while preserving npm package and MCP registry names.
- No changes to platform tools or credential requirements.

## 2.0.0 - 2026-09-20 - Gateway sync and security fixes
- Add descending image/video asset pagination.
- Add account-scoped upload processing reads and return the native upload ID.
- Retain API v25, standalone MCC discovery and credential redirect protection.
- Require Node.js 22.12 or newer and check Node 22/24 in CI.
- Update vulnerable dependencies and regenerate the MCP catalog.
- No hosted creative UI or MCP Apps integrations.


## 1.1.0 - 2026-09-13 - Platform capability sync and quality contracts
- Synchronize applicable platform features with GetMCPAds commit b1471be while retaining local read-only exploration tools and credential configuration.
- Expose 34 read tools and 10 explicitly enabled write tools.
- Add MCP annotations, parameter descriptions, structured results, server identity and an offline-generated discovery card.
- Preserve preview/confirmation boundaries; test provider request construction and errors with mocked APIs.
- Refuse credential-bearing redirects and document provider-specific limitations.

No live advertiser mutation is performed by the release tests.

## 1.0.2 - 2026-08-30

- Announce the package version over MCP. Version 1.0.1 still reported 1.0.0 in the handshake.

## 1.0.1 - 2026-08-30

- Add `server.json` and `mcpName` for the official MCP Registry, under `com.getmcpads/google-ads`.
- Skip registry publication when a version is already listed.

## 1.0.0 - 2026-08-29 - First open-source release

- Publish the server as open source under the Apache-2.0 license.
