import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

import { executeMcpCallAction } from "./mcpAction";
import { runAction } from "./actionRunner";
import { supabase } from "@/lib/supabaseClient";
import { useAppStore } from "@/lib/zustandStore";
import { mcpToggleManifest } from "@/demo/mcpToggleManifest";
import { validateManifestV2 } from "@/schema/validator";

afterEach(() => {
  vi.clearAllMocks();
});

describe("mcpAction / mcp_call runtime wiring", () => {
  it("validates Phase 1b hardcoded mcpToggleManifest against v2 schema & connector rules", () => {
    const result = validateManifestV2(mcpToggleManifest);
    expect(result.kind).toBe("valid");
  });

  it("calls run-mcp-action edge function and writes result + manages loading state", async () => {
    const invokeMock = vi.mocked(supabase.functions.invoke);
    invokeMock.mockResolvedValue({
      data: { result: "light.living_room is on" },
      error: null,
    });

    const onDataChange = vi.fn<(key: string, value: unknown) => void>();

    await runAction({
      action: mcpToggleManifest.actions[0],
      appData: { light_state: true },
      onDataChange,
    });

    expect(invokeMock).toHaveBeenCalledWith("run-mcp-action", {
      body: {
        action: mcpToggleManifest.actions[0],
        app_data: { light_state: true },
      },
    });
    expect(onDataChange).toHaveBeenCalledWith("status_card", "light.living_room is on");
    expect(useAppStore.getState().componentLoadingMap["status_card"]).toBe(false);
  });

  it("writes preview placeholder without calling backend when isPreview is true", async () => {
    const invokeMock = vi.mocked(supabase.functions.invoke);
    const onDataChange = vi.fn<(key: string, value: unknown) => void>();

    await executeMcpCallAction({
      action: mcpToggleManifest.actions[0],
      appData: { light_state: true },
      onDataChange,
      isPreview: true,
    });

    expect(invokeMock).not.toHaveBeenCalled();
    expect(onDataChange).toHaveBeenCalledWith(
      "status_card",
      "[Preview] Would run MCP tool fake_home_assistant.light.toggle."
    );
  });

  it("surfaces server or SSRF error messages cleanly into outputKey and clears loading", async () => {
    const invokeMock = vi.mocked(supabase.functions.invoke);
    invokeMock.mockResolvedValue({
      data: { error: "Blocked private or reserved IP address: 169.254.169.254" },
      error: null,
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onDataChange = vi.fn<(key: string, value: unknown) => void>();

    await executeMcpCallAction({
      action: {
        ...mcpToggleManifest.actions[0],
        output_key: "mcp_out",
      },
      appData: {},
      onDataChange,
    });

    expect(onDataChange).toHaveBeenCalledWith(
      "mcp_out",
      "Error: Blocked private or reserved IP address: 169.254.169.254"
    );
    expect(useAppStore.getState().componentLoadingMap["status_card"]).toBe(false);
    errorSpy.mockRestore();
  });
});

