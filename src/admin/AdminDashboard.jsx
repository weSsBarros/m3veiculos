import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCcw } from 'lucide-react'
import { fetchAllCarsAdmin } from '../lib/carsApi.js'
import { fetchAllExpensesAdmin } from '../lib/expensesApi.js'
import { expenseCategoryLabel, formatCurrency } from '../utils/carFormat.js'
import './admin.css'

export default function AdminDashboard() {
  const [cars, setCars] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [carsData, expensesData] = await Promise.all([fetchAllCarsAdmin(), fetchAllExpensesAdmin()])
      setCars(carsData)
      setExpenses(expensesData)
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

  const rows = useMemo(
    () =>
      cars.map((car) => {
        const totalExpenses = expensesByCar[car.id] || 0
        const totalCost = (car.purchasePrice || 0) + totalExpenses
        const margin = car.price - totalCost
        return { car, totalExpenses, totalCost, margin }
      }),
    [cars, expensesByCar]
  )

  const availableRows = rows.filter((r) => r.car.status === 'disponivel')
  const totalInvestedAvailable = availableRows.reduce((sum, r) => sum + r.totalCost, 0)
  const avgMargin = availableRows.length
    ? availableRows.reduce((sum, r) => sum + r.margin, 0) / availableRows.length
    : 0
  const totalExpensesAll = expenses.reduce((sum, e) => sum + e.amount, 0)

  const byCategory = useMemo(() => {
    const map = {}
    for (const e of expenses) map[e.category] = (map[e.category] || 0) + e.amount
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [expenses])

  if (loading) return <p className="admin-muted">Carregando…</p>

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1>Financeiro</h1>
          <p>Visão consolidada de custo e margem do estoque</p>
        </div>
        <button type="button" className="btn btn-outline" onClick={load}>
          <RefreshCcw size={15} /> Atualizar
        </button>
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
                  <th>Custo total</th>
                  <th>Preço de venda</th>
                  <th>Margem</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ car, totalCost, margin }) => (
                  <tr key={car.id}>
                    <td>
                      <strong>{car.brand} {car.model}</strong>
                      <span className="admin-table-sub">{car.version}</span>
                    </td>
                    <td>{car.status === 'disponivel' ? 'Disponível' : 'Vendido'}</td>
                    <td>{formatCurrency(totalCost)}</td>
                    <td>{formatCurrency(car.price)}</td>
                    <td className={margin < 0 ? 'expense-margin-negative' : 'expense-margin-positive'}>
                      {formatCurrency(margin)}
                    </td>
                    <td>
                      <Link to={`/admin/carros/${car.id}/gastos`} className="btn btn-outline">Ver gastos</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="admin-card-list">
            {rows.map(({ car, totalCost, margin }) => (
              <div className="admin-card" key={car.id}>
                <div className="admin-card-top">
                  <div className="admin-card-title">
                    <strong>{car.brand} {car.model}</strong>
                    <span className="admin-table-sub">{car.version}</span>
                  </div>
                  <span className={`admin-status-toggle ${car.status === 'disponivel' ? 'is-available' : 'is-sold'}`}>
                    {car.status === 'disponivel' ? 'Disponível' : 'Vendido'}
                  </span>
                </div>

                <div className="admin-card-stats">
                  <div>
                    <span>Custo total</span>
                    <strong>{formatCurrency(totalCost)}</strong>
                  </div>
                  <div>
                    <span>Preço de venda</span>
                    <strong>{formatCurrency(car.price)}</strong>
                  </div>
                  <div className={margin < 0 ? 'expense-margin-negative' : 'expense-margin-positive'}>
                    <span>Margem</span>
                    <strong>{formatCurrency(margin)}</strong>
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
