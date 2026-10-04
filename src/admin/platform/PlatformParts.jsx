import { ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { trend, HEALTH_LABELS } from '../../utils/platform.js'

// Variação em relação ao período anterior (some quando não dá para comparar)
export function Trend({ prev, value }) {
  const t = trend(prev, value)
  if (t.direction === 'same' || t.pct === null) return null
  const Icon = t.direction === 'up' ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`platform-trend is-${t.direction}`}>
      <Icon size={13} /> {t.pct > 0 ? '+' : ''}
      {t.pct}%
    </span>
  )
}

export function HealthPill({ level, labels = HEALTH_LABELS }) {
  return <span className={`platform-health is-${level}`}>{labels[level]}</span>
}
