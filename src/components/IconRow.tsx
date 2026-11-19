import {
  Camera,
  Lightbulb,
  Layers,
  Moon,
  Mic,
  Timer,
} from "lucide-react";
import type { RegistryRenderContext } from "@/registry/types";

export type IconRowIconType = "camera" | "bulb" | "layers" | "moon" | "mic" | "timer";

export interface IconRowItem {
  icon: IconRowIconType;
  label?: string;
  action?: string;
}

export interface IconRowProps {
  id?: string;
  items: IconRowItem[];
  bindValue?: unknown;
  onAction?: (actionId?: string) => void | Promise<void>;
  ctx?: RegistryRenderContext;
}

function renderIcon(icon: IconRowIconType) {
  switch (icon) {
    case "camera":
      return <Camera className="w-5 h-5 text-n-display shrink-0" />;
    case "bulb":
      return <Lightbulb className="w-5 h-5 text-n-display shrink-0" />;
    case "layers":
      return <Layers className="w-5 h-5 text-n-display shrink-0" />;
    case "moon":
      return <Moon className="w-5 h-5 text-n-display shrink-0" />;
    case "mic":
      return <Mic className="w-5 h-5 text-n-display shrink-0" />;
    case "timer":
      return <Timer className="w-5 h-5 text-n-display shrink-0" />;
    default:
      return null;
  }
}

export function IconRow({
  items = [],
  onAction,
  ctx,
}: IconRowProps) {
  const displayItems = (items ?? []).slice(0, 4);

  const handleItemClick = (item: IconRowItem) => {
    if (item.action) {
      if (ctx?.onAction) {
        void ctx.onAction(item.action);
      } else if (onAction) {
        void onAction(item.action);
      }
    }
  };

  return (
    <div
      data-testid="icon-row"
      className="w-full flex items-center justify-between gap-2 animate-fade-in"
    >
      {displayItems.map((item, idx) => (
        <button
          key={`${item.icon}-${idx}`}
          type="button"
          onClick={() => handleItemClick(item)}
          data-testid={`icon-row-item-${item.icon}`}
          aria-label={item.label || item.icon}
          className="flex-1 flex flex-col items-center justify-center p-2.5 bg-n-s1 border border-n-line hover:border-n-line3 hover:bg-n-s2 active:scale-95 rounded-sm transition-all cursor-pointer min-h-[58px] gap-1"
        >
          {renderIcon(item.icon)}
          {item.label && (
            <span className="text-[9px] uppercase tracking-wider text-n-disabled truncate max-w-full">
              {item.label}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
