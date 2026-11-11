# 005 — OAuth-Based Connectors Deferred to Post-v2

**Status:** DECIDED  
**Date:** 2026-11-10

## Context
Users frequently want to connect Google Calendar, Gmail, Notion, GitHub, etc. These services
require OAuth 2.0 flows: redirect, code exchange, token refresh, and secure token storage. This
is significantly more complex than bearer-token / API-key connections.

## Options
1. **Build OAuth flow in v2** — requires: redirect URI handling (Capacitor deep link), token
   exchange endpoint, refresh logic, per-provider scopes, Vault storage for refresh tokens.
   High engineering cost; high security surface; Capacitor deep-link OAuth is non-trivial.
2. **Defer OAuth to post-v2; support bearer-token / API-key connections only in v2.**

## Decision
**Option 2 — deferred.** v2 supports only connections authenticated via a static bearer token
or API key (passed as an HTTP header). This covers Home Assistant (Long-Lived Access Token)
and most custom MCP servers. It does not cover Google/Microsoft/GitHub OAuth.

## Consequences
- Do NOT seed a Google Calendar connector.
- Connection UI clearly labels "API Key / Bearer Token" as the only auth type.
- Future work: implement `OAuthProvider` in `manage-connection` with Capacitor deep link + PKCE.
- The `connections` schema has `vault_secret_id` (a Vault UUID); OAuth refresh tokens would
  use the same column, so the schema is forward-compatible.

