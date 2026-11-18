import { describe, it, expect, vi } from "vitest";
import goldenPromptsRaw from "../../evals/golden_prompts.json?raw";
import {
  applyJsonPatch,
  JsonPatchError,
  verifyMinimalEditPatch,
} from "../../supabase/functions/_shared/orchestrator/jsonPatch.ts";
import { analyzePrompt } from "../../supabase/functions/_shared/orchestrator/analyzer.ts";
import { resolveCapabilities } from "../../supabase/functions/_shared/orchestrator/resolver.ts";
import { runManifestDryRun } from "../../supabase/functions/_shared/orchestrator/dryRun.ts";
import { runGenerateOrchestrator } from "../../supabase/functions/_shared/orchestrator/stateMachine.ts";
import { STARTER_TEMPLATES } from "../../supabase/functions/_shared/orchestrator/templates.ts";
import type {
  LLMProvider,
  LlmJsonRequest,
  LlmJsonResponse,
  ManifestV2Like,
} from "../../supabase/functions/_shared/orchestrator/types.ts";
import { validateWithAppZodSchema } from "./validateBridge";
import { ScriptedEvalLlmProvider } from "../../evals/mockProvider.ts";
import { runGoldenEvalSuite, type GoldenPromptCase } from "../../evals/suite.ts";

describe("RFC 6902 JSON Patch engine", () => {
  const weatherManifest = structuredClone(
    STARTER_TEMPLATES.find((t) => t.slug === "weather-forecast")!.manifest
  );

  it("supports add, replace, remove, move, copy, test without mutating source", () => {
    const originalSnap = JSON.stringify(weatherManifest);
    const patched = applyJsonPatch(weatherManifest, [
      { op: "test", path: "/schema_version", value: 2 },
      { op: "replace", path: "/name", value: "London Sky" },
      {
        op: "add",
        path: "/screens/0/nodes/-",
        value: { id: "extra_txt", type: "text", props: { content: "Bring coat" } },
      },
      { op: "copy", from: "/name", path: "/description" },
      { op: "replace", path: "/screens/0/title", value: "Overview" },
    ]);

    expect(JSON.stringify(weatherManifest)).toBe(originalSnap);
    expect(patched.name).toBe("London Sky");
    expect(patched.description).toBe("London Sky");
    expect(patched.screens[0]?.title).toBe("Overview");
    expect(patched.screens[0]?.nodes.map((n) => n.id)).toEqual([
      "weather_card",
      "refresh_weather_btn",
      "extra_txt",
    ]);

    const afterRemove = applyJsonPatch(patched, [
      { op: "remove", path: "/screens/0/nodes/2" },
    ]);
    expect(afterRemove.screens[0]?.nodes.length).toBe(2);
  });

  it("rejects prototype pollution segments and invalid array bounds", () => {
    expect(() =>
      applyJsonPatch(weatherManifest, [{ op: "add", path: "/__proto__/polluted", value: true }])
    ).toThrow(JsonPatchError);

    expect(() =>
      applyJsonPatch(weatherManifest, [{ op: "replace", path: "/screens/99/title", value: "X" }])
    ).toThrow(JsonPatchError);
  });

  it("verifyMinimalEditPatch forbids root replacement and whole-screen wipes", () => {
    const badCheck = verifyMinimalEditPatch(weatherManifest, weatherManifest, [
      { op: "replace", path: "", value: weatherManifest },
    ]);
    expect(badCheck.ok).toBe(false);
    expect(badCheck.errors[0]).toContain("Root replacement");

    const wipeCheck = verifyMinimalEditPatch(weatherManifest, weatherManifest, [
      { op: "replace", path: "/screens", value: weatherManifest.screens },
    ]);
    expect(wipeCheck.ok).toBe(false);

    const surgical = applyJsonPatch(weatherManifest, [
      { op: "replace", path: "/name", value: "Updated Weather" },
    ]);
    const okCheck = verifyMinimalEditPatch(weatherManifest, surgical, [
      { op: "replace", path: "/name", value: "Updated Weather" },
    ]);
    expect(okCheck.ok).toBe(true);
    expect(okCheck.preservedNodeIds).toEqual(["weather_card", "refresh_weather_btn"]);
    expect(okCheck.preservedActionIds).toEqual(["a_fetch_weather"]);
  });
});

describe("ANALYZE, RESOLVE & DRY_RUN stages", () => {
  it("flags explicit non-goals honestly with closest supported alternative", () => {
    const analysis = analyzePrompt(
      "Build a private WhatsApp replacement with end-to-end encrypted chat"
    );
    const plan = resolveCapabilities(analysis, null);
    expect(plan.supported).toBe(false);
    expect(plan.honestyMessage).toContain("end-to-end encrypted");
    expect(plan.closestAlternative).toBeTruthy();
  });

  it("executes DRY_RUN with zero network fetch and catches missing targets/APIs", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const broken: ManifestV2Like = {
      schema_version: 2,
      app_id: "broken-dry-run",
      name: "Broken App",
      icon: "🧪",
      permissions: [],
      connectors: [],
      data: { collections: [] },
      screens: [
        {
          id: "main",
          title: "Main",
          nodes: [
            {
              id: "btn",
              type: "button",
              props: { label: "Run" },
              on_click: "missing_action",
            },
          ],
        },
      ],
      actions: [
        {
          id: "a_bad_api",
          kind: "api_fetch",
          api: "unknown_evil_api",
          render_result_into: "btn",
        },
      ],
    };

    const report = runManifestDryRun(broken);
    expect(report.pass).toBe(false);
    expect(report.errors.some((e) => e.includes("missing on_click action"))).toBe(true);
    expect(report.errors.some((e) => e.includes("non-allowlisted api"))).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("enforces 1 screen and at most 4 nodes for NEW tools in DRY_RUN", () => {
    const validNewTool: ManifestV2Like = {
      schema_version: 2,
      app_id: "valid-new-tool",
      name: "Valid Tool",
      icon: "✨",
      permissions: [],
      connectors: [],
      data: { collections: [] },
      screens: [
        {
          id: "main",
          title: "Main",
          nodes: [
            { id: "n1", type: "text", props: { content: "Node 1" } },
            { id: "n2", type: "text", props: { content: "Node 2" } },
            { id: "n3", type: "text", props: { content: "Node 3" } },
            { id: "n4", type: "text", props: { content: "Node 4" } },
          ],
        },
      ],
      actions: [],
      tool: { size: "4x2" },
    };

    const validReport = runManifestDryRun(validNewTool, { isCreate: true });
    expect(validReport.pass).toBe(true);
    expect(validReport.errors).toEqual([]);

    // Multi-screen rejected for create
    const multiScreen: ManifestV2Like = {
      ...validNewTool,
      screens: [
        validNewTool.screens[0]!,
        { id: "s2", title: "Settings", nodes: [] },
      ],
    };
    const multiReport = runManifestDryRun(multiScreen, { isCreate: true });
    expect(multiReport.pass).toBe(false);
    expect(multiReport.errors.some((e) => e.includes("New tool must have exactly 1 screen"))).toBe(true);

    // Over 4 nodes rejected for create
    const fiveNodes: ManifestV2Like = {
      ...validNewTool,
      screens: [
        {
          id: "main",
          title: "Main",
          nodes: [
            ...validNewTool.screens[0]!.nodes,
            { id: "n5", type: "text", props: { content: "Node 5" } },
          ],
        },
      ],
    };
    const fiveReport = runManifestDryRun(fiveNodes, { isCreate: true });
    expect(fiveReport.pass).toBe(false);
    expect(fiveReport.errors.some((e) => e.includes("at most 4 nodes on its screen"))).toBe(true);

    // In edit mode (isCreate: false), multi-screen and > 4 nodes are permitted
    const editReport = runManifestDryRun(fiveNodes, { isCreate: false });
    expect(editReport.pass).toBe(true);
  });
});

describe("Orchestrator state machine & bounded repair loop", () => {
  it("runs happy-path state sequence RECEIVE -> TEMPLATE_MATCH -> ANALYZE -> RESOLVE -> BUILD -> VALIDATE -> DRY_RUN -> CRITIQUE -> DONE", async () => {
    const provider = new ScriptedEvalLlmProvider();
    const res = await runGenerateOrchestrator(
      { userPrompt: "Build a live weather checker for London" },
      { llmProvider: provider, validateManifest: validateWithAppZodSchema }
    );

    expect(res.ok).toBe(true);
    expect(res.state).toBe("DONE");
    expect(res.trace.transitions).toEqual([
      "RECEIVE",
      "TEMPLATE_MATCH",
      "ANALYZE",
      "RESOLVE",
      "BUILD",
      "VALIDATE",
      "DRY_RUN",
      "CRITIQUE",
      "DONE",
    ]);
    expect(res.trace.repairAttempts).toBe(0);
    expect(res.trace.templateMatch.matched).toBe(true);
    expect(res.trace.stateTimings.length).toBe(8);
  });

  it("handles critique failure -> bounded REPAIR -> DONE", async () => {
    let buildCalls = 0;
    let critiqueCalls = 0;
    const validWeather = structuredClone(
      STARTER_TEMPLATES.find((t) => t.slug === "weather-forecast")!.manifest
    );

    const provider: LLMProvider = {
      name: "critique-repair-mock",
      completeJson<T = unknown>(req: LlmJsonRequest): Promise<LlmJsonResponse<T>> {
        if (req.role === "critique") {
          critiqueCalls++;
          const data =
            critiqueCalls === 1
              ? { pass: false, issues: ["Missing card subtitle details."] }
              : { pass: true, issues: [] };
          return Promise.resolve({
            data: data as T,
            rawText: JSON.stringify(data),
            provider: "groq",
            model: "llama-3.1-8b-instant",
            usedFallback: false,
            latencyMs: 1,
          });
        }
        buildCalls++;
        return Promise.resolve({
          data: validWeather as T,
          rawText: JSON.stringify(validWeather),
          provider: "groq",
          model: "llama-3.3-70b-versatile",
          usedFallback: false,
          latencyMs: 1,
        });
      },
    };

    const res = await runGenerateOrchestrator(
      { userPrompt: "Live London weather app" },
      { llmProvider: provider, validateManifest: validateWithAppZodSchema }
    );

    expect(res.ok).toBe(true);
    expect(buildCalls).toBe(2);
    expect(critiqueCalls).toBe(2);
    expect(res.trace.repairAttempts).toBe(1);
    expect(res.trace.transitions).toContain("REPAIR");
  });

  it("stops cleanly in FAILED after maxAttempts (2) repairs when manifest stays invalid", async () => {
    let buildCalls = 0;
    const alwaysBrokenProvider: LLMProvider = {
      name: "always-broken",
      completeJson<T = unknown>(): Promise<LlmJsonResponse<T>> {
        buildCalls++;
        return Promise.resolve({
          data: { schema_version: 2, app_id: "x" } as T,
          rawText: "{}",
          provider: "openai-compatible",
          model: "gpt-4o-mini",
          usedFallback: true,
          latencyMs: 1,
        });
      },
    };

    const res = await runGenerateOrchestrator(
      { userPrompt: "Build a stopwatch" },
      { llmProvider: alwaysBrokenProvider, validateManifest: validateWithAppZodSchema }
    );

    expect(res.ok).toBe(false);
    expect(res.state).toBe("FAILED");
    expect(buildCalls).toBe(3); // 1 initial + 2 repairs
    expect(res.trace.repairAttempts).toBe(2);
    expect(res.trace.usedFallbackProvider).toBe(true);
    expect(res.trace.failureKind).toBe("repair_exhausted");
  });

  it("refuses unsupported requests without calling the generation LLM", async () => {
    const spyProvider: LLMProvider = {
      name: "should-not-be-called",
      completeJson() {
        throw new Error("LLM should not be invoked for unsupported non-goal requests");
      },
    };

    const res = await runGenerateOrchestrator(
      { userPrompt: "Build an iOS SwiftUI app store app to run bash commands" },
      { llmProvider: spyProvider, validateManifest: validateWithAppZodSchema }
    );

    expect(res.ok).toBe(false);
    expect(res.state).toBe("FAILED");
    expect(res.unsupported?.message).toBeTruthy();
    expect(res.unsupported?.alternative).toBeTruthy();
    expect(res.trace.transitions).toEqual([
      "RECEIVE",
      "TEMPLATE_MATCH",
      "ANALYZE",
      "RESOLVE",
      "FAILED",
    ]);
  });

  it("passes >= 95% (100% expected) on all 36 golden prompts using full 23-component Zod validation", async () => {
    const cases = JSON.parse(goldenPromptsRaw) as GoldenPromptCase[];
    expect(cases.length).toBeGreaterThanOrEqual(30);

    const summary = await runGoldenEvalSuite(cases, {
      llmProvider: new ScriptedEvalLlmProvider(),
      validateManifest: validateWithAppZodSchema,
      mode: "scripted",
    });

    expect(summary.passedCases).toBe(summary.totalCases);
    expect(summary.postRepairValidRatePct).toBeGreaterThanOrEqual(95);
  });
});
