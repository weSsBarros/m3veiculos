import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCcw, ChevronDown, ChevronUp } from 'lucide-react'
import { fetchClients } from '../../lib/clientsApi.js'
import { fetchSupportTickets, SUPPORT_STATUS_LABELS, supportKindLabel } from '../../lib/supportApi.js'
import { SupportThread } from '../AdminSupport.jsx'
import { refreshPlatformBadges } from './platformBadges.js'
import '../admin.css'

const FILTERS = [
  { value: 'abertos', label: 'Abertos' },
  { value: 'respondidos', label: 'Respondidos' },
  { value: 'resolvidos', label: 'Resolvidos' },
  { value: 'todos', label: 'Todos' },
]

const STATUS_PILL = { aberto: 'is-warning', respondido: 'is-success', resolvido: '' }
const when = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '')

// Plataforma → Suporte: os chamados de todas as lojas (responder e resolver)
export default function PlatformSupport() {
  const [tickets, setTickets] = useState(null)
  const [clients, setClients] = useState([])
  const [filter, setFilter] = useState('abertos')
  const [store, setStore] = useState('')
  const [openId, setOpenId] = useState(null)
  const [error, setError] = useState('')

  async function load() {
    setError('')
    try {
      const [t, c] = await Promise.all([fetchSupportTickets(), fetchClients().catch(() => [])])
      setTickets(t)
      setClients(c)
    } catch (err) {
      setError(err.message || 'Não foi possível carregar os chamados.')
      setTickets([])
    }
  }

  useEffect(() => {
    load()
  }, [])

  const byId = useMemo(() => new Map(clients.map((c) => [c.companyId, c])), [clients])
  const list = (tickets || []).filter((t) => {
    if (store && t.companyId !== store) return false
    // O chamado aberto na tela fica até fechar, mesmo mudando de situação
    if (t.id === openId) return true
    if (filter === 'abertos') return t.status === 'aberto'
    if (filter === 'respondidos') return t.status === 'respondido'
    if (filter === 'resolvidos') return t.status === 'resolvido'
    return true
  })
  const counts = Object.fromEntries(
    FILTERS.map((f) => [f.value, (tickets || []).filter((t) => f.value === 'todos' || t.status === { abertos: 'aberto', respondidos: 'respondido', resolvidos: 'resolvido' }[f.value]).length])
  )
  const unread = (tickets || []).filter((t) => t.wbdevUnread).length

  function changed(id, change) {
    setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, ...(change.status ? { status: change.status } : {}), ...(change.read ? { wbdevUnread: false } : {}) } : t)))
    if (change.read) refreshPlatformBadges()
  }

  return (
    <div className="admin-page platform-page">
      <div className="admin-page-head">
        <div>
          <h1>Suporte</h1>
          <p>Chamados das lojas{unread ? ` · ${unread} com mensagem nova` : ''}. Você também recebe o aviso no WhatsApp.</p>
        </div>
        <button type="button" className="btn btn-outline" onClick={load}>
          <RefreshCcw size={15} /> Atualizar
        </button>
      </div>
      {error && <p className="admin-error">{error}</p>}

      <div className="admin-search-bar">
        <select value={store} onChange={(e) => setStore(e.target.value)} aria-label="Loja">
          <option value="">Todas as lojas</option>
          {clients.map((c) => (
            <option key={c.companyId} value={c.companyId}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className="admin-chip-row" role="radiogroup" aria-label="Situação">
        {FILTERS.map((f) => (
          <button key={f.value} type="button" role="radio" aria-checked={filter === f.value} className={`admin-chip ${filter === f.value ? 'is-active' : ''}`} onClick={() => setFilter(f.value)}>
            {f.label} ({counts[f.value]})
          </button>
        ))}
      </div>

      {tickets === null ? (
        <p className="admin-muted">Carregando…</p>
      ) : list.length === 0 ? (
        <p className="admin-muted">Nenhum chamado aqui.</p>
      ) : (
        <div className="support-tickets">
          {list.map((t) => {
            const client = byId.get(t.companyId)
            return (
              <div key={t.id} className={`support-ticket ${t.wbdevUnread ? 'is-unread' : ''}`}>
                <button type="button" className="support-ticket-head" onClick={() => setOpenId(openId === t.id ? null : t.id)} aria-expanded={openId === t.id}>
                  <span>
                    <strong>{t.subject}</strong>
                    <small>
                      {client?.name || 'Loja'} · {supportKindLabel(t.kind)} · {t.openerName || t.openerEmail || 'equipe'} · última mensagem {when(t.lastMessageAt)}
                    </small>
                  </span>
                  <span className="support-ticket-meta">
                    {t.wbdevUnread && <span className="admin-nav-badge">nova</span>}
                    <span className={`admin-pill ${STATUS_PILL[t.status] || ''}`}>{SUPPORT_STATUS_LABELS[t.status] || t.status}</span>
                    {openId === t.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </span>
                </button>
                {openId === t.id && (
                  <>
                    {client && (
                      <p className="support-ticket-client">
                        <Link to={`/wbdev/clientes/${client.slug}`}>Ficha da {client.name}</Link>
                      </p>
                    )}
                    <SupportThread ticket={t} wbdev onChanged={(change) => changed(t.id, change)} />
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
