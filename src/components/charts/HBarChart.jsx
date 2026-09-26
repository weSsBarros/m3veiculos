import './charts.css'

// Barras horizontais: bom pra rótulos longos (nome de vendedor, fornecedor).
export default function HBarChart({ data, formatValue, color = 'var(--color-primary)', emptyLabel = 'Sem dados ainda.' }) {
  if (data.length === 0) return <p className="admin-muted">{emptyLabel}</p>
  const max = Math.max(1, ...data.map((d) => d.value))

  return (
    <div className="hbar-chart">
      {data.map((d) => (
        <div className="hbar-row" key={d.key || d.label}>
          <div className="hbar-head">
            <span className="hbar-label">{d.label}</span>
            <span className="hbar-value">{formatValue ? formatValue(d.value) : d.value}</span>
          </div>
          <div className="hbar-track">
            <div className="hbar-fill" style={{ width: `${(d.value / max) * 100}%`, background: d.color || color }} />
          </div>
          {d.sub && <span className="hbar-sub">{d.sub}</span>}
        </div>
      ))}
    </div>
  )
}
