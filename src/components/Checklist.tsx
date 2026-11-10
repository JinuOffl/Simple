import { useState } from "react";

interface ChecklistProps {
  items: string[];
}

export function Checklist({ items }: ChecklistProps) {
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const toggle = (i: number) => setChecked(prev => ({ ...prev, [i]: !prev[i] }));

  return (
    <div className="bg-n-surface border border-n-border rounded-sm overflow-hidden animate-fade-in">
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => toggle(i)}
          className="w-full flex items-center gap-3 px-4 py-3
                     border-b border-n-border last:border-b-0
                     hover:bg-n-surface2 active:bg-n-surface3
                     transition-colors text-left"
        >
          {/* Nothing-style checkbox */}
          <span
            className={`w-4 h-4 border flex-shrink-0 flex items-center justify-center
                        transition-colors rounded-sm
                        ${checked[i]
                          ? "bg-white border-white"
                          : "border-n-border2"
                        }`}
          >
            {checked[i] && (
              <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="#0a0a0a" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
              </svg>
            )}
          </span>
          <span
            className={`text-xs transition-colors ${
              checked[i] ? "line-through text-n-text3" : "text-n-text2"
            }`}
          >
            {item}
          </span>
          {checked[i] && (
            <span className="ml-auto text-n-text3 text-[9px] uppercase tracking-wider">done</span>
          )}
        </button>
      ))}

      {/* Progress bar */}
      {items.length > 0 && (
        <div className="px-4 py-2 flex items-center gap-2 border-t border-n-border">
          <div className="flex-1 h-px bg-n-border overflow-hidden">
            <div
              className="h-full bg-white transition-all duration-300"
              style={{ width: `${(Object.values(checked).filter(Boolean).length / items.length) * 100}%` }}
            />
          </div>
          <span className="text-n-text3 text-[9px] uppercase tracking-wider">
            {Object.values(checked).filter(Boolean).length}/{items.length}
          </span>
        </div>
      )}
    </div>
  );
}
