import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, XCircle, Paperclip, RefreshCcw } from 'lucide-react'
import { fetchPlateCreditOrders, fetchPlatformPlateCredits, reviewPlateCredit, adjustPlateCredit } from '../../lib/plateCreditsApi.js'
import { fetchClients, paymentReceiptUrl } from '../../lib/clientsApi.js'
import { dateBR } from '../../utils/billing.js'
import { moneyBR, creditUsage, CREDIT_USAGE } from '../../utils/plateCredits.js'
import { parseMoneyBR } from '../../utils/financing.js'
import { MoneyInput } from '../../components/NumberInputs.jsx'
import { refreshPlatformBadges } from './platformBadges.js'
import '../admin.css'

const ORDER_STATUS = {
  pendente: { label: 'Para conferir', className: 'is-yellow' },
  confirmado: { label: 'Crédito liberado', className: 'is-green' },
  recusado: { label: 'Não confirmado', className: 'is-red' },
}

const ORDER_FILTERS = [
  { key: 'pendente', label: 'A conferir' },
  { key: 'confirmado', label: 'Confirmadas' },
  { key: 'recusado', label: 'Não confirmadas' },
  { key: 'todas', label: 'Todas' },
]

const USAGE_FILTERS = [
  { key: 'todas', label: 'Todas' },
  { key: 'usando', label: 'Usando' },
  { key: 'parado', label: 'Paradas' },
  { key: 'nunca', label: 'Nunca usaram' },
  { key: 'sem_saldo', label: 'Sem saldo' },
]

const dateTime = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '')
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// Painel WB.Dev → Créditos (14/10/2026; até então ficava dentro da Cobrança).
// As lojas compram créditos pelo PIX da WB.Dev (Mensalidade → "Já paguei") e
// gastam na consulta por placa, na foto do documento e na assinatura digital.
// Aqui: conferir as compras, ver o saldo de cada loja, se ela está usando e
// lançar ajustes (bônus ou devolução). A loja de demonstração fica fora dos totais.
export default function PlatformCredits() {
  const [clients, setClients] = useState([])
  const [orders, setOrders] = useState(null)
  const [stores, setStores] = useState([])
  const [orderFilter, setOrderFilter] = useState(null)
  const [orderStore, setOrderStore] = useState('')
  const [usageFilter, setUsageFilter] = useState('todas')
  const [refusing, setRefusing] = useState(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [adjust, setAdjust] = useState({ companyId: '', direction: 'dar', amount: '', note: '' })

  async function load() {
    setError('')
    try {
      const [c, o, s] = await Promise.all([fetchClients().catch(() => []), fetchPlateCreditOrders(), fetchPlatformPlateCredits()])
      setClients(c)
      setOrders(o)
      setStores(s)
    } catch (err) {
      setError(err.message || 'Não foi possível carregar os créditos.')
      setOrders((prev) => prev || [])
    }
  }

  useEffect(() => {
    load()
  }, [])

  const byId = useMemo(() => new Map(clients.map((c) => [c.companyId, c])), [clients])
  const nameOf = (id) => byId.get(id)?.name || stores.find((s) => s.companyId === id)?.name || 'Loja'
  const slugOf = (id) => byId.get(id)?.slug || stores.find((s) => s.companyId === id)?.slug || ''

  const rows = useMemo(() => {
    const now = new Date()
    return stores.map((s) => ({ ...s, usage: creditUsage(s, now) })).sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name))
  }, [stores])
  const real = rows.filter((s) => !s.isDemo)
  const totals = {
    balance: real.reduce((t, s) => t + s.balance, 0),
    bought: real.reduce((t, s) => t + s.boughtTotal, 0),
    confirmed: real.reduce((t, s) => t + s.ordersConfirmed, 0),
    spent30: real.reduce((t, s) => t + s.spent30d, 0),
    queries30: real.reduce((t, s) => t + s.queries30d, 0),
    docs30: real.reduce((t, s) => t + s.docs30d, 0),
    signatures30: real.reduce((t, s) => t + s.signatures30d, 0),
    using: real.filter((s) => s.usage === 'usando').length,
    empty: real.filter((s) => s.usage === 'sem_saldo').length,
  }

  const pendingCount = (orders || []).filter((o) => o.status === 'pendente').length
  // Abre em "A conferir" quando tem compra esperando; senão, em "Todas"
  const activeOrderFilter = orderFilter || (pendingCount ? 'pendente' : 'todas')
  const shownOrders = (orders || []).filter(
    (o) => (activeOrderFilter === 'todas' || o.status === activeOrderFilter) && (!orderStore || o.companyId === orderStore)
  )
  const shownStores = rows.filter((s) => usageFilter === 'todas' || s.usage === usageFilter)
  const usageCount = (key) => rows.filter((s) => key === 'todas' || s.usage === key).length

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

  const storeLink = (id) => {
    const slug = slugOf(id)
    return slug ? <Link to={`/wbdev/clientes/${slug}`}>{nameOf(id)}</Link> : nameOf(id)
  }

  return (
    <div className="admin-page platform-page">
      <div className="admin-page-head">
        <div>
          <h1>Créditos</h1>
          <p>Compras de créditos das lojas (consulta por placa, foto do documento e assinatura digital), o saldo de cada uma e quem está usando.</p>
        </div>
        <button type="button" className="btn btn-outline" onClick={load}>
          <RefreshCcw size={15} /> Atualizar
        </button>
      </div>
      {error && <p className="admin-error">{error}</p>}
      {message && <p className="admin-success">{message}</p>}

      {orders === null ? (
        <p className="admin-muted">Carregando…</p>
      ) : (
        <>
          <div className="platform-kpis">
            <div className="platform-kpi">
              <span>Saldo das lojas</span>
              <strong>{moneyBR(totals.balance)}</strong>
              <small>pago e ainda não usado</small>
            </div>
            <div className="platform-kpi">
              <span>Comprado até hoje</span>
              <strong>{moneyBR(totals.bought)}</strong>
              <small>{plural(totals.confirmed, 'compra confirmada', 'compras confirmadas')}</small>
            </div>
            <div className="platform-kpi">
              <span>Gasto em 30 dias</span>
              <strong>{moneyBR(totals.spent30)}</strong>
              <small>
                {plural(totals.queries30, 'placa', 'placas')} · {plural(totals.docs30, 'foto', 'fotos')} · {plural(totals.signatures30, 'assinatura', 'assinaturas')}
              </small>
            </div>
            <div className="platform-kpi">
              <span>Lojas usando</span>
              <strong>
                {totals.using} de {real.length}
              </strong>
              <small>{totals.empty ? `${plural(totals.empty, 'loja', 'lojas')} sem saldo` : 'nenhuma sem saldo'}</small>
            </div>
          </div>

          <section className="admin-form-section payment-claims">
            <h2>Compras {pendingCount > 0 && <span className="admin-nav-badge">{pendingCount}</span>}</h2>
            <p className="admin-form-hint">
              A loja compra um pacote na página Mensalidade e clica em "Já paguei". Confira o PIX e confirme: o valor entra no saldo da loja.
            </p>
            <div className="credits-filters">
              <div className="admin-segmented" role="tablist" aria-label="Situação da compra">
                {ORDER_FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    role="tab"
                    aria-selected={activeOrderFilter === f.key}
                    className={activeOrderFilter === f.key ? 'is-active' : ''}
                    onClick={() => setOrderFilter(f.key)}
                  >
                    {f.label}
                    {f.key === 'pendente' && pendingCount > 0 ? ` (${pendingCount})` : ''}
                  </button>
                ))}
              </div>
              <select value={orderStore} onChange={(e) => setOrderStore(e.target.value)} aria-label="Loja">
                <option value="">Todas as lojas</option>
                {rows.map((s) => (
                  <option key={s.companyId} value={s.companyId}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {shownOrders.length === 0 && <p className="admin-muted">Nenhuma compra aqui.</p>}
            {shownOrders.map((o) => (
              <div className={`payment-claim ${o.status === 'pendente' ? 'is-pending' : ''}`} key={o.id}>
                <div className="payment-claim-info">
                  <strong>
                    {storeLink(o.companyId)} · créditos de {moneyBR(o.amount)}
                  </strong>
                  <span className="admin-table-sub">
                    Pago em {dateBR(o.paidOn)} · informado em {dateTime(o.createdAt)}
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
                  <span className={`platform-health ${ORDER_STATUS[o.status]?.className || ''}`}>{ORDER_STATUS[o.status]?.label || o.status}</span>
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
                      <button type="button" className="btn btn-outline" onClick={() => setRefusing(null)}>
                        Voltar
                      </button>
                      <button type="button" className="btn btn-primary" onClick={() => review(o, false)} disabled={!reason.trim() || Boolean(busy)}>
                        Confirmar a recusa
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </section>

          <section className="admin-form-section">
            <h2>Saldo de cada loja</h2>
            <div className="credits-filters">
              <div className="admin-segmented" role="tablist" aria-label="Situação da loja">
                {USAGE_FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    role="tab"
                    aria-selected={usageFilter === f.key}
                    className={usageFilter === f.key ? 'is-active' : ''}
                    onClick={() => setUsageFilter(f.key)}
                  >
                    {f.label} ({usageCount(f.key)})
                  </button>
                ))}
              </div>
            </div>
            {shownStores.length === 0 ? (
              <p className="admin-muted">Nenhuma loja aqui.</p>
            ) : (
              <div className="admin-table-wrap plate-credits-stores">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Loja</th>
                      <th>Situação</th>
                      <th>Saldo</th>
                      <th>Último uso</th>
                      <th>Em 30 dias</th>
                      <th>Gasto em 30 dias</th>
                      <th>Comprado</th>
                      <th>Bônus</th>
                      <th>Gasto desde o início</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownStores.map((s) => (
                      <tr key={s.companyId}>
                        <td>
                          {storeLink(s.companyId)}
                          {s.isDemo && <span className="admin-table-sub">Demonstração (fora dos totais)</span>}
                        </td>
                        <td>
                          <span className={`platform-health ${CREDIT_USAGE[s.usage].className}`}>{CREDIT_USAGE[s.usage].label}</span>
                        </td>
                        <td>{moneyBR(s.balance)}</td>
                        <td>{s.lastUseAt ? dateBR(s.lastUseAt.slice(0, 10)) : '—'}</td>
                        <td>
                          {plural(s.queries30d, 'placa', 'placas')}, {plural(s.docs30d, 'foto', 'fotos')}, {plural(s.signatures30d, 'assinatura', 'assinaturas')}
                        </td>
                        <td>{moneyBR(s.spent30d)}</td>
                        <td>{moneyBR(s.boughtTotal)}</td>
                        <td>{moneyBR(s.bonusTotal)}</td>
                        <td>{moneyBR(s.spentTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="admin-form-note">
              Usando: gastou crédito nos últimos 30 dias. Parada: tem saldo, mas não usa há mais de 30 dias. Bônus: créditos dados por ajuste (ex.: boas-vindas).
            </p>

            <details className="plate-credits-adjust">
              <summary>Lançar ajuste (bônus ou devolução)</summary>
              <form className="admin-form" onSubmit={submitAdjust}>
                <div className="admin-form-grid">
                  <label>
                    Loja
                    <select value={adjust.companyId} onChange={(e) => setAdjust((a) => ({ ...a, companyId: e.target.value }))}>
                      <option value="">Escolha a loja</option>
                      {(clients.length ? clients : rows).map((c) => (
                        <option key={c.companyId} value={c.companyId}>
                          {c.name}
                        </option>
                      ))}
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
          </section>
        </>
      )}
    </div>
  )
}
