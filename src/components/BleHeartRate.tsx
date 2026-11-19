import { useState, useEffect, useRef } from "react";
import { Activity, Wifi, WifiOff, AlertCircle } from "lucide-react";
import type { RegistryRenderContext } from "@/registry/types";
import { parseHeartRateMeasurement } from "@/lib/ble";

export interface BleHeartRateProps {
  id?: string;
  label?: string;
  save_to?: string;
  ctx?: RegistryRenderContext;
}

export function BleHeartRate({
  label = "Heart Rate Monitor",
  save_to = "bpm",
  ctx,
}: BleHeartRateProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [currentBpm, setCurrentBpm] = useState<number | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const deviceRef = useRef<any>(null);
  const characteristicRef = useRef<any>(null);

  const isBluetoothSupported =
    typeof navigator !== "undefined" && Boolean((navigator as any).bluetooth);

  const targetDataKey = save_to || "bpm";
  const targetStateKey = `${targetDataKey}_state`;

  const handleDisconnect = () => {
    if (deviceRef.current?.gatt?.connected) {
      try {
        deviceRef.current.gatt.disconnect();
      } catch {
        // Safe fallback
      }
    }
    setIsConnected(false);
    setCurrentBpm(null);
    setDeviceName(null);
    ctx?.onDataChange?.(targetStateKey, "disconnected");
  };

  const handleConnect = async () => {
    if (!isBluetoothSupported || isConnecting) return;

    setIsConnecting(true);
    setError(null);

    try {
      const bluetooth = (navigator as any).bluetooth;
      const device = await bluetooth.requestDevice({
        filters: [{ services: ["heart_rate"] }],
      });

      if (!device) {
        throw new Error("No BLE heart rate device selected.");
      }

      deviceRef.current = device;
      setDeviceName(device.name || "BLE Heart Rate Monitor");

      // Handle external or sudden disconnection
      device.addEventListener("gattserverdisconnected", () => {
        setIsConnected(false);
        setCurrentBpm(null);
        ctx?.onDataChange?.(targetStateKey, "disconnected");
      });

      const server = await device.gatt?.connect();
      if (!server) {
        throw new Error("Failed to connect to GATT server.");
      }

      const service = await server.getPrimaryService("heart_rate");
      const characteristic = await service.getCharacteristic("heart_rate_measurement");
      characteristicRef.current = characteristic;

      await characteristic.startNotifications();

      characteristic.addEventListener("characteristicvaluechanged", (event: any) => {
        const value = event.target?.value as DataView | undefined;
        if (!value) return;

        try {
          const bpm = parseHeartRateMeasurement(value);
          setCurrentBpm(bpm);
          ctx?.onDataChange?.(targetDataKey, bpm);
        } catch {
          // Ignore malformed packets
        }
      });

      setIsConnected(true);
      ctx?.onDataChange?.(targetStateKey, "connected");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bluetooth connection failed";
      // Cancelled by user is normal UX, don't scream
      if (!msg.toLowerCase().includes("user cancelled")) {
        setError(msg);
      }
      setIsConnected(false);
      ctx?.onDataChange?.(targetStateKey, "disconnected");
    } finally {
      setIsConnecting(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (deviceRef.current?.gatt?.connected) {
        try {
          deviceRef.current.gatt.disconnect();
        } catch {
          // ignore cleanup errors
        }
      }
    };
  }, []);

  return (
    <div
      data-testid="ble-heart-rate-card"
      className="bg-n-s1 border border-n-line rounded-sm p-3.5 space-y-3 font-mono"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Activity
            className={`w-4 h-4 shrink-0 ${
              isConnected ? "text-n-red animate-pulse" : "text-n-disabled"
            }`}
          />
          <span className="text-n-display text-xs uppercase tracking-wider font-medium truncate">
            {label}
          </span>
        </div>

        <span
          data-testid="ble-status-pill"
          className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-sm border shrink-0 ${
            !isBluetoothSupported
              ? "border-amber-500/40 text-amber-400 bg-amber-500/10"
              : isConnected
                ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                : isConnecting
                  ? "border-sky-500/40 text-sky-400 bg-sky-500/10"
                  : "border-n-line text-n-disabled"
          }`}
        >
          {!isBluetoothSupported
            ? "Unsupported"
            : isConnected
              ? "Connected"
              : isConnecting
                ? "Connecting..."
                : "Disconnected"}
        </span>
      </div>

      {!isBluetoothSupported ? (
        <div className="flex items-start gap-2 p-2 bg-n-s2 border border-n-line text-[11px] text-n-secondary">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            Web Bluetooth is not supported in this browser. Standard BLE Heart Rate monitors (0x180D) work on Chrome, Edge, and Android Chrome.
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 pt-1">
          <div>
            {isConnected ? (
              <div className="flex items-baseline gap-1.5">
                <span
                  data-testid="live-bpm-value"
                  className="text-2xl font-bold text-n-display tracking-tight"
                >
                  {currentBpm ?? "--"}
                </span>
                <span className="text-[10px] text-n-disabled uppercase">bpm</span>
                {deviceName && (
                  <span className="text-[10px] text-n-disabled ml-2 truncate max-w-[140px]">
                    ({deviceName})
                  </span>
                )}
              </div>
            ) : (
              <span className="text-[11px] text-n-disabled">
                Standard BLE Heart Rate (0x180D)
              </span>
            )}
          </div>

          <button
            type="button"
            data-testid="ble-connect-button"
            onClick={isConnected ? handleDisconnect : handleConnect}
            disabled={!isBluetoothSupported || isConnecting}
            className={`px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider rounded-sm transition-all flex items-center gap-1.5 shrink-0 ${
              isConnected
                ? "bg-n-s2 border border-n-line hover:border-n-red/40 text-n-red"
                : "bg-n-btn text-n-btn-text hover:opacity-90 disabled:opacity-40"
            }`}
          >
            {isConnected ? (
              <>
                <WifiOff className="w-3 h-3" />
                Disconnect
              </>
            ) : (
              <>
                <Wifi className="w-3 h-3" />
                {isConnecting ? "Connecting..." : "Connect"}
              </>
            )}
          </button>
        </div>
      )}

      {error && (
        <p className="text-[10px] text-n-red pt-1" data-testid="ble-error-text">
          {error}
        </p>
      )}
    </div>
  );
}
