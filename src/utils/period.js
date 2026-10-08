import { todayISO } from './carFormat.js'

export const PERIODS = [
  { value: 'mes', label: 'Este mês' },
  { value: 'mes-anterior', label: 'Mês passado' },
  { value: '3meses', label: 'Últimos 3 meses' },
  { value: 'ano', label: 'Este ano' },
  { value: 'tudo', label: 'Todo o período' },
  { value: 'personalizado', label: 'Personalizado' },
]

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Intervalo [start, end] em datas ISO (yyyy-mm-dd); null = sem limite
export function periodRange(period, customStart, customEnd) {
  const now = new Date()
  const today = todayISO()
  switch (period) {
    case 'mes':
      return { start: iso(new Date(now.getFullYear(), now.getMonth(), 1)), end: today }
    case 'mes-anterior':
      return {
        start: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        end: iso(new Date(now.getFullYear(), now.getMonth(), 0)),
      }
    case '3meses':
      return { start: iso(new Date(now.getFullYear(), now.getMonth() - 2, 1)), end: today }
    case 'ano':
      return { start: iso(new Date(now.getFullYear(), 0, 1)), end: today }
    case 'personalizado':
      return { start: customStart || null, end: customEnd || null }
    default:
      return { start: null, end: null }
  }
}

// Períodos das telas de contas e parcelas (o que vence): mês e ano inteiros,
// inclusive os dias que ainda vão chegar
export const DUE_PERIODS = [
  { value: 'tudo', label: 'Todo o período' },
  { value: 'mes', label: 'Este mês' },
  { value: 'proximo-mes', label: 'Próximo mês' },
  { value: '30dias', label: 'Próximos 30 dias' },
  { value: 'mes-anterior', label: 'Mês passado' },
  { value: 'ano', label: 'Este ano' },
  { value: 'personalizado', label: 'Personalizado' },
]

// Intervalo [start, end] de um período de DUE_PERIODS; today em 'AAAA-MM-DD'
export function duePeriodRange(period, customStart, customEnd, today = todayISO()) {
  const [y, m, d] = today.split('-').map(Number)
  const day = (yy, mm, dd) => iso(new Date(yy, mm - 1, dd))
  switch (period) {
    case 'mes':
      return { start: day(y, m, 1), end: day(y, m + 1, 0) }
    case 'proximo-mes':
      return { start: day(y, m + 1, 1), end: day(y, m + 2, 0) }
    case '30dias':
      return { start: today, end: day(y, m, d + 30) }
    case 'mes-anterior':
      return { start: day(y, m - 1, 1), end: day(y, m, 0) }
    case 'ano':
      return { start: day(y, 1, 1), end: day(y, 12, 31) }
    case 'personalizado':
      return { start: customStart || null, end: customEnd || null }
    default:
      return { start: null, end: null }
  }
}

export function inRange(dateISO, { start, end }) {
  if (!dateISO) return !start && !end
  const d = dateISO.slice(0, 10)
  if (start && d < start) return false
  if (end && d > end) return false
  return true
}
