import { useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { fetchClients, fetchNotices, saveNotice, deleteNotice } from '../../lib/clientsApi.js'
import { dateBR } from '../../utils/billing.js'
import { todayISO } from '../../utils/carFormat.js'
import useConfirm from '../../components/useConfirm.jsx'
import PlatformTabs from './PlatformTabs.jsx'
import DateInputBR from '../../components/DateInputBR.jsx'
import '../admin.css'

const LEVELS = { info: 'Informação', aviso: 'Aviso', urgente: 'Urgente' }
const LEVEL_PILL = { info: 'gray', aviso: 'yellow', urgente: 'red' }
const EMPTY = { id: null, companyId: '', title: '', message: '', level: 'info', audience: 'equipe', startsOn: '', endsOn: '' }

// Painel WB.Dev → Avisos: faixa no topo do painel das lojas (uma ou todas)
export default function PlatformNotices() {
  const { confirm, confirmDialog } = useConfirm()
  const [notices, setNotices] = useState([])
  const [clients, setClients] = useState([])
  const [form, setForm] = useState({ ...EMPTY, startsOn: todayISO() })
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      const [n, c] = await Promise.all([fetchNotices(), fetchClients()])
      setNotices(n)
      setClients(c)
    } catch (err) {
      setError(err.message || 'Não foi possível carregar os avisos.')
    }
  }

  useEffect(() => {
    load()
  }, [])

  const nameOf = (companyId) => (companyId ? clients.find((c) => c.companyId === companyId)?.name || 'Loja' : 'Todas as lojas')
  const today = todayISO()
  const active = notices.filter((n) => n.startsOn <= today && (!n.endsOn || n.endsOn >= today))
  const other = notices.filter((n) => !active.includes(n))

  async function submit(e) {
    e.preventDefault()
    if (!form.title.trim()) {
      setError('Dê um título ao aviso.')
      return
    }
    if (form.endsOn && form.endsOn < form.startsOn) {
      setError('O fim não pode ser antes do início.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await saveNotice(form)
      setMsg(form.id ? 'Aviso atualizado.' : 'Aviso publicado. Aparece no painel das lojas ao recarregar.')
      setForm({ ...EMPTY, startsOn: todayISO() })
      await load()
    } catch (err) {
      setError(err.message || 'Não foi possível salvar o aviso.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(n) {
    if (!(await confirm(`Excluir o aviso "${n.title}"? Ele some do painel das lojas.`, { title: 'Excluir aviso', confirmLabel: 'Excluir' }))) return
    try {
      await deleteNotice(n.id)
      await load()
    } catch (err) {
      setError(err.message || 'Não foi possível excluir.')
    }
  }

  function edit(n) {
    setForm({ ...n, companyId: n.companyId || '', endsOn: n.endsOn || '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const row = (n) => (
    <li key={n.id}>
      <div>
        <strong>{n.title}</strong>
        <span className="admin-table-sub">
          {nameOf(n.companyId)} · {n.audience === 'admin' ? 'só o admin' : 'toda a equipe'} · {dateBR(n.startsOn)}
          {n.endsOn ? ` até ${dateBR(n.endsOn)}` : ' sem fim'}
        </span>
        {n.message && <p>{n.message}</p>}
      </div>
      <div className="admin-row-actions">
        <span className={`platform-health is-${LEVEL_PILL[n.level]}`}>{LEVELS[n.level]}</span>
        <button type="button" className="admin-action-btn" onClick={() => edit(n)}>
          <Pencil size={14} /> Editar
        </button>
        <button type="button" className="admin-action-btn admin-action-danger" onClick={() => remove(n)}>
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  )

  return (
    <div className="admin-page platform-page">
      <div className="admin-page-head">
        <div>
          <h1>Plataforma</h1>
          <p>Avisos que aparecem no topo do painel das lojas.</p>
        </div>
      </div>
      <PlatformTabs />

      <form className="admin-form admin-form-section" onSubmit={submit}>
        <h2>{form.id ? 'Editar aviso' : 'Novo aviso'}</h2>
        <div className="admin-form-grid admin-form-grid-3">
          <label>
            Para
            <select value={form.companyId} onChange={(e) => setForm((f) => ({ ...f, companyId: e.target.value }))}>
              <option value="">Todas as lojas</option>
              {clients.map((c) => (
                <option key={c.companyId} value={c.companyId}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nível
            <select value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}>
              {Object.entries(LEVELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quem vê
            <select value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}>
              <option value="equipe">Toda a equipe</option>
              <option value="admin">Só o admin da loja</option>
            </select>
          </label>
          <label>
            Título
            <input value={form.title} maxLength={80} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ex.: Manutenção no domingo às 22h" />
          </label>
          <label>
            Começa em
            <DateInputBR value={form.startsOn} onChange={(v) => setForm((f) => ({ ...f, startsOn: v }))} />
          </label>
          <label>
            Termina em (opcional)
            <DateInputBR value={form.endsOn} onChange={(v) => setForm((f) => ({ ...f, endsOn: v }))} />
          </label>
        </div>
        <label>
          Mensagem (opcional)
          <textarea rows={2} value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} />
        </label>
        {error && <p className="admin-error">{error}</p>}
        {msg && <p className="admin-success">{msg}</p>}
        <div className="admin-form-actions">
          {form.id && (
            <button type="button" className="btn btn-outline" onClick={() => setForm({ ...EMPTY, startsOn: todayISO() })}>
              Cancelar edição
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Salvando…' : form.id ? 'Salvar aviso' : 'Publicar aviso'}
          </button>
        </div>
      </form>

      <h2 className="admin-section-title">No ar</h2>
      {active.length === 0 ? <p className="admin-muted">Nenhum aviso no ar.</p> : <ul className="client-notices">{active.map(row)}</ul>}
      {other.length > 0 && (
        <>
          <h2 className="admin-section-title">Agendados e encerrados</h2>
          <ul className="client-notices">{other.map(row)}</ul>
        </>
      )}
      {confirmDialog}
    </div>
  )
}
