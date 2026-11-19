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
    <div className="w-full bg-n-s1 border border-n-line rounded-sm px-4 py-3.5 flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-n-primary font-grotesk text-sm font-medium leading-snug truncate">{label}</p>
        <p className="nt-label mt-1">
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
        className={`relative inline-flex h-6 w-11 shrink-0 items-center border transition-all duration-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white ${
          isDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer nt-press"
        } ${
          isOn
            ? "bg-white border-white"
            : "bg-transparent border-n-line2"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transition-transform duration-100 ${
            isOn
              ? "translate-x-5.5 bg-[#000000]"
              : "translate-x-0.5 bg-n-line3"
          }`}
        />
      </button>
    </div>
  );
}

