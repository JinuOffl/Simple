interface ListProps {
  items?: string[];
  ordered?: boolean;
}

/**
 * Styled item list with Nothing-OS typography and dividers.
 */
export function List({ items = [], ordered = false }: ListProps) {
  if (!items || items.length === 0) {
    return (
      <div className="w-full bg-n-surface border border-n-border rounded-sm p-3 text-center text-n-text3 text-xs">
        (Empty list)
      </div>
    );
  }

  return (
    <div className="w-full bg-n-surface border border-n-border rounded-sm overflow-hidden animate-fade-in divide-y divide-n-border">
      {items.map((item, idx) => (
        <div
          key={idx}
          className="px-4 py-3 flex items-start gap-3 hover:bg-white/[0.02] transition-colors"
        >
          <span className="font-mono text-[10px] text-n-text3 shrink-0 pt-0.5 select-none">
            {ordered
              ? String(idx + 1).padStart(2, "0")
              : "—"}
          </span>
          <p className="text-white text-xs leading-relaxed flex-1">
            {item}
          </p>
        </div>
      ))}
    </div>
  );
}
