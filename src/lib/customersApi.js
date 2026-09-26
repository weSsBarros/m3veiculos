import { supabase, COMPANY_ID } from './supabaseClient.js'

function fromRow(row) {
  return {
    id: row.id,
    name: row.name,
    document: row.document || '',
    rg: row.rg || '',
    phone: row.phone || '',
    email: row.email || '',
    address: row.address || '',
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toRow(customer) {
  return {
    company_id: COMPANY_ID,
    name: customer.name,
    document: customer.document || '',
    rg: customer.rg || '',
    phone: customer.phone || '',
    email: customer.email || '',
    address: customer.address || '',
    notes: customer.notes || '',
  }
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase não configurado. Preencha o arquivo .env com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  }
}

export async function fetchAllCustomers() {
  requireSupabase()
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('company_id', COMPANY_ID)
    .order('name', { ascending: true })
  if (error) throw error
  return data.map(fromRow)
}

export async function createCustomer(customer) {
  requireSupabase()
  const { data, error } = await supabase.from('customers').insert(toRow(customer)).select().single()
  if (error) throw error
  return fromRow(data)
}

export async function updateCustomer(id, customer) {
  requireSupabase()
  const { data, error } = await supabase.from('customers').update(toRow(customer)).eq('id', id).eq('company_id', COMPANY_ID).select().single()
  if (error) throw error
  return fromRow(data)
}

export async function deleteCustomer(id) {
  requireSupabase()
  const { error } = await supabase.from('customers').delete().eq('id', id).eq('company_id', COMPANY_ID)
  if (error) throw error
}
