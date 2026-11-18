// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Status } from "./Status";
import type { RegistryRenderContext } from "@/registry/types";

describe("Status", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders label and ok state check-circle icon by default", () => {
    render(<Status label="Battery Health Good" />);

    expect(screen.getByText("Battery Health Good")).toBeTruthy();
    expect(screen.getByTestId("status-icon-ok")).toBeTruthy();
  });

  it("renders warning icon when state is warn", () => {
    render(<Status label="High Storage Usage" state="warn" />);

    expect(screen.getByText("High Storage Usage")).toBeTruthy();
    expect(screen.getByTestId("status-icon-warn")).toBeTruthy();
  });

  it("renders empty circle icon when state is off", () => {
    render(<Status label="Bluetooth Disconnected" state="off" />);

    expect(screen.getByText("Bluetooth Disconnected")).toBeTruthy();
    expect(screen.getByTestId("status-icon-off")).toBeTruthy();
  });

  it("reads ctx.bindValue when it is a string to override label", () => {
    const mockCtx: RegistryRenderContext = {
      nodeId: "stat_1",
      appData: {},
      bindValue: "Dynamic Sensor Connected",
    };

    render(
      <Status
        label="Default Sensor Offline"
        ctx={mockCtx}
      />
    );

    expect(screen.getByText("Dynamic Sensor Connected")).toBeTruthy();
    expect(screen.queryByText("Default Sensor Offline")).toBeNull();
  });

  it("falls back to label when ctx.bindValue is not a string", () => {
    const mockCtx: RegistryRenderContext = {
      nodeId: "stat_2",
      appData: {},
      bindValue: 42,
    };

    render(
      <Status
        label="Static Label Fallback"
        ctx={mockCtx}
      />
    );

    expect(screen.getByText("Static Label Fallback")).toBeTruthy();
  });
});
