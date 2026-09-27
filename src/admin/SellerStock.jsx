import { useEffect, useMemo, useState } from 'react'
import { RefreshCcw, Search, ExternalLink, FileText, Eye } from 'lucide-react'
import { Link } from 'react-router-dom'
import { fetchSellerCars } from '../lib/carsApi.js'
import { formatCurrency, CATEGORIES, daysInStock } from '../utils/carFormat.js'
import { fetchCarViewTotals, formatViews } from '../lib/statsApi.js'
import { thumbUrl } from '../utils/carPhotos.js'
import './admin.css'

// Estoque do vendedor: só leitura, sem custo de compra, gastos ou margem
// (a view "seller_cars" nem tem essas colunas).
export default function SellerStock() {
  const [cars, setCars] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('todas')
  const [carViews, setCarViews] = useState({})

  async function load() {
    setLoading(true)
    setError('')
    try {
      setCars(await fetchSellerCars())
      fetchCarViewTotals().then(setCarViews).catch(() => setCarViews({}))
    } catch (err) {
      setError(err.message || 'Erro ao carregar o estoque.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const available = useMemo(() => {
    const query = search.trim().toLowerCase()
    return cars.filter((car) => {
      if (car.status === 'vendido') return false
      const matchesQuery = !query || `${car.brand} ${car.model} ${car.version}`.toLowerCase().includes(query)
      const matchesCategory = categoryFilter === 'todas' || car.category === categoryFilter
      return matchesQuery && matchesCategory
    })
  }, [cars, search, categoryFilter])

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1>Estoque</h1>
          <p>{available.length} {available.length === 1 ? 'carro disponível' : 'carros disponíveis'}</p>
        </div>
        <button type="button" className="btn btn-outline" onClick={load}>
          <RefreshCcw size={15} /> Atualizar
        </button>
      </div>

      {error && <p className="admin-error">{error}</p>}

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

      {loading ? (
        <p className="admin-muted">Carregando…</p>
      ) : available.length === 0 ? (
        <p className="admin-muted">Nenhum carro encontrado.</p>
      ) : (
        <div className="seller-stock-grid">
          {available.map((car) => (
            <div className="seller-stock-card" key={car.id}>
              <div className="seller-stock-photo">
                {car.images[0] ? <img src={thumbUrl(car.images[0])} alt="" loading="lazy" /> : <span>Sem foto</span>}
                {car.status === 'manutencao' && <span className="seller-stock-badge">Em manutenção</span>}
              </div>
              <div className="seller-stock-body">
                <strong>{car.brand} {car.model}</strong>
                <span className="admin-table-sub">{car.version} · {car.modelYear}</span>
                <span className="admin-card-meta">
                  {car.km.toLocaleString('pt-BR')} km · {car.transmission} · {car.color} · {daysInStock(car)} dias em estoque
                </span>
                <span className="stock-card-views" title="Visualizações da página do carro no site">
                  <Eye size={13} /> {formatViews(carViews[car.id]?.views || 0)}
                </span>
                <span className="seller-stock-price">{car.price != null ? formatCurrency(car.price) : 'Consulte o valor'}</span>
                <div className="admin-action-group">
                  {!car.hidden && (
                    <a href={`/carro/${car.slug}`} target="_blank" rel="noreferrer" className="admin-action-btn">
                      <ExternalLink size={15} /> Ver anúncio
                    </a>
                  )}
                  <Link to={`/admin/contratos?carro=${car.id}`} className="admin-action-btn">
                    <FileText size={15} /> Gerar contrato
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
