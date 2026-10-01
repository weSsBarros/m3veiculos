import { supabase, COMPANY_ID } from './supabaseClient.js'
import { normalizePanelSettings } from '../utils/panelSettings.js'
import { normalizeTemplates } from '../utils/messageTemplates.js'
import { getViewScope } from './viewScope.js'

// Configurações da loja (aba Configurações): WhatsApp do site, rodízio,
// painel e mensagens prontas. Só o admin grava (função save_store_settings).

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
}

export async function fetchStoreSettings() {
  requireSupabase()
  const { data, error } = await supabase.from('companies').select('*').eq('id', COMPANY_ID).maybeSingle()
  if (error) throw error
  const row = data || {}
  return {
    name: row.name || '',
    whatsappMode: row.whatsapp_mode === 'rodizio' ? 'rodizio' : 'fixo',
    whatsappMain: row.whatsapp_main || '',
    whatsappStickyDays: row.whatsapp_sticky_days ?? 30,
    whatsappLastEntry: row.whatsapp_last_entry || null,
    templates: normalizeTemplates(row.whatsapp_templates),
    panel: normalizePanelSettings(row.panel_settings),
  }
}

const SETTINGS_KEYS = {
  whatsappMode: 'whatsapp_mode',
  whatsappMain: 'whatsapp_main',
  whatsappStickyDays: 'whatsapp_sticky_days',
  templates: 'whatsapp_templates',
  panel: 'panel_settings',
}

// patch: só o que mudou ({ whatsappMode, whatsappMain, whatsappStickyDays, templates, panel })
export async function saveStoreSettings(patch) {
  requireSupabase()
  const payload = {}
  for (const [key, column] of Object.entries(SETTINGS_KEYS)) {
    if (patch[key] !== undefined) payload[column] = patch[key]
  }
  const { error } = await supabase.rpc('save_store_settings', { p: payload })
  if (error) throw error
}

// Nomes da equipe (todos da loja leem; sem comissões)
export async function fetchTeamDirectory() {
  requireSupabase()
  const { data, error } = await supabase.rpc('team_directory')
  if (error) throw error
  return (data || []).map((row) => ({ id: row.id, name: row.name, role: row.role, active: row.active }))
}

// -- Rodízio do WhatsApp ----------------------------------------------------------

function rotationFromRow(row) {
  return {
    id: row.id,
    sellerId: row.seller_id || null,
    name: row.name || '',
    phone: row.phone || '',
    active: row.active,
    position: row.position ?? 0,
    createdAt: row.created_at,
  }
}

export async function fetchRotation() {
  requireSupabase()
  const { data, error } = await supabase
    .from('whatsapp_rotation')
    .select('*')
    .eq('company_id', COMPANY_ID)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return data.map(rotationFromRow)
}

export async function createRotationEntry({ sellerId = null, name = '', phone = '', position = 0 }) {
  requireSupabase()
  const { data, error } = await supabase
    .from('whatsapp_rotation')
    .insert({ company_id: COMPANY_ID, seller_id: sellerId, name, phone, position })
    .select()
    .single()
  if (error) throw error
  return rotationFromRow(data)
}

export async function updateRotationEntry(id, patch) {
  requireSupabase()
  const row = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.phone !== undefined) row.phone = patch.phone
  if (patch.active !== undefined) row.active = patch.active
  if (patch.position !== undefined) row.position = patch.position
  const { data, error } = await supabase.from('whatsapp_rotation').update(row).eq('id', id).eq('company_id', COMPANY_ID).select().single()
  if (error) throw error
  return rotationFromRow(data)
}

export async function deleteRotationEntry(id) {
  requireSupabase()
  const { error } = await supabase.from('whatsapp_rotation').delete().eq('id', id).eq('company_id', COMPANY_ID)
  if (error) throw error
}

// -- Contatos pelo WhatsApp do site (leads) ---------------------------------------

function leadFromRow(row) {
  return {
    id: row.id,
    rotationId: row.rotation_id || null,
    sellerId: row.seller_id || null,
    phone: row.phone || '',
    carId: row.car_id || null,
    page: row.page || '',
    isReturning: Boolean(row.is_returning),
    createdAt: row.created_at,
  }
}

// start/end: 'aaaa-mm-dd' (inclusive). O vendedor recebe só os dele (banco).
export async function fetchLeads({ start, end } = {}) {
  requireSupabase()
  let query = supabase.from('whatsapp_leads').select('*').eq('company_id', COMPANY_ID).order('created_at', { ascending: false })
  if (start) query = query.gte('created_at', `${start}T00:00:00`)
  if (end) query = query.lte('created_at', `${end}T23:59:59.999`)
  const { data, error } = await query.limit(5000)
  if (error) throw error
  const leads = data.map(leadFromRow)
  const scope = getViewScope()
  return scope?.role === 'seller' ? leads.filter((l) => l.sellerId && l.sellerId === scope.sellerId) : leads
}

// -- Pendências do Dashboard escondidas (cada pessoa as suas) ----------------------

async function currentUserId() {
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id || null
}

export async function fetchMyDismissals() {
  if (!supabase) return {}
  const { data, error } = await supabase.from('dashboard_dismissals').select('*').eq('company_id', COMPANY_ID)
  if (error) return {}
  const map = {}
  for (const row of data) map[row.key] = { dismissedCount: row.dismissed_count, snoozedUntil: row.snoozed_until }
  return map
}

async function upsertDismissal(key, fields) {
  requireSupabase()
  const userId = await currentUserId()
  if (!userId) throw new Error('Sua sessão expirou. Entre de novo no painel.')
  const { error } = await supabase
    .from('dashboard_dismissals')
    .upsert({ user_id: userId, company_id: COMPANY_ID, key, ...fields }, { onConflict: 'user_id,company_id,key' })
  if (error) throw error
}

// Excluir: some até a contagem passar da atual
export function dismissPendency(key, count) {
  return upsertDismissal(key, { dismissed_count: count, snoozed_until: null })
}

// Adiar por algumas horas
export function snoozePendency(key, hours) {
  const until = new Date(Date.now() + hours * 3600 * 1000).toISOString()
  return upsertDismissal(key, { dismissed_count: null, snoozed_until: until })
}

export function lowerDismissal(key, count) {
  return upsertDismissal(key, { dismissed_count: count })
}

// Mostrar de novo (keys: as pendências; sem keys, todas)
export async function restoreDismissals(keys) {
  requireSupabase()
  let query = supabase.from('dashboard_dismissals').delete().eq('company_id', COMPANY_ID)
  if (keys?.length) query = query.in('key', keys)
  const { error } = await query
  if (error) throw error
}
