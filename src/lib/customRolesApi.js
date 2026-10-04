import { supabase, COMPANY_ID } from './supabaseClient.js'

// Cargos personalizados da loja (Configurações → Painel → Cargos da loja).
// baseRole é o nível de acesso ('seller' ou 'manager'), que é o que o banco
// libera; tabs são as abas que aparecem no menu de quem tem o cargo.

export function customRoleFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    baseRole: row.base_role === 'manager' ? 'manager' : 'seller',
    tabs: Array.isArray(row.tabs) ? row.tabs : [],
  }
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
}

export async function fetchCustomRoles() {
  requireSupabase()
  const { data, error } = await supabase
    .from('custom_roles')
    .select('id, name, base_role, tabs')
    .eq('company_id', COMPANY_ID)
    .order('name', { ascending: true })
  if (error) throw error
  return data.map(customRoleFromRow)
}

// Cria (sem id) ou altera um cargo
export async function saveCustomRole(role) {
  requireSupabase()
  const row = {
    name: role.name.trim(),
    base_role: role.baseRole === 'manager' ? 'manager' : 'seller',
    tabs: role.tabs,
  }
  const query = role.id
    ? supabase.from('custom_roles').update(row).eq('id', role.id).eq('company_id', COMPANY_ID)
    : supabase.from('custom_roles').insert({ ...row, company_id: COMPANY_ID })
  const { data, error } = await query.select('id, name, base_role, tabs').single()
  if (error) {
    if (error.code === '23505') throw new Error('Já existe um cargo com esse nome.')
    throw error
  }
  return customRoleFromRow(data)
}

// Quem tinha o cargo volta ao cargo base (Vendedor ou Gerente)
export async function deleteCustomRole(id) {
  requireSupabase()
  const { error } = await supabase.from('custom_roles').delete().eq('id', id).eq('company_id', COMPANY_ID)
  if (error) throw error
}
