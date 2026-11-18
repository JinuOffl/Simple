import { CheckCircle2, AlertTriangle, Circle } from "lucide-react";
import type { RegistryRenderContext } from "@/registry/types";

export interface StatusProps {
  id?: string;
  label: string;
  state?: "ok" | "warn" | "off";
  bindValue?: unknown;
  ctx?: RegistryRenderContext;
}

export function Status({
  label,
  state = "ok",
  bindValue,
  ctx,
}: StatusProps) {
  const rawBind =
    typeof ctx?.bindValue === "string"
      ? ctx.bindValue
      : typeof bindValue === "string"
        ? bindValue
        : undefined;

  // Reads ${save_to}_state (from direct node.bind or from appData) so the label shows "Connected with watch" only when connected
  const connectionState =
    rawBind ??
    (ctx?.appData
      ? (Object.entries(ctx.appData).find(([k]) => k.endsWith("_state"))?.[1] as string | undefined)
      : undefined);

  let displayLabel = label;
  let resolvedState = state;

  if (connectionState === "connected") {
    displayLabel = "Connected with watch";
    resolvedState = "ok";
  } else if (connectionState === "disconnected") {
    displayLabel = label && label !== "Connected with watch" ? label : "Disconnected";
    resolvedState = "off";
  } else if (typeof rawBind === "string") {
    displayLabel = rawBind;
  }

  return (
    <div
      data-testid="status-badge"
      className="inline-flex items-center gap-2.5 px-3 py-2 bg-n-surface border border-n-border rounded-sm w-full animate-fade-in"
    >
      {resolvedState === "warn" ? (
        <AlertTriangle
          data-testid="status-icon-warn"
          className="w-4 h-4 text-amber-400 shrink-0"
        />
      ) : resolvedState === "off" ? (
        <Circle
          data-testid="status-icon-off"
          className="w-4 h-4 text-n-text3 shrink-0"
        />
      ) : (
        <CheckCircle2
          data-testid="status-icon-ok"
          className="w-4 h-4 text-emerald-400 shrink-0"
        />
      )}

      <span className="text-white font-mono text-xs uppercase tracking-wider truncate flex-1">
        {displayLabel}
      </span>

      <span className="text-[8px] uppercase tracking-wider text-n-text3 px-1 py-0.5 border border-n-border rounded-sm shrink-0">
        {resolvedState}
      </span>
    </div>
  );
}
