import { supabase, COMPANY_ID } from './supabaseClient.js'
import { notifyWbdev } from './clientsApi.js'

// Suporte (seção 65): chamados da loja para a WB.Dev. A loja vê os seus (o admin,
// os da loja toda); a plataforma vê todos. Quem grava são as funções do banco.

async function run(query) {
  const { data, error } = await query
  if (error) throw error
  return data
}

export const SUPPORT_KINDS = [
  { value: 'duvida', label: 'Dúvida' },
  { value: 'problema', label: 'Problema' },
  { value: 'melhoria', label: 'Pedido de melhoria' },
  { value: 'financeiro', label: 'Financeiro' },
]

export const SUPPORT_STATUS_LABELS = { aberto: 'Aberto', respondido: 'Respondido', resolvido: 'Resolvido' }

export function supportKindLabel(value) {
  return SUPPORT_KINDS.find((k) => k.value === value)?.label || value
}

function ticketFromRow(t) {
  return {
    id: t.id,
    companyId: t.company_id,
    openedBy: t.opened_by,
    openerName: t.opener_name || '',
    openerEmail: t.opener_email || '',
    subject: t.subject,
    kind: t.kind,
    status: t.status,
    storeUnread: Boolean(t.store_unread),
    wbdevUnread: Boolean(t.wbdev_unread),
    lastMessageAt: t.last_message_at,
    createdAt: t.created_at,
  }
}

function messageFromRow(m) {
  return {
    id: m.id,
    ticketId: m.ticket_id,
    authorKind: m.author_kind,
    authorName: m.author_name || '',
    body: m.body,
    attachments: Array.isArray(m.attachments) ? m.attachments : [],
    createdAt: m.created_at,
  }
}

// companyId: só os chamados desta loja (a página Suporte da loja; o dono da
// plataforma enxerga os de todas as lojas pela regra do banco)
export async function fetchSupportTickets({ companyId = null } = {}) {
  let query = supabase.from('support_tickets').select('*')
  if (companyId) query = query.eq('company_id', companyId)
  const data = await run(query.order('last_message_at', { ascending: false }).limit(300))
  return (data || []).map(ticketFromRow)
}

// Chamados com mensagem nova da loja (número na aba Suporte da Plataforma)
export async function countWbdevUnread() {
  const { count, error } = await supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('wbdev_unread', true)
  if (error) throw error
  return count || 0
}

export async function fetchSupportMessages(ticketId) {
  const data = await run(supabase.from('support_messages').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true }))
  return (data || []).map(messageFromRow)
}

// Abre o chamado (com a primeira mensagem) e avisa a WB.Dev no WhatsApp
export async function openSupportTicket({ subject, kind, body, attachments = [] }) {
  const ticket = ticketFromRow(await run(supabase.rpc('open_support_ticket', { p_subject: subject, p_kind: kind, p_body: body, p_attachments: attachments })))
  const [first] = await fetchSupportMessages(ticket.id).catch(() => [])
  if (first) notifyWbdev('chamado', first.id)
  return ticket
}

// Nova mensagem. notify: avisa a WB.Dev (mensagem da loja)
export async function postSupportMessage(ticketId, body, attachments = [], { notify = true } = {}) {
  const message = messageFromRow(await run(supabase.rpc('post_support_message', { p_ticket: ticketId, p_body: body, p_attachments: attachments })))
  if (notify && message.authorKind === 'loja') notifyWbdev('chamado', message.id)
  return message
}

export async function setSupportTicketStatus(ticketId, status) {
  await run(supabase.rpc('set_support_ticket_status', { p_ticket: ticketId, p_status: status }))
}

export async function markSupportTicketRead(ticketId) {
  await run(supabase.rpc('mark_support_ticket_read', { p_ticket: ticketId }))
}

// Anexos (prints): bucket privado support-files, pasta da loja
export async function uploadSupportFile(file, companyId = COMPANY_ID) {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
  const path = `${companyId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('support-files').upload(path, file, { cacheControl: '3600', upsert: false })
  if (error) throw error
  return { path, name: file.name, type: file.type }
}

export async function supportFileUrl(path) {
  const { data, error } = await supabase.storage.from('support-files').createSignedUrl(path, 120)
  if (error) throw error
  return data.signedUrl
}
