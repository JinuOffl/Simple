import { z } from "zod";

export const ComponentSchema = z.object({
  id: z.string(),
  type: z.enum([
    // ── Display / Content ──────────────────────────────────────────
    "text",
    "card",
    "chat_bubble",
    // ── Interactive ────────────────────────────────────────────────
    "button",
    "checklist",
    "mcq_quiz",
    // ── Deterministic offline widgets (zero LLM, zero network) ────
    "calculator",       // full arithmetic keypad — no props needed
    "clock",            // live time display — props: timezone, format
    // ── Native device ─────────────────────────────────────────────
    "image_gallery",
    "image_capture",    // opens camera
    "mic_recorder",     // opens microphone
    // ── Conversational ─────────────────────────────────────────────
    "conversation_loop" // multi-turn voice/text loop
  ]),
  props: z.record(z.string(), z.unknown()).optional(),
  bind: z.string().optional(),      // references app_data key → injects live value into component
  on_click: z.string().optional()   // references an action id
});

export const ActionSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "llm_call",         // calls LLM, renders text result
    "local_compute",    // deterministic arithmetic / string ops, no network
    "api_fetch",        // calls an allowlisted real API (weather, currency, etc.)
    "navigate",         // route change
    "save_data",        // persist to app_data table
    "conversation_loop" // multi-turn — handled inside ConversationLoop component
  ]),

  // ── llm_call ──────────────────────────────────────────────────────
  prompt_template: z.string().optional(),

  // ── conversation_loop ─────────────────────────────────────────────
  persona_prompt: z.string().optional(),

  // ── local_compute — typed operation enum (replaces free-text prompt_template) ──
  operation: z.enum([
    "add", "subtract", "multiply", "divide",  // arithmetic
    "concat", "count",                         // string / list
    "get_current_time", "format_date"          // datetime
  ]).optional(),

  // ── api_fetch — server-side allowlisted API call ──────────────────
  api: z.enum([
    "weather",    // Open-Meteo: params { city }
    "currency",   // ExchangeRate-API: params { from, to, amount? }
    "timezone",   // WorldTimeAPI: params { timezone }
    "dictionary", // DictionaryAPI: params { word }
    "country",    // RestCountries: params { name }
    "trivia",     // Numbers API: params { number?, type? }
  ]).optional(),
  params: z.record(z.string(), z.unknown()).optional(),

  // ── shared ────────────────────────────────────────────────────────
  input_from: z.array(z.string()).optional(),
  render_result_into: z.string().optional()
});

export const ManifestSchema = z.object({
  app_id: z.string(),
  name: z.string(),
  icon: z.string(),
  permissions: z.array(z.enum(["camera", "microphone", "location", "contacts"]))
               .optional().transform(v => v ?? []),
  components: z.array(ComponentSchema),
  actions: z.array(ActionSchema)
});

export type Manifest = z.infer<typeof ManifestSchema>;
export type ManifestComponent = z.infer<typeof ComponentSchema>;
export type ManifestAction = z.infer<typeof ActionSchema>;
export type ComponentType = ManifestComponent["type"];
export type ActionKind = ManifestAction["kind"];
export type ApiName = NonNullable<ManifestAction["api"]>;
export type ComputeOperation = NonNullable<ManifestAction["operation"]>;
