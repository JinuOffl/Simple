# "Simple" — Functionality-First Architecture

Supersedes the earlier timeline-constrained, fixed-10-component version. The prior doc
optimized for "ship something safe in a week." This one optimizes for the actual question:
**what does a user get that they couldn't get by just asking ChatGPT, or by downloading an
existing app?** UI polish is secondary to that answer.

> **Revisions after implementation review (these override anything below that conflicts):**
> 1. `streamUI` is a Next.js React-Server-Components pattern. Our stack is Vite + Capacitor, so v2
>    uses the Vercel AI SDK **core** server-side (structured output, tool calling) and renders
>    on the client through a component registry.
> 2. Tremor is replaced by Recharts via shadcn/ui's chart component.
> 3. The Capability Resolver is mostly deterministic; an LLM is used only to disambiguate.
> 4. The Critic includes a deterministic dry-run of the app's flows, plus a cheap semantic check.
> 5. Messaging is a `chat_thread` component for shared apps, never marketed as E2E-encrypted or a
>    WhatsApp replacement.
> 6. OAuth-based connectors (e.g., Google Calendar) are deferred; v2 supports token/API-key MCP only.
> 7. Home Assistant works in the cloud only via a public HTTPS URL (it is normally LAN-only).

---

## 1. The value proposition, stated precisely

A user has an idea for a personal tool. Today their options are:
- **Ask a chatbot** → gets an answer, not a tool. Nothing persists, nothing is reusable,
  nothing lives on their phone as a thing they open tomorrow.
- **Find an existing app** → generic, built for everyone, full of features they don't want,
  often with ads/accounts/subscriptions for something they need 5% of.
- **Hire/become a developer** → real friction: environment setup, library choices,
  deployment, hosting, debugging. Days to weeks even for something simple.

**"Simple" answer: "what's in it for me?"** — *you describe the tool once, in your own
words, and it exists, on your phone, working, by the time you finish the conversation.
No setup, no hosting decisions, no debugging. The functionality is real — it calls real
weather data, controls your real smart home devices, really uses your camera — not a mockup.*

The product's job is not "generate pretty screens." It's **collapse the distance between
having an idea and having a working tool to zero**, by doing what a competent engineer would
do — figure out what already exists that solves this, wire it together, and only write new
code for the part that's genuinely novel.

---

## 2. The reframed core principle: "Simple connects, it doesn't reinvent"

This is the actual unlock from your last message, and it changes the architecture more than
it might look like at first:

Almost nothing a personal micro-app needs is actually novel. Weather data, currency
conversion, smart-home control, calendar access, messaging infrastructure, speech-to-text,
charting, image processing — **all of this already exists as mature, maintained, often
open-source building blocks.** The old architecture tried to reimplement tiny slices of this
behind a fixed component library. The better architecture **treats connection to existing
systems as the primary mechanism**, and reserves actual generation (UI or code) for the
genuinely new 10-20% — the specific combination and framing the user asked for, which by
definition nobody pre-built.

Concretely, this means three categories of building block, used together:

| Category | What it is | Example |
|---|---|---|
| **MCP servers (functionality)** | Pre-built, maintained connectors to real services and devices | Home Assistant MCP server (controls 2,000+ smart home integrations out of the box), a weather MCP server, a calendar MCP server |
| **Open-source UI component libraries (presentation)** | Mature, accessible, good-looking components, not hand-rolled by you | shadcn/ui, Recharts (charts), existing chat-UI kits |
| **Code generation (the genuinely new part)** | LLM-written logic/UI for the specific thing nobody pre-built | "score my outfit based on these 5 rules I just described" |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  CLIENT (React + Vite, web-first, Capacitor wrap for mobile)      │
│  - Vercel AI SDK (core + UI hooks; no RSC streamUI)     │
│  - Rendered UI built from shadcn/ui + Recharts + custom components  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  ORCHESTRATION LAYER (multi-agent, server-side)                   │
│                                                                     │
│  1. Requirement Analyst agent                                     │
│     — turns the user's sentence into a structured spec:           │
│       what capabilities are needed, what data, what UI shape      │
│                                                                     │
│  2. Capability Resolver agent                                     │
│     — checks: does an MCP server already provide this capability? │
│       (weather, smart home, calendar, messaging, etc.)            │
│     — if yes: wire it in, done, no new code needed for that part  │
│     — if no: flag it for the Builder agent to generate            │
│                                                                     │
│  3. Builder agent(s)                                              │
│     — UI composition: assembles shadcn/ui + Recharts components,    │
│       using Vercel AI SDK's tool-call-bound generative UI pattern │
│     — Logic generation: for the genuinely novel 10-20%, generates │
│       actual code — but sandboxed (see §5), not raw-executed      │
│                                                                     │
│  4. Critic/Validator agent                                        │
│     — functional check, not just schema check: does the           │
│       assembled app actually do what was asked?                   │
│     — runs a simulated pass through the app's main flow           │
│                                                                     │
│  5. Deploy                                                        │
│     — saved as a persistent app; opening it later never re-runs   │
│       this pipeline, only its own runtime calls (MCP tool calls,  │
│       cached logic) execute                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  CONNECTOR LAYER (MCP servers — mostly third-party, maintained    │
│  by someone else, you just point at them)                         │
│  - Home Assistant MCP (smart home / IoT)                          │
│  - Weather, calendar, currency, dictionary MCP servers            │
│  - Supabase (your own data: apps, app_data, messaging via         │
│    Realtime, auth)                                                │
│  - Any MCP server the user adds themselves (BYO integrations)     │
└─────────────────────────────────────────────────────────────────┘
```

This keeps your two good instincts from before — **zero-LLM-on-open** (the orchestration
pipeline runs once, at creation/edit time, not on every app launch) and **persistence**
(apps are real saved things, not ephemeral chat answers) — while removing the artificial
ceiling of "only 10 fixed component types can ever exist."

---

## 4. What changes for your five original use cases, concretely

| Use case | Old approach (fixed component) | New approach (connect, don't reinvent) |
|---|---|---|
| **Dress recommender** | `image_gallery` + `card`, LLM reasons over static photo tags | Same core idea, but UI drawn from shadcn/ui's richer gallery/card primitives; reasoning step can call a real weather MCP server so the recommendation factors in actual forecast, not just stored tags |
| **Checklist/system assistant** | `checklist` component, static items | Checklist UI from shadcn/ui; can connect to a real calendar MCP server to pull actual deadlines instead of user-typed ones |
| **Mock interviewer (AI HR)** | `conversation_loop`, custom-built mic handling | Vercel AI SDK's chat primitives + streaming voice UI (mature, accessible out of the box) instead of hand-rolling turn-taking from scratch |
| **Aptitude/MCQ app** | `mcq_quiz` custom component | Could use an existing open-source quiz-UI component instead of a hand-rolled one; this was always low-novelty, now explicitly treated that way |
| **IoT device management** | Not really feasible under the old fixed-component model | **This is where the new architecture earns its keep.** Home Assistant already exposes 2,000+ smart-home integrations through a maintained MCP server (confirmed current, late 2026). Simple's job here is *purely orchestration*: the Capability Resolver agent sees "control my smart home," finds the Home Assistant MCP connector, and the Builder agent just needs to generate the UI (a dashboard of toggles/sliders bound to real device states) — zero device-protocol work for you |
| **1-to-1 messaging app** | Out of scope under old model | Supabase Realtime (already in your stack) handles the actual messaging transport; the generation job is only the UI layer (chat bubbles, input, presence indicators) — pull from an existing open-source chat UI kit rather than building one |

The IoT and messaging cases are the clearest proof that "connect, don't reinvent" isn't just
a cost-saving idea — it's what makes those two categories *buildable at all* without you
personally becoming an expert in smart-home protocols or realtime messaging infrastructure.

---

## 5. Handling "genuinely novel" logic without reopening the security problem

Not everything reduces to "find the right MCP server." Sometimes the user wants real custom
logic — a specific scoring rule, a particular way of combining two data sources, a
Feynman-tutor persona with specific behavior. For this slice, actual code generation is
justified, but it still shouldn't run as freely-trusted code in a WebView with camera/mic
access. Two honest options, not mutually exclusive:

- **Sandboxed execution (WebAssembly / strict capability-based iframe):** generated logic
  runs with no DOM access and no network access except through an explicit, narrow bridge
  you control. This is a categorically different risk profile than "run arbitrary JS with
  full permissions" — it's the same principle browsers themselves use to run untrusted code
  safely.
- **LLM-as-the-logic, not code-as-the-logic:** for a lot of "custom logic" requests (e.g.
  "score my outfit using these rules"), you don't need generated code at all — you need a
  well-crafted prompt executed at runtime (this is your existing `llm_call` action type,
  which still has a place here). Reserve actual code generation for cases where a prompt
  genuinely can't do the job (tight math, deterministic step-by-step logic, performance-
  sensitive loops).

---

## 6. Revised recommendation

Build in this order, without a fixed timeline, but sequenced to validate riskiest
assumptions first:

1. **Prove the "connect" model works at all** — wire up one real MCP server (Home Assistant
   is a strong first choice, since it's the clearest "impossible under the old model, easy
   under this one" case) and get a trivial generated UI controlling one real device. This is
   the single most important proof-of-concept, because it validates the entire thesis.
2. **Build the orchestration pipeline** (Requirement Analyst → Capability Resolver →
   Builder → Critic) as a real multi-agent flow, not a single LLM call — this is where your
   original "cloud dev team" vision and your Example #1 (FSM + multi-agent evaluation)
   belong; they were right, just mistimed for a 1-week MVP.
3. **Swap the UI layer** from hand-rolled components to Vercel AI SDK's generative UI
   pattern bound to shadcn/ui + Recharts, so you inherit a much larger, better-maintained
   component surface instead of hand-building 10 components.
4. **Add the sandboxed code-gen escape hatch** for genuinely novel logic, once you've seen
   real user requests that MCP connectors + prompt-based `llm_call` can't satisfy — build it
   against real evidence of need, not speculatively.
5. **Re-introduce persistence, zero-LLM-on-open, and the template fast-path** from the prior
   doc — these were correct regardless of this architectural shift and should carry forward
   unchanged.

The Nothing-OS visual language and the "micro-app" framing can come back later as a design
choice, not an architectural constraint — nothing above prevents a minimal, cohesive visual
style, it's just no longer the thing the architecture is optimized around.
