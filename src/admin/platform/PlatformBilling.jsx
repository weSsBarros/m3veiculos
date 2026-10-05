import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCcw } from 'lucide-react'
import { fetchClients, fetchPayments } from '../../lib/clientsApi.js'
import { billingTotals, receivedByMonth, money, monthName, dateBR, isCharged } from '../../utils/billing.js'
import { recentMonths, monthLabel } from '../../utils/platform.js'
import BarChart from '../../components/charts/BarChart.jsx'
import { BillingPill } from './ClientParts.jsx'
import PlatformTabs from './PlatformTabs.jsx'
import '../admin.css'

// Painel WB.Dev → Cobrança: receita mensal, recebido, atrasos e o mês atual
export default function PlatformBilling() {
  const [clients, setClients] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [c, p] = await Promise.all([fetchClients(), fetchPayments()])
      setClients(c)
      setPayments(p)
    } catch (err) {
      setError(err.message || 'Não foi possível carregar a cobrança.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const today = new Date()
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const totals = useMemo(() => billingTotals(clients, payments), [clients, payments])
  const months = useMemo(() => recentMonths(12).reverse(), [])
  const chart = useMemo(
    () => receivedByMonth(payments, months).map((m) => ({ label: monthLabel(m.month).slice(0, 3), value: m.value })),
    [payments, months]
  )
  const charged = clients.filter((c) => isCharged(c.billing))
  const implanting = clients.filter((c) => c.account.status === 'implantacao')
  const paidNow = new Set(payments.filter((p) => p.referenceMonth === thisMonth).map((p) => p.companyId))
  const late = charged.filter((c) => c.billing.situation === 'atrasado').sort((a, b) => b.billing.days_late - a.billing.days_late)
  const noCharge = clients.filter((c) => c.billing.situation === 'sem_cobranca' && c.account.status === 'ativo')

  return (
    <div className="admin-page platform-page">
      <div className="admin-page-head">
        <div>
          <h1>Plataforma</h1>
          <p>Mensalidades dos clientes: o que entra, o que falta e quem atrasou.</p>
        </div>
        <button type="button" className="btn btn-outline" onClick={load}>
          <RefreshCcw size={15} /> Atualizar
        </button>
      </div>
      <PlatformTabs />
      {error && <p className="admin-error">{error}</p>}

      {loading && clients.length === 0 ? (
        <p className="admin-muted">Carregando…</p>
      ) : (
        <>
          <div className="platform-kpis">
            <div className="platform-kpi">
              <span>Receita mensal</span>
              <strong>{money(totals.mrr)}</strong>
              <small>
                {totals.clients} {totals.clients === 1 ? 'cliente cobrado' : 'clientes cobrados'}
              </small>
            </div>
            <div className="platform-kpi">
              <span>Recebido em {monthName(thisMonth).split(' ')[0]}</span>
              <strong>{money(totals.received)}</strong>
              <small>
                {totals.paidThisMonth} de {totals.clients} pagaram o mês
              </small>
            </div>
            <div className="platform-kpi">
              <span>Em atraso</span>
              <strong>{money(totals.overdue)}</strong>
              <small>
                {totals.lateCount} {totals.lateCount === 1 ? 'cliente' : 'clientes'}
              </small>
            </div>
            <div className="platform-kpi">
              <span>Inadimplência</span>
              <strong>{totals.lateRate}%</strong>
              <small>dos clientes cobrados</small>
            </div>
          </div>

          <div className="chart-card platform-billing-chart">
            <h3>Recebido por mês</h3>
            <BarChart data={chart} color="#2446c8" formatValue={(v) => (v > 0 ? `R$ ${Math.round(v).toLocaleString('pt-BR')}` : '—')} />
          </div>

          {late.length > 0 && (
            <>
              <h2 className="admin-section-title">Em atraso</h2>
              <ul className="client-list">
                {late.map((c) => (
                  <li key={c.companyId}>
                    <Link to={`/admin/plataforma/clientes/${c.slug}`}>
                      <strong>{c.name}</strong>
                      <span>
                        {c.billing.open.map((o) => monthName(o.month)).join(', ')} · {money(c.billing.open_total)}
                      </span>
                    </Link>
                    <BillingPill billing={c.billing} />
                  </li>
                ))}
              </ul>
            </>
          )}

          <h2 className="admin-section-title">{monthLabel(thisMonth.slice(0, 7))}</h2>
          {charged.length === 0 ? (
            <p className="admin-muted">Nenhum cliente com cobrança cadastrada. Preencha o plano, o valor e o vencimento na ficha de cada cliente.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Vencimento</th>
                    <th>Valor</th>
                    <th>Mês</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {charged.map((c) => {
                    const due = `${thisMonth.slice(0, 8)}${String(c.billing.due_day).padStart(2, '0')}`
                    return (
                      <tr key={c.companyId}>
                        <td>
                          <Link to={`/admin/plataforma/clientes/${c.slug}`}>{c.name}</Link>
                        </td>
                        <td>{dateBR(due)}</td>
                        <td>{money(c.billing.price)}</td>
                        <td>{paidNow.has(c.companyId) ? <span className="platform-health is-green">Pago</span> : <span className="platform-health is-gray">Em aberto</span>}</td>
                        <td>
                          <BillingPill billing={c.billing} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {implanting.length > 0 && (
            <p className="admin-form-note">
              Em implantação (sem cobrança até ativar): {implanting.map((c) => c.name).join(', ')}.
            </p>
          )}
          {noCharge.length > 0 && (
            <p className="admin-form-note">
              Sem cobrança cadastrada: {noCharge.map((c) => c.name).join(', ')}.
            </p>
          )}
        </>
      )}
    </div>
  )
}
