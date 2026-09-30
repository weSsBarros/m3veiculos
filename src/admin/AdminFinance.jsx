import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCcw, Download, Receipt } from 'lucide-react'
import { fetchAllCarsAdmin } from '../lib/carsApi.js'
import { fetchAllExpensesAdmin } from '../lib/expensesApi.js'
import { fetchAllSuppliers } from '../lib/suppliersApi.js'
import { fetchSales } from '../lib/salesApi.js'
import { expenseCategoryLabel, formatCurrency, carStatusLabel, daysInStock, isStockStale, slugify } from '../utils/carFormat.js'
import { fetchStockAlertDefault, DEFAULT_STOCK_ALERT_DAYS } from '../lib/companyApi.js'
import { downloadCsv } from '../utils/exportCsv.js'
import FinanceTabs from './FinanceTabs.jsx'
import './admin.css'

const ALL_CARS_VALUE = 'todos'

export default function AdminFinance() {
  const [cars, setCars] = useState([])
  const [expenses, setExpenses] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [sales, setSales] = useState([])
  const [alertDefault, setAlertDefault] = useState(DEFAULT_STOCK_ALERT_DAYS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exportCarId, setExportCarId] = useState(ALL_CARS_VALUE)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [carsData, expensesData, suppliersData, salesData] = await Promise.all([
        fetchAllCarsAdmin(),
        fetchAllExpensesAdmin(),
        fetchAllSuppliers(),
        fetchSales(),
      ])
      fetchStockAlertDefault().then(setAlertDefault)
      setCars(carsData)
      setExpenses(expensesData)
      setSuppliers(suppliersData)
      setSales(salesData)
    } catch (err) {
      setError(err.message || 'Erro ao carregar o painel.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const expensesByCar = useMemo(() => {
    const map = {}
    for (const e of expenses) map[e.carId] = (map[e.carId] || 0) + e.amount
    return map
  }, [expenses])

  const salesByCar = useMemo(() => {
    const map = {}
    for (const s of sales) map[s.carId] = s
    return map
  }, [sales])

  const rows = useMemo(
    () =>
      cars.map((car) => {
        const totalExpenses = expensesByCar[car.id] || 0
        const totalCost = (car.purchasePrice || 0) + totalExpenses
        const sale = salesByCar[car.id] || null
        // Vendido com venda registrada: margem real sobre o valor negociado
        const revenue = sale ? sale.salePrice : car.price
        const margin = revenue != null ? revenue - totalCost : null
        return { car, totalExpenses, totalCost, margin, sale, revenue }
      }),
    [cars, expensesByCar, salesByCar]
  )

  const availableRows = rows.filter((r) => r.car.status === 'disponivel')
  const availableRowsWithMargin = availableRows.filter((r) => r.margin != null)
  const totalInvestedAvailable = availableRows.reduce((sum, r) => sum + r.totalCost, 0)
  const avgMargin = availableRowsWithMargin.length
    ? availableRowsWithMargin.reduce((sum, r) => sum + r.margin, 0) / availableRowsWithMargin.length
    : 0
  const totalExpensesAll = expenses.reduce((sum, e) => sum + e.amount, 0)
  const avgDaysInStock = availableRows.length
    ? Math.round(availableRows.reduce((sum, r) => sum + daysInStock(r.car), 0) / availableRows.length)
    : 0

  const byCategory = useMemo(() => {
    const map = {}
    for (const e of expenses) map[e.category] = (map[e.category] || 0) + e.amount
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [expenses])

  const suppliersById = useMemo(() => {
    const map = {}
    for (const s of suppliers) map[s.id] = s
    return map
  }, [suppliers])

  const bySupplier = useMemo(() => {
    const map = {}
    for (const e of expenses) {
      if (!e.supplierId) continue
      map[e.supplierId] = (map[e.supplierId] || 0) + e.amount
    }
    return Object.entries(map)
      .map(([supplierId, amount]) => ({ supplierId, name: suppliersById[supplierId]?.name || 'Fornecedor removido', amount }))
      .sort((a, b) => b.amount - a.amount)
  }, [expenses, suppliersById])

  const carsById = useMemo(() => {
    const map = {}
    for (const c of cars) map[c.id] = c
    return map
  }, [cars])

  function handleExportExpenses() {
    const filtered = exportCarId === ALL_CARS_VALUE ? expenses : expenses.filter((e) => e.carId === exportCarId)
    if (filtered.length === 0) {
      alert('Nenhum gasto para exportar.')
      return
    }
    const columns = [
      { label: 'Carro', value: (e) => { const c = carsById[e.carId]; return c ? `${c.brand} ${c.model}` : '—' } },
      { label: 'Data', value: (e) => e.expenseDate },
      { label: 'Categoria', value: (e) => expenseCategoryLabel(e.category) },
      { label: 'Fornecedor', value: (e) => (e.supplierId ? suppliersById[e.supplierId]?.name || '—' : '—') },
      { label: 'Descrição', value: (e) => e.description },
      { label: 'Valor (R$)', value: (e) => e.amount },
    ]
    const filename = exportCarId === ALL_CARS_VALUE
      ? 'gastos-todos-os-carros.csv'
      : `gastos-${slugify(`${carsById[exportCarId]?.brand || ''} ${carsById[exportCarId]?.model || ''}`)}.csv`
    downloadCsv(filename, columns, filtered)
  }

  if (loading) return <><FinanceTabs /><p className="admin-muted">Carregando…</p></>

  return (
    <div className="admin-page">
      <FinanceTabs />
      <div className="admin-page-head">
        <div>
          <h1>Financeiro da loja</h1>
          <p>Custo, margem por carro e exportação de gastos (os gráficos estão no Dashboard)</p>
        </div>
        <div className="admin-row-actions">
          <select
            className="admin-export-select"
            value={exportCarId}
            onChange={(e) => setExportCarId(e.target.value)}
            aria-label="Carro para exportar"
          >
            <option value={ALL_CARS_VALUE}>Todos os carros</option>
            {cars.map((c) => (
              <option key={c.id} value={c.id}>{c.brand} {c.model}</option>
            ))}
          </select>
          <button type="button" className="btn btn-outline" onClick={handleExportExpenses}>
            <Download size={15} /> Exportar gastos (CSV)
          </button>
          <button type="button" className="btn btn-outline" onClick={load}>
            <RefreshCcw size={15} /> Atualizar
          </button>
        </div>
      </div>

      {error && <p className="admin-error">{error}</p>}

      <div className="expense-summary">
        <div className="expense-summary-card">
          <span>Investido no estoque disponível</span>
          <strong>{formatCurrency(totalInvestedAvailable)}</strong>
        </div>
        <div className="expense-summary-card">
          <span>Margem média (estoque disponível)</span>
          <strong>{formatCurrency(Math.round(avgMargin))}</strong>
        </div>
        <div className="expense-summary-card">
          <span>Total gasto (todos os carros)</span>
          <strong>{formatCurrency(totalExpensesAll)}</strong>
        </div>
        <div className="expense-summary-card">
          <span>Carros em estoque</span>
          <strong>{availableRows.length}</strong>
        </div>
        <div className="expense-summary-card">
          <span>Tempo médio em estoque</span>
          <strong>{availableRows.length ? `${avgDaysInStock} ${avgDaysInStock === 1 ? 'dia' : 'dias'}` : '—'}</strong>
        </div>
      </div>

      {byCategory.length > 0 && (
        <>
          <h2 className="admin-section-title">Gastos por categoria</h2>
          <div className="expense-categories">
            {byCategory.map(([slug, amount]) => (
              <span className="expense-category-chip" key={slug}>
                {expenseCategoryLabel(slug)} · {formatCurrency(amount)}
              </span>
            ))}
          </div>
        </>
      )}

      {bySupplier.length > 0 && (
        <>
          <h2 className="admin-section-title">Gastos por fornecedor</h2>
          <div className="expense-categories">
            {bySupplier.map(({ supplierId, name, amount }) => (
              <span className="expense-category-chip" key={supplierId}>
                {name} · {formatCurrency(amount)}
              </span>
            ))}
          </div>
        </>
      )}

      <h2 className="admin-section-title">Custo e margem por carro</h2>
      {rows.length === 0 ? (
        <p className="admin-muted">Nenhum carro cadastrado ainda.</p>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Carro</th>
                  <th>Status</th>
                  <th>Estoque</th>
                  <th>Custo total</th>
                  <th>Preço / valor da venda</th>
                  <th>Margem</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ car, totalCost, margin, sale, revenue }) => (
                  <tr key={car.id}>
                    <td>
                      <strong>{car.brand} {car.model}</strong>
                      <span className="admin-table-sub">{car.version}</span>
                    </td>
                    <td>{carStatusLabel(car.status)}</td>
                    <td className={isStockStale(car, alertDefault) ? 'stock-days-stale' : ''}>
                      {daysInStock(car)} {daysInStock(car) === 1 ? 'dia' : 'dias'}
                    </td>
                    <td>{formatCurrency(totalCost)}</td>
                    <td>
                      {revenue != null ? formatCurrency(revenue) : '—'}
                      {sale && <span className="admin-table-sub">valor da venda</span>}
                    </td>
                    <td className={margin == null ? '' : margin < 0 ? 'expense-margin-negative' : 'expense-margin-positive'}>
                      {margin != null ? formatCurrency(margin) : '—'}
                    </td>
                    <td>
                      <Link to={`/admin/carros/${car.id}/gastos`} className="admin-action-btn">
                        <Receipt size={15} /> Ver gastos
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="admin-card-list">
            {rows.map(({ car, totalCost, margin, sale, revenue }) => (
              <div className="admin-card" key={car.id}>
                <div className="admin-card-top">
                  <div className="admin-card-title">
                    <strong>{car.brand} {car.model}</strong>
                    <span className="admin-table-sub">{car.version}</span>
                  </div>
                  <span className={`admin-status-toggle status-${car.status}`}>
                    {carStatusLabel(car.status)}
                  </span>
                </div>

                <div className="admin-card-stats">
                  <div>
                    <span>Estoque</span>
                    <strong className={isStockStale(car, alertDefault) ? 'stock-days-stale' : ''}>
                      {daysInStock(car)} {daysInStock(car) === 1 ? 'dia' : 'dias'}
                    </strong>
                  </div>
                  <div>
                    <span>Custo total</span>
                    <strong>{formatCurrency(totalCost)}</strong>
                  </div>
                  <div>
                    <span>{sale ? 'Valor da venda' : 'Preço de venda'}</span>
                    <strong>{revenue != null ? formatCurrency(revenue) : '—'}</strong>
                  </div>
                  <div className={margin == null ? '' : margin < 0 ? 'expense-margin-negative' : 'expense-margin-positive'}>
                    <span>Margem</span>
                    <strong>{margin != null ? formatCurrency(margin) : '—'}</strong>
                  </div>
                </div>

                <div className="admin-card-actions">
                  <Link to={`/admin/carros/${car.id}/gastos`}>Ver gastos</Link>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
