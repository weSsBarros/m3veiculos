import { supabase, COMPANY_ID } from './supabaseClient.js'

function fromRow(row) {
  return {
    id: row.id,
    carId: row.car_id,
    sellerId: row.seller_id,
    salePrice: row.sale_price,
    saleDate: row.sale_date,
    commissionType: row.commission_type,
    commissionValue: row.commission_value != null ? Number(row.commission_value) : null,
    commissionAmount: Number(row.commission_amount) || 0,
    createdAt: row.created_at,
  }
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
}

// Admin recebe todas as vendas da loja; vendedor recebe só as dele (RLS).
export async function fetchSales() {
  requireSupabase()
  const { data, error } = await supabase
    .from('sales')
    .select('*')
    .eq('company_id', COMPANY_ID)
    .order('sale_date', { ascending: false })
  if (error) throw error
  return data.map(fromRow)
}

export async function fetchSaleByCar(carId) {
  requireSupabase()
  const { data, error } = await supabase.from('sales').select('*').eq('car_id', carId).maybeSingle()
  if (error) throw error
  return data ? fromRow(data) : null
}

// Uma venda por carro: grava ou atualiza. A comissão é calculada no banco.
export async function saveSaleForCar(carId, { sellerId, salePrice, saleDate }) {
  requireSupabase()
  const { data, error } = await supabase
    .from('sales')
    .upsert(
      {
        car_id: carId,
        company_id: COMPANY_ID,
        seller_id: sellerId || null,
        sale_price: salePrice,
        sale_date: saleDate,
      },
      { onConflict: 'car_id' }
    )
    .select()
    .single()
  if (error) throw error
  return fromRow(data)
}

export async function deleteSaleForCar(carId) {
  requireSupabase()
  const { error } = await supabase.from('sales').delete().eq('car_id', carId).eq('company_id', COMPANY_ID)
  if (error) throw error
}

// Valor efetivo de uma venda: o valor negociado registrado, ou o preço
// anunciado para vendas antigas (anteriores ao registro de vendas).
export function effectiveSalePrice(car, sale) {
  if (sale) return sale.salePrice
  return car?.price ?? 0
}

export function effectiveSaleDate(car, sale) {
  if (sale) return sale.saleDate
  return car?.soldAt ? car.soldAt.slice(0, 10) : null
}
