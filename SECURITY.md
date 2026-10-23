# Security Policy

This server holds credentials that can read, and when writes are enabled
modify, live advertising accounts. We take reports seriously.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Use GitHub's private vulnerability reporting on this repository:
[Report a vulnerability](https://github.com/get-mcp-ads/google-ads-mcp-server/security/advisories/new).

We aim to acknowledge a report within 3 business days and to ship a fix or a
documented mitigation within 30 days. We will credit you in the advisory unless
you ask us not to.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 2.x     | ✅        |
| 1.x     | ❌        |

## What this server does with your credentials

- The developer token, OAuth client secret and refresh token are read once from
  the environment at startup and kept in memory. None of them is ever written
  to disk or logged, at any log level.
- The access token is refreshed from the refresh token and **cached in memory
  until a minute before it expires**, so a working session does not re-request
  it on every call. Reads and writes share it. When Google refuses the refresh
  token for good (`invalid_grant`), the server says so once and stops asking
  for a new token until it restarts.
- With `GOOGLE_ADS_ACCOUNT_IDS` set, a call naming another customer is refused
  before any request is sent.
- **Two hosts are contacted, and only two**: `googleads.googleapis.com` for the
  API and `oauth2.googleapis.com` for the token exchange. *A test fails the
  build if a third host ever appears in the source.*
- **No fetch follows a redirect.** Every outbound call sets `redirect: "error"`,
  so a redirect cannot forward a bearer token or client secret to another host.
  *A test fails the build if any fetch omits this.*
- No telemetry, no analytics, no phone-home.

## Handling your credentials safely

- The refresh token is the sensitive one: it does not expire, and it can mint
  access tokens indefinitely. Treat it like a password.
- Use an OAuth client dedicated to this server, so you can revoke it without
  affecting anything else.
- Grant the Google account only the ad accounts it needs. Read-only access in
  Google Ads is enough unless you enable writes.
- Your MCP client config file is usually plain text on disk. Check its
  permissions, and never commit it.
- Revoke from [Google account permissions](https://myaccount.google.com/permissions)
  if you suspect exposure.

## Scope

Vulnerabilities in the Google Ads API itself are not in scope here; report
those to Google.
