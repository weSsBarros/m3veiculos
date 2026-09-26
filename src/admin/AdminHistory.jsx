import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCcw } from 'lucide-react'
import { fetchAllCarsAdmin } from '../lib/carsApi.js'
import { fetchAllExpensesAdmin } from '../lib/expensesApi.js'
import { fetchContractsAdmin } from '../lib/contractsApi.js'
import { fetchSales } from '../lib/salesApi.js'
import { fetchSellers } from '../lib/sellersApi.js'
import { formatCurrency } from '../utils/carFormat.js'
import DateInputBR from '../components/DateInputBR.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import './admin.css'

const PERIODS = [
  { value: 'tudo', label: 'Todo o período' },
  { value: 'mes-atual', label: 'Este mês' },
  { value: 'mes-passado', label: 'Mês passado' },
  { value: 'ano-atual', label: 'Este ano' },
  { value: 'ano-passado', label: 'Ano passado' },
  { value: 'personalizado', label: 'Período personalizado' },
]

function formatDate(isoDateTime) {
  if (!isoDateTime) return '—'
  return new Date(isoDateTime).toLocaleDateString('pt-BR')
}

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date) {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

function getPeriodRange(preset, customStart, customEnd) {
  const now = new Date()
  if (preset === 'mes-atual') {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: endOfDay(now) }
  }
  if (preset === 'mes-passado') {
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
    }
  }
  if (preset === 'ano-atual') {
    return { start: new Date(now.getFullYear(), 0, 1), end: endOfDay(now) }
  }
  if (preset === 'ano-passado') {
    return {
      start: new Date(now.getFullYear() - 1, 0, 1),
      end: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999),
    }
  }
  if (preset === 'personalizado') {
    return {
      start: customStart ? startOfDay(new Date(`${customStart}T00:00:00`)) : null,
      end: customEnd ? endOfDay(new Date(`${customEnd}T00:00:00`)) : null,
    }
  }
  return { start: null, end: null }
}

function inRange(dateValue, start, end) {
  if (!dateValue) return false
  const d = new Date(dateValue.length <= 10 ? `${dateValue}T00:00:00` : dateValue)
  if (start && d < start) return false
  if (end && d > end) return false
  return true
}

function formatPeriodLabel(preset, start, end) {
  if (preset === 'tudo') return ''
  if (!start && !end) return 'Selecione o intervalo'
  const fmt = (d) => d.toLocaleDateString('pt-BR')
  if (start && end) return `${fmt(start)} a ${fmt(end)}`
  if (start) return `A partir de ${fmt(start)}`
  return `Até ${fmt(end)}`
}

export default function AdminHistory() {
  // Gerente: sem custo, gastos, margem e lucro; valores de venda só se o admin liberou
  const { canSeeCosts, canSeeSaleValues } = useAuth()
  const [cars, setCars] = useState([])
  const [expenses, setExpenses] = useState([])
  const [contractsCount, setContractsCount] = useState(0)
  const [sales, setSales] = useState([])
  const [sellers, setSellers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [preset, setPreset] = useState('tudo')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [carsData, expensesData, contractsData, salesData, sellersData] = await Promise.all([
        fetchAllCarsAdmin(),
        canSeeCosts ? fetchAllExpensesAdmin() : Promise.resolve([]),
        fetchContractsAdmin(),
        fetchSales(),
        fetchSellers(),
      ])
      setCars(carsData)
      setExpenses(expensesData)
      setContractsCount(contractsData.length)
      setSales(salesData)
      setSellers(sellersData)
    } catch (err) {
      setError(err.message || 'Erro ao carregar o histórico.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { start, end } = useMemo(() => getPeriodRange(preset, customStart, customEnd), [preset, customStart, customEnd])
  const periodLabel = formatPeriodLabel(preset, start, end)

  const expensesByCar = useMemo(() => {
    const map = {}
    for (const e of expenses) map[e.carId] = (map[e.carId] || 0) + e.amount
    return map
  }, [expenses])

  // Margem de cada carro usa o custo total (todos os gastos dele, sem filtro de
  // período) — é o lucro real daquela venda, não deve mudar conforme o filtro.
  // Valor e data da venda registrada (janela "Registrar venda"); carros
  // vendidos antes desse registro existir usam o preço anunciado.
  const allSoldCars = useMemo(() => {
    const salesByCar = {}
    for (const sale of sales) salesByCar[sale.carId] = sale
    return cars
      .filter((c) => c.status === 'vendido')
      .map((car) => {
        const sale = salesByCar[car.id] || null
        const revenue = sale ? sale.salePrice : car.price
        const soldDate = sale ? sale.saleDate : car.soldAt
        const sellerName = sale?.sellerId ? sellers.find((sl) => sl.id === sale.sellerId)?.name || '—' : sale ? 'Venda direta' : '—'
        const totalExpenses = expensesByCar[car.id] || 0
        const totalCost = (car.purchasePrice || 0) + totalExpenses
        const margin = car.purchasePrice && revenue != null ? revenue - totalCost : null
        return { car, totalCost, margin, revenue, soldDate, sellerName }
      })
      .sort((a, b) => new Date(b.soldDate || 0) - new Date(a.soldDate || 0))
  }, [cars, expensesByCar, sales, sellers])

  const periodActive = preset !== 'tudo'
  const soldCars = useMemo(
    () => (periodActive ? allSoldCars.filter((r) => inRange(r.soldDate, start, end)) : allSoldCars),
    [allSoldCars, periodActive, start, end]
  )

  // Gasto em manutenção do período: soma dos lançamentos feitos dentro do
  // intervalo, em qualquer carro (não só os vendidos nesse período).
  const periodExpenses = useMemo(
    () => (periodActive ? expenses.filter((e) => inRange(e.expenseDate, start, end)) : expenses),
    [expenses, periodActive, start, end]
  )

  const totalMaintenance = periodExpenses.reduce((sum, e) => sum + e.amount, 0)
  const totalProfit = soldCars.reduce((sum, r) => sum + (r.margin ?? 0), 0)
  const soldWithMargin = soldCars.filter((r) => r.margin !== null)
  const soldWithPrice = soldCars.filter((r) => r.revenue != null)
  const avgTicket = soldWithPrice.length ? soldWithPrice.reduce((sum, r) => sum + r.revenue, 0) / soldWithPrice.length : 0

  if (loading) return <p className="admin-muted">Carregando…</p>

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1>Histórico</h1>
          <p>{canSeeCosts ? 'Resumo de tudo que já foi vendido e gasto' : 'Resumo de tudo que já foi vendido'}</p>
        </div>
        <button type="button" className="btn btn-outline" onClick={load}>
          <RefreshCcw size={15} /> Atualizar
        </button>
      </div>

      {error && <p className="admin-error">{error}</p>}

      <div className="history-period-bar">
        <label>
          Período
          <select value={preset} onChange={(e) => setPreset(e.target.value)}>
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
        {preset === 'personalizado' && (
          <>
            <label>
              De
              <DateInputBR value={customStart} onChange={setCustomStart} />
            </label>
            <label>
              Até
              <DateInputBR value={customEnd} onChange={setCustomEnd} />
            </label>
          </>
        )}
        {periodLabel && <span className="history-period-label">{periodLabel}</span>}
      </div>

      <div className="expense-summary">
        <div className="expense-summary-card">
          <span>Carros vendidos</span>
          <strong>{soldCars.length}</strong>
        </div>
        {canSeeCosts && (
          <div className="expense-summary-card">
            <span>Gasto em manutenção {periodActive ? 'no período' : '(todos os carros)'}</span>
            <strong>{formatCurrency(totalMaintenance)}</strong>
          </div>
        )}
        {canSeeCosts && (
          <div className={`expense-summary-card ${totalProfit < 0 ? 'is-negative' : 'is-positive'}`}>
            <span>Lucro {periodActive ? 'no período' : 'total'} (carros vendidos)</span>
            <strong>{formatCurrency(totalProfit)}</strong>
          </div>
        )}
        {canSeeSaleValues && (
          <div className="expense-summary-card">
            <span>Ticket médio de venda</span>
            <strong>{soldWithPrice.length ? formatCurrency(Math.round(avgTicket)) : '—'}</strong>
          </div>
        )}
      </div>

      {canSeeCosts && soldCars.length !== soldWithMargin.length && (
        <p className="admin-form-hint">
          O lucro considera só os {soldWithMargin.length} de {soldCars.length} carros vendidos com "Preço de compra" preenchido. A margem de cada carro usa o custo total dele (não só os gastos do período selecionado).
        </p>
      )}

      <div className="admin-page-head">
        <h2 className="admin-section-title">Vendas</h2>
        <Link to="/admin/contratos" className="btn btn-outline">Contratos gerados: {contractsCount}</Link>
      </div>

      {soldCars.length === 0 ? (
        <p className="admin-muted">Nenhum carro vendido {periodActive ? 'nesse período.' : 'ainda.'}</p>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Carro</th>
                  <th>Vendido em</th>
                  <th>Vendedor</th>
                  {canSeeCosts && <th>Custo total</th>}
                  {canSeeSaleValues && <th>Valor da venda</th>}
                  {canSeeCosts && <th>Margem</th>}
                </tr>
              </thead>
              <tbody>
                {soldCars.map(({ car, totalCost, margin, revenue, soldDate, sellerName }) => (
                  <tr key={car.id}>
                    <td>
                      <strong>{car.brand} {car.model}</strong>
                      <span className="admin-table-sub">{car.version}</span>
                    </td>
                    <td>{formatDate(soldDate && soldDate.length <= 10 ? `${soldDate}T00:00:00` : soldDate)}</td>
                    <td>{sellerName}</td>
                    {canSeeCosts && <td>{car.purchasePrice ? formatCurrency(totalCost) : '—'}</td>}
                    {canSeeSaleValues && <td>{revenue != null ? formatCurrency(revenue) : '—'}</td>}
                    {canSeeCosts && (
                      <td className={margin === null ? '' : margin < 0 ? 'expense-margin-negative' : 'expense-margin-positive'}>
                        {margin === null ? '—' : formatCurrency(margin)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="admin-card-list">
            {soldCars.map(({ car, totalCost, margin, revenue, soldDate, sellerName }) => (
              <div className="admin-card" key={car.id}>
                <div className="admin-card-top">
                  <div className="admin-card-title">
                    <strong>{car.brand} {car.model}</strong>
                    <span className="admin-table-sub">{car.version}</span>
                    <span className="admin-card-meta">
                      Vendido em {formatDate(soldDate && soldDate.length <= 10 ? `${soldDate}T00:00:00` : soldDate)} · {sellerName}
                    </span>
                  </div>
                </div>
                {canSeeSaleValues && (
                  <div className="admin-card-stats">
                    {canSeeCosts && (
                      <div>
                        <span>Custo total</span>
                        <strong>{car.purchasePrice ? formatCurrency(totalCost) : '—'}</strong>
                      </div>
                    )}
                    <div>
                      <span>Valor da venda</span>
                      <strong>{revenue != null ? formatCurrency(revenue) : '—'}</strong>
                    </div>
                    {canSeeCosts && (
                      <div className={margin === null ? '' : margin < 0 ? 'expense-margin-negative' : 'expense-margin-positive'}>
                        <span>Margem</span>
                        <strong>{margin === null ? '—' : formatCurrency(margin)}</strong>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
