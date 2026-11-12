# ADR 011: Phase 8 Gating Decision — Sandboxed Code Execution (`sandbox_fn`)

**Status:** Accepted (Phase 8 — Gated Architecture Evaluation)

## Context
`SIMPLE_V2_SPEC.md` (§6, §9) and `MIGRATION_PLAN.md` (§3) define Phase 8 as an explicitly gated phase:
> *"Phase 8 — Sandboxed logic (gated). Only if evals/telemetry justify. QuickJS-in-WASM sandbox. Never `eval`, never `new Function`, never `dangerouslySetInnerHTML`."*

Similarly, `simple-architecture-functionality-first.md` (§5) establishes the gating principle:
> *"Add the sandboxed code-gen escape hatch for genuinely novel logic, once you've seen real user requests that MCP connectors + prompt-based `llm_call` can't satisfy — build it against real evidence of need, not speculatively."*

## Evaluation Telemetry & Empirical Findings

The Simple v2 test suite and golden prompt evaluation harness (`evals/run_evals.ts`) yielded the following empirical results across the 36 canonical micro-app scenarios:
1. **Pass Rate:** **36 / 36 golden prompts pass (100%)**.
2. **Post-Repair Validity:** 100% schema-valid manifests produced across all tested domains (utilities, trackers, forms, dashboards, assistants).
3. **Execution Coverage:** Every tested micro-app was fully expressed and executed using:
   - 23 high-fidelity registry components (covering layouts, charts, forms, tables, timers, tabs, markdown, chat threads, and toggles).
   - Typed local operations via `local_compute` (`add`, `subtract`, `multiply`, `divide`, `concat`, `count`, `get_current_time`, `format_date`).
   - Remote MCP tools (`mcp_call`) for hardware/smart home and external integrations.
   - Server-side public APIs (`api_fetch`) for live data.
   - Micro-turn LLM reasoning (`llm_call` and `conversation_loop`).
   - Shared collections (`record_insert` and `record_update`).

Zero prompts required arbitrary client-side procedural code execution.

## Security & Performance Trade-Off Analysis

| Dimension | Option A: Exercise Gate & Defer WASM Runtime | Option B: Bundle QuickJS-in-WASM Immediately |
|---|---|---|
| **Security Surface** | Minimal; zero executable code execution paths in runtime. Zero risk of sandboxing escapes or memory corruptions. | Introduces QuickJS C-code compiled to WebAssembly; requires strict capability bounding and sandbox isolation audits. |
| **Client Bundle Size** | Web bundle remains under 670 kB minified (gzip ~186 kB). | Adds ~2.2 MB uncompressed WASM binary + bindings to the initial download. |
| **Startup / Battery** | Instant UI initialization and low memory footprint on mobile devices. | WASM compilation and QuickJS virtual machine initialization latency. |
| **Eval Justification** | Supported by 100% pass rate on all 36 golden benchmark apps. | Not justified by current benchmark requirements. |

## Decision
Exercise the Phase 8 gate: **Defer shipping the QuickJS-in-WASM runtime for the initial v2 release.**

Specifically:
1. Reserve `"sandbox_fn"` in `manifest.v2.ts` (`ActionKindSchema`).
2. Add graceful, safe handling for `"sandbox_fn"` in `actionRunner.ts`: log a clean notice and populate `render_result_into` without attempting any unsafe fallback (`eval` or `new Function` remain permanently banned under Constraint #1).
3. Proceed directly to **Phase 9: Hardening & Release Readiness**.
4. Re-open this gate post-launch only if user telemetry or production request logs demonstrate user micro-apps that typed operations, MCP connectors, and LLM actions cannot satisfy.
