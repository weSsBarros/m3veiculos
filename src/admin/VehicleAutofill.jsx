import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, FileUp, RefreshCcw, ScanSearch, Search } from 'lucide-react'
import { moneyBR, queriesText, readsText } from '../utils/plateCredits.js'
import { readCrlv, readCrlvPhoto, fipeValue, fipeValueByCode, lookupPlate, vehicleDataFeatures } from '../lib/veiculoDadosApi.js'
import { reviewRows, applyAutofill, fieldsFromFipe, fipeRecord, fipeIsOld, brandFromDocument, AUTOFILL_FIELDS } from '../utils/preenchimento.js'
import { normalizePlate, isValidPlate } from '../utils/documentosVeiculo.js'
import { documentPhotoForReading } from '../utils/carPhotos.js'
import { formatCurrency, todayISO } from '../utils/carFormat.js'
import { useAuth } from '../context/AuthContext.jsx'
import FipeCascade from './FipeCascade.jsx'
import AutofillReview from './AutofillReview.jsx'

const LABELS = Object.fromEntries(AUTOFILL_FIELDS.map((f) => [f.key, f.label.toLowerCase()]))

// Campos do cadastro para a revisão: o que veio do documento ou da placa,
// completado com a versão FIPE escolhida (versão, câmbio e, se faltar,
// combustível). fromFipe: os campos que vieram da FIPE (para o destaque certo).
function foundFields(review, car, knownBrands) {
  const fipeSource = review.value || (review.nameOnly ? { brand: review.brandName, model: review.nameOnly } : null)
  const fipe = fipeSource ? fieldsFromFipe(fipeSource, { fabYear: Number(review.base.year) || Number(car.year), knownBrands, tipo: review.tipo }) : {}
  if (review.source === 'fipe') return { fields: fipe, fromFipe: new Set(Object.keys(fipe)) }
  const fields = { ...review.base }
  // Sigla do documento ou da placa ("VW", "GM") na grafia do painel ("Volkswagen")
  if (fields.brand) fields.brand = brandFromDocument(fields.brand, knownBrands)
  const fromFipe = new Set()
  for (const key of ['version', 'transmission', 'fuel']) {
    const useFipe = key === 'version' ? Boolean(fipe.version) : !fields[key] && Boolean(fipe[key])
    if (useFipe) {
      fields[key] = fipe[key]
      fromFipe.add(key)
    }
  }
  return { fields, fromFipe }
}

const isPdf = (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name)

// Revisão do documento lido (PDF ou foto): mesmos campos e versões FIPE
function documentReview(res, { source, title, file, saveLabel, note = '', warnings: extra = [] }) {
  const fipe = res.fipe || {}
  const options = (fipe.candidates || []).map((c) => ({
    id: c.code,
    name: c.name,
    year: c.year,
    detail: c.year ? c.year.label : 'A FIPE não tem o ano do documento nessa versão',
  }))
  const warnings = [...extra, ...(res.warnings || [])]
  if (res.missing?.length) warnings.push(`Não achei no documento: ${res.missing.map((k) => LABELS[k] || k).join(', ')}. Preencha à mão.`)
  if (fipe.error) warnings.push(`${fipe.error} Escolha a versão depois, em "Buscar na tabela FIPE".`)
  else if (!fipe.brand) warnings.push('Não achei essa marca na tabela FIPE. Escolha a versão depois, em "Buscar na tabela FIPE".')
  return {
    source,
    title,
    note: [res.documento?.marcaModelo ? `No documento: ${res.documento.marcaModelo}` : '', note].filter(Boolean).join(' · '),
    base: res.fields || {},
    warnings,
    tipo: fipe.tipo || 'carros',
    brandCode: fipe.brand?.code || '',
    brandName: fipe.brand?.name || '',
    options,
    required: options.length > 0 && !fipe.winner,
    winner: fipe.winner || '',
    choice: '',
    overrides: {},
    file,
    saveLabel,
    savePdf: false,
  }
}

// Bloco "Preencher automaticamente" do cadastro do carro: CRLV-e em PDF, foto do
// documento (lida pela IA), tabela FIPE em cascata e consulta por placa; a foto
// e a placa são pagas com os créditos da loja. Nada muda no cadastro antes de a
// pessoa conferir e clicar em "Aplicar".
export default function VehicleAutofill({ car, defaults, knownBrands, onApply, onFipeUpdate, disabled }) {
  const { isPlatformAdmin } = useAuth()
  const [features, setFeatures] = useState({ placa: false, fotoDocumento: false, loaded: false })
  const [cascadeOpen, setCascadeOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [review, setReview] = useState(null)
  const [plate, setPlate] = useState('')
  const fileRef = useRef(null)
  const photoRef = useRef(null)

  useEffect(() => {
    let active = true
    vehicleDataFeatures().then((f) => active && setFeatures({ ...f, loaded: true }))
    return () => {
      active = false
    }
  }, [])

  function startReview(next) {
    setCascadeOpen(false)
    setError('')
    setInfo('')
    setReview(next)
  }

  // Versão escolhida na revisão: busca o valor FIPE daquele ano (a placa já traz)
  function chooseVersion(id, current = review) {
    const option = current.options.find((o) => o.id === id)
    const base = { ...current, choice: id, value: null, nameOnly: '', valueError: '', valueLoading: false }
    if (id === 'nenhuma' || !option) return setReview(base)
    if (option.value) return setReview({ ...base, value: option.value })
    if (!option.year) return setReview({ ...base, nameOnly: option.name })
    setReview({ ...base, valueLoading: true })
    fipeValue({ tipo: current.tipo, marca: current.brandCode, modelo: option.id, ano: option.year.code })
      .then((res) =>
        setReview((r) => (r?.choice === id
          ? { ...r, value: res.data, valueLoading: false, codes: { brandCode: r.brandCode, modelCode: option.id, yearCode: option.year.code } }
          : r)))
      .catch((err) => setReview((r) => (r?.choice === id ? { ...r, valueLoading: false, nameOnly: option.name, valueError: `${err.message} A versão entra sem o valor FIPE.` } : r)))
  }

  async function readPdf(file) {
    setBusy('crlv')
    setError('')
    setInfo('')
    setReview(null)
    try {
      const res = await readCrlv(file)
      const next = documentReview(res, { source: 'crlv', title: 'Dados do CRLV-e', file })
      startReview(next)
      if (next.winner) chooseVersion(next.winner, next)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!isPdf(file)) {
      setError('Escolha o PDF do CRLV-e, baixado no app Carteira Digital de Trânsito. Para uma foto, use "Foto do documento".')
      return
    }
    readPdf(file)
  }

  // Foto do documento: a IA lê e a leitura sai dos créditos (só quando lê)
  async function handlePhoto(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    // PDF escolhido aqui vai pelo caminho de graça
    if (isPdf(file)) return readPdf(file)
    if (file.type && !file.type.startsWith('image/')) {
      setError('Escolha uma foto do documento (JPG ou PNG).')
      return
    }
    setBusy('foto')
    setError('')
    setInfo('')
    setReview(null)
    try {
      const photo = await documentPhotoForReading(file)
      const res = await readCrlvPhoto(photo)
      if (res.credits) setFeatures((f) => ({ ...f, credits: res.credits }))
      const next = documentReview(res, {
        source: 'foto',
        title: 'Dados da foto do documento',
        file: photo,
        saveLabel: 'Guardar a foto nos documentos do carro',
        note: res.charged ? `Leitura cobrada: ${moneyBR(res.credits?.docPrice ?? 0)}. Saldo: ${moneyBR(res.credits?.balance ?? 0)}.` : '',
        warnings: ['Lido de uma foto: confira a placa, o chassi e o RENAVAM com o documento.'],
      })
      startReview(next)
      if (next.winner) chooseVersion(next.winner, next)
    } catch (err) {
      setError(err.message)
      if (err.reason === 'sem_credito') vehicleDataFeatures().then(setFeatures)
    } finally {
      setBusy('')
    }
  }

  async function handlePlate() {
    const value = normalizePlate(plate)
    if (!isValidPlate(value)) {
      setError('Placa fora do padrão (ex.: ABC1234 ou ABC1D23).')
      return
    }
    setBusy('placa')
    setError('')
    setInfo('')
    setReview(null)
    try {
      const res = await lookupPlate(value)
      if (res.credits) setFeatures((f) => ({ ...f, credits: res.credits }))
      const options = (res.fipeCandidates || []).map((c) => ({
        id: c.code,
        name: c.name,
        detail: [c.modelYear, c.fuel, c.value != null ? formatCurrency(c.value) : ''].filter(Boolean).join(' · '),
        value: { code: c.code, brand: c.brand, model: c.name, modelYear: c.modelYear, fuel: c.fuel, value: c.value, reference: c.reference, referenceKey: c.referenceKey },
      }))
      const winner = options.length === 1 ? options[0].id : (res.fipeCandidates || []).find((c) => c.principal)?.code
      const next = {
        source: 'placa',
        title: `Dados da placa ${value}`,
        note: res.charged
          ? `Consulta cobrada: ${moneyBR(res.credits?.price ?? 0)}. Saldo: ${moneyBR(res.credits?.balance ?? 0)}.`
          : 'Placa já consultada pela loja nos últimos 30 dias: sem cobrança.',
        base: res.vehicle || {},
        warnings: [],
        tipo: res.vehicle?.category === 'moto' ? 'motos' : 'carros',
        options,
        required: options.length > 1 && !winner,
        choice: '',
        overrides: {},
      }
      startReview(next)
      if (winner) chooseVersion(winner, next)
    } catch (err) {
      setError(err.message)
      // Saldo pode ter mudado (outra pessoa consultou, ou acabou)
      if (err.reason === 'sem_credito') vehicleDataFeatures().then(setFeatures)
    } finally {
      setBusy('')
    }
  }

  function handleFipe({ value, tipo, brandCode, modelCode, yearCode, stale }) {
    const price = value.value != null ? ` · ${formatCurrency(value.value)} (${value.reference})` : ''
    startReview({
      source: 'fipe',
      title: 'Dados da tabela FIPE',
      note: `${value.model} · código ${value.code}${price}`,
      base: {},
      warnings: stale ? ['A tabela FIPE não respondeu agora: o valor é o último guardado.'] : [],
      tipo,
      options: [],
      required: false,
      choice: '',
      value,
      codes: { brandCode, modelCode, yearCode },
      overrides: {},
    })
  }

  async function refreshFipe() {
    const f = car.fipe || {}
    setBusy('atualizar')
    setError('')
    setInfo('')
    try {
      const res = f.brandCode && f.modelCode
        ? await fipeValue({ tipo: f.tipo || 'carros', marca: f.brandCode, modelo: f.modelCode, ano: f.yearCode })
        : await fipeValueByCode({ tipo: f.tipo || 'carros', codigo: f.code, ano: f.yearCode, combustivel: f.fuel })
      const v = res.data
      onFipeUpdate({ ...f, value: v.value, reference: v.reference, referenceKey: v.referenceKey, checkedOn: todayISO() })
      setInfo(res.stale
        ? `A tabela FIPE não respondeu agora: ficou o último valor guardado (${v.reference}).`
        : `Valor FIPE atualizado (${v.reference}). Salve o carro para guardar.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const found = review ? foundFields(review, car, knownBrands) : null
  const rows = found ? reviewRows(car, found.fields, { defaults }) : []
  const checked = new Set(rows.filter((r) => r.status !== 'igual' && (review.overrides[r.key] ?? r.checked)).map((r) => r.key))

  function toggle(key) {
    setReview((r) => ({ ...r, overrides: { ...r.overrides, [key]: !checked.has(key) } }))
  }

  function apply() {
    const { car: next, filled } = applyAutofill(car, rows, checked)
    const fipe = review.value?.code ? fipeRecord(review.value, { tipo: review.tipo, ...(review.codes || {}) }, todayISO()) : null
    const sources = Object.fromEntries(filled.map((k) => [k, found.fromFipe.has(k) ? 'fipe' : review.source]))
    onApply({ car: fipe ? { ...next, fipe } : next, sources, pdf: review.savePdf ? review.file : null })
    setInfo(`${filled.length ? `${filled.length} ${filled.length === 1 ? 'campo preenchido' : 'campos preenchidos'}` : 'Valor FIPE guardado'}. Confira os campos marcados e salve o carro.`)
    setReview(null)
  }

  const fipe = car.fipe || {}
  const hasFipe = Boolean(fipe.code)
  const canRefresh = hasFipe && /^\d{4,5}-\d{1,2}$/.test(fipe.yearCode || '')
  const working = Boolean(busy) || disabled
  // Créditos (seção 71), os mesmos para a placa e a foto do documento:
  // { balance, price, queries, docPrice, docReads, admin }
  const credits = features.credits || null
  const covers = (price) => Boolean(credits && price > 0 && credits.balance + 1e-9 >= price)
  const hasCredit = covers(credits?.price)
  const hasDocCredit = covers(credits?.docPrice)
  const paid = [features.placa && 'placa', features.fotoDocumento && 'foto'].filter(Boolean)
  const anyCredit = (features.placa && hasCredit) || (features.fotoDocumento && hasDocCredit)
  const prices = credits
    ? [
        features.placa && `${queriesText(credits.queries)} de placa (${moneyBR(credits.price)} cada)`,
        features.fotoDocumento && `${readsText(credits.docReads)} de foto (${moneyBR(credits.docPrice)} cada)`,
      ].filter(Boolean)
    : []

  return (
    <section className="admin-form-section autofill">
      <h2>Preencher automaticamente</h2>
      <p className="admin-form-hint">
        {features.fotoDocumento
          ? 'Importe o CRLV-e em PDF, tire uma foto do documento ou escolha o carro na tabela FIPE.'
          : 'Importe o CRLV-e ou escolha o carro na tabela FIPE.'}{' '}
        Você confere tudo antes de aplicar, e o cadastro só muda de verdade ao salvar.
      </p>

      {hasFipe && (
        <div className="fipe-saved">
          <div className="fipe-saved-name">
            <strong>{fipe.name}</strong>
            <span>{[`FIPE ${fipe.code}`, fipe.modelYear === 32000 ? 'Zero km' : fipe.modelYear, fipe.fuel].filter(Boolean).join(' · ')}</span>
          </div>
          <div className="fipe-saved-price">
            <strong>{fipe.value != null ? formatCurrency(fipe.value) : 'Sem valor'}</strong>
            <span className={fipeIsOld(fipe) ? 'is-old' : ''}>{fipe.reference}{fipeIsOld(fipe) ? ' · mês passado' : ''}</span>
          </div>
          {canRefresh && (
            <button type="button" className="admin-action-btn" onClick={refreshFipe} disabled={working}>
              <RefreshCcw size={14} aria-hidden="true" /> {busy === 'atualizar' ? 'Atualizando…' : 'Atualizar valor'}
            </button>
          )}
        </div>
      )}

      <div className="autofill-actions">
        <button type="button" className="btn btn-outline" onClick={() => fileRef.current?.click()} disabled={working}>
          <FileUp size={16} aria-hidden="true" /> {busy === 'crlv' ? 'Lendo o CRLV-e…' : 'Importar CRLV-e (PDF)'}
        </button>
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={handleFile} />
        {features.fotoDocumento && (
          <>
            <button type="button" className="btn btn-outline" onClick={() => photoRef.current?.click()} disabled={working || !hasDocCredit}>
              <Camera size={16} aria-hidden="true" /> {busy === 'foto' ? 'Lendo a foto…' : 'Foto do documento'}
            </button>
            <input ref={photoRef} type="file" accept="image/*" hidden onChange={handlePhoto} />
          </>
        )}
        <button
          type="button"
          className={`btn btn-outline${cascadeOpen ? ' is-open' : ''}`}
          aria-expanded={cascadeOpen}
          onClick={() => {
            setCascadeOpen((v) => !v)
            setReview(null)
            setError('')
            setInfo('')
          }}
          disabled={working}
        >
          <Search size={16} aria-hidden="true" /> Buscar na tabela FIPE
        </button>
      </div>

      {/* Só para o dono da plataforma: por que a consulta por placa não aparece */}
      {isPlatformAdmin && features.loaded && !features.placa && (
        <p className="admin-form-hint autofill-admin-note">
          Consulta por placa desligada: falta cadastrar a chave da APIBrasil (segredos PLACA_PROVEDOR = apibrasil e
          APIBRASIL_TOKEN nas Edge Functions do Supabase). Só você vê este aviso.
        </p>
      )}

      {paid.length > 0 && (
        <div className="autofill-plate-block">
          <p className="autofill-credits">
            {credits && credits.balance > 0 ? (
              <>
                Créditos: saldo <strong>{moneyBR(credits.balance)}</strong>
                {prices.map((p) => <span key={p}> · {p}</span>)}
              </>
            ) : (
              <>
                Créditos: <strong>sem saldo</strong>
                {credits && ` (${[
                  features.placa && `placa ${moneyBR(credits.price)}`,
                  features.fotoDocumento && `foto do documento ${moneyBR(credits.docPrice)}`,
                ].filter(Boolean).join(' · ')})`}.
              </>
            )}{' '}
            {credits?.admin ? (
              <Link className="admin-link-btn" to="/admin/mensalidade#creditos">Comprar créditos</Link>
            ) : (
              !anyCredit && <span>Peça ao administrador da loja para comprar créditos.</span>
            )}
          </p>
          {features.placa && (
            <div className="autofill-plate">
              <input
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (hasCredit) handlePlate()
                  }
                }}
                placeholder="Placa"
                aria-label="Placa para consultar"
                maxLength={8}
                autoCapitalize="characters"
                enterKeyHint="search"
              />
              <button type="button" className="btn btn-outline" onClick={handlePlate} disabled={working || !plate || !hasCredit}>
                <ScanSearch size={16} aria-hidden="true" /> {busy === 'placa' ? 'Consultando…' : 'Consultar placa'}
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="admin-error autofill-message" role="alert">{error}</p>}
      {info && <p className="admin-success autofill-message" role="status">{info}</p>}

      {cascadeOpen && (
        <FipeCascade
          initialTipo={car.category === 'moto' ? 'motos' : 'carros'}
          onUse={handleFipe}
          onClose={() => setCascadeOpen(false)}
        />
      )}

      {review && (
        <AutofillReview
          title={review.title}
          note={review.note}
          rows={rows}
          checked={checked}
          onToggle={toggle}
          warnings={review.warnings}
          versions={review.options.length ? {
            options: review.options,
            choice: review.choice,
            required: review.required,
            onChoose: (id) => chooseVersion(id),
            loading: review.valueLoading,
            error: review.valueError,
            value: review.value,
          } : review.value ? { options: [], value: review.value } : null}
          saveFile={review.file ? { label: review.saveLabel, checked: review.savePdf, onChange: (v) => setReview((r) => ({ ...r, savePdf: v })) } : null}
          onApply={apply}
          onCancel={() => setReview(null)}
        />
      )}
    </section>
  )
}
