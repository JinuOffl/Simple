import { corsHeaders } from "../_shared/cors.ts";

// ─── Capability Registry (single source of truth for what the platform can do) ─

const CAPABILITY_REGISTRY = `
## CAPABILITY REGISTRY — what this platform can actually build

### 🔢 DETERMINISTIC OFFLINE (zero LLM, zero network — always reliable)
- calculator
    Component type: "calculator"
    No props needed. Full arithmetic keypad, works offline.
    Use when: user asks for a calculator, math, arithmetic

- clock
    Component type: "clock"
    Props: { timezone?: string (IANA e.g. "Asia/Kolkata"), format?: "12h"|"24h", label?: string }
    Updates every second, works offline.
    Use when: user asks for a clock, time, timezone, world clock

### 🌐 LIVE DATA (real APIs, no LLM, reliable results)
All live data uses an api_fetch action. You choose the api name and fill in params.

- weather
    api: "weather", params: { city: string }
    Returns: temperature, condition, humidity, wind, feels-like
    Use when: user wants weather, forecast, temperature for a city

- currency
    api: "currency", params: { from: string, to: string, amount?: number }
    Returns: live conversion rate and result
    Use when: user wants currency converter, exchange rate

- timezone
    api: "timezone", params: { timezone: string (IANA) }
    Returns: current time + date in that timezone
    Alternative to clock component when user wants a quick lookup, not a live ticking display

- dictionary
    api: "dictionary", params: { word: string }
    Returns: definition, pronunciation, part of speech, example
    Use when: user wants word definitions, vocabulary help

- country
    api: "country", params: { name: string }
    Returns: capital, population, currency, languages, flag
    Use when: user asks about a country

- trivia
    api: "trivia", params: { number?: number, type?: "trivia"|"math"|"date"|"year" }
    Returns: a fun fact about a number
    Use when: user wants random facts or number trivia

### 🤖 LLM-POWERED (uses AI — good for open-ended advice, tutoring, coaching)
- llm_call
    Action kind: "llm_call"
    Props: prompt_template with {{placeholder}} variables filled from appData
    Use when: user wants advice, analysis, recommendations based on their input

- conversation_loop
    Component type: "conversation_loop"
    Props: { persona_prompt: string }
    Use when: user wants multi-turn chat, tutoring, interview prep, coaching

### 📱 NATIVE DEVICE
- image_capture (component type: "image_capture") — camera photo
- mic_recorder (component type: "mic_recorder") — voice input

### 📝 USER DATA
- checklist (component type: "checklist") — persistent checkable list, props: { items: string[] }
- mcq_quiz (component type: "mcq_quiz") — multiple choice, props: { questions: [{question, options, correct_index}] }

### 📦 LAYOUT / DISPLAY
- text — simple text block, props: { content: string }
- card — titled section, props: { title: string, body: string }
- button — tap to trigger an action, props: { label: string }, on_click: action_id
- chat_bubble — single message bubble, props: { role: "user"|"assistant", content: string }

---

## RULES FOR api_fetch

When using api_fetch, the action's render_result_into should point to a card or text component that will display the result.
The result is a formatted multi-line string — a card component body is ideal.

For params that come from user input (e.g. the user types a city), use {{dataKey}} syntax:
  { city: "{{city_input}}" }  ← this will be resolved from appData at runtime

---

## WHAT TO DO WHEN A REQUEST IS UNSUPPORTED

If a user asks for something that needs a capability NOT in this list:
- Do NOT generate a broken app that pretends to work
- Generate a manifest with a "text" component explaining what IS possible
- Offer the closest alternative from the capability registry

Example: user asks "build me a stock price tracker"
→ Respond with an app that says "Stock prices aren't available yet, but I can show you currency exchange rates! Try asking for a currency converter."
`;

// ─── JSON Schema for the manifest (for JSON Schema mode) ──────────────────────

const MANIFEST_JSON_SCHEMA = {
  type: "object",
  required: ["app_id", "name", "icon", "components", "actions"],
  properties: {
    app_id: { type: "string" },
    name: { type: "string" },
    icon: { type: "string" },
    permissions: {
      type: "array",
      items: { type: "string", enum: ["camera", "microphone", "location", "contacts"] }
    },
    components: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "type"],
        properties: {
          id: { type: "string" },
          type: {
            type: "string",
            enum: [
              "text", "card", "button", "checklist",
              "image_gallery", "image_capture", "mic_recorder",
              "mcq_quiz", "chat_bubble", "conversation_loop",
              "calculator", "clock"
            ]
          },
          props: { type: "object" },
          bind: { type: "string" },
          on_click: { type: "string" }
        }
      }
    },
    actions: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "kind"],
        properties: {
          id: { type: "string" },
          kind: {
            type: "string",
            enum: ["llm_call", "local_compute", "api_fetch", "navigate", "save_data", "conversation_loop"]
          },
          prompt_template: { type: "string" },
          persona_prompt: { type: "string" },
          operation: {
            type: "string",
            enum: ["add", "subtract", "multiply", "divide", "concat", "count", "get_current_time", "format_date"]
          },
          api: {
            type: "string",
            enum: ["weather", "currency", "timezone", "dictionary", "country", "trivia"]
          },
          params: { type: "object" },
          input_from: { type: "array", items: { type: "string" } },
          render_result_into: { type: "string" }
        }
      }
    }
  }
};

const SYSTEM_PROMPT = `You are the app generator for "Simple" — a platform that turns natural language into real, working personal utility apps. You output ONLY valid JSON. No prose, no markdown fences, no explanation.

You are a PLANNER and COMPILER for a fixed capability platform. Your job is to:
1. Understand what the user wants
2. Map it to capabilities that ACTUALLY EXIST in the platform
3. Generate a manifest that will RELIABLY work

${CAPABILITY_REGISTRY}

## OUTPUT FORMAT RULES
- Output a single raw JSON object, nothing else
- app_id: short kebab-case slug (e.g. "weather-london", "currency-converter")
- icon: single emoji
- Keep apps focused: 2–5 components is ideal
- Every on_click MUST reference an existing action id
- Every render_result_into MUST reference an existing component id

## EDIT RULES
If existing_manifest is provided, you are editing it. Output the FULL updated manifest but change ONLY what was asked. Preserve all untouched ids and props exactly.`;

// ─── Groq API call ────────────────────────────────────────────────────────────

async function callGroq(
  messages: Array<{ role: string; content: string }>,
  groqApiKey: string,
  temperature = 0.3
): Promise<string> {
  const body: Record<string, unknown> = {
    model: "llama-3.3-70b-versatile",
    messages,
    temperature,
    max_tokens: 4096,
  };

  // Try JSON Schema mode first (stricter, fewer repair passes needed)
  body.response_format = {
    type: "json_schema",
    json_schema: {
      name: "manifest",
      strict: false,
      schema: MANIFEST_JSON_SCHEMA,
    },
  };

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${groqApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    // Fall back to json_object mode if schema mode fails
    if (response.status === 400) {
      delete body.response_format;
      body.response_format = { type: "json_object" };
      const fallback = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!fallback.ok) throw new Error(`Groq API error ${fallback.status}: ${await fallback.text()}`);
      const fallbackData = await fallback.json();
      return fallbackData.choices[0].message.content;
    }
    throw new Error(`Groq API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ─── Validator ────────────────────────────────────────────────────────────────

const VALID_COMPONENT_TYPES = new Set([
  "text", "card", "button", "checklist", "image_gallery",
  "image_capture", "mic_recorder", "mcq_quiz", "chat_bubble",
  "conversation_loop", "calculator", "clock"
]);

const VALID_ACTION_KINDS = new Set([
  "llm_call", "local_compute", "api_fetch", "navigate", "save_data", "conversation_loop"
]);

const VALID_APIS = new Set([
  "weather", "currency", "timezone", "dictionary", "country", "trivia"
]);

const VALID_OPERATIONS = new Set([
  "add", "subtract", "multiply", "divide", "concat", "count", "get_current_time", "format_date"
]);

function validateManifest(obj: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (typeof obj !== "object" || obj === null) return { valid: false, errors: ["Root must be an object"] };

  const m = obj as Record<string, unknown>;
  if (!m.app_id) errors.push("app_id is required");
  if (!m.name) errors.push("name is required");
  if (!m.icon) errors.push("icon is required");
  if (!Array.isArray(m.permissions)) m.permissions = [];

  if (!Array.isArray(m.components)) {
    errors.push("components must be an array");
    return { valid: false, errors };
  }

  const componentIds = new Set<string>();
  for (const c of m.components as Record<string, unknown>[]) {
    if (!c.id) errors.push("Component missing id");
    else componentIds.add(c.id as string);
    if (!VALID_COMPONENT_TYPES.has(c.type as string)) errors.push(`Invalid component type: "${c.type}"`);
  }

  if (!Array.isArray(m.actions)) {
    errors.push("actions must be an array");
    return { valid: false, errors };
  }

  const actionIds = new Set<string>();
  for (const a of m.actions as Record<string, unknown>[]) {
    if (!a.id) errors.push("Action missing id");
    else actionIds.add(a.id as string);
    if (!VALID_ACTION_KINDS.has(a.kind as string)) errors.push(`Invalid action kind: "${a.kind}"`);
    if (a.kind === "api_fetch" && !VALID_APIS.has(a.api as string)) errors.push(`Invalid api: "${a.api}". Valid: ${[...VALID_APIS].join(", ")}`);
    if (a.kind === "local_compute" && a.operation && !VALID_OPERATIONS.has(a.operation as string)) errors.push(`Invalid operation: "${a.operation}"`);
    if (a.render_result_into && !componentIds.has(a.render_result_into as string)) errors.push(`render_result_into "${a.render_result_into}" references unknown component`);
  }

  for (const c of m.components as Record<string, unknown>[]) {
    if (c.on_click && !actionIds.has(c.on_click as string)) errors.push(`on_click "${c.on_click}" on "${c.id}" references unknown action`);
  }

  return { valid: errors.length === 0, errors };
}

// ─── Edge Function handler ────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const groqApiKey = Deno.env.get("GROQ_API_KEY");
    if (!groqApiKey) throw new Error("GROQ_API_KEY not set");

    const body = await req.json();
    const { user_prompt, existing_manifest, conversation_context = [] } = body;

    if (!user_prompt) {
      return new Response(JSON.stringify({ error: "user_prompt is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
      ...conversation_context.slice(-6),
    ];

    let userContent = `USER REQUEST: ${user_prompt}`;
    if (existing_manifest) {
      userContent += `\n\nEXISTING MANIFEST (edit this — preserve unchanged parts exactly):\n${JSON.stringify(existing_manifest, null, 2)}`;
    }
    messages.push({ role: "user", content: userContent });

    // Generation with repair loop
    let manifest: unknown = null;
    let lastErrors: string[] = [];

    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0 && lastErrors.length) {
        messages.push({
          role: "user",
          content: `The manifest has validation errors. Fix ONLY these and return corrected JSON:\n${lastErrors.join("\n")}`,
        });
      }

      const raw = await callGroq(messages, groqApiKey, attempt === 0 ? 0.3 : 0.1);
      messages.push({ role: "assistant", content: raw });

      let parsed: unknown;
      try { parsed = JSON.parse(raw); }
      catch { lastErrors = [`Invalid JSON: ${raw.substring(0, 150)}`]; continue; }

      const { valid, errors } = validateManifest(parsed);
      if (valid) { manifest = parsed; break; }
      lastErrors = errors;
    }

    if (!manifest) {
      return new Response(
        JSON.stringify({ error: "Could not generate a valid app. Please rephrase your request.", details: lastErrors }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(manifest), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-manifest error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message ?? "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
