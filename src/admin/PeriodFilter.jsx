import DateInputBR from '../components/DateInputBR.jsx'
import { PERIODS } from '../utils/period.js'

// periods: a lista de opções (PERIODS, para o que já aconteceu, ou DUE_PERIODS,
// para o que vence)
export default function PeriodFilter({ period, onPeriodChange, customStart, customEnd, onCustomStartChange, onCustomEndChange, periods = PERIODS }) {
  return (
    <div className="admin-period-filter">
      <select value={period} onChange={(e) => onPeriodChange(e.target.value)} aria-label="Período">
        {periods.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>
      {period === 'personalizado' && (
        <>
          <label>
            De
            <DateInputBR value={customStart} onChange={onCustomStartChange} />
          </label>
          <label>
            Até
            <DateInputBR value={customEnd} onChange={onCustomEndChange} />
          </label>
        </>
      )}
    </div>
  )
}
