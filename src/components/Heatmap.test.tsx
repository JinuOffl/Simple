// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Heatmap } from "./Heatmap";
import type { RegistryRenderContext } from "@/registry/types";

describe("Heatmap", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("renders rows, header title, and defaults to 14 days", () => {
    render(
      <Heatmap
        id="hm1"
        rows={["Gym", "Reading"]}
        title="Weekly Habits"
      />
    );

    expect(screen.getByText("Weekly Habits")).toBeTruthy();
    expect(screen.getByText("Gym")).toBeTruthy();
    expect(screen.getByText("Reading")).toBeTruthy();
    expect(screen.getByText("14d")).toBeTruthy();

    // Verify day 14 (today) has today indicator
    expect(screen.getByText("TD")).toBeTruthy();
  });

  it("outlines today's column with ring styling and data-today", () => {
    render(
      <Heatmap
        id="hm2"
        rows={["Water"]}
        days={7}
      />
    );

    const todayCell = screen.getByTestId("heatmap-cell-Water-6");
    expect(todayCell.getAttribute("data-today")).toBe("true");
    expect(todayCell.className).toContain("ring-1");

    const day0Cell = screen.getByTestId("heatmap-cell-Water-0");
    expect(day0Cell.getAttribute("data-today")).toBeNull();
  });

  it("toggles cell active state and dispatches onDataChange", () => {
    const onDataChange = vi.fn();
    const mockCtx: RegistryRenderContext = {
      nodeId: "hm3",
      appData: {},
      onDataChange,
    };

    render(
      <Heatmap
        id="hm3"
        rows={["Run"]}
        days={7}
        save_to="run_tracker"
        ctx={mockCtx}
      />
    );

    const cell = screen.getByTestId("heatmap-cell-Run-2");
    expect(cell.getAttribute("data-active")).toBe("false");

    fireEvent.click(cell);
    expect(cell.getAttribute("data-active")).toBe("true");
    expect(onDataChange).toHaveBeenCalledWith(
      "run_tracker",
      expect.objectContaining({
        Run: [false, false, true, false, false, false, false],
      })
    );

    // Clicking again toggles off
    fireEvent.click(cell);
    expect(cell.getAttribute("data-active")).toBe("false");
  });

  it("does not write to localStorage in preview mode", () => {
    const onDataChange = vi.fn();
    const mockCtx: RegistryRenderContext = {
      nodeId: "hm_prev",
      appData: {},
      isPreview: true,
      onDataChange,
    };

    render(
      <Heatmap
        id="hm_prev"
        rows={["Piano"]}
        days={5}
        ctx={mockCtx}
      />
    );

    const cell = screen.getByTestId("heatmap-cell-Piano-0");
    fireEvent.click(cell);

    expect(onDataChange).toHaveBeenCalled();
    expect(localStorage.getItem("simple_heatmap_hm_prev")).toBeNull();
  });

  it("persists to localStorage in normal (non-preview) mode", () => {
    const mockCtx: RegistryRenderContext = {
      nodeId: "hm_persist",
      appData: {},
      isPreview: false,
    };

    render(
      <Heatmap
        id="hm_persist"
        rows={["Guitar"]}
        days={5}
        ctx={mockCtx}
      />
    );

    const cell = screen.getByTestId("heatmap-cell-Guitar-1");
    fireEvent.click(cell);

    const stored = localStorage.getItem("simple_heatmap_hm_persist");
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.Guitar[1]).toBe(true);
  });
});
