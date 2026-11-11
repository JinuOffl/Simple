// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { Manifest } from "@/schema/manifest.v1";
import type { ManifestV2 } from "@/schema/manifest.v2";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn(),
    functions: { invoke: vi.fn() },
    auth: {
      signOut: vi.fn<() => Promise<{ error: null }>>().mockResolvedValue({ error: null }),
    },
  },
}));

import { ManifestRenderer } from "./ManifestRenderer";
import { mcpToggleManifest } from "@/demo/mcpToggleManifest";
import { supabase } from "@/lib/supabaseClient";
import { validateManifestV2 } from "@/schema/validator";

beforeAll(() => {
  if (typeof Element.prototype.scrollTo !== "function") {
    Element.prototype.scrollTo = () => {};
  }
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const outfitPickerV1: Manifest = {
  app_id: "app-123",
  name: "Outfit Picker",
  icon: "👗",
  permissions: ["camera"],
  components: [
    { id: "c1", type: "image_capture", props: { label: "Take a photo" }, on_click: "a1" },
    { id: "c2", type: "text", props: { content: "Your recommendation will appear here" } },
    { id: "c3", type: "button", props: { label: "Get Recommendation" }, on_click: "a1" },
  ],
  actions: [
    {
      id: "a1",
      kind: "llm_call",
      prompt_template: "Look at this outfit photo: {{image_data}}.",
      render_result_into: "c2",
      input_from: ["c1"],
    },
  ],
};

const feynmanTutorV1: Manifest = {
  app_id: "app-feynman",
  name: "Feynman Tutor",
  icon: "🎓",
  permissions: ["microphone"],
  components: [
    { id: "c1", type: "text", props: { content: "What topic do you want to learn?" } },
    {
      id: "c2",
      type: "conversation_loop",
      props: { persona_prompt: "You are a Socratic tutor" },
    },
  ],
  actions: [
    {
      id: "a1",
      kind: "conversation_loop",
      persona_prompt: "You are a Feynman-style tutor.",
      render_result_into: "c2",
    },
  ],
};

const kitchenSinkV1: Manifest = {
  app_id: "app-widgets",
  name: "Daily Hub",
  icon: "🛠️",
  permissions: [],
  components: [
    { id: "w1", type: "text", props: { content: "Morning overview" } },
    { id: "w2", type: "card", props: { title: "Focus", body: "Ship Phase 1 tests" } },
    { id: "w3", type: "checklist", props: { items: ["Buy milk", "Walk the dog"] } },
    { id: "w4", type: "calculator" },
    { id: "w5", type: "clock", props: { timezone: "Asia/Tokyo", format: "24h", label: "Tokyo" } },
    { id: "w6", type: "button", props: { label: "Refresh" } },
  ],
  actions: [],
};

describe("ManifestRenderer", () => {
  it("renders v1 Outfit Picker manifest via registry", () => {
    render(<ManifestRenderer manifest={outfitPickerV1} />);

    expect(screen.getByText("Outfit Picker")).toBeTruthy();
    expect(screen.getByText("Uses: camera")).toBeTruthy();
    expect(screen.getByText("Take a photo")).toBeTruthy();
    expect(screen.getByText("Your recommendation will appear here")).toBeTruthy();
    expect(screen.getByRole("button", { name: /get recommendation/i })).toBeTruthy();
  });

  it("renders v1 Feynman Tutor manifest with conversation_loop", () => {
    render(<ManifestRenderer manifest={feynmanTutorV1} />);

    expect(screen.getByText("Feynman Tutor")).toBeTruthy();
    expect(screen.getByText("What topic do you want to learn?")).toBeTruthy();
    expect(screen.getByPlaceholderText("Type a message…")).toBeTruthy();
  });

  it("renders v1 Checklist, Calculator, Clock, Button, Card, and Text manifest", () => {
    render(<ManifestRenderer manifest={kitchenSinkV1} />);

    expect(screen.getByText("Daily Hub")).toBeTruthy();
    expect(screen.getByText("Morning overview")).toBeTruthy();
    expect(screen.getByText("Focus")).toBeTruthy();
    expect(screen.getByText("Ship Phase 1 tests")).toBeTruthy();
    expect(screen.getByText("Buy milk")).toBeTruthy();
    expect(screen.getByText("Walk the dog")).toBeTruthy();
    expect(screen.getByText("0/2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "=" })).toBeTruthy();
    expect(screen.getByText("TOKYO")).toBeTruthy();
    expect(screen.getByRole("button", { name: /refresh/i })).toBeTruthy();
  });

  it("renders a v2 multi-screen manifest and switches screens when clicking a navigate button", async () => {
    const multiScreenV2: ManifestV2 = {
      schema_version: 2,
      app_id: "app-multi",
      name: "Multi Screen App",
      icon: "🧭",
      permissions: [],
      connectors: [],
      data: { collections: [] },
      screens: [
        {
          id: "home",
          title: "Home",
          nodes: [
            { id: "h1", type: "text", props: { content: "Welcome to Home Screen" } },
            { id: "h2", type: "button", props: { label: "Open Settings" }, on_click: "go_settings" },
          ],
        },
        {
          id: "settings",
          title: "Settings",
          nodes: [
            { id: "s1", type: "text", props: { content: "Settings Screen Content" } },
          ],
        },
      ],
      actions: [
        {
          id: "go_settings",
          kind: "navigate",
          params: { target: "settings" },
        },
      ],
    };

    render(<ManifestRenderer manifest={multiScreenV2} />);

    expect(screen.getByText("Welcome to Home Screen")).toBeTruthy();
    expect(screen.queryByText("Settings Screen Content")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /open settings/i }));

    await waitFor(() => {
      expect(screen.getByText("Settings Screen Content")).toBeTruthy();
    });
    expect(screen.queryByText("Welcome to Home Screen")).toBeNull();
    expect(screen.getByRole("button", { name: "Settings" }).getAttribute("aria-current")).toBe("page");
  });

  it("injects appData[node.bind] via bind into text and card components", () => {
    const boundV2: ManifestV2 = {
      schema_version: 2,
      app_id: "app-bind",
      name: "Bound App",
      icon: "🔗",
      permissions: [],
      connectors: [],
      data: { collections: [] },
      screens: [
        {
          id: "main",
          title: "Main",
          nodes: [
            { id: "t1", type: "text", props: { content: "Fallback text" }, bind: "headline" },
            {
              id: "c1",
              type: "card",
              props: { title: "Summary", body: "Fallback body" },
              bind: "details",
            },
          ],
        },
      ],
      actions: [],
    };

    render(
      <ManifestRenderer
        manifest={boundV2}
        appData={{ headline: "Live Bound Heading", details: "Live Bound Body" }}
      />
    );

    expect(screen.getByText("Live Bound Heading")).toBeTruthy();
    expect(screen.getByText("Live Bound Body")).toBeTruthy();
    expect(screen.queryByText("Fallback text")).toBeNull();
    expect(screen.queryByText("Fallback body")).toBeNull();
  });

  it("calls onDataChange with computed sum when clicking a button wired to local_compute (add)", async () => {
    const onDataChange = vi.fn<(key: string, value: unknown) => void>();
    const computeV2: ManifestV2 = {
      schema_version: 2,
      app_id: "app-calc-action",
      name: "Adder App",
      icon: "➕",
      permissions: [],
      connectors: [],
      data: { collections: [] },
      screens: [
        {
          id: "main",
          title: "Main",
          nodes: [
            { id: "sum_out", type: "text", bind: "sum_out" },
            { id: "add_btn", type: "button", props: { label: "Add Numbers" }, on_click: "act_add" },
          ],
        },
      ],
      actions: [
        {
          id: "act_add",
          kind: "local_compute",
          operation: "add",
          input_from: ["x", "y"],
          render_result_into: "sum_out",
        },
      ],
    };

    render(
      <ManifestRenderer
        manifest={computeV2}
        appData={{ x: 15, y: 27 }}
        onDataChange={onDataChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /add numbers/i }));

    await waitFor(() => {
      expect(onDataChange).toHaveBeenCalledWith("sum_out", "42");
    });
  });

  it("renders stub components (slider, chart) cleanly without crashing", () => {
    const stubV2: ManifestV2 = {
      schema_version: 2,
      app_id: "app-stubs",
      name: "Stub Preview",
      icon: "🧩",
      permissions: [],
      connectors: [],
      data: { collections: [] },
      screens: [
        {
          id: "main",
          title: "Main",
          nodes: [
            { id: "st1", type: "slider", props: { label: "Brightness", min: 0, max: 100 } },
            {
              id: "st2",
              type: "chart",
              props: {
                chart_type: "bar",
                labels: ["Mon", "Tue"],
                datasets: [{ label: "Steps", data: [5000, 7000] }],
              },
            },
          ],
        },
      ],
      actions: [],
    };

    render(<ManifestRenderer manifest={stubV2} />);

    expect(screen.getByText("(slider — coming soon)")).toBeTruthy();
    expect(screen.getByText("(chart — coming soon)")).toBeTruthy();
  });

  it("renders real Toggle component and dispatches mcp_call action via run-mcp-action", async () => {
    const invokeMock = vi.mocked(supabase.functions.invoke);
    invokeMock.mockResolvedValue({
      data: { result: "light.living_room is on" },
      error: null,
    });

    const onDataChange = vi.fn<(key: string, value: unknown) => void>();
    const validation = validateManifestV2(mcpToggleManifest);
    expect(validation.kind).toBe("valid");

    render(
      <ManifestRenderer
        manifest={mcpToggleManifest}
        appData={{ light_state: false }}
        onDataChange={onDataChange}
      />
    );

    const switchBtn = screen.getByRole("switch", { name: "Living Room Light" });
    expect(switchBtn.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(switchBtn);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("run-mcp-action", {
        body: {
          action: mcpToggleManifest.actions[0],
          app_data: { light_state: true, state: true },
        },
      });
    });

    await waitFor(() => {
      expect(onDataChange).toHaveBeenCalledWith("light_state", true);
      expect(onDataChange).toHaveBeenCalledWith("status_card", "light.living_room is on");
    });
  });
});
