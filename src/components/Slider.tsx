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
    <div className="w-full bg-n-surface border border-n-border rounded-sm p-4 animate-fade-in space-y-3">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={inputId}
          className="text-white text-xs font-medium tracking-wide"
        >
          {label}
        </label>
        <span className="font-mono text-xs text-n-text2">
          {currentVal}
          <span className="text-n-text3 text-[10px]"> / {max}</span>
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
          className="w-full h-2 bg-n-surface2 rounded-none appearance-none cursor-pointer outline-none
                     accent-white disabled:opacity-40 disabled:cursor-not-allowed
                     focus-visible:ring-1 focus-visible:ring-white"
          style={{
            background: `linear-gradient(to right, #ffffff ${percentage}%, #1a1a1a ${percentage}%)`,
          }}
        />
      </div>

      <div className="flex justify-between text-[9px] font-mono text-n-text3 uppercase tracking-wider">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
