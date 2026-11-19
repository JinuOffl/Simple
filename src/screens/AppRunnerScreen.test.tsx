// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { SavedApp } from "@/lib/zustandStore";
import type { ManifestV2 } from "@/schema/manifest.v2";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const sampleManifest: ManifestV2 = {
  schema_version: 2,
  app_id: "test-tool",
  name: "Shared Tracker",
  icon: "📊",
  permissions: [],
  connectors: [],
  data: { collections: [] },
  screens: [
    {
      id: "main",
      title: "Main Screen",
      nodes: [{ id: "n1", type: "text", props: { content: "Tracker Content" } }],
    },
  ],
  actions: [],
};

const appRecord: SavedApp = {
  id: "app-shared-1",
  user_id: "owner-user-id",
  name: "Shared Tracker",
  icon: "📊",
  manifest: sampleManifest,
  schema_version: 2,
  status: "active",
  pinned_order: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

let currentMemberRole: "owner" | "editor" | "viewer" | null = null;

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === "apps") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: appRecord, error: null }),
        };
      }
      if (table === "app_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(() =>
            Promise.resolve({
              data: currentMemberRole ? { role: currentMemberRole } : null,
              error: null,
            })
          ),
        };
      }
      if (table === "app_data") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  },
}));

import { useAppStore } from "@/lib/zustandStore";
import { AppRunnerScreen } from "./AppRunnerScreen";

describe("AppRunnerScreen — Phase 3 (3.5 Owner-only edit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentMemberRole = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("shows 'edit' button when caller is the owner", async () => {
    useAppStore.setState({
      user: { id: "owner-user-id", email: "owner@example.com" } as never,
      apps: [appRecord],
    });

    render(
      <MemoryRouter initialEntries={["/app/app-shared-1"]}>
        <Routes>
          <Route path="/app/:id" element={<AppRunnerScreen />} />
        </Routes>
      </MemoryRouter>
    );

    // Tool content renders
    expect(await screen.findByText("Tracker Content")).toBeTruthy();

    // Owner sees "edit"
    const editBtn = screen.getByRole("button", { name: "edit" });
    expect(editBtn).toBeTruthy();

    fireEvent.click(editBtn);
    expect(mockNavigate).toHaveBeenCalledWith("/build");
  });

  it("does NOT show 'edit' button when caller is an editor, but editor can still use the tool", async () => {
    currentMemberRole = "editor";
    useAppStore.setState({
      user: { id: "editor-user-id", email: "editor@example.com" } as never,
      apps: [], // not in owner's local list, fetched via supabase
    });

    render(
      <MemoryRouter initialEntries={["/app/app-shared-1"]}>
        <Routes>
          <Route path="/app/:id" element={<AppRunnerScreen />} />
        </Routes>
      </MemoryRouter>
    );

    // Tool content renders and is usable by editor
    expect(await screen.findByText("Tracker Content")).toBeTruthy();

    // Editor role badge is visible
    expect(screen.getByText("editor")).toBeTruthy();

    // Editor does NOT see "edit" button
    expect(screen.queryByRole("button", { name: "edit" })).toBeNull();
  });

  it("does NOT show 'edit' or 'share' button when caller is a viewer", async () => {
    currentMemberRole = "viewer";
    useAppStore.setState({
      user: { id: "viewer-user-id", email: "viewer@example.com" } as never,
      apps: [],
    });

    render(
      <MemoryRouter initialEntries={["/app/app-shared-1"]}>
        <Routes>
          <Route path="/app/:id" element={<AppRunnerScreen />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Tracker Content")).toBeTruthy();

    // Viewer sees neither edit nor share
    expect(screen.queryByRole("button", { name: "edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "share" })).toBeNull();
  });
});
