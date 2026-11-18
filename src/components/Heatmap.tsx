import { useState, useEffect } from "react";
import type { RegistryRenderContext } from "@/registry/types";

export interface HeatmapProps {
  id?: string;
  rows: string[];
  days?: number;
  save_to?: string;
  title?: string;
  bindValue?: unknown;
  ctx?: RegistryRenderContext;
}

export function Heatmap({
  id = "heatmap",
  rows = [],
  days = 14,
  save_to,
  title,
  bindValue,
  ctx,
}: HeatmapProps) {
  const totalDays = Math.min(31, Math.max(1, days));
  const storageKey = `simple_heatmap_${save_to ?? id}`;

  const initializeGrid = (): Record<string, boolean[]> => {
    // 1. Try bindValue or ctx.bindValue or ctx.appData
    const bound = ctx?.bindValue ?? bindValue ?? ctx?.appData?.[save_to ?? id];
    if (bound && typeof bound === "object") {
      const result: Record<string, boolean[]> = {};
      for (const row of rows) {
        const rowData = (bound as Record<string, unknown>)[row];
        if (Array.isArray(rowData)) {
          const arr = rowData.slice(0, totalDays).map(Boolean);
          while (arr.length < totalDays) arr.push(false);
          result[row] = arr;
        } else {
          result[row] = new Array(totalDays).fill(false);
        }
      }
      return result;
    }

    // 2. In non-preview mode, try localStorage
    if (!ctx?.isPreview && typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && typeof parsed === "object") {
            const result: Record<string, boolean[]> = {};
            for (const row of rows) {
              const rowData = parsed[row];
              if (Array.isArray(rowData)) {
                const arr = rowData.slice(0, totalDays).map(Boolean);
                while (arr.length < totalDays) arr.push(false);
                result[row] = arr;
              } else {
                result[row] = new Array(totalDays).fill(false);
              }
            }
            return result;
          }
        }
      } catch {
        // ignore parse/storage error
      }
    }

    // 3. Fresh grid
    const fresh: Record<string, boolean[]> = {};
    for (const row of rows) {
      fresh[row] = new Array(totalDays).fill(false);
    }
    return fresh;
  };

  const [grid, setGrid] = useState<Record<string, boolean[]>>(initializeGrid);

  // Sync if bound prop changes
  useEffect(() => {
    const bound = ctx?.bindValue ?? bindValue;
    if (bound && typeof bound === "object") {
      const next: Record<string, boolean[]> = {};
      for (const row of rows) {
        const rowData = (bound as Record<string, unknown>)[row];
        if (Array.isArray(rowData)) {
          const arr = rowData.slice(0, totalDays).map(Boolean);
          while (arr.length < totalDays) arr.push(false);
          next[row] = arr;
        } else {
          next[row] = new Array(totalDays).fill(false);
        }
      }
      setGrid(next);
    }
  }, [bindValue, ctx?.bindValue, rows, totalDays]);

  const toggleCell = (row: string, dayIndex: number) => {
    const currentRow = grid[row] ?? new Array(totalDays).fill(false);
    const updatedRow = [...currentRow];
    updatedRow[dayIndex] = !updatedRow[dayIndex];

    const nextGrid = {
      ...grid,
      [row]: updatedRow,
    };

    setGrid(nextGrid);
    ctx?.onDataChange?.(save_to ?? id, nextGrid);

    // Persist only when not in preview mode
    if (!ctx?.isPreview && typeof window !== "undefined") {
      try {
        localStorage.setItem(storageKey, JSON.stringify(nextGrid));
      } catch {
        // ignore storage error
      }
    }
  };

  const todayIndex = totalDays - 1;

  return (
    <div
      data-testid="heatmap-widget"
      className="w-full bg-n-surface border border-n-border rounded-sm p-4 animate-fade-in space-y-3"
    >
      {title && (
        <div className="flex items-center justify-between pb-2 border-b border-n-border">
          <p className="text-n-text3 text-[9px] font-mono uppercase tracking-[0.18em]">
            {title}
          </p>
          <span className="nt-tag text-[8px] px-1.5 py-0.5 leading-none lowercase">
            {totalDays}d
          </span>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="text-xs text-n-text3 text-center py-2">
          (No rows configured)
        </div>
      ) : (
        <div className="space-y-2">
          {/* Day number header */}
          <div className="flex items-center gap-2">
            <div className="w-24 shrink-0" />
            <div className="flex-1 flex items-center justify-between gap-1 overflow-x-auto">
              {Array.from({ length: totalDays }).map((_, idx) => {
                const isToday = idx === todayIndex;
                return (
                  <span
                    key={idx}
                    className={`text-[8px] font-mono w-4 sm:w-5 text-center shrink-0 ${
                      isToday ? "text-white font-bold" : "text-n-text3"
                    }`}
                  >
                    {isToday ? "TD" : idx + 1}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Grid rows */}
          {rows.map((row) => {
            const rowValues = grid[row] ?? new Array(totalDays).fill(false);
            return (
              <div key={row} className="flex items-center gap-2">
                <span
                  title={row}
                  className="w-24 shrink-0 text-[10px] font-mono uppercase tracking-wider text-n-text2 truncate"
                >
                  {row}
                </span>

                <div className="flex-1 flex items-center justify-between gap-1 overflow-x-auto">
                  {rowValues.map((isActive, dayIdx) => {
                    const isToday = dayIdx === todayIndex;
                    return (
                      <button
                        key={dayIdx}
                        type="button"
                        onClick={() => toggleCell(row, dayIdx)}
                        data-testid={`heatmap-cell-${row}-${dayIdx}`}
                        data-today={isToday ? "true" : undefined}
                        data-active={isActive ? "true" : "false"}
                        aria-label={`${row}: day ${dayIdx + 1}${isToday ? " (today)" : ""}`}
                        className={`w-4 h-4 sm:w-5 sm:h-5 rounded-xs transition-all duration-150 shrink-0 cursor-pointer ${
                          isActive
                            ? "bg-white text-n-bg"
                            : "bg-n-surface2/60 border border-n-border/80 hover:border-n-border2"
                        } ${
                          isToday
                            ? "ring-1 ring-white ring-offset-1 ring-offset-n-bg"
                            : ""
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
