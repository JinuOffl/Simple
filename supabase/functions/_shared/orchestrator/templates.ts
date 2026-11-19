import type {
  ManifestV2Like,
  StarterTemplate,
  TemplateMatch,
  TemplateMatcher,
} from "./types.ts";

/**
 * Curated Starter Templates (Schema v2 valid).
 * In production migration 003, `pgvector` embeddings can plug into `TemplateMatcher`
 * alongside these deterministic starter templates.
 */
export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
  {
    id: "tpl-weather-forecast",
    slug: "weather-forecast",
    name: "Weather Checker",
    description: "Check live weather and packing checklist for your city.",
    icon: "🌤️",
    category: "utilities",
    tags: ["weather", "forecast", "temperature", "climate"],
    keywords: ["weather", "forecast", "temperature", "rain", "humidity", "city weather"],
    manifest: {
      schema_version: 2,
      app_id: "tpl-weather-forecast",
      name: "Weather Checker",
      icon: "🌤️",
      description: "Live local weather via Open-Meteo.",
      permissions: [],
      connectors: [],
      data: { collections: [] },
      screens: [
        {
          id: "main",
          title: "Weather",
          nodes: [
            {
              id: "weather_card",
              type: "card",
              props: {
                title: "Current Forecast",
                body: "Tap Refresh Weather to fetch latest conditions.",
              },
              bind: "weather_card",
            },
            {
              id: "refresh_weather_btn",
              type: "button",
              props: { label: "Refresh Weather", variant: "primary" },
              on_click: "a_fetch_weather",
            },
          ],
        },
      ],
      actions: [
        {
          id: "a_fetch_weather",
          kind: "api_fetch",
          api: "weather",
          params: { city: "London" },
          render_result_into: "weather_card",
          credit_cost_class: "api_fetch",
        },
      ],
    },
  },
  {
    id: "tpl-currency-converter",
    slug: "currency-converter",
    name: "Currency Converter",
    description: "Check live foreign exchange rates.",
    icon: "💱",
    category: "finance",
    tags: ["currency", "exchange", "rate", "fx", "money"],
    keywords: ["currency", "exchange", "forex", "usd", "eur", "inr", "convert currency"],
    manifest: {
      schema_version: 2,
      app_id: "tpl-currency-converter",
      name: "Currency Converter",
      icon: "💱",
      description: "Live currency exchange rates.",
      permissions: [],
      connectors: [],
      data: { collections: [] },
      screens: [
        {
          id: "main",
          title: "Exchange Rate",
          nodes: [
            {
              id: "rate_card",
              type: "card",
              props: {
                title: "USD to EUR",
                body: "Tap Check Rate to fetch today's exchange rate.",
              },
              bind: "rate_card",
            },
            {
              id: "fetch_rate_btn",
              type: "button",
              props: { label: "Check Rate", variant: "primary" },
              on_click: "a_fetch_currency",
            },
          ],
        },
      ],
      actions: [
        {
          id: "a_fetch_currency",
          kind: "api_fetch",
          api: "currency",
          params: { from: "USD", to: "EUR", amount: 100 },
          render_result_into: "rate_card",
          credit_cost_class: "api_fetch",
        },
      ],
    },
  },
  {
    id: "tpl-smart-home-light",
    slug: "smart-home-light",
    name: "Living Room Light",
    description: "Control smart lights over MCP connector.",
    icon: "💡",
    category: "smart_home",
    tags: ["smart home", "home assistant", "mcp", "light", "toggle"],
    keywords: ["living room light", "smart home", "home assistant", "light switch", "lamp toggle"],
    manifest: {
      schema_version: 2,
      app_id: "tpl-smart-home-light",
      name: "Living Room Light",
      icon: "💡",
      description: "Smart light toggle via Home Assistant MCP.",
      permissions: [],
      connectors: [
        {
          connector_id: "home_assistant",
          tools: ["light.toggle", "light.get_state"],
        },
      ],
      data: { collections: [] },
      screens: [
        {
          id: "main",
          title: "Control",
          nodes: [
            {
              id: "light_toggle",
              type: "toggle",
              props: {
                label: "Living Room Light",
                default_value: false,
                save_to: "light_state",
              },
              bind: "light_state",
              on_click: "a_toggle_light",
            },
            {
              id: "status_card",
              type: "card",
              props: {
                title: "Device Status",
                body: "Use the toggle above or check current light state.",
              },
              bind: "status_card",
            },
            {
              id: "check_state_btn",
              type: "button",
              props: { label: "Check State", variant: "ghost" },
              on_click: "a_get_light_state",
            },
          ],
        },
      ],
      actions: [
        {
          id: "a_toggle_light",
          kind: "mcp_call",
          connector_id: "home_assistant",
          tool_name: "light.toggle",
          params: { entity_id: "light.living_room", state: "{{light_state}}" },
          input_from: ["light_toggle"],
          render_result_into: "status_card",
          credit_cost_class: "mcp_call",
        },
        {
          id: "a_get_light_state",
          kind: "mcp_call",
          connector_id: "home_assistant",
          tool_name: "light.get_state",
          params: { entity_id: "light.living_room" },
          render_result_into: "status_card",
          credit_cost_class: "mcp_call",
        },
      ],
    },
  },
  {
    id: "tpl-feynman-study-tutor",
    slug: "feynman-study-tutor",
    name: "Feynman Study Tutor",
    description: "Interactive Feynman technique tutor with voice conversation & quiz.",
    icon: "🎓",
    category: "education",
    tags: ["tutor", "feynman", "interview", "aptitude", "study", "student"],
    keywords: ["feynman", "study tutor", "mock interview", "placement prep", "aptitude quiz"],
    manifest: {
      schema_version: 2,
      app_id: "tpl-feynman-study-tutor",
      name: "Feynman Study Tutor",
      icon: "🎓",
      description: "Explain concepts simply and test mastery.",
      permissions: ["microphone"],
      connectors: [],
      data: { collections: [] },
      screens: [
        {
          id: "main",
          title: "Tutor Session",
          nodes: [
            {
              id: "intro_card",
              type: "card",
              props: {
                title: "Feynman Method",
                body: "Explain your topic in plain English; your tutor will probe gaps.",
              },
            },
            {
              id: "tutor_chat",
              type: "conversation_loop",
              props: {
                persona_prompt:
                  "You are a Socratic Feynman tutor. Ask the student to explain a concept simply, spot gaps, and give one probing question at a time.",
                actionId: "a_tutor_loop",
              },
            },
            {
              id: "concept_quiz",
              type: "mcq_quiz",
              props: {
                questions: [
                  {
                    question: "What is the key test of understanding in the Feynman technique?",
                    options: [
                      "Memorizing jargon",
                      "Explaining simply to a beginner",
                      "Reading slides twice",
                    ],
                    correct_index: 1,
                  },
                ],
              },
            },
          ],
        },
      ],
      actions: [
        {
          id: "a_tutor_loop",
          kind: "conversation_loop",
          persona_prompt:
            "You are a Socratic Feynman tutor. Probe gaps clearly and concisely.",
          credit_cost_class: "runtime_llm",
        },
      ],
    },
  },
  {
    id: "tpl-daily-checklist",
    slug: "daily-checklist",
    name: "Daily Checklist",
    description: "Clean task checklist with live progress bar.",
    icon: "✅",
    category: "productivity",
    tags: ["checklist", "todo", "tasks", "habits", "routine"],
    keywords: ["checklist", "to-do", "todo list", "daily habit", "packing list", "grocery list"],
    manifest: {
      schema_version: 2,
      app_id: "tpl-daily-checklist",
      name: "Daily Checklist",
      icon: "✅",
      description: "Track daily tasks and progress.",
      permissions: [],
      connectors: [],
      data: { collections: [] },
      screens: [
        {
          id: "main",
          title: "Checklist",
          nodes: [
            {
              id: "header_card",
              type: "card",
              props: {
                title: "Today's Plan",
                body: "Tap items below as you complete them.",
              },
            },
            {
              id: "tasks_checklist",
              type: "checklist",
              props: {
                items: [
                  "Review top 3 priorities",
                  "Complete deep work block",
                  "Log evening wrap-up",
                ],
              },
            },
          ],
        },
      ],
      actions: [],
    },
  },
  {
    id: "tpl-pocket-calculator",
    slug: "pocket-calculator",
    name: "Pocket Calculator",
    description: "Minimalist tactile arithmetic calculator.",
    icon: "🧮",
    category: "utilities",
    tags: ["calculator", "math", "arithmetic"],
    keywords: ["calculator", "arithmetic", "quick math"],
    manifest: {
      schema_version: 2,
      app_id: "tpl-pocket-calculator",
      name: "Pocket Calculator",
      icon: "🧮",
      description: "Tactile everyday calculator.",
      permissions: [],
      connectors: [],
      data: { collections: [] },
      screens: [
        {
          id: "main",
          title: "Calculator",
          nodes: [
            {
              id: "calc_intro",
              type: "text",
              props: { content: "Quick arithmetic calculator" },
            },
            {
              id: "calc_widget",
              type: "calculator",
              props: {},
            },
          ],
        },
      ],
      actions: [],
    },
  },
  {
    id: "tpl-world-clock",
    slug: "world-clock",
    name: "World Clock",
    description: "Live timezone clock and city lookup.",
    icon: "🕒",
    category: "utilities",
    tags: ["clock", "timezone", "time", "world clock"],
    keywords: ["clock", "clock widget", "world clock", "timezone", "current time", "digital clock", "tokyo time"],
    manifest: {
      schema_version: 2,
      app_id: "tpl-world-clock",
      name: "World Clock",
      icon: "🕒",
      description: "Live timezone clock.",
      permissions: [],
      connectors: [],
      data: { collections: [] },
      screens: [
        {
          id: "main",
          title: "World Clock",
          nodes: [
            {
              id: "primary_clock",
              type: "clock",
              props: { timezone: "Asia/Tokyo", format: "24h", label: "Tokyo" },
            },
            {
              id: "tz_card",
              type: "card",
              props: {
                title: "Timezone Lookup",
                body: "Tap Sync Timezone to query live time info.",
              },
              bind: "tz_card",
            },
            {
              id: "sync_tz_btn",
              type: "button",
              props: { label: "Sync Timezone", variant: "ghost" },
              on_click: "a_fetch_tz",
            },
          ],
        },
      ],
      actions: [
        {
          id: "a_fetch_tz",
          kind: "api_fetch",
          api: "timezone",
          params: { timezone: "America/New_York" },
          render_result_into: "tz_card",
          credit_cost_class: "api_fetch",
        },
      ],
    },
  },
  {
    id: "tpl-heart-rate-monitor",
    slug: "heart-rate-monitor",
    name: "Heart Rate Monitor",
    description: "Live Bluetooth Low Energy heart rate monitor and pulse graph.",
    icon: "❤️",
    category: "health",
    tags: ["heart rate", "pulse", "smart watch", "noise watch", "ble", "fitness", "health"],
    keywords: ["heart rate", "pulse", "smart watch", "noise watch"],
    manifest: {
      schema_version: 2,
      app_id: "tpl-heart-rate-monitor",
      name: "Heart Rate Monitor",
      icon: "❤️",
      description: "Live BLE pulse monitor streaming real-time heart rate readings.",
      permissions: ["bluetooth"],
      connectors: [],
      tool: {
        size: "2x2",
        requires: [],
      },
      data: { collections: [] },
      screens: [
        {
          id: "main",
          title: "Pulse Monitor",
          nodes: [
            {
              id: "hr_ble",
              type: "ble_heart_rate",
              props: { label: "Connect Heart Rate", save_to: "bpm" },
            },
            {
              id: "hr_stat",
              type: "stat",
              props: { label: "Current Pulse", unit: "BPM", value: "--" },
              bind: "bpm",
            },
            {
              id: "hr_chart",
              type: "chart",
              props: { title: "Live Pulse Stream", live: true, max_points: 60, chart_type: "line" },
              bind: "bpm",
            },
            {
              id: "hr_status",
              type: "status",
              props: { label: "Disconnected", state: "off" },
              bind: "bpm_state",
            },
          ],
        },
      ],
      actions: [],
    },
  },
  {
    id: "tpl-habit-heatmap",
    slug: "habit-heatmap",
    name: "Habit Heatmap",
    description: "Track consistency across your daily habits.",
    icon: "🔥",
    category: "productivity",
    tags: ["habit heatmap", "habits grid", "streak grid", "consistency"],
    keywords: ["habit heatmap", "habit grid", "streak grid", "consistency matrix"],
    manifest: {
      schema_version: 2,
      app_id: "tpl-habit-heatmap",
      name: "Habit Heatmap",
      icon: "🔥",
      description: "Daily habit tracking grid over the last 14 days.",
      permissions: [],
      connectors: [],
      tool: {
        // Fit assumption: 4x2 gives full width (4 cols) and 240px height (2 rows @ 120px) to render 14 days cleanly
        size: "4x2",
        requires: [],
      },
      data: { collections: [] },
      screens: [
        {
          id: "main",
          title: "Habit Grid",
          nodes: [
            {
              id: "habit_grid",
              type: "heatmap",
              props: {
                title: "Daily Habits",
                rows: ["Workout", "Reading", "Water"],
                days: 14,
                save_to: "habits_grid",
              },
              bind: "habits_grid",
            },
          ],
        },
      ],
      actions: [],
    },
  },
  {
    id: "tpl-pomodoro",
    slug: "pomodoro",
    name: "Pomodoro Timer",
    description: "25-minute focus session countdown timer.",
    icon: "⏱️",
    category: "productivity",
    tags: ["pomodoro", "focus timer", "deep work", "interval timer"],
    keywords: ["pomodoro", "pomodoro timer", "focus timer", "25 minute timer"],
    manifest: {
      schema_version: 2,
      app_id: "tpl-pomodoro",
      name: "Pomodoro Timer",
      icon: "⏱️",
      description: "25-minute focus session timer with note.",
      permissions: [],
      connectors: [],
      tool: {
        // Fit assumption: 2x2 gives 2 cols and 240px height to comfortably fit countdown digits, state, and buttons
        size: "2x2",
        requires: [],
      },
      data: { collections: [] },
      screens: [
        {
          id: "main",
          title: "Focus Session",
          nodes: [
            {
              id: "pomo_timer",
              type: "timer",
              props: {
                duration_seconds: 1500,
                label: "Focus",
                auto_start: false,
              },
            },
            {
              id: "pomo_note",
              type: "text",
              props: {
                content: "25 min focus interval · 5 min rest",
              },
            },
          ],
        },
      ],
      actions: [],
    },
  },
  {
    id: "tpl-counter",
    slug: "counter",
    name: "Tally Counter",
    description: "Minimalist tally counter with slider and reset control.",
    icon: "🔢",
    category: "utilities",
    tags: ["counter", "tally", "clicker", "tally counter"],
    keywords: ["tally counter", "clicker counter", "tally", "count tracker"],
    manifest: {
      schema_version: 2,
      app_id: "tpl-counter",
      name: "Tally Counter",
      icon: "🔢",
      description: "Minimalist counter with live value slider and zero reset.",
      permissions: [],
      connectors: [],
      tool: {
        // Fit assumption: 2x1 gives 2 cols and 120px height, perfectly fitting the stat number and controls
        size: "2x1",
        requires: [],
      },
      data: { collections: [] },
      screens: [
        {
          id: "main",
          title: "Counter",
          nodes: [
            {
              id: "count",
              type: "stat",
              props: {
                label: "Count",
                value: 0,
              },
              bind: "count",
            },
            {
              id: "count_slider",
              type: "slider",
              props: {
                label: "Adjust Count",
                min: 0,
                max: 100,
                step: 1,
                default_value: 0,
                save_to: "count",
              },
            },
            {
              id: "reset_btn",
              type: "button",
              props: {
                label: "Reset",
                variant: "ghost",
              },
              on_click: "a_reset",
            },
          ],
        },
      ],
      actions: [
        {
          id: "a_reset",
          kind: "local_compute",
          operation: "subtract",
          input_from: ["count", "count"],
          render_result_into: "count",
          credit_cost_class: "runtime_llm",
        },
      ],
    },
  },
];

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2)
  );
}

function cloneManifest(m: ManifestV2Like): ManifestV2Like {
  return structuredClone(m);
}

export class KeywordTemplateMatcher implements TemplateMatcher {
  private readonly minScore: number;

  constructor(minScore = 0.25) {
    this.minScore = minScore;
  }

  findBestMatch(
    prompt: string,
    extraTemplates: StarterTemplate[] = []
  ): Promise<TemplateMatch | null> {
    const lower = prompt.toLowerCase();
    const promptTokens = tokenize(prompt);
    if (promptTokens.size === 0) return Promise.resolve(null);

    const pool: readonly StarterTemplate[] = [...extraTemplates, ...STARTER_TEMPLATES];
    let best: TemplateMatch | null = null;

    for (const tpl of pool) {
      let score = 0;
      const matchedTags: string[] = [];

      for (const phrase of tpl.keywords) {
        if (lower.includes(phrase.toLowerCase())) {
          score += 0.45;
          matchedTags.push(phrase);
        }
      }

      for (const tag of tpl.tags) {
        const tagLower = tag.toLowerCase();
        if (promptTokens.has(tagLower) || lower.includes(tagLower)) {
          score += 0.25;
          if (!matchedTags.includes(tag)) matchedTags.push(tag);
        }
      }

      const capped = Math.min(1, Number(score.toFixed(2)));
      if (capped >= this.minScore && (!best || capped > best.score)) {
        best = {
          templateId: tpl.id,
          slug: tpl.slug,
          name: tpl.name,
          score: capped,
          matchedTags,
          manifest: cloneManifest(tpl.manifest),
        };
      }
    }

    return Promise.resolve(best);
  }
}

