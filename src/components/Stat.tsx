interface StatProps {
  label?: string;
  value?: string | number;
  unit?: string;
  description?: string;
}

/**
 * Metric tile presenting a key numerical or textual KPI.
 * Styled with Nothing-OS dot-matrix / monospace accents.
 */
export function Stat({
  label = "Metric",
  value = 0,
  unit,
  description,
}: StatProps) {
  const displayValue = value !== undefined && value !== null ? String(value) : "—";

  return (
    <div className="w-full bg-n-s1 border border-n-line rounded-sm p-4 animate-fade-in flex flex-col justify-between">
      <div className="flex items-center justify-between gap-2">
        <p className="nt-label">
          {label}
        </p>
        {unit && (
          <span className="font-mono text-[9px] uppercase tracking-wider text-n-secondary border border-n-line px-1.5 py-0.5 rounded-sm leading-none">
            {unit}
          </span>
        )}
      </div>

      <div className="my-2.5 flex items-baseline gap-1.5">
        <span
          className="font-doto text-n-display tracking-wider leading-none text-4xl sm:text-5xl"
          style={{ fontVariationSettings: "'ROND' 0" }}
        >
          {displayValue}
        </span>
        {unit && !displayValue.endsWith(unit) && (
          <span className="text-n-secondary text-sm font-mono lowercase ml-1">
            {unit}
          </span>
        )}
      </div>

      {description && (
        <p className="font-grotesk text-xs text-n-secondary leading-relaxed mt-0.5">
          {description}
        </p>
      )}
    </div>
  );
}
