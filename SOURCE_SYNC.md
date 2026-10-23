# Source synchronization

Reviewed on 2026-10-23 against getmcpads source revision `3e1c2c8`. The previous review used `41cc1ca`.

## Synchronized

- `google_ads_rename_account`, `google_ads_rename_adgroup` and `google_ads_rename_asset_group`, from the gateway's Google Ads writes (commit `958ba80`). They keep the gateway names, parameters, name limits and request bodies, with numeric ID validation added because each ID becomes a URL path segment.
- The handling of a refused refresh token (commit `210e1f6`). The gateway marks the connection expired and asks the person to reconnect. This server has no stored connection, so it remembers the refusal for the life of the process, answers every later call with one re-authorization message naming `GOOGLE_ADS_REFRESH_TOKEN`, and sends no further token request. As in the gateway, only `invalid_grant` and `admin_policy_enforced` are treated as final. `invalid_client` and `unauthorized_client` stay ordinary errors.

## Reviewed and not synchronized

- Commit `0c6cfaa` adds a catalog dimension used by hosted alerts on product catalogues. Alerts belong to the hosted product.
- Commit `210e1f6` also adds a second OAuth client per connection and its storage. Both are hosted connection management. This server uses the one client given in `GOOGLE_ADS_CLIENT_ID`.
- Commit `21a8ad7` keeps a structured envelope on errors for the gateway's workspace decoration. This server adds no decoration, and its errors keep the plain MCP error shape.

## Differences from the gateway

- **API version.** The gateway still calls Google Ads API v25. This server moves to v26, released by Google on October 14, 2026. The official [v26 release notes](https://developers.google.com/google-ads/api/docs/release-notes) and the [v25 to v26 proto differences](https://developers.google.com/google-ads/api/docs/upgrade#proto-differences-between-v25-v26) remove no proto file. The fields they remove or rename are `ConversionTrackingSetting.enhanced_conversions_for_leads_enabled`, the hotel criteria of `AdGroupBidModifier`, the `HotelDateSelectionType` enum of `segments.user_set_dates` and six `HOTEL_*` criterion errors. None of them is used here, and `test/api-version.test.mjs` fails if one appears. The services this server calls are all present in v26.
- **Search Lift.** The 15 metrics, the two segments and the `lift_measurement_config` resource come from the official v26 field reference. They are selectable only from `lift_measurement_config`, and the compatibility rules refuse them elsewhere.
- **Account allowlist.** The gateway receives the selected accounts from its database. This server reads them from the optional `GOOGLE_ADS_ACCOUNT_IDS`. Manager accounts outside the list are queried only to find which manager holds an allowed account.

The public server remains self-contained. Hosted billing, workspaces, account-selection storage, creative galleries, alerts, Google Sheets exports, client memory, Launcher files and MCP Apps UI are outside this synchronization. Existing standalone protections and public features newer than the hosted source are retained.

Validation uses synthetic data and a mocked `fetch`. No live advertising write is required by the test suite. The generated server-card.json is the source of truth for this revision's tool schemas.

Maintainer: Emmanuel, getmcpads. Contact: hello@getmcpads.com.
