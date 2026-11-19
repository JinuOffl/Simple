// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { STARTER_TEMPLATES } from "../../supabase/functions/_shared/orchestrator/templates.ts";
import { validateManifestV2 } from "@/schema/validator";
import { runManifestDryRun } from "../../supabase/functions/_shared/orchestrator/dryRun.ts";
import { runAction } from "@/actions/actionRunner";
import type { SavedApp } from "@/lib/zustandStore";

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    functions: {
      invoke: mockInvoke,
    },
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            user: { id: "user-test", email: "test@example.com" },
          },
        },
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { useAppStore } from "@/lib/zustandStore";
import { HomeScreen } from "./HomeScreen";

describe("Phase 5 — Templates and instant demos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollTo = vi.fn();
    useAppStore.setState({
      apps: [],
      loadingApps: false,
      currentManifest: null,
      editingAppId: null,
      conversationContext: [],
      session: {
        access_token: "mock-token",
        refresh_token: "mock-refresh",
        expires_in: 3600,
        token_type: "bearer",
        user: {
          id: "user-123",
          app_metadata: {},
          user_metadata: {},
          aud: "authenticated",
          created_at: "2026-01-01T00:00:00.000Z",
          email: "user@example.com",
        },
      },
      entitlement: {
        user_id: "user-123",
        plan: "free",
        active_app_limit: 3,
        monthly_credit_limit: 100,
        credits_used: 10,
        period_start: "2026-01-01",
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  describe("5.1 STARTER_TEMPLATES validation & specifications", () => {
    it("habit-heatmap: heatmap rows, 14 days, habits_grid, size 2x1, passes dryRun isCreate", () => {
      const tpl = STARTER_TEMPLATES.find((t) => t.slug === "habit-heatmap");
      expect(tpl).toBeDefined();
      const m = tpl!.manifest;

      expect(validateManifestV2(m).kind).toBe("valid");

      const dry = runManifestDryRun(m, { isCreate: true });
      expect(dry.pass).toBe(true);
      expect(dry.errors).toEqual([]);

      expect(m.tool?.size).toBe("4x2"); // Phase 4: 4x2 for 14-day grid
      expect(m.screens.length).toBe(1);
      expect(m.screens[0].nodes.length).toBeLessThanOrEqual(4);

      const heatmapNode = m.screens[0].nodes.find((n) => n.type === "heatmap");
      expect(heatmapNode).toBeDefined();
      expect(heatmapNode?.props?.rows).toEqual(["Workout", "Reading", "Water"]);
      expect(heatmapNode?.props?.days).toBe(14);
      expect(heatmapNode?.props?.save_to).toBe("habits_grid");
    });

    it("pomodoro: timer 25 min label Focus + text note, size 2x1, passes dryRun isCreate", () => {
      const tpl = STARTER_TEMPLATES.find((t) => t.slug === "pomodoro");
      expect(tpl).toBeDefined();
      const m = tpl!.manifest;

      expect(validateManifestV2(m).kind).toBe("valid");

      const dry = runManifestDryRun(m, { isCreate: true });
      expect(dry.pass).toBe(true);
      expect(dry.errors).toEqual([]);

      expect(m.tool?.size).toBe("2x2"); // Phase 4: 2x2 for timer
      expect(m.screens.length).toBe(1);
      expect(m.screens[0].nodes.length).toBeLessThanOrEqual(4);

      const timerNode = m.screens[0].nodes.find((n) => n.type === "timer");
      expect(timerNode).toBeDefined();
      expect(timerNode?.props?.duration_seconds).toBe(1500);
      expect(timerNode?.props?.label).toBe("Focus");

      const textNode = m.screens[0].nodes.find((n) => n.type === "text");
      expect(textNode).toBeDefined();
    });

    it("counter: stat bound to count + slider + reset button using local_compute, passes dryRun isCreate and runAction resets count", async () => {
      const tpl = STARTER_TEMPLATES.find((t) => t.slug === "counter");
      expect(tpl).toBeDefined();
      const m = tpl!.manifest;

      expect(validateManifestV2(m).kind).toBe("valid");

      const dry = runManifestDryRun(m, { isCreate: true });
      expect(dry.pass).toBe(true);
      expect(dry.errors).toEqual([]);

      expect(m.screens.length).toBe(1);
      expect(m.screens[0].nodes.length).toBeLessThanOrEqual(4);

      const statNode = m.screens[0].nodes.find((n) => n.type === "stat");
      expect(statNode).toBeDefined();
      expect(statNode?.bind).toBe("count");

      const sliderNode = m.screens[0].nodes.find((n) => n.type === "slider");
      expect(sliderNode).toBeDefined();
      expect(sliderNode?.props?.save_to).toBe("count");

      const resetBtn = m.screens[0].nodes.find((n) => n.type === "button");
      expect(resetBtn).toBeDefined();

      const resetAction = m.actions.find((a) => a.id === "a_reset");
      expect(resetAction).toBeDefined();
      expect(resetAction?.kind).toBe("local_compute");

      // Verify reset action via runAction sets count to 0
      let updatedKey = "";
      let updatedVal: unknown = null;
      await runAction({
        action: resetAction as any,
        appData: { count: 42 },
        onDataChange: (key, val) => {
          updatedKey = key;
          updatedVal = val;
        },
      });

      expect(updatedKey).toBe("count");
      expect(Number(updatedVal)).toBe(0);
    });
  });

  describe("5.2 Home empty state: 6-template gallery and Build with AI", () => {
    it("renders gallery of 6 starter templates and 3 Build with AI prompts in empty state", () => {
      useAppStore.setState({ apps: [] });

      render(
        <MemoryRouter>
          <HomeScreen />
        </MemoryRouter>
      );

      // 6 starter templates
      expect(screen.getByText("Habit Heatmap")).toBeTruthy();
      expect(screen.getByText("Pomodoro Timer")).toBeTruthy();
      expect(screen.getByText("Tally Counter")).toBeTruthy();
      expect(screen.getByText("World Clock")).toBeTruthy();
      expect(screen.getByText("Weather Checker")).toBeTruthy();
      expect(screen.getByText("Currency Converter")).toBeTruthy();

      // Build with AI section
      expect(screen.getByText("build with ai")).toBeTruthy();
      expect(screen.getByText("water intake checklist")).toBeTruthy();
      expect(screen.getByText("london weather with refresh")).toBeTruthy();
      expect(screen.getByText("study timer with checklist")).toBeTruthy();

      // Removed outfit-photo and voice tutor prompts
      expect(screen.queryByText(/outfit recommender/i)).toBeNull();
      expect(screen.queryByText(/feynman tutor/i)).toBeNull();
    });

    it("clicking a Build with AI prompt navigates to /build with prefilled prompt", () => {
      useAppStore.setState({ apps: [] });

      render(
        <MemoryRouter>
          <HomeScreen />
        </MemoryRouter>
      );

      const waterPromptBtn = screen.getByText("water intake checklist");
      fireEvent.click(waterPromptBtn);

      expect(mockNavigate).toHaveBeenCalledWith("/build", {
        state: { prefillPrompt: "Make a daily water intake checklist" },
      });
    });
  });

  describe("5.3 Templates button and modal when tools exist", () => {
    it("renders templates button in header when tools exist, opens modal, and closes with focus return", () => {
      const mockSavedApp: SavedApp = {
        id: "app-existing-1",
        user_id: "user-123",
        name: "Existing Tool",
        icon: "🔧",
        manifest: {
          schema_version: 2,
          app_id: "existing-1",
          name: "Existing Tool",
          icon: "🔧",
          permissions: [],
          connectors: [],
          data: { collections: [] },
          screens: [{ id: "main", title: "Main", nodes: [] }],
          actions: [],
        },
        schema_version: 2,
        status: "active",
        pinned_order: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      };

      useAppStore.setState({
        apps: [mockSavedApp],
        loadingApps: false,
        fetchApps: vi.fn().mockResolvedValue(undefined),
        fetchEntitlementAndUsage: vi.fn().mockResolvedValue(undefined),
      });

      render(
        <MemoryRouter>
          <HomeScreen />
        </MemoryRouter>
      );

      const templatesBtn = screen.getByRole("button", { name: /^templates$/i });
      expect(templatesBtn).toBeTruthy();
      templatesBtn.focus();
      expect(document.activeElement).toBe(templatesBtn);

      // Open modal
      fireEvent.click(templatesBtn);

      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeTruthy();
      expect(screen.getByText("STARTER TEMPLATES")).toBeTruthy();

      // Close modal
      const closeBtn = screen.getByRole("button", { name: "Close dialog" });
      fireEvent.click(closeBtn);

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(templatesBtn);
    });
  });

  describe("5.4 Cloning: creates one app and performs zero supabase.functions.invoke calls", () => {
    it("tapping a template card clones the template, saves via saveApp, performs ZERO invoke calls, and navigates", async () => {
      const mockSaveApp = vi.fn().mockImplementation(async (manifest) => {
        return {
          id: manifest.app_id || "cloned-app-1",
          user_id: "user-123",
          name: manifest.name,
          icon: manifest.icon,
          manifest,
          status: "active",
        };
      });

      useAppStore.setState({
        apps: [],
        saveApp: mockSaveApp,
      });

      render(
        <MemoryRouter>
          <HomeScreen />
        </MemoryRouter>
      );

      const cloneBtn = screen.getByRole("button", { name: "Clone template: Habit Heatmap" });
      fireEvent.click(cloneBtn);

      await waitFor(() => {
        expect(mockSaveApp).toHaveBeenCalledTimes(1);
      });

      // Verify ZERO invoke calls
      expect(mockInvoke).not.toHaveBeenCalled();

      // Verify navigation to the new app runner route
      const savedApp = await mockSaveApp.mock.results[0].value;
      expect(mockNavigate).toHaveBeenCalledWith(`/app/${savedApp.id}`);
    });
  });
});
