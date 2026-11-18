import { z } from "zod";
import { buildRegistryNodeSchema } from "../registry/index";

// ── Permissions ────────────────────────────────────────────────────────────────
const PermissionSchema = z.enum(["camera", "microphone", "location", "contacts", "notifications", "bluetooth"]);

// ── Connector declaration (what this app is allowed to call) ───────────────────
const ConnectorSchema = z.object({
  connector_id: z.string(),
  tools: z.array(z.string()),
});

// ── Collection / data layer ────────────────────────────────────────────────────
const FieldTypeSchema = z.enum(["string", "number", "boolean", "date", "json", "image_ref"]);

const CollectionFieldSchema = z.object({
  name: z.string(),
  type: FieldTypeSchema,
});

const CollectionSchema = z.object({
  name: z.string(),
  shared: z.boolean().default(false),
  fields: z.array(CollectionFieldSchema),
});

// ── Action kinds (v2 adds mcp_call, record_insert, record_update, sandbox_fn) ──
const ActionKindSchema = z.enum([
  "llm_call",
  "local_compute",
  "api_fetch",
  "mcp_call",
  "navigate",
  "save_data",
  "record_insert",
  "record_update",
  "conversation_loop",
  "sandbox_fn",
]);

// ── Credit cost class — used by edge functions to meter usage ──────────────────
const CreditCostClassSchema = z.enum(["generation", "runtime_llm", "mcp_call", "api_fetch"]).optional();

const ActionSchema = z.object({
  id: z.string(),
  kind: ActionKindSchema,

  // ── llm_call ──────────────────────────────────────────────────────
  prompt_template: z.string().optional(),

  // ── conversation_loop ─────────────────────────────────────────────
  persona_prompt: z.string().optional(),

  // ── local_compute — typed operation enum ──────────────────────────
  operation: z.enum([
    "add", "subtract", "multiply", "divide",
    "concat", "count", "get_current_time", "format_date",
  ]).optional(),

  // ── api_fetch — server-side allowlisted API call ──────────────────
  api: z.enum([
    "weather", "currency", "timezone", "dictionary", "country", "trivia",
    "advice", "cat_fact", "openweather", "nasa_api",
  ]).optional(),

  // ── mcp_call ──────────────────────────────────────────────────────
  connector_id: z.string().optional(),
  tool_name: z.string().optional(),

  // ── record_insert / record_update ─────────────────────────────────
  collection: z.string().optional(),

  // ── shared ────────────────────────────────────────────────────────
  params: z.record(z.string(), z.unknown()).optional(),
  input_from: z.array(z.string()).optional(),
  render_result_into: z.string().optional(),
  output_key: z.string().optional(),
  credit_cost_class: CreditCostClassSchema,
});

// ── Node = a component instance in the manifest (derived from COMPONENT_REGISTRY)
export const NodeSchema = buildRegistryNodeSchema();

const ScreenSchema = z.object({
  id: z.string(),
  title: z.string(),
  nodes: z.array(NodeSchema),
});

// ── Tool meta (v2 addition for mobile tool builder) ───────────────────────────
export const ToolSizeSchema = z.enum(["1x1", "2x1", "2x2", "4x2"]);

export const ToolRequirementSchema = z.object({
  key_id: z.string(),
  label: z.string(),
  help_url: z.string().optional(),
});

export const ToolMetaSchema = z.object({
  size: ToolSizeSchema.default("2x1"),
  requires: z.array(ToolRequirementSchema).optional(),
});

export const ManifestV2Schema = z.object({
  schema_version: z.literal(2),
  app_id: z.string(),
  name: z.string(),
  icon: z.string(),
  description: z.string().optional(),
  permissions: z.array(PermissionSchema).default([]),
  connectors: z.array(ConnectorSchema).default([]),
  data: z.object({
    collections: z.array(CollectionSchema).default([]),
  }).default({ collections: [] }),
  screens: z.array(ScreenSchema),
  actions: z.array(ActionSchema).default([]),
  multiplayer: z.object({ enabled: z.boolean() }).optional(),
  tool: ToolMetaSchema.optional(),
});

export type ManifestV2 = z.infer<typeof ManifestV2Schema>;
export type ManifestV2Screen = z.infer<typeof ScreenSchema>;
export type ManifestV2Node = z.infer<typeof NodeSchema>;
export type ManifestV2Action = z.infer<typeof ActionSchema>;
export type ManifestV2Collection = z.infer<typeof CollectionSchema>;
export type ToolSize = z.infer<typeof ToolSizeSchema>;
export type ToolRequirement = z.infer<typeof ToolRequirementSchema>;
export type ToolMeta = z.infer<typeof ToolMetaSchema>;
