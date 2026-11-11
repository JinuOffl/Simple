# 004 — UI Specification Format: Manifest JSON vs OpenUI Lang

**Status:** STUB — to be decided in Phase 5 spike  
**Date:** 2026-11-10

## Context
The current manifest uses our custom JSON format. The spec requires a time-boxed spike in Phase 5
to compare this against OpenUI Lang on the golden eval prompts, measuring validity rate, token
count, latency, mobile WebView behavior, and license/maintenance status.

## Questions to answer in the spike
- Does OpenUI Lang have a stable spec and active maintenance as of Phase 5?
- Can the existing 23-component registry be expressed as OpenUI component types?
- Does an OpenUI parser work in a React 19 + Vite + Capacitor WebView environment?
- Is token usage for OpenUI manifests materially different from JSON?
- Are there license constraints (GPL, proprietary) that affect distribution in an APK?

## Decision
*Pending Phase 5 spike. The winner is implemented behind `UiSpecAdapter` interface so the
underlying format can be swapped without touching the renderer or generator.*

## Consequences
- Both paths must be isolated behind `UiSpecAdapter`.
- If OpenUI wins: the manifest v2 Zod schema becomes a subset/transformation layer.
- If JSON wins: document why (likely: simpler tooling, stable spec, no extra parser).

