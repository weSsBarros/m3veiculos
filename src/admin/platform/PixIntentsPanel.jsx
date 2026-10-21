import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, XCircle } from 'lucide-react'
import { fetchOpenPixIntents, resolvePixIntent } from '../../lib/pixIntentsApi.js'
import { money, monthsText } from '../../utils/billing.js'
import DateInputBR from '../../components/DateInputBR.jsx'
import { refreshPlatformBadges } from './platformBadges.js'

const TEXT = {
  creditos: {
    title: 'PIX de créditos sem "Já paguei"',
    hint:
      'Alguém da loja copiou o código PIX de um pacote e não clicou em "Já paguei". Confira no extrato do banco: se o valor entrou, ' +
      'confirme e o crédito entra na hora no saldo da loja; se não entrou, marque "Não pagou".',
    done: (name, value) => `${value} de crédito liberados para ${name}.`,
  },
  mensalidade: {
    title: 'PIX da mensalidade sem "Já paguei"',
    hint:
      'O administrador da loja copiou o código PIX da mensalidade e não clicou em "Já paguei". Confira no extrato do banco: se o valor ' +
      'entrou, confirme e os meses ficam pagos; se não entrou, marque "Não pagou".',
    done: (name, value) => `Mensalidade de ${name} (${value}) confirmada.`,
  },
}

const dateTime = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '')
// Dia do PIX copiado, no horário de São Luís (é a data sugerida do pagamento)
const dayOf = (iso) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'America/Fortaleza' })

// Painel WB.Dev (seção 94): os PIX que a loja copiou e não avisou com "Já paguei".
// Créditos fica na aba Créditos; a mensalidade, na Cobrança.
export default function PixIntentsPanel({ kind, clients = [], onConfirmed }) {
  const [items, setItems] = useState(null)
  const [confirming, setConfirming] = useState(null)
  const [paidOn, setPaidOn] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function load() {
    try {
      setItems(await fetchOpenPixIntents(kind))
    } catch (err) {
      setError(err.message || 'Não foi possível carregar os PIX gerados.')
      setItems([])
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind])

  const byId = new Map(clients.map((c) => [c.companyId, c]))
  const nameOf = (id) => byId.get(id)?.name || 'Loja'

  async function resolve(item, confirm) {
    setBusy(item.id)
    setError('')
    setMessage('')
    try {
      await resolvePixIntent(item.id, confirm, confirm ? paidOn : null)
      setMessage(confirm ? TEXT[kind].done(nameOf(item.companyId), money(item.amount)) : 'PIX marcado como não pago. Ele sai da lista.')
      setConfirming(null)
      await load()
      refreshPlatformBadges()
      if (confirm) onConfirmed?.()
    } catch (err) {
      setError(err.message || 'Não foi possível conferir.')
    } finally {
      setBusy('')
    }
  }

  if (items === null || (items.length === 0 && !error && !message)) return null

  return (
    <section className="admin-form-section payment-claims pix-intents">
      <h2>
        {TEXT[kind].title} {items.length > 0 && <span className="admin-nav-badge">{items.length}</span>}
      </h2>
      <p className="admin-form-hint">{TEXT[kind].hint}</p>
      {error && <p className="admin-error">{error}</p>}
      {message && <p className="admin-success">{message}</p>}
      {items.map((it) => {
        const client = byId.get(it.companyId)
        return (
          <div className="payment-claim is-pending" key={it.id}>
            <div className="payment-claim-info">
              <strong>
                {client ? <Link to={`/wbdev/clientes/${client.slug}`}>{client.name}</Link> : 'Loja'} ·{' '}
                {kind === 'mensalidade' && it.months.length > 0 ? `${monthsText(it.months)} · ` : ''}
                {money(it.amount)}
              </strong>
              <span className="admin-table-sub">
                Copiou o PIX em {dateTime(it.lastCopiedAt)}
                {it.createdByEmail ? ` · ${it.createdByEmail}` : ''}
                {it.copies > 1 ? ` · copiou ${it.copies} vezes` : ''}
              </span>
            </div>
            <div className="payment-claim-actions">
              <span className="platform-health is-yellow">Sem "Já paguei"</span>
              {confirming !== it.id ? (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setConfirming(it.id)
                      setPaidOn(dayOf(it.lastCopiedAt))
                    }}
                    disabled={Boolean(busy)}
                  >
                    <CheckCircle2 size={15} /> Entrou, confirmar
                  </button>
                  <button type="button" className="btn btn-outline" onClick={() => resolve(it, false)} disabled={Boolean(busy)}>
                    <XCircle size={15} /> {busy === it.id ? 'Salvando…' : 'Não pagou'}
                  </button>
                </>
              ) : (
                <div className="payment-claim-refuse pix-intent-confirm">
                  <label>
                    Pago em
                    <DateInputBR required value={paidOn} onChange={setPaidOn} />
                  </label>
                  <button type="button" className="btn btn-outline" onClick={() => setConfirming(null)} disabled={Boolean(busy)}>
                    Voltar
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => resolve(it, true)} disabled={!paidOn || Boolean(busy)}>
                    {busy === it.id ? 'Confirmando…' : 'Confirmar o pagamento'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </section>
  )
}
