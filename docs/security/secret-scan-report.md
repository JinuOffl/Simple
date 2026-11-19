# Secret Scan & Hygiene Report

> **Date:** 2026-11-13  
> **Phase:** Phase 10 — Step 1 (Baseline & Secret Hygiene)  
> **Target:** Full repository working tree & entire git history  
> **Scanner:** Custom automated audit scanner (`scripts/audit-secrets.mjs`) + targeted regex inspection (`gsk_`, `sk-`, `eyJ`, `service_role`, `GROQ_API_KEY`, `VITE_`)

---

## 1. Scope & Methodology

We scanned the entire git commit history and all tracked workspace files for sensitive secret patterns:

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
     - Masked preview strings in documentation: `gsk_••••3a1f` in ADR 010.
     - Masked previews in tests: `gsk_••••7890` in `migration_004.byok.test.ts`.
     - Mock test strings: `gsk_abc123def456xyz789` in `phase7_billing_and_byok_test.ts`.
     - UI placeholder text: `gsk_••••••••••••••••` in `PlanUsageScreen.tsx`.
   - The user's development Groq API key located in local `.env` has **never** been committed to git history.

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
   - In previous builds, local keys were dev-tested.
   - `dist/` is in `.gitignore` and audited by `npm run audit:dist`.
   - Production bundles contain zero API secrets.

---

## 3. Key Rotation Assessment

- **Did any real secret appear in git history?** **No.**
- **Action required by user:** No immediate emergency rotation is required because real API keys and service-role tokens were never pushed to git history.
- **Precautionary recommendation:** When creating staging and production Supabase projects, provision fresh keys rather than reusing keys handled in local development.

---

## 4. Summary of Actions Taken

1. Verified repository status and git commit history.
2. Created automated secret audit scanner `scripts/audit-secrets.mjs`.
3. Hardened `.gitignore` to cover `.env.*` and `supabase/.temp/`.
4. Confirmed zero live secrets exist in git history or tracked working files.
