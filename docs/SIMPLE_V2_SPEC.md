# Simple v2 — Architecture Migration Spec

> Saved from the migration prompt. This is the authoritative v2 spec. See `MIGRATION_PLAN.md` for the execution plan.

## 0. HOW THE AGENT MUST WORK

1. **Do not write code yet.** First read `ARCHITECTURE.md`, `SWOT_ANALYSIS.md`, and audit the actual repo (`src/`, `supabase/`, `package.json`). Then produce `MIGRATION_PLAN.md`: what exists, what changes, what is deleted, risks, and the exact order of work. **Stop and wait for my approval of that plan.**
2. Work **one phase at a time** (Section 9). At the end of each phase: run typecheck, lint, and tests; summarize what changed; list anything you were unsure about; then wait for "continue".
3. Commit per phase with a clear message. Never rewrite history. Never delete user data paths or migrations that have already been applied; add new migrations only.
4. **Verify, don't assume, anything version- or API-specific** (Vercel AI SDK, OpenUI, `@modelcontextprotocol/sdk`, Capacitor plugins, Supabase features). Read the current official docs or the installed package's types before using an API. If a doc contradicts this spec, tell me and propose the fix instead of silently choosing.
5. Record each significant decision in `docs/decisions/NNN-title.md` (context, options, decision, consequences). Keep them short.
6. If something in this spec is ambiguous or seems wrong, ask. Do not invent requirements.

## 1. PRODUCT GOAL (v2)

**Simple** turns a sentence into a persistent, working personal app on the user's phone. The value is **functionality and reduced friction from idea to a working tool**, not just UI. The user never sees code, never sets up hosting, never debugs.

Core principle: **Simple connects; it does not reinvent.** Before generating anything, resolve the request against things that already exist: built-in capabilities (camera, mic, storage, realtime), MCP connectors (smart home, weather, calendar, etc.), open-source UI components, and saved templates. Generate only the genuinely novel part.

### Target customers
- **Beachhead (launch):** prosumer tinkerers (Android/Nothing users, Home Assistant owners, Notion/Shortcuts users) and students (placement prep: mock interview, aptitude, Feynman tutor).
- **Money segment (later):** solo professionals / micro-businesses (tutors, clinics, shopkeepers, freelancers) needing custom trackers, ledgers, appointment tools.
- **Growth engine (not a paying segment):** multiplayer apps for couples, friends, small groups.

### Explicit non-goals (v2)
- No private end-to-end-encrypted messaging product. A `chat_thread` component for shared apps is allowed, but never market or describe it as E2E encrypted or as a WhatsApp replacement.
- No iOS build, no public marketplace, no arbitrary code execution (see Section 6 for the one gated, sandboxed exception, which is a late phase).

## 2. NON-NEGOTIABLE CONSTRAINTS

1. The LLM never emits code that is executed with app privileges. It emits a schema-validated **manifest** (data). The renderer maps manifest nodes to a fixed, reviewed component registry.
2. Zero generation-LLM calls when opening a saved app.
3. Edits are minimal patches to the existing manifest, never full regeneration.
4. Every manifest is validated (schema + referential integrity + capability checks) before it is previewed or saved. Invalid output triggers bounded auto-repair, then a friendly failure.
5. All secrets stay server-side. The APK/web bundle contains none.
6. Tool/connector output and user-provided content are untrusted data. Never treated as instructions.
7. Nothing is ever silently deleted. Over-limit apps become `sleeping`.
8. Honesty over magic: if a request is unsupported, say so clearly.

## 3. TARGET ARCHITECTURE

```
CLIENT  (React 19 + TS + Vite, Capacitor Android; theme via design tokens)
  Screens: Auth/Guest, Home, Builder, AppRunner, Connections, Plan & Usage, Invite/Join
  ManifestRenderer  <-  Component Registry (single source of truth)
  actionRunner      ->  Edge Functions (llm / mcp / api)
  Zustand store, Supabase Realtime subscriptions

SUPABASE
  Auth (incl. anonymous guest)   Postgres + RLS   Realtime   Vault (secrets)   pgvector
  Edge Functions (Deno):
    generate-app        orchestrator (multi-agent state machine) -> writes generation_jobs
    run-llm-action      runtime LLM actions (metered)
    run-mcp-action      runtime MCP tool calls (allowlisted, metered, SSRF-safe)
    run-api-fetch       allowlisted public APIs (existing)
    manage-connection   create/test/delete MCP connections (secrets into Vault)
    invites             create/accept app invites
    billing-webhook     provider-agnostic entitlement updates (stub first)

EXTERNAL
  LLM providers via a provider-abstraction layer (primary + fallback), MCP servers (remote HTTP), public APIs
```

### 3.1 Component Registry = single source of truth
Create `src/registry/`. Each entry:
```ts
{
  type: "chart",
  propsSchema: z.object({...}),
  component: ChartComponent,
  llmDescription: "When to use / props / example",
  requiredPermissions: [],
  examples: [ {props:{...}} ],
}
```
Keep existing 12 components and add: `markdown, list, table, form, chart, stat, toggle, slider, timer, tabs, chat_thread`. Build new ones on **shadcn/ui (Radix + Tailwind)** and **Recharts**.

### 3.2 Manifest v2 (versioned)
Define in `src/schema/manifest.v2.ts`. Required fields:
```ts
{
  schema_version: 2,
  app_id, name, icon, description,
  permissions: ("camera"|"microphone"|"location"|"contacts"|"notifications")[],
  connectors: [{ connector_id, tools: string[] }],
  data: { collections: [{ name, shared: boolean, fields: [...] }] },
  screens: [{ id, title, nodes: Node[] }],
  actions: Action[],
  multiplayer?: { enabled: boolean }
}
```
Action kinds: `llm_call, local_compute, api_fetch, mcp_call, navigate, save_data, record_insert, record_update, conversation_loop`. (`sandbox_fn` is reserved, Phase 8 only.)

Write a pure, tested `migrateV1toV2(manifest)` and a Postgres-side/lazy migration. v1 apps must keep working.

### 3.3 Data model additions
Keep `app_data`. Add `collection_records` for list-like/relational data.

## 4. GENERATION PIPELINE (multi-agent state machine)

```
RECEIVE -> TEMPLATE_MATCH -> ANALYZE -> RESOLVE -> BUILD -> VALIDATE -> DRY_RUN -> CRITIQUE -> (REPAIR x<=2) -> DONE | FAILED
```

Steps: TEMPLATE_MATCH (pgvector fast path), ANALYZE (Requirement Analyst), RESOLVE (Capability Resolver, mostly deterministic), BUILD (manifest v2 or RFC 6902 patch), VALIDATE (deterministic Zod + referential integrity), DRY_RUN (simulated pass, no real network), CRITIQUE (cheap semantic model), DONE.

Provider abstraction: Vercel AI SDK core (`ai` package) behind `LLMProvider` interface with primary + fallback, model ids in config not hardcoded. Do NOT use RSC `streamUI`.

Evals: `evals/` with >= 30 golden prompts. Gate numbers reported plainly.

## 5. CONNECTOR LAYER (MCP)

- Edge Functions as MCP client over Streamable HTTP to remote MCP servers only.
- Use official `@modelcontextprotocol/sdk`.
- Secrets stored in Supabase Vault, never in columns.
- Auth scope for v2: bearer token / API-key headers only. OAuth connectors deferred.
- Home Assistant: public HTTPS URL only (Nabu Casa or user tunnel).
- `run-mcp-action` enforcement order: authenticated -> member with role -> action in manifest -> tool in connectors[].tools AND allowed_tools -> args validate -> credits -> SSRF-safe call -> sanitize -> ledger.
- Consent at save time. High-risk tools require extra confirmation tap.
- Shared-app: runtime calls use invoking user's own connections/credits, never the owner's.

## 6. CODE-LEVEL CUSTOM LOGIC (GATED, PHASE 8 ONLY)

QuickJS-in-WASM sandbox. Never `eval`, never `new Function`, never `dangerouslySetInnerHTML`.

## 7. DATABASE (new migrations only)

New tables: `app_members`, `app_invites`, `collection_records`, `connections`, `entitlements`, `usage_ledger`, `generation_jobs`, `templates`. New columns on `apps`: `schema_version`, `status`, `template_id`, `is_shared`. SQL functions: `is_app_member`, `consume_credits`, `enforce_active_limit`. All with RLS.

## 8. MONETIZATION

Plans: `free` (3 apps, 100 credits/month), `pro`, `group`. Credits by class in config. Sleeping, not deleting. Guest mode with Supabase anonymous sign-in. `EntitlementProvider` interface + `billing-webhook`. No vendor integration yet.

## 9. PHASES

- **Phase 0 — Audit and plan.** Gate: approval.
- **Phase 1 — Registry + Manifest v2 + migrator.** Gate: v1 manifests migrate and render; tests green.
- **Phase 1b — Vertical slice (MCP connect proof).** Gate: toggle -> mcp_call -> fake/real server works.
- **Phase 2 — Database, entitlements, credits, sleeping, guest mode.** Gate: RLS tests pass; atomic credits; sleep not delete; export.
- **Phase 3 — Orchestrator.** Gate: post-repair schema-valid >= 95%, evals reported.
- **Phase 4 — MCP connector layer.** Gate: end-to-end HA/fake server; SSRF tests pass.
- **Phase 5 — UI expansion + format spike.** Gate: decision doc with numbers; evals pass.
- **Phase 6 — Multiplayer.** Gate: two accounts share, concurrent edit, viewer cannot write.
- **Phase 7 — Monetization wiring.** Gate: free/pro/group tests; client cannot self-upgrade.
- **Phase 8 — Sandboxed logic (gated).** Only if evals/telemetry justify.
- **Phase 9 — Hardening and release readiness.** Gate: `docs/RELEASE_CHECKLIST.md` fully checked.

## 10. TESTING AND QUALITY BARS

- Vitest unit tests for registry, validator, migrator, patch, credit logic, SSRF guard.
- Integration tests with fake LLM and fake MCP server.
- RLS tests with two seeded users.
- TypeScript strict mode; no `any` in schema/registry/validator.
- Never log secrets, tokens, or full user content.

## 11. THINGS YOU MUST NOT DO

- No `eval`, no RSC `streamUI`, no service-role key in client code.
- No LLM/tool output choosing permissions.
- No deleting user apps/data for plan reasons.
- No hardcoded prices, limits, model ids, provider names.
- No billing vendor, marketplace, E2E-encryption claims, or iOS build.
- Never hide failing eval numbers.

---

*Spec saved: 2026-11-10. See `MIGRATION_PLAN.md` for the execution plan.*
