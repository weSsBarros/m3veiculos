import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCcw, FileDown, FileSpreadsheet, Pencil, Trash2 } from 'lucide-react'
import { fetchClients, fetchPayments, fetchExpenses, saveExpense, deleteExpense } from '../../lib/clientsApi.js'
import { money, dateBR } from '../../utils/billing.js'
import { monthLabel } from '../../utils/platform.js'
import {
  EXPENSE_CATEGORIES,
  categoryLabel,
  currentMonth,
  firstActivityMonth,
  periodOptions,
  periodRange,
  financeSummary,
  clientRanking,
  forecast,
  averageMonthlyCost,
} from '../../utils/finance.js'
import { parseMoneyBR, formatMoneyInput } from '../../utils/financing.js'
import { todayISO } from '../../utils/carFormat.js'
import { downloadCsv } from '../../utils/exportCsv.js'
import { exportFinancePdf } from '../../utils/financePdf.js'
import GroupedBarChart from '../../components/charts/GroupedBarChart.jsx'
import HBarChart from '../../components/charts/HBarChart.jsx'
import DateInputBR from '../../components/DateInputBR.jsx'
import { MoneyInput } from '../../components/NumberInputs.jsx'
import useConfirm from '../../components/useConfirm.jsx'
import { BillingPill } from './ClientParts.jsx'
import '../admin.css'

const SECTIONS = [
  { key: 'resumo', label: 'Resumo' },
  { key: 'clientes', label: 'Por cliente' },
  { key: 'despesas', label: 'Despesas' },
]

const EMPTY_EXPENSE = { id: null, spentOn: '', description: '', category: 'hospedagem', amount: '', companyId: '', notes: '' }

const shortMonth = (month) => monthLabel(month).slice(0, 3)
const dash = (v) => (v === null || v === undefined ? '—' : money(v))
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// Painel WB.Dev → Financeiro: o que entrou, o que falta receber, média mensal,
// despesas e lucro, ranking por cliente e previsão (cálculos em utils/finance.js)
export default function PlatformFinance() {
  const { confirm, confirmDialog } = useConfirm()
  const [clients, setClients] = useState([])
  const [payments, setPayments] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [periodValue, setPeriodValue] = useState('ano')
  const [section, setSection] = useState('resumo')
  const [form, setForm] = useState({ ...EMPTY_EXPENSE, spentOn: todayISO() })
  const [formError, setFormError] = useState('')
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [c, p, e] = await Promise.all([fetchClients(), fetchPayments(), fetchExpenses()])
      setClients(c)
      setPayments(p)
      setExpenses(e)
    } catch (err) {
      setError(err.message || 'Não foi possível carregar o financeiro.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const today = new Date()
  const first = useMemo(() => firstActivityMonth({ clients, payments, expenses }), [clients, payments, expenses])
  const options = periodOptions(first, today)
  const period = useMemo(() => periodRange(periodValue, new Date(), first), [periodValue, first])
  const periodLabel = options.find((o) => o.value === periodValue)?.label || ''
  const summary = useMemo(() => financeSummary({ clients, payments, expenses, period }), [clients, payments, expenses, period])
  const ranking = useMemo(() => clientRanking({ clients, payments, expenses }), [clients, payments, expenses])
  const forecastRows = useMemo(() => forecast({ clients, expenses }), [clients, expenses])
  const monthlyCost = useMemo(() => averageMonthlyCost(expenses), [expenses])
  const inPeriod = (iso) => iso && iso.slice(0, 7) >= period.start && iso.slice(0, 7) <= period.end
  const periodExpenses = expenses.filter((e) => inPeriod(e.spentOn))
  const nameOf = (id) => (id ? clients.find((c) => c.companyId === id)?.name || 'Cliente' : '')
  const cur = currentMonth(today)

  const chart = summary.byMonth.map((m) => ({
    label: shortMonth(m.month),
    title: monthLabel(m.month),
    values: [m.expected, m.received || 0],
  }))
  const tableMonths = summary.byMonth.filter((m) => !summary.firstMonth || m.month >= summary.firstMonth)
  const elapsed = summary.byMonth.filter((m) => m.received !== null)
  const total = (key) => elapsed.reduce((t, m) => t + (m[key] || 0), 0)

  async function exportPdf() {
    setExporting(true)
    try {
      await exportFinancePdf({ periodLabel, period, summary, ranking, forecastRows, expenses: periodExpenses, clients })
    } catch (err) {
      setError(err.message || 'Não foi possível gerar o PDF.')
    } finally {
      setExporting(false)
    }
  }

  // Planilha para o contador: recebimentos e despesas do período
  function exportSheet() {
    const rows = [
      ...payments
        .filter((p) => inPeriod(p.paidOn))
        .map((p) => ({ date: p.paidOn, type: 'Recebimento', client: nameOf(p.companyId), text: `Mensalidade de ${monthLabel(p.referenceMonth.slice(0, 7)).toLowerCase()}`, kind: p.method || 'Não informada', in: p.amount, out: 0 })),
      ...periodExpenses.map((e) => ({ date: e.spentOn, type: 'Despesa', client: nameOf(e.companyId), text: e.description, kind: categoryLabel(e.category), in: 0, out: e.amount })),
    ].sort((a, b) => a.date.localeCompare(b.date))
    const fmt = (n) => (n ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')
    downloadCsv(
      `financeiro-${period.start}-a-${period.end}.csv`,
      [
        { label: 'Data', value: (r) => dateBR(r.date) },
        { label: 'Tipo', value: (r) => r.type },
        { label: 'Cliente', value: (r) => r.client },
        { label: 'Descrição', value: (r) => r.text },
        { label: 'Forma / categoria', value: (r) => r.kind },
        { label: 'Entrada (R$)', value: (r) => fmt(r.in) },
        { label: 'Saída (R$)', value: (r) => fmt(r.out) },
      ],
      rows
    )
  }

  async function submitExpense(e) {
    e.preventDefault()
    const amount = parseMoneyBR(form.amount)
    const problem = !form.spentOn
      ? 'Informe a data da despesa (dd/mm/aaaa).'
      : !form.description.trim()
        ? 'Descreva a despesa.'
        : !amount || amount <= 0
          ? 'Informe o valor.'
          : ''
    if (problem) {
      setFormError(problem)
      return
    }
    setSaving(true)
    setFormError('')
    try {
      await saveExpense({ ...form, amount })
      setMsg(form.id ? 'Despesa atualizada.' : 'Despesa lançada.')
      setForm({ ...EMPTY_EXPENSE, spentOn: todayISO() })
      setExpenses(await fetchExpenses())
    } catch (err) {
      setFormError(err.message || 'Não foi possível salvar a despesa.')
    } finally {
      setSaving(false)
    }
  }

  function editExpense(x) {
    setMsg('')
    setFormError('')
    setForm({ ...x, companyId: x.companyId || '', amount: formatMoneyInput(x.amount) })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function removeExpense(x) {
    if (!(await confirm(`Excluir a despesa "${x.description}" (${money(x.amount)})?`, { title: 'Excluir despesa', confirmLabel: 'Excluir' }))) return
    try {
      await deleteExpense(x.id)
      setExpenses(await fetchExpenses())
    } catch (err) {
      setError(err.message || 'Não foi possível excluir.')
    }
  }

  const g = summary.growth
  const avgHint = summary.avgIsPartial
    ? 'só o mês atual até agora'
    : summary.avgMonthsCount
      ? `média de ${plural(summary.avgMonthsCount, 'mês completo', 'meses completos')}`
      : 'sem recebimentos ainda'

  return (
    <div className="admin-page platform-page">
      <div className="admin-page-head">
        <div>
          <h1>Financeiro</h1>
          <p>Financeiro da WB.Dev: o que entrou, o que falta receber, despesas e lucro.</p>
        </div>
        <div className="admin-row-actions">
          <select value={periodValue} onChange={(e) => setPeriodValue(e.target.value)} aria-label="Período">
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-outline" onClick={exportPdf} disabled={exporting || loading}>
            <FileDown size={15} /> {exporting ? 'Gerando…' : 'PDF'}
          </button>
          <button type="button" className="btn btn-outline" onClick={exportSheet} disabled={loading}>
            <FileSpreadsheet size={15} /> Planilha
          </button>
          <button type="button" className="btn btn-outline" onClick={load} aria-label="Atualizar">
            <RefreshCcw size={15} />
          </button>
        </div>
      </div>

      <nav className="client-sections" aria-label="Seções do financeiro">
        {SECTIONS.map((s) => (
          <button key={s.key} type="button" className={section === s.key ? 'is-active' : ''} onClick={() => setSection(s.key)}>
            {s.label}
          </button>
        ))}
      </nav>

      {error && <p className="admin-error">{error}</p>}

      {loading && clients.length === 0 ? (
        <p className="admin-muted">Carregando…</p>
      ) : (
        <>
          {section === 'resumo' && (
            <>
              <div className="platform-kpis finance-kpis">
                <div className="platform-kpi">
                  <span>Recebido no período</span>
                  <strong>{money(summary.received)}</strong>
                  <small>{plural(summary.receivedCount, 'pagamento', 'pagamentos')}</small>
                </div>
                <div className="platform-kpi">
                  <span>A receber agora</span>
                  <strong>{money(summary.receivable.total)}</strong>
                  <small>
                    {money(summary.receivable.overdue)} em atraso · {money(summary.receivable.dueThisMonth)} vence este mês
                  </small>
                </div>
                <div className="platform-kpi">
                  <span>Média de faturamento mensal</span>
                  <strong>{money(summary.avgMonthly)}</strong>
                  <small>{avgHint}</small>
                </div>
                <div className="platform-kpi">
                  <span>Lucro do período</span>
                  <strong className={summary.profit < 0 ? 'is-negative' : ''}>{money(summary.profit)}</strong>
                  <small>
                    despesas {money(summary.costs)}
                    {summary.margin !== null ? ` · margem ${summary.margin}%` : ''}
                  </small>
                </div>
                <div className="platform-kpi">
                  <span>Receita mensal prevista</span>
                  <strong>{money(summary.mrr)}</strong>
                  <small>{money(summary.arr)} por ano</small>
                </div>
                <div className="platform-kpi">
                  <span>Ticket médio</span>
                  <strong>{money(summary.ticket)}</strong>
                  <small>{plural(summary.clientsCharged, 'cliente cobrado', 'clientes cobrados')}</small>
                </div>
                <div className="platform-kpi">
                  <span>Melhor mês</span>
                  <strong>{summary.best ? money(summary.best.received) : '—'}</strong>
                  <small>{summary.best ? monthLabel(summary.best.month) : 'sem recebimentos no período'}</small>
                </div>
                <div className="platform-kpi">
                  <span>Crescimento</span>
                  <strong className={g.pct < 0 ? 'is-negative' : ''}>{g.pct === null ? '—' : `${g.pct > 0 ? '+' : ''}${g.pct}%`}</strong>
                  <small>
                    {monthLabel(g.month).split(' ')[0].toLowerCase()} x {monthLabel(g.previous).split(' ')[0].toLowerCase()}
                    {g.pct === null ? ' (sem base para comparar)' : ''}
                  </small>
                </div>
              </div>

              <div className="chart-card platform-billing-chart">
                <h3>Previsto x recebido por mês</h3>
                <GroupedBarChart
                  data={chart}
                  series={[
                    { label: 'Previsto', color: '#c9d4f2' },
                    { label: 'Recebido', color: '#2446c8' },
                  ]}
                  formatValue={(v) => money(v)}
                />
              </div>

              <h2 className="admin-section-title">Mês a mês</h2>
              <div className="admin-table-wrap">
                <table className="admin-table finance-table">
                  <thead>
                    <tr>
                      <th>Mês</th>
                      <th>Previsto</th>
                      <th>Recebido</th>
                      <th>Despesas</th>
                      <th>Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableMonths.map((m) => (
                      <tr key={m.month} className={m.month > cur ? 'is-future' : ''}>
                        <td>{monthLabel(m.month)}</td>
                        <td>{money(m.expected)}</td>
                        <td>{dash(m.received)}</td>
                        <td>{dash(m.expenses)}</td>
                        <td className={m.result < 0 ? 'is-negative' : ''}>{dash(m.result)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total até hoje</td>
                      <td>{money(total('expected'))}</td>
                      <td>{money(total('received'))}</td>
                      <td>{money(total('expenses'))}</td>
                      <td className={total('result') < 0 ? 'is-negative' : ''}>{money(total('result'))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="admin-form-note">"Recebido" conta pela data do pagamento. O previsto usa as mensalidades de hoje de cada cliente, desde o primeiro mês cobrado.</p>

              <div className="finance-grid">
                <div className="chart-card">
                  <h3>Por forma de pagamento</h3>
                  <HBarChart
                    data={summary.byMethod.map((m) => ({ key: m.key, label: m.label, value: m.value, sub: `${m.pct}% do recebido` }))}
                    formatValue={money}
                    color="#2446c8"
                    emptyLabel="Nenhum pagamento no período."
                  />
                </div>
                <div className="chart-card">
                  <h3>Despesas por categoria</h3>
                  <HBarChart
                    data={summary.byCategory.map((c) => ({ key: c.key, label: c.label, value: c.value, sub: `${c.pct}% das despesas` }))}
                    formatValue={money}
                    color="#c2453a"
                    emptyLabel="Nenhuma despesa no período."
                  />
                </div>
              </div>

              <h2 className="admin-section-title">Previsão</h2>
              <div className="admin-table-wrap">
                <table className="admin-table finance-table">
                  <thead>
                    <tr>
                      <th>Próximos meses</th>
                      <th>Receita prevista</th>
                      <th>Despesas (média)</th>
                      <th>Lucro previsto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecastRows.map((f) => (
                      <tr key={f.months}>
                        <td>
                          {f.months} meses <small className="admin-muted">({shortMonth(f.from)}/{f.from.slice(2, 4)} a {shortMonth(f.to)}/{f.to.slice(2, 4)})</small>
                        </td>
                        <td>{money(f.revenue)}</td>
                        <td>{money(f.costs)}</td>
                        <td className={f.profit < 0 ? 'is-negative' : ''}>{money(f.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="admin-form-note">
                Com os clientes e as mensalidades de hoje, a partir do mês que vem. Despesa média de {money(monthlyCost)} por mês (últimos 12 meses com
                despesas lançadas).
              </p>
            </>
          )}

          {section === 'clientes' && (
            <>
              {ranking.length === 0 ? (
                <p className="admin-muted">Nenhum cliente ainda.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table finance-table">
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Situação</th>
                        <th>Mensalidade</th>
                        <th>Cliente desde</th>
                        <th>Total pago</th>
                        <th>Média/mês</th>
                        <th>Em aberto</th>
                        <th>Despesas</th>
                        <th>Sobra</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranking.map((r) => (
                        <tr key={r.companyId}>
                          <td>
                            <Link to={`/wbdev/clientes/${r.slug}`}>{r.name}</Link>
                          </td>
                          <td>{r.billing ? <BillingPill billing={r.billing} /> : '—'}</td>
                          <td>{r.price ? money(r.price) : '—'}</td>
                          <td>{r.since ? `${shortMonth(r.since)}/${r.since.slice(2, 4)}` : '—'}</td>
                          <td>
                            <strong>{money(r.totalPaid)}</strong>
                            {r.monthsPaid > 0 && <small className="admin-muted"> · {plural(r.monthsPaid, 'mês', 'meses')}</small>}
                          </td>
                          <td>{r.monthsAsClient ? money(r.avgMonthly) : '—'}</td>
                          <td className={r.openTotal > 0 ? 'is-negative' : ''}>{r.openTotal ? money(r.openTotal) : '—'}</td>
                          <td>{r.costs ? money(r.costs) : '—'}</td>
                          <td className={r.net < 0 ? 'is-negative' : ''}>{money(r.net)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="admin-form-note">
                Desde o início, sem depender do período escolhido. "Sobra" é o total pago menos as despesas ligadas ao cliente (ex.: o domínio dele).
              </p>
            </>
          )}

          {section === 'despesas' && (
            <>
              <form className="admin-form admin-form-section" onSubmit={submitExpense}>
                <h2>{form.id ? 'Editar despesa' : 'Nova despesa'}</h2>
                <div className="admin-form-grid admin-form-grid-3">
                  <label>
                    Data
                    <DateInputBR value={form.spentOn} onChange={(v) => setForm((f) => ({ ...f, spentOn: v }))} required />
                  </label>
                  <label>
                    Descrição
                    <input
                      value={form.description}
                      maxLength={120}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      placeholder="Ex.: Hospedagem Hostinger (ano)"
                      required
                    />
                  </label>
                  <label>
                    Valor
                    <MoneyInput cents value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} placeholder="0,00" required />
                  </label>
                  <label>
                    Categoria
                    <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Cliente (opcional)
                    <select value={form.companyId} onChange={(e) => setForm((f) => ({ ...f, companyId: e.target.value }))}>
                      <option value="">Geral (não é de um cliente)</option>
                      {clients.map((c) => (
                        <option key={c.companyId} value={c.companyId}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Observação (opcional)
                    <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
                  </label>
                </div>
                {formError && <p className="admin-error">{formError}</p>}
                {msg && <p className="admin-success">{msg}</p>}
                <div className="admin-form-actions">
                  {form.id && (
                    <button type="button" className="btn btn-outline" onClick={() => setForm({ ...EMPTY_EXPENSE, spentOn: todayISO() })}>
                      Cancelar edição
                    </button>
                  )}
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? 'Salvando…' : form.id ? 'Salvar despesa' : 'Lançar despesa'}
                  </button>
                </div>
              </form>

              <h2 className="admin-section-title">Despesas · {periodLabel.toLowerCase()}</h2>
              {periodExpenses.length === 0 ? (
                <p className="admin-muted">Nenhuma despesa lançada neste período.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table finance-table">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Descrição</th>
                        <th>Categoria</th>
                        <th>Cliente</th>
                        <th>Valor</th>
                        <th aria-label="Ações" />
                      </tr>
                    </thead>
                    <tbody>
                      {periodExpenses.map((x) => (
                        <tr key={x.id}>
                          <td>{dateBR(x.spentOn)}</td>
                          <td>
                            {x.description}
                            {x.notes && <small className="admin-muted"> · {x.notes}</small>}
                          </td>
                          <td>{categoryLabel(x.category)}</td>
                          <td>{nameOf(x.companyId) || '—'}</td>
                          <td>{money(x.amount)}</td>
                          <td>
                            <div className="admin-row-actions">
                              <button type="button" className="admin-action-btn" onClick={() => editExpense(x)}>
                                <Pencil size={14} /> Editar
                              </button>
                              <button type="button" className="admin-action-btn admin-action-danger" onClick={() => removeExpense(x)} aria-label="Excluir">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4}>Total do período</td>
                        <td>{money(summary.costs)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
      {confirmDialog}
    </div>
  )
}
