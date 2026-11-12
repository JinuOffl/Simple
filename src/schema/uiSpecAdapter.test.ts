import { describe, it, expect } from "vitest";
import {
  JsonUiSpecAdapter,
  OpenUiSpecAdapter,
  compareUiSpecFormats,
} from "./uiSpecAdapter";
import type { ManifestV2 } from "./manifest.v2";

const sampleManifest: ManifestV2 = {
  schema_version: 2,
  app_id: "fitness-tracker",
  name: "Fitness Tracker",
  icon: "🏃",
  description: "Track your workouts, steps, and daily heart rate.",
  permissions: [],
  connectors: [],
  data: { collections: [] },
  screens: [
    {
      id: "main",
      title: "Dashboard",
      nodes: [
        {
          id: "stat_steps",
          type: "stat",
          props: { label: "Steps", value: 8420, unit: "steps" },
        },
        {
          id: "chart_weekly",
          type: "chart",
          props: {
            chart_type: "bar",
            labels: ["Mon", "Tue", "Wed"],
            datasets: [{ label: "Distance", data: [4, 6, 5] }],
          },
        },
        {
          id: "btn_log",
          type: "button",
          props: { label: "Log Workout", variant: "primary" },
          on_click: "action_log",
        },
      ],
    },
  ],
  actions: [
    {
      id: "action_log",
      kind: "save_data",
      input_from: ["stat_steps"],
    },
  ],
};

describe("UiSpecAdapter and Format Spike", () => {
  it("JsonUiSpecAdapter serializes and parses lossless ManifestV2 JSON", () => {
    const adapter = new JsonUiSpecAdapter();
    const serialized = adapter.serialize(sampleManifest);
    expect(serialized).toContain('"schema_version": 2');
    expect(serialized).toContain('"fitness-tracker"');

    const parsed = adapter.parse(serialized);
    expect(parsed.app_id).toBe(sampleManifest.app_id);
    expect(parsed.screens[0].nodes.length).toBe(3);
  });

  it("OpenUiSpecAdapter serializes to concise declarative syntax and parses back", () => {
    const adapter = new OpenUiSpecAdapter();
    const serialized = adapter.serialize(sampleManifest);

    expect(serialized).toContain('app = App(id="fitness-tracker"');
    expect(serialized).toContain('screen_main = Screen("main"');
    expect(serialized).toContain("stat_steps = stat(");
    expect(serialized).toContain("action_log = save_data(");

    const parsed = adapter.parse(serialized);
    expect(parsed.app_id).toBe("fitness-tracker");
    expect(parsed.name).toBe("Fitness Tracker");
    expect(parsed.screens.length).toBe(1);
    expect(parsed.screens[0].nodes.length).toBe(3);
    expect(parsed.actions.length).toBe(1);
  });

  it("compares token counts and latencies across formats (ADR 004 Spike)", () => {
    const comparison = compareUiSpecFormats(sampleManifest);

    expect(comparison.manifestId).toBe("fitness-tracker");
    expect(comparison.jsonEstTokens).toBeGreaterThan(0);
    expect(comparison.openUiEstTokens).toBeGreaterThan(0);
    // OpenUI Lang syntax is more concise than pretty-printed JSON
    expect(comparison.openUiEstTokens).toBeLessThan(comparison.jsonEstTokens);
    expect(comparison.tokenReductionPercent).toBeGreaterThanOrEqual(10);
    expect(comparison.roundtripMatch).toBe(true);
  });
});
