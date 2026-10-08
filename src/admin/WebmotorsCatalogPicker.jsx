import { useEffect, useRef, useState } from 'react'
import { fetchWebmotorsCatalog, fetchWebmotorsLists } from '../lib/webmotorsApi.js'
import { olxRankBrands, olxRankModels, olxRankVersions, olxConfident } from '../utils/olxAd.js'
import { wmYears, wmVersionsForYear, wmRankColors, wmRankGears, wmRankFuels, wmPick } from '../utils/webmotorsAd.js'

// Marca, modelo e versão da Webmotors (a Webmotors exige os códigos dela) e,
// se a pessoa quiser trocar, a cor, o câmbio e o combustível da lista da
// Webmotors (sem escolher, o sistema usa o que combina com o cadastro). A
// sugestão de marca, modelo e versão é a mesma da OLX; as versões do ano modelo
// do carro vêm primeiro.
// value: { brandId, brandName, modelId, modelName, versionId, versionName,
//          colorId, colorName, gearId, gearName, fuelId, fuelName, auto }
export default function WebmotorsCatalogPicker({ car, value, onChange, disabled = false }) {
  const v = value || {}
  const [brands, setBrands] = useState(null)
  const [models, setModels] = useState(null)
  const [versions, setVersions] = useState(null)
  const [lists, setLists] = useState(null)
  const [error, setError] = useState('')
  // A sugestão automática roda uma vez por campo (não volta depois que a pessoa limpa)
  const suggested = useRef({})
  const latest = useRef(v)
  latest.current = v
  const modelYear = wmYears(car)?.model

  function patch(next) {
    onChange({ ...latest.current, ...next })
  }

  function fail(err) {
    setError(err.message || 'Não foi possível carregar as listas da Webmotors.')
  }

  useEffect(() => {
    let active = true
    setError('')
    fetchWebmotorsCatalog({ level: 'marcas' })
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
    fetchWebmotorsLists()
      .then((data) => active && setLists(data))
      .catch((err) => active && fail(err))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setModels(null)
    if (!v.brandId) return
    let active = true
    fetchWebmotorsCatalog({ level: 'modelos', brandId: v.brandId })
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
  }, [v.brandId])

  useEffect(() => {
    setVersions(null)
    if (!v.modelId) return
    let active = true
    fetchWebmotorsCatalog({ level: 'versoes', modelId: v.modelId })
      .then((list) => {
        if (!active) return
        setVersions(list)
        if (!latest.current.versionId && !suggested.current[`version-${v.modelId}`] && car.version) {
          suggested.current[`version-${v.modelId}`] = true
          const best = olxConfident(olxRankVersions(car, wmVersionsForYear(list, modelYear), latest.current.modelName))
          if (best) patch({ versionId: best.id, versionName: best.name, auto: true })
        }
      })
      .catch((err) => active && fail(err))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.modelId])

  function pick(list, id) {
    return (list || []).find((o) => String(o.id) === String(id)) || null
  }

  // Versões mais parecidas com o cadastro primeiro; as do ano modelo do carro antes das outras
  const yearsById = new Map((versions || []).map((o) => [String(o.id), o.years || []]))
  const rankedVersions = versions
    ? olxRankVersions(car, versions, v.modelName)
      .map((o, i) => ({ ...o, i, hasYear: (yearsById.get(String(o.id)) || []).includes(modelYear) }))
      .sort((a, b) => Number(b.hasYear) - Number(a.hasYear) || a.i - b.i)
    : null

  // Cor, câmbio e combustível: o escolhido ou "Automático" com o que combina
  const extras = [
    { key: 'color', label: 'Cor na Webmotors', list: lists?.cores, auto: lists?.cores ? wmPick(wmRankColors(car.color, lists.cores)) : null },
    { key: 'gear', label: 'Câmbio na Webmotors', list: lists?.cambios, auto: lists?.cambios ? wmPick(wmRankGears(car.transmission, lists.cambios)) : null },
    { key: 'fuel', label: 'Combustível na Webmotors', list: lists?.combustiveis, auto: lists?.combustiveis ? wmPick(wmRankFuels(car.fuel, lists.combustiveis)) : null },
  ]

  return (
    <div className="olx-catalog">
      <div className="admin-form-grid">
        <label>
          Marca na Webmotors
          <select
            value={v.brandId || ''}
            disabled={disabled || !brands}
            onChange={(e) => {
              const o = pick(brands, e.target.value)
              const { colorId, colorName, gearId, gearName, fuelId, fuelName } = latest.current
              onChange({ colorId, colorName, gearId, gearName, fuelId, fuelName, brandId: o?.id || null, brandName: o?.name || '', auto: false })
            }}
          >
            <option value="">{brands ? 'Escolha a marca' : 'Carregando…'}</option>
            {(brands || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <label>
          Modelo na Webmotors
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
          Versão na Webmotors
          <select
            value={v.versionId || ''}
            disabled={disabled || !v.modelId || !versions}
            onChange={(e) => {
              const o = pick(versions, e.target.value)
              patch({ versionId: o?.id || null, versionName: o?.name || '', auto: false })
            }}
          >
            <option value="">{!v.modelId ? 'Escolha o modelo antes' : versions ? 'Escolha a versão' : 'Carregando…'}</option>
            {(rankedVersions || []).map((o) => (
              <option key={o.id} value={o.id}>{o.name}{modelYear && !o.hasYear ? ` (sem ${modelYear})` : ''}</option>
            ))}
          </select>
        </label>
        {extras.map(({ key, label, list, auto }) => (
          <label key={key}>
            {label}
            <select
              value={v[`${key}Id`] || ''}
              disabled={disabled || !list}
              onChange={(e) => {
                const o = pick(list, e.target.value)
                patch({ [`${key}Id`]: o?.id || null, [`${key}Name`]: o?.name || '' })
              }}
            >
              <option value="">{!list ? 'Carregando…' : auto ? `Automático: ${auto.name}` : 'Escolha na lista'}</option>
              {(list || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
        ))}
      </div>
      {v.auto && <p className="admin-form-note">Sugerido pelo sistema a partir do cadastro: confira antes de salvar.</p>}
      {error && <p className="admin-error">{error}</p>}
    </div>
  )
}
