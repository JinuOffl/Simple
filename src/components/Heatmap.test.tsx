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
    vi.useRealTimers();
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

  it("toggles cell active state and dispatches onDataChange with { start, rows } shape", () => {
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
        start: expect.any(String),
        rows: expect.objectContaining({
          Run: [false, false, true, false, false, false, false],
        }),
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

  it("persists { start, rows } to localStorage in normal (non-preview) mode", () => {
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
    expect(parsed.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(parsed.rows.Guitar[1]).toBe(true);
  });

  it("maintains backward compatibility with legacy Record<string, boolean[]> shape", () => {
    const legacyState = {
      Gym: [true, false, true, false, false, false, false],
    };
    localStorage.setItem("simple_heatmap_hm_legacy", JSON.stringify(legacyState));

    render(
      <Heatmap
        id="hm_legacy"
        rows={["Gym"]}
        days={7}
      />
    );

    // Day 0 was true in legacy data, today is day 6
    const cell0 = screen.getByTestId("heatmap-cell-Gym-0");
    expect(cell0.getAttribute("data-active")).toBe("true");

    const cell2 = screen.getByTestId("heatmap-cell-Gym-2");
    expect(cell2.getAttribute("data-active")).toBe("true");

    const cell1 = screen.getByTestId("heatmap-cell-Gym-1");
    expect(cell1.getAttribute("data-active")).toBe("false");
  });

  it("shifts rows left by elapsed days since start date", () => {
    vi.useFakeTimers();
    // System time set to 2 days after start date
    vi.setSystemTime(new Date("2026-05-12T10:00:00Z"));

    const storedData = {
      start: "2026-05-10",
      rows: {
        Workout: [true, false, false, true, false, false, true], // 7 days: day 0 was true, day 3 was true, day 6 (old today) was true
      },
    };
    localStorage.setItem("simple_heatmap_hm_shift", JSON.stringify(storedData));

    render(
      <Heatmap
        id="hm_shift"
        rows={["Workout"]}
        days={7}
      />
    );

    // Elapsed is 2 days.
    // Index 0 was Workout[0] -> shifted out.
    // Index 1 (Workout[3-2 = 1]) was false.
    // Index 4 (Workout[6-2 = 4]) should now have old today's value (true)!
    const cell4 = screen.getByTestId("heatmap-cell-Workout-4");
    expect(cell4.getAttribute("data-active")).toBe("true");

    // Index 6 (today) must be false
    const todayCell = screen.getByTestId("heatmap-cell-Workout-6");
    expect(todayCell.getAttribute("data-active")).toBe("false");
  });

  it("clears all days if elapsed days >= totalDays", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T10:00:00Z"));

    const storedData = {
      start: "2026-05-01",
      rows: {
        Water: [true, true, true, true, true, true, true],
      },
    };
    localStorage.setItem("simple_heatmap_hm_overflow", JSON.stringify(storedData));

    render(
      <Heatmap
        id="hm_overflow"
        rows={["Water"]}
        days={7}
      />
    );

    // All cells should be false
    for (let i = 0; i < 7; i++) {
      const cell = screen.getByTestId(`heatmap-cell-Water-${i}`);
      expect(cell.getAttribute("data-active")).toBe("false");
    }
  });
});
