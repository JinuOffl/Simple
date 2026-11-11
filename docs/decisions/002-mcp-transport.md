# 002 — MCP Transport and SDK Choice

**Status:** STUB — to be verified in Phase 1b  
**Date:** 2026-11-10

## Context
The spec requires Supabase Edge Functions (Deno) to act as an MCP client using the official
`@modelcontextprotocol/sdk`. Stdio transport is impossible in Edge Functions (no process spawning).
Remote MCP servers only, over Streamable HTTP.

## Options
1. **`@modelcontextprotocol/sdk` via `npm:@modelcontextprotocol/sdk`** — official, maintained.
   Risk: Deno `npm:` compatibility and Streamable HTTP transport must be verified against the
   current SDK version.
2. **Hand-rolled HTTP client** — just `fetch` to MCP endpoints with manually constructed
   JSON-RPC messages. Avoids SDK compatibility risk but duplicates maintained code.

## Decision
*Pending Phase 1b verification.* Planned: official SDK via `npm:` specifier with Streamable HTTP
transport. Phase 1b's binary gate is specifically this verification. If the SDK or transport does
not work under Deno, stop, report, and fall back to option 2.

## Questions to verify in Phase 1b
- Does `import { Client } from "npm:@modelcontextprotocol/sdk/client/index.js"` resolve in Deno?
- Is `StreamableHTTPClientTransport` available in the current SDK version?
- Does the client handle server-sent events correctly in Deno's fetch implementation?

## Consequences
- If SDK works: adopt it. Future SDK upgrades are centralized.
- If SDK fails: hand-roll option 2 and document why in this ADR.
- stdio MCP servers are permanently out of scope for Edge Function deployment.

