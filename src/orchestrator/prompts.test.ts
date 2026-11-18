import { describe, it, expect } from "vitest";
import {
  ACTION_CONTRACT,
  buildActionContractPrompt,
} from "../../supabase/functions/_shared/orchestrator/registrySpec.ts";
import {
  buildCreateManifestPrompt,
  buildEditPatchPrompt,
  selectFewShotTemplates,
} from "../../supabase/functions/_shared/orchestrator/prompts.ts";
import { STARTER_TEMPLATES } from "../../supabase/functions/_shared/orchestrator/templates.ts";
import type {
  PromptAnalysis,
  ResolvedPlan,
} from "../../supabase/functions/_shared/orchestrator/types.ts";

describe("Phase 2 — ACTION_CONTRACT & Prompts", () => {
  it("ACTION_CONTRACT lists all 9 supported action kinds with required/optional fields, summary, and examples", () => {
    expect(ACTION_CONTRACT.length).toBe(9);
    const kinds = ACTION_CONTRACT.map((a) => a.kind);
    expect(kinds).toEqual([
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

    for (const action of ACTION_CONTRACT) {
      expect(action.requiredFields.length).toBeGreaterThanOrEqual(3);
      expect(action.summary.length).toBeGreaterThan(10);
      expect(action.example.id).toBeTruthy();
      expect(action.example.kind).toBe(action.kind);
    }
  });

  it("buildActionContractPrompt includes action specs and wiring contract", () => {
    const text = buildActionContractPrompt();
    expect(text).toContain("ACTION SPECIFICATIONS");
    expect(text).toContain("llm_call");
    expect(text).toContain("local_compute");
    expect(text).toContain("api_fetch");
    expect(text).toContain("mcp_call");
    expect(text).toContain("navigate");
    expect(text).toContain("save_data");
    expect(text).toContain("record_insert");
    expect(text).toContain("record_update");
    expect(text).toContain("conversation_loop");

    // Wiring rules
    expect(text).toContain("`bind`");
    expect(text).toContain("`on_click`");
    expect(text).toContain("`render_result_into`");
    expect(text).toContain("`save_to`");
    expect(text).toContain("Unique IDs");
  });

  it("selectFewShotTemplates defaults to weather-forecast and daily-checklist", () => {
    const defaultAnalysis: PromptAnalysis = {
      intent: "general tool",
      isEdit: false,
      requestedFeatures: [],
      unsupportedRequests: [],
      suggestedApis: [],
      suggestedConnectors: [],
      suggestedComponents: [],
      suggestedPermissions: [],
      screenHints: [],
      multiplayerRequested: false,
    };

    const [t1, t2] = selectFewShotTemplates(defaultAnalysis);
    expect([t1.slug, t2.slug]).toEqual(["weather-forecast", "daily-checklist"]);
  });

  it("selectFewShotTemplates selects matching templates when analysis signals specific tools", () => {
    const lightAnalysis: PromptAnalysis = {
      intent: "turn on living room light",
      isEdit: false,
      requestedFeatures: ["mcp light control"],
      unsupportedRequests: [],
      suggestedApis: [],
      suggestedConnectors: [{ connectorId: "home_assistant", tools: ["light.toggle"] }],
      suggestedComponents: ["toggle"],
      suggestedPermissions: [],
      screenHints: [],
      multiplayerRequested: false,
    };

    const [t1, t2] = selectFewShotTemplates(lightAnalysis);
    expect(t1.slug).toBe("smart-home-light");
    expect(t2.slug).toBeTruthy();
  });

  it("buildCreateManifestPrompt includes ACTION_CONTRACT in system and 2 few-shot examples in prompt", () => {
    const analysis: PromptAnalysis = {
      intent: "a habit tracker",
      isEdit: false,
      requestedFeatures: ["habits"],
      unsupportedRequests: [],
      suggestedApis: [],
      suggestedConnectors: [],
      suggestedComponents: ["checklist"],
      suggestedPermissions: [],
      screenHints: [],
      multiplayerRequested: false,
    };

    const plan: ResolvedPlan = {
      supported: true,
      components: ["checklist", "card"],
      permissions: [],
      apis: [],
      connectors: [],
      requiresRuntimeLlm: false,
      notes: [],
    };

    const payload = buildCreateManifestPrompt({
      userPrompt: "Build a habit tracker",
      analysis,
      plan,
      templateMatch: null,
      conversationContext: [],
    });

    expect(payload.system).toContain("ACTION SPECIFICATIONS");
    expect(payload.system).toContain("WIRING & INTEGRITY CONTRACT");
    expect(payload.prompt).toContain("FEW-SHOT EXAMPLES OF VALID V2 MANIFESTS:");
    expect(payload.prompt).toContain("weather-forecast");
    expect(payload.prompt).toContain("daily-checklist");

    // Output length check
    expect(payload.system.length).toBeGreaterThan(1000);
    expect(payload.prompt.length).toBeGreaterThan(1000);
  });

  it("buildEditPatchPrompt includes ACTION_CONTRACT and 3 valid RFC 6902 patch examples", () => {
    const analysis: PromptAnalysis = {
      intent: "change habit title",
      isEdit: true,
      requestedFeatures: [],
      unsupportedRequests: [],
      suggestedApis: [],
      suggestedConnectors: [],
      suggestedComponents: [],
      suggestedPermissions: [],
      screenHints: [],
      multiplayerRequested: false,
    };

    const plan: ResolvedPlan = {
      supported: true,
      components: [],
      permissions: [],
      apis: [],
      connectors: [],
      requiresRuntimeLlm: false,
      notes: [],
    };

    const weather = STARTER_TEMPLATES.find((t) => t.slug === "weather-forecast")!;

    const payload = buildEditPatchPrompt({
      userPrompt: "Change title to Today's Tasks",
      existingManifest: weather.manifest,
      analysis,
      plan,
      conversationContext: [],
    });

    expect(payload.system).toContain("ACTION SPECIFICATIONS");
    expect(payload.system).toContain("RFC 6902 PATCH EXAMPLES:");
    expect(payload.system).toContain("Example 1 — Change text");
    expect(payload.system).toContain("Example 2 — Add a node");
    expect(payload.system).toContain("Example 3 — Add an action + wire on_click");
    expect(payload.system).toContain("/screens/0/nodes/-");
    expect(payload.system).toContain("/actions/-");
    expect(payload.system).toContain("/screens/0/nodes/1/on_click");
  });
});
