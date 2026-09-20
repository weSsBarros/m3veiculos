import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCcw } from 'lucide-react'
import { fetchAllCarsAdmin } from '../lib/carsApi.js'
import { fetchAllExpensesAdmin } from '../lib/expensesApi.js'
import { fetchContractsAdmin } from '../lib/contractsApi.js'
import { formatCurrency } from '../utils/carFormat.js'
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
  const [cars, setCars] = useState([])
  const [expenses, setExpenses] = useState([])
  const [contractsCount, setContractsCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [preset, setPreset] = useState('tudo')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [carsData, expensesData, contractsData] = await Promise.all([
        fetchAllCarsAdmin(),
        fetchAllExpensesAdmin(),
        fetchContractsAdmin(),
      ])
      setCars(carsData)
      setExpenses(expensesData)
      setContractsCount(contractsData.length)
    } catch (err) {
      setError(err.message || 'Erro ao carregar o histórico.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
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
  const allSoldCars = useMemo(
    () =>
      cars
        .filter((c) => c.status === 'vendido')
        .map((car) => {
          const totalExpenses = expensesByCar[car.id] || 0
          const totalCost = (car.purchasePrice || 0) + totalExpenses
          const margin = car.purchasePrice ? car.price - totalCost : null
          return { car, totalCost, margin }
        })
        .sort((a, b) => new Date(b.car.soldAt || 0) - new Date(a.car.soldAt || 0)),
    [cars, expensesByCar]
  )

  const periodActive = preset !== 'tudo'
  const soldCars = useMemo(
    () => (periodActive ? allSoldCars.filter((r) => inRange(r.car.soldAt, start, end)) : allSoldCars),
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
  const avgTicket = soldCars.length ? soldCars.reduce((sum, r) => sum + r.car.price, 0) / soldCars.length : 0

  if (loading) return <p className="admin-muted">Carregando…</p>

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1>Histórico</h1>
          <p>Resumo de tudo que já foi vendido e gasto</p>
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
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            </label>
            <label>
              Até
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
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
        <div className="expense-summary-card">
          <span>Gasto em manutenção {periodActive ? 'no período' : '(todos os carros)'}</span>
          <strong>{formatCurrency(totalMaintenance)}</strong>
        </div>
        <div className={`expense-summary-card ${totalProfit < 0 ? 'is-negative' : 'is-positive'}`}>
          <span>Lucro {periodActive ? 'no período' : 'total'} (carros vendidos)</span>
          <strong>{formatCurrency(totalProfit)}</strong>
        </div>
        <div className="expense-summary-card">
          <span>Ticket médio de venda</span>
          <strong>{soldCars.length ? formatCurrency(Math.round(avgTicket)) : '—'}</strong>
        </div>
      </div>

      {soldCars.length !== soldWithMargin.length && (
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
                  <th>Custo total</th>
                  <th>Preço de venda</th>
                  <th>Margem</th>
                </tr>
              </thead>
              <tbody>
                {soldCars.map(({ car, totalCost, margin }) => (
                  <tr key={car.id}>
                    <td>
                      <strong>{car.brand} {car.model}</strong>
                      <span className="admin-table-sub">{car.version}</span>
                    </td>
                    <td>{formatDate(car.soldAt)}</td>
                    <td>{car.purchasePrice ? formatCurrency(totalCost) : '—'}</td>
                    <td>{formatCurrency(car.price)}</td>
                    <td className={margin === null ? '' : margin < 0 ? 'expense-margin-negative' : 'expense-margin-positive'}>
                      {margin === null ? '—' : formatCurrency(margin)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="admin-card-list">
            {soldCars.map(({ car, totalCost, margin }) => (
              <div className="admin-card" key={car.id}>
                <div className="admin-card-top">
                  <div className="admin-card-title">
                    <strong>{car.brand} {car.model}</strong>
                    <span className="admin-table-sub">{car.version}</span>
                    <span className="admin-card-meta">Vendido em {formatDate(car.soldAt)}</span>
                  </div>
                </div>
                <div className="admin-card-stats">
                  <div>
                    <span>Custo total</span>
                    <strong>{car.purchasePrice ? formatCurrency(totalCost) : '—'}</strong>
                  </div>
                  <div>
                    <span>Preço de venda</span>
                    <strong>{formatCurrency(car.price)}</strong>
                  </div>
                  <div className={margin === null ? '' : margin < 0 ? 'expense-margin-negative' : 'expense-margin-positive'}>
                    <span>Margem</span>
                    <strong>{margin === null ? '—' : formatCurrency(margin)}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
