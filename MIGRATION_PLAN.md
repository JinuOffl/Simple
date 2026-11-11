# Simple v2 — Migration Plan

> **Status:** APPROVED — Phase 1 in progress  
> **Phase:** 1 (Registry + Manifest v2 + Migrator)  
> **Decisions locked:** 2026-11-11

---

## Decisions (from Phase 0 Q&A)

| # | Question | Decision |
|---|---|---|
| 1 | Primary LLM provider | **Groq** (primary). Config file (`src/config/llm.ts`) controls model IDs and provider — easy to swap. |
| 2 | `profile.byo_api_key` backfill | **Deferred** — Supabase Vault not in scope for web-first phase. |
| 3 | Embedding model | **Deferred** — pgvector/template-matching not in scope for web-first phase. |
| 4 | shadcn/ui setup | **OK** — run shadcn CLI during Phase 1. |
| 5 | Git | **User pushes** — agent commits locally only. |
| **KEY** | Platform target | **Web app first** (not Android). Capacitor/APK is a future step. Launch as web app / PWA. Supabase stays for DB+auth but Vault, pgvector, anonymous sign-in, and APK-specific features are deferred. |

---

## Revised Phase Scope (Web-First)

The phase order from SIMPLE_V2_SPEC.md is preserved, but:
- **Remove Capacitor-specific work** from all phases until explicitly re-enabled.
- **Remove Vault, pgvector, anonymous sign-in** from Phase 2 scope (add back once web works).
- **Supabase** is used for Postgres + RLS + Edge Functions + Auth (email/OTP) — just no mobile-specific features.
- `profile.byo_api_key` plaintext issue: noted, deferred until Vault is in scope.

---

## Part 1 — What Exists (v1 Audit)

### Repository Layout

```
simple-app/
├── android/                    # Capacitor Android project — NOT touched until web is done
├── src/
│   ├── actions/actionRunner.ts # Runtime dispatcher (llm/compute/api/navigate/save)
│   ├── components/             # 12 hand-rolled components
│   ├── lib/supabaseClient.ts   # Supabase singleton
│   ├── lib/zustandStore.ts     # Auth + Builder + AppCache slices
│   ├── renderer/ManifestRenderer.tsx  # switch-case mapper
│   ├── schema/manifest.schema.ts      # Zod v1 schema
│   └── screens/               # Auth, Home, Builder, AppRunner
├── supabase/
│   ├── functions/
│   │   ├── generate-manifest/ # Groq call + 3-attempt repair
│   │   ├── run-llm-action/    # llm_call + conversation_loop
│   │   └── run-api-fetch/     # 6 allowlisted APIs
│   └── migrations/001_initial_schema.sql
└── package.json               # React 19, Zod 4, Zustand 5, Vitest 4, TS ~6.0
```

### v1 Critical Findings

| Finding | Phase to fix |
|---|---|
| `deleteApp()` **hard-deletes** rows | Phase 1 |
| `ManifestRenderer` is a hard-coded switch-case | Phase 1 |
| Groq hardcoded in edge functions | Phase 1 (config file) |
| No `schema_version` in manifest | Phase 1 (migrator) |
| `manifest.components[]` flat — no `screens[]` | Phase 1 (migrator wraps into 1 screen) |
| `run-api-fetch` has no auth check | Phase 4 |
| `profile.byo_api_key` plaintext | Deferred (Vault not in scope yet) |

---

## Part 2 — Phase 1 Scope (what gets built now)

### New files
```
src/
  config/
    llm.ts              # LLM provider config (model IDs, provider URL) — easy to swap
  registry/
    index.ts            # Registry array + lookup helpers
    types.ts            # RegistryEntry<T> type
    entries/            # One file per component (12 existing + 11 new stubs)
  schema/
    manifest.v1.ts      # Rename of manifest.schema.ts (no changes)
    manifest.v2.ts      # Full v2 Zod schema (versioned, screens[], connectors[], data{})
    migrator.ts         # migrateV1toV2(manifest) — pure, tested
    validator.ts        # validateManifest() → typed valid | invalid(errors[]) | truncated

docs/decisions/         # Already written (001–007 stubs)
```

### Modified files
```
src/renderer/ManifestRenderer.tsx    # Registry-driven (no more switch-case)
src/lib/zustandStore.ts              # sleepApp() replaces deleteApp(); exportApp() added
src/screens/HomeScreen.tsx           # Sleeping apps dimmed; wake + export controls
src/schema/manifest.schema.ts        # → renamed to manifest.v1.ts
```

### Tests added
- Registry completeness (every entry has required fields)
- v2 schema: valid manifests, invalid manifests, referential-integrity failures
- Migrator: v1 round-trips, edge cases (missing fields, empty arrays)
- `sleepApp` does not delete rows

### Gate
- All existing 10 tests still pass
- New tests pass
- `tsc --noEmit` clean
- `oxlint` clean
- Vitest green

---

## Part 3 — Full Phase Map (unchanged from spec, web-first adjustments noted)

| Phase | Scope | Gate |
|---|---|---|
| **0** ✅ | Audit + plan | Approved |
| **1** 🔄 | Registry + Manifest v2 + Migrator | Tests green, tsc clean |
| **1b** | MCP vertical slice (toggle → fake MCP server) | Tap changes state on fake server |
| **2** | DB migrations, credits, sleeping, guest mode *(Vault/pgvector deferred)* | RLS tests; sleep not delete; export |
| **3** | Orchestrator state machine + evals harness | ≥95% post-repair valid; latency reported |
| **4** | MCP connector layer, SSRF guard, Connections screen | End-to-end HA/fake; SSRF suite passes |
| **5** | UI expansion (shadcn components) + format spike | Decision doc; evals pass |
| **6** | Multiplayer (members, invites, shared collections, Realtime) | Two accounts share; viewer cannot write |
| **7** | Monetization wiring (credits, plans, BYOK) | free/pro/group tests; client cannot self-upgrade |
| **8** | Sandboxed logic *(gated — only if evals justify)* | — |
| **9** | Hardening + release readiness *(includes PWA/web build check; Android optional)* | Release checklist |

---

## Part 4 — Risks (web-first revision)

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | `@modelcontextprotocol/sdk` Deno compatibility | High | Phase 1b binary gate |
| R2 | Vercel AI SDK Deno compatibility | High | Verified in Phase 3 |
| R3 | Zod 4 large discriminated union → provider JSON schema limits | Medium | Send simplified schema to provider; Zod validates |
| R4 | Web Speech API for `mic_recorder` — varies by browser | Low-Medium | Fallback: file upload picker |
| R5 | shadcn CLI modifies tailwind.config.js — may break existing Nothing-OS tokens | Low | Pin existing tokens before running CLI; merge carefully |

