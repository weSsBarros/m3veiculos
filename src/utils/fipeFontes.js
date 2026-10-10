// Fontes da tabela FIPE para a função veiculo-dados: BrasilAPI (principal,
// gratuita) e fipe.api.br (reserva; 500 consultas por dia sem token, 1.000 com o
// token gratuito no segredo FIPE_API_TOKEN). As duas usam os códigos oficiais
// da FIPE (marca 56, modelo 5194, ano "2023-5"), então uma cobre a outra.
// O painel nunca chama a FIPE: só a função, com cache no banco (fipe_cache).
// Arquivo copiado para a função veiculo-dados.
import { parseFipeValue, fipeReferenceKey, currentReferenceKey, matchFipeBrand, rankFipeModels, clearWinner, pickFipeYear, fipeYearInfo } from './fipeMatch.js'

export const FIPE_LEVELS = ['marcas', 'modelos', 'anos', 'valor', 'codigo']
const P2_TYPES = { carros: 'cars', motos: 'motorcycles', caminhoes: 'trucks' }
const LIST_TTL_MS = 30 * 24 * 60 * 60 * 1000
const PRICE_RETRY_MS = 24 * 60 * 60 * 1000

export class FipeError extends Error {
  // reason: 'limite' (429), 'fora' (fora do ar, tempo esgotado), 'invalido' (pedido errado)
  constructor(message, reason = 'fora') {
    super(message)
    this.reason = reason
  }
}

const MESSAGES = {
  limite: 'A tabela FIPE atingiu o limite de consultas por agora. Preencha à mão ou tente mais tarde.',
  fora: 'A tabela FIPE está fora do ar agora. Preencha à mão ou tente de novo em alguns minutos.',
  invalido: 'Não achei esse item na tabela FIPE.',
}

// Confere os parâmetros antes de montar o endereço
export function checkFipeParams(level, params = {}) {
  const { tipo, marca, modelo, ano, codigo } = params
  const ok = FIPE_LEVELS.includes(level) && Object.hasOwn(P2_TYPES, String(tipo))
    && (level === 'marcas' || level === 'codigo' || /^\d{1,6}$/.test(String(marca ?? '')))
    && (!['anos', 'valor'].includes(level) || /^\d{1,7}$/.test(String(modelo ?? '')))
    && (!['valor', 'codigo'].includes(level) || /^\d{4,5}-\d{1,2}$/.test(String(ano ?? '')))
    && (level !== 'codigo' || /^\d{6}-\d$/.test(String(codigo ?? '')))
  if (!ok) throw new FipeError(MESSAGES.invalido, 'invalido')
}

// Valor no formato comum
function normalizeValue(v) {
  const reference = String(v.reference || '').trim()
  return {
    code: String(v.code || ''),
    brand: String(v.brand || ''),
    model: String(v.model || ''),
    modelYear: Number(v.modelYear) || 0,
    fuel: String(v.fuel || ''),
    value: parseFipeValue(v.price),
    reference,
    referenceKey: fipeReferenceKey(reference),
  }
}

async function getJson(fetchImpl, url, { headers = {}, timeoutMs = 8000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res
  try {
    res = await fetchImpl(url, { headers: { Accept: 'application/json', ...headers }, signal: controller.signal })
  } catch {
    throw new FipeError(MESSAGES.fora, 'fora')
  } finally {
    clearTimeout(timer)
  }
  if (res.status === 429) throw new FipeError(MESSAGES.limite, 'limite')
  if (res.status >= 500) throw new FipeError(MESSAGES.fora, 'fora')
  if (res.status === 400 || res.status === 404) throw new FipeError(MESSAGES.invalido, 'invalido')
  if (!res.ok) throw new FipeError(MESSAGES.fora, 'fora')
  let body
  try {
    body = await res.json()
  } catch {
    throw new FipeError(MESSAGES.fora, 'fora')
  }
  // Erro que vem com 200 ("Fonte de dados FIPE temporariamente indisponível")
  if (body && !Array.isArray(body) && typeof body === 'object' && (body.error || (body.message && (body.type || body.name)))) {
    throw new FipeError(MESSAGES.fora, 'fora')
  }
  return body
}

function list(items, code, name) {
  if (!Array.isArray(items)) throw new FipeError(MESSAGES.fora, 'fora')
  return items.map((i) => ({ code: String(i[code]), name: String(i[name] ?? '').trim() })).filter((i) => i.code && i.name)
}

// BrasilAPI: https://brasilapi.com.br/api/fipe/... (documentação em brasilapi.com.br/docs#tag/FIPE)
function brasilApi(fetchImpl, base = 'https://brasilapi.com.br/api') {
  const get = (path) => getJson(fetchImpl, `${base}${path}`)
  return {
    name: 'brasilapi',
    async marcas({ tipo }) { return list(await get(`/fipe/marcas/v1/${tipo}`), 'valor', 'nome') },
    async modelos({ tipo, marca }) { return list(await get(`/fipe/veiculos/v1/${tipo}/${marca}`), 'valor', 'modelo') },
    async anos({ tipo, marca, modelo }) { return list(await get(`/fipe/anos/v1/${tipo}/${marca}/${modelo}`), 'valor', 'nome') },
    async valor({ tipo, marca, modelo, ano }) {
      const v = await get(`/fipe/detalhes/v1/${tipo}/${marca}/${modelo}/${ano}`)
      return normalizeValue({ code: v.codigoFipe, brand: v.marca, model: v.modelo, modelYear: v.anoModelo, fuel: v.combustivel, price: v.valor, reference: v.mesReferencia })
    },
    // Pelo código FIPE (atualizar o valor de um carro já salvo; placa)
    async codigo({ codigo, ano, combustivel = '' }) {
      const items = await get(`/fipe/preco/v1/${codigo}`)
      if (!Array.isArray(items)) throw new FipeError(MESSAGES.fora, 'fora')
      const year = Number(String(ano).split('-')[0])
      const same = items.filter((i) => Number(i.anoModelo) === year)
      const v = same.find((i) => !combustivel || String(i.combustivel).toLowerCase() === String(combustivel).toLowerCase()) || same[0]
      if (!v) throw new FipeError(MESSAGES.invalido, 'invalido')
      return normalizeValue({ code: v.codigoFipe, brand: v.marca, model: v.modelo, modelYear: v.anoModelo, fuel: v.combustivel, price: v.valor, reference: v.mesReferencia })
    },
  }
}

// fipe.api.br (FIPE API v2 da Parallelum): https://fipe.parallelum.com.br/api/v2
function parallelum(fetchImpl, token = '', base = 'https://fipe.parallelum.com.br/api/v2') {
  const headers = token ? { 'X-Subscription-Token': token } : {}
  const get = (path) => getJson(fetchImpl, `${base}${path}`, { headers })
  const valueFrom = (v) => normalizeValue({ code: v.codeFipe, brand: v.brand, model: v.model, modelYear: v.modelYear, fuel: v.fuel, price: v.price, reference: v.referenceMonth })
  return {
    name: 'fipe.api.br',
    async marcas({ tipo }) { return list(await get(`/${P2_TYPES[tipo]}/brands`), 'code', 'name') },
    async modelos({ tipo, marca }) { return list(await get(`/${P2_TYPES[tipo]}/brands/${marca}/models`), 'code', 'name') },
    async anos({ tipo, marca, modelo }) { return list(await get(`/${P2_TYPES[tipo]}/brands/${marca}/models/${modelo}/years`), 'code', 'name') },
    async valor({ tipo, marca, modelo, ano }) { return valueFrom(await get(`/${P2_TYPES[tipo]}/brands/${marca}/models/${modelo}/years/${ano}`)) },
    async codigo({ tipo, codigo, ano }) { return valueFrom(await get(`/${P2_TYPES[tipo]}/${codigo}/years/${ano}`)) },
  }
}

// Fontes na ordem de uso: a principal e a reserva
export function makeFipeSources({ fetch: fetchImpl = globalThis.fetch, token = '' } = {}) {
  return [brasilApi(fetchImpl), parallelum(fetchImpl, token)]
}

// Tenta a principal; em falha (fora do ar, tempo, limite, item não achado), a reserva
export async function fipeQuery(sources, level, params) {
  checkFipeParams(level, params)
  const reasons = []
  for (const source of sources) {
    try {
      const data = await source[level](params)
      if (level !== 'valor' && level !== 'codigo' && !data.length) throw new FipeError(MESSAGES.invalido, 'invalido')
      return { data, source: source.name }
    } catch (err) {
      reasons.push(err instanceof FipeError ? err.reason : 'fora')
    }
  }
  const reason = reasons.includes('limite') ? 'limite' : reasons.every((r) => r === 'invalido') ? 'invalido' : 'fora'
  throw new FipeError(MESSAGES[reason], reason)
}

// Versões FIPE para o que veio do CRLV-e (parseCrlvText): marca pela lista da
// FIPE, modelos por semelhança e, deles, só os que têm o ano-modelo do documento.
// query(level, params) -> lista/valor (com cache). winner = código do modelo
// quando há um vencedor claro; senão a pessoa escolhe.
export async function fipeCandidatesForCrlv(parsed, query, { limit = 5 } = {}) {
  const fields = parsed?.fields || {}
  const raw = parsed?.raw || {}
  const tipo = fields.category === 'moto' ? 'motos' : 'carros'
  const result = { tipo, brand: null, candidates: [], winner: null }
  const brand = matchFipeBrand(raw.brand || fields.brand, await query('marcas', { tipo }))
  if (!brand) return result
  result.brand = { code: brand.code, name: brand.name }
  const text = raw.modelText || [fields.model, fields.version].filter(Boolean).join(' ')
  const ranked = rankFipeModels(text, await query('modelos', { tipo, marca: brand.code }), limit)
  const modelYear = Number(fields.modelYearNumber) || 0
  const withYear = await Promise.all(ranked.map(async (m) => {
    if (!modelYear) return { code: m.code, name: m.name, score: m.score, year: null }
    let years = []
    try {
      years = await query('anos', { tipo, marca: brand.code, modelo: m.code })
    } catch (err) {
      if (!(err instanceof FipeError) || err.reason !== 'invalido') throw err
    }
    const year = pickFipeYear(years, modelYear, fields.fuel)
    return year ? { code: m.code, name: m.name, score: m.score, year: fipeYearInfo(year) } : null
  }))
  const found = withYear.filter(Boolean)
  // Nenhum com o ano do documento: mostra os parecidos, sem ano e sem vencedor
  result.candidates = found.length ? found : ranked.map((m) => ({ code: m.code, name: m.name, score: m.score, year: null }))
  result.winner = found.length ? clearWinner(found)?.code ?? null : null
  return result
}

// Chave do cache: a mesma para as duas fontes e para todas as lojas
export function fipeCacheKey(level, { tipo, marca, modelo, ano, codigo } = {}) {
  if (level === 'marcas') return `marcas/${tipo}`
  if (level === 'modelos') return `modelos/${tipo}/${marca}`
  if (level === 'anos') return `anos/${tipo}/${marca}/${modelo}`
  if (level === 'valor') return `valor/${tipo}/${marca}/${modelo}/${ano}`
  return `codigo/${tipo}/${codigo}/${ano}`
}

// Listas valem 30 dias; o valor vale enquanto for do mês atual (se a FIPE ainda
// não publicou o mês novo, tenta de novo no dia seguinte)
export function fipeCacheFresh(level, row, now = new Date()) {
  if (!row || !row.fetched_at) return false
  const age = now.getTime() - new Date(row.fetched_at).getTime()
  if (level === 'marcas' || level === 'modelos' || level === 'anos') return age < LIST_TTL_MS
  if (fipeReferenceKey(row.reference) === currentReferenceKey(now)) return true
  return age < PRICE_RETRY_MS
}
