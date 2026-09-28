import { supabase, COMPANY_ID } from './supabaseClient.js'

function fromRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    role: row.role || 'seller',
    name: row.name,
    email: row.email || '',
    phone: row.phone || '',
    commissionType: row.commission_type,
    commissionValue: Number(row.commission_value) || 0,
    active: row.active,
    // Gerente: 'values' (vê valores das vendas) ou 'counts' (só quantidades)
    financeAccess: row.finance_access || 'counts',
    // Excluído da equipe: some da lista, mas o cadastro fica para as vendas
    // antigas e o registro de atividades (formerUserId = login que ele usava)
    deletedAt: row.deleted_at || null,
    formerUserId: row.former_user_id || null,
    createdAt: row.created_at,
  }
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
}

export async function fetchSellers() {
  requireSupabase()
  const { data, error } = await supabase
    .from('sellers')
    .select('*')
    .eq('company_id', COMPANY_ID)
    .order('name', { ascending: true })
  if (error) throw error
  return data.map(fromRow)
}

export async function fetchMySeller(userId) {
  requireSupabase()
  const { data, error } = await supabase.from('sellers').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data ? fromRow(data) : null
}

export async function updateSeller(id, seller) {
  requireSupabase()
  const { data, error } = await supabase
    .from('sellers')
    .update({
      name: seller.name,
      phone: seller.phone || '',
      commission_type: seller.commissionType,
      commission_value: seller.commissionValue,
      active: seller.active,
      finance_access: seller.financeAccess === 'values' ? 'values' : 'counts',
    })
    .eq('id', id)
    .eq('company_id', COMPANY_ID)
    .select()
    .single()
  if (error) throw error
  return fromRow(data)
}

// Criar login, redefinir senha e excluir passam pela Edge Function (precisa da
// service role, que só existe no servidor).
async function invokeManageSellers(body) {
  const { data, error } = await supabase.functions.invoke('manage-sellers', { body })
  if (error) {
    let message = error.message
    try {
      const payload = await error.context?.json()
      if (payload?.error) message = payload.error
    } catch {
      // resposta sem corpo JSON
    }
    throw new Error(message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export async function createSeller(seller) {
  requireSupabase()
  const data = await invokeManageSellers({
    action: 'create',
    role: seller.role,
    name: seller.name,
    email: seller.email,
    phone: seller.phone,
    password: seller.password,
    commissionType: seller.commissionType,
    commissionValue: seller.commissionValue,
  })
  const created = fromRow(data.seller)
  // O que o gerente vê das vendas é gravado logo em seguida (a Edge Function
  // cria com o padrão mais restrito, "só quantidades").
  if (created.role === 'manager' && seller.financeAccess === 'values') {
    return updateSeller(created.id, { ...created, financeAccess: 'values' })
  }
  return created
}

export async function resetSellerPassword(sellerId, password) {
  requireSupabase()
  await invokeManageSellers({ action: 'reset_password', sellerId, password })
}

// Apaga o login e tira da equipe; devolve o cadastro já marcado como excluído
export async function deleteSeller(sellerId) {
  requireSupabase()
  const data = await invokeManageSellers({ action: 'delete', sellerId })
  return fromRow(data.seller)
}

export function describeCommission(seller) {
  if (!seller) return '—'
  if (seller.commissionType === 'none') return 'Sem comissão'
  if (seller.commissionType === 'fixed') {
    return `${seller.commissionValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} por carro`
  }
  return `${seller.commissionValue.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% da venda`
}

export function roleLabel(role) {
  return role === 'manager' ? 'Gerente' : 'Vendedor'
}

export function financeAccessLabel(access) {
  return access === 'values' ? 'Vê valores das vendas' : 'Vê só quantidades'
}
