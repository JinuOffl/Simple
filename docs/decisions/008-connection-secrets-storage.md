# ADR 008: Server-Side Storage of Connector Secrets (`connection_secrets`)

**Status:** Accepted (Phase 4 — Web-First Architecture)

## Context
`SIMPLE_V2_SPEC.md` Section 5 stores `connections.secret_ref` pointing to Supabase Vault (`vault.secrets`), while Constraint #5 forbids exposing secrets in the client bundle or client-readable columns. In our web-first phase (`MIGRATION_PLAN.md`, Open Question #2), hosted Supabase Vault extensions and cloud service dependencies are deferred for local/web testing, yet users still configure static Bearer Tokens / API Keys for MCP servers (`ADR 005`). Storing raw secrets directly inside `public.connections` would let `authenticated` clients read them back via `SELECT * FROM connections`.

## Options Considered
1. **Store tokens directly in `connections.secret_ref`**
   - Rejected: violates Constraint #5 because `connections` has owner `SELECT` RLS enabled for the Connections UI (`server_url`, `allowed_tools`).
2. **Mandate Supabase Vault (`vault.secrets`) immediately**
   - Rejected for now: adds a hard dependency on Supabase Vault SQL extensions (`pgsql_vault`) during local PGlite tests and early web-first self-hosted runs.
3. **Separate `connection_secrets` table (`service_role` only) + AES-GCM-256 application encryption**
   - `public.connection_secrets` holds `(connection_id, user_id, auth_header_name, encrypted_secret)` with RLS enabled, zero `anon`/`authenticated` policies, and explicit `REVOKE ALL` from `public`, `anon`, and `authenticated`.
   - `secretCrypto.ts` encrypts tokens using Web Crypto AES-GCM-256 (`CONNECTION_ENCRYPTION_KEY`) before persisting `v1:<iv>:<ciphertext>`.
   - `connections.secret_ref` stores a non-secret handle (e.g., `enc:v1:<connection_id>`), so client queries know a token is present (`has_token`) without ever receiving ciphertext or plaintext.

## Decision
Use Option 3 (`supabase/migrations/003_connection_secrets.sql` + `supabase/functions/_shared/secretCrypto.ts`) for Phase 4. When Supabase Vault is enabled in production later, `manage-connection` and `run-mcp-action` can migrate secrets by `secret_ref` prefix (`vault:` vs `enc:v1:`) with zero breaking schema changes to `connections`.

## Consequences
- Clients (`anon` and `authenticated`) can never query or mutate `connection_secrets` via PostgREST or RPC.
- Edge Functions (`manage-connection`, `run-mcp-action`) must have `CONNECTION_ENCRYPTION_KEY` configured in non-dev environments (`allowEphemeralDevKey: false` in production handlers).
- All connector secret writes and deletions go through `manage-connection` so cascade cleanup (`ON DELETE CASCADE` on `connection_id`) also works seamlessly.

