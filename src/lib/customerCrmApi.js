import { supabase, COMPANY_ID } from './supabaseClient.js'

// Atendimento dos clientes: interesses (carro do estoque que ele gostou ou
// carro que procura), avisos de carro que combina (criados pelo banco) e
// histórico de contatos com data de retorno. Toda a equipe da loja lê; editar
// e excluir é de quem registrou, do admin ou do gerente.

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
}

const num = (v) => (v == null || v === '' ? null : Number(v))

// -- Interesses -------------------------------------------------------------------

function interestFromRow(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    kind: row.kind,
    carId: row.car_id || null,
    brand: row.brand || '',
    model: row.model || '',
    category: row.category || '',
    yearMin: num(row.year_min),
    priceMax: num(row.price_max),
    kmMax: num(row.km_max),
    transmission: row.transmission || '',
    notes: row.notes || '',
    active: row.active,
    createdBy: row.created_by || null,
    createdAt: row.created_at,
  }
}

function interestToRow(item) {
  return {
    company_id: COMPANY_ID,
    customer_id: item.customerId,
    kind: item.kind,
    car_id: item.kind === 'estoque' ? item.carId : null,
    brand: item.kind === 'procura' ? (item.brand || '').trim() : '',
    model: item.kind === 'procura' ? (item.model || '').trim() : '',
    category: item.kind === 'procura' ? item.category || '' : '',
    year_min: item.kind === 'procura' ? num(item.yearMin) : null,
    price_max: item.kind === 'procura' ? num(item.priceMax) : null,
    km_max: item.kind === 'procura' ? num(item.kmMax) : null,
    transmission: item.kind === 'procura' ? (item.transmission || '').trim() : '',
    notes: (item.notes || '').trim(),
    active: item.active !== false,
  }
}

export async function fetchInterests({ customerId } = {}) {
  requireSupabase()
  let query = supabase.from('customer_interests').select('*').eq('company_id', COMPANY_ID).order('created_at', { ascending: false })
  if (customerId) query = query.eq('customer_id', customerId)
  const { data, error } = await query
  if (error) throw error
  return data.map(interestFromRow)
}

export async function createInterest(item) {
  requireSupabase()
  const { data, error } = await supabase.from('customer_interests').insert(interestToRow(item)).select().single()
  if (error) throw error
  return interestFromRow(data)
}

export async function updateInterest(id, item) {
  requireSupabase()
  const { data, error } = await supabase
    .from('customer_interests')
    .update(interestToRow(item))
    .eq('id', id)
    .eq('company_id', COMPANY_ID)
    .select()
    .single()
  if (error) throw error
  return interestFromRow(data)
}

export async function deleteInterest(id) {
  requireSupabase()
  const { error } = await supabase.from('customer_interests').delete().eq('id', id).eq('company_id', COMPANY_ID)
  if (error) throw error
}

// -- Avisos de carro que combina ----------------------------------------------------

function matchFromRow(row) {
  return {
    id: row.id,
    interestId: row.interest_id,
    customerId: row.customer_id,
    carId: row.car_id,
    status: row.status,
    handledBy: row.handled_by || null,
    handledAt: row.handled_at || null,
    createdAt: row.created_at,
  }
}

export const MATCH_STATUS_LABELS = { novo: 'Novo', avisado: 'Cliente avisado', descartado: 'Descartado' }

export async function fetchMatches({ customerId, status } = {}) {
  requireSupabase()
  let query = supabase.from('customer_interest_matches').select('*').eq('company_id', COMPANY_ID).order('created_at', { ascending: false })
  if (customerId) query = query.eq('customer_id', customerId)
  if (status) query = query.eq('status', status)
  const { data, error } = await query.limit(2000)
  if (error) throw error
  return data.map(matchFromRow)
}

export async function setMatchStatus(id, status) {
  requireSupabase()
  const { data, error } = await supabase
    .from('customer_interest_matches')
    .update({ status })
    .eq('id', id)
    .eq('company_id', COMPANY_ID)
    .select()
    .single()
  if (error) throw error
  return matchFromRow(data)
}

// -- Histórico de atendimento -------------------------------------------------------

export const CONTACT_CHANNELS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'ligacao', label: 'Ligação' },
  { value: 'visita', label: 'Visita na loja' },
  { value: 'outro', label: 'Outro' },
]

export function contactChannelLabel(value) {
  return CONTACT_CHANNELS.find((c) => c.value === value)?.label || value
}

function contactFromRow(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    channel: row.channel,
    notes: row.notes || '',
    carId: row.car_id || null,
    followUpOn: row.follow_up_on || null,
    followUpDone: Boolean(row.follow_up_done),
    createdBy: row.created_by || null,
    authorName: row.author_name || '',
    createdAt: row.created_at,
  }
}

export async function fetchContacts({ customerId, openFollowUps = false } = {}) {
  requireSupabase()
  let query = supabase.from('customer_contacts').select('*').eq('company_id', COMPANY_ID).order('created_at', { ascending: false })
  if (customerId) query = query.eq('customer_id', customerId)
  if (openFollowUps) query = query.not('follow_up_on', 'is', null).eq('follow_up_done', false)
  const { data, error } = await query.limit(2000)
  if (error) throw error
  return data.map(contactFromRow)
}

export async function createContact({ customerId, channel = 'whatsapp', notes = '', carId = null, followUpOn = null }) {
  requireSupabase()
  const { data, error } = await supabase
    .from('customer_contacts')
    .insert({
      company_id: COMPANY_ID,
      customer_id: customerId,
      channel,
      notes: notes.trim(),
      car_id: carId || null,
      follow_up_on: followUpOn || null,
    })
    .select()
    .single()
  if (error) throw error
  return contactFromRow(data)
}

export async function updateContact(id, patch) {
  requireSupabase()
  const row = {}
  if (patch.notes !== undefined) row.notes = patch.notes.trim()
  if (patch.channel !== undefined) row.channel = patch.channel
  if (patch.followUpOn !== undefined) row.follow_up_on = patch.followUpOn || null
  if (patch.followUpDone !== undefined) row.follow_up_done = patch.followUpDone
  const { data, error } = await supabase.from('customer_contacts').update(row).eq('id', id).eq('company_id', COMPANY_ID).select().single()
  if (error) throw error
  return contactFromRow(data)
}

export async function deleteContact(id) {
  requireSupabase()
  const { error } = await supabase.from('customer_contacts').delete().eq('id', id).eq('company_id', COMPANY_ID)
  if (error) throw error
}
