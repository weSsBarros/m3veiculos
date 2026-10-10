import { useEffect, useMemo, useRef, useState } from 'react'
import { fipeList, fipeValue } from '../lib/veiculoDadosApi.js'
import { FIPE_TYPES, fipeYearInfo } from '../utils/fipeMatch.js'
import { formatCurrency } from '../utils/carFormat.js'
import { filterFipeModels } from '../utils/preenchimento.js'

// Tabela FIPE em cascata: tipo → marca → modelo → ano-modelo e combustível.
// Tudo passa pela função veiculo-dados (com cache no banco). "Conferir e usar"
// leva o valor escolhido para a revisão do cadastro.
export default function FipeCascade({ initialTipo = 'carros', onUse, onClose }) {
  const [tipo, setTipo] = useState(initialTipo)
  const [brands, setBrands] = useState([])
  const [brand, setBrand] = useState('')
  const [models, setModels] = useState([])
  const [filter, setFilter] = useState('')
  const [model, setModel] = useState('')
  const [years, setYears] = useState([])
  const [year, setYear] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')
  // Cada escolha nova invalida as respostas que ainda estão a caminho
  const seq = useRef(0)

  function load(level, promise, onData) {
    const mine = ++seq.current
    setLoading(level)
    setError('')
    promise
      .then((data) => {
        if (mine === seq.current) onData(data)
      })
      .catch((err) => {
        if (mine === seq.current) setError(err.message)
      })
      .finally(() => {
        if (mine === seq.current) setLoading('')
      })
  }

  function loadBrands(nextTipo) {
    load('marcas', fipeList('marcas', { tipo: nextTipo }), setBrands)
  }

  useEffect(() => {
    loadBrands(initialTipo)
    // Só ao abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function chooseTipo(next) {
    if (next === tipo) return
    setTipo(next)
    setBrand('')
    setBrands([])
    setModels([])
    setModel('')
    setFilter('')
    setYears([])
    setYear('')
    setResult(null)
    loadBrands(next)
  }

  function chooseBrand(code) {
    setBrand(code)
    setModels([])
    setModel('')
    setFilter('')
    setYears([])
    setYear('')
    setResult(null)
    if (code) load('modelos', fipeList('modelos', { tipo, marca: code }), setModels)
  }

  function chooseModel(code) {
    setModel(code)
    setYears([])
    setYear('')
    setResult(null)
    if (code) load('anos', fipeList('anos', { tipo, marca: brand, modelo: code }), setYears)
  }

  function chooseYear(code) {
    setYear(code)
    setResult(null)
    if (code) load('valor', fipeValue({ tipo, marca: brand, modelo: model, ano: code }), setResult)
  }

  // Filtro do modelo (a marca digitada junto não atrapalha: "honda civic")
  const brandName = brands.find((b) => b.code === brand)?.name || ''
  const shownModels = useMemo(() => {
    const list = filterFipeModels(models, filter, brandName)
    // O modelo escolhido continua na lista mesmo fora do filtro
    const chosen = models.find((m) => m.code === model)
    return chosen && !list.includes(chosen) ? [chosen, ...list] : list
  }, [models, filter, model, brandName])

  const value = result?.data
  const yearLabel = fipeYearInfo(years.find((y) => y.code === year) || {}).label

  return (
    <div className="fipe-cascade">
      <div className="admin-segmented fipe-cascade-tipo" role="radiogroup" aria-label="Tipo de veículo">
        {FIPE_TYPES.map((t) => (
          <button key={t.value} type="button" role="radio" aria-checked={tipo === t.value} className={tipo === t.value ? 'is-active' : ''} onClick={() => chooseTipo(t.value)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="admin-form-grid">
        <label>
          Marca
          <select value={brand} onChange={(e) => chooseBrand(e.target.value)} disabled={!brands.length}>
            <option value="">{loading === 'marcas' ? 'Carregando as marcas…' : 'Escolha a marca'}</option>
            {brands.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
          </select>
        </label>
        <label>
          Procurar o modelo
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Ex.: corolla xei"
            disabled={!models.length}
            enterKeyHint="search"
            onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
          />
        </label>
        <label className="fipe-cascade-wide">
          <span>
            Modelo e versão
            {models.length > 0 && <span className="fipe-cascade-count"> · {filter ? `${shownModels.length} de ${models.length}` : `${models.length} na FIPE`}</span>}
          </span>
          <select value={model} onChange={(e) => chooseModel(e.target.value)} disabled={!models.length}>
            <option value="">
              {loading === 'modelos' ? 'Carregando os modelos…' : !brand ? 'Escolha a marca primeiro' : shownModels.length ? 'Escolha o modelo' : 'Nenhum modelo com esse texto'}
            </option>
            {shownModels.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
          </select>
        </label>
        <label className="fipe-cascade-wide">
          Ano-modelo e combustível
          <select value={year} onChange={(e) => chooseYear(e.target.value)} disabled={!years.length}>
            <option value="">{loading === 'anos' ? 'Carregando os anos…' : !model ? 'Escolha o modelo primeiro' : 'Escolha o ano-modelo'}</option>
            {years.map((y) => <option key={y.code} value={y.code}>{fipeYearInfo(y).label}</option>)}
          </select>
        </label>
      </div>

      {loading === 'valor' && <p className="fipe-cascade-status" role="status">Buscando o valor na FIPE…</p>}
      {error && <p className="admin-error fipe-cascade-error" role="alert">{error}</p>}

      {value && (
        <div className="fipe-result" role="status">
          <div className="fipe-result-name">
            <strong>{value.model}</strong>
            <span>{value.brand} · {yearLabel || value.modelYear} · código FIPE {value.code}</span>
          </div>
          <div className="fipe-result-price">
            <strong>{value.value != null ? formatCurrency(value.value) : 'Sem valor'}</strong>
            <span>{value.reference}</span>
          </div>
          {result.stale && (
            <p className="fipe-result-stale">A tabela FIPE não respondeu agora: este é o último valor guardado.</p>
          )}
        </div>
      )}

      <div className="autofill-buttons">
        {value && (
          <button type="button" className="btn btn-primary" onClick={() => onUse({ value, tipo, brandCode: brand, modelCode: model, yearCode: year, stale: Boolean(result.stale) })}>
            Conferir e usar no cadastro
          </button>
        )}
        <button type="button" className="btn btn-outline" onClick={onClose}>Fechar</button>
      </div>
    </div>
  )
}
