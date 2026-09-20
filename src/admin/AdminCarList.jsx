import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Trash2, RefreshCcw, Receipt, Star, Eye, EyeOff, Search } from 'lucide-react'
import { fetchAllCarsAdmin, updateCarStatus, updateCarFeatured, updateCarHidden, deleteCar } from '../lib/carsApi.js'
import { fetchAllExpensesAdmin } from '../lib/expensesApi.js'
import { formatCurrency, CATEGORIES, CAR_STATUSES } from '../utils/carFormat.js'
import './admin.css'

function CarGroup({ title, rows, busyId, onChangeStatus, onToggleFeatured, onToggleHidden, onDelete, emptyLabel }) {
  if (rows.length === 0) {
    return (
      <section className="admin-car-group">
        <h2 className="admin-section-title">{title} (0)</h2>
        <p className="admin-muted">{emptyLabel}</p>
      </section>
    )
  }

  return (
    <section className="admin-car-group">
      <h2 className="admin-section-title">{title} ({rows.length})</h2>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th></th>
              <th>Carro</th>
              <th>Km</th>
              <th>Preço</th>
              <th>Custo total</th>
              <th>Margem</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ car, totalCost, margin }) => (
              <tr key={car.id} className={`${busyId === car.id ? 'is-busy' : ''} ${car.hidden ? 'is-hidden-row' : ''}`}>
                <td>
                  <div className="admin-thumb">
                    {car.images[0] ? <img src={car.images[0]} alt="" /> : <span>Sem foto</span>}
                  </div>
                </td>
                <td>
                  <strong>{car.brand} {car.model}</strong>
                  <span className="admin-table-sub">
                    {car.version} · {car.modelYear} · <span className="admin-table-capitalize">{car.category}</span>
                  </span>
                  {car.hidden && <span className="admin-hidden-badge">Oculto</span>}
                </td>
                <td>{car.km.toLocaleString('pt-BR')} km</td>
                <td>{formatCurrency(car.price)}</td>
                <td>{car.purchasePrice ? formatCurrency(totalCost) : '—'}</td>
                <td className={car.purchasePrice ? (margin < 0 ? 'expense-margin-negative' : 'expense-margin-positive') : ''}>
                  {car.purchasePrice ? formatCurrency(margin) : '—'}
                </td>
                <td>
                  <select
                    className={`admin-status-select status-${car.status}`}
                    value={car.status}
                    onChange={(e) => onChangeStatus(car, e.target.value)}
                    disabled={busyId === car.id}
                  >
                    {CAR_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </td>
                <td>
                  <div className="admin-row-actions">
                    <button
                      type="button"
                      className={`admin-icon-btn ${car.featured ? 'is-featured' : ''}`}
                      aria-label={car.featured ? 'Remover destaque' : 'Marcar como destaque'}
                      onClick={() => onToggleFeatured(car)}
                      disabled={busyId === car.id}
                    >
                      <Star size={16} fill={car.featured ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      type="button"
                      className={`admin-icon-btn ${car.hidden ? 'is-hidden-toggle' : ''}`}
                      aria-label={car.hidden ? 'Mostrar no site' : 'Ocultar do site'}
                      onClick={() => onToggleHidden(car)}
                      disabled={busyId === car.id}
                    >
                      {car.hidden ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <Link to={`/admin/carros/${car.id}/gastos`} className="admin-icon-btn" aria-label="Ver gastos">
                      <Receipt size={16} />
                    </Link>
                    <Link to={`/admin/carros/${car.id}`} className="admin-icon-btn" aria-label="Editar">
                      <Pencil size={16} />
                    </Link>
                    <button
                      type="button"
                      className="admin-icon-btn admin-icon-btn-danger"
                      aria-label="Excluir"
                      onClick={() => onDelete(car)}
                      disabled={busyId === car.id}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-card-list">
        {rows.map(({ car, totalCost, margin }) => (
          <div className={`admin-card ${car.hidden ? 'is-hidden-row' : ''}`} key={car.id}>
            <div className="admin-card-top">
              <div className="admin-thumb admin-card-thumb">
                {car.images[0] ? <img src={car.images[0]} alt="" /> : <span>Sem foto</span>}
              </div>
              <div className="admin-card-title">
                <strong>{car.brand} {car.model}</strong>
                <span className="admin-table-sub">{car.version} · {car.modelYear}</span>
                <span className="admin-card-meta">
                  <span className="admin-table-capitalize">{car.category}</span> · {car.km.toLocaleString('pt-BR')} km
                </span>
                {car.hidden && <span className="admin-hidden-badge">Oculto</span>}
              </div>
              <select
                className={`admin-status-select status-${car.status}`}
                value={car.status}
                onChange={(e) => onChangeStatus(car, e.target.value)}
                disabled={busyId === car.id}
              >
                {CAR_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            <div className="admin-card-stats">
              <div>
                <span>Preço</span>
                <strong>{formatCurrency(car.price)}</strong>
              </div>
              <div>
                <span>Custo total</span>
                <strong>{car.purchasePrice ? formatCurrency(totalCost) : '—'}</strong>
              </div>
              <div className={car.purchasePrice ? (margin < 0 ? 'expense-margin-negative' : 'expense-margin-positive') : ''}>
                <span>Margem</span>
                <strong>{car.purchasePrice ? formatCurrency(margin) : '—'}</strong>
              </div>
            </div>

            <div className="admin-card-actions">
              <button
                type="button"
                className={car.featured ? 'is-featured' : ''}
                onClick={() => onToggleFeatured(car)}
                disabled={busyId === car.id}
              >
                <Star size={14} fill={car.featured ? 'currentColor' : 'none'} /> {car.featured ? 'Destaque' : 'Destacar'}
              </button>
              <button type="button" onClick={() => onToggleHidden(car)} disabled={busyId === car.id}>
                {car.hidden ? <EyeOff size={14} /> : <Eye size={14} />} {car.hidden ? 'Mostrar' : 'Ocultar'}
              </button>
              <Link to={`/admin/carros/${car.id}/gastos`}>
                <Receipt size={14} /> Gastos
              </Link>
              <Link to={`/admin/carros/${car.id}`}>
                <Pencil size={14} /> Editar
              </Link>
              <button
                type="button"
                className="admin-icon-btn-danger"
                onClick={() => onDelete(car)}
                disabled={busyId === car.id}
              >
                <Trash2 size={14} /> Excluir
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function AdminCarList() {
  const [cars, setCars] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('todas')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [carsData, expensesData] = await Promise.all([fetchAllCarsAdmin(), fetchAllExpensesAdmin()])
      setCars(carsData)
      setExpenses(expensesData)
    } catch (err) {
      setError(err.message || 'Erro ao carregar os carros.')
    } finally {
      setLoading(false)
    }
  }

  const expensesByCar = useMemo(() => {
    const map = {}
    for (const e of expenses) map[e.carId] = (map[e.carId] || 0) + e.amount
    return map
  }, [expenses])

  const rows = useMemo(
    () =>
      cars.map((car) => {
        const totalCost = (car.purchasePrice || 0) + (expensesByCar[car.id] || 0)
        const margin = car.price - totalCost
        return { car, totalCost, margin }
      }),
    [cars, expensesByCar]
  )

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter(({ car }) => {
      const matchesQuery = !query || `${car.brand} ${car.model} ${car.version}`.toLowerCase().includes(query)
      const matchesCategory = categoryFilter === 'todas' || car.category === categoryFilter
      return matchesQuery && matchesCategory
    })
  }, [rows, search, categoryFilter])

  const availableRows = filteredRows.filter((r) => r.car.status === 'disponivel')
  const maintenanceRows = filteredRows.filter((r) => r.car.status === 'manutencao')
  const soldRows = filteredRows.filter((r) => r.car.status === 'vendido')
  const isFiltering = search.trim() !== '' || categoryFilter !== 'todas'

  useEffect(() => {
    load()
  }, [])

  async function changeStatus(car, nextStatus) {
    if (nextStatus === car.status) return
    setBusyId(car.id)
    try {
      const updated = await updateCarStatus(car.id, nextStatus)
      setCars((prev) => prev.map((c) => (c.id === car.id ? updated : c)))
    } catch (err) {
      alert('Não foi possível atualizar o status: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function toggleFeatured(car) {
    setBusyId(car.id)
    try {
      await updateCarFeatured(car.id, !car.featured)
      setCars((prev) => prev.map((c) => (c.id === car.id ? { ...c, featured: !c.featured } : c)))
    } catch (err) {
      alert('Não foi possível atualizar o destaque: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function toggleHidden(car) {
    setBusyId(car.id)
    try {
      await updateCarHidden(car.id, !car.hidden)
      setCars((prev) => prev.map((c) => (c.id === car.id ? { ...c, hidden: !c.hidden } : c)))
    } catch (err) {
      alert('Não foi possível atualizar a visibilidade: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(car) {
    if (!confirm(`Excluir "${car.brand} ${car.model}"? Essa ação não pode ser desfeita.`)) return
    setBusyId(car.id)
    try {
      await deleteCar(car.id)
      setCars((prev) => prev.filter((c) => c.id !== car.id))
    } catch (err) {
      alert('Não foi possível excluir: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1>Estoque</h1>
          <p>{cars.length} {cars.length === 1 ? 'carro cadastrado' : 'carros cadastrados'}</p>
        </div>
        <button type="button" className="btn btn-outline" onClick={load}>
          <RefreshCcw size={15} /> Atualizar
        </button>
      </div>

      {error && <p className="admin-error">{error}</p>}

      {!loading && cars.length > 0 && (
        <div className="admin-search-bar">
          <label className="admin-search-input">
            <Search size={15} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por marca, modelo ou versão…"
            />
          </label>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="todas">Todas as categorias</option>
            {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
          </select>
        </div>
      )}

      {loading ? (
        <p className="admin-muted">Carregando…</p>
      ) : cars.length === 0 ? (
        <div className="admin-empty">
          <p>Nenhum carro cadastrado ainda.</p>
          <Link to="/admin/carros/novo" className="btn btn-primary">Cadastrar primeiro carro</Link>
        </div>
      ) : isFiltering && filteredRows.length === 0 ? (
        <p className="admin-muted">Nenhum carro encontrado para essa busca.</p>
      ) : (
        <>
          <CarGroup
            title="Disponíveis"
            rows={availableRows}
            busyId={busyId}
            onChangeStatus={changeStatus}
            onToggleFeatured={toggleFeatured}
            onToggleHidden={toggleHidden}
            onDelete={handleDelete}
            emptyLabel="Nenhum carro disponível no momento."
          />
          <CarGroup
            title="Em Manutenção"
            rows={maintenanceRows}
            busyId={busyId}
            onChangeStatus={changeStatus}
            onToggleFeatured={toggleFeatured}
            onToggleHidden={toggleHidden}
            onDelete={handleDelete}
            emptyLabel="Nenhum carro em manutenção."
          />
          <CarGroup
            title="Vendidos"
            rows={soldRows}
            busyId={busyId}
            onChangeStatus={changeStatus}
            onToggleFeatured={toggleFeatured}
            onToggleHidden={toggleHidden}
            onDelete={handleDelete}
            emptyLabel="Nenhum carro vendido ainda."
          />
        </>
      )}
    </div>
  )
}
