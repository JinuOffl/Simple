// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateAppWithFallback } from "./generationClient";
import { getGenerationLog, clearGenerationLog } from "./generationLog";
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
    clearGenerationLog();
    localStorage.removeItem("simple_byok_key");
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
    expect(res.tier).toBe("edge");
  });

  it("extracts trace, patch, diagnostics, and tier from edge response and records in generationLog", async () => {
    vi.spyOn(supabase.functions, "invoke").mockResolvedValueOnce({
      data: {
        ok: true,
        manifest: {
          schema_version: 2,
          app_id: "test-app-diag",
          name: "Diagnostic App",
          icon: "🔬",
          permissions: [],
          connectors: [],
          data: { collections: [] },
          screens: [{ id: "main", title: "Diag", nodes: [] }],
          actions: [],
        },
        patch: [{ op: "replace", path: "/name", value: "Diagnostic App" }],
        diagnostics: { validationErrors: [] },
        trace: { totalLatencyMs: 150, repairAttempts: 1 },
      },
      error: null,
    });

    const res = await generateAppWithFallback({
      userPrompt: "Diagnose test",
    });

    expect(res.ok).toBe(true);
    expect(res.tier).toBe("edge");
    expect(res.patch).toEqual([{ op: "replace", path: "/name", value: "Diagnostic App" }]);
    expect(res.diagnostics).toEqual({ validationErrors: [] });
    expect(res.trace).toEqual({ totalLatencyMs: 150, repairAttempts: 1 });

    const logs = getGenerationLog();
    expect(logs).toHaveLength(1);
    expect(logs[0].tier).toBe("edge");
    expect(logs[0].userPrompt).toBe("Diagnose test");
    expect(logs[0].repairAttempts).toBe(1);
    expect(logs[0].ok).toBe(true);
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

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("local-functions")) {
        throw new Error("Local dev server offline");
      }
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      const messagesText = JSON.stringify(body.messages ?? "");
      if (messagesText.includes("semantic QA reviewer")) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ pass: true, issues: [] }) } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
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

  it("heals and repairs LLM generated operations with non-standard action types and field types", async () => {
    vi.spyOn(supabase.functions, "invoke").mockResolvedValueOnce({
      data: null,
      error: new Error("Failed to send a request to the Edge Function") as any,
    });

    localStorage.setItem("simple_byok_key", "mock-groq-key");

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("local-functions")) {
        throw new Error("Local dev server offline");
      }
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      const messagesText = JSON.stringify(body.messages ?? "");
      if (messagesText.includes("semantic QA reviewer")) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ pass: true, issues: [] }) } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
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
                      path: "/data/collections/0",
                      value: {
                        id: "tasks",
                        name: "tasks",
                        fields: [
                          { id: "title", name: "Title", type: "text" },
                        ],
                      },
                    },
                    {
                      op: "add",
                      path: "/actions/0",
                      value: {
                        id: "create_task",
                        type: "create",
                        collection: "tasks",
                        label: "Add Task",
                      },
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
      userPrompt: "Add CRUD functionalities such as create edit update delete",
      existingManifest: existingManifest as any,
    });

    expect(res.ok).toBe(true);
    expect(res.manifest).toBeDefined();
    // Verify healed collection field type: "text" -> "string"
    expect((res.manifest as any).data.collections[0].fields[0].type).toBe("string");
    // Verify healed action: type "create" -> kind "record_insert"
    expect((res.manifest as any).actions[0].kind).toBe("record_insert");

    fetchSpy.mockRestore();
    localStorage.removeItem("simple_byok_key");
  });

  it("returns clear diagnostic error when edit generation cannot reach edge function and no Groq key is present", async () => {
    vi.spyOn(supabase.functions, "invoke").mockResolvedValueOnce({
      data: null,
      error: new Error("Failed to send a request to the Edge Function") as any,
    });

    const existingManifest = {
      schema_version: 2,
      app_id: "tpl-app",
      name: "Custom App",
      icon: "⚡",
      permissions: [],
      connectors: [],
      data: { collections: [] },
      screens: [{ id: "main", title: "Main", nodes: [] }],
      actions: [],
    };

    const res = await generateAppWithFallback({
      userPrompt: "Add a new button",
      existingManifest: existingManifest as any,
    });

    expect(res.ok).toBe(false);
    expect(res.error).toContain("The Supabase Edge Function is not reachable");
  });

  it("parses error body with context.json() on 422 and appends first 3 validation errors", async () => {
    const errorResponse = new Response(
      JSON.stringify({
        error: "Generation validation failed",
        diagnostics: {
          validationErrors: ["Err 1", "Err 2", "Err 3", "Err 4"],
        },
      }),
      { status: 422, headers: { "Content-Type": "application/json" } }
    );

    const mockInvokeError = new Error("FunctionsHttpError: Edge Function returned a non-2xx status code") as any;
    mockInvokeError.context = errorResponse;

    vi.spyOn(supabase.functions, "invoke").mockResolvedValueOnce({
      data: null,
      error: mockInvokeError,
    });

    const res = await generateAppWithFallback({
      userPrompt: "Build custom app",
    });

    expect(res.ok).toBe(false);
    expect(res.error).toBe("Generation validation failed (Err 1; Err 2; Err 3)");
    expect(res.tier).toBe("edge");
  });

  it("parses error body with context.json() on 402 for credit exhaustion without falling through", async () => {
    const errorResponse = new Response(
      JSON.stringify({
        error: "Insufficient monthly credits for app generation. Upgrade plan or wait for reset.",
        remaining_credits: 0,
      }),
      { status: 402, headers: { "Content-Type": "application/json" } }
    );

    const mockInvokeError = new Error("FunctionsHttpError: Edge Function returned a non-2xx status code") as any;
    mockInvokeError.context = errorResponse;

    vi.spyOn(supabase.functions, "invoke").mockResolvedValueOnce({
      data: null,
      error: mockInvokeError,
    });

    const res = await generateAppWithFallback({
      userPrompt: "Build custom app",
    });

    expect(res.ok).toBe(false);
    expect(res.error).toBe(
      "Insufficient monthly credits for app generation. Upgrade plan or wait for reset."
    );
    expect(res.tier).toBe("edge");
  });

  it("skips tier 2 for local offline guests and returns offline guest message", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValueOnce({
      data: {
        session: {
          user: { id: "guest-test-uuid-456" },
        } as any,
      },
      error: null,
    });

    const invokeSpy = vi.spyOn(supabase.functions, "invoke");

    const res = await generateAppWithFallback({
      userPrompt: "Make an app",
    });

    expect(invokeSpy).not.toHaveBeenCalled();
    expect(res.ok).toBe(false);
    expect(res.error).toBe("Sign in with email to generate tools (offline guest)");
  });
});

