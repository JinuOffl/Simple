import type {
  DryRunReport,
  ManifestActionLike,
  ManifestNodeLike,
  ManifestV2Like,
} from "./types.ts";
import { ALLOWLISTED_APIS, VALID_LOCAL_OPERATIONS } from "./registrySpec.ts";

/**
 * Extract all `{{varName}}` placeholders referenced in a string or parameter map.
 */
function extractPlaceholders(input: unknown, out: Set<string>): void {
  if (typeof input === "string") {
    const regex = /\{\{([a-zA-Z0-9_.-]+)\}\}/g;
    let match = regex.exec(input);
    while (match !== null) {
      if (match[1]) out.add(match[1].trim());
      match = regex.exec(input);
    }
    return;
  }
  if (Array.isArray(input)) {
    for (const item of input) extractPlaceholders(item, out);
    return;
  }
  if (input && typeof input === "object") {
    for (const val of Object.values(input)) extractPlaceholders(val, out);
  }
}

function collectDeclaredStateKeys(manifest: ManifestV2Like): Set<string> {
  const keys = new Set<string>();
  for (const screen of manifest.screens) {
    for (const node of screen.nodes) {
      keys.add(node.id);
      if (node.bind) keys.add(node.bind);
      const saveTo = node.props?.save_to;
      if (typeof saveTo === "string" && saveTo.trim().length > 0) {
        keys.add(saveTo.trim());
      }
      const source = node.props?.source;
      if (typeof source === "string" && source.trim().length > 0) {
        keys.add(source.trim());
      }
      if (node.type === "form" && Array.isArray(node.props?.fields)) {
        for (const f of node.props.fields) {
          if (f && typeof f === "object" && typeof (f as { name?: unknown }).name === "string") {
            keys.add((f as { name: string }).name);
          }
        }
      }
    }
  }
  for (const col of manifest.data.collections) {
    for (const field of col.fields) {
      keys.add(field.name);
    }
  }
  return keys;
}

function checkNavigateTargets(
  manifest: ManifestV2Like,
  nodeMap: Map<string, ManifestNodeLike>,
  action: ManifestActionLike,
  sourceScreenId: string,
  screenIds: Set<string>,
  errors: string[],
  warnings: string[],
  queue: string[]
): void {
  const target =
    typeof action.prompt_template === "string" && action.prompt_template.trim().length > 0
      ? action.prompt_template.trim()
      : typeof action.params?.target === "string"
        ? action.params.target.trim()
        : "";

  if (!target) {
    errors.push(`DRY_RUN: navigate action "${action.id}" has no target screen ID.`);
    return;
  }

  // External/route targets like "/" are allowed only for root nav; internal targets must exist
  if (!target.startsWith("/")) {
    if (!screenIds.has(target)) {
      errors.push(
        `DRY_RUN: navigate action "${action.id}" targets non-existent screen "${target}".`
      );
      return;
    }
    if (target === sourceScreenId) {
      warnings.push(
        `DRY_RUN: navigate action "${action.id}" points to the same screen "${sourceScreenId}".`
      );
    }
    queue.push(target);
  }

  if (action.render_result_into && !nodeMap.has(action.render_result_into)) {
    errors.push(
      `DRY_RUN: action "${action.id}" references missing render_result_into "${action.render_result_into}".`
    );
  }
  void manifest;
}

/**
 * Simulated dry-run pass over a validated manifest.
 * Makes ZERO real network requests and NEVER executes user code.
 */
export function runManifestDryRun(
  manifest: ManifestV2Like,
  options?: { isCreate?: boolean }
): DryRunReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!manifest.screens || manifest.screens.length === 0) {
    return {
      pass: false,
      errors: ["DRY_RUN: Manifest has zero screens."],
      warnings: [],
      visitedScreens: [],
      exercisedActions: [],
    };
  }

  if (options?.isCreate) {
    if (manifest.screens.length !== 1) {
      errors.push(`DRY_RUN: New tool must have exactly 1 screen (got ${manifest.screens.length}).`);
    } else if (manifest.screens[0]!.nodes.length > 4) {
      errors.push(
        `DRY_RUN: New tool must have at most 4 nodes on its screen (got ${manifest.screens[0]!.nodes.length}).`
      );
    }
  }

  const screenMap = new Map(manifest.screens.map((s) => [s.id, s] as const));
  const screenIds = new Set(screenMap.keys());
  const nodeMap = new Map<string, ManifestNodeLike>();
  const actionMap = new Map(manifest.actions.map((a) => [a.id, a] as const));
  const collectionNames = new Set(manifest.data.collections.map((c) => c.name));
  const connectorTools = new Map(
    manifest.connectors.map((c) => [c.connector_id, new Set(c.tools)] as const)
  );
  const stateKeys = collectDeclaredStateKeys(manifest);

  for (const screen of manifest.screens) {
    for (const node of screen.nodes) {
      nodeMap.set(node.id, node);
    }
  }

  // Traverse reachable screens starting from entry screen (screens[0])
  const visitedScreens = new Set<string>();
  const exercisedActions = new Set<string>();
  const queue: string[] = [manifest.screens[0]!.id];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visitedScreens.has(currentId)) continue;
    visitedScreens.add(currentId);

    const screen = screenMap.get(currentId);
    if (!screen) continue;

    if (screen.nodes.length === 0) {
      warnings.push(`DRY_RUN: Screen "${screen.id}" has no UI nodes.`);
    }

    for (const node of screen.nodes) {
      if (node.type === "tabs" && Array.isArray(node.props?.tabs)) {
        for (const tab of node.props.tabs) {
          if (tab && typeof tab === "object" && typeof (tab as { screen_id?: unknown }).screen_id === "string") {
            const tabTarget = (tab as { screen_id: string }).screen_id;
            if (!screenIds.has(tabTarget)) {
              errors.push(
                `DRY_RUN: tabs node "${node.id}" references missing screen_id "${tabTarget}".`
              );
            } else {
              queue.push(tabTarget);
            }
          }
        }
      }

      if (node.type === "conversation_loop") {
        const persona = node.props?.persona_prompt;
        if (typeof persona !== "string" || persona.trim().length === 0) {
          errors.push(`DRY_RUN: conversation_loop node "${node.id}" missing persona_prompt.`);
        }
        const linkedActionId =
          typeof node.props?.actionId === "string" ? node.props.actionId : node.id;
        if (actionMap.has(linkedActionId)) {
          exercisedActions.add(linkedActionId);
        }
      }

      if (node.on_click) {
        const action = actionMap.get(node.on_click);
        if (!action) {
          errors.push(
            `DRY_RUN: Node "${node.id}" references missing on_click action "${node.on_click}".`
          );
          continue;
        }
        exercisedActions.add(action.id);
        if (action.kind === "navigate") {
          checkNavigateTargets(
            manifest,
            nodeMap,
            action,
            screen.id,
            screenIds,
            errors,
            warnings,
            queue
          );
        }
      }
    }
  }

  for (const screen of manifest.screens) {
    if (!visitedScreens.has(screen.id)) {
      warnings.push(
        `DRY_RUN: Screen "${screen.id}" is unreachable from entry screen "${manifest.screens[0]!.id}".`
      );
    }
  }

  // Dry-simulate every action contract
  for (const action of manifest.actions) {
    if (action.render_result_into && !nodeMap.has(action.render_result_into)) {
      errors.push(
        `DRY_RUN: Action "${action.id}" targets missing node "${action.render_result_into}".`
      );
    }

    for (const inputKey of action.input_from ?? []) {
      if (!stateKeys.has(inputKey)) {
        warnings.push(
          `DRY_RUN: Action "${action.id}" references input_from "${inputKey}" not found in node ids/bind/save_to.`
        );
      }
    }

    const placeholders = new Set<string>();
    if (action.prompt_template) extractPlaceholders(action.prompt_template, placeholders);
    if (action.params) extractPlaceholders(action.params, placeholders);
    for (const ph of placeholders) {
      const inInputs = (action.input_from ?? []).includes(ph);
      if (!stateKeys.has(ph) && !inInputs) {
        warnings.push(
          `DRY_RUN: Action "${action.id}" uses template variable "{{${ph}}}" without matching input_from/bind/save_to key.`
        );
      }
    }

    switch (action.kind) {
      case "api_fetch": {
        const apiName = action.api ?? "";
        if (!apiName || !(apiName in ALLOWLISTED_APIS)) {
          errors.push(
            `DRY_RUN: api_fetch action "${action.id}" uses non-allowlisted api "${apiName}".`
          );
        }
        if (!action.render_result_into) {
          errors.push(`DRY_RUN: api_fetch action "${action.id}" missing render_result_into.`);
        }
        break;
      }
      case "mcp_call": {
        const connId = action.connector_id ?? "";
        const toolName = action.tool_name ?? "";
        const allowed = connectorTools.get(connId);
        if (!allowed) {
          errors.push(
            `DRY_RUN: mcp_call action "${action.id}" missing declared connector "${connId}".`
          );
        } else if (!allowed.has(toolName)) {
          errors.push(
            `DRY_RUN: mcp_call action "${action.id}" tool "${toolName}" not in connector allowlist.`
          );
        }
        // Prompt-injection / SSRF sanity check in generated params
        if (action.params && JSON.stringify(action.params).match(/https?:\/\/(127\.|localhost|169\.254\.)/i)) {
          errors.push(
            `DRY_RUN: mcp_call action "${action.id}" contains forbidden internal URL parameter.`
          );
        }
        break;
      }
      case "llm_call": {
        if (!action.prompt_template || action.prompt_template.trim().length === 0) {
          errors.push(`DRY_RUN: llm_call action "${action.id}" requires non-empty prompt_template.`);
        }
        if (!action.render_result_into) {
          errors.push(`DRY_RUN: llm_call action "${action.id}" missing render_result_into.`);
        }
        break;
      }
      case "local_compute": {
        if (!action.operation || !VALID_LOCAL_OPERATIONS.has(action.operation)) {
          errors.push(
            `DRY_RUN: local_compute action "${action.id}" uses unknown operation "${action.operation ?? ""}".`
          );
        }
        if (!action.render_result_into) {
          errors.push(`DRY_RUN: local_compute action "${action.id}" missing render_result_into.`);
        }
        break;
      }
      case "save_data": {
        if (!action.input_from || action.input_from.length === 0) {
          errors.push(`DRY_RUN: save_data action "${action.id}" requires non-empty input_from.`);
        }
        break;
      }
      case "record_insert":
      case "record_update": {
        if (!action.collection || !collectionNames.has(action.collection)) {
          errors.push(
            `DRY_RUN: ${action.kind} action "${action.id}" references undefined collection "${action.collection ?? ""}".`
          );
        }
        break;
      }
      case "conversation_loop": {
        if (!action.persona_prompt || action.persona_prompt.trim().length === 0) {
          errors.push(
            `DRY_RUN: conversation_loop action "${action.id}" requires non-empty persona_prompt.`
          );
        }
        break;
      }
      case "navigate":
        break;
      default:
        errors.push(`DRY_RUN: unknown action kind "${String(action.kind)}".`);
    }
  }

  return {
    pass: errors.length === 0,
    errors,
    warnings,
    visitedScreens: [...visitedScreens],
    exercisedActions: [...exercisedActions],
  };
}

