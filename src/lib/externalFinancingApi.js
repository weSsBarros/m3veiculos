import { supabase, COMPANY_ID } from './supabaseClient.js'
import { scopeBySellerOrCreator } from './viewScope.js'

// Financiamentos externos (tabela "external_financings"): o cliente achou o
// carro fora da loja e só fez o financiamento por ela. O vendedor cadastra e
// vê os dele; admin e gerente veem todos; excluir só o admin. A comissão é
// calculada e gravada pelo banco.

function num(value) {
  return value != null ? Number(value) : null
}

function fromRow(row) {
  return {
    id: row.id,
    customerId: row.customer_id || null,
    customerName: row.customer_name || '',
    vehicleLabel: row.vehicle_label || '',
    vehiclePlate: row.vehicle_plate || '',
    vehicleYear: row.vehicle_year || '',
    vehiclePrice: num(row.vehicle_price),
    vehicleSource: row.vehicle_source || 'particular',
    vehicleSourceName: row.vehicle_source_name || '',
    bank: row.bank || '',
    downPayment: num(row.down_payment),
    financedAmount: num(row.financed_amount),
    installmentsCount: row.installments_count ?? null,
    installmentAmount: num(row.installment_amount),
    sellerId: row.seller_id || null,
    status: row.status,
    submittedOn: row.submitted_on,
    approvedOn: row.approved_on || null,
    paidOn: row.paid_on || null,
    closedOn: row.closed_on || null,
    storeReturn: num(row.store_return),
    commissionType: row.commission_type || null,
    commissionValue: num(row.commission_value),
    commissionAmount: Number(row.commission_amount) || 0,
    commissionPaidOn: row.commission_paid_on || null,
    notes: row.notes || '',
    createdBy: row.created_by || null,
    createdAt: row.created_at,
  }
}

function toRow(item) {
  return {
    customer_id: item.customerId || null,
    customer_name: item.customerName,
    vehicle_label: item.vehicleLabel || '',
    vehicle_plate: (item.vehiclePlate || '').toUpperCase(),
    vehicle_year: item.vehicleYear || '',
    vehicle_price: item.vehiclePrice ?? null,
    vehicle_source: item.vehicleSource === 'loja' ? 'loja' : 'particular',
    vehicle_source_name: item.vehicleSourceName || '',
    bank: item.bank || '',
    down_payment: item.downPayment ?? null,
    financed_amount: item.financedAmount ?? null,
    installments_count: item.installmentsCount ?? null,
    installment_amount: item.installmentAmount ?? null,
    seller_id: item.sellerId || null,
    status: item.status || 'em_analise',
    submitted_on: item.submittedOn || undefined,
    approved_on: item.approvedOn || null,
    paid_on: item.paidOn || null,
    closed_on: item.closedOn || null,
    store_return: item.storeReturn ?? null,
    notes: item.notes || '',
  }
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
}

export async function fetchExternalFinancings() {
  requireSupabase()
  const { data, error } = await supabase
    .from('external_financings')
    .select('*')
    .eq('company_id', COMPANY_ID)
    .order('submitted_on', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return scopeBySellerOrCreator(data.map(fromRow))
}

export async function createExternalFinancing(item) {
  requireSupabase()
  const { data, error } = await supabase
    .from('external_financings')
    .insert({ ...toRow(item), company_id: COMPANY_ID })
    .select()
    .single()
  if (error) throw error
  return fromRow(data)
}

export async function updateExternalFinancing(id, item) {
  requireSupabase()
  const { data, error } = await supabase
    .from('external_financings')
    .update(toRow(item))
    .eq('id', id)
    .eq('company_id', COMPANY_ID)
    .select()
    .single()
  if (error) throw error
  return fromRow(data)
}

// Só o admin (regra no banco)
export async function deleteExternalFinancing(id) {
  requireSupabase()
  const { error } = await supabase.from('external_financings').delete().eq('id', id).eq('company_id', COMPANY_ID)
  if (error) throw error
}
