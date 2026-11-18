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
  // Reads ctx.bindValue if it is a string to override the label
  const displayLabel =
    typeof ctx?.bindValue === "string"
      ? ctx.bindValue
      : typeof bindValue === "string"
        ? bindValue
        : label;

  return (
    <div
      data-testid="status-badge"
      className="inline-flex items-center gap-2.5 px-3 py-2 bg-n-surface border border-n-border rounded-sm w-full animate-fade-in"
    >
      {state === "warn" ? (
        <AlertTriangle
          data-testid="status-icon-warn"
          className="w-4 h-4 text-amber-400 shrink-0"
        />
      ) : state === "off" ? (
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
        {state}
      </span>
    </div>
  );
}
