import { describe, it, expect } from "vitest";
import { ManifestSchema, ComponentSchema, ActionSchema } from "./manifest.v1";

// ─── ComponentSchema ────────────────────────────────────────────────────────

describe("ComponentSchema", () => {
  it("accepts a minimal valid component", () => {
    const result = ComponentSchema.safeParse({ id: "c1", type: "text" });
    expect(result.success).toBe(true);
  });

  it("accepts a component with all optional fields", () => {
    const result = ComponentSchema.safeParse({
      id: "c2",
      type: "button",
      props: { label: "Click me" },
      bind: "user_input",
      on_click: "action_1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a component with unknown type", () => {
    const result = ComponentSchema.safeParse({ id: "c3", type: "slider" });
    expect(result.success).toBe(false);
  });

  it("rejects a component missing id", () => {
    const result = ComponentSchema.safeParse({ type: "text" });
    expect(result.success).toBe(false);
  });

  it("accepts all valid component types", () => {
    const types = [
      "text", "card", "button", "checklist",
      "image_gallery", "image_capture", "mic_recorder",
      "mcq_quiz", "chat_bubble", "conversation_loop",
    ];
    for (const type of types) {
      const result = ComponentSchema.safeParse({ id: `c-${type}`, type });
      expect(result.success, `type "${type}" should be valid`).toBe(true);
    }
  });
});

// ─── ActionSchema ─────────────────────────────────────────────────────────────

describe("ActionSchema", () => {
  it("accepts a minimal valid action", () => {
    const result = ActionSchema.safeParse({ id: "a1", kind: "llm_call" });
    expect(result.success).toBe(true);
  });

  it("accepts a conversation_loop action with persona_prompt", () => {
    const result = ActionSchema.safeParse({
      id: "a2",
      kind: "conversation_loop",
      persona_prompt: "You are a Socratic tutor",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an action with unknown kind", () => {
    const result = ActionSchema.safeParse({ id: "a3", kind: "webhook" });
    expect(result.success).toBe(false);
  });

  it("accepts all valid action kinds", () => {
    const kinds = ["llm_call", "local_compute", "navigate", "save_data", "conversation_loop"];
    for (const kind of kinds) {
      const result = ActionSchema.safeParse({ id: `a-${kind}`, kind });
      expect(result.success, `kind "${kind}" should be valid`).toBe(true);
    }
  });
});

// ─── ManifestSchema ───────────────────────────────────────────────────────────

const validManifest = {
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

describe("ManifestSchema", () => {
  it("accepts a valid full manifest", () => {
    const result = ManifestSchema.safeParse(validManifest);
    expect(result.success).toBe(true);
  });

  it("defaults permissions to empty array if omitted", () => {
    const m = { ...validManifest, permissions: undefined };
    const result = ManifestSchema.safeParse(m);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.permissions).toEqual([]);
    }
  });

  it("rejects manifest missing required name", () => {
    const { name: _omitted, ...rest } = validManifest;
    const result = ManifestSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects manifest with invalid permission value", () => {
    const m = { ...validManifest, permissions: ["bluetooth"] };
    const result = ManifestSchema.safeParse(m);
    expect(result.success).toBe(false);
  });

  it("rejects manifest with invalid component type in components array", () => {
    const m = {
      ...validManifest,
      components: [{ id: "cx", type: "video_player" }],
    };
    const result = ManifestSchema.safeParse(m);
    expect(result.success).toBe(false);
  });

  it("accepts empty components and actions arrays", () => {
    const m = { ...validManifest, components: [], actions: [] };
    const result = ManifestSchema.safeParse(m);
    expect(result.success).toBe(true);
  });

  it("accepts a Feynman tutor manifest", () => {
    const tutor = {
      app_id: "app-feynman",
      name: "Feynman Tutor",
      icon: "🎓",
      permissions: ["microphone"],
      components: [
        { id: "c1", type: "text", props: { content: "What topic do you want to learn?" } },
        { id: "c2", type: "conversation_loop", props: { persona_prompt: "You are a Socratic tutor" } },
      ],
      actions: [
        {
          id: "a1",
          kind: "conversation_loop",
          persona_prompt: "You are a Feynman-style tutor. Ask probing questions.",
          render_result_into: "c2",
        },
      ],
    };
    const result = ManifestSchema.safeParse(tutor);
    expect(result.success).toBe(true);
  });

  it("produces meaningful Zod error messages on failure", () => {
    const broken = { app_id: 123, name: null };
    const result = ManifestSchema.safeParse(broken);
    expect(result.success).toBe(false);
    if (!result.success) {
      // Zod v4 uses .issues (v3 used .errors — both are valid aliases)
      const issues = result.error.issues ?? [];
      expect(issues.length).toBeGreaterThan(0);
    }
  });
});
