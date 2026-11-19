// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { SavedApp } from "@/lib/zustandStore";
import type { ManifestV2 } from "@/schema/manifest.v2";

const activeManifest: ManifestV2 = {
  schema_version: 2,
  app_id: "active-tool-1",
  name: "Habit Tracker",
  icon: "✅",
  tool: { size: "2x1" },
  permissions: [],
  connectors: [],
  data: { collections: [] },
  screens: [
    {
      id: "main",
      title: "Main",
      nodes: [{ id: "n1", type: "text", props: { content: "Track your habits" } }],
    },
  ],
  actions: [],
};

const sleepingManifest: ManifestV2 = {
  schema_version: 2,
  app_id: "sleeping-tool-1",
  name: "Old Tip Calc",
  icon: "🧮",
  tool: { size: "2x1" },
  permissions: [],
  connectors: [],
  data: { collections: [] },
  screens: [
    {
      id: "main",
      title: "Main",
      nodes: [{ id: "n2", type: "text", props: { content: "Calculate tips" } }],
    },
  ],
  actions: [],
};

const mockApps: SavedApp[] = [
  {
    id: "app-active-1",
    user_id: "user-1",
    name: "Habit Tracker",
    icon: "✅",
    manifest: activeManifest,
    schema_version: 2,
    status: "active",
    pinned_order: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "app-sleep-1",
    user_id: "user-1",
    name: "Old Tip Calc",
    icon: "🧮",
    manifest: sleepingManifest,
    schema_version: 2,
    status: "sleeping",
    pinned_order: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
];

vi.mock("@/lib/supabaseClient", () => {
  const mockIn = vi.fn().mockResolvedValue({ data: [], error: null });
  return {
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        eq: vi.fn().mockReturnThis(),
        in: mockIn,
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
      functions: {
        invoke: vi.fn(),
      },
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
  };
});

import { useAppStore } from "@/lib/zustandStore";
import { HomeScreen } from "./HomeScreen";

const mockedNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

describe("HomeScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    useAppStore.setState({
      apps: [],
      loadingApps: false,
    });
  });

  it("renders Simple. wordmark and 4-column tool grid with ToolTile for active and static card for sleeping", () => {
    const mockWakeApp = vi.fn().mockResolvedValue(true);
    useAppStore.setState({
      apps: mockApps,
      loadingApps: false,
      fetchApps: vi.fn().mockResolvedValue(undefined),
      fetchEntitlementAndUsage: vi.fn().mockResolvedValue(undefined),
      wakeApp: mockWakeApp,
    });

    render(
      <MemoryRouter>
        <HomeScreen />
      </MemoryRouter>
    );

    // Wordmark
    expect(screen.getByText("Simple.")).toBeTruthy();

    // Active tool should render live ToolTile
    const activeTile = screen.getByTestId("tool-tile");
    expect(activeTile).toBeTruthy();
    expect(screen.getByText("Track your habits")).toBeTruthy();

    // Sleeping tool should render static card with sleeping tag and Wake button
    const sleepingCard = screen.getByTestId("app-card");
    expect(sleepingCard).toBeTruthy();
    expect(screen.getByText("sleeping")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Wake/i })).toBeTruthy();

    // FAB exists
    expect(document.getElementById("create-app-fab")).toBeTruthy();

    // Clicking open on active tool navigates to /app/:id
    const openBtn = screen.getByRole("button", { name: /Open Habit Tracker/i });
    fireEvent.click(openBtn);
    expect(mockedNavigate).toHaveBeenCalledWith("/app/app-active-1");
  });

  it("calls wakeApp when Wake button is clicked on sleeping card", () => {
    const mockWakeApp = vi.fn().mockResolvedValue(true);
    useAppStore.setState({
      apps: [mockApps[1]], // only sleeping
      loadingApps: false,
      fetchApps: vi.fn().mockResolvedValue(undefined),
      fetchEntitlementAndUsage: vi.fn().mockResolvedValue(undefined),
      wakeApp: mockWakeApp,
    });

    render(
      <MemoryRouter>
        <HomeScreen />
      </MemoryRouter>
    );

    const wakeBtn = screen.getByRole("button", { name: /Wake/i });
    fireEvent.click(wakeBtn);
    expect(mockWakeApp).toHaveBeenCalledWith("app-sleep-1");
  });

  it("renders empty state when there are 0 tools", () => {
    useAppStore.setState({
      apps: [],
      loadingApps: false,
    });

    render(
      <MemoryRouter>
        <HomeScreen />
      </MemoryRouter>
    );

    expect(screen.getByText("NO TOOLS YET")).toBeTruthy();
    expect(screen.getByText(/tap a prompt below to start/i)).toBeTruthy();
  });

  it("loads stored app_data and shows stored value inside ToolTile", async () => {
    localStorage.setItem("simple_guest_data_app-active-1", JSON.stringify({ n1: "Dynamic Live Note" }));

    useAppStore.setState({
      apps: [mockApps[0]],
      loadingApps: false,
      session: {
        user: { id: "guest-test", is_anonymous: true, app_metadata: {}, user_metadata: { is_guest: true }, aud: "authenticated", created_at: "" },
        access_token: "guest",
        refresh_token: "guest",
        expires_in: 3600,
        token_type: "bearer",
      },
      fetchApps: vi.fn().mockResolvedValue(undefined),
      fetchEntitlementAndUsage: vi.fn().mockResolvedValue(undefined),
    });

    render(
      <MemoryRouter>
        <HomeScreen />
      </MemoryRouter>
    );

    // Initial render is loading-safe, then effect loads stored value
    expect(await screen.findByText("Dynamic Live Note")).toBeTruthy();
  });
});
