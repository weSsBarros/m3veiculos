import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, XCircle, Paperclip } from 'lucide-react'
import { fetchPlateCreditOrders, fetchPlatformPlateCredits, reviewPlateCredit, adjustPlateCredit } from '../../lib/plateCreditsApi.js'
import { paymentReceiptUrl } from '../../lib/clientsApi.js'
import { dateBR } from '../../utils/billing.js'
import { moneyBR } from '../../utils/plateCredits.js'
import { parseMoneyBR } from '../../utils/financing.js'
import { MoneyInput } from '../../components/NumberInputs.jsx'
import { refreshPlatformBadges } from './platformBadges.js'

const STATUS = {
  pendente: { label: 'Para conferir', className: 'is-yellow' },
  confirmado: { label: 'Crédito liberado', className: 'is-green' },
  recusado: { label: 'Não confirmado', className: 'is-red' },
}

// Plataforma → Cobrança: créditos da consulta por placa. As lojas compram pacotes
// pelo PIX da WB.Dev; confirmar põe o valor no saldo da loja. Também mostra o
// saldo de cada loja e lança ajustes (bônus ou devolução, sempre com motivo).
export default function PlateCreditsPanel({ clients }) {
  const [orders, setOrders] = useState(null)
  const [stores, setStores] = useState([])
  const [refusing, setRefusing] = useState(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [adjust, setAdjust] = useState({ companyId: '', direction: 'dar', amount: '', note: '' })

  async function load() {
    try {
      const [o, s] = await Promise.all([fetchPlateCreditOrders(), fetchPlatformPlateCredits()])
      setOrders(o)
      setStores(s)
    } catch (err) {
      setError(err.message || 'Não foi possível carregar os créditos da consulta por placa.')
      setOrders([])
    }
  }

  useEffect(() => {
    load()
  }, [])

  const byId = new Map(clients.map((c) => [c.companyId, c]))
  const nameOf = (id) => byId.get(id)?.name || stores.find((s) => s.companyId === id)?.name || 'Loja'

  async function review(order, confirm) {
    setBusy(order.id)
    setError('')
    setMessage('')
    try {
      await reviewPlateCredit(order.id, confirm, confirm ? '' : reason.trim())
      setMessage(confirm
        ? `${moneyBR(order.amount)} de crédito liberados para ${nameOf(order.companyId)}.`
        : 'Compra marcada como não confirmada. A loja vê o motivo na página Mensalidade.')
      setRefusing(null)
      setReason('')
      await load()
      refreshPlatformBadges()
    } catch (err) {
      setError(err.message || 'Não foi possível conferir.')
    } finally {
      setBusy('')
    }
  }

  async function submitAdjust(e) {
    e.preventDefault()
    const value = parseMoneyBR(adjust.amount)
    if (!adjust.companyId) return setError('Escolha a loja do ajuste.')
    if (!value || value <= 0) return setError('Informe o valor do ajuste.')
    if (!adjust.note.trim()) return setError('Escreva o motivo do ajuste (a loja vê no extrato).')
    setBusy('ajuste')
    setError('')
    setMessage('')
    try {
      const balance = await adjustPlateCredit(adjust.companyId, adjust.direction === 'dar' ? value : -value, adjust.note.trim())
      setMessage(`Ajuste lançado. Saldo de ${nameOf(adjust.companyId)}: ${moneyBR(balance)}.`)
      setAdjust({ companyId: '', direction: 'dar', amount: '', note: '' })
      await load()
    } catch (err) {
      setError(err.message || 'Não foi possível lançar o ajuste.')
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

  if (orders === null) return null
  const pending = orders.filter((o) => o.status === 'pendente')
  const recent = orders.filter((o) => o.status !== 'pendente').slice(0, 6)
  const totalBalance = stores.reduce((s, r) => s + r.balance, 0)

  return (
    <div className="admin-form-section payment-claims plate-credits-admin">
      <h2>Créditos da consulta por placa {pending.length > 0 && <span className="admin-nav-badge">{pending.length}</span>}</h2>
      <p className="admin-form-hint">
        As lojas compram pacotes pelo seu PIX na página Mensalidade e clicam em "Já paguei". Confira o PIX e confirme: o valor entra no saldo
        da loja, e cada consulta nova debita o preço definido em "Dados de pagamento e suporte".
      </p>
      {error && <p className="admin-error">{error}</p>}
      {message && <p className="admin-success">{message}</p>}

      {[...pending, ...recent].map((o) => {
        const client = byId.get(o.companyId)
        return (
          <div className={`payment-claim ${o.status === 'pendente' ? 'is-pending' : ''}`} key={o.id}>
            <div className="payment-claim-info">
              <strong>
                {client ? <Link to={`/wbdev/clientes/${client.slug}`}>{client.name}</Link> : nameOf(o.companyId)} · créditos de {moneyBR(o.amount)}
              </strong>
              <span className="admin-table-sub">
                Pago em {dateBR(o.paidOn)} · informado em {new Date(o.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                {o.createdByEmail ? ` por ${o.createdByEmail}` : ''}
              </span>
              {o.note && <span className="admin-table-sub">“{o.note}”</span>}
              {o.response && <span className="admin-table-sub">Motivo: {o.response}</span>}
              {o.receipt?.path && (
                <button type="button" className="expense-attachment-link" onClick={() => openReceipt(o.receipt.path)}>
                  <Paperclip size={12} /> Comprovante ({o.receipt.name || 'arquivo'})
                </button>
              )}
            </div>
            <div className="payment-claim-actions">
              <span className={`platform-health ${STATUS[o.status]?.className || ''}`}>{STATUS[o.status]?.label || o.status}</span>
              {o.status === 'pendente' && refusing !== o.id && (
                <>
                  <button type="button" className="btn btn-primary" onClick={() => review(o, true)} disabled={Boolean(busy)}>
                    <CheckCircle2 size={15} /> {busy === o.id ? 'Confirmando…' : 'Confirmar'}
                  </button>
                  <button type="button" className="btn btn-outline" onClick={() => setRefusing(o.id)} disabled={Boolean(busy)}>
                    <XCircle size={15} /> Não confirmar
                  </button>
                </>
              )}
              {refusing === o.id && (
                <div className="payment-claim-refuse">
                  <input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (a loja vê): ex. o PIX não entrou na conta" />
                  <button type="button" className="btn btn-outline" onClick={() => setRefusing(null)}>Voltar</button>
                  <button type="button" className="btn btn-primary" onClick={() => review(o, false)} disabled={!reason.trim() || Boolean(busy)}>
                    Confirmar a recusa
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}

      {stores.length > 0 && (
        <div className="plate-credits-stores">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Loja</th>
                  <th>Saldo</th>
                  <th>Placas em 30 dias</th>
                  <th>Fotos lidas em 30 dias</th>
                  <th>Assinaturas pagas em 30 dias</th>
                  <th>Gasto em 30 dias</th>
                  <th>Comprado no total</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((s) => (
                  <tr key={s.companyId}>
                    <td>{s.name}</td>
                    <td>{moneyBR(s.balance)}</td>
                    <td>{s.queries30d}</td>
                    <td>{s.docs30d}</td>
                    <td>{s.signatures30d}</td>
                    <td>{moneyBR(s.spent30d)}</td>
                    <td>{moneyBR(s.boughtTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="admin-form-note">Saldo somado das lojas: {moneyBR(totalBalance)} (crédito já pago e ainda não usado).</p>
        </div>
      )}

      <details className="plate-credits-adjust">
        <summary>Lançar ajuste (bônus ou devolução)</summary>
        <form className="admin-form" onSubmit={submitAdjust}>
          <div className="admin-form-grid">
            <label>
              Loja
              <select value={adjust.companyId} onChange={(e) => setAdjust((a) => ({ ...a, companyId: e.target.value }))}>
                <option value="">Escolha a loja</option>
                {clients.map((c) => <option key={c.companyId} value={c.companyId}>{c.name}</option>)}
              </select>
            </label>
            <label>
              Tipo
              <select value={adjust.direction} onChange={(e) => setAdjust((a) => ({ ...a, direction: e.target.value }))}>
                <option value="dar">Dar crédito</option>
                <option value="tirar">Tirar crédito</option>
              </select>
            </label>
            <label>
              Valor
              <MoneyInput cents value={adjust.amount} onChange={(v) => setAdjust((a) => ({ ...a, amount: v }))} />
            </label>
            <label>
              Motivo (a loja vê no extrato)
              <input value={adjust.note} maxLength={200} onChange={(e) => setAdjust((a) => ({ ...a, note: e.target.value }))} placeholder="Ex: bônus de boas-vindas" />
            </label>
          </div>
          <div className="admin-form-actions">
            <button type="submit" className="btn btn-primary" disabled={busy === 'ajuste'}>
              {busy === 'ajuste' ? 'Lançando…' : 'Lançar ajuste'}
            </button>
          </div>
        </form>
      </details>
    </div>
  )
}
