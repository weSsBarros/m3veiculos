import { supabase, COMPANY_ID } from './supabaseClient.js'
import { scopeSales } from './viewScope.js'

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
    // Transferência do veículo (vendas antigas, sem a coluna: "não informada")
    transferStatus: row.transfer_status || 'nao_informada',
    transferResponsible: row.transfer_responsible || 'comprador',
    transferDueDate: row.transfer_due_date || null,
    transferDoneOn: row.transfer_done_on || null,
    transferNotes: row.transfer_notes || '',
    checklist: Array.isArray(row.checklist) ? row.checklist : [],
    // Forma de pagamento ('' = não informada), banco e valores do financiamento
    paymentMethod: row.payment_method || '',
    bank: row.bank || '',
    downPayment: row.down_payment != null ? Number(row.down_payment) : null,
    financedAmount: row.financed_amount != null ? Number(row.financed_amount) : null,
    // Carro recebido na troca (já cadastrado no estoque)
    tradeInCarId: row.trade_in_car_id || null,
    tradeInValue: row.trade_in_value != null ? Number(row.trade_in_value) : null,
    commissionPaidOn: row.commission_paid_on || null,
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
  return scopeSales(data.map(fromRow))
}

export async function fetchSaleByCar(carId) {
  requireSupabase()
  const { data, error } = await supabase.from('sales').select('*').eq('car_id', carId).maybeSingle()
  if (error) throw error
  return data ? scopeSales([fromRow(data)])[0] || null : null
}

// Uma venda por carro: grava ou atualiza. A comissão é calculada no banco.
// checklist, pagamento e troca só são gravados quando informados (a edição
// pelo formulário do carro não mexe no checklist nem na transferência).
// insertOnly: o vendedor só registra venda nova (editar é do admin/gerente),
// e o banco só deixa ele inserir venda no nome dele.
export async function saveSaleForCar(carId, { sellerId, salePrice, saleDate, checklist, payment, tradeIn, insertOnly = false }) {
  requireSupabase()
  const row = {
    car_id: carId,
    company_id: COMPANY_ID,
    seller_id: sellerId || null,
    sale_price: salePrice,
    sale_date: saleDate,
  }
  if (checklist !== undefined) row.checklist = checklist
  if (payment !== undefined) {
    row.payment_method = payment.method || ''
    row.bank = payment.method === 'financiado' ? payment.bank || '' : ''
    row.down_payment = payment.downPayment ?? null
    row.financed_amount = payment.financedAmount ?? null
  }
  if (tradeIn !== undefined) {
    row.trade_in_car_id = tradeIn?.carId || null
    row.trade_in_value = tradeIn?.value ?? null
  }
  const query = insertOnly ? supabase.from('sales').insert(row) : supabase.from('sales').upsert(row, { onConflict: 'car_id' })
  const { data, error } = await query.select().single()
  if (error) throw error
  return fromRow(data)
}

// Comissões pagas (admin): marca de uma vez vendas e financiamentos externos.
// paidOn null desmarca.
export async function markCommissionsPaid({ saleIds = [], externalIds = [], paidOn }) {
  requireSupabase()
  const { data, error } = await supabase.rpc('mark_commissions_paid', {
    p_sale_ids: saleIds,
    p_external_ids: externalIds,
    p_paid_on: paidOn || null,
  })
  if (error) throw error
  return data
}

// Situação da transferência (admin e gerente)
export async function updateSaleTransfer(saleId, { status, responsible, dueDate, doneOn, notes }) {
  requireSupabase()
  const { data, error } = await supabase
    .from('sales')
    .update({
      transfer_status: status,
      transfer_responsible: responsible,
      transfer_due_date: dueDate || null,
      transfer_done_on: status === 'concluida' ? doneOn || null : null,
      transfer_notes: notes || '',
    })
    .eq('id', saleId)
    .eq('company_id', COMPANY_ID)
    .select()
    .single()
  if (error) throw error
  return fromRow(data)
}

export async function updateSaleChecklist(saleId, checklist) {
  requireSupabase()
  const { data, error } = await supabase
    .from('sales')
    .update({ checklist })
    .eq('id', saleId)
    .eq('company_id', COMPANY_ID)
    .select()
    .single()
  if (error) throw error
  return fromRow(data)
}

// Transferências em aberto (aviso no menu): só as colunas necessárias
export async function fetchOpenTransfers() {
  requireSupabase()
  const { data, error } = await supabase
    .from('sales')
    .select('id, sale_date, transfer_status, transfer_due_date')
    .eq('company_id', COMPANY_ID)
    .in('transfer_status', ['pendente', 'em_andamento'])
  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    saleDate: row.sale_date,
    transferStatus: row.transfer_status,
    transferDueDate: row.transfer_due_date,
  }))
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

// Carros vendidos com o valor e a data efetivos da venda (lucro do mês)
export function soldEntriesFrom(cars, sales) {
  const salesByCar = Object.fromEntries(sales.map((s) => [s.carId, s]))
  return cars
    .filter((c) => c.status === 'vendido')
    .map((car) => {
      const sale = salesByCar[car.id] || null
      return { car, sale, price: effectiveSalePrice(car, sale), date: effectiveSaleDate(car, sale) }
    })
}
