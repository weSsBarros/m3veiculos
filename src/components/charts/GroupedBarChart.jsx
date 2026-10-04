import './charts.css'

// Barras lado a lado por coluna (ex.: previsto x recebido de cada mês).
// data: [{ label, title, values: [n, n] }]; series: [{ label, color }]
export default function GroupedBarChart({ data, series, formatValue, height = 200 }) {
  const max = Math.max(1, ...data.flatMap((d) => d.values.map((v) => v || 0)))

  return (
    <div className="chart-grouped">
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.color }} /> {s.label}
          </span>
        ))}
      </div>
      <div className="chart-bars chart-bars--grouped" style={{ height }}>
        {data.map((d) => (
          <div className="chart-bar-col" key={d.label} title={d.title}>
            <div className="chart-bar-group">
              {d.values.map((v, i) => (
                <div className="chart-bar-track" key={series[i].label}>
                  <div
                    className="chart-bar-fill"
                    title={`${series[i].label}: ${formatValue ? formatValue(v) : v}`}
                    style={{ height: `${((v || 0) / max) * 100}%`, background: series[i].color, minHeight: v ? 2 : 0 }}
                  />
                </div>
              ))}
            </div>
            <span className="chart-bar-label">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
