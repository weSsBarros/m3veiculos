import { supabase } from './supabaseClient.js'

function fromRow(row) {
  return {
    id: row.id,
    carId: row.car_id,
    category: row.category,
    description: row.description || '',
    amount: row.amount,
    expenseDate: row.expense_date,
    attachments: row.attachments || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toRow(expense) {
  return {
    car_id: expense.carId,
    category: expense.category,
    description: expense.description || '',
    amount: expense.amount,
    expense_date: expense.expenseDate,
    attachments: expense.attachments || [],
  }
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase não configurado. Preencha o arquivo .env com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  }
}

// -- Gastos (painel /admin, requer login) ------------------------------------

export async function fetchExpensesByCar(carId) {
  requireSupabase()
  const { data, error } = await supabase
    .from('car_expenses')
    .select('*')
    .eq('car_id', carId)
    .order('expense_date', { ascending: false })
  if (error) throw error
  return data.map(fromRow)
}

export async function fetchAllExpensesAdmin() {
  requireSupabase()
  const { data, error } = await supabase
    .from('car_expenses')
    .select('*')
    .order('expense_date', { ascending: false })
  if (error) throw error
  return data.map(fromRow)
}

export async function createExpense(expense) {
  requireSupabase()
  const { data, error } = await supabase.from('car_expenses').insert(toRow(expense)).select().single()
  if (error) throw error
  return fromRow(data)
}

export async function updateExpense(id, expense) {
  requireSupabase()
  const { data, error } = await supabase.from('car_expenses').update(toRow(expense)).eq('id', id).select().single()
  if (error) throw error
  return fromRow(data)
}

export async function deleteExpense(id) {
  requireSupabase()
  const { error } = await supabase.from('car_expenses').delete().eq('id', id)
  if (error) throw error
}

// -- Anexos (Supabase Storage, bucket PRIVADO "expense-attachments") ---------
// Diferente das fotos dos carros, os anexos de gastos (notas, recibos) não são
// públicos: guardamos só o "path" no banco e geramos um link assinado
// temporário na hora de visualizar.

export async function uploadExpenseAttachment(carId, file) {
  requireSupabase()
  const ext = file.name.split('.').pop()
  const path = `${carId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('expense-attachments').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw error
  return { path, name: file.name, type: file.type }
}

export async function deleteExpenseAttachment(path) {
  requireSupabase()
  await supabase.storage.from('expense-attachments').remove([path])
}

export async function getAttachmentSignedUrl(path) {
  requireSupabase()
  const { data, error } = await supabase.storage.from('expense-attachments').createSignedUrl(path, 120)
  if (error) throw error
  return data.signedUrl
}
