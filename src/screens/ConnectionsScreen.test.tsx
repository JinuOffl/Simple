// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DiscoveredMcpTool, MaskedConnection, UpsertConnectionInput } from "@/lib/connectionsApi";

const { mockList, mockDiscover, mockSave, mockDelete } = vi.hoisted(() => ({
  mockList: vi.fn<() => Promise<MaskedConnection[]>>(),
  mockDiscover: vi.fn<(args: { id?: string; server_url?: string; token?: string; auth_header_name?: string }) => Promise<DiscoveredMcpTool[]>>(),
  mockSave: vi.fn<(input: UpsertConnectionInput) => Promise<MaskedConnection>>(),
  mockDelete: vi.fn<(id: string) => Promise<void>>(),
}));

vi.mock("@/lib/connectionsApi", () => ({
  listConnections: () => mockList(),
  discoverConnectionTools: (args: { id?: string; server_url?: string; token?: string; auth_header_name?: string }) =>
    mockDiscover(args),
  saveConnection: (input: UpsertConnectionInput) => mockSave(input),
  deleteConnection: (id: string) => mockDelete(id),
}));

import { ConnectionsScreen } from "./ConnectionsScreen";

describe("ConnectionsScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue([
      {
        id: "conn-1",
        connector_id: "home_assistant",
        label: "Apartment HA",
        server_url: "https://ha.example.ui.nabu.casa/mcp",
        allowed_tools: ["light.toggle", "lock.unlock"],
        status: "active",
        has_token: true,
        auth_header_name: "Authorization",
      },
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders ADR-005 Bearer/API-key policy, SSRF guidance, and masked saved connections without raw secrets", async () => {
    render(
      <MemoryRouter>
        <ConnectionsScreen />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Apartment HA")).toBeTruthy();
    expect(screen.getByText(/API KEY \/ BEARER TOKEN ONLY/i)).toBeTruthy();
    expect(screen.getByText(/Nabu Casa or Cloudflare\/Tailscale HTTPS/i)).toBeTruthy();
    expect(screen.getByText("Authorization sealed")).toBeTruthy();
    expect(screen.getByText(/lock\.unlock · confirm/i)).toBeTruthy();
  });

  it("discovers tools, flags high-risk tools, toggles consent allowlist, and saves connection", async () => {
    mockDiscover.mockResolvedValueOnce([
      { name: "light.toggle", description: "Toggle a light" },
      { name: "lock.unlock", description: "Unlock front door" },
    ]);
    mockSave.mockResolvedValueOnce({
      id: "conn-2",
      connector_id: "home_assistant",
      label: "Home Assistant",
      server_url: "https://my-ha.example.com/mcp",
      allowed_tools: ["light.toggle", "lock.unlock"],
      status: "active",
      has_token: true,
      auth_header_name: "Authorization",
    });

    render(
      <MemoryRouter>
        <ConnectionsScreen />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Apartment HA")).toBeTruthy();

    const urlInput = screen.getByPlaceholderText(/https:\/\/your-instance/i);
    const tokenInput = screen.getByPlaceholderText(/Paste static token/i);

    fireEvent.change(urlInput, { target: { value: "https://my-ha.example.com/mcp" } });
    fireEvent.change(tokenInput, { target: { value: "super-secret-ha-token" } });

    fireEvent.click(screen.getByRole("button", { name: /Test & Discover Tools/i }));

    expect(await screen.findByText(/discovered 2 tools/i)).toBeTruthy();
    expect(screen.getByText("high-risk confirm")).toBeTruthy();

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    fireEvent.click(checkboxes[1]);

    fireEvent.click(screen.getByRole("button", { name: /Save Connection/i }));

    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({
          connector_id: "home_assistant",
          server_url: "https://my-ha.example.com/mcp",
          token: "super-secret-ha-token",
          allowed_tools: expect.arrayContaining(["light.toggle", "lock.unlock"]),
        }),
      );
      expect(mockList).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByText(/Secret token sealed server-side/i)).toBeTruthy();
    expect((tokenInput as HTMLInputElement).value).toBe("");
  });
});
