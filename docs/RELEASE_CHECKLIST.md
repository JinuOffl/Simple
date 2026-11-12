# Simple v2 — Release Readiness Checklist

> **Version:** 2.0.0 (Web-First Release)  
> **Date Verified:** 2026-11-12  
> **Status:** ALL CHECKS PASSED (Ready for Deployment)

---

## 1. Non-Negotiable Architectural Invariants

- [x] **Constraint 1 (No Executable Code Generation):** The LLM never emits procedural code that executes with application privileges. It emits schema-validated declarative manifests (data). All UI elements map to a fixed, reviewed component registry.
- [x] **Constraint 2 (Zero LLM on Open):** Opening and running saved apps requires zero generation-LLM calls; apps initialize immediately from stored manifests.
- [x] **Constraint 3 (Minimal RFC 6902 Patches):** App edits generate minimal JSON patches (`RFC 6902`) against existing manifests rather than full regeneration.
- [x] **Constraint 4 (Strict Validation & Bounded Repair):** Every manifest is strictly validated against Zod schema, referential integrity, and capability requirements before preview or saving. Invalid output undergoes bounded auto-repair before failing safely.
- [x] **Constraint 5 (Server-Side Secrets):** All secrets (LLM provider keys, webhook secrets, connector Bearer tokens, and BYOK credentials) stay strictly server-side. The client bundle contains zero API secrets.
- [x] **Constraint 6 (Untrusted Content):** Connector outputs and user data are treated as untrusted strings. No `eval()`, `new Function()`, or `dangerouslySetInnerHTML`.
- [x] **Constraint 7 (Zero Data Loss):** No user app or data is ever deleted due to plan limits or downgrades. Excess active apps transition gracefully to `sleeping` status.
- [x] **Constraint 8 (Honesty Over Magic):** Unsupported or dangerous requests trigger honest, typed refusals rather than hallucinatory workarounds.

---

## 2. Component Registry & UI Engine

- [x] **Registry Completeness:** All 23 components implemented and registered (`Button`, `Card`, `Text`, `Input`, `Switch`, `Toggle`, `Badge`, `Divider`, `Icon`, `Spacer`, `Progress`, `Checklist`, `RadioGroup`, `Markdown`, `Stat`, `Slider`, `Timer`, `Tabs`, `List`, `Table`, `Form`, `Chart`, `ChatThread`). Zero stubs remaining.
- [x] **Dual UI Spec Support:** `UiSpecAdapter` transparently supports both JSON manifests and OpenUI Lang with bidirectional conversion and error reporting (ADR 004).
- [x] **XSS-Safe Markdown:** `Markdown` component parses GitHub-flavored markdown into React VDOM nodes without raw HTML injection.
- [x] **Design Token Consistency:** Strictly adheres to Nothing-OS aesthetics: Doto dot-matrix typography, Space Mono, monochrome palettes, and tactile borders.

---

## 3. Database, Migrations & Row-Level Security

- [x] **Additive Migrations:**
  - `001_initial_schema.sql` (v1 base preserved)
  - `002_v2_schema.sql` (v2 tables, entitlements, atomic credits, sleeping, & RLS)
  - `003_connection_secrets.sql` (server-side connector secrets)
  - `004_byok_secrets.sql` (server-side BYOK secrets)
- [x] **PostgreSQL RLS Enforcement:**
  - `apps`: Users can only access their own apps or apps they are members of; viewers cannot update manifests.
  - `app_data`: Members can read; only owners and editors can insert/update/delete.
  - `collection_records`: Scoped to owner or `is_shared = true`; viewers cannot write.
  - `entitlements`: `SELECT`-only for authenticated users; write privileges completely blocked from clients.
  - `connection_secrets` & `byok_secrets`: Zero client policies (`REVOKE ALL FROM public, anon, authenticated`).
- [x] **Atomic Credits & Quotas:** `consume_credits()` RPC handles concurrency safely with atomic month rollover and overdraft prevention.

---

## 4. MCP Connector Layer & Security Guardrails

- [x] **Strict 9-Step Enforcement Order:** Authentication → Membership check → Manifest validation → Tool allowlist check → Argument validation → Credit check → SSRF-safe request → Output sanitization → Usage ledger audit.
- [x] **SSRF Guard:** Rejects loopback (127.0.0.0/8, ::1), private subnets (RFC 1918), link-local/cloud metadata (169.254.169.254), IPv6, and DNS rebinding attacks.
- [x] **Save-Time Consent & Confirmation:** Manifests requesting connectors or capabilities require explicit user approval before saving. High-risk tools require an additional confirmation tap.
- [x] **Multiplayer Connector Isolation:** In shared apps, runtime connector executions strictly use the invoking user's own connections and credits, never the owner's.

---

## 5. Multiplayer & Realtime Collaboration

- [x] **Invites Edge Function:** Handles `create`, `accept`, `get_info`, `list_members`, and `remove_member` with service-role security.
- [x] **Public Preview Sanitization:** Invite preview returns only public app metadata (icon, name, description, role) without leaking internal IDs or secrets.
- [x] **Realtime Sync:** Realtime postgres_changes channel updates concurrent client state on `app_data`.
- [x] **Privacy Transparency:** ADR 009 explicitly documents that Simple micro-apps do not claim end-to-end encryption.

---

## 6. Monetization & BYOK

- [x] **Billing Webhook:** Provider-agnostic webhook endpoint (`billing-webhook`) accepts verified events from Stripe, RevenueCat, or internal dev tools.
- [x] **Tier Enforcement:** Correct limits enforced across `free` (3 apps, 100 cr/mo), `pro` (25 apps, 2000 cr/mo), and `group` (50 apps, 5000 cr/mo).
- [x] **Client Self-Upgrade Blocked:** Verified at both the UI and database levels.
- [x] **BYOK Support:** Users can configure their own Groq API keys encrypted at rest via AES-GCM-256; bypasses monthly credit limits for LLM operations.

---

## 7. Sandboxed Logic Gate Evaluation (Phase 8)

- [x] **Gated Telemetry:** 36/36 golden prompts (100%) pass without requiring raw executable code generation.
- [x] **Gate Decision Documented:** ADR 011 documents the decision to defer QuickJS-in-WASM to protect client bundle size and mobile startup performance.
- [x] **Action Reserved:** `"sandbox_fn"` reserved in schema with safe, honest fallback.

---

## 8. Automated Toolchain Verification

| Check | Tool / Runner | Result | Details |
|---|---|---|---|
| **Linter** | `oxlint` | **0 errors, 0 warnings** | 156 files checked |
| **Type Check & Build** | `tsc -b && vite build` | **Clean build** | Production bundle ~186 kB gzip |
| **Unit & Integration Tests** | `vitest run` | **137 / 137 passing** | 21 test files (PGlite, UI, schemas) |
| **Synthesis & Evals** | `evals/run_evals.ts` | **36 / 36 passing** | 100% valid post-repair rate |
| **Edge Functions Suite** | `deno test` | **16 / 16 passing** | Auth, SSRF, MCP, Invites, Billing, BYOK |
