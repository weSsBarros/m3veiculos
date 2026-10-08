import { supabase, COMPANY_ID } from './supabaseClient.js'

// Despesas da empresa (seção 63): só o admin da loja lê e grava.

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase não configurado. Preencha o arquivo .env com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  }
}

export function companyExpenseFromRow(row) {
  return {
    id: row.id,
    category: row.category,
    description: row.description || '',
    amount: Number(row.amount) || 0,
    dueOn: row.due_on,
    paidOn: row.paid_on || null,
    supplierId: row.supplier_id || null,
    notes: row.notes || '',
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    recurrenceId: row.recurrence_id || null,
    referenceMonth: row.reference_month || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function recurrenceFromRow(row) {
  return {
    id: row.id,
    category: row.category,
    description: row.description || '',
    amount: Number(row.amount) || 0,
    day: row.day,
    startsOn: row.starts_on,
    lastGeneratedMonth: row.last_generated_month,
    supplierId: row.supplier_id || null,
    notes: row.notes || '',
    active: row.active,
  }
}

function toRow(expense) {
  return {
    category: expense.category,
    description: expense.description || '',
    amount: expense.amount,
    due_on: expense.dueOn,
    paid_on: expense.paidOn || null,
    supplier_id: expense.supplierId || null,
    notes: expense.notes || '',
    attachments: expense.attachments || [],
  }
}

// Cria as despesas dos meses que faltam dos modelos ("Repetir todo mês")
export async function generateCompanyExpenses() {
  requireSupabase()
  const { error } = await supabase.rpc('company_expenses_generate')
  if (error) throw error
}

export async function fetchCompanyExpenses() {
  requireSupabase()
  const { data, error } = await supabase
    .from('company_expenses')
    .select('*')
    .eq('company_id', COMPANY_ID)
    .order('due_on', { ascending: false })
  if (error) throw error
  return data.map(companyExpenseFromRow)
}

export async function fetchCompanyExpenseRecurrences() {
  requireSupabase()
  const { data, error } = await supabase
    .from('company_expense_recurrences')
    .select('*')
    .eq('company_id', COMPANY_ID)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data.map(recurrenceFromRow)
}

export async function createCompanyExpense(expense, { repeat = false } = {}) {
  requireSupabase()
  const { data, error } = await supabase.rpc('create_company_expense', { p: toRow(expense), p_repeat: repeat })
  if (error) throw error
  return companyExpenseFromRow(data)
}

export async function updateCompanyExpense(id, expense) {
  requireSupabase()
  const { data, error } = await supabase
    .from('company_expenses')
    .update(toRow(expense))
    .eq('id', id)
    .eq('company_id', COMPANY_ID)
    .select()
    .single()
  if (error) throw error
  return companyExpenseFromRow(data)
}

export async function setCompanyExpensePaid(id, paidOn) {
  requireSupabase()
  const { data, error } = await supabase
    .from('company_expenses')
    .update({ paid_on: paidOn || null })
    .eq('id', id)
    .eq('company_id', COMPANY_ID)
    .select()
    .single()
  if (error) throw error
  return companyExpenseFromRow(data)
}

export async function deleteCompanyExpense(id) {
  requireSupabase()
  const { error } = await supabase.from('company_expenses').delete().eq('id', id).eq('company_id', COMPANY_ID)
  if (error) throw error
}

// "Aplicar também às próximas": muda o modelo (valor, dia, categoria...)
export async function updateCompanyExpenseRecurrence(id, { category, description, amount, day, supplierId, notes }) {
  requireSupabase()
  const { data, error } = await supabase
    .from('company_expense_recurrences')
    .update({ category, description: description || '', amount, day, supplier_id: supplierId || null, notes: notes || '' })
    .eq('id', id)
    .eq('company_id', COMPANY_ID)
    .select()
    .single()
  if (error) throw error
  return recurrenceFromRow(data)
}

// "Parar de repetir": as despesas já criadas ficam
export async function stopCompanyExpenseRecurrence(id) {
  requireSupabase()
  const { data, error } = await supabase
    .from('company_expense_recurrences')
    .update({ active: false })
    .eq('id', id)
    .eq('company_id', COMPANY_ID)
    .select()
    .single()
  if (error) throw error
  return recurrenceFromRow(data)
}
