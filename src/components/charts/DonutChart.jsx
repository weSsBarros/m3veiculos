import './charts.css'

export default function DonutChart({ data, size = 160, thickness = 26, formatValue }) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="donut-chart">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {total === 0 ? (
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-border)" strokeWidth={thickness} />
        ) : (
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            {data
              .filter((d) => d.value > 0)
              .map((d) => {
                const fraction = d.value / total
                const dash = fraction * circumference
                const segment = (
                  <circle
                    key={d.label}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={d.color}
                    strokeWidth={thickness}
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={-offset}
                  />
                )
                offset += dash
                return segment
              })}
          </g>
        )}
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="donut-chart-total">
          {formatValue ? formatValue(total) : total}
        </text>
      </svg>
      <div className="donut-legend">
        {data.map((d) => (
          <div className="donut-legend-item" key={d.label}>
            <span className="donut-legend-dot" style={{ background: d.color }} />
            {d.label} · {formatValue ? formatValue(d.value) : d.value}
          </div>
        ))}
      </div>
    </div>
  )
}
