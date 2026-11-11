// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Toggle } from "./Toggle";

afterEach(() => {
  cleanup();
});

describe("Toggle component", () => {
  it("toggles uncontrolled state and invokes onToggle with next boolean", () => {
    const onToggle = vi.fn<(next: boolean) => void>();
    render(<Toggle label="Bedroom Lamp" defaultValue={false} onToggle={onToggle} />);

    const btn = screen.getByRole("switch", { name: "Bedroom Lamp" });
    expect(btn.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("off")).toBeTruthy();

    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(btn.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("on")).toBeTruthy();
  });

  it("disables clicks and shows syncing label while loading", () => {
    const onToggle = vi.fn<(next: boolean) => void>();
    render(<Toggle label="Lamp" checked={false} loading={true} onToggle={onToggle} />);

    const btn = screen.getByRole("switch", { name: "Lamp" });
    expect(btn.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("syncing...")).toBeTruthy();

    fireEvent.click(btn);
    expect(onToggle).not.toHaveBeenCalled();
  });
});

