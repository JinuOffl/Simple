# 001 — LLM Provider Abstraction

**Status:** DECIDED  
**Date:** 2026-11-11

## Context
v1 hardcoded Groq (`llama-3.3-70b-versatile`) in every Edge Function with no fallback. A single
provider outage or pricing change breaks the entire product. The spec requires an `LLMProvider`
interface with primary + fallback and model/provider configuration in config/env rather than code.

## Options
1. **Vercel AI SDK `ai@5.0.287` + `@ai-sdk/openai-compatible@1.0.60` (server-side Deno)** — unified
   interface (`generateText` / `generateObject`) across Groq and any OpenAI-compatible fallback
   without requiring Node host APIs unsupported in restricted Deno sandboxes.
2. **Vercel AI SDK `ai@7.x` + `@ai-sdk/groq@4.x`** — pulls `@ai-sdk/gateway` -> `@vercel/oidc`,
   which reads `os.hostname()` at module load (`--allow-sys` required in Deno), failing in strict
   Deno sandboxes.
3. **Hand-rolled `fetch` adapter** — simpler dependency surface, but loses Vercel AI SDK unified
   streaming, token accounting, and provider ecosystem compatibility.

## Decision
Adopted **Option 1 (`npm:ai@5.0.287` + `npm:@ai-sdk/openai-compatible@1.0.60`)**:
- Verified in Deno `2.9.6` (`supabase/functions/deno.json` strict mode): both `deno check` and
  `deno run --allow-env` succeed without `--allow-sys` (unlike `ai@7.0.166`).
- Defined a pure `LLMProvider` interface (`generateStructured`, `completeJson`) in
  `supabase/functions/_shared/orchestrator/types.ts`, implemented in Deno via
  `supabase/functions/_shared/llmProvider.ts` with automatic primary-to-fallback failover on
  transient errors, HTTP 429s, 5xx responses, or missing primary credentials.
- To avoid provider JSON Schema union-depth limits across 23 discriminated component schemas,
  generation requests pass a simplified schema / JSON instruction to the LLM provider and run
  full deterministic Zod `ManifestV2Schema` validation in `VALIDATE` (with up to 2 bounded repair
  attempts).

## Consequences
- Primary defaults to Groq (`https://api.groq.com/openai/v1`) and fallback defaults to
  OpenAI-compatible (`https://api.openai.com/v1`), defined centrally in `LLM_CONFIG`
  (`src/config/llm.ts` / `supabase/functions/_shared/orchestrator/llmConfig.ts`).
- Runtime env overrides (`GENERATION_MODEL`, `CRITIQUE_MODEL`, `RUNTIME_LLM_MODEL`,
  `LLM_PRIMARY_*`, `LLM_FALLBACK_*`, `GROQ_API_KEY`, `OPENAI_API_KEY`) live in server-side secrets.
- Orchestrator code and runtime actions never hardcode model IDs or provider URLs.

