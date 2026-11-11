# 007 — Open-Source Component Reuse

**Status:** STUB — to be finalized in Phase 1 / Phase 5  
**Date:** 2026-11-10

## Context
The spec says: for `chat_thread`, `conversation_loop`, `mcq_quiz`, and voice/chat UI, first
evaluate existing open-source building blocks and wrap them as registry entries instead of
hand-rolling. Record the license and maintenance status of each.

## Candidates to evaluate

| Component | Candidate OSS | License | Maintained? | Notes |
|---|---|---|---|---|
| `conversation_loop` / `chat_thread` | Vercel AI SDK `useChat` hook | Apache-2.0 | ✅ Active | UI-agnostic; we provide the components |
| `chat_thread` UI | shadcn/ui chat components (community) | MIT | Check at impl time | Several shadcn chat UIs exist; evaluate quality |
| `mcq_quiz` | n/a — simple enough to keep hand-rolled | — | — | Low complexity; custom styling needed |
| `chart` | Recharts (via shadcn chart) | MIT | ✅ Active | Specified in spec |
| `form` | react-hook-form + shadcn Form | MIT | ✅ Active | Standard choice |
| `markdown` | react-markdown | MIT | ✅ Active | Sanitize via rehype-sanitize |
| Voice input | Web Speech API (browser native) | — | — | No library needed; Capacitor bridge already exists |

## Decision
*Pending Phase 1 and Phase 5 evaluation.* Planned wrapping strategy:
- `conversation_loop`: wrap Vercel AI SDK `useChat` as a registry entry (client-side hook only;
  no RSC). The hook calls our `run-llm-action` edge function.
- `chat_thread`: use `useChat` + a shadcn-based chat UI component if one is maintained and MIT.
  Otherwise, thin hand-roll on top of shadcn Card + Input + ScrollArea primitives.
- `chart`: use shadcn/chart (Recharts wrapper) directly.

## Consequences
- Each wrapped component must note its license in the registry entry's `llmDescription`.
- `react-markdown` must use `rehype-sanitize` to prevent XSS from LLM-generated markdown content.
- `useChat` ties us to Vercel AI SDK on the client; acceptable since we already use it server-side.

