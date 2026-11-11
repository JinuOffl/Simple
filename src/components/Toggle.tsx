import { useState } from "react";

interface ToggleProps {
  label?: string;
  checked?: boolean;
  defaultValue?: boolean;
  loading?: boolean;
  disabled?: boolean;
  onToggle?: (nextValue: boolean) => void | Promise<void>;
}

/**
 * Interactive binary switch styled with Nothing-OS dark tokens.
 * Works both controlled (via `checked`) and uncontrolled (via `defaultValue`).
 */
export function Toggle({
  label = "Toggle",
  checked,
  defaultValue = false,
  loading = false,
  disabled = false,
  onToggle,
}: ToggleProps) {
  const [internalChecked, setInternalChecked] = useState(defaultValue);
  const isControlled = typeof checked === "boolean";
  const isOn = isControlled ? checked : internalChecked;
  const isDisabled = disabled || loading;

  const handleClick = () => {
    if (isDisabled) return;
    const next = !isOn;
    if (!isControlled) {
      setInternalChecked(next);
    }
    void onToggle?.(next);
  };

  return (
    <div className="w-full bg-n-surface border border-n-border rounded-sm px-4 py-3.5 flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-white text-sm font-medium leading-snug truncate">{label}</p>
        <p className="text-n-text3 text-[10px] font-mono uppercase tracking-[0.16em] mt-1">
          {loading ? "syncing..." : isOn ? "on" : "off"}
        </p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={isOn}
        aria-label={label}
        disabled={isDisabled}
        onClick={handleClick}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
          isDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
        } ${
          isOn
            ? "bg-white border-white"
            : "bg-n-surface2 border-n-border2"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full transition-transform duration-150 ${
            isOn
              ? "translate-x-6 bg-[#0a0a0a]"
              : "translate-x-1 bg-white/70"
          }`}
        />
      </button>
    </div>
  );
}

