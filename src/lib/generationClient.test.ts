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

  it("applies RFC 6902 patch when editing with direct Groq call", async () => {
    vi.spyOn(supabase.functions, "invoke").mockResolvedValueOnce({
      data: null,
      error: new Error("Failed to send a request to the Edge Function") as any,
    });

    localStorage.setItem("simple_byok_key", "mock-groq-key");

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("local-functions")) {
        throw new Error("Local dev server offline");
      }
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  operations: [
                    {
                      op: "add",
                      path: "/screens/0/nodes/-",
                      value: { id: "btn_test", type: "button", props: { label: "Test" } },
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    const existingManifest = {
      schema_version: 2,
      app_id: "test-app",
      name: "Checklist",
      icon: "✅",
      permissions: [],
      connectors: [],
      data: { collections: [] },
      screens: [{ id: "main", title: "Main", nodes: [] }],
      actions: [],
    };

    const res = await generateAppWithFallback({
      userPrompt: "Add CRUD functionalities",
      existingManifest: existingManifest as any,
    });

    expect(res.ok).toBe(true);
    expect(res.manifest).toBeDefined();
    expect((res.manifest as any).screens[0].nodes.length).toBe(1);
    expect((res.manifest as any).screens[0].nodes[0].id).toBe("btn_test");

    fetchSpy.mockRestore();
    localStorage.removeItem("simple_byok_key");
  });
});

