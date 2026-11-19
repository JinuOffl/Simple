import { useState, useId } from "react";

interface SliderProps {
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  defaultValue?: number;
  disabled?: boolean;
  onChange?: (val: number) => void | Promise<void>;
}

/**
 * Interactive range slider styled with Nothing-OS dark tokens.
 * Works both controlled (via `value`) and uncontrolled (via `defaultValue`).
 */
export function Slider({
  label = "Range",
  min = 0,
  max = 100,
  step = 1,
  value,
  defaultValue = 50,
  disabled = false,
  onChange,
}: SliderProps) {
  const [internalVal, setInternalVal] = useState<number>(defaultValue);
  const isControlled = typeof value === "number" && !Number.isNaN(value);
  const currentVal = isControlled ? value : internalVal;
  const inputId = useId();

  const percentage = Math.max(
    0,
    Math.min(100, ((currentVal - min) / (max - min || 1)) * 100)
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value);
    if (!isControlled) {
      setInternalVal(next);
    }
    onChange?.(next);
  };

  return (
    <div className="w-full bg-n-s1 border border-n-line rounded-sm p-4 animate-fade-in space-y-3">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={inputId}
          className="text-n-display text-xs font-medium tracking-wide"
        >
          {label}
        </label>
        <span className="font-mono text-xs text-n-secondary">
          {currentVal}
          <span className="text-n-disabled text-[10px]"> / {max}</span>
        </span>
      </div>

      <div className="relative flex items-center">
        <input
          id={inputId}
          type="range"
          min={min}
          max={max}
          step={step}
          value={currentVal}
          disabled={disabled}
          onChange={handleChange}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={currentVal}
          className="w-full h-2 rounded-none appearance-none cursor-pointer outline-none
                     accent-n-primary disabled:opacity-40 disabled:cursor-not-allowed
                     focus-visible:ring-1 focus-visible:ring-n-primary"
          style={{
            background: `linear-gradient(to right, var(--n-btn-bg) ${percentage}%, var(--n-line) ${percentage}%)`,
          }}
        />
      </div>

      <div className="flex justify-between text-[9px] font-mono text-n-disabled uppercase tracking-wider">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
