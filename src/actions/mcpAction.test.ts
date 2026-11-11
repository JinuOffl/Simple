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
import type { ManifestV2Action } from "@/schema/manifest.v2";

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

  it("aborts high-risk mcp_call without invoking edge function when user declines confirmation", async () => {
    const invokeMock = vi.mocked(supabase.functions.invoke);
    const onDataChange = vi.fn<(key: string, value: unknown) => void>();
    const confirmHighRisk = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);

    const unlockAction: ManifestV2Action = {
      id: "unlock_front_door",
      kind: "mcp_call",
      connector_id: "home_assistant",
      tool_name: "lock.unlock",
      render_result_into: "status_card",
      output_key: "mcp_out",
    };

    await executeMcpCallAction({
      action: unlockAction,
      appData: {},
      appId: "app-uuid-1234",
      onDataChange,
      confirmHighRisk,
    });

    expect(confirmHighRisk).toHaveBeenCalledWith("lock.unlock", "home_assistant");
    expect(invokeMock).not.toHaveBeenCalled();
    expect(onDataChange).toHaveBeenCalledWith(
      "mcp_out",
      'Cancelled high-risk action "lock.unlock".'
    );
  });

  it("forwards app_id and confirmed: true for approved high-risk mcp_call", async () => {
    const invokeMock = vi.mocked(supabase.functions.invoke);
    invokeMock.mockResolvedValueOnce({
      data: { result: "Front door unlocked" },
      error: null,
    });

    const onDataChange = vi.fn<(key: string, value: unknown) => void>();
    const confirmHighRisk = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);

    const unlockAction: ManifestV2Action = {
      id: "unlock_front_door",
      kind: "mcp_call",
      connector_id: "home_assistant",
      tool_name: "lock.unlock",
      render_result_into: "status_card",
      output_key: "mcp_out",
    };

    await executeMcpCallAction({
      action: unlockAction,
      appData: { entity_id: "lock.front_door" },
      appId: "11111111-1111-4111-8111-111111111111",
      onDataChange,
      confirmHighRisk,
    });

    expect(confirmHighRisk).toHaveBeenCalledWith("lock.unlock", "home_assistant");
    expect(invokeMock).toHaveBeenCalledWith("run-mcp-action", {
      body: {
        action: unlockAction,
        app_data: { entity_id: "lock.front_door" },
        app_id: "11111111-1111-4111-8111-111111111111",
        confirmed: true,
      },
    });
    expect(onDataChange).toHaveBeenCalledWith("mcp_out", "Front door unlocked");
  });
});

