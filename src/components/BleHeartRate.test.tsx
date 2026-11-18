// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { BleHeartRate } from "./BleHeartRate";
import { parseHeartRateMeasurement } from "@/lib/ble";
import type { RegistryRenderContext } from "@/registry/types";

describe("parseHeartRateMeasurement (Bluetooth HRS 0x2A37 spec)", () => {
  it("parses 8-bit Heart Rate format when flag bit 0 is 0", () => {
    // Flags: 0x00 (8-bit value, sensor contact not supported), Value: 72 bpm
    const buffer = new Uint8Array([0x00, 72]);
    const view = new DataView(buffer.buffer);
    expect(parseHeartRateMeasurement(view)).toBe(72);

    // Flags: 0x06 (8-bit value, sensor contact detected), Value: 145 bpm
    const bufferContact = new Uint8Array([0x06, 145]);
    const viewContact = new DataView(bufferContact.buffer);
    expect(parseHeartRateMeasurement(viewContact)).toBe(145);
  });

  it("parses 16-bit Heart Rate format when flag bit 0 is 1 (little-endian)", () => {
    // Flags: 0x01 (16-bit value), Value: 288 (0x0120: low byte = 0x20, high byte = 0x01)
    const buffer16 = new Uint8Array([0x01, 0x20, 0x01]);
    const view16 = new DataView(buffer16.buffer);
    expect(parseHeartRateMeasurement(view16)).toBe(288);

    // Value: 185 (low byte = 185, high byte = 0)
    const buffer185 = new Uint8Array([0x01, 185, 0]);
    const view185 = new DataView(buffer185.buffer);
    expect(parseHeartRateMeasurement(view185)).toBe(185);
  });

  it("throws for truncated or malformed buffers", () => {
    const emptyView = new DataView(new Uint8Array([]).buffer);
    expect(() => parseHeartRateMeasurement(emptyView)).toThrow(/buffer too short/i);

    const truncated16 = new DataView(new Uint8Array([0x01, 0x50]).buffer);
    expect(() => parseHeartRateMeasurement(truncated16)).toThrow(/buffer too short/i);
  });
});

describe("BleHeartRate Component", () => {
  const originalBluetooth = (navigator as any).bluetooth;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    if (originalBluetooth !== undefined) {
      Object.defineProperty(navigator, "bluetooth", {
        value: originalBluetooth,
        configurable: true,
        writable: true,
      });
    } else {
      delete (navigator as any).bluetooth;
    }
  });

  it("renders Unsupported warning when navigator.bluetooth is absent", () => {
    delete (navigator as any).bluetooth;

    render(<BleHeartRate label="Pulse Sensor" />);

    expect(screen.getByText("Pulse Sensor")).toBeTruthy();
    expect(screen.getByTestId("ble-status-pill").textContent).toBe("Unsupported");
    expect(screen.getByText(/Web Bluetooth is not supported in this browser/i)).toBeTruthy();
  });

  it("connects to BLE heart rate monitor, streams BPM, and notifies ctx.onDataChange", async () => {
    const onDataChange = vi.fn();
    const mockCtx: RegistryRenderContext = {
      nodeId: "hr_node",
      appData: {},
      onDataChange,
    };

    let characteristicListener: ((e: any) => void) | null = null;
    let disconnectListener: (() => void) | null = null;

    const mockCharacteristic = {
      startNotifications: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn((event, cb) => {
        if (event === "characteristicvaluechanged") {
          characteristicListener = cb;
        }
      }),
    };

    const mockService = {
      getCharacteristic: vi.fn().mockResolvedValue(mockCharacteristic),
    };

    const mockGatt = {
      connected: true,
      connect: vi.fn().mockResolvedValue({
        getPrimaryService: vi.fn().mockResolvedValue(mockService),
      }),
      disconnect: vi.fn(),
    };

    const mockDevice = {
      name: "Polar H10",
      gatt: mockGatt,
      addEventListener: vi.fn((event, cb) => {
        if (event === "gattserverdisconnected") {
          disconnectListener = cb;
        }
      }),
    };

    const mockBluetooth = {
      requestDevice: vi.fn().mockResolvedValue(mockDevice),
    };

    Object.defineProperty(navigator, "bluetooth", {
      value: mockBluetooth,
      configurable: true,
      writable: true,
    });

    render(<BleHeartRate label="Polar Heart Rate" save_to="heart_bpm" ctx={mockCtx} />);

    expect(screen.getByTestId("ble-status-pill").textContent).toBe("Disconnected");

    const connectBtn = screen.getByTestId("ble-connect-button");
    expect(connectBtn.textContent).toContain("Connect");

    fireEvent.click(connectBtn);

    await waitFor(() => {
      expect(mockBluetooth.requestDevice).toHaveBeenCalledWith({
        filters: [{ services: ["heart_rate"] }],
      });
      expect(screen.getByTestId("ble-status-pill").textContent).toBe("Connected");
      expect(onDataChange).toHaveBeenCalledWith("heart_bpm_state", "connected");
    });

    // Simulate heart rate measurement notification: 78 bpm (flags = 0, bpm = 78)
    const testData = new Uint8Array([0x00, 78]);
    const mockEvent = {
      target: {
        value: new DataView(testData.buffer),
      },
    };

    expect(characteristicListener).toBeTruthy();
    act(() => {
      characteristicListener!(mockEvent);
    });

    await waitFor(() => {
      expect(screen.getByTestId("live-bpm-value").textContent).toBe("78");
      expect(onDataChange).toHaveBeenCalledWith("heart_bpm", 78);
    });

    // Simulate device disconnect
    expect(disconnectListener).toBeTruthy();
    act(() => {
      disconnectListener!();
    });

    await waitFor(() => {
      expect(screen.getByTestId("ble-status-pill").textContent).toBe("Disconnected");
      expect(onDataChange).toHaveBeenCalledWith("heart_bpm_state", "disconnected");
    });
  });
});
