// Consulta por placa (paga): interface de provedor + adaptador da APIBrasil.
// DESLIGADA por padrão: a função veiculo-dados só chama quando o plano da loja
// tem "placa", o segredo PLACA_PROVEDOR vale "apibrasil" e há token
// (APIBRASIL_TOKEN). Usa só produtos com dados do VEÍCULO (Agregados Própria e
// Placa FIPE); nada de proprietário, contatos ou histórico de donos.
// Interface: { name, lookupByPlate(placa) -> { vehicle, fipeCandidates } }.
// Arquivo copiado para a função veiculo-dados.
import { normalizePlate, isValidPlate, normalizeChassis, isValidChassis } from './documentosVeiculo.js'
import { fuelFromFipe, parseFipeValue, fipeReferenceKey, transmissionFromFipeName } from './fipeMatch.js'
import { fuelFromCrlv } from './crlvParser.js'

const APIBRASIL_URL = 'https://gateway.apibrasil.io/api/v2/consulta/veiculos/credits'

export class PlacaError extends Error {
  // code: 'placa' (placa inválida), 'saldo' (402), 'recusado' (erro da API), 'fora' (rede, 5xx, tempo)
  constructor(message, code = 'fora') {
    super(message)
    this.code = code
  }
}

function titleCase(text) {
  return String(text || '').trim().toLowerCase().replace(/(^|[\s/-])(\p{L})/gu, (m, s, c) => s + c.toUpperCase())
}

// Só os campos do veículo da resposta "Agregados Própria" (o resto é descartado)
export function vehicleFromAgregados(data = {}) {
  const year = Number(data.ano_fabricacao) || 0
  const modelYear = Number(data.ano_modelo) || 0
  const chassis = normalizeChassis(data.chassi)
  const doors = Number(data.quantidade_portas) || 0
  const especie = String(data.especie || data.tipo_veiculo || '').toUpperCase()
  return {
    plate: normalizePlate(data.placaMercosul || data.placa),
    brand: titleCase(data.marca),
    model: titleCase(data.modelo),
    version: String(data.versao || '').trim(),
    year,
    modelYear: year && modelYear ? `${year}/${modelYear}` : modelYear ? String(modelYear) : '',
    modelYearNumber: modelYear,
    color: titleCase(data.cor),
    // Vem no formato do Denatran ("ALCOOL/GASOLINA"), como no CRLV
    fuel: fuelFromCrlv(data.combustivel) || fuelFromFipe(data.combustivel),
    transmission: transmissionFromFipeName(data.transmissao_descricao),
    chassis: isValidChassis(chassis) ? chassis : '',
    doors: doors >= 2 && doors <= 5 ? doors : 0,
    category: /MOTO|CICLOMOTOR|MOTONETA/.test(especie) ? 'moto' : '',
  }
}

// Candidatos FIPE da resposta "Placa FIPE"
export function candidatesFromPlacaFipe(data = {}) {
  const results = Array.isArray(data.resultados) ? data.resultados : []
  return results
    .map((r) => ({
      code: String(r.codigoFipe || ''),
      name: String(r.modelo || '').trim(),
      brand: String(r.marca || '').trim(),
      modelYear: Number(r.anoModelo) || 0,
      fuel: String(r.combustivel || '').trim(),
      value: parseFipeValue(r.valor),
      reference: String(r.mesReferencia || '').trim(),
      referenceKey: fipeReferenceKey(r.mesReferencia),
      principal: r.principal === true,
    }))
    .filter((c) => /^\d{6}-\d$/.test(c.code))
    .sort((a, b) => Number(b.principal) - Number(a.principal))
}

// Lista branca do que pode ir para o cache e para o painel
const VEHICLE_KEYS = ['plate', 'brand', 'model', 'version', 'year', 'modelYear', 'modelYearNumber', 'color', 'fuel', 'transmission', 'chassis', 'doors', 'category']
const CANDIDATE_KEYS = ['code', 'name', 'brand', 'modelYear', 'fuel', 'value', 'reference', 'referenceKey', 'principal']

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]))

export function sanitizePlateResult(result = {}) {
  return {
    vehicle: pick(result.vehicle, VEHICLE_KEYS),
    fipeCandidates: (result.fipeCandidates || []).map((c) => pick(c, CANDIDATE_KEYS)),
  }
}

async function postOnce(fetchImpl, token, body, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res
  try {
    res = await fetchImpl(APIBRASIL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch {
    throw new PlacaError('A consulta de placa não respondeu agora.', 'fora')
  } finally {
    clearTimeout(timer)
  }
  if (res.status === 402) throw new PlacaError('Acabou o saldo da consulta de placa (APIBrasil). Avise a WB.Dev.', 'saldo')
  if (res.status >= 500) throw new PlacaError('A consulta de placa está fora do ar agora.', 'fora')
  let json
  try {
    json = await res.json()
  } catch {
    throw new PlacaError('A consulta de placa respondeu algo inesperado.', res.status >= 400 ? 'recusado' : 'fora')
  }
  // A APIBrasil devolve erro com HTTP 200: vale o campo "error"
  if (!res.ok || json?.error !== false) {
    const message = String(json?.message || '').slice(0, 160)
    throw new PlacaError(message ? `A consulta de placa recusou: ${message}` : 'A consulta de placa recusou o pedido.', 'recusado')
  }
  return json.data || {}
}

// Cada chamada é cobrada: repete só uma vez e só em falha de rede/5xx
async function post(fetchImpl, token, body, timeoutMs) {
  try {
    return await postOnce(fetchImpl, token, body, timeoutMs)
  } catch (err) {
    if (err instanceof PlacaError && err.code === 'fora') return postOnce(fetchImpl, token, body, timeoutMs)
    throw err
  }
}

export function makeApiBrasilProvider({ fetch: fetchImpl = globalThis.fetch, token, homolog = false, timeoutMs = 15000 } = {}) {
  if (!token) throw new PlacaError('Falta o token da consulta de placa.', 'recusado')
  return {
    name: 'apibrasil',
    async lookupByPlate(placa) {
      const plate = normalizePlate(placa)
      if (!isValidPlate(plate)) throw new PlacaError('Placa fora do padrão (ex.: ABC1234 ou ABC1D23).', 'placa')
      const dados = await post(fetchImpl, token, { tipo: 'agregados-propria', placa: plate, homolog }, timeoutMs)
      let fipeCandidates = []
      try {
        fipeCandidates = candidatesFromPlacaFipe(await post(fetchImpl, token, { tipo: 'fipe-chassi', placa: plate, homolog }, timeoutMs))
      } catch (err) {
        if (err instanceof PlacaError && err.code === 'saldo') throw err
        // Sem os candidatos FIPE, a pessoa escolhe na tabela FIPE
      }
      return sanitizePlateResult({ vehicle: { ...vehicleFromAgregados(dados), plate }, fipeCandidates })
    },
  }
}

// Provedor de mentira (testes e telas sem banco): { placa: { vehicle, fipeCandidates } }
export function makeMockProvider(answers = {}) {
  return {
    name: 'simulado',
    async lookupByPlate(placa) {
      const plate = normalizePlate(placa)
      if (!isValidPlate(plate)) throw new PlacaError('Placa fora do padrão (ex.: ABC1234 ou ABC1D23).', 'placa')
      const found = answers[plate]
      if (!found) throw new PlacaError('Placa não encontrada.', 'recusado')
      return sanitizePlateResult(found)
    },
  }
}
