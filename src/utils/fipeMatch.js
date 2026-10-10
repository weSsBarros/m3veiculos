// Tabela FIPE: formato comum das duas fontes (BrasilAPI e fipe.api.br) e a
// busca da versão FIPE a partir do que veio do CRLV-e ("I/TOYOTA COROLLA
// XEI20FLEX"), por semelhança de texto (Jaro-Winkler + trigramas). A pessoa
// sempre confirma a versão quando não há um vencedor claro.
// Arquivo sem dependências: também vai copiado para a função veiculo-dados.

export const FIPE_TYPES = [
  { value: 'carros', label: 'Carro' },
  { value: 'motos', label: 'Moto' },
  { value: 'caminhoes', label: 'Caminhão' },
]

export const FIPE_ZERO_KM = 32000

// Tipo FIPE pela categoria do carro no painel
export function fipeTypeForCategory(category) {
  return category === 'moto' ? 'motos' : 'carros'
}

// "R$ 176.046,00" -> 176046 (o sistema trabalha com reais inteiros)
export function parseFipeValue(text) {
  if (typeof text === 'number') return Number.isFinite(text) ? Math.round(text) : null
  const clean = String(text ?? '').replace(/[^\d,]/g, '').replace(',', '.')
  const num = Number.parseFloat(clean)
  return Number.isFinite(num) ? Math.round(num) : null
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

// "outubro de 2026" -> "2026-10" (vazio se não reconhecer)
export function fipeReferenceKey(reference) {
  const text = plain(reference)
  const month = MONTHS.findIndex((m) => text.includes(plain(m)))
  const year = (text.match(/\b(19|20)\d{2}\b/) || [])[0]
  return month >= 0 && year ? `${year}-${String(month + 1).padStart(2, '0')}` : ''
}

// "2026-10" do mês em São Luís (UTC-3, sem horário de verão)
export function currentReferenceKey(now = new Date()) {
  const local = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}`
}

// Ano FIPE: "2023 Flex" / código "2023-5"; 32000 é o zero km
export function fipeYearInfo(year) {
  const code = String(year?.code ?? '')
  const name = String(year?.name ?? '')
  const modelYear = Number.parseInt(code.split('-')[0] || name, 10) || 0
  const fuel = name.replace(/^\s*\d+\s*/, '').trim()
  const zeroKm = modelYear === FIPE_ZERO_KM
  return { code, modelYear, zeroKm, fuel, label: zeroKm ? `Zero km ${fuel}`.trim() : name }
}

// Combustível da FIPE -> lista do painel (vazio quando não há equivalente)
export function fuelFromFipe(fuel) {
  const text = plain(fuel)
  if (!text) return ''
  if (text.includes('flex')) return 'Flex'
  if (text.includes('hibrid')) return 'Híbrido'
  if (text.includes('eletric')) return 'Elétrico'
  if (text.includes('diesel')) return 'Diesel'
  if (text.includes('gnv')) return 'GNV'
  if (text.includes('gasolina')) return 'Gasolina'
  return ''
}

// Câmbio pelo nome FIPE ("... Aut.", "... Mec.", "CVT"): só sugere
export function transmissionFromFipeName(name) {
  const text = ` ${plain(name).replace(/[^a-z0-9]+/g, ' ')} `
  if (/ cvt /.test(text)) return 'Automático CVT'
  if (/ (aut|automatico|automatica|at|at6|at8|at9|dct|dsg|tiptronic) /.test(text)) return 'Automático'
  if (/ (mec|manual|mt) /.test(text)) return 'Manual'
  return ''
}

// Divide o nome FIPE em modelo e versão quando começa pelo modelo do cadastro:
// ("Corolla XEi 2.0 Flex 16V Aut.", "Corolla") -> "XEi 2.0 Flex 16V Aut."
export function versionFromFipeName(name, model) {
  const full = String(name || '').trim()
  const first = full.split(/\s+/)[0] || ''
  const wanted = plain(model).split(/\s+/)[0] || plain(first)
  if (wanted && plain(first) === wanted) return full.slice(first.length).trim() || full
  return full
}

// Modelo (primeira palavra) do nome FIPE: "Corolla XEi 2.0..." -> "Corolla"
export function modelFromFipeName(name) {
  return String(name || '').trim().split(/\s+/)[0] || ''
}

// -- Normalização e semelhança ------------------------------------------------------

function plain(value) {
  return String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

// Tokens comparáveis: separa letras de números ("XEI20FLEX" -> "xei 2.0 flex"),
// cilindrada "20" vira "2.0", tira pontuação e palavras sem valor
const NOISE = new Set(['de', 'da', 'do', 'e', 'p', 'ps', 'v', 'mpi', 'mpfi', 'cv', 'aut', 'mec', 'kit', 'gaso', 'gasolina', 'alcool', 'novo', 'nova', 'new'])

export function fipeTokens(text) {
  let t = plain(text)
    .replace(/(\d),(\d)/g, '$1.$2')
    // válvulas ("16V", "8v") ficam juntas e não viram cilindrada
    .replace(/(\d+)\s*v\b/g, ' $1§ ')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/[^a-z0-9.§]+/g, ' ')
  // cilindrada sem ponto: "20" (de "XEI20FLEX") e "10" -> "2.0" e "1.0"
  t = t.replace(/(^|\s)([1-6])([0-9])(?=\s|$)/g, (m, s, a, b) => `${s}${a}.${b}`)
  return t.replace(/§/g, 'v').split(/\s+/).map((w) => w.replace(/^\.+|\.+$/g, '')).filter((w) => w && !NOISE.has(w))
}

export function jaroWinkler(a, b) {
  const s1 = plain(a)
  const s2 = plain(b)
  if (!s1 || !s2) return 0
  if (s1 === s2) return 1
  const range = Math.max(0, Math.floor(Math.max(s1.length, s2.length) / 2) - 1)
  const m1 = new Array(s1.length).fill(false)
  const m2 = new Array(s2.length).fill(false)
  let matches = 0
  for (let i = 0; i < s1.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(s2.length, i + range + 1); j++) {
      if (m2[j] || s1[i] !== s2[j]) continue
      m1[i] = m2[j] = true
      matches++
      break
    }
  }
  if (!matches) return 0
  let k = 0
  let transpositions = 0
  for (let i = 0; i < s1.length; i++) {
    if (!m1[i]) continue
    while (!m2[k]) k++
    if (s1[i] !== s2[k]) transpositions++
    k++
  }
  const jaro = (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3
  let prefix = 0
  while (prefix < Math.min(4, s1.length, s2.length) && s1[prefix] === s2[prefix]) prefix++
  return jaro + prefix * 0.1 * (1 - jaro)
}

function trigrams(text) {
  const t = `  ${plain(text).replace(/\s+/g, ' ')} `
  const set = new Set()
  for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3))
  return set
}

export function trigramSimilarity(a, b) {
  const A = trigrams(a)
  const B = trigrams(b)
  if (!A.size || !B.size) return 0
  let common = 0
  for (const g of A) if (B.has(g)) common++
  return (2 * common) / (A.size + B.size)
}

// -- Marca: CRLV-e -> FIPE -----------------------------------------------------------

// Siglas usadas no documento (DETRAN) -> marca na FIPE
const BRAND_ALIASES = {
  vw: 'volkswagen', volks: 'volkswagen', volkswagen: 'volkswagen',
  gm: 'chevrolet', chev: 'chevrolet', chevrolet: 'chevrolet',
  mbenz: 'mercedes-benz', mercedes: 'mercedes-benz', 'mercedes-benz': 'mercedes-benz', mb: 'mercedes-benz',
  lr: 'land rover', landrover: 'land rover', 'land rover': 'land rover',
  mmc: 'mitsubishi', mitsubishi: 'mitsubishi',
  caoa: 'caoa chery', 'caoa chery': 'caoa chery', 'caoachery': 'caoa chery', chery: 'chery',
  gwm: 'gwm', 'great wall': 'gwm',
  harley: 'harley-davidson', 'harley-davidson': 'harley-davidson', hd: 'harley-davidson',
}

function brandKey(name) {
  // "VW - VolksWagen" -> "volkswagen"; "GM - Chevrolet" -> "chevrolet"
  const parts = plain(name).split(/\s+-\s+/)
  const main = (parts.length > 1 ? parts.slice(1).join(' ') : parts[0]).replace(/[^a-z0-9 -]/g, '').trim()
  return BRAND_ALIASES[main] || BRAND_ALIASES[main.replace(/\s+/g, '')] || main
}

// Marca do CRLV-e ("I/TOYOTA", "VW", "M.BENZ") -> item da lista FIPE
export function matchFipeBrand(crlvBrand, brands) {
  const raw = plain(crlvBrand).replace(/^i\s*\//, '').replace(/\./g, '').replace(/[^a-z0-9 -]/g, '').trim()
  const wanted = BRAND_ALIASES[raw] || BRAND_ALIASES[raw.replace(/\s+/g, '')] || raw
  if (!wanted || !Array.isArray(brands)) return null
  const exact = brands.find((b) => brandKey(b.name) === wanted)
  if (exact) return exact
  let best = null
  for (const b of brands) {
    const score = jaroWinkler(brandKey(b.name), wanted)
    if (!best || score > best.score) best = { brand: b, score }
  }
  return best && best.score >= 0.9 ? best.brand : null
}

// -- Versão: nome do CRLV-e -> modelos FIPE --------------------------------------------

// Nota de 0 a 1 entre o texto do documento ("COROLLA XEI20FLEX") e um nome FIPE
export function fipeNameScore(crlvModel, fipeName) {
  const a = fipeTokens(crlvModel)
  const b = fipeTokens(fipeName)
  if (!a.length || !b.length) return 0
  // A primeira palavra é o modelo (Corolla, Argo, Gol) e pesa mais
  const head = jaroWinkler(a[0], b[0])
  // Cada palavra do documento procura a mais parecida no nome FIPE
  let covered = 0
  for (const t of a) {
    let best = 0
    for (const u of b) {
      const numeric = /\d/.test(t) || /\d/.test(u)
      best = Math.max(best, t === u ? 1 : numeric ? 0 : jaroWinkler(t, u))
    }
    covered += best >= 0.88 ? best : 0
  }
  const coverage = covered / a.length
  const tri = trigramSimilarity(a.join(' '), b.join(' '))
  return Math.round((head * 0.45 + coverage * 0.35 + tri * 0.2) * 1000) / 1000
}

// Ordena os modelos FIPE pela semelhança com o texto do documento
export function rankFipeModels(crlvModel, models, limit = 8) {
  return (models || [])
    .map((m) => ({ ...m, score: fipeNameScore(crlvModel, m.name) }))
    .filter((m) => m.score > 0.35)
    .sort((x, y) => y.score - x.score || x.name.localeCompare(y.name))
    .slice(0, limit)
}

// Vencedor claro: nota alta e boa distância para o segundo
export function clearWinner(candidates, { min = 0.8, gap = 0.06 } = {}) {
  const [first, second] = candidates || []
  if (!first || first.score < min) return null
  if (second && first.score - second.score < gap) return null
  return first
}

// Ano FIPE que combina com o ano-modelo (e, se der, com o combustível)
export function pickFipeYear(years, modelYear, fuel = '') {
  const wanted = Number(modelYear)
  const list = (years || []).filter((y) => fipeYearInfo(y).modelYear === wanted)
  if (!list.length) return null
  const fuelWanted = fuelFromFipe(fuel)
  return (fuelWanted && list.find((y) => fuelFromFipe(fipeYearInfo(y).fuel) === fuelWanted)) || list[0]
}
