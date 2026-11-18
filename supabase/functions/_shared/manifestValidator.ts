import { z } from "npm:zod@^4.4.3";
import { validateManifestPure } from "./orchestrator/manifestCheck.ts";
import type { ValidationResult } from "./orchestrator/types.ts";

/**
 * Deno-compatible Zod v4 Manifest v2 validator layered on top of
 * `validateManifestPure` (without importing React `.tsx` components).
 */

const PermissionSchema = z.enum([
  "camera",
  "microphone",
  "location",
  "contacts",
  "notifications",
]);

const ConnectorSchema = z
  .object({
    connector_id: z.string().min(1),
    tools: z.array(z.string().min(1)),
  })
  .strict();

const CollectionFieldSchema = z
  .object({
    name: z.string().min(1),
    type: z.enum(["string", "number", "boolean", "date", "json", "image_ref"]),
    required: z.boolean().optional(),
  })
  .strict();

const CollectionSchema = z
  .object({
    name: z.string().min(1),
    shared: z.boolean().optional(),
    fields: z.array(CollectionFieldSchema),
  })
  .strict();

const NodeEnvelopeSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    props: z.record(z.string(), z.unknown()).optional(),
    bind: z.string().optional(),
    on_click: z.string().optional(),
  })
  .strict();

const ScreenSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    nodes: z.array(NodeEnvelopeSchema),
  })
  .strict();

const ActionSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum([
      "llm_call",
      "local_compute",
      "api_fetch",
      "mcp_call",
      "navigate",
      "save_data",
      "record_insert",
      "record_update",
      "conversation_loop",
    ]),
    prompt_template: z.string().optional(),
    persona_prompt: z.string().optional(),
    operation: z.string().optional(),
    api: z.string().optional(),
    params: z.record(z.string(), z.unknown()).optional(),
    connector_id: z.string().optional(),
    tool_name: z.string().optional(),
    collection: z.string().optional(),
    input_from: z.array(z.string()).optional(),
    render_result_into: z.string().optional(),
    output_key: z.string().optional(),
    credit_cost_class: z
      .enum([
        "local",
        "api_fetch",
        "mcp_call",
        "runtime_llm",
        "generation",
        "critique",
        "sandbox_exec",
      ])
      .optional(),
  })
  .strict();

const MultiplayerSchema = z
  .object({
    enabled: z.boolean(),
    default_role: z.enum(["editor", "viewer"]).optional(),
    shared_collections: z.array(z.string()).optional(),
  })
  .strict();

const ToolSizeSchema = z.enum(["1x1", "2x1", "2x2", "4x2"]);

const ToolRequirementSchema = z
  .object({
    key_id: z.string().min(1),
    label: z.string().min(1),
    help_url: z.string().optional(),
  })
  .strict();

const ToolSchema = z
  .object({
    size: ToolSizeSchema.default("2x1"),
    requires: z.array(ToolRequirementSchema).optional(),
  })
  .strict();

export const DenoManifestV2Schema = z
  .object({
    schema_version: z.literal(2),
    app_id: z.string().min(1),
    name: z.string().min(1),
    icon: z.string().min(1),
    description: z.string().optional(),
    permissions: z.array(PermissionSchema),
    connectors: z.array(ConnectorSchema),
    data: z
      .object({
        collections: z.array(CollectionSchema),
      })
      .strict(),
    screens: z.array(ScreenSchema).min(1),
    actions: z.array(ActionSchema),
    multiplayer: MultiplayerSchema.optional(),
    tool: ToolSchema.optional(),
  })
  .strict();

export function validateManifestDeno(raw: unknown): ValidationResult {
  const pure = validateManifestPure(raw);
  if (pure.kind !== "valid") return pure;

  const parsed = DenoManifestV2Schema.safeParse(pure.manifest);
  if (!parsed.success) {
    return {
      kind: "invalid",
      errors: parsed.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
        return `${path}: ${issue.message}`;
      }),
    };
  }

  return { kind: "valid", manifest: pure.manifest };
}

