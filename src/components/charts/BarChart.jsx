import './charts.css'

export default function BarChart({ data, formatValue, color = 'var(--color-primary)', height = 180 }) {
  const max = Math.max(1, ...data.map((d) => d.value))

  return (
    <div className="chart-bars" style={{ height }}>
      {data.map((d) => (
        <div className="chart-bar-col" key={d.label}>
          <span className="chart-bar-value">{formatValue ? formatValue(d.value) : d.value}</span>
          <div className="chart-bar-track">
            <div
              className="chart-bar-fill"
              style={{ height: `${max ? (d.value / max) * 100 : 0}%`, background: color }}
            />
          </div>
          <span className="chart-bar-label">{d.label}</span>
        </div>
      ))}
    </div>
  )
}
