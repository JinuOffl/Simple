import type { ManifestV2 } from "@/schema/manifest.v2";
import { ManifestRenderer } from "@/renderer/ManifestRenderer";
import { ToolIcon } from "@/lib/toolIcon";
import { Moon, Share2 } from "lucide-react";

export interface ToolTileProps {
  manifest: ManifestV2;
  appData?: Record<string, unknown>;
  status?: string;
  isShared?: boolean;
  onOpen: () => void;
  onSleep?: () => void;
  onExport?: () => void;
}

function getToolTileSizeClass(size?: "1x1" | "2x1" | "2x2" | "4x2"): string {
  switch (size) {
    case "1x1":
      return "col-span-1 row-span-1";
    case "2x1":
      return "col-span-2 row-span-1";
    case "2x2":
      return "col-span-2 row-span-2";
    case "4x2":
      return "col-span-4 row-span-2";
    default:
      return "col-span-2 row-span-1";
  }
}

export function ToolTile({
  manifest,
  appData = {},
  status,
  isShared = false,
  onOpen,
  onSleep,
  onExport,
}: ToolTileProps) {
  const sizeClass = getToolTileSizeClass(manifest.tool?.size);
  const isReady = status?.toLowerCase() === "ready";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      data-testid="tool-tile"
      className={`bg-n-s1 border border-n-line hover:border-n-line2 rounded-sm p-3 flex flex-col justify-between relative overflow-hidden cursor-pointer group transition-colors nt-press ${sizeClass}`}
    >
      {/* Top: name + status */}
      <div className="w-full flex items-start justify-between gap-1 min-h-[18px] mb-1.5">
        <div className="flex items-center gap-1.5 overflow-hidden min-w-0">
          <span className="nt-label text-n-primary truncate font-medium">
            {manifest.name || "Tool"}
          </span>
          {isShared && (
            <span className="text-[8px] uppercase tracking-wider text-n-disabled px-1 py-0.5 border border-n-line rounded-sm shrink-0 font-mono">
              shared
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {status && (
            <span className="text-[8px] uppercase tracking-wider text-n-disabled font-mono flex items-center gap-1">
              <span className={isReady ? "nt-dot-green" : "nt-dot-amber"} />
              {status}
            </span>
          )}
        </div>
      </div>

      {/* Middle: rendered widget — fills space */}
      <div className="overflow-hidden pointer-events-none flex-1 my-1">
        <ManifestRenderer
          manifest={manifest}
          appData={appData}
          compact={true}
          isPreview={true}
        />
      </div>

      {/* Bottom: icon + type + action buttons */}
      <div className="flex items-center justify-between pt-1 border-t border-n-line/40 mt-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <ToolIcon manifest={manifest} size={12} className="text-n-disabled shrink-0" />
          <span className="nt-label text-n-disabled truncate">
            {manifest.tool?.size ?? "tool"}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!isShared && onExport && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onExport();
              }}
              title="Export JSON"
              aria-label={`Export ${manifest.name}`}
              className="px-1 py-0.5 text-[9px] text-n-disabled hover:text-white transition-opacity duration-150 opacity-60 hover:opacity-100 flex items-center"
            >
              <Share2 size={11} strokeWidth={1.5} />
            </button>
          )}

          {!isShared && onSleep && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSleep();
              }}
              title="Put tool to sleep"
              aria-label={`Sleep ${manifest.name}`}
              className="px-1 py-0.5 text-[9px] text-n-disabled hover:text-white transition-opacity duration-150 opacity-60 hover:opacity-100 flex items-center"
            >
              <Moon size={11} strokeWidth={1.5} />
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            title="Open tool"
            aria-label={`Open ${manifest.name}`}
            className="min-w-[32px] min-h-[32px] flex items-center justify-center -my-1 -mr-1 text-[11px] text-n-disabled hover:text-white transition-colors"
          >
            ↗
          </button>
        </div>
      </div>
    </div>
  );
}
