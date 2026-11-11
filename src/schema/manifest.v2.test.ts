import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  COMPONENT_REGISTRY,
  VALID_COMPONENT_TYPES,
  buildRegistryPrompt,
  buildRegistryNodeSchema,
  getRegistryEntry,
} from "../registry/index";
import { ManifestV2Schema, NodeSchema, type ManifestV2 } from "./manifest.v2";
import { migrateV1toV2, needsMigration } from "./migrator";
import { validateManifestV2 } from "./validator";
import { ManifestSchema, type Manifest } from "./manifest.v1";

// ─── 1. Registry completeness ─────────────────────────────────────────────────

describe("Registry completeness", () => {
  it("every entry in COMPONENT_REGISTRY has required metadata and valid examples", () => {
    expect(COMPONENT_REGISTRY.length).toBe(23);

    for (const entry of COMPONENT_REGISTRY) {
      expect(typeof entry.type).toBe("string");
      expect(entry.type.trim().length).toBeGreaterThan(0);

      expect(entry.propsSchema).toBeInstanceOf(z.ZodType);
      expect(typeof entry.propsSchema.safeParse).toBe("function");

      expect(typeof entry.component).toBe("function");

      expect(typeof entry.llmDescription).toBe("string");
      expect(entry.llmDescription.trim().length).toBeGreaterThan(0);

      expect(Array.isArray(entry.requiredPermissions)).toBe(true);
      expect(Array.isArray(entry.examples)).toBe(true);
      expect(entry.examples.length).toBeGreaterThan(0);

      for (const example of entry.examples) {
        const parsed = entry.propsSchema.safeParse(example.props);
        expect(parsed.success, `example for "${entry.type}" should match propsSchema`).toBe(true);
      }

      expect(getRegistryEntry(entry.type)).toBe(entry);
    }
  });

  it("VALID_COMPONENT_TYPES has exactly 23 entries", () => {
    expect(VALID_COMPONENT_TYPES.size).toBe(23);
    for (const entry of COMPONENT_REGISTRY) {
      expect(VALID_COMPONENT_TYPES.has(entry.type)).toBe(true);
    }
  });

  it("buildRegistryPrompt() returns a non-empty string containing each non-stub type", () => {
    const prompt = buildRegistryPrompt();
    expect(typeof prompt).toBe("string");
    expect(prompt.trim().length).toBeGreaterThan(0);

    const nonStubEntries = COMPONENT_REGISTRY.filter((entry) => !entry.isStub);
    const stubEntries = COMPONENT_REGISTRY.filter((entry) => Boolean(entry.isStub));

    expect(nonStubEntries.length).toBe(12);
    expect(stubEntries.length).toBe(11);

    for (const entry of nonStubEntries) {
      expect(prompt).toContain(entry.type);
    }
  });

  it("buildRegistryNodeSchema() strictly validates node type and props", () => {
    const nodeSchema = buildRegistryNodeSchema();
    expect(nodeSchema.safeParse({ id: "n1", type: "text", props: { content: "Hello" } }).success).toBe(
      true
    );
    expect(nodeSchema.safeParse({ id: "n2", type: "nonexistent_widget" }).success).toBe(false);
    expect(
      nodeSchema.safeParse({
        id: "n3",
        type: "text",
        props: { content: "Hello", unexpectedProp: true },
      }).success
    ).toBe(false);
    expect(NodeSchema.safeParse({ id: "n4", type: "button", props: { label: "Go" } }).success).toBe(
      true
    );
  });
});

// ─── 2. ManifestV2Schema ──────────────────────────────────────────────────────

describe("ManifestV2Schema", () => {
  const minimalV2 = {
    schema_version: 2 as const,
    app_id: "app-min-v2",
    name: "Minimal App",
    icon: "✨",
    screens: [{ id: "main", title: "Main", nodes: [] }],
    actions: [],
  };

  it("accepts a valid minimal v2 manifest", () => {
    const result = ManifestV2Schema.safeParse(minimalV2);
    expect(result.success).toBe(true);
  });

  it("accepts a full manifest with connectors, collections, permissions, and multiplayer", () => {
    const fullV2 = {
      schema_version: 2 as const,
      app_id: "app-full-v2",
      name: "Full App",
      icon: "🚀",
      description: "A full featured v2 manifest",
      permissions: ["camera", "notifications"] as const,
      connectors: [
        {
          connector_id: "github",
          tools: ["list_issues", "create_issue"],
        },
      ],
      data: {
        collections: [
          {
            name: "entries",
            shared: true,
            fields: [
              { name: "title", type: "string" as const },
              { name: "done", type: "boolean" as const },
            ],
          },
        ],
      },
      screens: [
        {
          id: "main",
          title: "Home",
          nodes: [
            { id: "n1", type: "image_capture", props: { label: "Snap", save_to: "photo" } },
            { id: "n2", type: "button", props: { label: "Sync" }, on_click: "a1" },
          ],
        },
      ],
      actions: [
        {
          id: "a1",
          kind: "mcp_call" as const,
          connector_id: "github",
          tool_name: "list_issues",
          params: { repo: "simple/app" },
          output_key: "issues",
          credit_cost_class: "mcp_call" as const,
        },
      ],
      multiplayer: { enabled: true },
    };

    const result = ManifestV2Schema.safeParse(fullV2);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.connectors).toHaveLength(1);
      expect(result.data.data.collections).toHaveLength(1);
      expect(result.data.permissions).toEqual(["camera", "notifications"]);
      expect(result.data.multiplayer).toEqual({ enabled: true });
    }
  });

  it("rejects manifest with schema_version: 1", () => {
    const result = ManifestV2Schema.safeParse({ ...minimalV2, schema_version: 1 });
    expect(result.success).toBe(false);
  });

  it("rejects manifest missing screens", () => {
    const { screens: _omitted, ...withoutScreens } = minimalV2;
    const result = ManifestV2Schema.safeParse(withoutScreens);
    expect(result.success).toBe(false);
  });

  it("rejects manifest with invalid permission value", () => {
    const result = ManifestV2Schema.safeParse({
      ...minimalV2,
      permissions: ["bluetooth"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects manifest with invalid action kind", () => {
    const result = ManifestV2Schema.safeParse({
      ...minimalV2,
      actions: [{ id: "a1", kind: "webhook" }],
    });
    expect(result.success).toBe(false);
  });

  it("defaults permissions to [] when omitted", () => {
    const result = ManifestV2Schema.safeParse(minimalV2);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.permissions).toEqual([]);
    }
  });

  it("defaults connectors to [] when omitted", () => {
    const result = ManifestV2Schema.safeParse(minimalV2);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.connectors).toEqual([]);
    }
  });

  it("defaults data to { collections: [] } when omitted", () => {
    const result = ManifestV2Schema.safeParse(minimalV2);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data).toEqual({ collections: [] });
    }
  });

  it("defaults actions to [] when omitted", () => {
    const { actions: _omitted, ...withoutActions } = minimalV2;
    const result = ManifestV2Schema.safeParse(withoutActions);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actions).toEqual([]);
    }
  });
});

// ─── 3. migrateV1toV2 ─────────────────────────────────────────────────────────

const validV1Manifest: Manifest = {
  app_id: "app-123",
  name: "Outfit Picker",
  icon: "👗",
  permissions: ["camera"],
  components: [
    { id: "c1", type: "image_capture", props: { label: "Take a photo" }, on_click: "a1" },
    { id: "c2", type: "text", props: { content: "Your recommendation will appear here" } },
    { id: "c3", type: "button", props: { label: "Get Recommendation" }, on_click: "a1" },
  ],
  actions: [
    {
      id: "a1",
      kind: "llm_call",
      prompt_template: "Look at this outfit photo: {{image_data}}. What would you recommend?",
      render_result_into: "c2",
      input_from: ["c1"],
    },
  ],
};

describe("migrateV1toV2", () => {
  it("migrates a v1 manifest into a valid v2 manifest (validateManifestV2 returns valid)", () => {
    const v2 = migrateV1toV2(validV1Manifest);
    const validation = validateManifestV2(v2);
    expect(validation.kind).toBe("valid");
    expect(v2.schema_version).toBe(2);
    expect(v2.app_id).toBe(validV1Manifest.app_id);
    expect(v2.name).toBe(validV1Manifest.name);
    expect(v2.icon).toBe(validV1Manifest.icon);
  });

  it("wraps v1 components into a single screen named 'main'", () => {
    const v2 = migrateV1toV2(validV1Manifest);
    expect(v2.screens).toHaveLength(1);
    expect(v2.screens[0]?.id).toBe("main");
    expect(v2.screens[0]?.title).toBe(validV1Manifest.name);
    expect(v2.screens[0]?.nodes).toHaveLength(validV1Manifest.components.length);
  });

  it("preserves all v1 component fields (id, type, props, bind, on_click) verbatim", () => {
    const v1WithBind: Manifest = {
      ...validV1Manifest,
      components: [
        ...validV1Manifest.components,
        {
          id: "c4",
          type: "text",
          props: { content: "Fallback", className: "text-sm" },
          bind: "recommendation_text",
          on_click: "a1",
        },
      ],
    };

    const v2 = migrateV1toV2(v1WithBind);
    const nodes = v2.screens[0]?.nodes ?? [];
    expect(nodes).toEqual(v1WithBind.components);
  });

  it("preserves all v1 actions verbatim", () => {
    const v1RichActions: Manifest = {
      ...validV1Manifest,
      actions: [
        ...validV1Manifest.actions,
        {
          id: "a2",
          kind: "api_fetch",
          api: "weather",
          params: { city: "Tokyo" },
          input_from: ["c2"],
          render_result_into: "c2",
        },
        {
          id: "a3",
          kind: "local_compute",
          operation: "count",
          params: { target: "items" },
        },
        {
          id: "a4",
          kind: "conversation_loop",
          persona_prompt: "You are a helpful stylist.",
        },
      ],
    };

    const v2 = migrateV1toV2(v1RichActions);
    expect(v2.actions).toEqual(v1RichActions.actions);
  });

  it("preserves v1 permissions array", () => {
    const v2 = migrateV1toV2(validV1Manifest);
    expect(v2.permissions).toEqual(["camera"]);
  });

  it("needsMigration(v1) returns true and needsMigration(v2) returns false", () => {
    expect(needsMigration(validV1Manifest)).toBe(true);
    expect(needsMigration({ ...validV1Manifest, schema_version: 1 })).toBe(true);
    expect(needsMigration(null)).toBe(true);

    const v2 = migrateV1toV2(validV1Manifest);
    expect(needsMigration(v2)).toBe(false);
  });

  it("round-trips migrateV1toV2 output through ManifestV2Schema.safeParse", () => {
    const v2 = migrateV1toV2(validV1Manifest);
    const parsed = ManifestV2Schema.safeParse(v2);
    expect(parsed.success).toBe(true);
  });

  it("edge case: v1 with empty components produces a single screen with empty nodes array", () => {
    const emptyComponentsV1: Manifest = {
      app_id: "app-empty-components",
      name: "Empty App",
      icon: "⬜",
      permissions: [],
      components: [],
      actions: [],
    };

    const v2 = migrateV1toV2(emptyComponentsV1);
    expect(v2.screens).toEqual([{ id: "main", title: "Empty App", nodes: [] }]);
    expect(validateManifestV2(v2).kind).toBe("valid");
  });

  it("edge case: v1 with no permissions produces v2 permissions = []", () => {
    const parsedNoPerms = ManifestSchema.parse({
      app_id: "app-no-perms",
      name: "No Perms App",
      icon: "📝",
      components: [{ id: "c1", type: "text", props: { content: "Hi" } }],
      actions: [],
    });

    const v2FromParsed = migrateV1toV2(parsedNoPerms);
    expect(v2FromParsed.permissions).toEqual([]);
    expect(validateManifestV2(v2FromParsed).kind).toBe("valid");

    // Also guard against raw unparsed v1 objects where permissions is undefined at runtime
    const unparsedV1 = {
      app_id: "app-raw-no-perms",
      name: "Raw No Perms",
      icon: "📝",
      components: [{ id: "c1", type: "text", props: { content: "Hi" } }],
      actions: [],
    } as unknown as Manifest;

    const v2FromRaw = migrateV1toV2(unparsedV1);
    expect(v2FromRaw.permissions).toEqual([]);
  });
});

// ─── 4. validateManifestV2 ────────────────────────────────────────────────────

describe("validateManifestV2", () => {
  const makeBaseV2 = (): ManifestV2 => ({
    schema_version: 2,
    app_id: "app-val-1",
    name: "Validation Test App",
    icon: "🧪",
    permissions: [],
    connectors: [
      {
        connector_id: "slack",
        tools: ["post_message", "list_channels"],
      },
    ],
    data: { collections: [] },
    screens: [
      {
        id: "screen_1",
        title: "Screen 1",
        nodes: [
          { id: "node_1", type: "text", props: { content: "Initial" } },
          { id: "node_2", type: "button", props: { label: "Run" }, on_click: "act_1" },
        ],
      },
      {
        id: "screen_2",
        title: "Screen 2",
        nodes: [{ id: "node_3", type: "card", props: { title: "Info", body: "Ready" } }],
      },
    ],
    actions: [
      {
        id: "act_1",
        kind: "mcp_call",
        connector_id: "slack",
        tool_name: "post_message",
        render_result_into: "node_1",
      },
    ],
  });

  it("returns { kind: 'valid' } for a valid manifest", () => {
    const result = validateManifestV2(makeBaseV2());
    expect(result.kind).toBe("valid");
    if (result.kind === "valid") {
      expect(result.manifest.app_id).toBe("app-val-1");
    }
  });

  it("returns { kind: 'invalid' } mentioning the duplicate id when node IDs duplicate across screens", () => {
    const manifest = makeBaseV2();
    manifest.screens[1] = {
      id: "screen_2",
      title: "Screen 2",
      nodes: [{ id: "node_1", type: "card", props: { body: "Duplicate" } }],
    };

    const result = validateManifestV2(manifest);
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.errors.some((err) => err.includes("node_1"))).toBe(true);
    }
  });

  it("returns { kind: 'invalid' } when action IDs are duplicated", () => {
    const manifest = makeBaseV2();
    manifest.actions.push({
      id: "act_1",
      kind: "local_compute",
      operation: "count",
    });

    const result = validateManifestV2(manifest);
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.errors.some((err) => err.includes("act_1"))).toBe(true);
    }
  });

  it("returns { kind: 'invalid' } when on_click references a non-existent action", () => {
    const manifest = makeBaseV2();
    manifest.screens[0] = {
      id: "screen_1",
      title: "Screen 1",
      nodes: [
        { id: "node_1", type: "text", props: { content: "Initial" } },
        { id: "node_2", type: "button", props: { label: "Run" }, on_click: "missing_action" },
      ],
    };

    const result = validateManifestV2(manifest);
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.errors.some((err) => err.includes("missing_action"))).toBe(true);
    }
  });

  it("returns { kind: 'invalid' } when render_result_into references a non-existent node", () => {
    const manifest = makeBaseV2();
    manifest.actions[0] = {
      id: "act_1",
      kind: "mcp_call",
      connector_id: "slack",
      tool_name: "post_message",
      render_result_into: "ghost_node",
    };

    const result = validateManifestV2(manifest);
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.errors.some((err) => err.includes("ghost_node"))).toBe(true);
    }
  });

  it("returns { kind: 'invalid' } when mcp_call connector_id is not in connectors[]", () => {
    const manifest = makeBaseV2();
    manifest.actions[0] = {
      id: "act_1",
      kind: "mcp_call",
      connector_id: "notion",
      tool_name: "create_page",
      render_result_into: "node_1",
    };

    const result = validateManifestV2(manifest);
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.errors.some((err) => err.includes("notion"))).toBe(true);
    }
  });

  it("returns { kind: 'invalid' } when mcp_call tool_name is not in connector's tools[]", () => {
    const manifest = makeBaseV2();
    manifest.actions[0] = {
      id: "act_1",
      kind: "mcp_call",
      connector_id: "slack",
      tool_name: "delete_workspace",
      render_result_into: "node_1",
    };

    const result = validateManifestV2(manifest);
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.errors.some((err) => err.includes("delete_workspace"))).toBe(true);
    }
  });

  it("returns { kind: 'invalid' } when schema_version: 1 is passed to validateManifestV2", () => {
    const manifestWithV1 = { ...makeBaseV2(), schema_version: 1 };
    const result = validateManifestV2(manifestWithV1);
    expect(result.kind).toBe("invalid");
  });

  it("returns { kind: 'invalid' } when required component permission is missing or over-declared", () => {
    const missingPerm = makeBaseV2();
    missingPerm.screens[0] = {
      id: "screen_1",
      title: "Screen 1",
      nodes: [
        { id: "node_1", type: "text", props: { content: "Initial" } },
        { id: "node_2", type: "image_capture", props: { label: "Snap" }, on_click: "act_1" },
      ],
    };
    expect(validateManifestV2(missingPerm).kind).toBe("invalid");

    const extraPerm = makeBaseV2();
    extraPerm.permissions = ["camera"];
    expect(validateManifestV2(extraPerm).kind).toBe("invalid");
  });
});
