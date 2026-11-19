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
      className="inline-flex items-center gap-2.5 px-3.5 py-2.5 bg-n-s1 border border-n-line rounded-sm w-full animate-fade-in"
    >
      {resolvedState === "warn" ? (
        <AlertTriangle
          data-testid="status-icon-warn"
          className="w-4 h-4 text-amber-400 shrink-0"
        />
      ) : resolvedState === "off" ? (
        <Circle
          data-testid="status-icon-off"
          className="w-4 h-4 text-n-disabled shrink-0"
        />
      ) : (
        <CheckCircle2
          data-testid="status-icon-ok"
          className="w-4 h-4 text-emerald-400 shrink-0"
        />
      )}

      <span className="text-n-primary font-grotesk text-xs truncate flex-1 font-medium">
        {displayLabel}
      </span>

      <span className="nt-label px-1.5 py-0.5 border border-n-line rounded-sm shrink-0">
        {resolvedState}
      </span>
    </div>
  );
}
