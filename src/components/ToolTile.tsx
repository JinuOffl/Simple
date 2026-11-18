import type { ManifestV2 } from "@/schema/manifest.v2";
import { ManifestRenderer } from "@/renderer/ManifestRenderer";

export interface ToolTileProps {
  manifest: ManifestV2;
  appData?: Record<string, unknown>;
  status?: string;
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
  onOpen,
  onSleep,
  onExport,
}: ToolTileProps) {
  const sizeClass = getToolTileSizeClass(manifest.tool?.size);

  return (
    <div
      onClick={onOpen}
      data-testid="tool-tile"
      className={`bg-n-surface border border-n-border hover:border-n-border2 rounded-sm p-2 flex flex-col justify-between relative overflow-hidden cursor-pointer group transition-all duration-150 ${sizeClass}`}
    >
      {/* Top action / info bar */}
      <div className="w-full flex items-center justify-between gap-1 min-h-[18px] text-n-text3 mb-1">
        <div className="flex items-center gap-1.5 overflow-hidden min-w-0">
          {manifest.icon && (
            <span className="text-xs leading-none shrink-0">{manifest.icon}</span>
          )}
          <span className="text-[9px] uppercase tracking-wider text-n-text2 truncate">
            {manifest.name || "Tool"}
          </span>
          {status && (
            <span className="text-[8px] uppercase tracking-wider text-n-text3 px-1 py-0.2 border border-n-border rounded-sm shrink-0">
              {status}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onExport && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onExport();
              }}
              title="Export JSON"
              aria-label={`Export ${manifest.name}`}
              className="px-1 py-0.5 text-[9px] text-n-text3 hover:text-white transition-all duration-150 opacity-60 sm:opacity-0 sm:group-hover:opacity-100"
            >
              ↓
            </button>
          )}

          {onSleep && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSleep();
              }}
              title="Put tool to sleep"
              aria-label={`Sleep ${manifest.name}`}
              className="px-1 py-0.5 text-[9px] text-n-text3 hover:text-white transition-all duration-150 opacity-60 sm:opacity-0 sm:group-hover:opacity-100"
            >
              ☾
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
            className="px-1 py-0.5 text-[9px] text-n-text3 hover:text-white transition-colors"
          >
            ↗
          </button>
        </div>
      </div>

      {/* Content preview */}
      <div className="overflow-hidden pointer-events-none flex-1">
        <ManifestRenderer
          manifest={manifest}
          appData={appData}
          compact={true}
          isPreview={true}
        />
      </div>
    </div>
  );
}
