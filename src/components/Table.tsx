interface TableProps {
  columns?: string[];
  rows?: string[][];
}

/**
 * Clean tabular data grid with Nothing-OS minimalist borders.
 */
export function Table({ columns = [], rows = [] }: TableProps) {
  if ((!columns || columns.length === 0) && (!rows || rows.length === 0)) {
    return (
      <div className="w-full bg-n-surface border border-n-border rounded-sm p-4 text-center text-n-text3 text-xs">
        (Empty table)
      </div>
    );
  }

  return (
    <div className="w-full bg-n-surface border border-n-border rounded-sm overflow-hidden animate-fade-in">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          {columns && columns.length > 0 && (
            <thead>
              <tr className="border-b border-n-border bg-n-surface2/50">
                {columns.map((col, idx) => (
                  <th
                    key={idx}
                    scope="col"
                    className="px-3.5 py-2.5 font-mono text-[9px] uppercase tracking-[0.16em] text-n-text3 font-normal"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody className="divide-y divide-n-border">
            {rows.map((row, rIdx) => (
              <tr
                key={rIdx}
                className="hover:bg-white/[0.02] transition-colors"
              >
                {row.map((cell, cIdx) => (
                  <td
                    key={cIdx}
                    className="px-3.5 py-2.5 text-white/90 text-xs whitespace-nowrap"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
