interface Dataset {
  label: string;
  data: number[];
}

interface ChartProps {
  chart_type?: "bar" | "line" | "pie";
  labels?: string[];
  datasets?: Dataset[];
  title?: string;
}

const PALETTE = ["#ffffff", "#888888", "#555555", "#aaaaaa", "#333333"];

/**
 * Lightweight, high-contrast SVG chart widget styled for Nothing-OS dark UI.
 * Renders bar, line, and pie charts with zero heavy charting dependencies.
 */
export function Chart({
  chart_type = "bar",
  labels = [],
  datasets = [],
  title,
}: ChartProps) {
  if (!datasets || datasets.length === 0) {
    return (
      <div className="w-full bg-n-surface border border-n-border rounded-sm p-4 text-center text-n-text3 text-xs">
        (No chart data)
      </div>
    );
  }

  const primaryData = datasets[0]?.data ?? [];
  const maxVal = Math.max(1, ...datasets.flatMap((d) => d.data));

  return (
    <div className="w-full bg-n-surface border border-n-border rounded-sm p-4 animate-fade-in space-y-3">
      {title && (
        <div className="flex items-center justify-between pb-2 border-b border-n-border">
          <p className="text-n-text3 text-[9px] font-mono uppercase tracking-[0.18em]">
            {title}
          </p>
          <span className="nt-tag text-[8px] px-1.5 py-0.5 leading-none lowercase">
            {chart_type}
          </span>
        </div>
      )}

      {chart_type === "pie" ? (
        <RenderPieChart labels={labels} data={primaryData} />
      ) : chart_type === "line" ? (
        <RenderLineChart
          labels={labels}
          datasets={datasets}
          maxVal={maxVal}
        />
      ) : (
        <RenderBarChart
          labels={labels}
          datasets={datasets}
          maxVal={maxVal}
        />
      )}

      {/* Dataset legend if multiple */}
      {datasets.length > 1 && (
        <div className="flex flex-wrap gap-3 pt-2 border-t border-n-border text-[10px] font-mono">
          {datasets.map((d, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
              />
              <span className="text-n-text2">{d.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RenderBarChart({
  labels,
  datasets,
  maxVal,
}: {
  labels: string[];
  datasets: Dataset[];
  maxVal: number;
}) {
  const primary = datasets[0]?.data ?? [];
  const height = 120;

  return (
    <div className="space-y-2 pt-2">
      <div className="h-[120px] w-full flex items-end gap-2 px-1">
        {primary.map((val, idx) => {
          const barHeight = Math.max(4, Math.round((val / maxVal) * (height - 20)));
          return (
            <div
              key={idx}
              className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group"
            >
              <span className="text-[9px] font-mono text-n-text3 opacity-0 group-hover:opacity-100 transition-opacity">
                {val}
              </span>
              <div
                className="w-full bg-white rounded-t-xs transition-all duration-300 hover:opacity-80"
                style={{ height: `${barHeight}px` }}
              />
            </div>
          );
        })}
      </div>

      {labels.length > 0 && (
        <div className="flex gap-2 px-1 border-t border-n-border pt-1.5">
          {labels.map((lbl, idx) => (
            <span
              key={idx}
              className="flex-1 text-center font-mono text-[9px] text-n-text3 uppercase truncate"
              title={lbl}
            >
              {lbl}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function RenderLineChart({
  labels,
  datasets,
  maxVal,
}: {
  labels: string[];
  datasets: Dataset[];
  maxVal: number;
}) {
  const primary = datasets[0]?.data ?? [];
  const count = primary.length;
  const width = 300;
  const height = 120;
  const padding = 15;

  if (count <= 1) {
    return (
      <div className="text-xs text-n-text3 py-4 text-center">
        Need at least 2 points to render line chart.
      </div>
    );
  }

  const stepX = (width - padding * 2) / (count - 1);
  const points = primary.map((val, idx) => {
    const x = padding + idx * stepX;
    const y = height - padding - (val / maxVal) * (height - padding * 2);
    return { x, y, val };
  });

  const pathD = points.reduce((acc, p, i) => `${acc} ${i === 0 ? "M" : "L"} ${p.x} ${p.y}`, "");

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-[120px] overflow-visible"
      >
        {/* Subtle grid lines */}
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="#262626"
          strokeWidth="1"
        />
        <line
          x1={padding}
          y1={padding}
          x2={width - padding}
          y2={padding}
          stroke="#262626"
          strokeDasharray="2,2"
          strokeWidth="1"
        />

        {/* The data line */}
        <path
          d={pathD}
          fill="none"
          stroke="#ffffff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data point dots */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="3"
            fill="#ffffff"
            stroke="#0a0a0a"
            strokeWidth="1.5"
          />
        ))}
      </svg>

      {labels.length > 0 && (
        <div className="flex justify-between px-1 border-t border-n-border pt-1">
          {labels.map((lbl, idx) => (
            <span
              key={idx}
              className="font-mono text-[9px] text-n-text3 uppercase"
            >
              {lbl}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function RenderPieChart({
  labels,
  data,
}: {
  labels: string[];
  data: number[];
}) {
  const total = data.reduce((sum, v) => sum + v, 0) || 1;
  const size = 120;
  const radius = 45;
  const center = size / 2;

  let accumulatedAngle = 0;
  const slices = data.map((val, idx) => {
    const sliceAngle = (val / total) * 2 * Math.PI;
    const startAngle = accumulatedAngle;
    const endAngle = accumulatedAngle + sliceAngle;
    accumulatedAngle += sliceAngle;

    const x1 = center + radius * Math.cos(startAngle);
    const y1 = center + radius * Math.sin(startAngle);
    const x2 = center + radius * Math.cos(endAngle);
    const y2 = center + radius * Math.sin(endAngle);
    const largeArcFlag = sliceAngle > Math.PI ? 1 : 0;

    const d = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
    return {
      d,
      color: PALETTE[idx % PALETTE.length],
      label: labels[idx] ?? `Slice ${idx + 1}`,
      percentage: Math.round((val / total) * 100),
      val,
    };
  });

  return (
    <div className="flex flex-col sm:flex-row items-center justify-around gap-4 py-2">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-[120px] h-[120px] shrink-0"
      >
        {slices.map((slice, i) => (
          <path
            key={i}
            d={slice.d}
            fill={slice.color}
            stroke="#0a0a0a"
            strokeWidth="1.5"
          />
        ))}
      </svg>

      <div className="space-y-1.5 text-xs font-mono">
        {slices.map((slice, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 inline-block shrink-0"
              style={{ backgroundColor: slice.color }}
            />
            <span className="text-white text-[11px]">{slice.label}:</span>
            <span className="text-n-text3 text-[10px]">
              {slice.val} ({slice.percentage}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
