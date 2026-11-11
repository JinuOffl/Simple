# 003 — Embedding Model for Template Matching

**Status:** STUB — to be finalized in Phase 3  
**Date:** 2026-11-10

## Context
The TEMPLATE_MATCH step of the generation pipeline embeds the user's prompt and runs a pgvector
similarity search against `templates.embedding`. We need to choose the embedding model and confirm
the vector dimension matches the `templates` table schema.

## Options
1. **Supabase built-in `gte-small` via `@supabase/edge-runtime`** — no external API call, runs
   inside the Edge Function, 384-dimensional output. As of late 2026, Supabase supports this
   natively. Zero latency cost and no API key needed.
2. **OpenAI `text-embedding-3-small`** — 1536 dimensions (or 512 with truncation), very high quality,
   but requires an external API call and API key on the TEMPLATE_MATCH hot path.
3. **Groq embedding endpoint** — not a core Groq offering; not recommended.

## Decision
*Pending Phase 3 implementation.* Planned: Supabase built-in `gte-small` (384 dimensions) to
avoid external dependency on the generation hot path. Must verify at implementation time:
- Current Supabase docs confirm `gte-small` availability in Deno Edge Functions.
- `templates.embedding` schema uses `extensions.vector(384)` to match.
- Similarity threshold calibrated against the golden eval prompts.

## Consequences
- `templates` table: `embedding extensions.vector(384)`.
- If `gte-small` is deprecated or unavailable, fall back to option 2 and update dimension to match.
- Template embeddings are precomputed at seed time (migration 003) using the same model.

