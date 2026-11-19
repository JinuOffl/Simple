// ── Clock — updated to Nothing OS aesthetic ───────────────────────────────────
// Uses Doto dot-matrix font for the time display — looks stunning
import { useState, useEffect } from "react";

interface ClockProps {
  timezone?: string;
  format?: "12h" | "24h";
  label?: string;
}

function getTime(timezone?: string, format: "12h" | "24h" = "12h") {
  const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();

  const timeStr = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: format === "12h", timeZone: tz,
  }).format(now);

  const dateStr = new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: tz,
  }).format(now);

  if (format === "12h") {
    const m = timeStr.match(/^([\d:]+)\s*(AM|PM)$/i);
    if (m) return { time: m[1], meridiem: m[2].toUpperCase(), date: dateStr };
  }

  return { time: timeStr, meridiem: null, date: dateStr };
}

export function Clock({ timezone, format = "12h", label }: ClockProps) {
  const [tick, setTick] = useState(() => getTime(timezone, format));

  useEffect(() => {
    const id = setInterval(() => setTick(getTime(timezone, format)), 1000);
    return () => clearInterval(id);
  }, [timezone, format]);

  const displayLabel = label
    ?? (timezone ? timezone.replace(/_/g, " ").split("/").pop() : "LOCAL")
    ?? "LOCAL";

  return (
    <div className="bg-n-s1 border border-n-line rounded-sm p-4 animate-fade-in">
      {/* Location label */}
      <p className="nt-label mb-3">
        {displayLabel.toUpperCase()}
      </p>

      {/* Time in Doto dot-matrix font */}
      <div className="flex items-end gap-2 mb-2">
        <span
          className="font-doto text-n-display leading-none tabular-nums"
          style={{
            fontSize: "clamp(28px, 10vw, 48px)",
            fontVariationSettings: "'ROND' 0",
          }}
        >
          {tick.time}
        </span>
        {tick.meridiem && (
          <span
            className="font-doto text-n-secondary mb-1"
            style={{ fontSize: "14px", fontVariationSettings: "'ROND' 0" }}
          >
            {tick.meridiem}
          </span>
        )}
      </div>

      {/* Date */}
      <p className="nt-label text-[8px] text-n-disabled">
        {tick.date.toUpperCase()}
      </p>

      {/* Live indicator */}
      <div className="flex items-center gap-1.5 mt-3">
        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
        <span className="nt-label text-[8px]">live</span>
      </div>
    </div>
  );
}
