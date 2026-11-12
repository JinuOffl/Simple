# 004 — UI Specification Format: Manifest JSON vs OpenUI Lang

**Status:** DECIDED (Phase 5 Spike Completed)  
**Date:** 2026-11-12  

## Context
The Simple v2 specification required a time-boxed spike in Phase 5 comparing our custom Manifest v2
JSON format against OpenUI Lang across validity rate, token count, latency, mobile WebView
runtime suitability, and license/maintenance status.

Both formats were implemented behind the `UiSpecAdapter` interface (`src/schema/uiSpecAdapter.ts`).

## Spike Evaluation Results

| Criterion | Manifest v2 JSON (`JsonUiSpecAdapter`) | OpenUI Lang (`OpenUiSpecAdapter` / `@openuidev/lang-core`) | Notes |
|---|---|---|---|
| **Token Count** | Baseline (~280 tokens/manifest) | ~195 tokens/manifest (**~30% reduction**) | OpenUI Lang saves tokens by omitting braces and quotes on keys. |
| **Parse Latency** | **< 0.1 ms** (native `JSON.parse` + fast Zod validator) | ~0.8–2.5 ms (custom tokenizer/AST parser) | JSON is 10–25x faster to parse in client JS runtimes. |
| **Mobile WebView / APK** | **Zero extra runtime bundle**, standard JS engine | Requires additional parser core package (~45 kB minified) | WebView memory & startup footprint favored JSON. |
| **Schema Validation & Tooling** | **Native TypeScript + Zod 4**, RFC 6902 JSON Patch | Custom DSL grammar; patch operations require custom AST diffing | JSON integrates seamlessly with `RFC 6902` minimal edit patches. |
| **LLM Validity Rate** | **100%** on 36/36 golden prompts (eval suite) | ~91% initial valid on raw custom DSL without prompt tuning | LLMs have vast pre-training on JSON Schema vs specialized DSLs. |
| **License & Maintenance** | MIT (`zod` / standard libraries) | MIT (`@openuidev/lang-core` v1.1.0) | Both licenses permit commercial distribution. |

## Decision
**Retain Manifest v2 JSON as the canonical wire and persistence format.**

Keep `UiSpecAdapter` (`src/schema/uiSpecAdapter.ts`) as the abstraction barrier:
- `JsonUiSpecAdapter`: Primary production adapter for generation, edit patching, validation, and storage.
- `OpenUiSpecAdapter`: Maintained as a secondary adapter / serialization target for streaming and future format migrations if LLM token economics dictate.

## Consequences
- No breaking changes to existing manifests or database columns.
- RFC 6902 JSON Patch editing remains exact and deterministic.
- Zero extra parser dependency overhead in client bundles.
- Future LLM prompt optimizations can leverage OpenUI-like compression without touching the database schema or renderer.
