// Reserva vencida (prazo passou) ou vencendo nos próximos `days` dias
export function reservationAlert(reservation, days = 2, today = new Date()) {
  if (reservation.status !== 'ativa' || !reservation.reservedUntil) return null
  const due = new Date(`${reservation.reservedUntil}T23:59:59`)
  if (due < today) return 'vencida'
  const diff = (due - today) / 86400000
  return diff <= days ? 'vence_logo' : null
}
