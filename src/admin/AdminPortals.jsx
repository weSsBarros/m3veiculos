import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RefreshCcw } from 'lucide-react'
import { fetchAllCarsAdmin } from '../lib/carsApi.js'
import { fetchSellers } from '../lib/sellersApi.js'
import OlxPortalPanel from './OlxPortalPanel.jsx'
import WebmotorsPortalPanel from './WebmotorsPortalPanel.jsx'
import './admin.css'

const PORTALS = [
  { key: 'olx', label: 'OLX' },
  { key: 'webmotors', label: 'Webmotors' },
]

// Aba Portais: os carros do estoque na OLX (seção 59) e na Webmotors (seção
// 61), um portal por vez (?portal=webmotors). O estoque e a equipe são
// carregados uma vez e passados para o portal aberto.
export default function AdminPortals() {
  const [params, setParams] = useSearchParams()
  const [cars, setCars] = useState([])
  const [sellers, setSellers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const portal = params.get('portal') === 'webmotors' ? 'webmotors' : 'olx'

  async function load() {
    setError('')
    try {
      const [carsData, sellersData] = await Promise.all([fetchAllCarsAdmin(), fetchSellers().catch(() => [])])
      setCars(carsData)
      setSellers(sellersData)
    } catch (err) {
      setError(err.message || 'Não foi possível carregar o estoque.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function choose(next) {
    const p = new URLSearchParams(params)
    if (next === 'olx') p.delete('portal')
    else p.set('portal', next)
    p.delete('filtro')
    setParams(p, { replace: true })
  }

  function reload() {
    load()
    setReloadKey((k) => k + 1)
  }

  return (
    <div className="admin-page portals-page">
      <div className="admin-page-head">
        <div>
          <h1>Portais</h1>
          <p>Os carros do estoque nos portais de venda: OLX e Webmotors.</p>
        </div>
        <div className="admin-row-actions">
          <button type="button" className="btn btn-outline" onClick={reload}>
            <RefreshCcw size={15} /> Atualizar
          </button>
        </div>
      </div>

      <div className="admin-segmented portals-tabs" role="tablist" aria-label="Portal">
        {PORTALS.map((p) => (
          <button key={p.key} type="button" role="tab" aria-selected={portal === p.key} className={portal === p.key ? 'is-active' : ''} onClick={() => choose(p.key)}>
            {p.label}
          </button>
        ))}
      </div>

      {error && <p className="admin-error">{error}</p>}
      {loading ? (
        <p className="admin-muted">Carregando…</p>
      ) : portal === 'webmotors' ? (
        <WebmotorsPortalPanel cars={cars} setCars={setCars} reloadKey={reloadKey} />
      ) : (
        <OlxPortalPanel cars={cars} setCars={setCars} sellers={sellers} reloadKey={reloadKey} />
      )}
    </div>
  )
}
