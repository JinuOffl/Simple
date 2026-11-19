// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { StrictMode } from "react";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { downscaleImage } from "@/lib/imageUtils";
import { ImageCaptureAdapter, ImageGalleryAdapter, TableAdapter } from "@/registry/adapters";
import { BuilderScreen } from "./BuilderScreen";
import { mapBuilderErrorMessage } from "@/lib/builderError";
import { useAppStore } from "@/lib/zustandStore";
import type { RegistryRenderContext } from "@/registry/types";

// Mock generateAppWithFallback
const mockGenerateAppWithFallback = vi.fn();
vi.mock("@/lib/generationClient", () => ({
  generateAppWithFallback: (...args: unknown[]) => mockGenerateAppWithFallback(...args),
  getGenerationLog: () => [],
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
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
}));

describe("Phase 3 — Functional Bugs & Hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Guard HTMLElement.prototype.scrollTo for jsdom
    if (!window.HTMLElement.prototype.scrollTo) {
      window.HTMLElement.prototype.scrollTo = vi.fn();
    }
  });

  afterEach(() => {
    cleanup();
  });

  describe("3.1: Camera -> Gallery downscaling & array storage (max 12)", () => {
    it("downscaleImage downsizes image to max 800px on long side and exports jpeg 0.7", async () => {
      const mockDrawImage = vi.fn();
      const mockToDataURL = vi.fn(() => "data:image/jpeg;base64,downscaled-data");

      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
        drawImage: mockDrawImage,
      } as unknown as CanvasRenderingContext2D);
      vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(mockToDataURL);

      // Mock Image constructor with 1600x1200 dimensions
      const originalImage = window.Image;
      class MockImage {
        width = 1600;
        height = 1200;
        naturalWidth = 1600;
        naturalHeight = 1200;
        crossOrigin = "";
        _src = "";
        set src(val: string) {
          this._src = val;
          setTimeout(() => this.onload?.(), 0);
        }
        get src() {
          return this._src;
        }
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
      }
      window.Image = MockImage as unknown as typeof Image;

      try {
        const result = await downscaleImage("data:image/png;base64,test-large-photo", 800, 0.7);
        expect(result).toBe("data:image/jpeg;base64,downscaled-data");
        expect(mockDrawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 800, 600);
        expect(mockToDataURL).toHaveBeenCalledWith("image/jpeg", 0.7);
      } finally {
        window.Image = originalImage;
      }
    });

    it("ImageCaptureAdapter appends captures as string[] under save_to (caps at 12) and ImageGalleryAdapter renders them", async () => {
      const onDataChange = vi.fn();
      const initialPhotos = Array.from({ length: 11 }, (_, i) => `data:image/jpeg;base64,photo-${i}`);
      const appData: Record<string, unknown> = {
        captured_photos: initialPhotos,
      };

      const ctx: RegistryRenderContext = {
        nodeId: "capture-1",
        appId: "app-1",
        appData,
        onDataChange,
      };

      const { container } = render(
        <ImageCaptureAdapter
          id="capture-1"
          label="Snap"
          save_to="captured_photos"
          ctx={ctx}
        />
      );

      // Trigger file change
      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).toBeTruthy();

      // Simulate a file selection
      const blob = new Blob(["fake-image-content"], { type: "image/jpeg" });
      const file = new File([blob], "camera.jpg", { type: "image/jpeg" });

      // Mock FileReader and Image
      const originalFileReader = window.FileReader;
      const originalImage = window.Image;
      class MockFileReader {
        result = "data:image/jpeg;base64,new-snap";
        onload: (() => void) | null = null;
        readAsDataURL() {
          setTimeout(() => this.onload?.(), 0);
        }
      }
      class MockImage {
        width = 400;
        height = 300;
        naturalWidth = 400;
        naturalHeight = 300;
        crossOrigin = "";
        _src = "";
        set src(val: string) {
          this._src = val;
          setTimeout(() => this.onload?.(), 0);
        }
        get src() {
          return this._src;
        }
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
      }
      window.FileReader = MockFileReader as unknown as typeof FileReader;
      window.Image = MockImage as unknown as typeof Image;

      try {
        fireEvent.change(fileInput, { target: { files: [file] } });

        await waitFor(() => {
          expect(onDataChange).toHaveBeenCalledTimes(1);
        });

        const [key, storedArray] = onDataChange.mock.calls[0];
        expect(key).toBe("captured_photos");
        expect(Array.isArray(storedArray)).toBe(true);
        expect(storedArray.length).toBe(12); // capped at 12
        expect(storedArray[storedArray.length - 1]).toBe("data:image/jpeg;base64,downscaled-data");

        // Now render ImageGalleryAdapter with the stored photos
        const galleryCtx: RegistryRenderContext = {
          nodeId: "gallery-1",
          appId: "app-1",
          appData: {
            captured_photos: storedArray,
          },
        };

        const { unmount } = render(
          <ImageGalleryAdapter
            id="gallery-1"
            source="captured_photos"
            ctx={galleryCtx}
          />
        );

        // Images are rendered in the gallery
        const renderedImgs = screen.getAllByRole("button");
        expect(renderedImgs.length).toBeGreaterThanOrEqual(12);
        unmount();
      } finally {
        window.FileReader = originalFileReader;
        window.Image = originalImage;
      }
    });
  });

  describe("3.7: TableAdapter reads rows from ctx.appData[bind] (record_insert collections & arrays)", () => {
    it("renders table rows when ctx.bindValue is an array of record objects", () => {
      const records = [
        { Name: "Product A", Price: "$25", Stock: "100" },
        { Name: "Product B", Price: "$40", Stock: "42" },
      ];

      const ctx: RegistryRenderContext = {
        nodeId: "tbl-1",
        appId: "app-1",
        appData: { inventory: records },
        bindValue: records,
      };

      render(
        <TableAdapter
          id="tbl-1"
          columns={["Name", "Price", "Stock"]}
          ctx={ctx}
        />
      );

      expect(screen.getByText("Product A")).toBeTruthy();
      expect(screen.getByText("$25")).toBeTruthy();
      expect(screen.getByText("Product B")).toBeTruthy();
      expect(screen.getByText("$40")).toBeTruthy();
    });

    it("renders table rows when ctx.bindValue is a 2D array of strings", () => {
      const matrix = [
        ["Alice", "95"],
        ["Bob", "88"],
      ];

      const ctx: RegistryRenderContext = {
        nodeId: "tbl-2",
        appId: "app-1",
        appData: { scores: matrix },
        bindValue: matrix,
      };

      render(
        <TableAdapter
          id="tbl-2"
          columns={["Student", "Score"]}
          ctx={ctx}
        />
      );

      expect(screen.getByText("Alice")).toBeTruthy();
      expect(screen.getByText("95")).toBeTruthy();
      expect(screen.getByText("Bob")).toBeTruthy();
      expect(screen.getByText("88")).toBeTruthy();
    });
  });

  describe("3.8: Prefill guard under React StrictMode", () => {
    it("runs prefill generation exactly ONCE even under React.StrictMode", async () => {
      mockGenerateAppWithFallback.mockResolvedValue({
        ok: true,
        manifest: {
          schema_version: 2,
          app_id: "prefilled-tool",
          name: "Prefilled Tool",
          icon: "🚀",
          permissions: [],
          connectors: [],
          data: { collections: [] },
          screens: [{ id: "main", title: "Main", nodes: [] }],
          actions: [],
        },
      });

      useAppStore.setState({
        session: {
          user: { id: "user-123", email: "user@example.com" } as never,
          access_token: "token",
        } as never,
      });

      render(
        <StrictMode>
          <MemoryRouter
            initialEntries={[
              {
                pathname: "/build",
                state: { prefillPrompt: "Build a hydration reminder" },
              },
            ]}
          >
            <BuilderScreen />
          </MemoryRouter>
        </StrictMode>
      );

      await waitFor(() => {
        expect(mockGenerateAppWithFallback).toHaveBeenCalledTimes(1);
      });

      expect(mockGenerateAppWithFallback).toHaveBeenCalledWith(
        expect.objectContaining({
          userPrompt: "Build a hydration reminder",
        })
      );
    });
  });

  describe("3.9: Builder error message mapping", () => {
    it("maps 402 / credit exhaustion to friendly message without raw error in PROD", () => {
      const msg = mapBuilderErrorMessage("Server error 402: Insufficient credits. Balance depleted.", false);
      expect(msg).toBe("Credit balance depleted. Upgrade your plan to generate more tools.");
    });

    it("maps 429 / rate limit to friendly message without raw error in PROD", () => {
      const msg = mapBuilderErrorMessage("Error 429: Too many requests. Wait a minute.", false);
      expect(msg).toBe("Rate limit reached. Please wait a minute before generating again.");
    });

    it("maps 503 / disabled to friendly message without raw error in PROD", () => {
      const msg = mapBuilderErrorMessage("503 Generation is temporarily disabled. Please try again later.", false);
      expect(msg).toBe("Generation is temporarily disabled. Please try again later.");
    });

    it("maps offline guest error to friendly message", () => {
      const msg = mapBuilderErrorMessage("Guest mode is offline. Sign in with email to build tools.", false);
      expect(msg).toBe("Guest mode is offline. Sign in with email to build tools.");
    });

    it("includes raw details when isDev is true", () => {
      const raw = "Error 429: Too many requests";
      const msg = mapBuilderErrorMessage(raw, true);
      expect(msg).toContain("Rate limit reached. Please wait a minute before generating again.");
      expect(msg).toContain(`(${raw})`);
    });
  });
});
