# ADR 010: Monetization Wiring, Provider-Agnostic Webhooks, and BYOK

**Status:** Accepted (Phase 7 — Monetization Architecture)

## Context
Simple v2 requires a robust monetization foundation adhering to core product constraints:
1. Multi-tier subscription plans (`free`, `pro`, `group`) with active app limits and monthly credit allowances.
2. Provider-agnostic billing integration (deferring vendor lock-in until distribution channels are finalized per ADR 006).
3. Strict enforcement: clients must **never** be capable of self-upgrading entitlements or bypassing quotas via client-side manipulation.
4. Safe lifecycle management: plan downgrades or cancellations must **never** delete user data or apps; excess active apps are automatically transitioned to `sleeping` status.
5. Bring Your Own Key (BYOK): power users can configure their own LLM API keys (e.g. Groq) to bypass monthly credit limits. In accordance with Constraint #5, keys must remain strictly server-side and AES-GCM-256 encrypted at rest.

## Architecture & Decisions

### 1. Entitlement State & RLS Enforcement
- Table `entitlements` records `user_id`, `plan`, `active_app_limit`, `monthly_credit_limit`, `credits_used`, and `period_start`.
- PostgreSQL RLS enforces a strict `SELECT`-only policy for authenticated users (`"entitlements select own"`). No `INSERT`, `UPDATE`, or `DELETE` policies exist for clients.
- RPC functions `consume_credits()` and `enforce_active_limit()` have their execution permissions explicitly revoked from `anon`, `authenticated`, and `public`. Only `service_role` (Edge Functions) can invoke them.

### 2. Provider-Agnostic `billing-webhook` Edge Function
- Located at `supabase/functions/billing-webhook/`.
- Authenticated via secret token (`x-webhook-secret` header or Bearer token matching `BILLING_WEBHOOK_SECRET`).
- Supported events:
  - `subscription.created` & `subscription.updated`: updates plan tier, updates limits, runs `enforce_active_limit(user_id)`, and writes an audit ledger entry.
  - `subscription.canceled`: resets user plan to `free`, limits to 3 active apps and 100 monthly credits, and sleeps any excess active apps.
  - `credits.grant`: grants bonus credits to user's monthly balance.
- An `EntitlementProvider` interface and `DevEntitlementProvider` implementation allow test and dev environments to trigger entitlement transitions seamlessly.

### 3. Server-Side BYOK (Bring Your Own Key) Secrets
- Migration `004_byok_secrets.sql` creates table `byok_secrets` with RLS enabled and all access revoked from `public`, `anon`, and `authenticated`.
- Edge Function `manage-byok` provides authenticated CRUD:
  - `set`: encrypts the raw API key using AES-GCM-256 via Web Crypto (`secretCrypto.ts`), generates a non-sensitive preview (`gsk_••••3a1f`), and persists to `byok_secrets`.
  - `get`: returns `{ has_byok: boolean, preview: string, provider: string }`. The plaintext key is **never** sent to the client.
  - `delete`: purges the encrypted key row.
- In `generate-app` and `run-llm-action`:
  - If caller has an active BYOK key, the key is decrypted server-side and injected into the LLM runtime configuration.
  - Monthly credit consumption is bypassed (cost = 0) since the LLM expense is borne by the user's provider account.

## Consequences
- No vendor SDKs (Stripe, RevenueCat, Google Play Billing) are hardcoded into the frontend application bundle.
- Users cannot manipulate plan tiers or grant themselves credits from the browser.
- Downgrades preserve all apps safely in `sleeping` mode; users can wake apps when slots open or export manifests at any time.
- Plaintext API keys never leave server-side Edge Functions.

