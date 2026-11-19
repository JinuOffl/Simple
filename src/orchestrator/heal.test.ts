import { describe, it, expect } from "vitest";
import { healManifest } from "../../supabase/functions/_shared/orchestrator/heal.ts";

describe("healManifest pure deterministic repairs", () => {
  it("heals collection field type text to string", () => {
    const raw = {
      schema_version: 2,
      data: {
        collections: [
          {
            name: "items",
            fields: [
              { name: "title", type: "text" },
              { name: "count", type: "number" },
            ],
          },
        ],
      },
    };

    const healed = healManifest(raw) as any;
    expect(healed.data.collections[0].fields[0].type).toBe("string");
    expect(healed.data.collections[0].fields[1].type).toBe("number");
  });

  it("normalizes action type aliases to standard kinds", () => {
    const raw = {
      schema_version: 2,
      actions: [
        { id: "a1", type: "create" },
        { id: "a2", type: "insert" },
        { id: "a3", type: "update" },
        { id: "a4", type: "edit" },
        { id: "a5", type: "navigate" },
        { id: "a6", type: "goto" },
        { id: "a7", type: "save" },
      ],
    };

    const healed = healManifest(raw) as any;
    expect(healed.actions[0].kind).toBe("record_insert");
    expect(healed.actions[0].type).toBeUndefined();
    expect(healed.actions[1].kind).toBe("record_insert");
    expect(healed.actions[2].kind).toBe("record_update");
    expect(healed.actions[3].kind).toBe("record_update");
    expect(healed.actions[4].kind).toBe("navigate");
    expect(healed.actions[5].kind).toBe("navigate");
    expect(healed.actions[6].kind).toBe("save_data");
  });

  it("drops action label without mutating other valid fields", () => {
    const raw = {
      schema_version: 2,
      actions: [
        { id: "act1", kind: "navigate", label: "Go to settings", params: { target: "settings" } },
      ],
    };

    const healed = healManifest(raw) as any;
    expect(healed.actions[0].label).toBeUndefined();
    expect(healed.actions[0].kind).toBe("navigate");
    expect(healed.actions[0].params.target).toBe("settings");
  });

  it("drops checklist props collection and fields", () => {
    const raw = {
      schema_version: 2,
      screens: [
        {
          id: "main",
          nodes: [
            {
              id: "chk1",
              type: "checklist",
              props: {
                collection: "tasks",
                fields: ["title"],
                items: ["Buy milk", "Clean desk"],
              },
            },
          ],
        },
      ],
    };

    const healed = healManifest(raw) as any;
    const checklistProps = healed.screens[0].nodes[0].props;
    expect(checklistProps.collection).toBeUndefined();
    expect(checklistProps.fields).toBeUndefined();
    expect(checklistProps.items).toEqual(["Buy milk", "Clean desk"]);
  });

  it("fills checklist items from existing node when missing", () => {
    const existing = {
      schema_version: 2,
      screens: [
        {
          id: "main",
          nodes: [
            {
              id: "chk1",
              type: "checklist",
              props: { items: ["Task 1", "Task 2"] },
            },
          ],
        },
      ],
    };

    const raw = {
      schema_version: 2,
      screens: [
        {
          id: "main",
          nodes: [
            {
              id: "chk1",
              type: "checklist",
              props: {},
            },
          ],
        },
      ],
    };

    const healed = healManifest(raw, existing) as any;
    expect(healed.screens[0].nodes[0].props.items).toEqual(["Task 1", "Task 2"]);
  });

  it("does NOT turn unknown action kinds into local_compute and does not invent props", () => {
    const raw = {
      schema_version: 2,
      actions: [
        { id: "act_custom", kind: "unknown_custom_action" },
      ],
      screens: [
        {
          id: "main",
          nodes: [
            { id: "btn1", type: "button", props: {} }, // does not inject label: "Action"
          ],
        },
      ],
    };

    const healed = healManifest(raw) as any;
    expect(healed.actions[0].kind).toBe("unknown_custom_action");
    expect(healed.screens[0].nodes[0].props.label).toBeUndefined();
  });

  it("heals tool.size and derives tool.requires from catalog adapters", () => {
    // 1. Invalid size healed to 2x1, hallucinated requires cleared when no keyed adapter
    const rawNoKey = {
      schema_version: 2,
      tool: { size: "invalid_size", requires: [{ key_id: "fake", label: "Fake" }] },
      actions: [],
    };
    const healedNoKey = healManifest(rawNoKey) as any;
    expect(healedNoKey.tool.size).toBe("2x1");
    expect(healedNoKey.tool.requires).toEqual([]);

    // 2. Requires derived from catalog when openweather action is present
    const rawKeyed = {
      schema_version: 2,
      tool: { size: "4x2" },
      actions: [
        { id: "act_w", kind: "api_fetch", api: "openweather" },
      ],
    };
    const healedKeyed = healManifest(rawKeyed) as any;
    expect(healedKeyed.tool.size).toBe("4x2");
    expect(healedKeyed.tool.requires).toEqual([
      {
        key_id: "openweather",
        label: "OpenWeather Current",
        help_url: "https://home.openweathermap.org/users/sign_up",
      },
    ]);

    // 3. When obj.tool is completely missing and keyed adapter action is present -> creates tool = { size: "2x1" } & derives requires
    const rawMissingTool = {
      schema_version: 2,
      actions: [
        { id: "act_w2", kind: "api_fetch", api: "openweather" },
      ],
    };
    const healedMissingTool = healManifest(rawMissingTool) as any;
    expect(healedMissingTool.tool).toBeDefined();
    expect(healedMissingTool.tool.size).toBe("2x1");
    expect(healedMissingTool.tool.requires).toEqual([
      {
        key_id: "openweather",
        label: "OpenWeather Current",
        help_url: "https://home.openweathermap.org/users/sign_up",
      },
    ]);
  });
});
