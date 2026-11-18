import type { Manifest } from "./manifest.v1"; // v1 type
import type { ManifestV2 } from "./manifest.v2";

/**
 * Migrate a v1 manifest (no schema_version) to a v2 manifest.
 * Pure function — no side effects, no network, no DB.
 *
 * Migration rules:
 * - schema_version: 2
 * - app_id, name, icon: preserved
 * - description: undefined
 * - permissions: preserved; "notifications" is a new v2 enum value and was not
 *   present in v1 — no automatic injection, only carry over what was declared.
 *   (v1 permissions are a strict subset of v2 permissions so the cast is safe.)
 * - connectors: []
 * - data: { collections: [] }
 * - screens: wrap all v1 components into a single screen
 *     { id: "main", title: name, nodes: [...] }
 *   Each v1 component becomes a node verbatim (id, type, props, bind, on_click preserved).
 * - actions: preserved verbatim — v1 action kinds ("llm_call", "local_compute",
 *   "api_fetch", "navigate", "save_data", "conversation_loop") are all present
 *   in the v2 ActionKindSchema, so no mapping is required.
 *   Edge case: v1 ActionSchema has no output_key or credit_cost_class; those
 *   fields are simply absent (undefined) in the migrated actions, which is fine
 *   because they are optional in v2.
 * - multiplayer: undefined
 */
export function migrateV1toV2(v1: Manifest): ManifestV2 {
  // v1 permissions are ["camera" | "microphone" | "location" | "contacts"].
  // v2 adds "notifications", so v1 permissions are a strict subset of v2.
  const permissions: ManifestV2["permissions"] = [...(v1.permissions ?? [])];

  return {
    schema_version: 2,
    app_id: v1.app_id,
    name: v1.name,
    icon: v1.icon,
    description: undefined,
    permissions,
    connectors: [],
    data: { collections: [] },
    screens: [
      {
        id: "main",
        title: v1.name,
        nodes: (v1.components ?? []).map((component) => ({
          id: component.id,
          type: component.type,
          ...(component.props !== undefined ? { props: component.props } : {}),
          ...(component.bind !== undefined ? { bind: component.bind } : {}),
          ...(component.on_click !== undefined ? { on_click: component.on_click } : {}),
        })),
      },
    ],
    // v1 actions are a strict subset of v2 actions.
    // output_key and credit_cost_class are omitted (undefined) — valid in v2.
    actions: (v1.actions ?? []).map((action) => ({
      id: action.id,
      kind: action.kind,
      ...(action.prompt_template !== undefined ? { prompt_template: action.prompt_template } : {}),
      ...(action.persona_prompt !== undefined ? { persona_prompt: action.persona_prompt } : {}),
      ...(action.operation !== undefined ? { operation: action.operation } : {}),
      ...(action.api !== undefined ? { api: action.api } : {}),
      ...(action.params !== undefined ? { params: action.params } : {}),
      ...(action.input_from !== undefined ? { input_from: action.input_from } : {}),
      ...(action.render_result_into !== undefined
        ? { render_result_into: action.render_result_into }
        : {}),
    })),
    multiplayer: undefined,
  };
}

/**
 * Check if a raw manifest object needs migration.
 * Returns true if schema_version is missing or < 2.
 */
export function needsMigration(manifest: unknown): manifest is Manifest {
  if (manifest === null || typeof manifest !== "object") {
    return true;
  }
  const m = manifest as Record<string, unknown>;
  if (!("schema_version" in m)) {
    return true;
  }
  const version = m["schema_version"];
  if (typeof version !== "number") {
    return true;
  }
  return version < 2;
}
