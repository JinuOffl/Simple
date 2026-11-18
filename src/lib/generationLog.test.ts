import { describe, it, expect, beforeEach } from "vitest";
import { logGeneration, getGenerationLog, clearGenerationLog } from "./generationLog";

describe("generationLog ring buffer", () => {
  beforeEach(() => {
    clearGenerationLog();
  });

  it("records generation events and retrieves them", () => {
    expect(getGenerationLog()).toEqual([]);

    logGeneration({
      tier: "edge",
      userPrompt: "Build a counter",
      existingManifestBytes: 0,
      ok: true,
      latencyMs: 120,
    });

    const logs = getGenerationLog();
    expect(logs).toHaveLength(1);
    expect(logs[0].tier).toBe("edge");
    expect(logs[0].userPrompt).toBe("Build a counter");
    expect(logs[0].ok).toBe(true);
    expect(logs[0].latencyMs).toBe(120);
    expect(typeof logs[0].time).toBe("number");
  });

  it("caps at 20 entries and drops the oldest entry", () => {
    for (let i = 0; i < 25; i++) {
      logGeneration({
        tier: "browser",
        userPrompt: `Prompt ${i}`,
        existingManifestBytes: i * 10,
        ok: true,
        latencyMs: 50 + i,
      });
    }

    const logs = getGenerationLog();
    expect(logs).toHaveLength(20);
    // Oldest 5 entries (0..4) should have been shifted out; first item should be Prompt 5
    expect(logs[0].userPrompt).toBe("Prompt 5");
    expect(logs[19].userPrompt).toBe("Prompt 24");
  });
});
