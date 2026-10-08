import { useEffect, useState } from 'react'
import { MessageCircle, Mail, Clock, PlusCircle, Paperclip, Send, CheckCircle2, ChevronDown, ChevronUp, RefreshCcw } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { fetchCompanySettings } from '../lib/companyApi.js'
import { COMPANY_ID } from '../lib/supabaseClient.js'
import {
  SUPPORT_KINDS,
  SUPPORT_STATUS_LABELS,
  supportKindLabel,
  fetchSupportTickets,
  fetchSupportMessages,
  openSupportTicket,
  postSupportMessage,
  setSupportTicketStatus,
  markSupportTicketRead,
  uploadSupportFile,
  supportFileUrl,
} from '../lib/supportApi.js'
import { supportLink } from '../utils/support.js'
import './admin.css'

const STATUS_PILL = { aberto: 'is-warning', respondido: 'is-success', resolvido: '' }

const when = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '')

// Anexos vão para a pasta da loja do chamado (a resposta da WB.Dev também)
async function uploadAll(files, companyId) {
  const out = []
  for (const file of files) out.push(await uploadSupportFile(file, companyId))
  return out
}

function Attachments({ items }) {
  if (!items?.length) return null
  async function open(path) {
    try {
      window.open(await supportFileUrl(path), '_blank', 'noreferrer')
    } catch (err) {
      alert('Não foi possível abrir o arquivo: ' + err.message)
    }
  }
  return (
    <div className="expense-attachments-list">
      {items.map((a) => (
        <button key={a.path} type="button" className="expense-attachment-link" onClick={() => open(a.path)}>
          <Paperclip size={12} /> {a.name}
        </button>
      ))}
    </div>
  )
}

// Conversa de um chamado (loja ou plataforma). wbdev: quem vê é a WB.Dev
export function SupportThread({ ticket, wbdev = false, onChanged }) {
  const [messages, setMessages] = useState(null)
  const [reply, setReply] = useState('')
  const [files, setFiles] = useState([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchSupportMessages(ticket.id)
      .then((list) => !cancelled && setMessages(list))
      .catch((err) => !cancelled && setError(err.message))
    const unread = wbdev ? ticket.wbdevUnread : ticket.storeUnread
    if (unread) markSupportTicketRead(ticket.id).then(() => onChanged?.({ read: true })).catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id])

  async function send(e) {
    e.preventDefault()
    if (!reply.trim()) return
    setSending(true)
    setError('')
    try {
      const attachments = await uploadAll(files, ticket.companyId)
      const message = await postSupportMessage(ticket.id, reply.trim(), attachments)
      setMessages((prev) => [...(prev || []), message])
      setReply('')
      setFiles([])
      onChanged?.({ status: wbdev ? 'respondido' : 'aberto' })
    } catch (err) {
      setError('Não foi possível enviar: ' + err.message)
    } finally {
      setSending(false)
    }
  }

  async function changeStatus(status) {
    try {
      await setSupportTicketStatus(ticket.id, status)
      onChanged?.({ status })
    } catch (err) {
      alert('Não foi possível mudar a situação: ' + err.message)
    }
  }

  return (
    <div className="support-thread">
      {error && <p className="admin-error">{error}</p>}
      {!messages ? (
        <p className="admin-muted">Carregando a conversa…</p>
      ) : (
        <div className="support-messages">
          {messages.map((m) => (
            <div key={m.id} className={`support-message ${m.authorKind === 'wbdev' ? 'is-wbdev' : 'is-store'}`}>
              <span className="support-message-head">
                {m.authorKind === 'wbdev' ? 'WB.Dev' : m.authorName || 'Loja'} · {when(m.createdAt)}
              </span>
              <p>{m.body}</p>
              <Attachments items={m.attachments} />
            </div>
          ))}
        </div>
      )}
      <form className="support-reply admin-form" onSubmit={send}>
        <textarea
          rows={3}
          value={reply}
          maxLength={5000}
          onChange={(e) => setReply(e.target.value)}
          placeholder={wbdev ? 'Responder para a loja…' : ticket.status === 'resolvido' ? 'Escreva para reabrir o chamado…' : 'Escrever uma mensagem…'}
        />
        <div className="support-reply-actions">
          <label className="btn btn-outline support-attach">
            <Paperclip size={15} /> {files.length ? `${files.length} ${files.length === 1 ? 'arquivo' : 'arquivos'}` : 'Anexar print'}
            <input type="file" accept="image/*,application/pdf" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} />
          </label>
          {wbdev ? (
            ticket.status !== 'resolvido' && (
              <button type="button" className="btn btn-outline" onClick={() => changeStatus('resolvido')}>
                <CheckCircle2 size={15} /> Marcar resolvido
              </button>
            )
          ) : (
            ticket.status !== 'resolvido' && (
              <button type="button" className="btn btn-outline" onClick={() => changeStatus('resolvido')}>
                <CheckCircle2 size={15} /> Resolvido
              </button>
            )
          )}
          <button type="submit" className="btn btn-primary" disabled={sending || !reply.trim()}>
            <Send size={15} /> {sending ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </form>
    </div>
  )
}

// Suporte (todos da equipe): falar com a WB.Dev e acompanhar os chamados
export default function AdminSupport() {
  const { account, isAdmin, refreshAccount } = useAuth()
  const [storeName, setStoreName] = useState('a loja')
  const [tickets, setTickets] = useState(null)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ subject: '', kind: 'duvida', body: '' })
  const [files, setFiles] = useState([])
  const [saving, setSaving] = useState(false)
  const [openId, setOpenId] = useState(null)

  async function load() {
    setError('')
    try {
      setTickets(await fetchSupportTickets({ companyId: COMPANY_ID }))
    } catch (err) {
      setError(err.message || 'Não foi possível carregar os chamados.')
      setTickets([])
    }
  }

  useEffect(() => {
    load()
    fetchCompanySettings().then((s) => s?.name && setStoreName(s.name)).catch(() => {})
  }, [])

  async function submit(e) {
    e.preventDefault()
    if (!form.subject.trim() || !form.body.trim()) return setError('Escreva o assunto e a mensagem.')
    setSaving(true)
    setError('')
    try {
      const attachments = await uploadAll(files, undefined)
      const ticket = await openSupportTicket({ subject: form.subject.trim(), kind: form.kind, body: form.body.trim(), attachments })
      setForm({ subject: '', kind: 'duvida', body: '' })
      setFiles([])
      setCreating(false)
      await load()
      setOpenId(ticket.id)
    } catch (err) {
      setError('Não foi possível abrir o chamado: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  function changed(ticketId, change) {
    setTickets((prev) =>
      prev.map((t) =>
        t.id === ticketId ? { ...t, ...(change.status ? { status: change.status } : {}), ...(change.read ? { storeUnread: false } : {}) } : t
      )
    )
    if (change.read) refreshAccount()
  }

  const support = account?.support || {}

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1>Suporte</h1>
          <p>Fale com a WB.Dev: dúvidas, problemas e pedidos de melhoria do sistema</p>
        </div>
        <div className="admin-row-actions">
          <button type="button" className="btn btn-primary" onClick={() => setCreating((v) => !v)}>
            <PlusCircle size={15} /> Abrir chamado
          </button>
          <button type="button" className="btn btn-outline" onClick={load}>
            <RefreshCcw size={15} /> Atualizar
          </button>
        </div>
      </div>

      <div className="support-contacts">
        <a href={supportLink(storeName)} target="_blank" rel="noreferrer" className="support-contact">
          <MessageCircle size={20} />
          <span>
            <strong>WhatsApp</strong>
            <small>(98) 98129-5577 · o jeito mais rápido</small>
          </span>
        </a>
        {support.email && (
          <a href={`mailto:${support.email}`} className="support-contact">
            <Mail size={20} />
            <span>
              <strong>E-mail</strong>
              <small>{support.email}</small>
            </span>
          </a>
        )}
        {support.hours && (
          <div className="support-contact">
            <Clock size={20} />
            <span>
              <strong>Horário de atendimento</strong>
              <small>{support.hours}</small>
            </span>
          </div>
        )}
      </div>

      {creating && (
        <form className="admin-form admin-form-section" onSubmit={submit}>
          <h2>Novo chamado</h2>
          <div className="admin-form-grid">
            <label>
              Assunto
              <input value={form.subject} maxLength={120} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Ex: Não consigo enviar a foto de um carro" />
            </label>
            <label>
              Tipo
              <select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
                {SUPPORT_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Mensagem
            <textarea rows={5} maxLength={5000} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} placeholder="Conte o que aconteceu, em qual tela, e o que esperava que acontecesse." />
          </label>
          <label className="btn btn-outline support-attach">
            <Paperclip size={15} /> {files.length ? `${files.length} ${files.length === 1 ? 'arquivo anexado' : 'arquivos anexados'}` : 'Anexar print (opcional)'}
            <input type="file" accept="image/*,application/pdf" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} />
          </label>
          <div className="admin-form-actions">
            <button type="button" className="btn btn-outline" onClick={() => setCreating(false)} disabled={saving}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enviando…' : 'Enviar chamado'}</button>
          </div>
        </form>
      )}

      {error && <p className="admin-error">{error}</p>}

      <h2 className="admin-section-title">{isAdmin ? 'Chamados da loja' : 'Meus chamados'}</h2>
      {tickets === null ? (
        <p className="admin-muted">Carregando…</p>
      ) : tickets.length === 0 ? (
        <p className="admin-muted">Nenhum chamado ainda. Para falar com a WB.Dev, use o WhatsApp ou abra um chamado.</p>
      ) : (
        <div className="support-tickets">
          {tickets.map((t) => (
            <div key={t.id} className={`support-ticket ${t.storeUnread ? 'is-unread' : ''}`}>
              <button type="button" className="support-ticket-head" onClick={() => setOpenId(openId === t.id ? null : t.id)} aria-expanded={openId === t.id}>
                <span>
                  <strong>{t.subject}</strong>
                  <small>
                    {supportKindLabel(t.kind)}
                    {isAdmin && t.openerName ? ` · ${t.openerName}` : ''} · última mensagem {when(t.lastMessageAt)}
                  </small>
                </span>
                <span className="support-ticket-meta">
                  {t.storeUnread && <span className="admin-nav-badge">nova</span>}
                  <span className={`admin-pill ${STATUS_PILL[t.status] || ''}`}>{SUPPORT_STATUS_LABELS[t.status] || t.status}</span>
                  {openId === t.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </span>
              </button>
              {openId === t.id && <SupportThread ticket={t} onChanged={(change) => changed(t.id, change)} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
