import { supabase, COMPANY_ID } from './supabaseClient.js'
import { scopeSellers } from './viewScope.js'
import { customRoleFromRow } from './customRolesApi.js'

// A pessoa já vem com o cargo personalizado (nome e abas) para o menu e a lista
const SELLER_SELECT = '*, custom_role:custom_roles(id, name, base_role, tabs)'

function fromRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    // Nível de acesso (o que o banco libera): 'seller' ou 'manager'
    role: row.role || 'seller',
    // Cargo personalizado (null = Vendedor/Gerente) e menu próprio (null = segue o cargo)
    customRoleId: row.custom_role_id || null,
    customRole: row.custom_role ? customRoleFromRow(row.custom_role) : null,
    panelTabs: Array.isArray(row.panel_tabs) ? row.panel_tabs : null,
    name: row.name,
    email: row.email || '',
    phone: row.phone || '',
    commissionType: row.commission_type,
    commissionValue: Number(row.commission_value) || 0,
    active: row.active,
    // Gerente: 'values' (vê valores das vendas) ou 'counts' (só quantidades)
    financeAccess: row.finance_access || 'counts',
    // Comissão de financiamento externo: 'none', 'percent_financed',
    // 'percent_return' ou 'fixed'
    extCommissionType: row.ext_commission_type || 'none',
    extCommissionValue: Number(row.ext_commission_value) || 0,
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
    .select(SELLER_SELECT)
    .eq('company_id', COMPANY_ID)
    .order('name', { ascending: true })
  if (error) throw error
  return scopeSellers(data.map(fromRow))
}

export async function fetchMySeller(userId) {
  requireSupabase()
  const { data, error } = await supabase
    .from('sellers')
    .select(SELLER_SELECT)
    .eq('user_id', userId)
    .eq('company_id', COMPANY_ID)
    .maybeSingle()
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
      ...(seller.extCommissionType !== undefined
        ? { ext_commission_type: seller.extCommissionType || 'none', ext_commission_value: seller.extCommissionValue || 0 }
        : {}),
      // Cargo: com cargo personalizado, o banco põe o nível do cargo
      ...(seller.role !== undefined
        ? { role: seller.role === 'manager' ? 'manager' : 'seller', custom_role_id: seller.customRoleId || null }
        : {}),
      ...(seller.panelTabs !== undefined ? { panel_tabs: Array.isArray(seller.panelTabs) ? seller.panelTabs : null } : {}),
    })
    .eq('id', id)
    .eq('company_id', COMPANY_ID)
    .select(SELLER_SELECT)
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
  // O que o gerente vê das vendas e a comissão de financiamento externo são
  // gravados logo em seguida (a Edge Function cria com o padrão mais restrito:
  // "só quantidades" e sem comissão de financiamento externo).
  const financeAccess = created.role === 'manager' && seller.financeAccess === 'values' ? 'values' : created.financeAccess
  const hasExtCommission = seller.extCommissionType && seller.extCommissionType !== 'none'
  // Cargo personalizado e menu próprio também vão logo depois (o login já foi
  // criado com o nível do cargo)
  const hasCustomRole = Boolean(seller.customRoleId)
  const hasOwnMenu = Array.isArray(seller.panelTabs)
  if (financeAccess !== created.financeAccess || hasExtCommission || hasCustomRole || hasOwnMenu) {
    return updateSeller(created.id, {
      ...created,
      financeAccess,
      extCommissionType: seller.extCommissionType || 'none',
      extCommissionValue: seller.extCommissionValue || 0,
      customRoleId: seller.customRoleId || null,
      panelTabs: hasOwnMenu ? seller.panelTabs : null,
    })
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

// Nome do cargo: o personalizado (ex.: "Despachante") ou Vendedor/Gerente
export function roleLabel(role, customRole = null) {
  if (customRole?.name) return customRole.name
  return role === 'manager' ? 'Gerente' : 'Vendedor'
}

// Nível de acesso de um cargo personalizado (o que o banco libera)
export function accessLabel(role) {
  return role === 'manager' ? 'acesso de gerente' : 'acesso de vendedor'
}

export function financeAccessLabel(access) {
  return access === 'values' ? 'Vê valores das vendas' : 'Vê só quantidades'
}
