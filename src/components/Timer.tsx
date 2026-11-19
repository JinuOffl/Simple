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
    <div className="w-full bg-n-s1 border border-n-line rounded-sm p-4 animate-fade-in flex flex-col items-center gap-3">
      <div className="w-full flex items-center justify-between">
        <p className="nt-label">
          {label}
        </p>
        <span
          className={`font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 border rounded-sm leading-none ${
            isCompleted
              ? "border-n-red text-n-red bg-n-red-dim"
              : isRunning
                ? "border-white text-white"
                : "border-n-line text-n-disabled"
          }`}
        >
          {isCompleted ? "done" : isRunning ? "running" : "paused"}
        </span>
      </div>

      {/* Dot-matrix time display */}
      <div className="my-2 text-center">
        <p
          className={`font-doto text-5xl sm:text-6xl tracking-wider leading-none ${
            isCompleted ? "text-n-red animate-pulse" : "text-n-display"
          }`}
          style={{ fontVariationSettings: "'ROND' 0" }}
        >
          {formatTime(remaining)}
        </p>
      </div>

      {/* Controls */}
      <div className="w-full flex items-center justify-center gap-2 pt-2 border-t border-n-line">
        <button
          type="button"
          onClick={handleToggle}
          className={`px-4 py-1.5 nt-label font-bold rounded-sm border transition-all nt-press cursor-pointer ${
            isRunning
              ? "border-n-line bg-n-s2 hover:border-n-line3 text-n-primary"
              : "bg-white text-black border-white hover:bg-n-primary"
          }`}
        >
          {isCompleted ? "Restart" : isRunning ? "Pause" : "Start"}
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="px-3 py-1.5 nt-label text-n-secondary hover:text-n-display border border-n-line hover:border-n-line3 rounded-sm transition-all nt-press cursor-pointer"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
