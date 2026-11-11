# ADR 002: MCP Transport & Client Library in Deno Edge Functions

- **Status:** DECIDED
- **Date:** 2026-11-11

## Context

Simple's Phase 1b architecture runs runtime MCP calls (`mcp_call` actions) inside a Supabase/Deno Edge Function (`run-mcp-action`) connecting to remote Streamable HTTP MCP servers with SSRF validation. We needed to verify whether `@modelcontextprotocol/sdk` v1 or `@modelcontextprotocol/client` v2 passes strict TypeScript checks and executes Streamable HTTP client calls cleanly under Deno `2.9.6`.

## Options

1. `npm:@modelcontextprotocol/sdk@1.32.2` (`client/index.js` + `client/streamableHttp.js`)
2. `npm:@modelcontextprotocol/client@2.4.0` (`Client` + `StreamableHTTPClientTransport`)
3. Hand-rolled JSON-RPC over `fetch` + manual SSE parsing

## Verification Results (Deno 2.9.6 / TS 6.0.3)

- Tested `npm:@modelcontextprotocol/sdk@1.32.2`: runtime Streamable HTTP calls succeeded, but `deno check` with `"strict": true` failed with `TS7006` (`Parameter 't' implicitly has an 'any' type` in `client.listTools().tools.map(...)`), and the full package pulls ~70 transitive packages including Node/Express server dependencies.
- Tested `npm:@modelcontextprotocol/client@2.4.0` with `"nodeModulesDir": "none"` and `"strict": true`: passed `deno check` with 0 errors, installed ~14 focused packages, supported custom `fetch` injection on `StreamableHTTPClientTransport` (allowing our SSRF-validated `fetch` wrapper with `redirect: "manual"`), and interoperated cleanly at runtime over both SSE and JSON Streamable HTTP responses against `@modelcontextprotocol/sdk@1.32.2`'s `WebStandardStreamableHTTPServerTransport`.

## Decision

- Use **`npm:@modelcontextprotocol/client@2.4.0`** (`Client` and `StreamableHTTPClientTransport`) inside `supabase/functions/run-mcp-action`, with custom SSRF-hardened `fetch` passed to `StreamableHTTPClientTransport`.
- Add `supabase/functions/deno.json` with `"nodeModulesDir": "none"` and `"compilerOptions": { "strict": true }` so Deno Edge Functions do not clash with the React app's root `package.json` / `zod@4`.
- Use `@modelcontextprotocol/sdk@1.32.2`'s `McpServer` + `WebStandardStreamableHTTPServerTransport` for local/test fake MCP servers, ensuring wire compatibility with v1 MCP servers.

## Consequences

- `run-mcp-action` stays strictly typed under Deno without Express/Node server bloat.
- Every outbound HTTP request opened by `StreamableHTTPClientTransport` (initialization POST, tool POST, SSE GET, DELETE) goes through our SSRF guard before `fetch()` executes.
