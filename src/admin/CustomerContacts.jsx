import { useEffect, useMemo, useState } from 'react'
import { MessageCircle, NotebookPen, Check, Trash2, CalendarClock } from 'lucide-react'
import { fetchContacts, createContact, updateContact, deleteContact, setMatchStatus, CONTACT_CHANNELS, contactChannelLabel } from '../lib/customerCrmApi.js'
import { fetchStoreSettings } from '../lib/storeSettingsApi.js'
import { whatsappLinkToPhone, carPageUrl } from '../utils/whatsapp.js'
import { fillTemplate, firstName, carLabelForMessage, DEFAULT_TEMPLATES } from '../utils/messageTemplates.js'
import { formatDateBR, todayISO } from '../utils/carFormat.js'
import DateInputBR from '../components/DateInputBR.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import useConfirm from '../components/useConfirm.jsx'

const NAME_KEY = 'crm_sender_name'

function readSenderName(fallback) {
  try {
    return localStorage.getItem(NAME_KEY) || fallback
  } catch {
    return fallback
  }
}

function saveSenderName(name) {
  try {
    localStorage.setItem(NAME_KEY, name)
  } catch {
    // sem armazenamento: só não lembra o nome
  }
}

const carName = (car) => `${car.brand} ${car.model} ${car.version} · ${car.modelYear}`

// Aba "Atendimento" da ficha do cliente: "Chamar no WhatsApp" com as
// mensagens prontas da loja (o texto pode ser ajustado antes de abrir), o
// histórico de contatos e os retornos marcados (viram pendência no dia).
// preset: { car, match } vindo de "Avisar no WhatsApp" nos interesses.
export default function CustomerContacts({ customer, cars, preset, onChanged }) {
  const { confirm, confirmDialog } = useConfirm()
  const { seller, isStaff, user, viewAs } = useAuth()
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [store, setStore] = useState({ name: '', templates: DEFAULT_TEMPLATES })
  const [templateId, setTemplateId] = useState(preset?.car ? 'carro_combina' : DEFAULT_TEMPLATES[0].id)
  const [carId, setCarId] = useState(preset?.car?.id || '')
  const [sender, setSender] = useState(() => readSenderName(seller?.name || ''))
  const [message, setMessage] = useState('')
  const [edited, setEdited] = useState(false)
  const [followUp, setFollowUp] = useState('')
  const [note, setNote] = useState({ channel: 'ligacao', notes: '', followUpOn: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchContacts({ customerId: customer.id }), fetchStoreSettings().catch(() => null)])
      .then(([contactsData, storeData]) => {
        if (cancelled) return
        setContacts(contactsData)
        if (storeData) {
          setStore({ name: storeData.name, templates: storeData.templates })
          // Modelo "chegou um carro" pode ter sido removido pela loja
          setTemplateId((prev) => (storeData.templates.some((t) => t.id === prev) ? prev : storeData.templates[0].id))
        }
      })
      .catch((err) => !cancelled && setError(err.message || 'Não foi possível carregar o atendimento.'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [customer.id])

  const carOptions = useMemo(() => cars.filter((c) => c.status !== 'vendido' || c.customerId === customer.id), [cars, customer.id])
  const car = carOptions.find((c) => c.id === carId) || (preset?.car?.id === carId ? preset.car : null)
  const template = store.templates.find((t) => t.id === templateId) || store.templates[0]

  // Texto pronto (enquanto a pessoa não editar à mão)
  const filled = fillTemplate(template?.text || '', {
    nome: firstName(customer.name),
    carro: car ? carLabelForMessage(car) : '',
    link: car ? carPageUrl(car) : '',
    vendedor: sender.trim(),
    loja: store.name,
  })
  const text = edited ? message : filled
  const waLink = whatsappLinkToPhone(customer.phone, text)

  async function sendWhatsapp() {
    if (!waLink) return
    // Abre primeiro (o navegador só deixa abrir aba na hora do clique)
    window.open(waLink, '_blank', 'noreferrer')
    saveSenderName(sender.trim())
    setBusy(true)
    setError('')
    try {
      const created = await createContact({
        customerId: customer.id,
        channel: 'whatsapp',
        notes: `WhatsApp — ${template?.name || 'mensagem'}${car ? ` (${car.brand} ${car.model})` : ''}`,
        carId: car?.id || null,
        followUpOn: followUp || null,
      })
      setContacts((prev) => [created, ...prev])
      if (preset?.match && preset.match.status === 'novo' && preset.match.carId === car?.id) {
        await setMatchStatus(preset.match.id, 'avisado').catch(() => {})
      }
      setFollowUp('')
      onChanged?.()
    } catch (err) {
      setError('A conversa abriu, mas o contato não foi registrado: ' + err.message)
    } finally {
      setBusy(false)
    }
  }

  async function addNote(e) {
    e.preventDefault()
    if (!note.notes.trim()) {
      setError('Escreva o que foi conversado.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const created = await createContact({ customerId: customer.id, channel: note.channel, notes: note.notes, followUpOn: note.followUpOn || null })
      setContacts((prev) => [created, ...prev])
      setNote({ channel: 'ligacao', notes: '', followUpOn: '' })
      onChanged?.()
    } catch (err) {
      setError('Não foi possível registrar: ' + err.message)
    } finally {
      setBusy(false)
    }
  }

  async function finishFollowUp(contact) {
    try {
      const updated = await updateContact(contact.id, { followUpDone: true })
      setContacts((prev) => prev.map((c) => (c.id === contact.id ? updated : c)))
      onChanged?.()
    } catch (err) {
      setError('Não foi possível concluir: ' + err.message)
    }
  }

  async function remove(contact) {
    if (!(await confirm('Excluir este registro de atendimento?'))) return
    try {
      await deleteContact(contact.id)
      setContacts((prev) => prev.filter((c) => c.id !== contact.id))
      onChanged?.()
    } catch (err) {
      setError('Não foi possível excluir: ' + err.message)
    }
  }

  const canEdit = (c) => !viewAs && (isStaff || c.createdBy === user?.id)
  const today = todayISO()

  if (loading) return <p className="admin-muted">Carregando…</p>

  return (
    <div className="crm-tab">
      {error && <p className="admin-error">{error}</p>}

      {!viewAs && (
        <section className="admin-form crm-composer">
          <h4>
            <MessageCircle size={17} /> Chamar no WhatsApp
          </h4>
          {!customer.phone ? (
            <p className="admin-muted">Cadastre o telefone do cliente (Editar) para chamar no WhatsApp.</p>
          ) : (
            <>
              <div className="admin-form-grid">
                <label>
                  Mensagem pronta
                  <select value={templateId} onChange={(e) => { setTemplateId(e.target.value); setEdited(false) }}>
                    {store.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
                <label>
                  Carro (opcional)
                  <select value={carId} onChange={(e) => { setCarId(e.target.value); setEdited(false) }}>
                    <option value="">Nenhum</option>
                    {carOptions.map((c) => <option key={c.id} value={c.id}>{carName(c)}</option>)}
                  </select>
                </label>
                <label>
                  Seu nome na mensagem
                  <input value={sender} onChange={(e) => { setSender(e.target.value); setEdited(false) }} placeholder="Ex: João (fica salvo neste aparelho)" />
                </label>
                <label>
                  Retornar em (opcional)
                  <DateInputBR value={followUp} onChange={setFollowUp} />
                </label>
              </div>
              <label>
                Texto (dá para ajustar)
                <textarea rows={5} value={text} onChange={(e) => { setMessage(e.target.value); setEdited(true) }} />
              </label>
              <div className="admin-form-actions">
                {edited && (
                  <button type="button" className="btn btn-outline" onClick={() => setEdited(false)}>
                    Voltar ao texto do modelo
                  </button>
                )}
                <button type="button" className="btn btn-whatsapp" onClick={sendWhatsapp} disabled={!waLink || busy || !text.trim()}>
                  <MessageCircle size={16} /> Abrir conversa no WhatsApp
                </button>
              </div>
              <p className="admin-form-hint">O contato fica registrado no histórico abaixo.</p>
            </>
          )}
        </section>
      )}

      {!viewAs && (
        <form className="admin-form crm-note" onSubmit={addNote}>
          <h4>
            <NotebookPen size={17} /> Anotar contato
          </h4>
          <div className="admin-form-grid">
            <label>
              Como foi
              <select value={note.channel} onChange={(e) => setNote((p) => ({ ...p, channel: e.target.value }))}>
                {CONTACT_CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
            <label>
              Retornar em (opcional)
              <DateInputBR value={note.followUpOn} onChange={(iso) => setNote((p) => ({ ...p, followUpOn: iso }))} />
            </label>
          </div>
          <label>
            O que foi conversado
            <textarea rows={2} value={note.notes} onChange={(e) => setNote((p) => ({ ...p, notes: e.target.value }))} placeholder="Ex: veio ver o Corolla, quer simular com R$ 20 mil de entrada" />
          </label>
          <div className="admin-form-actions">
            <button type="submit" className="btn btn-outline" disabled={busy}>Registrar</button>
          </div>
        </form>
      )}

      <h4 className="crm-history-title">Histórico ({contacts.length})</h4>
      {contacts.length === 0 ? (
        <p className="admin-muted">Nenhum contato registrado ainda.</p>
      ) : (
        <ul className="crm-history">
          {contacts.map((c) => {
            const pending = c.followUpOn && !c.followUpDone
            const late = pending && c.followUpOn < today
            return (
              <li key={c.id}>
                <div className="crm-history-main">
                  <span className="admin-table-sub">
                    {new Date(c.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {contactChannelLabel(c.channel)}
                    {c.authorName ? ` · ${c.authorName}` : ''}
                  </span>
                  {c.notes && <p>{c.notes}</p>}
                  {c.followUpOn && (
                    <span className={`admin-pill ${c.followUpDone ? '' : late ? 'is-danger' : c.followUpOn === today ? 'is-warning' : 'is-info'}`}>
                      <CalendarClock size={13} /> Retorno {c.followUpDone ? 'feito' : late ? 'atrasado' : c.followUpOn === today ? 'hoje' : 'em'} {c.followUpDone || c.followUpOn === today ? '' : formatDateBR(c.followUpOn)}
                    </span>
                  )}
                </div>
                {canEdit(c) && (
                  <div className="crm-item-actions">
                    {pending && (
                      <button type="button" className="admin-action-btn" onClick={() => finishFollowUp(c)}>
                        <Check size={14} /> Retorno feito
                      </button>
                    )}
                    <button type="button" className="admin-icon-btn admin-icon-btn-danger" onClick={() => remove(c)} aria-label="Excluir registro">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {confirmDialog}
    </div>
  )
}
