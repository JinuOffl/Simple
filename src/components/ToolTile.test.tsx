// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ToolTile } from "./ToolTile";
import type { ManifestV2 } from "@/schema/manifest.v2";

const createBaseManifest = (size?: "1x1" | "2x1" | "2x2" | "4x2"): ManifestV2 => ({
  schema_version: 2,
  app_id: "test-tool",
  name: "Daily Habits",
  icon: "✅",
  permissions: [],
  connectors: [],
  tool: size ? { size } : undefined,
  data: { collections: [] },
  screens: [
    {
      id: "main",
      title: "Main",
      nodes: [
        {
          id: "t1",
          type: "text",
          props: { content: "Habit 1: Drink water" },
        },
      ],
    },
  ],
  actions: [],
});

describe("ToolTile", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it.each([
    ["1x1" as const, "col-span-1"],
    ["2x1" as const, "col-span-2"],
    ["2x2" as const, "col-span-2 row-span-2"],
    ["4x2" as const, "col-span-4 row-span-2"],
  ])("renders the right class for size %s (%s)", (size, expectedClass) => {
    const manifest = createBaseManifest(size);
    render(<ToolTile manifest={manifest} onOpen={vi.fn()} />);
    const tile = screen.getByTestId("tool-tile");
    expect(tile.className).toContain(expectedClass);
  });

  it("defaults to 2x1 (col-span-2) when tool.size is undefined", () => {
    const manifest = createBaseManifest(undefined);
    render(<ToolTile manifest={manifest} onOpen={vi.fn()} />);
    const tile = screen.getByTestId("tool-tile");
    expect(tile.className).toContain("col-span-2");
  });

  it("calls onOpen when clicking card body", () => {
    const onOpen = vi.fn();
    const manifest = createBaseManifest("2x1");
    render(<ToolTile manifest={manifest} onOpen={onOpen} />);

    fireEvent.click(screen.getByTestId("tool-tile"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("calls onOpen when clicking the ↗ button and stops propagation", () => {
    const onOpen = vi.fn();
    const manifest = createBaseManifest("2x1");
    render(<ToolTile manifest={manifest} onOpen={onOpen} />);

    const openBtn = screen.getByRole("button", { name: /Open Daily Habits/i });
    fireEvent.click(openBtn);
    // Should be called once from the button (stopped propagation so card onClick doesn't double-call)
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("calls onSleep and onExport when provided and clicked", () => {
    const onOpen = vi.fn();
    const onSleep = vi.fn();
    const onExport = vi.fn();
    const manifest = createBaseManifest("2x1");

    render(
      <ToolTile
        manifest={manifest}
        onOpen={onOpen}
        onSleep={onSleep}
        onExport={onExport}
        status="Ready"
      />
    );

    expect(screen.getByText("Ready")).toBeTruthy();

    const sleepBtn = screen.getByRole("button", { name: /Sleep Daily Habits/i });
    fireEvent.click(sleepBtn);
    expect(onSleep).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();

    const exportBtn = screen.getByRole("button", { name: /Export Daily Habits/i });
    fireEvent.click(exportBtn);
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
