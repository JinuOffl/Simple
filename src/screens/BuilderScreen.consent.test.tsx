// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ManifestV2 } from "@/schema/manifest.v2";

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

import { useAppStore } from "@/lib/zustandStore";
import { getManifestConsentSummary } from "@/lib/manifestConsent";
import { BuilderScreen } from "./BuilderScreen";

const mcpManifest: ManifestV2 = {
  schema_version: 2,
  app_id: "smart-home-1",
  name: "Home Switchboard",
  icon: "🏠",
  permissions: ["notifications"],
  connectors: [
    {
      connector_id: "home_assistant",
      tools: ["light.toggle", "lock.unlock"],
    },
  ],
  data: { collections: [] },
  screens: [
    {
      id: "main",
      title: "Controls",
      nodes: [
        { id: "lbl", type: "text", props: { content: "Living Room", variant: "title" } },
      ],
    },
  ],
  actions: [
    {
      id: "unlock_action",
      kind: "mcp_call",
      connector_id: "home_assistant",
      tool_name: "lock.unlock",
    },
  ],
};

const plainOfflineManifest: ManifestV2 = {
  schema_version: 2,
  app_id: "calc-1",
  name: "Tip Calculator",
  icon: "🧮",
  permissions: [],
  connectors: [],
  data: { collections: [] },
  screens: [
    {
      id: "main",
      title: "Calc",
      nodes: [{ id: "calc", type: "calculator" }],
    },
  ],
  actions: [],
};

describe("BuilderScreen Save-Time Consent", () => {
  const originalSaveApp = useAppStore.getState().saveApp;

  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollTo = vi.fn();
  });

  afterEach(() => {
    cleanup();
    useAppStore.setState({
      currentManifest: null,
      editingAppId: null,
      conversationContext: [],
      saveApp: originalSaveApp,
    });
  });

  it("summarizes permissions, MCP connectors, high-risk tools, and api_fetch APIs accurately", () => {
    const mcpSummary = getManifestConsentSummary(mcpManifest);
    expect(mcpSummary.requiresConsent).toBe(true);
    expect(mcpSummary.hasHighRiskTools).toBe(true);
    expect(mcpSummary.permissions).toEqual(["notifications"]);
    expect(mcpSummary.connectors).toEqual([
      {
        connectorId: "home_assistant",
        tools: ["light.toggle", "lock.unlock"],
        highRiskTools: ["lock.unlock"],
      },
    ]);

    const plainSummary = getManifestConsentSummary(plainOfflineManifest);
    expect(plainSummary.requiresConsent).toBe(false);
    expect(plainSummary.hasHighRiskTools).toBe(false);
  });

  it("opens save-time consent dialog for manifests with connectors/permissions and saves only after approval", async () => {
    const mockSaveApp = vi.fn<typeof originalSaveApp>().mockResolvedValue({
      id: "saved-1",
      user_id: "user-1",
      name: "Home Switchboard",
      icon: "🏠",
      manifest: mcpManifest,
      schema_version: 2,
      status: "active",
      pinned_order: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });

    useAppStore.setState({
      currentManifest: mcpManifest,
      editingAppId: null,
      saveApp: mockSaveApp,
    });

    render(
      <MemoryRouter>
        <BuilderScreen />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /^SAVE$/i }));

    expect(mockSaveApp).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/Review App Capabilities Before Saving/i)).toBeTruthy();
    expect(screen.getByText("notifications")).toBeTruthy();
    expect(screen.getByText("home_assistant")).toBeTruthy();
    expect(screen.getByText("lock.unlock")).toBeTruthy();
    expect(screen.getByText(/High Risk · Extra Confirm/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(mockSaveApp).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^SAVE$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Approve & Save/i }));

    await waitFor(() => {
      expect(mockSaveApp).toHaveBeenCalledWith(mcpManifest, undefined);
    });
    expect(await screen.findByRole("button", { name: /SAVED/i })).toBeTruthy();
  });

  it("saves plain offline manifests immediately without an unnecessary consent modal", async () => {
    const mockSaveApp = vi.fn<typeof originalSaveApp>().mockResolvedValue({
      id: "saved-2",
      user_id: "user-1",
      name: "Tip Calculator",
      icon: "🧮",
      manifest: plainOfflineManifest,
      schema_version: 2,
      status: "active",
      pinned_order: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });

    useAppStore.setState({
      currentManifest: plainOfflineManifest,
      editingAppId: null,
      saveApp: mockSaveApp,
    });

    render(
      <MemoryRouter>
        <BuilderScreen />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /^SAVE$/i }));

    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => {
      expect(mockSaveApp).toHaveBeenCalledWith(plainOfflineManifest, undefined);
    });
    expect(await screen.findByRole("button", { name: /SAVED/i })).toBeTruthy();
  });
});
