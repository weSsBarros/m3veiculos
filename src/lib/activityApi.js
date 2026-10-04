import { supabase, COMPANY_ID } from './supabaseClient.js'
import { scopeActivity } from './viewScope.js'

function fromRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email || '',
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    label: row.label || '',
    details: row.details || '',
    createdAt: row.created_at,
  }
}

export async function fetchActivity({ userId, start, end, limit = 300 } = {}) {
  if (!supabase) throw new Error('Supabase não configurado.')
  let query = supabase
    .from('activity_log')
    .select('*')
    .eq('company_id', COMPANY_ID)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (userId) query = query.eq('user_id', userId)
  // Datas do filtro são no fuso local (Brasil); o banco guarda em UTC.
  if (start) query = query.gte('created_at', new Date(`${start}T00:00:00`).toISOString())
  if (end) query = query.lte('created_at', new Date(`${end}T23:59:59.999`).toISOString())
  const { data, error } = await query
  if (error) throw error
  return scopeActivity(data.map(fromRow))
}

export async function logLogin() {
  if (!supabase) return
  await supabase.rpc('log_login')
}

const ENTITY_LABELS = {
  cars: 'Carro',
  car_expenses: 'Gasto',
  suppliers: 'Fornecedor',
  customers: 'Cliente',
  contracts: 'Contrato/recibo',
  contract_templates: 'Modelo de contrato',
  sellers: 'Equipe',
  sales: 'Venda',
  customer_documents: 'Documento do cliente',
  customer_financings: 'Financiamento',
  car_reservations: 'Reserva',
  external_financings: 'Financiamento externo',
  financing_installments: 'Parcela',
  auth: 'Acesso',
  customer_contacts: 'Atendimento',
  customer_interests: 'Interesse do cliente',
  customer_interest_matches: 'Aviso de carro que combina',
  whatsapp_rotation: 'Rodízio do WhatsApp',
  companies: 'Configurações',
}

const ACTION_LABELS = {
  insert: 'Cadastrou',
  update: 'Alterou',
  delete: 'Excluiu',
  login: 'Entrou',
}

export function entityLabel(entity) {
  return ENTITY_LABELS[entity] || entity
}

export function actionLabel(action) {
  return ACTION_LABELS[action] || action
}
