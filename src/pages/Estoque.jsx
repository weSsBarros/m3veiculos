import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SlidersHorizontal, X } from 'lucide-react'
import CarCard from '../components/CarCard.jsx'
import SetupNotice from '../components/SetupNotice.jsx'
import { CATEGORIES, BRANDS, parseIntBR } from '../utils/carFormat.js'
import { useCars } from '../context/CarsContext.jsx'
import './Estoque.css'

// Campo de preço livre: só dígitos, exibidos com separador de milhar
function formatPriceInput(raw) {
  const digits = String(raw).replace(/\D/g, '').slice(0, 9)
  return digits ? Number(digits).toLocaleString('pt-BR') : ''
}

const SORTS = [
  { label: 'Mais recentes', value: 'recentes' },
  { label: 'Menor preço', value: 'menor-preco' },
  { label: 'Maior preço', value: 'maior-preco' },
  { label: 'Menor km', value: 'menor-km' },
]

export default function Estoque() {
  const { cars, loading, error } = useCars()
  const [params, setParams] = useSearchParams()
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [sort, setSort] = useState('recentes')

  const categoria = params.get('categoria') || ''
  const marca = params.get('marca') || ''
  const busca = params.get('busca') || ''

  function updateParam(key, value) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }

  function clearFilters() {
    setParams({})
    setPriceMin('')
    setPriceMax('')
    setSort('recentes')
  }

  const minValue = parseIntBR(priceMin)
  const maxValue = parseIntBR(priceMax)
  const priceFilterActive = minValue != null || maxValue != null

  const filtered = useMemo(() => {
    let list = cars.filter((c) => {
      if (categoria && c.category !== categoria) return false
      if (marca && c.brand !== marca) return false
      if (c.price == null) {
        // Carro "consulte o valor" só entra sem filtro de preço — não dá pra
        // saber se ele cabe no intervalo digitado.
        if (priceFilterActive) return false
      } else {
        if (minValue != null && c.price < minValue) return false
        if (maxValue != null && c.price > maxValue) return false
      }
      if (busca) {
        const term = busca.toLowerCase()
        const haystack = `${c.brand} ${c.model} ${c.version}`.toLowerCase()
        if (!haystack.includes(term)) return false
      }
      return true
    })

    if (sort === 'menor-preco') list = [...list].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
    if (sort === 'maior-preco') list = [...list].sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity))
    if (sort === 'menor-km') list = [...list].sort((a, b) => a.km - b.km)

    return list
  }, [cars, categoria, marca, busca, minValue, maxValue, priceFilterActive, sort])

  const hasFilters = categoria || marca || busca || priceFilterActive

  if (error === 'not-configured') return <SetupNotice />

  return (
    <div className="stock-page">
      <div className="container">
        <div className="stock-head">
          <div>
            <span className="eyebrow">Estoque completo</span>
            <h1>Encontre o seu próximo carro</h1>
          </div>
          <p className="stock-count">{filtered.length} {filtered.length === 1 ? 'carro encontrado' : 'carros encontrados'}</p>
        </div>

        <div className="stock-filters">
          <div className="stock-filter">
            <SlidersHorizontal size={15} />
            <select value={categoria} onChange={(e) => updateParam('categoria', e.target.value)}>
              <option value="">Todas as categorias</option>
              {CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>{c.label}</option>
              ))}
            </select>
          </div>

          <div className="stock-filter">
            <select value={marca} onChange={(e) => updateParam('marca', e.target.value)}>
              <option value="">Todas as marcas</option>
              {BRANDS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          <div className="stock-filter stock-filter-price">
            <span>Preço de R$</span>
            <input
              type="text"
              inputMode="numeric"
              value={priceMin}
              onChange={(e) => setPriceMin(formatPriceInput(e.target.value))}
              placeholder="mínimo"
              aria-label="Preço mínimo"
            />
            <span>até R$</span>
            <input
              type="text"
              inputMode="numeric"
              value={priceMax}
              onChange={(e) => setPriceMax(formatPriceInput(e.target.value))}
              placeholder="máximo"
              aria-label="Preço máximo"
            />
          </div>

          <div className="stock-filter">
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {hasFilters && (
            <button type="button" className="stock-clear" onClick={clearFilters}>
              <X size={14} /> Limpar filtros
            </button>
          )}
        </div>

        {loading ? (
          <div className="stock-empty">
            <p>Carregando estoque…</p>
          </div>
        ) : error ? (
          <div className="stock-empty">
            <p>Não foi possível carregar os carros agora. Tente recarregar a página em instantes.</p>
          </div>
        ) : filtered.length > 0 ? (
          <div className="stock-grid">
            {filtered.map((car) => (
              <CarCard car={car} key={car.id} />
            ))}
          </div>
        ) : (
          <div className="stock-empty">
            <p>Nenhum carro encontrado com esses filtros.</p>
            <button type="button" className="btn btn-primary" onClick={clearFilters}>Limpar filtros</button>
          </div>
        )}
      </div>
    </div>
  )
}
