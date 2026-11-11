# 001 — LLM Provider Abstraction

**Status:** STUB — to be finalized in Phase 3  
**Date:** 2026-11-10

## Context
v1 hardcodes Groq (`llama-3.3-70b-versatile`) in every Edge Function with no fallback. A single
provider outage or pricing change breaks the entire product. The spec requires a `LLMProvider`
interface with primary + fallback, model ids in config, not code.

## Options
1. **Vercel AI SDK `ai` package (server-side)** — unified interface over OpenAI-compatible APIs,
   structured output, tool calling. Must verify Deno compatibility via `npm:` specifier.
2. **Hand-rolled adapter** — simple `fetch` wrapper, full control, more maintenance.
3. **LangChain.js** — broad provider support but heavy; overkill for our structured-output use case.

## Decision
*Pending Phase 3 implementation.* Planned: Vercel AI SDK `ai` package via `npm:ai` in Deno.
Must verify: (a) Deno `npm:` specifier resolves correctly, (b) `generateObject` / structured output
works in Deno Edge, (c) the discriminated-union registry schema doesn't exceed provider limits —
if so, send simplified schema and let Zod validate.

## Consequences
- Model ids (`GENERATION_MODEL`, `RUNTIME_LLM_MODEL`, `CRITIQUE_MODEL`) live in Supabase env secrets.
- Primary provider = configurable (default: Groq). Fallback = configurable (default: OpenAI-compat).
- If `ai` package fails Deno verification, fall back to option 2 (hand-rolled, provider-agnostic).

