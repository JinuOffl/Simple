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
    <div className="w-full bg-n-surface border border-n-border rounded-sm p-4 animate-fade-in flex flex-col justify-between">
      <div className="flex items-center justify-between gap-2">
        <p className="text-n-text3 text-[9px] font-mono uppercase tracking-[0.18em]">
          {label}
        </p>
        {unit && (
          <span className="nt-tag text-[8px] px-1.5 py-0.5 leading-none">
            {unit}
          </span>
        )}
      </div>

      <div className="my-2.5 flex items-baseline gap-1.5">
        <span
          className="font-doto text-white tracking-wider leading-none text-3xl sm:text-4xl"
          style={{ fontVariationSettings: "'ROND' 0" }}
        >
          {displayValue}
        </span>
        {unit && !displayValue.endsWith(unit) && (
          <span className="text-n-text2 text-xs font-mono lowercase">
            {unit}
          </span>
        )}
      </div>

      {description && (
        <p className="text-n-text2 text-[10px] leading-relaxed mt-0.5">
          {description}
        </p>
      )}
    </div>
  );
}
