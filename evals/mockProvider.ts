import type {
  JsonPatchOperation,
  LLMProvider,
  LlmJsonRequest,
  LlmJsonResponse,
  ManifestV2Like,
} from "../supabase/functions/_shared/orchestrator/types.ts";
import { STARTER_TEMPLATES } from "../supabase/functions/_shared/orchestrator/templates.ts";
import { analyzePrompt } from "../supabase/functions/_shared/orchestrator/analyzer.ts";

function buildSimulatedManifest(userPrompt: string, isRepair: boolean): ManifestV2Like {
  const lower = userPrompt.toLowerCase();

  // Simulated repair test cases (fail pass 0 unless repair attempt)
  if (!isRepair && userPrompt.includes("[REPAIR_SIM:MISSING_MIC_PERMISSION]")) {
    const base = structuredClone(
      STARTER_TEMPLATES.find((t) => t.slug === "feynman-study-tutor")!.manifest
    );
    base.permissions = []; // intentional bug caught by VALIDATE
    return base;
  }

  if (!isRepair && userPrompt.includes("[REPAIR_SIM:DANGLING_ON_CLICK]")) {
    const base = structuredClone(
      STARTER_TEMPLATES.find((t) => t.slug === "weather-forecast")!.manifest
    );
    base.screens[0]!.nodes[1]!.on_click = "non_existent_action"; // intentional bug caught by VALIDATE
    return base;
  }

  // Matched templates cleanly customized
  if (lower.includes("calculator")) {
    const m = structuredClone(
      STARTER_TEMPLATES.find((t) => t.slug === "pocket-calculator")!.manifest
    );
    m.app_id = "sim-calculator";
    return m;
  }

  if (lower.includes("weather")) {
    const m = structuredClone(
      STARTER_TEMPLATES.find((t) => t.slug === "weather-forecast")!.manifest
    );
    m.app_id = "sim-weather";
    return m;
  }

  if (lower.includes("currency") || lower.includes("usd")) {
    const m = structuredClone(
      STARTER_TEMPLATES.find((t) => t.slug === "currency-converter")!.manifest
    );
    m.app_id = "sim-currency";
    return m;
  }

  if (lower.includes("clock") || (lower.includes("tokyo") && !lower.includes("forecast"))) {
    const m = structuredClone(
      STARTER_TEMPLATES.find((t) => t.slug === "world-clock")!.manifest
    );
    m.app_id = "sim-world-clock";
    return m;
  }

  if (lower.includes("timezone")) {
    const m = structuredClone(
      STARTER_TEMPLATES.find((t) => t.slug === "world-clock")!.manifest
    );
    m.app_id = "sim-timezone";
    return m;
  }

  if (lower.includes("dictionary") || lower.includes("phonetic")) {
    return {
      schema_version: 2,
      app_id: "sim-dictionary",
      name: "Word Dictionary",
      icon: "📖",
      description: "Look up English definitions and phonetics.",
      permissions: [],
      connectors: [],
      data: { collections: [] },
      screens: [
        {
          id: "main",
          title: "Dictionary",
          nodes: [
            {
              id: "def_card",
              type: "card",
              props: { title: "Word Lookup", body: "Tap Define to look up serendipity." },
              bind: "def_card",
            },
            {
              id: "define_btn",
              type: "button",
              props: { label: "Define Word", variant: "primary" },
              on_click: "a_dictionary",
            },
          ],
        },
      ],
      actions: [
        {
          id: "a_dictionary",
          kind: "api_fetch",
          api: "dictionary",
          params: { word: "serendipity" },
          render_result_into: "def_card",
          credit_cost_class: "api_fetch",
        },
      ],
    };
  }

  if (lower.includes("country")) {
    return {
      schema_version: 2,
      app_id: "sim-country-facts",
      name: "Country Explorer",
      icon: "🌍",
      description: "Explore country facts and languages.",
      permissions: [],
      connectors: [],
      data: { collections: [] },
      screens: [
        {
          id: "main",
          title: "Countries",
          nodes: [
            {
              id: "country_card",
              type: "card",
              props: { title: "Country Info", body: "Tap Explore Country." },
              bind: "country_card",
            },
            {
              id: "explore_btn",
              type: "button",
              props: { label: "Explore Japan", variant: "primary" },
              on_click: "a_country",
            },
          ],
        },
      ],
      actions: [
        {
          id: "a_country",
          kind: "api_fetch",
          api: "country",
          params: { name: "Japan" },
          render_result_into: "country_card",
          credit_cost_class: "api_fetch",
        },
      ],
    };
  }

  if (lower.includes("trivia") && !lower.includes("quiz")) {
    return {
      schema_version: 2,
      app_id: "sim-number-trivia",
      name: "Number Trivia",
      icon: "💡",
      description: "Discover surprising number facts.",
      permissions: [],
      connectors: [],
      data: { collections: [] },
      screens: [
        {
          id: "main",
          title: "Number Trivia",
          nodes: [
            {
              id: "trivia_card",
              type: "card",
              props: { title: "Fun Fact", body: "Tap Get Fact for trivia." },
              bind: "trivia_card",
            },
            {
              id: "trivia_btn",
              type: "button",
              props: { label: "Get Fact", variant: "primary" },
              on_click: "a_trivia",
            },
          ],
        },
      ],
      actions: [
        {
          id: "a_trivia",
          kind: "api_fetch",
          api: "trivia",
          params: { number: 42, type: "trivia" },
          render_result_into: "trivia_card",
          credit_cost_class: "api_fetch",
        },
      ],
    };
  }

  if (lower.includes("camera") || lower.includes("receipt")) {
    return {
      schema_version: 2,
      app_id: "sim-receipt-scanner",
      name: "Receipt Scanner",
      icon: "📷",
      description: "Capture and review receipt photos.",
      permissions: ["camera"],
      connectors: [],
      data: { collections: [] },
      screens: [
        {
          id: "main",
          title: "Receipts",
          nodes: [
            {
              id: "capture_receipt",
              type: "image_capture",
              props: { label: "Scan Receipt", save_to: "receipt_photos" },
            },
            {
              id: "receipt_gallery",
              type: "image_gallery",
              props: { source: "receipt_photos" },
            },
          ],
        },
      ],
      actions: [],
    };
  }

  if (lower.includes("voice note") || lower.includes("microphone")) {
    return {
      schema_version: 2,
      app_id: "sim-voice-memo",
      name: "Voice Memo",
      icon: "🎙️",
      description: "Record voice notes cleanly.",
      permissions: ["microphone"],
      connectors: [],
      data: { collections: [] },
      screens: [
        {
          id: "main",
          title: "Voice Note",
          nodes: [
            {
              id: "voice_note",
              type: "mic_recorder",
              props: { label: "Tap to record voice note", save_to: "note_text" },
            },
            {
              id: "transcript_card",
              type: "card",
              props: { title: "Transcript", body: "Your recording appears here." },
              bind: "note_text",
            },
          ],
        },
      ],
      actions: [],
    };
  }

  if (lower.includes("home assistant") || lower.includes("smart light") || lower.includes("living room light")) {
    const m = structuredClone(
      STARTER_TEMPLATES.find((t) => t.slug === "smart-home-light")!.manifest
    );
    m.app_id = "sim-smart-light";
    return m;
  }

  if (lower.includes("calendar")) {
    return {
      schema_version: 2,
      app_id: "sim-calendar-mcp",
      name: "Daily Schedule",
      icon: "📅",
      description: "View calendar meetings via MCP.",
      permissions: [],
      connectors: [
        { connector_id: "calendar", tools: ["calendar.list_events"] },
      ],
      data: { collections: [] },
      screens: [
        {
          id: "main",
          title: "Calendar",
          nodes: [
            {
              id: "events_card",
              type: "card",
              props: { title: "Today's Events", body: "Tap Load Meetings to sync." },
              bind: "events_card",
            },
            {
              id: "load_events_btn",
              type: "button",
              props: { label: "Load Meetings", variant: "primary" },
              on_click: "a_list_events",
            },
          ],
        },
      ],
      actions: [
        {
          id: "a_list_events",
          kind: "mcp_call",
          connector_id: "calendar",
          tool_name: "calendar.list_events",
          params: { range: "today" },
          render_result_into: "events_card",
          credit_cost_class: "mcp_call",
        },
      ],
    };
  }

  if (lower.includes("notion")) {
    return {
      schema_version: 2,
      app_id: "sim-notion-notes",
      name: "Notion Quick Note",
      icon: "📝",
      description: "Append lecture notes to Notion via MCP.",
      permissions: [],
      connectors: [
        { connector_id: "notion", tools: ["notion.append_block"] },
      ],
      data: { collections: [] },
      screens: [
        {
          id: "main",
          title: "Notion Notes",
          nodes: [
            {
              id: "notion_card",
              type: "card",
              props: { title: "Sync Status", body: "Tap Append Note to save to Notion." },
              bind: "notion_card",
            },
            {
              id: "append_btn",
              type: "button",
              props: { label: "Append Note", variant: "primary" },
              on_click: "a_notion_append",
            },
          ],
        },
      ],
      actions: [
        {
          id: "a_notion_append",
          kind: "mcp_call",
          connector_id: "notion",
          tool_name: "notion.append_block",
          params: { text: "Lecture key takeaways" },
          render_result_into: "notion_card",
          credit_cost_class: "mcp_call",
        },
      ],
    };
  }

  if (lower.includes("feynman") || lower.includes("mock interview") || lower.includes("tutor") && lower.includes("operating")) {
    const m = structuredClone(
      STARTER_TEMPLATES.find((t) => t.slug === "feynman-study-tutor")!.manifest
    );
    m.app_id = "sim-tutor";
    return m;
  }

  if (lower.includes("quiz") || lower.includes("aptitude")) {
    const analysis = analyzePrompt(userPrompt);
    return {
      schema_version: 2,
      app_id: "sim-aptitude-quiz",
      name: "Aptitude Quiz",
      icon: "🧠",
      description: "Practice quick multiple choice questions.",
      permissions: [],
      connectors: [],
      data: { collections: [] },
      screens: [
        {
          id: "main",
          title: "Quiz",
          nodes: [
            {
              id: "quiz_node",
              type: "mcq_quiz",
              props: {
                questions: [
                  { question: "What is 15% of 200?", options: ["20", "30", "45"], correct_index: 1 },
                  { question: "What is 12 x 8?", options: ["84", "96", "108"], correct_index: 1 },
                  { question: "Next prime after 7?", options: ["9", "10", "11"], correct_index: 2 },
                ],
              },
            },
          ],
        },
      ],
      actions: [],
      ...(analysis.multiplayerRequested
        ? { multiplayer: { enabled: true, default_role: "editor" } }
        : {}),
    };
  }

  if (lower.includes("recipe") || lower.includes("ai study buddy") || lower.includes("generates flashcards")) {
    return {
      schema_version: 2,
      app_id: "sim-ai-helper",
      name: lower.includes("recipe") ? "Meal Planner" : "Flashcard Helper",
      icon: lower.includes("recipe") ? "🍳" : "✨",
      description: "Generate concise AI suggestions with one tap.",
      permissions: [],
      connectors: [],
      data: { collections: [] },
      screens: [
        {
          id: "main",
          title: "Assistant",
          nodes: [
            {
              id: "output_card",
              type: "card",
              props: { title: "Suggestion", body: "Tap Generate below." },
              bind: "output_card",
            },
            {
              id: "prep_checklist",
              type: "checklist",
              props: { items: ["Review goal", "Pick top 3 steps"] },
            },
            {
              id: "generate_btn",
              type: "button",
              props: { label: "Generate", variant: "primary" },
              on_click: "a_llm_help",
            },
          ],
        },
      ],
      actions: [
        {
          id: "a_llm_help",
          kind: "llm_call",
          prompt_template: "Provide 3 concise practical items for this goal.",
          render_result_into: "output_card",
          credit_cost_class: "runtime_llm",
        },
      ],
    };
  }

  // Default productivity / checklist / solo pro / couples shared checklist
  const analysis = analyzePrompt(userPrompt);
  const m = structuredClone(
    STARTER_TEMPLATES.find((t) => t.slug === "daily-checklist")!.manifest
  );
  m.app_id = "sim-checklist";
  if (analysis.multiplayerRequested) {
    m.multiplayer = { enabled: true, default_role: "editor" };
    m.name = "Shared Checklist";
  }
  return m;
}

function buildSimulatedEditPatch(prompt: string, isRepair: boolean): { operations: JsonPatchOperation[] } {
  if (!isRepair && prompt.includes("[REPAIR_SIM:ROOT_PATCH]")) {
    // Deliberately try forbidden root replacement on first pass to test minimal patch rejection -> repair
    const m = structuredClone(
      STARTER_TEMPLATES.find((t) => t.slug === "weather-forecast")!.manifest
    );
    return {
      operations: [{ op: "replace", path: "", value: m }],
    };
  }

  if (prompt.toLowerCase().includes("rename") || prompt.toLowerCase().includes("tokyo forecast")) {
    return {
      operations: [
        { op: "replace", path: "/name", value: "Tokyo Forecast" },
        { op: "replace", path: "/screens/0/nodes/0/props/title", value: "Tokyo Live Weather" },
      ],
    };
  }

  if (prompt.toLowerCase().includes("checklist")) {
    return {
      operations: [
        {
          op: "add",
          path: "/screens/0/nodes/-",
          value: {
            id: "packing_checklist",
            type: "checklist",
            props: { items: ["Umbrella", "Rain jacket"] },
          },
        },
      ],
    };
  }

  if (prompt.toLowerCase().includes("intro text") || prompt.toLowerCase().includes("split")) {
    return {
      operations: [
        {
          op: "replace",
          path: "/screens/0/nodes/0/props/content",
          value: "Quick Split Calculator",
        },
      ],
    };
  }

  return {
    operations: [
      {
        op: "add",
        path: "/screens/0/nodes/-",
        value: {
          id: "info_note",
          type: "text",
          props: { content: "Updated via surgical patch." },
        },
      },
    ],
  };
}

export class ScriptedEvalLlmProvider implements LLMProvider {
  readonly name = "scripted-eval-provider";

  completeJson<T = unknown>(request: LlmJsonRequest): Promise<LlmJsonResponse<T>> {
    if (request.role === "critique") {
      return Promise.resolve({
        data: {
          pass: true,
          issues: [],
          summary: "Manifest aligns cleanly with prompt and schema.",
        } as T,
        rawText: '{"pass":true,"issues":[]}',
        provider: this.name,
        model: "llama-3.1-8b-instant",
        usedFallback: false,
        latencyMs: 1,
      });
    }

    const isRepair = request.prompt.includes("PREVIOUS ATTEMPT FAILED") ||
      request.prompt.includes("PREVIOUS PATCH FAILED");

    if (request.schemaName === "ManifestEditPatch") {
      const patch = buildSimulatedEditPatch(request.prompt, isRepair);
      return Promise.resolve({
        data: patch as T,
        rawText: JSON.stringify(patch),
        provider: this.name,
        model: "llama-3.3-70b-versatile",
        usedFallback: false,
        latencyMs: 2,
      });
    }

    const userPromptMatch = /User request:\s*"([^"]*)"/.exec(request.prompt);
    const extractedPrompt = userPromptMatch ? userPromptMatch[1]! : request.prompt;
    const manifest = buildSimulatedManifest(extractedPrompt, isRepair);

    return Promise.resolve({
      data: manifest as T,
      rawText: JSON.stringify(manifest),
      provider: this.name,
      model: "llama-3.3-70b-versatile",
      usedFallback: false,
      latencyMs: 2,
    });
  }
}

