// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ManifestV2 } from "@/schema/manifest.v2";
import type { SavedApp } from "@/lib/zustandStore";
import { ToolTile } from "@/components/ToolTile";
import { ImageGallery } from "@/components/ImageGallery";

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
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              user: {
                id: "user-test",
                email: "test@example.com",
              },
            },
          },
        }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
  };
});

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
import { BuilderScreen } from "./BuilderScreen";

const sampleManifest: ManifestV2 = {
  schema_version: 2,
  app_id: "tile-app-1",
  name: "Daily Note",
  icon: "📝",
  permissions: [],
  connectors: [],
  tool: { size: "2x1" },
  data: { collections: [] },
  screens: [
    {
      id: "main",
      title: "Main",
      nodes: [{ id: "t1", type: "text", props: { content: "Note body" } }],
    },
  ],
  actions: [],
};

describe("Phase 4 UI Polish (P1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollTo = vi.fn();
    useAppStore.setState({
      apps: [],
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

  describe("4.4 Home header & 4.5 Tool tiles", () => {
    it("renders ToolTile with accessible buttons, 32px hit target for open, and visible action buttons", () => {
      const onOpen = vi.fn();
      const onSleep = vi.fn();
      const onExport = vi.fn();

      render(
        <ToolTile
          manifest={sampleManifest}
          appData={{}}
          status="Ready"
          onOpen={onOpen}
          onSleep={onSleep}
          onExport={onExport}
        />
      );

      const openBtn = screen.getByRole("button", { name: `Open ${sampleManifest.name}` });
      expect(openBtn).toBeTruthy();
      expect(openBtn.className).toContain("min-w-[32px]");
      expect(openBtn.className).toContain("min-h-[32px]");

      const sleepBtn = screen.getByRole("button", { name: `Sleep ${sampleManifest.name}` });
      expect(sleepBtn).toBeTruthy();
      expect(sleepBtn.className).toContain("opacity-60");

      const exportBtn = screen.getByRole("button", { name: `Export ${sampleManifest.name}` });
      expect(exportBtn).toBeTruthy();
      expect(exportBtn.className).toContain("opacity-60");

      fireEvent.click(openBtn);
      expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it("renders Home header with wordmark, plan chip, and single account dropdown", async () => {
      const mockSavedApp: SavedApp = {
        id: "app-1",
        user_id: "user-123",
        name: "Daily Note",
        icon: "📝",
        manifest: sampleManifest,
        schema_version: 2,
        status: "active",
        pinned_order: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      };
      useAppStore.setState({ apps: [mockSavedApp] });

      render(
        <MemoryRouter>
          <HomeScreen />
        </MemoryRouter>
      );

      // Wordmark Simple.
      expect(screen.getByText("Simple.")).toBeTruthy();

      // Plan chip
      const planChip = screen.getByText(/free/i);
      expect(planChip).toBeTruthy();

      // No separate loose "mcp demo" button
      expect(screen.queryByText(/mcp demo/i)).toBeNull();

      // Single account dropdown button
      const accountBtn = screen.getByRole("button", { name: /account menu/i });
      expect(accountBtn).toBeTruthy();

      // Menu initially closed
      expect(screen.queryByText("Connections")).toBeNull();

      // Click to open account menu
      fireEvent.click(accountBtn);
      expect(screen.getByText("Connections")).toBeTruthy();
      expect(screen.getByText("Plan & usage")).toBeTruthy();
      expect(screen.getByText("Sign out")).toBeTruthy();

      // Click "Connections"
      fireEvent.click(screen.getByText("Connections"));
      expect(mockNavigate).toHaveBeenCalledWith("/connections");
    });

    it("renders FAB with aria-label and safe area padding", () => {
      render(
        <MemoryRouter>
          <HomeScreen />
        </MemoryRouter>
      );

      const fab = screen.getByRole("button", { name: "Create tool" });
      expect(fab).toBeTruthy();
      const parentContainer = fab.parentElement;
      expect(parentContainer?.className).toContain("pb-[env(safe-area-inset-bottom)]");
    });
  });

  describe("4.6 BuilderScreen states & Error dismissal", () => {
    it("renders skeleton preview card while isGenerating is true and manifest is null", async () => {
      // Mock generateAppWithFallback so it stays pending
      const generationClient = await import("@/lib/generationClient");
      let resolveGen: (value: any) => void;
      const genPromise = new Promise((res) => {
        resolveGen = res;
      });
      vi.spyOn(generationClient, "generateAppWithFallback").mockImplementation(() => genPromise as any);

      render(
        <MemoryRouter>
          <BuilderScreen />
        </MemoryRouter>
      );

      const input = screen.getByPlaceholderText("describe the tool");
      fireEvent.change(input, { target: { value: "Build a habit tracker" } });
      const sendBtn = screen.getByRole("button", { name: "Send message" });
      fireEvent.click(sendBtn);

      // Skeleton should be visible
      await waitFor(() => {
        expect(screen.getByTestId("builder-skeleton")).toBeTruthy();
      });

      // Resolve generation
      resolveGen!({ ok: true, manifest: sampleManifest });
    });

    it("displays error banner with close button and dismisses error when clicked", async () => {
      const generationClient = await import("@/lib/generationClient");
      vi.spyOn(generationClient, "generateAppWithFallback").mockResolvedValue({
        ok: false,
        error: "429 Too many requests. Wait a minute.",
      });

      render(
        <MemoryRouter>
          <BuilderScreen />
        </MemoryRouter>
      );

      const input = screen.getByPlaceholderText("describe the tool");
      fireEvent.change(input, { target: { value: "Build something quickly" } });
      const sendBtn = screen.getByRole("button", { name: "Send message" });
      fireEvent.click(sendBtn);

      // Error banner with dismiss button ✕ should appear
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Dismiss error" })).toBeTruthy();
      });

      const dismissBtn = screen.getByRole("button", { name: "Dismiss error" });
      fireEvent.click(dismissBtn);

      // Error banner should be dismissed
      expect(screen.queryByRole("button", { name: "Dismiss error" })).toBeNull();
    });
  });

  describe("4.7 Accessibility & ImageGallery focus restoration", () => {
    it("restores focus to image trigger button after lightbox is closed", () => {
      const images = ["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="];

      render(<ImageGallery images={images} />);

      const triggerBtn = screen.getByRole("button", { name: "View photo 1" });
      triggerBtn.focus();
      expect(document.activeElement).toBe(triggerBtn);

      // Open lightbox
      fireEvent.click(triggerBtn);

      const closeBtn = screen.getByRole("button", { name: "Close image" });
      expect(closeBtn).toBeTruthy();

      // Close lightbox
      fireEvent.click(closeBtn);

      // Lightbox removed
      expect(screen.queryByRole("dialog")).toBeNull();

      // Focus returned to trigger
      expect(document.activeElement).toBe(triggerBtn);
    });
  });

  describe("4.8 & 4.10: Data ownership limits & ToolTile accessibility", () => {
    it("wrapper div has role='button', tabIndex=0, and onKeyDown Enter/Space triggers onOpen", () => {
      const onOpen = vi.fn();
      render(
        <ToolTile
          manifest={sampleManifest}
          appData={{}}
          onOpen={onOpen}
        />
      );

      const tile = screen.getByTestId("tool-tile");
      expect(tile.getAttribute("role")).toBe("button");
      expect(tile.getAttribute("tabIndex")).toBe("0");

      fireEvent.keyDown(tile, { key: "Enter" });
      expect(onOpen).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(tile, { key: " " });
      expect(onOpen).toHaveBeenCalledTimes(2);
    });

    it("hides sleep and export buttons and displays 'shared' tag when isShared is true", () => {
      render(
        <ToolTile
          manifest={sampleManifest}
          appData={{}}
          isShared={true}
          onOpen={vi.fn()}
          onSleep={vi.fn()}
          onExport={vi.fn()}
        />
      );

      expect(screen.getByText("shared")).toBeTruthy();
      expect(screen.queryByLabelText(`Sleep ${sampleManifest.name}`)).toBeNull();
      expect(screen.queryByLabelText(`Export ${sampleManifest.name}`)).toBeNull();
    });

    it("HomeScreen renders 'shared' and hides controls for tools belonging to another user", () => {
      const otherUserApp: SavedApp = {
        id: "app-shared-1",
        user_id: "other-user-999",
        name: "Partner's Tool",
        icon: "🤝",
        manifest: { ...sampleManifest, name: "Partner's Tool" },
        schema_version: 2,
        status: "active",
        pinned_order: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      };

      useAppStore.setState({
        apps: [otherUserApp],
        fetchApps: vi.fn().mockResolvedValue(undefined),
        fetchEntitlementAndUsage: vi.fn().mockResolvedValue(undefined),
      });

      render(
        <MemoryRouter>
          <HomeScreen />
        </MemoryRouter>
      );

      expect(screen.getByText("shared")).toBeTruthy();
      expect(screen.queryByLabelText("Sleep Partner's Tool")).toBeNull();
      expect(screen.queryByLabelText("Export Partner's Tool")).toBeNull();
    });
  });
});
