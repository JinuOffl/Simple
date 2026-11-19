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
      <div className="w-full bg-n-s1 border border-n-line rounded-sm p-4 text-center text-n-disabled text-xs font-grotesk">
        (Empty table)
      </div>
    );
  }

  return (
    <div className="w-full bg-n-s1 border border-n-line rounded-sm overflow-hidden animate-fade-in">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          {columns && columns.length > 0 && (
            <thead>
              <tr className="border-b border-n-line bg-n-s2">
                {columns.map((col, idx) => (
                  <th
                    key={idx}
                    scope="col"
                    className="px-3.5 py-2.5 nt-label font-normal"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody className="divide-y divide-n-line">
            {rows.map((row, rIdx) => (
              <tr
                key={rIdx}
                className="hover:bg-n-s2/40 transition-colors"
              >
                {row.map((cell, cIdx) => (
                  <td
                    key={cIdx}
                    className="px-3.5 py-2.5 text-n-primary font-grotesk text-xs whitespace-nowrap"
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
