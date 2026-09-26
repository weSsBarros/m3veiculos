import { useEffect, useState } from 'react'
import { fetchFipeBrands, fetchFipeModels, fetchFipeYears, fetchFipeValue, parseFipeValue } from '../utils/fipeApi.js'

export default function FipeLookup({ onUseValue }) {
  const [brands, setBrands] = useState([])
  const [models, setModels] = useState([])
  const [years, setYears] = useState([])
  const [brandCode, setBrandCode] = useState('')
  const [modelCode, setModelCode] = useState('')
  const [yearCode, setYearCode] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchFipeBrands()
      .then(setBrands)
      .catch(() => setError('Não foi possível carregar as marcas da FIPE.'))
  }, [])

  function handleBrandChange(code) {
    setBrandCode(code)
    setModelCode('')
    setYearCode('')
    setModels([])
    setYears([])
    setResult(null)
    setError('')
    if (!code) return
    setLoading(true)
    fetchFipeModels(code)
      .then(setModels)
      .catch(() => setError('Não foi possível carregar os modelos.'))
      .finally(() => setLoading(false))
  }

  function handleModelChange(code) {
    setModelCode(code)
    setYearCode('')
    setYears([])
    setResult(null)
    setError('')
    if (!code) return
    setLoading(true)
    fetchFipeYears(brandCode, code)
      .then(setYears)
      .catch(() => setError('Não foi possível carregar os anos.'))
      .finally(() => setLoading(false))
  }

  function handleYearChange(code) {
    setYearCode(code)
    setResult(null)
    setError('')
    if (!code) return
    setLoading(true)
    fetchFipeValue(brandCode, modelCode, code)
      .then(setResult)
      .catch((err) => setError(err.message || 'Não foi possível consultar o valor FIPE.'))
      .finally(() => setLoading(false))
  }

  return (
    <div className="fipe-lookup">
      <div className="admin-form-grid">
        <label>
          Marca (FIPE)
          <select value={brandCode} onChange={(e) => handleBrandChange(e.target.value)}>
            <option value="">Selecione…</option>
            {brands.map((b) => (
              <option key={b.codigo} value={b.codigo}>{b.nome}</option>
            ))}
          </select>
        </label>
        <label>
          Modelo (FIPE)
          <select value={modelCode} onChange={(e) => handleModelChange(e.target.value)} disabled={!brandCode}>
            <option value="">Selecione…</option>
            {models.map((m) => (
              <option key={m.codigo} value={m.codigo}>{m.nome}</option>
            ))}
          </select>
        </label>
        <label>
          Ano (FIPE)
          <select value={yearCode} onChange={(e) => handleYearChange(e.target.value)} disabled={!modelCode}>
            <option value="">Selecione…</option>
            {years.map((y) => (
              <option key={y.codigo} value={y.codigo}>{y.nome}</option>
            ))}
          </select>
        </label>
      </div>

      {loading && <p className="admin-muted">Consultando…</p>}
      {error && <p className="admin-error">{error}</p>}

      {result && (
        <div className="fipe-lookup-result">
          <div>
            <strong>{result.Valor}</strong>
            <span className="admin-table-sub"> — {result.Modelo} ({result.MesReferencia})</span>
          </div>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => onUseValue(parseFipeValue(result.Valor))}
          >
            Usar como preço de venda
          </button>
        </div>
      )}
    </div>
  )
}
