// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
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
import { BuilderScreen } from "./BuilderScreen";

describe("BuilderScreen Layout and Status Row (Phase 5)", () => {
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
    });
  });

  it("renders status row under hairline showing Ready when manifest is empty", () => {
    useAppStore.setState({ currentManifest: null });

    render(
      <MemoryRouter>
        <BuilderScreen />
      </MemoryRouter>
    );

    const statusEl = screen.getByTestId("tool-status");
    expect(statusEl.textContent).toBe("Ready");

    // Rounded input pill
    const input = screen.getByPlaceholderText("describe the tool");
    expect(input).toBeTruthy();
    expect(input.className).toContain("rounded-full");

    const sendBtn = document.getElementById("builder-send-button");
    expect(sendBtn?.className).toContain("rounded-full");
  });

  it("renders status row displaying Needs device: camera when manifest requires camera", () => {
    const cameraManifest: ManifestV2 = {
      schema_version: 2,
      app_id: "cam-tool",
      name: "Camera Tool",
      icon: "📷",
      permissions: ["camera"],
      connectors: [],
      tool: { size: "2x1" },
      data: { collections: [] },
      screens: [
        {
          id: "main",
          title: "Main",
          nodes: [{ id: "n1", type: "text", props: { content: "Snap a photo" } }],
        },
      ],
      actions: [],
    };

    useAppStore.setState({ currentManifest: cameraManifest });

    render(
      <MemoryRouter>
        <BuilderScreen />
      </MemoryRouter>
    );

    const statusEl = screen.getByTestId("tool-status");
    expect(statusEl.textContent).toBe("Needs device: camera");
  });

  it("renders status row displaying Needs API key: <label> when manifest requires key", () => {
    const keyManifest: ManifestV2 = {
      schema_version: 2,
      app_id: "weather-tool",
      name: "Live Weather",
      icon: "🌤️",
      permissions: [],
      connectors: [],
      tool: {
        size: "2x1",
        requires: [{ key_id: "weather_api", label: "OpenWeather API Key" }],
      },
      data: { collections: [] },
      screens: [
        {
          id: "main",
          title: "Main",
          nodes: [{ id: "n2", type: "text", props: { content: "Weather Forecast" } }],
        },
      ],
      actions: [],
    };

    useAppStore.setState({ currentManifest: keyManifest });

    render(
      <MemoryRouter>
        <BuilderScreen />
      </MemoryRouter>
    );

    const statusEl = screen.getByTestId("tool-status");
    expect(statusEl.textContent).toBe("Needs API key: OpenWeather API Key");
  });
});
