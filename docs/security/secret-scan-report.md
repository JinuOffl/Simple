# Secret Scan & Hygiene Report

> **Date:** 2026-11-13  
> **Phase:** Phase 10 — Step 1 (Baseline & Secret Hygiene)  
> **Target:** Full repository working tree & entire git history (commits `daed7f2` through `91dc08c`)  
> **Scanner:** Custom automated audit scanner (`scripts/audit-secrets.mjs`) + targeted regex inspection (`gsk_`, `sk-`, `eyJ`, `service_role`, `GROQ_API_KEY`, `VITE_`)

---

## 1. Scope & Methodology

We scanned the entire git commit history (all 22 commits on `main`) and all tracked workspace files for sensitive secret patterns:

| Pattern | Description | Rule / Regex |
|---|---|---|
| `gsk_` | Groq API live secret keys | `gsk_[a-zA-Z0-9]{20,}` |
| `sk-` | OpenAI secret keys / Anthropic keys | `sk-[a-zA-Z0-9]{20,}` / `sk-ant-[a-zA-Z0-9]{20,}` |
| `eyJ` | JWT tokens (specifically Supabase `service_role` tokens) | `eyJ...\.eyJ...\....` |
| `service_role` | Service-role database privileges or credential references | Case-insensitive token match |
| `GROQ_API_KEY` | Environment variable and configuration occurrences | Exact string match |
| `VITE_` | Client-exposed environment variable names | Exact string match |
| Private Keys | RSA/EC/OpenSSH private key blocks | `-----BEGIN PRIVATE KEY-----` |
| DB Connection Strings | Postgres URLs containing plaintext passwords | `postgres(ql)?://[^:]+:([^@\s]+)@` |

---

## 2. Findings

### A. Git History Findings
1. **Groq API Keys (`gsk_`):**
   - **Zero live keys found.**
   - All historical occurrences in git history are strictly:
     - Masked preview strings in documentation: `gsk_••••3a1f` in [ADR 010](file:///d:/Documents/Projects/Simple%20Project/Simple/simple-app/docs/decisions/010-monetization-and-byok.md).
     - Masked previews in tests: `gsk_••••7890` in [migration_004.byok.test.ts](file:///d:/Documents/Projects/Simple%20Project/Simple/simple-app/src/db/migration_004.byok.test.ts).
     - Mock test strings: `gsk_abc123def456xyz789` in [phase7_billing_and_byok_test.ts](file:///d:/Documents/Projects/Simple%20Project/Simple/simple-app/supabase/functions/_testing/phase7_billing_and_byok_test.ts).
     - UI placeholder text: `gsk_••••••••••••••••` in [PlanUsageScreen.tsx](file:///d:/Documents/Projects/Simple%20Project/Simple/simple-app/src/screens/PlanUsageScreen.tsx).
   - The user's real Groq API key (`gsk_bFe8n4...`) located in the local `.env` has **never** been committed to git history.

2. **OpenAI / Anthropic Keys (`sk-` / `sk-ant-`):**
   - **Zero live keys found.**
   - Matches for `sk-` were verified to be benign word fragments (e.g. `task-` in `Checklist.tsx`, `queue-microtask` in `package-lock.json`, and SVG `<mask id="...">` definitions).

3. **Supabase `service_role` Secret Tokens (`eyJ...`):**
   - **Zero live service_role JWT tokens committed.**
   - Matches for `eyJ` in commit history were verified to be base64 SHA-512 integrity hashes in `package-lock.json`.
   - Mentions of `service_role` in git history are solely SQL role grants (e.g. `GRANT ... TO service_role`) and environment variable lookups (`Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`).

4. **Database Connection Passwords:**
   - Commit `daed7f2` contained `supabase/.temp/pooler-url`:
     `postgresql://postgres.hohnhaodufjsemjndzfh@aws-1-ap-south-1.pooler.supabase.com:5432/postgres`
   - **No password** is present in this string (it specifies username `postgres.hohnhaodufjsemjndzfh` with no password segment).

5. **`.env` File Tracking:**
   - `.env` was **never committed** to git history in any commit.
   - `.env.example` is committed and contains only dummy placeholders (`https://your-project-id.supabase.co`, `your-anon-key-here`).

---

### B. Working Tree & Build Output Findings
1. **`.env` and `.env.*`:**
   - Active `.env` file exists locally on disk (contains local development keys).
   - `.gitignore` was hardened to explicitly ignore `.env`, `.env.*`, `.env.local`, `.env.*.local`, and `supabase/.temp/` while preserving `.env.example`.
2. **Build Output (`dist/`):**
   - In `dist/assets/index-BNOi49AG.js`, the local `GROQ_API_KEY` was injected at build time because [vite.config.ts](file:///d:/Documents/Projects/Simple%20Project/Simple/simple-app/vite.config.ts) defines `'import.meta.env.VITE_GROQ_API_KEY': JSON.stringify(groqKey)`.
   - `dist/` is already in `.gitignore` and has **never been committed**.
   - Per **Step 2**, this client-side injection will be removed/dev-gated so that production bundles never contain any LLM provider keys.

---

## 3. Key Rotation Assessment

- **Did any real secret appear in git history?** **No.**
- **Action required by user:** No immediate emergency rotation is required because real API keys and service-role tokens were never pushed to git history.
- **Precautionary recommendation:** When creating the separate staging and production Supabase projects for Step 6, provision fresh keys rather than reusing any keys that have been handled in local development `.env` files.

---

## 4. Summary of Actions Taken in Step 1

1. Verified repository status; baseline commit is `91dc08c` which is pushed and up to date with `origin/main`.
2. Created git annotated tag `pre-phase-10` at commit `91dc08c` and pushed tag to `origin`.
3. Created automated secret audit scanner [scripts/audit-secrets.mjs](file:///d:/Documents/Projects/Simple%20Project/Simple/simple-app/scripts/audit-secrets.mjs).
4. Hardened [.gitignore](file:///d:/Documents/Projects/Simple%20Project/Simple/simple-app/.gitignore) to cover `.env.*` and `supabase/.temp/`.
5. Confirmed zero live secrets exist in git history or tracked working files.
