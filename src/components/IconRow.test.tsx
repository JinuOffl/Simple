// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { IconRow, type IconRowItem } from "./IconRow";
import type { RegistryRenderContext } from "@/registry/types";

describe("IconRow", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders up to 4 action items with icons and labels", () => {
    const items: IconRowItem[] = [
      { icon: "camera", label: "Snap", action: "act_cam" },
      { icon: "bulb", label: "Light", action: "act_bulb" },
      { icon: "moon", label: "Sleep", action: "act_moon" },
      { icon: "timer", label: "Timer", action: "act_timer" },
    ];

    render(<IconRow items={items} />);

    expect(screen.getByTestId("icon-row-item-camera")).toBeTruthy();
    expect(screen.getByTestId("icon-row-item-bulb")).toBeTruthy();
    expect(screen.getByTestId("icon-row-item-moon")).toBeTruthy();
    expect(screen.getByTestId("icon-row-item-timer")).toBeTruthy();
    expect(screen.getByText("Snap")).toBeTruthy();
    expect(screen.getByText("Light")).toBeTruthy();
  });

  it("strictly caps displayed items to max 4 even if more are passed", () => {
    const items: IconRowItem[] = [
      { icon: "camera", label: "1" },
      { icon: "bulb", label: "2" },
      { icon: "layers", label: "3" },
      { icon: "moon", label: "4" },
      { icon: "mic", label: "5" },
    ];

    render(<IconRow items={items} />);

    expect(screen.getByTestId("icon-row-item-camera")).toBeTruthy();
    expect(screen.getByTestId("icon-row-item-moon")).toBeTruthy();
    expect(screen.queryByTestId("icon-row-item-mic")).toBeNull();
  });

  it("calls ctx.onAction with action id when item is clicked", () => {
    const onAction = vi.fn();
    const mockCtx: RegistryRenderContext = {
      nodeId: "ir_1",
      appData: {},
      onAction,
    };

    const items: IconRowItem[] = [
      { icon: "bulb", label: "Toggle Light", action: "action_toggle_light" },
      { icon: "camera", label: "Camera" }, // no action
    ];

    render(<IconRow items={items} ctx={mockCtx} />);

    const bulbBtn = screen.getByTestId("icon-row-item-bulb");
    fireEvent.click(bulbBtn);
    expect(onAction).toHaveBeenCalledWith("action_toggle_light");

    // Clicking item without action does not throw or call onAction
    onAction.mockClear();
    const camBtn = screen.getByTestId("icon-row-item-camera");
    fireEvent.click(camBtn);
    expect(onAction).not.toHaveBeenCalled();
  });
});
