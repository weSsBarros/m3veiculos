import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCcw, MessageCircle, Mail, Globe, Trash2, PlusCircle, Search } from 'lucide-react'
import { fetchClients, fetchContactNotes, addContactNote, deleteContactNote } from '../../lib/clientsApi.js'
import { whatsappLink, dateBR } from '../../utils/billing.js'
import { todayISO } from '../../utils/carFormat.js'
import DateInputBR from '../../components/DateInputBR.jsx'
import useConfirm from '../../components/useConfirm.jsx'
import { BillingPill } from './ClientParts.jsx'
import '../admin.css'

const CONTACT_CHANNELS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telefone', label: 'Telefone' },
  { value: 'email', label: 'E-mail' },
  { value: 'visita', label: 'Visita' },
  { value: 'outro', label: 'Outro' },
]

const channelLabel = (value) => CONTACT_CHANNELS.find((c) => c.value === value)?.label || value

// Anotações de atendimento de um cliente (aba Contatos e ficha do cliente)
export function ContactNotes({ companyId, notes, onAdded, onDeleted, limit = 0 }) {
  const { confirm, confirmDialog } = useConfirm()
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [all, setAll] = useState(false)
  const shown = limit && !all ? notes.slice(0, limit) : notes

  async function save(e) {
    e.preventDefault()
    if (!form.note.trim()) return
    setSaving(true)
    setError('')
    try {
      onAdded(await addContactNote({ companyId, channel: form.channel, note: form.note, contactedOn: form.contactedOn || todayISO() }))
      setForm(null)
    } catch (err) {
      setError('Não foi possível salvar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function remove(note) {
    if (!(await confirm('Excluir esta anotação?'))) return
    try {
      await deleteContactNote(note.id)
      onDeleted(note.id)
    } catch (err) {
      alert('Não foi possível excluir: ' + err.message)
    }
  }

  return (
    <div className="contact-notes">
      {shown.length === 0 && !form && <p className="admin-muted">Nenhuma anotação ainda.</p>}
      {shown.map((n) => (
        <div className="contact-note" key={n.id}>
          <span className="contact-note-head">
            {dateBR(n.contactedOn)} · {channelLabel(n.channel)}
            <button type="button" className="contact-note-delete" onClick={() => remove(n)} aria-label="Excluir anotação">
              <Trash2 size={13} />
            </button>
          </span>
          <p>{n.note}</p>
        </div>
      ))}
      {limit > 0 && notes.length > limit && (
        <button type="button" className="admin-link-btn" onClick={() => setAll((v) => !v)}>
          {all ? 'Ver menos' : `Ver todas (${notes.length})`}
        </button>
      )}
      {form ? (
        <form className="contact-note-form admin-form" onSubmit={save}>
          <div className="admin-form-grid">
            <label>
              Canal
              <select value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}>
                {CONTACT_CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </label>
            <label>
              Data
              <DateInputBR value={form.contactedOn} onChange={(v) => setForm((f) => ({ ...f, contactedOn: v }))} />
            </label>
          </div>
          <label>
            O que foi conversado
            <textarea rows={3} maxLength={2000} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          </label>
          {error && <p className="admin-error">{error}</p>}
          <div className="admin-form-actions">
            <button type="button" className="btn btn-outline" onClick={() => setForm(null)} disabled={saving}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !form.note.trim()}>{saving ? 'Salvando…' : 'Salvar anotação'}</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-outline" onClick={() => setForm({ channel: 'whatsapp', contactedOn: todayISO(), note: '' })}>
          <PlusCircle size={15} /> Anotar atendimento
        </button>
      )}
      {confirmDialog}
    </div>
  )
}

// Plataforma → Contatos: o responsável e os contatos de cada cliente, com as
// anotações de cada atendimento
export default function PlatformContacts() {
  const [clients, setClients] = useState([])
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [c, n] = await Promise.all([fetchClients(), fetchContactNotes()])
      setClients(c)
      setNotes(n)
    } catch (err) {
      setError(err.message || 'Não foi possível carregar os contatos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const notesByCompany = useMemo(() => {
    const map = new Map()
    for (const n of notes) map.set(n.companyId, [...(map.get(n.companyId) || []), n])
    return map
  }, [notes])

  const q = search.trim().toLowerCase()
  const list = clients.filter((c) => !q || `${c.name} ${c.account.responsibleName} ${c.account.responsibleEmail}`.toLowerCase().includes(q))

  return (
    <div className="admin-page platform-page">
      <div className="admin-page-head">
        <div>
          <h1>Contatos</h1>
          <p>Contatos dos clientes e as anotações de cada atendimento.</p>
        </div>
        <button type="button" className="btn btn-outline" onClick={load}>
          <RefreshCcw size={15} /> Atualizar
        </button>
      </div>
      {error && <p className="admin-error">{error}</p>}

      <div className="admin-search-bar">
        <label className="admin-search-input">
          <Search size={15} />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente ou responsável…" />
        </label>
      </div>

      {loading && clients.length === 0 ? (
        <p className="admin-muted">Carregando…</p>
      ) : (
        <div className="contact-cards">
          {list.map((c) => {
            const a = c.account
            const first = (a.responsibleName || '').split(' ')[0]
            const hello = `Olá${first ? `, ${first}` : ''}! Aqui é da WB.Dev, sobre o sistema da ${c.name}.`
            return (
              <section className="contact-card" key={c.companyId}>
                <div className="contact-card-head">
                  <div>
                    <Link to={`/wbdev/clientes/${c.slug}`}><strong>{c.name}</strong></Link>
                    <span className="admin-table-sub">{a.responsibleName || 'Responsável não cadastrado'}</span>
                  </div>
                  <BillingPill billing={c.billing} />
                </div>
                <div className="contact-card-links">
                  {a.responsiblePhone && (
                    <a className="btn btn-outline" href={whatsappLink(a.responsiblePhone, hello)} target="_blank" rel="noreferrer">
                      <MessageCircle size={15} /> {a.responsiblePhone}
                    </a>
                  )}
                  {a.responsibleEmail && (
                    <a className="btn btn-outline" href={`mailto:${a.responsibleEmail}`}>
                      <Mail size={15} /> {a.responsibleEmail}
                    </a>
                  )}
                  {c.whatsapp && (
                    <a className="btn btn-outline" href={whatsappLink(c.whatsapp, hello)} target="_blank" rel="noreferrer" title="WhatsApp do site da loja">
                      <MessageCircle size={15} /> Loja
                    </a>
                  )}
                  {c.siteUrl && (
                    <a className="btn btn-outline" href={c.siteUrl} target="_blank" rel="noreferrer">
                      <Globe size={15} /> Site
                    </a>
                  )}
                  {!a.responsiblePhone && !a.responsibleEmail && (
                    <span className="admin-muted">Sem telefone e e-mail do responsável (preencha na ficha).</span>
                  )}
                </div>
                <ContactNotes
                  companyId={c.companyId}
                  notes={notesByCompany.get(c.companyId) || []}
                  limit={3}
                  onAdded={(n) => setNotes((prev) => [n, ...prev])}
                  onDeleted={(id) => setNotes((prev) => prev.filter((x) => x.id !== id))}
                />
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
