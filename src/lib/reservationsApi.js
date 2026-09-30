import { supabase, COMPANY_ID } from './supabaseClient.js'
import { scopeBySellerOrCreator } from './viewScope.js'

// Reserva com sinal (tabela "car_reservations"). Reservar e cancelar passam
// por funções do banco, que mudam o status do carro junto. O vendedor reserva
// só no nome dele; cancelar ou converter em venda é do admin e do gerente.

function fromRow(row) {
  return {
    id: row.id,
    carId: row.car_id,
    customerId: row.customer_id || null,
    customerName: row.customer_name || '',
    sellerId: row.seller_id || null,
    depositAmount: row.deposit_amount != null ? Number(row.deposit_amount) : null,
    reservedOn: row.reserved_on,
    reservedUntil: row.reserved_until || null,
    notes: row.notes || '',
    status: row.status,
    closedOn: row.closed_on || null,
    createdBy: row.created_by || null,
    createdAt: row.created_at,
  }
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
}

export const RESERVATION_STATUS_LABELS = {
  ativa: 'Ativa',
  convertida: 'Virou venda',
  cancelada: 'Cancelada',
}

// status: 'ativa' (padrão) ou 'todas'
export async function fetchReservations({ status = 'ativa' } = {}) {
  requireSupabase()
  let query = supabase.from('car_reservations').select('*').eq('company_id', COMPANY_ID)
  if (status !== 'todas') query = query.eq('status', status)
  const { data, error } = await query.order('reserved_on', { ascending: false })
  if (error) throw error
  return scopeBySellerOrCreator(data.map(fromRow))
}

export async function reserveCar({ carId, customerId, customerName, sellerId, depositAmount, reservedOn, reservedUntil, notes }) {
  requireSupabase()
  const { data, error } = await supabase.rpc('reserve_car', {
    p: {
      car_id: carId,
      customer_id: customerId || '',
      customer_name: customerName || '',
      seller_id: sellerId || '',
      deposit_amount: depositAmount ?? '',
      reserved_on: reservedOn || '',
      reserved_until: reservedUntil || '',
      notes: notes || '',
    },
  })
  if (error) throw error
  return data
}

// result: 'convertida' (virou venda) ou 'cancelada' (carro volta a ficar disponível)
export async function closeReservation(id, result) {
  requireSupabase()
  const { error } = await supabase.rpc('close_reservation', { p_id: id, p_result: result })
  if (error) throw error
}

// Aviso de reserva vencida ou vencendo (regra em utils/reservations.js)
export { reservationAlert } from '../utils/reservations.js'
