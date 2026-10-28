import { supabase, COMPANY_ID } from './supabaseClient.js'
import { scopeCustomerFinance } from './viewScope.js'
import { todayISO } from '../utils/carFormat.js'

// Financiamento próprio da loja (carnê): "customer_financings" e as parcelas
// em "financing_installments". Só o admin e o gerente com "Vê valores das
// vendas" leem e gravam (regra no banco); excluir só o admin.

function num(value) {
  return value === null || value === undefined ? null : Number(value)
}

function fromInstallmentRow(row) {
  return {
    id: row.id,
    financingId: row.financing_id,
    number: row.number,
    dueDate: row.due_date,
    amount: num(row.amount),
    paidOn: row.paid_on || null,
    paidAmount: num(row.paid_amount),
    lateCharges: num(row.late_charges) || 0,
    paymentMethod: row.payment_method || '',
    notes: row.notes || '',
  }
}

function fromRow(row) {
  return {
    id: row.id,
    customerId: row.customer_id || null,
    carId: row.car_id || null,
    customerName: row.customer_name,
    vehicleLabel: row.vehicle_label || '',
    vehiclePlate: row.vehicle_plate || '',
    vehiclePrice: num(row.vehicle_price) || 0,
    downPayment: num(row.down_payment) || 0,
    financedAmount: num(row.financed_amount) || 0,
    installmentsCount: row.installments_count,
    installmentAmount: num(row.installment_amount) || 0,
    interestRate: num(row.interest_rate),
    firstDueDate: row.first_due_date,
    lateFeePercent: num(row.late_fee_percent) || 0,
    lateInterestPercent: num(row.late_interest_percent) || 0,
    status: row.status,
    notes: row.notes || '',
    createdAt: row.created_at,
    installments: (row.financing_installments || []).map(fromInstallmentRow).sort((a, b) => a.number - b.number),
  }
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
}

// customerId opcional: só os financiamentos daquele cliente
export async function fetchFinancings({ customerId } = {}) {
  requireSupabase()
  let query = supabase.from('customer_financings').select('*, financing_installments(*)').eq('company_id', COMPANY_ID)
  if (customerId) query = query.eq('customer_id', customerId)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error
  return scopeCustomerFinance(data.map(fromRow))
}

export async function fetchFinancing(id) {
  requireSupabase()
  const { data, error } = await supabase
    .from('customer_financings')
    .select('*, financing_installments(*)')
    .eq('id', id)
    .eq('company_id', COMPANY_ID)
    .single()
  if (error) throw error
  return fromRow(data)
}

function financingPayload(financing) {
  return {
    customer_id: financing.customerId || null,
    car_id: financing.carId || null,
    customer_name: financing.customerName,
    vehicle_label: financing.vehicleLabel || '',
    vehicle_plate: financing.vehiclePlate || '',
    vehicle_price: financing.vehiclePrice || 0,
    down_payment: financing.downPayment || 0,
    financed_amount: financing.financedAmount,
    installments_count: financing.installmentsCount,
    installment_amount: financing.installmentAmount,
    interest_rate: financing.interestRate ?? null,
    first_due_date: financing.firstDueDate,
    late_fee_percent: financing.lateFeePercent,
    late_interest_percent: financing.lateInterestPercent,
    notes: financing.notes || '',
  }
}

// Cria o financiamento e as parcelas numa única operação no banco
export async function createFinancing(financing) {
  requireSupabase()
  const { data: id, error } = await supabase.rpc('create_customer_financing', { p: financingPayload(financing) })
  if (error) throw error
  return fetchFinancing(id)
}

// Edita tudo depois de criado (seção 97). Mudando o número de parcelas, o valor da
// parcela ou o 1º vencimento, o banco refaz as parcelas em aberto; as pagas ficam.
export async function editFinancing(id, financing) {
  requireSupabase()
  const { error } = await supabase.rpc('update_customer_financing', {
    p_id: id,
    p: { ...financingPayload(financing), status: financing.status },
  })
  if (error) throw error
  return fetchFinancing(id)
}

export async function deleteFinancing(id) {
  requireSupabase()
  const { error } = await supabase.from('customer_financings').delete().eq('id', id).eq('company_id', COMPANY_ID)
  if (error) throw error
}

// Baixa: paidAmount = total recebido; lateCharges = multa e juros cobrados
export async function payInstallment(id, { paidOn, paidAmount, lateCharges, paymentMethod, notes }) {
  requireSupabase()
  const { data, error } = await supabase
    .from('financing_installments')
    .update({
      paid_on: paidOn,
      paid_amount: paidAmount,
      late_charges: lateCharges || 0,
      payment_method: paymentMethod || '',
      notes: notes || '',
    })
    .eq('id', id)
    .eq('company_id', COMPANY_ID)
    .select()
    .single()
  if (error) throw error
  return fromInstallmentRow(data)
}

export async function undoInstallmentPayment(id) {
  requireSupabase()
  const { data, error } = await supabase
    .from('financing_installments')
    .update({ paid_on: null, paid_amount: null, late_charges: 0, payment_method: '', notes: '' })
    .eq('id', id)
    .eq('company_id', COMPANY_ID)
    .select()
    .single()
  if (error) throw error
  return fromInstallmentRow(data)
}

// Ajuste de vencimento ou valor de uma parcela em aberto
export async function updateInstallment(id, { dueDate, amount }) {
  requireSupabase()
  const { data, error } = await supabase
    .from('financing_installments')
    .update({ due_date: dueDate, amount })
    .eq('id', id)
    .eq('company_id', COMPANY_ID)
    .select()
    .single()
  if (error) throw error
  return fromInstallmentRow(data)
}

// Parcelas vencidas de financiamentos ativos (aviso no menu e no Dashboard)
export async function fetchOverdueInstallments() {
  requireSupabase()
  const { data, error } = await supabase
    .from('financing_installments')
    .select('id, due_date, amount, customer_financings!inner(status)')
    .eq('company_id', COMPANY_ID)
    .is('paid_on', null)
    .lt('due_date', todayISO())
    .eq('customer_financings.status', 'ativo')
  if (error) throw error
  return scopeCustomerFinance(data.map((row) => ({ id: row.id, dueDate: row.due_date, amount: Number(row.amount) })))
}

// Parcelas em aberto que vencem nos próximos `days` dias (lista do Dashboard):
// quem, o carro, qual parcela, quando e quanto, com o telefone para o lembrete
export async function fetchUpcomingInstallments(days = 7) {
  requireSupabase()
  const today = todayISO()
  const until = new Date()
  until.setDate(until.getDate() + days)
  const untilISO = `${until.getFullYear()}-${String(until.getMonth() + 1).padStart(2, '0')}-${String(until.getDate()).padStart(2, '0')}`
  const { data, error } = await supabase
    .from('financing_installments')
    .select('id, number, due_date, amount, financing_id, customer_financings!inner(status, customer_name, vehicle_label, installments_count, customers(name, phone))')
    .eq('company_id', COMPANY_ID)
    .is('paid_on', null)
    .gte('due_date', today)
    .lte('due_date', untilISO)
    .eq('customer_financings.status', 'ativo')
    .order('due_date', { ascending: true })
  if (error) throw error
  return scopeCustomerFinance(
    data.map((row) => {
      const financing = row.customer_financings || {}
      return {
        id: row.id,
        number: row.number,
        dueDate: row.due_date,
        amount: Number(row.amount),
        financingId: row.financing_id,
        customerName: financing.customers?.name || financing.customer_name || '',
        customerPhone: financing.customers?.phone || '',
        vehicleLabel: financing.vehicle_label || '',
        installmentsCount: financing.installments_count || 0,
      }
    })
  )
}
