# 007 — Open-Source Component Reuse & Architecture

**Status:** DECIDED (Phase 5 UI Expansion Completed)  
**Date:** 2026-11-12  

## Context
Simple v2 requires a 23-component registry matching Nothing-OS dark dot-matrix aesthetics while
minimizing bundle bloat, avoiding WebGL/Canvas WebView rendering bugs, and maintaining strict
security boundaries (no unescaped HTML, metered runtime actions).

## Component Implementations & Evaluations

| Component | Architecture / OSS Choice | License | Rationale |
|---|---|---|---|
| `markdown` | Pure VDOM tokenizer & renderer (`src/components/Markdown.tsx`) | MIT | Zero `dangerouslySetInnerHTML`. Eliminates XSS vectors from LLM markdown output. Supports headings, bold, inline code, fenced code blocks, safe links (`https`/`mailto` only), blockquotes, lists. |
| `stat` | Dot-matrix KPI component (`src/components/Stat.tsx`) | MIT | Built on Nothing-OS `font-doto` and monospace typography tokens. Zero external dependencies. |
| `slider` | Range input with gradient fill (`src/components/Slider.tsx`) | MIT | Accessible native range input wrapped in Nothing-OS dark surface tokens. Bound directly to `mcp_call` and `save_to`. |
| `timer` | Self-contained countdown timer (`src/components/Timer.tsx`) | MIT | Pure React timer with dot-matrix MM:SS readout, Start/Pause, and Reset controls. Zero library overhead. |
| `tabs` | Tabbed navigation bar (`src/components/Tabs.tsx`) | MIT | Interacts with `RegistryRenderContext.onNavigateScreen` to switch screens in multi-screen apps. |
| `list` | Divided list view (`src/components/List.tsx`) | MIT | Supports ordered (`01`, `02`) and unordered items. |
| `table` | Responsive table (`src/components/Table.tsx`) | MIT | Clean horizontal-scrolling table with uppercase tracking headers and subtle cell borders. |
| `form` | Multi-field form (`src/components/Form.tsx`) | MIT | Validates required fields, supports text/number/email/textarea, and dispatches data to actions. |
| `chart` | Responsive SVG vector chart (`src/components/Chart.tsx`) | MIT | Pure SVG vector charts (`bar`, `line`, `pie`). Replaced heavy Recharts bundle (>400 kB + d3) with lightweight, zero-dependency SVG that renders reliably in mobile Android WebViews without Canvas context crashes. |
| `chat_thread` | Multi-turn chat view (`src/components/ChatThread.tsx`) | MIT | State-persisted chat container with auto-scroll and direct integration with `run-llm-action`. |

## Decision
All 23 components are fully implemented and integrated into `src/registry/adapters.tsx` and
`src/registry/entries/*.ts`, with `isStub: false`.

## Consequences
- Every component is tested and guaranteed to work in web and Capacitor mobile environments.
- Zero external runtime bundle bloat: total client bundle remains lean and fast to load.
- Full parity between client registry and Deno server capabilities (`registryParity.test.ts`).
