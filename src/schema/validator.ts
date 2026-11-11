import { ManifestV2Schema } from "./manifest.v2";
import type { ManifestV2 } from "./manifest.v2";

// Import the component registry for permission validation.
// The registry is built by the registry worker; this import is valid once
// src/registry/index.ts exists. If you need to use the validator before the
// registry is ready, mock COMPONENT_REGISTRY as [] in tests.
import { COMPONENT_REGISTRY } from "../registry/index";

export type ValidationResult =
  | { kind: "valid"; manifest: ManifestV2 }
  | { kind: "invalid"; errors: string[] }
  | { kind: "truncated"; reason: string };

/**
 * Full manifest validator. Runs:
 * 1. Zod schema check (ManifestV2Schema)
 * 2. Unique IDs: no duplicate node ids across all screens, no duplicate action ids
 * 3. Referential integrity:
 *    - Every node.on_click references an existing action id
 *    - Every action.render_result_into references an existing node id (across all screens)
 *    - Every action.bind (if added in future) references an existing node id
 * 4. Declared permissions == permissions required by used component types
 *    (use requiredPermissions from registry — COMPONENT_REGISTRY)
 * 5. Every mcp_call action: connector_id must be in manifest.connectors[].connector_id,
 *    tool_name must be in that connector's tools[]
 *
 * Returns typed ValidationResult, never throws.
 */
export function validateManifestV2(raw: unknown): ValidationResult {
  // ── 1. Zod schema check ────────────────────────────────────────────────────
  const parsed = ManifestV2Schema.safeParse(raw);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) =>
      issue.path.length > 0
        ? `[${issue.path.join(".")}] ${issue.message}`
        : issue.message
    );
    return { kind: "invalid", errors };
  }

  const manifest: ManifestV2 = parsed.data;
  const errors: string[] = [];

  // ── Collect all node ids across all screens ────────────────────────────────
  const allNodeIds: string[] = manifest.screens.flatMap((screen) =>
    screen.nodes.map((node) => node.id)
  );
  const allNodeIdSet = new Set<string>();

  // ── 2a. Unique node ids ────────────────────────────────────────────────────
  for (const nodeId of allNodeIds) {
    if (allNodeIdSet.has(nodeId)) {
      errors.push(`Duplicate node id: "${nodeId}"`);
    } else {
      allNodeIdSet.add(nodeId);
    }
  }

  // ── 2b. Unique action ids ──────────────────────────────────────────────────
  const actionIdSet = new Set<string>();
  for (const action of manifest.actions) {
    if (actionIdSet.has(action.id)) {
      errors.push(`Duplicate action id: "${action.id}"`);
    } else {
      actionIdSet.add(action.id);
    }
  }

  // ── 3. Referential integrity ───────────────────────────────────────────────

  // 3a. Every node.on_click must reference an existing action id
  for (const screen of manifest.screens) {
    for (const node of screen.nodes) {
      if (node.on_click !== undefined && !actionIdSet.has(node.on_click)) {
        errors.push(
          `Node "${node.id}" on_click references unknown action id: "${node.on_click}"`
        );
      }
    }
  }

  // 3b. Every action.render_result_into must reference an existing node id
  for (const action of manifest.actions) {
    if (
      action.render_result_into !== undefined &&
      !allNodeIdSet.has(action.render_result_into)
    ) {
      errors.push(
        `Action "${action.id}" render_result_into references unknown node id: "${action.render_result_into}"`
      );
    }
  }

  // 3c. Every action.bind (node.bind is on nodes, not actions; check node.bind
  //     references an existing key — bind is a data-binding key, not a node id,
  //     so we skip cross-referencing it. Per spec: only on_click and
  //     render_result_into require cross-referencing.)

  // ── 4. Permission validation ───────────────────────────────────────────────
  // Collect the set of node types used in this manifest
  const usedNodeTypes = new Set<string>(
    manifest.screens.flatMap((screen) => screen.nodes.map((node) => node.type))
  );

  // Determine permissions required by those node types from the registry
  const requiredPermissions = new Set<string>();
  for (const entry of COMPONENT_REGISTRY) {
    if (usedNodeTypes.has(entry.type)) {
      for (const perm of entry.requiredPermissions) {
        requiredPermissions.add(perm);
      }
    }
  }

  const declaredPermissions = new Set<string>(manifest.permissions);

  // Check: every required permission must be declared
  for (const perm of requiredPermissions) {
    if (!declaredPermissions.has(perm)) {
      errors.push(
        `Permission "${perm}" is required by a component but is not declared in manifest.permissions`
      );
    }
  }

  // Check: every declared permission must actually be required (no over-declaration)
  for (const perm of declaredPermissions) {
    if (!requiredPermissions.has(perm)) {
      errors.push(
        `Permission "${perm}" is declared but not required by any component in this manifest`
      );
    }
  }

  // ── 5. MCP connector validation ────────────────────────────────────────────
  // Build a map of connector_id → tools[] from the manifest's connectors array
  const connectorToolMap = new Map<string, Set<string>>();
  for (const connector of manifest.connectors) {
    const existing = connectorToolMap.get(connector.connector_id);
    if (existing) {
      for (const tool of connector.tools) {
        existing.add(tool);
      }
    } else {
      connectorToolMap.set(connector.connector_id, new Set(connector.tools));
    }
  }

  for (const action of manifest.actions) {
    if (action.kind === "mcp_call") {
      if (action.connector_id === undefined || action.connector_id === "") {
        errors.push(`Action "${action.id}" (mcp_call) is missing connector_id`);
        continue;
      }
      const tools = connectorToolMap.get(action.connector_id);
      if (tools === undefined) {
        errors.push(
          `Action "${action.id}" (mcp_call) references unknown connector_id: "${action.connector_id}"`
        );
        continue;
      }
      if (action.tool_name === undefined || action.tool_name === "") {
        errors.push(`Action "${action.id}" (mcp_call) is missing tool_name`);
        continue;
      }
      if (!tools.has(action.tool_name)) {
        errors.push(
          `Action "${action.id}" (mcp_call) references tool "${action.tool_name}" which is not ` +
          `listed in connector "${action.connector_id}".tools`
        );
      }
    }
  }

  // ── Return result ──────────────────────────────────────────────────────────
  if (errors.length > 0) {
    return { kind: "invalid", errors };
  }
  return { kind: "valid", manifest };
}
