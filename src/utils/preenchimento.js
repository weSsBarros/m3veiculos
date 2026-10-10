// Preenchimento automático do cadastro do carro: monta a revisão do que veio do
// CRLV-e, da tabela FIPE ou da consulta por placa e aplica só o que a pessoa
// marcou. Decisões do Wesley (09/10/2026): campo vazio vem marcado; campo com
// valor diferente aparece com os dois valores, desmarcado.
import { normalizePlate, normalizeChassis, normalizeRenavam } from './documentosVeiculo.js'
import { fuelFromFipe, modelFromFipeName, versionFromFipeName, transmissionFromFipeName, FIPE_ZERO_KM, currentReferenceKey, matchFipeBrand } from './fipeMatch.js'
import { parseAnoModelo } from './anoModelo.js'

export const AUTOFILL_SOURCES = { crlv: 'do CRLV-e', foto: 'da foto do documento', fipe: 'da FIPE', placa: 'da consulta da placa' }

export const AUTOFILL_FIELDS = [
  { key: 'plate', label: 'Placa' },
  { key: 'renavam', label: 'RENAVAM' },
  { key: 'chassis', label: 'Chassi' },
  { key: 'brand', label: 'Marca' },
  { key: 'model', label: 'Modelo' },
  { key: 'version', label: 'Versão' },
  { key: 'category', label: 'Categoria' },
  // Ano/Modelo num campo só ("2021/2022"): aplicar grava também o ano de fabricação
  { key: 'modelYear', label: 'Ano/Modelo' },
  { key: 'fuel', label: 'Combustível' },
  { key: 'transmission', label: 'Câmbio' },
  { key: 'color', label: 'Cor' },
  { key: 'doors', label: 'Portas' },
]

function plainText(value) {
  return String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// Valor comparável de cada campo ("abc-1d23" = "ABC1D23"; "2021 / 2022" = "2021/2022")
function comparable(key, value) {
  if (value === null || value === undefined) return ''
  if (key === 'plate') return normalizePlate(value)
  if (key === 'chassis') return normalizeChassis(value)
  if (key === 'renavam') return normalizeRenavam(value)
  if (key === 'year' || key === 'doors') return Number(value) ? String(Number(value)) : ''
  if (key === 'modelYear') {
    const parsed = parseAnoModelo(value)
    return parsed.ok ? parsed.modelYear : String(value).replace(/\D+/g, '/').replace(/^\/|\/$/g, '')
  }
  return plainText(value)
}

// Linhas da revisão. found: o que veio de fora; car: o cadastro na tela;
// defaults: valores iniciais do carro novo (contam como vazios).
// status: 'novo' (campo vazio, vem marcado), 'diferente' (os dois, desmarcado)
// ou 'igual' (nada a fazer).
export function reviewRows(car, foundFields, { defaults = {} } = {}) {
  // Só o ano de fabricação no documento: vira o Ano/Modelo ("2021" = 2021/2021)
  const found = foundFields && !foundFields.modelYear && foundFields.year ? { ...foundFields, modelYear: String(foundFields.year) } : foundFields
  const rows = []
  for (const { key, label } of AUTOFILL_FIELDS) {
    const next = comparable(key, found?.[key])
    if (!next) continue
    const current = comparable(key, car?.[key])
    const isDefault = key in defaults && current === comparable(key, defaults[key])
    const status = current === next ? 'igual' : !current || isDefault ? 'novo' : 'diferente'
    rows.push({ key, label, value: found[key], current: car?.[key] ?? '', status, checked: status === 'novo' })
  }
  return rows
}

// Aplica as linhas marcadas: devolve o carro novo e os campos preenchidos
export function applyAutofill(car, rows, checkedKeys) {
  const next = { ...car }
  const filled = []
  for (const row of rows) {
    if (row.status === 'igual' || !checkedKeys.has(row.key)) continue
    let value = row.value
    if (row.key === 'year' || row.key === 'doors') value = Number(value)
    if (row.key === 'modelYear') {
      const parsed = parseAnoModelo(value)
      if (parsed.ok) {
        value = parsed.modelYear
        next.year = parsed.year
      }
    }
    if (row.key === 'plate') value = normalizePlate(value)
    if (row.key === 'chassis') value = normalizeChassis(value)
    if (row.key === 'renavam') value = normalizeRenavam(value)
    next[row.key] = value
    filled.push(row.key)
  }
  return { car: next, filled }
}

// "VW - VolksWagen" -> "Volkswagen"; "GM - Chevrolet" -> "Chevrolet"; "Kia Motors" -> "Kia".
// Se a marca estiver na lista do painel, usa a grafia de lá.
export function brandFromFipe(name, known = []) {
  const parts = String(name || '').trim().split(/\s+-\s+/)
  const main = (parts.length > 1 ? parts.slice(1).join(' ') : parts[0]).replace(/\s+motors$/i, '').trim()
  if (!main) return ''
  const hit = known.find((b) => plainText(b) === plainText(main))
  if (hit) return hit
  return main
    .split(/\s+/)
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w.toLowerCase().replace(/(^|-)(\p{L})/gu, (m, s, c) => s + c.toUpperCase())))
    .join(' ')
}

// Marcas comuns fora da lista do painel, na grafia do cadastro
const OTHER_BRANDS = [
  'Mercedes-Benz', 'Mitsubishi', 'Land Rover', 'Caoa Chery', 'Chery', 'GWM', 'Harley-Davidson', 'Kia', 'Peugeot',
  'Citroën', 'BMW', 'Audi', 'Volvo', 'Suzuki', 'Yamaha', 'Kawasaki', 'Ram', 'Dodge', 'JAC', 'BYD', 'Lexus', 'Porsche',
  'Subaru', 'Troller', 'Iveco', 'Mini', 'Jaguar', 'Dafra', 'Shineray',
]

// Marca do CRLV-e ou da consulta por placa ("VW", "GM", "M.BENZ", "I/TOYOTA") na grafia
// do painel ("Volkswagen", "Chevrolet", "Mercedes-Benz", "Toyota"); sem par, fica como veio
export function brandFromDocument(raw, known = []) {
  const text = String(raw || '').trim()
  if (!text) return ''
  const hit = matchFipeBrand(text, [...known, ...OTHER_BRANDS].map((name) => ({ name })))
  return hit ? hit.name : text
}

// Ano/Modelo em texto a partir do ano-modelo da FIPE: com o ano de fabricação do
// cadastro coerente (igual ou um antes), "2021/2022"; senão só "2022"
export function modelYearText(fabYear, modelYear) {
  const my = Number(modelYear)
  if (!my || my === FIPE_ZERO_KM) return ''
  const fab = Number(fabYear)
  return fab && (my === fab || my === fab + 1) ? `${fab}/${my}` : String(my)
}

// Campos do cadastro a partir de um valor FIPE ({ brand, model, modelYear, fuel })
export function fieldsFromFipe(value, { fabYear = 0, knownBrands = [], tipo = 'carros' } = {}) {
  const model = modelFromFipeName(value?.model)
  const fields = {
    brand: brandFromFipe(value?.brand, knownBrands),
    model,
    version: versionFromFipeName(value?.model, model),
    fuel: fuelFromFipe(value?.fuel),
    transmission: tipo === 'motos' ? '' : transmissionFromFipeName(value?.model),
    modelYear: modelYearText(fabYear, value?.modelYear),
  }
  if (tipo === 'motos') fields.category = 'moto'
  return fields
}

// O que fica guardado em cars.fipe
export function fipeRecord(value, { tipo = 'carros', brandCode = '', modelCode = '', yearCode = '' } = {}, checkedOn = '') {
  return {
    code: String(value?.code || ''),
    name: String(value?.model || ''),
    brand: String(value?.brand || ''),
    tipo,
    brandCode: String(brandCode || ''),
    modelCode: String(modelCode || ''),
    yearCode: String(yearCode || ''),
    modelYear: Number(value?.modelYear) || 0,
    fuel: String(value?.fuel || ''),
    value: Number(value?.value) || null,
    reference: String(value?.reference || ''),
    referenceKey: String(value?.referenceKey || ''),
    checkedOn,
  }
}

// O valor guardado é de um mês que já passou?
export function fipeIsOld(fipe, now = new Date()) {
  return Boolean(fipe?.referenceKey) && fipe.referenceKey < currentReferenceKey(now)
}

// Preço do anúncio comparado com a FIPE
export function fipePriceNote(price, fipeValue) {
  const p = Number(price)
  const f = Number(fipeValue)
  if (!p || !f) return ''
  const diff = Math.round(((p - f) / f) * 100)
  if (diff === 0) return 'Seu preço está igual à FIPE.'
  return diff < 0 ? `Seu preço está ${-diff}% abaixo da FIPE.` : `Seu preço está ${diff}% acima da FIPE.`
}

// Filtro do modelo na tabela FIPE em cascata. Cada palavra digitada tem que
// aparecer no nome, sem acento e sem ligar para hífen ("hrv" acha "HR-V");
// as palavras da marca escolhida não contam ("honda civic" = "civic", porque o
// nome na FIPE não tem a marca). Os que começam pela 1ª palavra vêm primeiro.
export function filterFipeModels(models, query, brandName = '') {
  const flat = (text) => plainText(text).replace(/[^a-z0-9]+/g, '')
  const brandWords = new Set(plainText(brandName).split(/[^a-z0-9]+/).filter(Boolean))
  const words = plainText(query).split(/\s+/).filter((w) => flat(w) && !brandWords.has(flat(w)))
  if (!words.length) return models || []
  const found = (models || []).filter((m) => {
    const name = plainText(m.name)
    const compact = flat(m.name)
    return words.every((w) => name.includes(w) || compact.includes(flat(w)))
  })
  const first = flat(words[0])
  return found
    .map((m, i) => ({ m, i, starts: flat(m.name).startsWith(first) }))
    .sort((a, b) => Number(b.starts) - Number(a.starts) || a.i - b.i)
    .map((x) => x.m)
}
