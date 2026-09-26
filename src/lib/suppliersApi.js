import { supabase, COMPANY_ID } from './supabaseClient.js'

function fromRow(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    contact: row.contact || '',
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toRow(supplier) {
  return {
    company_id: COMPANY_ID,
    name: supplier.name,
    category: supplier.category,
    contact: supplier.contact || '',
    notes: supplier.notes || '',
  }
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase não configurado. Preencha o arquivo .env com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  }
}

export async function fetchAllSuppliers() {
  requireSupabase()
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('company_id', COMPANY_ID)
    .order('name', { ascending: true })
  if (error) throw error
  return data.map(fromRow)
}

export async function createSupplier(supplier) {
  requireSupabase()
  const { data, error } = await supabase.from('suppliers').insert(toRow(supplier)).select().single()
  if (error) throw error
  return fromRow(data)
}

export async function updateSupplier(id, supplier) {
  requireSupabase()
  const { data, error } = await supabase.from('suppliers').update(toRow(supplier)).eq('id', id).eq('company_id', COMPANY_ID).select().single()
  if (error) throw error
  return fromRow(data)
}

export async function deleteSupplier(id) {
  requireSupabase()
  const { error } = await supabase.from('suppliers').delete().eq('id', id).eq('company_id', COMPANY_ID)
  if (error) throw error
}
