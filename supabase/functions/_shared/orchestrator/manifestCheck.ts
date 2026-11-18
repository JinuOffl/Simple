import type {
  ManifestActionLike,
  ManifestNodeLike,
  ManifestV2Like,
  Permission,
  ValidationResult,
} from "./types.ts";
import { REGISTRY_BY_TYPE, VALID_PERMISSIONS } from "./registrySpec.ts";

const VALID_ACTION_KINDS = new Set([
  "llm_call",
  "local_compute",
  "api_fetch",
  "mcp_call",
  "navigate",
  "save_data",
  "record_insert",
  "record_update",
  "conversation_loop",
]);

const VALID_TOOL_SIZES = new Set(["1x1", "2x1", "2x2", "4x2"]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Pure structural, referential, permission, and safety validator for Manifest v2.
 * Used as the built-in validator in dependency-free contexts AND layered alongside
 * full Zod `ManifestV2Schema` checks via injected `validateManifest`.
 */
export function validateManifestPure(raw: unknown): ValidationResult {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.length === 0 || (!trimmed.endsWith("}") && !trimmed.endsWith("]"))) {
      return { kind: "truncated", reason: "Model output appears truncated (incomplete JSON)." };
    }
    try {
      raw = JSON.parse(trimmed);
    } catch (err) {
      return {
        kind: "invalid",
        errors: [`Invalid JSON syntax: ${err instanceof Error ? err.message : String(err)}`],
      };
    }
  }

  if (!isPlainObject(raw)) {
    return { kind: "invalid", errors: ["Manifest root must be a JSON object."] };
  }

  const errors: string[] = [];

  if (raw.schema_version !== 2) {
    errors.push(`schema_version must be 2 (got ${String(raw.schema_version)}).`);
  }
  if (typeof raw.app_id !== "string" || raw.app_id.trim().length === 0) {
    errors.push("app_id must be a non-empty string.");
  }
  if (typeof raw.name !== "string" || raw.name.trim().length === 0) {
    errors.push("name must be a non-empty string.");
  }
  if (typeof raw.icon !== "string" || raw.icon.trim().length === 0) {
    errors.push("icon must be a non-empty string.");
  }

  const permissions: Permission[] = [];
  if (!Array.isArray(raw.permissions)) {
    errors.push("permissions must be an array.");
  } else {
    for (const p of raw.permissions) {
      if (typeof p !== "string" || !VALID_PERMISSIONS.has(p as Permission)) {
        errors.push(`Unsupported permission: "${String(p)}".`);
      } else {
        permissions.push(p as Permission);
      }
    }
  }

  if (!Array.isArray(raw.connectors)) {
    errors.push("connectors must be an array.");
  }

  if (!isPlainObject(raw.data) || !Array.isArray(raw.data.collections)) {
    errors.push("data.collections must be an array.");
  }

  if (!Array.isArray(raw.screens) || raw.screens.length === 0) {
    errors.push("screens must be a non-empty array.");
  }

  if (!Array.isArray(raw.actions)) {
    errors.push("actions must be an array.");
  }

  if (raw.tool !== undefined) {
    if (!isPlainObject(raw.tool)) {
      errors.push("tool must be a plain object.");
    } else {
      const toolObj = raw.tool as Record<string, unknown>;
      if (
        toolObj.size !== undefined &&
        (typeof toolObj.size !== "string" || !VALID_TOOL_SIZES.has(toolObj.size))
      ) {
        errors.push(
          `tool.size must be one of "1x1", "2x1", "2x2", "4x2" (got ${JSON.stringify(toolObj.size)}).`
        );
      }
      if (toolObj.requires !== undefined) {
        if (!Array.isArray(toolObj.requires)) {
          errors.push("tool.requires must be an array.");
        } else {
          for (let i = 0; i < toolObj.requires.length; i++) {
            const req = toolObj.requires[i];
            if (!isPlainObject(req)) {
              errors.push(`tool.requires[${i}] must be a plain object.`);
              continue;
            }
            if (typeof req.key_id !== "string" || req.key_id.trim().length === 0) {
              errors.push(`tool.requires[${i}].key_id must be a non-empty string.`);
            }
            if (typeof req.label !== "string" || req.label.trim().length === 0) {
              errors.push(`tool.requires[${i}].label must be a non-empty string.`);
            }
            if (req.help_url !== undefined && typeof req.help_url !== "string") {
              errors.push(`tool.requires[${i}].help_url must be a string.`);
            }
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    return { kind: "invalid", errors };
  }

  const manifest = raw as unknown as ManifestV2Like;

  // Unique screen IDs and node IDs + node registry prop allowlists
  const seenScreenIds = new Set<string>();
  const allNodeIds = new Set<string>();
  const usedNodeTypes = new Set<string>();
  const allNodes: ManifestNodeLike[] = [];

  for (const screen of manifest.screens) {
    if (!screen || typeof screen.id !== "string" || screen.id.trim().length === 0) {
      errors.push("Every screen must have a non-empty string id.");
      continue;
    }
    if (typeof screen.title !== "string" || screen.title.trim().length === 0) {
      errors.push(`Screen "${screen.id}" must have a non-empty title.`);
    }
    if (seenScreenIds.has(screen.id)) {
      errors.push(`Duplicate screen id: "${screen.id}".`);
    }
    seenScreenIds.add(screen.id);

    if (!Array.isArray(screen.nodes)) {
      errors.push(`Screen "${screen.id}".nodes must be an array.`);
      continue;
    }

    for (const node of screen.nodes) {
      if (!node || typeof node.id !== "string" || node.id.trim().length === 0) {
        errors.push(`Node in screen "${screen.id}" is missing non-empty id.`);
        continue;
      }
      if (allNodeIds.has(node.id)) {
        errors.push(`Duplicate node id: "${node.id}".`);
      }
      allNodeIds.add(node.id);
      allNodes.push(node);

      const entry = REGISTRY_BY_TYPE.get(node.type);
      if (!entry) {
        errors.push(`Unknown component type "${node.type}" on node "${node.id}".`);
        continue;
      }
      usedNodeTypes.add(node.type);

      if (node.props !== undefined) {
        if (!isPlainObject(node.props)) {
          errors.push(`Node "${node.id}".props must be a plain object.`);
        } else {
          const allowed = new Set(entry.allowedPropKeys);
          for (const key of Object.keys(node.props)) {
            if (!allowed.has(key)) {
              errors.push(
                `Node "${node.id}" (type "${node.type}") has unexpected prop "${key}".`
              );
            }
          }
          // Check required props on critical components
          if (node.type === "button" && typeof node.props.label !== "string") {
            errors.push(`Button node "${node.id}" requires props.label (string).`);
          }
          if (node.type === "checklist" && !Array.isArray(node.props.items)) {
            errors.push(`Checklist node "${node.id}" requires props.items (string[]).`);
          }
          if (node.type === "mcq_quiz" && !Array.isArray(node.props.questions)) {
            errors.push(`mcq_quiz node "${node.id}" requires props.questions.`);
          }
          if (
            node.type === "conversation_loop" &&
            typeof node.props.persona_prompt !== "string"
          ) {
            errors.push(
              `conversation_loop node "${node.id}" requires props.persona_prompt (string).`
            );
          }
          if (
            (node.type === "image_capture" || node.type === "mic_recorder") &&
            typeof node.props.label !== "string"
          ) {
            errors.push(`${node.type} node "${node.id}" requires props.label (string).`);
          }
          if (
            node.type === "chat_bubble" &&
            (typeof node.props.content !== "string" ||
              (node.props.role !== "user" && node.props.role !== "assistant"))
          ) {
            errors.push(
              `chat_bubble node "${node.id}" requires props.role ("user"|"assistant") and props.content.`
            );
          }
        }
      } else if (
        node.type === "button" ||
        node.type === "checklist" ||
        node.type === "mcq_quiz" ||
        node.type === "conversation_loop" ||
        node.type === "image_capture" ||
        node.type === "mic_recorder" ||
        node.type === "chat_bubble"
      ) {
        errors.push(`Node "${node.id}" (type "${node.type}") is missing required props.`);
      }
    }
  }

  // Unique action IDs + referential integrity
  const allActionIds = new Set<string>();
  const actionList: ManifestActionLike[] = manifest.actions;
  for (const action of actionList) {
    if (!action || typeof action.id !== "string" || action.id.trim().length === 0) {
      errors.push("Every action must have a non-empty string id.");
      continue;
    }
    if (allActionIds.has(action.id)) {
      errors.push(`Duplicate action id: "${action.id}".`);
    }
    allActionIds.add(action.id);

    if (!VALID_ACTION_KINDS.has(action.kind)) {
      errors.push(`Action "${action.id}" has unsupported kind "${String(action.kind)}".`);
    }
    if (action.render_result_into !== undefined && !allNodeIds.has(action.render_result_into)) {
      errors.push(
        `Action "${action.id}" references non-existent render_result_into: "${action.render_result_into}".`
      );
    }
  }

  for (const node of allNodes) {
    if (node.on_click !== undefined && !allActionIds.has(node.on_click)) {
      errors.push(`Node "${node.id}" references non-existent action id: "${node.on_click}".`);
    }
  }

  // Permissions must exactly match required permissions of used components (no under/over declaration)
  const requiredPermissions = new Set<Permission>();
  for (const typeName of usedNodeTypes) {
    const entry = REGISTRY_BY_TYPE.get(typeName);
    if (entry) {
      for (const perm of entry.requiredPermissions) {
        requiredPermissions.add(perm);
      }
    }
  }
  const declaredPermissions = new Set<Permission>(permissions);
  for (const perm of requiredPermissions) {
    if (!declaredPermissions.has(perm)) {
      errors.push(
        `Permission "${perm}" is required by a component but is not declared in manifest.permissions.`
      );
    }
  }
  for (const perm of declaredPermissions) {
    if (!requiredPermissions.has(perm)) {
      errors.push(
        `Permission "${perm}" is declared but not required by any component in this manifest.`
      );
    }
  }

  // Connector allowlists
  const connectorToolMap = new Map<string, Set<string>>();
  for (const connector of manifest.connectors) {
    const existing = connectorToolMap.get(connector.connector_id);
    if (existing) {
      for (const tool of connector.tools) existing.add(tool);
    } else {
      connectorToolMap.set(connector.connector_id, new Set(connector.tools));
    }
  }

  for (const action of actionList) {
    if (action.kind === "mcp_call") {
      if (!action.connector_id) {
        errors.push(`Action "${action.id}" (mcp_call) is missing connector_id.`);
        continue;
      }
      const tools = connectorToolMap.get(action.connector_id);
      if (!tools) {
        errors.push(
          `Action "${action.id}" (mcp_call) references unknown connector_id: "${action.connector_id}".`
        );
        continue;
      }
      if (!action.tool_name) {
        errors.push(`Action "${action.id}" (mcp_call) is missing tool_name.`);
        continue;
      }
      if (!tools.has(action.tool_name)) {
        errors.push(
          `Action "${action.id}" (mcp_call) references tool "${action.tool_name}" not listed in connector "${action.connector_id}".tools.`
        );
      }
    }
  }

  if (errors.length > 0) {
    return { kind: "invalid", errors };
  }
  return { kind: "valid", manifest };
}

