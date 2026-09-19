import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Trash2, RefreshCcw, Star } from 'lucide-react'
import { fetchAllCarsAdmin, updateCarStatus, updateCarFeatured, deleteCar } from '../lib/carsApi.js'
import { formatCurrency } from '../utils/carFormat.js'
import './admin.css'

export default function AdminCarList() {
  const [cars, setCars] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await fetchAllCarsAdmin()
      setCars(data)
    } catch (err) {
      setError(err.message || 'Erro ao carregar os carros.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function toggleStatus(car) {
    setBusyId(car.id)
    const nextStatus = car.status === 'disponivel' ? 'vendido' : 'disponivel'
    try {
      await updateCarStatus(car.id, nextStatus)
      setCars((prev) => prev.map((c) => (c.id === car.id ? { ...c, status: nextStatus } : c)))
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

      {loading ? (
        <p className="admin-muted">Carregando…</p>
      ) : cars.length === 0 ? (
        <div className="admin-empty">
          <p>Nenhum carro cadastrado ainda.</p>
          <Link to="/admin/carros/novo" className="btn btn-primary">Cadastrar primeiro carro</Link>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th></th>
                <th>Carro</th>
                <th>Categoria</th>
                <th>Km</th>
                <th>Preço</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cars.map((car) => (
                <tr key={car.id} className={busyId === car.id ? 'is-busy' : ''}>
                  <td>
                    <div className="admin-thumb">
                      {car.images[0] ? <img src={car.images[0]} alt="" /> : <span>Sem foto</span>}
                    </div>
                  </td>
                  <td>
                    <strong>{car.brand} {car.model}</strong>
                    <span className="admin-table-sub">{car.version} · {car.modelYear}</span>
                  </td>
                  <td className="admin-table-capitalize">{car.category}</td>
                  <td>{car.km.toLocaleString('pt-BR')} km</td>
                  <td>{formatCurrency(car.price)}</td>
                  <td>
                    <button
                      type="button"
                      className={`admin-status-toggle ${car.status === 'disponivel' ? 'is-available' : 'is-sold'}`}
                      onClick={() => toggleStatus(car)}
                      disabled={busyId === car.id}
                    >
                      {car.status === 'disponivel' ? 'Disponível' : 'Vendido'}
                    </button>
                  </td>
                  <td>
                    <div className="admin-row-actions">
                      <button
                        type="button"
                        className={`admin-icon-btn ${car.featured ? 'is-featured' : ''}`}
                        aria-label={car.featured ? 'Remover destaque' : 'Marcar como destaque'}
                        title={car.featured ? 'Remover destaque' : 'Marcar como destaque'}
                        onClick={() => toggleFeatured(car)}
                        disabled={busyId === car.id}
                      >
                        <Star size={16} fill={car.featured ? 'currentColor' : 'none'} />
                      </button>
                      <Link to={`/admin/carros/${car.id}`} className="admin-icon-btn" aria-label="Editar">
                        <Pencil size={16} />
                      </Link>
                      <button
                        type="button"
                        className="admin-icon-btn admin-icon-btn-danger"
                        aria-label="Excluir"
                        onClick={() => handleDelete(car)}
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
      )}
    </div>
  )
}
