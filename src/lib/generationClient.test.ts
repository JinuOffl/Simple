// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateAppWithFallback } from "./generationClient";
import { supabase } from "./supabaseClient";

vi.mock("./supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe("generationClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses remote Supabase function if available", async () => {
    vi.spyOn(supabase.functions, "invoke").mockResolvedValueOnce({
      data: {
        schema_version: 2,
        app_id: "test-app",
        name: "Custom Calculator",
        icon: "🧮",
        permissions: [],
        connectors: [],
        data: { collections: [] },
        screens: [{ id: "main", title: "Calc", nodes: [] }],
        actions: [],
      },
      error: null,
    });

    const res = await generateAppWithFallback({
      userPrompt: "Custom calculator app",
    });

    expect(res.ok).toBe(true);
    expect(res.manifest?.name).toBe("Custom Calculator");
  });

  it("falls back cleanly to deterministic template match when remote fails with network error", async () => {
    vi.spyOn(supabase.functions, "invoke").mockResolvedValueOnce({
      data: null,
      error: new Error("Failed to send a request to the Edge Function") as any,
    });

    const res = await generateAppWithFallback({
      userPrompt: "Create a Clock widget that shows US and Indian time",
    });

    expect(res.ok).toBe(true);
    expect(res.manifest).toBeDefined();
    expect(res.manifest?.name).toContain("World Clock");
  });

  it("falls back to habit checklist template when asked for daily habit tracker offline", async () => {
    vi.spyOn(supabase.functions, "invoke").mockResolvedValueOnce({
      data: null,
      error: new Error("Failed to send a request to the Edge Function") as any,
    });

    const res = await generateAppWithFallback({
      userPrompt: "Make a daily morning habit checklist",
    });

    expect(res.ok).toBe(true);
    expect(res.manifest?.name).toBe("Daily Checklist");
  });
});

