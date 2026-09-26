import { useEffect, useMemo, useState } from 'react'
import { RefreshCcw } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { fetchSales } from '../lib/salesApi.js'
import { fetchSellerCars } from '../lib/carsApi.js'
import { describeCommission } from '../lib/sellersApi.js'
import { formatCurrency, formatCurrencyCents, formatDateBR } from '../utils/carFormat.js'
import { periodRange, inRange } from '../utils/period.js'
import PeriodFilter from './PeriodFilter.jsx'
import './admin.css'

// Tela inicial do vendedor. A RLS garante que "sales" só devolve as vendas dele.
export default function SellerSales() {
  const { seller } = useAuth()
  const [sales, setSales] = useState([])
  const [cars, setCars] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState('mes')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [salesData, carsData] = await Promise.all([fetchSales(), fetchSellerCars()])
      setSales(salesData)
      setCars(carsData)
    } catch (err) {
      setError(err.message || 'Erro ao carregar suas vendas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const carsById = useMemo(() => {
    const map = {}
    for (const c of cars) map[c.id] = c
    return map
  }, [cars])

  const range = periodRange(period, customStart, customEnd)
  const periodSales = sales.filter((s) => inRange(s.saleDate, range))
  const revenue = periodSales.reduce((sum, s) => sum + s.salePrice, 0)
  const commission = periodSales.reduce((sum, s) => sum + s.commissionAmount, 0)

  if (loading) return <p className="admin-muted">Carregando…</p>

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1>Olá, {seller?.name?.split(' ')[0] || 'vendedor'}</h1>
          <p>Suas vendas e comissões{seller ? ` · comissão atual: ${describeCommission(seller)}` : ''}</p>
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

      <div className="expense-summary">
        <div className="expense-summary-card">
          <span>Carros vendidos</span>
          <strong>{periodSales.length}</strong>
        </div>
        <div className="expense-summary-card">
          <span>Total vendido</span>
          <strong>{formatCurrency(revenue)}</strong>
        </div>
        <div className="expense-summary-card is-positive">
          <span>Sua comissão</span>
          <strong>{formatCurrencyCents(commission)}</strong>
        </div>
      </div>

      <h2 className="admin-section-title">Vendas no período</h2>
      {periodSales.length === 0 ? (
        <p className="admin-muted">Nenhuma venda registrada no período.</p>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Carro</th>
                  <th>Valor da venda</th>
                  <th>Comissão</th>
                </tr>
              </thead>
              <tbody>
                {periodSales.map((sale) => {
                  const car = carsById[sale.carId]
                  return (
                    <tr key={sale.id}>
                      <td>{formatDateBR(sale.saleDate)}</td>
                      <td>
                        <strong>{car ? `${car.brand} ${car.model}` : 'Carro'}</strong>
                        {car && <span className="admin-table-sub">{car.version} · {car.modelYear}</span>}
                      </td>
                      <td>{formatCurrency(sale.salePrice)}</td>
                      <td>{formatCurrencyCents(sale.commissionAmount)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="admin-card-list">
            {periodSales.map((sale) => {
              const car = carsById[sale.carId]
              return (
                <div className="admin-card" key={sale.id}>
                  <div className="admin-card-top">
                    <div className="admin-card-title">
                      <strong>{car ? `${car.brand} ${car.model}` : 'Carro'}</strong>
                      <span className="admin-card-meta">Vendido em {formatDateBR(sale.saleDate)}</span>
                    </div>
                  </div>
                  <div className="admin-card-stats">
                    <div>
                      <span>Valor</span>
                      <strong>{formatCurrency(sale.salePrice)}</strong>
                    </div>
                    <div>
                      <span>Comissão</span>
                      <strong>{formatCurrencyCents(sale.commissionAmount)}</strong>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
