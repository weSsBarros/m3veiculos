import { supabase, COMPANY_ID } from './supabaseClient.js'
import { scopeExpenses } from './viewScope.js'
import { friendlyUploadError } from './storageErrors.js'

function fromRow(row) {
  return {
    id: row.id,
    carId: row.car_id,
    category: row.category,
    description: row.description || '',
    amount: row.amount,
    expenseDate: row.expense_date,
    attachments: row.attachments || [],
    supplierId: row.supplier_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toRow(expense) {
  return {
    car_id: expense.carId,
    company_id: COMPANY_ID,
    category: expense.category,
    description: expense.description || '',
    amount: expense.amount,
    expense_date: expense.expenseDate,
    attachments: expense.attachments || [],
    supplier_id: expense.supplierId || null,
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
    .eq('company_id', COMPANY_ID)
    .order('expense_date', { ascending: false })
  if (error) throw error
  return scopeExpenses(data.map(fromRow))
}

// O que quem está logado lê dos gastos (seção 89): 'full' (admin ou gerente com
// "Gasto em manutenção"), 'totals' (gerente só com "Custo de compra, margem e
// lucro": um total por carro, para a margem) ou 'none'. O AuthContext define.
let expenseMode = 'full'

export function setExpensesAccess(mode) {
  expenseMode = ['full', 'totals', 'none'].includes(mode) ? mode : 'none'
}

// Um "gasto" por carro com o total (sem a lista, que o gerente não vê)
async function expenseTotalsAsEntries() {
  const { data, error } = await supabase.rpc('car_costs')
  if (error) throw error
  return (Array.isArray(data) ? data : [])
    .filter((c) => Number(c.expenses_total) > 0)
    .map((c) => ({
      id: `total-${c.car_id}`,
      carId: c.car_id,
      category: 'outros',
      description: 'Total dos gastos',
      amount: Number(c.expenses_total),
      expenseDate: null,
      attachments: [],
      supplierId: null,
      isTotal: true,
    }))
}

export async function fetchAllExpensesAdmin() {
  requireSupabase()
  if (expenseMode === 'totals') return scopeExpenses(await expenseTotalsAsEntries())
  if (expenseMode === 'none') return []
  const { data, error } = await supabase
    .from('car_expenses')
    .select('*')
    .eq('company_id', COMPANY_ID)
    .order('expense_date', { ascending: false })
  if (error) throw error
  return scopeExpenses(data.map(fromRow))
}

export async function createExpense(expense) {
  requireSupabase()
  const { data, error } = await supabase.from('car_expenses').insert(toRow(expense)).select().single()
  if (error) throw error
  return fromRow(data)
}

// Gerente: lança o gasto sem ler de volta (ele não tem acesso de leitura aos gastos)
export async function launchExpense(expense) {
  requireSupabase()
  const { error } = await supabase.from('car_expenses').insert(toRow(expense))
  if (error) throw error
}

export async function updateExpense(id, expense) {
  requireSupabase()
  const { data, error } = await supabase.from('car_expenses').update(toRow(expense)).eq('id', id).eq('company_id', COMPANY_ID).select().single()
  if (error) throw error
  return fromRow(data)
}

export async function deleteExpense(id) {
  requireSupabase()
  const { error } = await supabase.from('car_expenses').delete().eq('id', id).eq('company_id', COMPANY_ID)
  if (error) throw error
}

// -- Anexos (Supabase Storage, bucket PRIVADO "expense-attachments") ---------
// Diferente das fotos dos carros, os anexos de gastos (notas, recibos) não são
// públicos: guardamos só o "path" no banco e geramos um link assinado
// temporário na hora de visualizar.

export async function uploadExpenseAttachment(carId, file) {
  requireSupabase()
  const ext = file.name.split('.').pop()
  const path = `${COMPANY_ID}/${carId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('expense-attachments').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw friendlyUploadError(error, file.name, { accepted: 'PDF ou imagem (JPG, PNG)', maxSize: '20 MB' })
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
