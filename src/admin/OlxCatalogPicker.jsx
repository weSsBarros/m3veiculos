import { useEffect, useRef, useState } from 'react'
import { fetchOlxCatalog } from '../lib/olxApi.js'
import { olxRankBrands, olxRankModels, olxRankVersions, olxRankCc, olxConfident } from '../utils/olxAd.js'

// Marca, modelo e versão do catálogo da OLX (e a cilindrada, na moto). A OLX
// exige os ids dela. Campo vazio recebe a sugestão quando a combinação com o
// cadastro do carro é clara; senão, a pessoa escolhe na lista.
// value: { brandId, brandName, modelId, modelName, versionId, versionName, ccId, ccName, auto }
export default function OlxCatalogPicker({ car, value, onChange, disabled = false }) {
  const kind = car.category === 'moto' ? 'moto' : 'carro'
  const v = value || {}
  const [brands, setBrands] = useState(null)
  const [models, setModels] = useState(null)
  const [versions, setVersions] = useState(null)
  const [ccs, setCcs] = useState(null)
  const [error, setError] = useState('')
  // A sugestão automática roda uma vez por campo (não volta depois que a pessoa limpa)
  const suggested = useRef({})
  const latest = useRef(v)
  latest.current = v

  function patch(next) {
    onChange({ ...latest.current, ...next })
  }

  function fail(err) {
    setError(err.message || 'Não foi possível carregar o catálogo da OLX.')
  }

  useEffect(() => {
    let active = true
    setError('')
    fetchOlxCatalog({ kind, level: 'marcas' })
      .then((list) => {
        if (!active) return
        setBrands(list)
        if (!latest.current.brandId && !suggested.current.brand && car.brand) {
          suggested.current.brand = true
          const best = olxConfident(olxRankBrands(car.brand, list))
          if (best) patch({ brandId: best.id, brandName: best.name, auto: true })
        }
      })
      .catch((err) => active && fail(err))
    if (kind === 'moto') {
      fetchOlxCatalog({ kind, level: 'cilindradas' })
        .then((list) => {
          if (!active) return
          setCcs(list)
          if (!latest.current.ccId && !suggested.current.cc) {
            suggested.current.cc = true
            const best = olxConfident(olxRankCc(car, list))
            if (best) patch({ ccId: best.id, ccName: best.name, auto: true })
          }
        })
        .catch((err) => active && fail(err))
    }
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind])

  useEffect(() => {
    setModels(null)
    if (!v.brandId) return
    let active = true
    fetchOlxCatalog({ kind, level: 'modelos', brandId: v.brandId })
      .then((list) => {
        if (!active) return
        setModels(list)
        if (!latest.current.modelId && !suggested.current[`model-${v.brandId}`] && car.model) {
          suggested.current[`model-${v.brandId}`] = true
          const best = olxConfident(olxRankModels(car.model, list))
          if (best) patch({ modelId: best.id, modelName: best.name, auto: true })
        }
      })
      .catch((err) => active && fail(err))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, v.brandId])

  useEffect(() => {
    setVersions(null)
    if (!v.brandId || !v.modelId) return
    let active = true
    fetchOlxCatalog({ kind, level: 'versoes', brandId: v.brandId, modelId: v.modelId })
      .then((list) => {
        if (!active) return
        setVersions(list)
        if (!latest.current.versionId && !suggested.current[`version-${v.modelId}`] && car.version) {
          suggested.current[`version-${v.modelId}`] = true
          const best = olxConfident(olxRankVersions(car, list, latest.current.modelName))
          if (best) patch({ versionId: best.id, versionName: best.name, auto: true })
        }
      })
      .catch((err) => active && fail(err))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, v.brandId, v.modelId])

  function pick(list, id) {
    return (list || []).find((o) => String(o.id) === String(id)) || null
  }

  // As versões mais parecidas com o cadastro aparecem primeiro
  const rankedVersions = versions ? olxRankVersions(car, versions, v.modelName) : null

  return (
    <div className="olx-catalog">
      <div className="admin-form-grid">
        <label>
          Marca na OLX
          <select
            value={v.brandId || ''}
            disabled={disabled || !brands}
            onChange={(e) => {
              const o = pick(brands, e.target.value)
              onChange({ ...(kind === 'moto' ? { ccId: v.ccId, ccName: v.ccName } : {}), brandId: o?.id || null, brandName: o?.name || '', auto: false })
            }}
          >
            <option value="">{brands ? 'Escolha a marca' : 'Carregando…'}</option>
            {(brands || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <label>
          Modelo na OLX
          <select
            value={v.modelId || ''}
            disabled={disabled || !v.brandId || !models}
            onChange={(e) => {
              const o = pick(models, e.target.value)
              patch({ modelId: o?.id || null, modelName: o?.name || '', versionId: null, versionName: '', auto: false })
            }}
          >
            <option value="">{!v.brandId ? 'Escolha a marca antes' : models ? 'Escolha o modelo' : 'Carregando…'}</option>
            {(models || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <label>
          Versão na OLX{kind === 'moto' ? ' (opcional)' : ''}
          <select
            value={v.versionId || ''}
            disabled={disabled || !v.modelId || !versions}
            onChange={(e) => {
              const o = pick(versions, e.target.value)
              patch({ versionId: o?.id || null, versionName: o?.name || '', auto: false })
            }}
          >
            <option value="">{!v.modelId ? 'Escolha o modelo antes' : versions ? 'Escolha a versão' : 'Carregando…'}</option>
            {(rankedVersions || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        {kind === 'moto' && (
          <label>
            Cilindrada na OLX
            <select
              value={v.ccId || ''}
              disabled={disabled || !ccs}
              onChange={(e) => {
                const o = pick(ccs, e.target.value)
                patch({ ccId: o?.id || null, ccName: o?.name || '', auto: false })
              }}
            >
              <option value="">{ccs ? 'Escolha a cilindrada' : 'Carregando…'}</option>
              {(ccs || []).map((o) => <option key={o.id} value={o.id}>{o.name} cc</option>)}
            </select>
          </label>
        )}
      </div>
      {v.auto && <p className="admin-form-note">Sugerido pelo sistema a partir do cadastro: confira antes de salvar.</p>}
      {error && <p className="admin-error">{error}</p>}
    </div>
  )
}
