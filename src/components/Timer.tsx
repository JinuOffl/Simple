import { useState, useEffect, useRef } from "react";

interface TimerProps {
  duration_seconds?: number;
  label?: string;
  auto_start?: boolean;
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
}

/**
 * Countdown timer widget with Nothing-OS dot-matrix display and controls.
 */
export function Timer({
  duration_seconds = 60,
  label = "Timer",
  auto_start = false,
}: TimerProps) {
  const initialSeconds = Math.max(1, duration_seconds);
  const [remaining, setRemaining] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(auto_start);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    setRemaining(initialSeconds);
    setIsRunning(auto_start);
  }, [initialSeconds, auto_start]);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = window.setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1) {
            setIsRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning]);

  const handleToggle = () => {
    if (remaining === 0) {
      setRemaining(initialSeconds);
      setIsRunning(true);
    } else {
      setIsRunning((prev) => !prev);
    }
  };

  const handleReset = () => {
    setIsRunning(false);
    setRemaining(initialSeconds);
  };

  const isCompleted = remaining === 0;

  return (
    <div className="w-full bg-n-surface border border-n-border rounded-sm p-4 animate-fade-in flex flex-col items-center gap-3">
      <div className="w-full flex items-center justify-between">
        <p className="text-n-text3 text-[9px] font-mono uppercase tracking-[0.18em]">
          {label}
        </p>
        <span
          className={`nt-tag text-[8px] px-1.5 py-0.5 leading-none ${
            isCompleted
              ? "border-red-500/50 text-red-300"
              : isRunning
                ? "border-white/50 text-white"
                : ""
          }`}
        >
          {isCompleted ? "done" : isRunning ? "running" : "paused"}
        </span>
      </div>

      {/* Dot-matrix time display */}
      <div className="my-1 text-center">
        <p
          className={`font-doto text-4xl sm:text-5xl tracking-widest leading-none ${
            isCompleted ? "text-red-400 animate-pulse" : "text-white"
          }`}
          style={{ fontVariationSettings: "'ROND' 0" }}
        >
          {formatTime(remaining)}
        </p>
      </div>

      {/* Controls */}
      <div className="w-full flex items-center justify-center gap-2 pt-1 border-t border-n-border">
        <button
          type="button"
          onClick={handleToggle}
          className={`px-4 py-1.5 text-[10px] uppercase tracking-widest font-bold rounded-sm border transition-colors ${
            isRunning
              ? "border-n-border bg-n-surface hover:border-n-border2 text-white"
              : "bg-white text-n-bg border-white hover:opacity-90"
          }`}
        >
          {isCompleted ? "Restart" : isRunning ? "Pause" : "Start"}
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-n-text3 hover:text-white border border-n-border hover:border-n-border2 rounded-sm transition-colors"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
