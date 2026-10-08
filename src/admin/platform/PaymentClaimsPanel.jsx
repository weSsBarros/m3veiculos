import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, XCircle, Paperclip } from 'lucide-react'
import { fetchPaymentClaims, reviewPaymentClaim, paymentReceiptUrl } from '../../lib/clientsApi.js'
import { money, dateBR, monthsText } from '../../utils/billing.js'
import { refreshPlatformBadges } from './platformBadges.js'

const STATUS = {
  pendente: { label: 'Para conferir', className: 'is-yellow' },
  confirmado: { label: 'Confirmado', className: 'is-green' },
  recusado: { label: 'Não confirmado', className: 'is-red' },
}

// Plataforma → Cobrança: pagamentos que as lojas informaram ("Já paguei").
// Confirmar vira o pagamento de cada mês; não confirmar pede o motivo (a loja vê).
export default function PaymentClaimsPanel({ clients, onConfirmed }) {
  const [claims, setClaims] = useState(null)
  const [refusing, setRefusing] = useState(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function load() {
    try {
      setClaims(await fetchPaymentClaims())
    } catch (err) {
      setError(err.message || 'Não foi possível carregar os pagamentos informados.')
      setClaims([])
    }
  }

  useEffect(() => {
    load()
  }, [])

  const byId = new Map(clients.map((c) => [c.companyId, c]))

  async function review(claim, confirm) {
    setBusy(claim.id)
    setError('')
    setMessage('')
    try {
      await reviewPaymentClaim(claim.id, confirm, confirm ? '' : reason.trim())
      setMessage(
        confirm
          ? `Pagamento de ${byId.get(claim.companyId)?.name || 'loja'} confirmado (${monthsText(claim.months)}). O recibo por e-mail sai pela ficha do cliente.`
          : 'Pagamento marcado como não confirmado. A loja vê o motivo na página Mensalidade.'
      )
      setRefusing(null)
      setReason('')
      await load()
      refreshPlatformBadges()
      if (confirm) onConfirmed?.()
    } catch (err) {
      setError(err.message || 'Não foi possível conferir.')
    } finally {
      setBusy('')
    }
  }

  async function openReceipt(path) {
    try {
      window.open(await paymentReceiptUrl(path), '_blank', 'noreferrer')
    } catch (err) {
      alert('Não foi possível abrir o comprovante: ' + err.message)
    }
  }

  if (claims === null) return null
  const pending = claims.filter((c) => c.status === 'pendente')
  const recent = claims.filter((c) => c.status !== 'pendente').slice(0, 8)
  if (claims.length === 0 && !error) return null

  return (
    <div className="admin-form-section payment-claims">
      <h2>Pagamentos informados {pending.length > 0 && <span className="admin-nav-badge">{pending.length}</span>}</h2>
      <p className="admin-form-hint">Quando a loja clica em "Já paguei", o aviso chega no seu WhatsApp e aparece aqui para conferir.</p>
      {error && <p className="admin-error">{error}</p>}
      {message && <p className="admin-success">{message}</p>}
      {[...pending, ...recent].map((c) => {
        const client = byId.get(c.companyId)
        return (
          <div className={`payment-claim ${c.status === 'pendente' ? 'is-pending' : ''}`} key={c.id}>
            <div className="payment-claim-info">
              <strong>
                {client ? <Link to={`/wbdev/clientes/${client.slug}`}>{client.name}</Link> : 'Loja'} · {monthsText(c.months)} · {money(c.amount)}
              </strong>
              <span className="admin-table-sub">
                Pago em {dateBR(c.paidOn)} · informado em {new Date(c.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                {c.createdByEmail ? ` por ${c.createdByEmail}` : ''}
              </span>
              {c.note && <span className="admin-table-sub">“{c.note}”</span>}
              {c.response && <span className="admin-table-sub">Motivo: {c.response}</span>}
              {c.receipt?.path && (
                <button type="button" className="expense-attachment-link" onClick={() => openReceipt(c.receipt.path)}>
                  <Paperclip size={12} /> Comprovante ({c.receipt.name || 'arquivo'})
                </button>
              )}
            </div>
            <div className="payment-claim-actions">
              <span className={`platform-health ${STATUS[c.status]?.className || ''}`}>{STATUS[c.status]?.label || c.status}</span>
              {c.status === 'pendente' && refusing !== c.id && (
                <>
                  <button type="button" className="btn btn-primary" onClick={() => review(c, true)} disabled={Boolean(busy)}>
                    <CheckCircle2 size={15} /> {busy === c.id ? 'Confirmando…' : 'Confirmar'}
                  </button>
                  <button type="button" className="btn btn-outline" onClick={() => setRefusing(c.id)} disabled={Boolean(busy)}>
                    <XCircle size={15} /> Não confirmar
                  </button>
                </>
              )}
              {refusing === c.id && (
                <div className="payment-claim-refuse">
                  <input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (a loja vê): ex. o valor não entrou na conta" />
                  <button type="button" className="btn btn-outline" onClick={() => setRefusing(null)}>Voltar</button>
                  <button type="button" className="btn btn-primary" onClick={() => review(c, false)} disabled={!reason.trim() || Boolean(busy)}>
                    Confirmar a recusa
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
