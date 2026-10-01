import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCcw, AlertTriangle, Clock, Wallet, ImageOff, FileWarning, ClipboardList, Landmark, HandCoins, Bookmark, BellRing, CircleDollarSign } from 'lucide-react'
import { fetchOverdueInstallments, fetchUpcomingInstallments } from '../lib/financingApi.js'
import { fetchContractsAdmin } from '../lib/contractsApi.js'
import { fetchCustomerDocuments } from '../lib/customerDocumentsApi.js'
import { fetchExternalFinancings } from '../lib/externalFinancingApi.js'
import { fetchReservations } from '../lib/reservationsApi.js'
import { stockGaps, saleGaps, externalGaps, unpaidCommissions, reservationGaps, RECENT_SALES_DAYS } from '../utils/dashboardAlerts.js'
import { transferAlert } from '../utils/transfer.js'
import { fetchAllCarsAdmin } from '../lib/carsApi.js'
import { fetchAllExpensesAdmin } from '../lib/expensesApi.js'
import { fetchAllSuppliers } from '../lib/suppliersApi.js'
import { fetchSales, effectiveSalePrice, effectiveSaleDate } from '../lib/salesApi.js'
import { fetchSellers } from '../lib/sellersApi.js'
import { expenseCategoryLabel, formatCurrency, formatCurrencyCents, daysInStock } from '../utils/carFormat.js'
import { periodRange, inRange } from '../utils/period.js'
import BarChart from '../components/charts/BarChart.jsx'
import DonutChart from '../components/charts/DonutChart.jsx'
import HBarChart from '../components/charts/HBarChart.jsx'
import PeriodFilter from './PeriodFilter.jsx'
import PendencyList from './PendencyList.jsx'
import useCustomerPendencies from './useCustomerPendencies.js'
import { PENDENCY_TABS } from '../utils/panelSettings.js'
import { useAuth } from '../context/AuthContext.jsx'
import { fetchSiteVisitTotals, fetchDailyVisits, fetchCarViewTotals } from '../lib/statsApi.js'
import './admin.css'

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const CATEGORY_COLORS = ['#0ea0db', '#1c9b56', '#f5a623', '#e0392c', '#7b61ff', '#00b3a4', '#8a94a6', '#d4418e']

// Admin vê tudo. Gerente: nunca vê gastos nem investimento no estoque; os
// valores das vendas (faturamento, comissões) só se o admin liberou — senão
// o Dashboard dele mostra só quantidades.
export default function AdminDashboard() {
  const { isAdmin, canSeeCosts, canSeeSaleValues, canManageCustomerFinance, isTabHidden, isBlockHidden } = useAuth()
  const show = (block) => !isBlockHidden(block)
  const [cars, setCars] = useState([])
  const [expenses, setExpenses] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [sales, setSales] = useState([])
  const [sellers, setSellers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState('mes')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [dailyVisits, setDailyVisits] = useState([])
  const [visitTotals, setVisitTotals] = useState({ visits: 0, visitors: 0 })
  const [carViews, setCarViews] = useState({})
  const [overdueInstallments, setOverdueInstallments] = useState([])
  // Pendências: carregadas à parte (se falharem, o resto do Dashboard continua)
  const [contracts, setContracts] = useState([])
  const [customerDocs, setCustomerDocs] = useState([])
  const [externals, setExternals] = useState([])
  const [reservations, setReservations] = useState([])
  const [upcomingInstallments, setUpcomingInstallments] = useState([])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [carsData, expensesData, suppliersData, salesData, sellersData] = await Promise.all([
        fetchAllCarsAdmin(),
        canSeeCosts ? fetchAllExpensesAdmin() : Promise.resolve([]),
        canSeeCosts ? fetchAllSuppliers() : Promise.resolve([]),
        fetchSales(),
        fetchSellers(),
      ])
      setCars(carsData)
      setExpenses(expensesData)
      setSuppliers(suppliersData)
      setSales(salesData)
      setSellers(sellersData)
      // Visitas: se falhar, o resto do Dashboard continua funcionando
      fetchDailyVisits(14).then(setDailyVisits).catch(() => setDailyVisits([]))
      if (canManageCustomerFinance) {
        fetchOverdueInstallments().then(setOverdueInstallments).catch(() => setOverdueInstallments([]))
        fetchUpcomingInstallments(7).then(setUpcomingInstallments).catch(() => setUpcomingInstallments([]))
      }
      fetchContractsAdmin().then(setContracts).catch(() => setContracts([]))
      fetchCustomerDocuments().then(setCustomerDocs).catch(() => setCustomerDocs([]))
      fetchExternalFinancings().then(setExternals).catch(() => setExternals([]))
      fetchReservations().then(setReservations).catch(() => setReservations([]))
    } catch (err) {
      setError(err.message || 'Erro ao carregar o dashboard.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const range = periodRange(period, customStart, customEnd)

  // Visitas do site e visualizações por carro no período escolhido
  useEffect(() => {
    let cancelled = false
    Promise.all([fetchSiteVisitTotals(range.start, range.end), fetchCarViewTotals(range.start, range.end)])
      .then(([totals, views]) => {
        if (cancelled) return
        setVisitTotals(totals)
        setCarViews(views)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [range.start, range.end])

  const salesByCar = useMemo(() => {
    const map = {}
    for (const s of sales) map[s.carId] = s
    return map
  }, [sales])

  // Toda venda (carro vendido), com valor e data efetivos — inclui vendas
  // antigas sem registro (usa preço anunciado e data de venda do carro).
  const soldEntries = useMemo(
    () =>
      cars
        .filter((c) => c.status === 'vendido')
        .map((car) => {
          const sale = salesByCar[car.id] || null
          return { car, sale, price: effectiveSalePrice(car, sale), date: effectiveSaleDate(car, sale) }
        }),
    [cars, salesByCar]
  )

  const periodEntries = useMemo(
    () => soldEntries.filter((e) => inRange(e.date, { start: range.start, end: range.end })),
    [soldEntries, range.start, range.end]
  )
  const periodRevenue = periodEntries.reduce((sum, e) => sum + (e.price || 0), 0)
  const periodCommission = periodEntries.reduce((sum, e) => sum + (e.sale?.commissionAmount || 0), 0)

  const expensesByCar = useMemo(() => {
    const map = {}
    for (const e of expenses) map[e.carId] = (map[e.carId] || 0) + e.amount
    return map
  }, [expenses])

  const availableCars = cars.filter((c) => c.status === 'disponivel')
  const investedAvailable = availableCars.reduce((sum, c) => sum + (c.purchasePrice || 0) + (expensesByCar[c.id] || 0), 0)
  const avgDaysInStock = availableCars.length
    ? Math.round(availableCars.reduce((sum, c) => sum + daysInStock(c), 0) / availableCars.length)
    : 0
  const periodExpenses = useMemo(
    () => expenses.filter((e) => inRange(e.expenseDate, { start: range.start, end: range.end })),
    [expenses, range.start, range.end]
  )
  const periodExpensesTotal = periodExpenses.reduce((sum, e) => sum + e.amount, 0)

  const statusData = useMemo(() => {
    const counts = { disponivel: 0, manutencao: 0, reservado: 0, vendido: 0 }
    for (const car of cars) counts[car.status] = (counts[car.status] || 0) + 1
    return [
      { label: 'Disponível', value: counts.disponivel, color: 'var(--color-success)' },
      { label: 'Em manutenção', value: counts.manutencao, color: '#f5a623' },
      { label: 'Reservado', value: counts.reservado, color: '#7b61ff' },
      { label: 'Vendido', value: counts.vendido, color: 'var(--color-text-muted)' },
    ]
  }, [cars])

  const monthlyRevenue = useMemo(() => {
    const now = new Date()
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({ year: d.getFullYear(), monthIdx: d.getMonth(), label: MONTH_LABELS[d.getMonth()], value: 0 })
    }
    for (const e of soldEntries) {
      if (!e.date) continue
      const [y, m] = e.date.split('-').map(Number)
      const match = months.find((mo) => mo.year === y && mo.monthIdx === m - 1)
      if (match) match.value += e.price || 0
    }
    return months
  }, [soldEntries])

  const monthlySalesCount = monthlyRevenue.map((m) => ({
    label: m.label,
    value: soldEntries.filter((e) => {
      if (!e.date) return false
      const [y, mo] = e.date.split('-').map(Number)
      return y === m.year && mo - 1 === m.monthIdx
    }).length,
  }))

  const bySeller = useMemo(() => {
    const map = {}
    for (const e of periodEntries) {
      const key = e.sale?.sellerId || 'loja'
      if (!map[key]) map[key] = { revenue: 0, count: 0, commission: 0 }
      map[key].revenue += e.price || 0
      map[key].count += 1
      map[key].commission += e.sale?.commissionAmount || 0
    }
    return Object.entries(map)
      .map(([key, v]) => ({
        key,
        label: key === 'loja' ? 'Sem vendedor / venda direta' : sellers.find((s) => s.id === key)?.name || 'Vendedor removido',
        value: canSeeSaleValues ? v.revenue : v.count,
        sub: canSeeSaleValues
          ? `${v.count} ${v.count === 1 ? 'venda' : 'vendas'}${v.commission ? ` · comissão ${formatCurrencyCents(v.commission)}` : ''}`
          : '',
      }))
      .sort((a, b) => b.value - a.value)
  }, [periodEntries, sellers, canSeeSaleValues])

  const byCategory = useMemo(() => {
    const map = {}
    for (const e of periodExpenses) map[e.category] = (map[e.category] || 0) + e.amount
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([slug, amount], i) => ({ label: expenseCategoryLabel(slug), value: amount, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }))
  }, [periodExpenses])

  const bySupplier = useMemo(() => {
    const map = {}
    for (const e of periodExpenses) {
      if (!e.supplierId) continue
      map[e.supplierId] = (map[e.supplierId] || 0) + e.amount
    }
    return Object.entries(map)
      .map(([id, amount]) => ({ key: id, label: suppliers.find((s) => s.id === id)?.name || 'Fornecedor removido', value: amount }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [periodExpenses, suppliers])

  const topViewed = cars
    .filter((car) => carViews[car.id]?.views)
    .map((car) => {
      const v = carViews[car.id]
      const days = daysInStock(car)
      return {
        key: car.id,
        label: `${car.brand} ${car.model}`,
        value: v.views,
        sub: `${v.viewers} ${v.viewers === 1 ? 'pessoa' : 'pessoas'} · ${car.status === 'vendido' ? 'vendido' : `${days} ${days === 1 ? 'dia' : 'dias'} em estoque`}`,
      }
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)

  // Pós-venda: transferências para acompanhar e parcelas de clientes em atraso
  const overdueTransfers = sales.filter((s) => transferAlert(s) === 'atrasada').length
  const dueSoonTransfers = sales.filter((s) => transferAlert(s) === 'vence_logo').length
  const overdueInstallmentsTotal = overdueInstallments.reduce((sum, i) => sum + i.amount, 0)

  const customerPendencies = useCustomerPendencies(cars)

  // Pendências com a contagem de cada uma (0 = nada pendente). Avisos de abas
  // escondidas em Configurações não aparecem.
  const pendencies = (() => {
    const stock = stockGaps(cars)
    const salesGap = saleGaps({ sales, cars, contracts, docs: customerDocs })
    const ext = externalGaps(externals)
    const unpaid = unpaidCommissions(sales, externals)
    const res = reservationGaps(reservations)
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
    const items = [
      { key: 'res-exp', count: res.expired, danger: true, icon: Bookmark, to: '/admin/vendas', cta: 'Resolver', text: `${plural(res.expired, 'reserva passou', 'reservas passaram')} do prazo — converta em venda ou cancele.` },
      { key: 'res-soon', count: res.dueSoon, icon: Bookmark, to: '/admin/vendas', cta: 'Ver', text: `${plural(res.dueSoon, 'reserva vence', 'reservas vencem')} em até 2 dias.` },
      { key: 'inst-soon', count: upcomingInstallments.length, icon: BellRing, to: '/admin/financeiro/clientes', cta: 'Lembrar', text: `${plural(upcomingInstallments.length, 'parcela de cliente vence', 'parcelas de clientes vencem')} nos próximos 7 dias.` },
      { key: 'ext-stale', count: ext.staleAnalysis, icon: Landmark, to: '/admin/financiamentos-externos', cta: 'Ver', text: `${plural(ext.staleAnalysis, 'financiamento externo está', 'financiamentos externos estão')} em análise há mais de 7 dias.` },
      { key: 'ext-approved', count: ext.approvedUnpaid, icon: CircleDollarSign, to: '/admin/financiamentos-externos', cta: 'Ver', text: `${plural(ext.approvedUnpaid, 'financiamento externo aprovado aguarda', 'financiamentos externos aprovados aguardam')} o pagamento do banco.` },
      { key: 'commissions', count: isAdmin ? unpaid.count : 0, icon: HandCoins, to: '/admin/equipe', cta: 'Pagar', text: `Comissões a pagar: ${formatCurrencyCents(unpaid.amount)} (${plural(unpaid.count, 'venda ou financiamento', 'vendas ou financiamentos')}).` },
      ...customerPendencies,
      { key: 'sale-customer', count: salesGap.noCustomer, icon: ClipboardList, to: '/admin/vendas', cta: 'Completar', text: `${plural(salesGap.noCustomer, 'venda', 'vendas')} dos últimos ${RECENT_SALES_DAYS} dias sem cliente vinculado.` },
      { key: 'sale-contract', count: salesGap.noContract, icon: FileWarning, to: '/admin/vendas', cta: 'Completar', text: `${plural(salesGap.noContract, 'venda', 'vendas')} dos últimos ${RECENT_SALES_DAYS} dias sem contrato ou documento anexado.` },
      { key: 'sale-checklist', count: salesGap.checklistIncomplete, icon: ClipboardList, to: '/admin/vendas', cta: 'Conferir', text: `${plural(salesGap.checklistIncomplete, 'venda', 'vendas')} com checklist de entrega incompleto.` },
      { key: 'car-photo', count: stock.noPhoto, icon: ImageOff, to: '/admin/estoque', cta: 'Completar', text: `${plural(stock.noPhoto, 'carro em estoque', 'carros em estoque')} sem foto.` },
      { key: 'car-price', count: stock.noPrice, icon: CircleDollarSign, to: '/admin/estoque', cta: 'Ver', text: `${plural(stock.noPrice, 'carro em estoque', 'carros em estoque')} sem preço (aparece "Consulte o valor").` },
      { key: 'car-docs', count: stock.noDocs, icon: FileWarning, to: '/admin/estoque', cta: 'Anexar', text: `${plural(stock.noDocs, 'carro em estoque', 'carros em estoque')} sem documento anexado (CRLV, laudo).` },
    ]
    return items.filter((item) => !isTabHidden(PENDENCY_TABS[item.key]))
  })()

  if (loading) return <p className="admin-muted">Carregando…</p>

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1>Dashboard</h1>
          <p>{canSeeCosts ? 'Visão geral de vendas, estoque e gastos' : 'Visão geral de vendas e estoque'}</p>
        </div>
        <div className="admin-row-actions">
          <PeriodFilter
            period={period}
            onPeriodChange={setPeriod}
            customStart={customStart}
            customEnd={customEnd}
            onCustomStartChange={setCustomStart}
            onCustomEndChange={setCustomEnd}
          />
          <button type="button" className="btn btn-outline" onClick={load}>
            <RefreshCcw size={15} /> Atualizar
          </button>
        </div>
      </div>

      {error && <p className="admin-error">{error}</p>}

      {show('alerts') && (overdueTransfers > 0 || dueSoonTransfers > 0 || overdueInstallments.length > 0) && (
        <div className="admin-alert-list">
          {overdueTransfers > 0 && (
            <Link to="/admin/vendas?filtro=atrasadas" className="admin-alert-item is-danger">
              <AlertTriangle size={18} />
              <span>
                {overdueTransfers} {overdueTransfers === 1 ? 'transferência de veículo passou' : 'transferências de veículo passaram'} do
                prazo — o carro pode continuar no nome da loja.
              </span>
              <strong>Acompanhar</strong>
            </Link>
          )}
          {dueSoonTransfers > 0 && (
            <Link to="/admin/vendas?filtro=pendentes" className="admin-alert-item">
              <Clock size={18} />
              <span>
                {dueSoonTransfers} {dueSoonTransfers === 1 ? 'transferência vence' : 'transferências vencem'} nos próximos 7 dias.
              </span>
              <strong>Ver</strong>
            </Link>
          )}
          {overdueInstallments.length > 0 && (
            <Link to="/admin/financeiro/clientes?filtro=em_atraso" className="admin-alert-item is-danger">
              <Wallet size={18} />
              <span>
                {overdueInstallments.length} {overdueInstallments.length === 1 ? 'parcela de cliente em atraso' : 'parcelas de clientes em atraso'} (
                {formatCurrencyCents(overdueInstallmentsTotal)} sem multa e juros).
              </span>
              <strong>Cobrar</strong>
            </Link>
          )}
        </div>
      )}

      {show('pendencies') && <PendencyList items={pendencies} />}

      {show('stats') && (
      <div className="expense-summary">
        {canSeeSaleValues && (
          <div className="expense-summary-card">
            <span>Faturamento no período</span>
            <strong>{formatCurrency(periodRevenue)}</strong>
          </div>
        )}
        <div className="expense-summary-card">
          <span>Carros vendidos no período</span>
          <strong>{periodEntries.length}</strong>
        </div>
        {canSeeSaleValues && (
          <div className="expense-summary-card">
            <span>Comissões no período</span>
            <strong>{formatCurrencyCents(periodCommission)}</strong>
          </div>
        )}
        {canSeeCosts && (
          <div className="expense-summary-card">
            <span>Gastos no período</span>
            <strong>{formatCurrency(periodExpensesTotal)}</strong>
          </div>
        )}
        <div className="expense-summary-card">
          <span>Carros em estoque</span>
          <strong>{availableCars.length}</strong>
        </div>
        {canSeeCosts && (
          <div className="expense-summary-card">
            <span>Investido no estoque</span>
            <strong>{formatCurrency(investedAvailable)}</strong>
          </div>
        )}
        <div className="expense-summary-card">
          <span>Tempo médio em estoque</span>
          <strong>{availableCars.length ? `${avgDaysInStock} ${avgDaysInStock === 1 ? 'dia' : 'dias'}` : '—'}</strong>
        </div>
      </div>
      )}

      <div className="charts-grid charts-grid-3">
        {show('revenue6m') && canSeeSaleValues && (
          <div className="chart-card chart-card-wide">
            <h3>Faturamento dos últimos 6 meses</h3>
            <BarChart data={monthlyRevenue} formatValue={(v) => (v > 0 ? formatCurrency(v) : '—')} />
          </div>
        )}
        {show('salesByMonth') && !canSeeSaleValues && (
          <div className="chart-card chart-card-wide">
            <h3>Vendas por mês (quantidade)</h3>
            <BarChart data={monthlySalesCount} color="var(--color-success)" formatValue={(v) => (v > 0 ? v : '—')} />
          </div>
        )}
        {show('byStatus') && (
          <div className="chart-card">
            <h3>Carros por status</h3>
            <DonutChart data={statusData} />
          </div>
        )}
        {show('salesByMonth') && canSeeSaleValues && (
          <div className="chart-card">
            <h3>Vendas por mês (quantidade)</h3>
            <BarChart data={monthlySalesCount} color="var(--color-success)" formatValue={(v) => (v > 0 ? v : '—')} />
          </div>
        )}
        {show('bySeller') && (
          <div className="chart-card chart-card-wide">
            <h3>{canSeeSaleValues ? 'Faturamento por vendedor (período)' : 'Vendas por vendedor (período)'}</h3>
            <HBarChart
              data={bySeller}
              formatValue={canSeeSaleValues ? formatCurrency : (v) => `${v} ${v === 1 ? 'venda' : 'vendas'}`}
              emptyLabel="Nenhuma venda no período."
            />
          </div>
        )}
        {show('expensesByCategory') && canSeeCosts && (
          <div className="chart-card">
            <h3>Gastos por categoria (período)</h3>
            {byCategory.length ? (
              <DonutChart data={byCategory} formatValue={formatCurrency} />
            ) : (
              <p className="admin-muted">Nenhum gasto no período.</p>
            )}
          </div>
        )}
        {show('expensesBySupplier') && canSeeCosts && (
          <div className="chart-card chart-card-wide">
            <h3>Gastos por fornecedor (período)</h3>
            <HBarChart data={bySupplier} formatValue={formatCurrency} color="#f5a623" emptyLabel="Nenhum gasto com fornecedor no período." />
          </div>
        )}
      </div>

      {show('visits') && (
      <>
      <h2 className="admin-section-title">Visitas no site</h2>
      <div className="expense-summary">
        <div className="expense-summary-card">
          <span>Visitas no período</span>
          <strong>{visitTotals.visits.toLocaleString('pt-BR')}</strong>
        </div>
        <div className="expense-summary-card">
          <span>Visitantes no período</span>
          <strong>{visitTotals.visitors.toLocaleString('pt-BR')}</strong>
        </div>
        <div className="expense-summary-card">
          <span>Visitas hoje</span>
          <strong>{(dailyVisits[dailyVisits.length - 1]?.visits || 0).toLocaleString('pt-BR')}</strong>
        </div>
      </div>

      <div className="charts-grid charts-grid-3">
        <div className="chart-card chart-card-wide">
          <h3>Visitas por dia (últimos 14 dias)</h3>
          <BarChart
            data={dailyVisits.map((d) => ({ label: d.label, value: d.visits }))}
            color="#7b61ff"
            formatValue={(v) => (v > 0 ? v : '—')}
          />
        </div>
        <div className="chart-card">
          <h3>Carros mais vistos (período)</h3>
          <HBarChart
            data={topViewed}
            formatValue={(v) => `${v.toLocaleString('pt-BR')} ${v === 1 ? 'visualização' : 'visualizações'}`}
            color="#7b61ff"
            emptyLabel="Nenhuma visualização no período."
          />
        </div>
      </div>
      <p className="admin-form-hint">
        Visitas: cada acesso ao site (voltar em até 30 minutos conta como o mesmo acesso). Visitantes: pessoas diferentes em
        cada dia — quem volta em outro dia conta de novo. A equipe logada no painel não entra na contagem.
      </p>
      </>
      )}
    </div>
  )
}
