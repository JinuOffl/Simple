import type { Permission } from "./types.ts";

/**
 * Pure registry & capability metadata shared by the generation orchestrator
 * in both Deno Edge Functions and Node/Vite tests.
 *
 * Parity with `src/registry/index.ts` is enforced by `src/orchestrator/registryParity.test.ts`.
 */

export interface RegistryCapabilityMeta {
  readonly type: string;
  readonly requiredPermissions: readonly Permission[];
  readonly isStub: boolean;
  readonly allowedPropKeys: readonly string[];
  readonly summary: string;
  readonly exampleProps: Record<string, unknown>;
}

export const REGISTRY_CAPABILITY_META: readonly RegistryCapabilityMeta[] = [
  {
    type: "text",
    requiredPermissions: [],
    isStub: false,
    allowedPropKeys: ["content", "className"],
    summary: "Display a plain paragraph of text; supports `bind` for dynamic output.",
    exampleProps: { content: "Welcome!" },
  },
  {
    type: "card",
    requiredPermissions: [],
    isStub: false,
    allowedPropKeys: ["title", "body"],
    summary: "Labeled info block with title and body; ideal `render_result_into` target.",
    exampleProps: { title: "Result", body: "Ready" },
  },
  {
    type: "button",
    requiredPermissions: [],
    isStub: false,
    allowedPropKeys: ["label", "loading", "disabled", "variant"],
    summary: "Tappable button (`label` required; `variant` primary|ghost) with `on_click` action.",
    exampleProps: { label: "Run", variant: "primary" },
  },
  {
    type: "checklist",
    requiredPermissions: [],
    isStub: false,
    allowedPropKeys: ["items"],
    summary: "Interactive checkbox task list (`items`: string[]) with progress bar.",
    exampleProps: { items: ["Task 1", "Task 2"] },
  },
  {
    type: "calculator",
    requiredPermissions: [],
    isStub: false,
    allowedPropKeys: [],
    summary: "Self-contained arithmetic calculator (`props: {}`).",
    exampleProps: {},
  },
  {
    type: "clock",
    requiredPermissions: [],
    isStub: false,
    allowedPropKeys: ["timezone", "format", "label"],
    summary: "Live ticking clock (`timezone`, `format` 12h|24h, `label`).",
    exampleProps: { timezone: "Asia/Tokyo", format: "24h", label: "Tokyo" },
  },
  {
    type: "image_capture",
    requiredPermissions: ["camera"],
    isStub: false,
    allowedPropKeys: ["label", "save_to"],
    summary: "Camera photo capture (`label` required, optional `save_to` key). Needs `camera`.",
    exampleProps: { label: "Take Photo", save_to: "photo" },
  },
  {
    type: "image_gallery",
    requiredPermissions: [],
    isStub: false,
    allowedPropKeys: ["images", "source"],
    summary: "Horizontal scrollable gallery (`images` array or `source` app state key).",
    exampleProps: { source: "photos" },
  },
  {
    type: "mic_recorder",
    requiredPermissions: ["microphone"],
    isStub: false,
    allowedPropKeys: ["label", "save_to"],
    summary: "Voice transcript input (`label` required, `save_to` key). Needs `microphone`.",
    exampleProps: { label: "Speak note", save_to: "note_text" },
  },
  {
    type: "mcq_quiz",
    requiredPermissions: [],
    isStub: false,
    allowedPropKeys: ["questions"],
    summary: "Scored multiple-choice quiz (`questions: [{ question, options, correct_index }]`).",
    exampleProps: {
      questions: [{ question: "2 + 2?", options: ["3", "4"], correct_index: 1 }],
    },
  },
  {
    type: "chat_bubble",
    requiredPermissions: [],
    isStub: false,
    allowedPropKeys: ["role", "content"],
    summary: "Single static chat bubble (`role`: user|assistant, `content`).",
    exampleProps: { role: "assistant", content: "Hello!" },
  },
  {
    type: "conversation_loop",
    requiredPermissions: ["microphone"],
    isStub: false,
    allowedPropKeys: ["persona_prompt", "actionId", "appId"],
    summary: "Multi-turn AI chat (`persona_prompt` required). Requires `microphone` permission.",
    exampleProps: { persona_prompt: "You are a concise tutor.", actionId: "chat_action" },
  },
  {
    type: "toggle",
    requiredPermissions: [],
    isStub: false,
    allowedPropKeys: ["label", "default_value", "save_to"],
    summary: "On/off switch (`label`, `default_value`, `save_to`) often paired with `on_click`.",
    exampleProps: { label: "Light", default_value: false, save_to: "light_state" },
  },
  // Expanded components implemented in Phase 5
  {
    type: "markdown",
    requiredPermissions: [],
    isStub: false,
    allowedPropKeys: ["content"],
    summary: "Rich formatted markdown block (`content`).",
    exampleProps: { content: "## Summary" },
  },
  {
    type: "list",
    requiredPermissions: [],
    isStub: false,
    allowedPropKeys: ["items", "ordered"],
    summary: "Styled bulleted or numbered list (`items`, `ordered`).",
    exampleProps: { items: ["First", "Second"], ordered: false },
  },
  {
    type: "table",
    requiredPermissions: [],
    isStub: false,
    allowedPropKeys: ["columns", "rows"],
    summary: "Tabular grid (`columns`: string[], `rows`: string[][]).",
    exampleProps: { columns: ["Item", "Value"], rows: [["A", "1"]] },
  },
  {
    type: "form",
    requiredPermissions: [],
    isStub: false,
    allowedPropKeys: ["fields", "submit_label"],
    summary: "Structured input form (`fields`, `submit_label`).",
    exampleProps: {
      fields: [{ name: "note", label: "Note", type: "text", required: true }],
      submit_label: "Save",
    },
  },
  {
    type: "chart",
    requiredPermissions: [],
    isStub: false,
    allowedPropKeys: ["chart_type", "labels", "datasets", "title"],
    summary: "Data chart (`chart_type` bar|line|pie, `labels`, `datasets`).",
    exampleProps: {
      chart_type: "bar",
      labels: ["Mon", "Tue"],
      datasets: [{ label: "Count", data: [3, 5] }],
    },
  },
  {
    type: "stat",
    requiredPermissions: [],
    isStub: false,
    allowedPropKeys: ["label", "value", "unit", "description"],
    summary: "Large KPI metric tile (`label`, `value`, `unit`, `description`).",
    exampleProps: { label: "Total", value: 42, unit: "items" },
  },
  {
    type: "slider",
    requiredPermissions: [],
    isStub: false,
    allowedPropKeys: ["label", "min", "max", "step", "default_value", "save_to"],
    summary: "Numeric range slider (`min`, `max`, `step`, `default_value`, `save_to`).",
    exampleProps: { label: "Level", min: 0, max: 100, step: 5, default_value: 50, save_to: "level" },
  },
  {
    type: "timer",
    requiredPermissions: [],
    isStub: false,
    allowedPropKeys: ["duration_seconds", "label", "auto_start"],
    summary: "Countdown timer (`duration_seconds`, `label`, `auto_start`).",
    exampleProps: { duration_seconds: 300, label: "Focus", auto_start: false },
  },
  {
    type: "tabs",
    requiredPermissions: [],
    isStub: false,
    allowedPropKeys: ["tabs", "default_tab"],
    summary: "Screen tab switcher (`tabs: [{ label, screen_id }]`, `default_tab`).",
    exampleProps: { tabs: [{ label: "Home", screen_id: "main" }], default_tab: "main" },
  },
  {
    type: "chat_thread",
    requiredPermissions: [],
    isStub: false,
    allowedPropKeys: ["persona_prompt", "initial_message", "placeholder"],
    summary: "Persistent multi-turn chat thread (`persona_prompt`, `initial_message`, `placeholder`).",
    exampleProps: { persona_prompt: "You are helpful.", initial_message: "Hi!" },
  },
];

export const REGISTRY_BY_TYPE = new Map(
  REGISTRY_CAPABILITY_META.map((entry) => [entry.type, entry] as const)
);

export const ALLOWLISTED_APIS: Readonly<
  Record<string, { description: string; params: readonly string[] }>
> = {
  weather: {
    description: "Open-Meteo weather forecast by city",
    params: ["city"],
  },
  currency: {
    description: "Live currency exchange conversion",
    params: ["from", "to", "amount"],
  },
  timezone: {
    description: "Current local time & date for an IANA timezone",
    params: ["timezone"],
  },
  dictionary: {
    description: "English word definition and phonetics",
    params: ["word"],
  },
  country: {
    description: "Country capital, population, currencies, languages",
    params: ["name"],
  },
  trivia: {
    description: "Interesting math/number trivia fact",
    params: ["number", "type"],
  },
};

export interface KnownMcpConnectorProfile {
  readonly connector_id: string;
  readonly tools: readonly string[];
  readonly keywords: readonly string[];
  readonly summary: string;
}

export const KNOWN_MCP_CONNECTORS: readonly KnownMcpConnectorProfile[] = [
  {
    connector_id: "home_assistant",
    tools: ["light.toggle", "light.turn_on", "light.turn_off", "light.get_state", "climate.set_temperature"],
    keywords: ["home assistant", "smart home", "living room light", "bedroom light", "thermostat", "lamp"],
    summary: "Smart home device control via Home Assistant MCP server",
  },
  {
    connector_id: "fake_home_assistant",
    tools: ["light.toggle", "light.get_state"],
    keywords: ["fake home assistant", "demo mcp light", "living room toggle"],
    summary: "Local fake Home Assistant demo MCP server",
  },
  {
    connector_id: "calendar",
    tools: ["calendar.list_events", "calendar.create_event"],
    keywords: ["google calendar", "calendar mcp", "my calendar", "schedule meeting", "upcoming events"],
    summary: "Calendar MCP connector for reading/creating events",
  },
  {
    connector_id: "notion",
    tools: ["notion.search", "notion.create_page", "notion.append_block"],
    keywords: ["notion"],
    summary: "Notion workspace MCP connector",
  },
  {
    connector_id: "github",
    tools: ["github.list_issues", "github.create_issue", "github.list_prs"],
    keywords: ["github issues", "github repo", "pull requests"],
    summary: "GitHub MCP connector",
  },
];

export const VALID_PERMISSIONS: ReadonlySet<Permission> = new Set([
  "camera",
  "microphone",
  "location",
  "contacts",
  "notifications",
]);

export const VALID_LOCAL_OPERATIONS: ReadonlySet<string> = new Set([
  "add",
  "subtract",
  "multiply",
  "divide",
  "concat",
  "count",
  "get_current_time",
  "format_date",
]);

export function buildRegistryCapabilityPrompt(includeStubs = false): string {
  const entries = includeStubs
    ? REGISTRY_CAPABILITY_META
    : REGISTRY_CAPABILITY_META.filter((entry) => !entry.isStub);

  const componentLines = entries.map((entry) => {
    const perms =
      entry.requiredPermissions.length > 0
        ? ` | permissions: [${entry.requiredPermissions.join(", ")}]`
        : "";
    const props = entry.allowedPropKeys.length > 0 ? entry.allowedPropKeys.join(", ") : "(none)";
    return `- ${entry.type}: ${entry.summary} | props: ${props}${perms} | example: ${JSON.stringify(entry.exampleProps)}`;
  });

  const apiLines = Object.entries(ALLOWLISTED_APIS).map(
    ([api, info]) => `- api="${api}": ${info.description} | params: [${info.params.join(", ")}]`
  );

  const connectorLines = KNOWN_MCP_CONNECTORS.map(
    (c) => `- connector_id="${c.connector_id}": tools=[${c.tools.join(", ")}]`
  );

  return [
    "SUPPORTED UI COMPONENTS (only use these types; props must ONLY contain listed allowed keys):",
    ...componentLines,
    "",
    "ALLOWLISTED api_fetch APIS:",
    ...apiLines,
    "",
    "KNOWN MCP CONNECTORS (declare used connectors in manifest.connectors):",
    ...connectorLines,
  ].join("\n");
}

