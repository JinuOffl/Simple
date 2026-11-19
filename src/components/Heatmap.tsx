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

export interface HeatmapState {
  start: string; // "YYYY-MM-DD"
  rows: Record<string, boolean[]>;
}

function getTodayDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(dateStr: string): Date {
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    return new Date();
  }
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function getElapsedDays(startStr: string, todayStr: string): number {
  const startDate = parseLocalDate(startStr);
  const todayDate = parseLocalDate(todayStr);
  startDate.setHours(0, 0, 0, 0);
  todayDate.setHours(0, 0, 0, 0);
  const diffTime = todayDate.getTime() - startDate.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

function shiftRowValues(
  rowValues: boolean[],
  elapsedDays: number,
  totalDays: number
): boolean[] {
  if (elapsedDays >= totalDays) {
    return new Array(totalDays).fill(false);
  }
  const padded = [...rowValues];
  while (padded.length < totalDays) {
    padded.push(false);
  }
  const shifted = padded.slice(elapsedDays, totalDays);
  while (shifted.length < totalDays) {
    shifted.push(false);
  }
  return shifted;
}

function normalizeRawData(
  raw: unknown,
  rows: string[],
  totalDays: number
): HeatmapState {
  const todayStr = getTodayDateString();
  if (!raw || typeof raw !== "object") {
    const freshRows: Record<string, boolean[]> = {};
    for (const row of rows) {
      freshRows[row] = new Array(totalDays).fill(false);
    }
    return { start: todayStr, rows: freshRows };
  }

  const obj = raw as Record<string, unknown>;
  let startStr = todayStr;
  let storedRowsObj: Record<string, unknown> = obj;

  // Check if new shape { start: string, rows: Record<string, boolean[]> }
  if (typeof obj.start === "string" && obj.rows && typeof obj.rows === "object") {
    startStr = obj.start;
    storedRowsObj = obj.rows as Record<string, unknown>;
  }

  const elapsedDays = getElapsedDays(startStr, todayStr);
  const resultRows: Record<string, boolean[]> = {};

  for (const row of rows) {
    const rowData = storedRowsObj[row];
    let rowArray: boolean[];
    if (Array.isArray(rowData)) {
      rowArray = rowData.slice(0, totalDays).map(Boolean);
      while (rowArray.length < totalDays) rowArray.push(false);
    } else {
      rowArray = new Array(totalDays).fill(false);
    }

    if (elapsedDays > 0) {
      resultRows[row] = shiftRowValues(rowArray, elapsedDays, totalDays);
    } else {
      resultRows[row] = rowArray;
    }
  }

  return { start: todayStr, rows: resultRows };
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

  const initializeState = (): HeatmapState => {
    // 1. Try bindValue or ctx.bindValue or ctx.appData
    const bound = ctx?.bindValue ?? bindValue ?? ctx?.appData?.[save_to ?? id];
    if (bound && typeof bound === "object") {
      return normalizeRawData(bound, rows, totalDays);
    }

    // 2. In non-preview mode, try localStorage
    if (!ctx?.isPreview && typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          const normalized = normalizeRawData(parsed, rows, totalDays);
          // Persist shifted state if elapsed
          try {
            localStorage.setItem(storageKey, JSON.stringify(normalized));
          } catch {}
          return normalized;
        }
      } catch {
        // ignore parse/storage error
      }
    }

    // 3. Fresh grid
    return normalizeRawData(null, rows, totalDays);
  };

  const [state, setState] = useState<HeatmapState>(initializeState);

  // Sync if bound prop changes
  useEffect(() => {
    const bound = ctx?.bindValue ?? bindValue;
    if (bound && typeof bound === "object") {
      setState(normalizeRawData(bound, rows, totalDays));
    }
  }, [bindValue, ctx?.bindValue, rows, totalDays]);

  const toggleCell = (row: string, dayIndex: number) => {
    const currentRow = state.rows[row] ?? new Array(totalDays).fill(false);
    const updatedRow = [...currentRow];
    updatedRow[dayIndex] = !updatedRow[dayIndex];

    const todayStr = getTodayDateString();
    const nextState: HeatmapState = {
      start: todayStr,
      rows: {
        ...state.rows,
        [row]: updatedRow,
      },
    };

    setState(nextState);
    ctx?.onDataChange?.(save_to ?? id, nextState);

    // Persist only when not in preview mode
    if (!ctx?.isPreview && typeof window !== "undefined") {
      try {
        localStorage.setItem(storageKey, JSON.stringify(nextState));
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
            const rowValues = state.rows[row] ?? new Array(totalDays).fill(false);
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
                        className={`w-4 h-4 sm:w-5 sm:h-5 rounded-sm transition-all duration-150 shrink-0 cursor-pointer ${
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
