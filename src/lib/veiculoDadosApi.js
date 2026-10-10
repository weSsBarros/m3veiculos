import { supabase } from './supabaseClient.js'

// Preenchimento automático do cadastro do carro pela Edge Function
// "veiculo-dados": tabela FIPE (com cache no banco), leitura do CRLV-e em PDF,
// leitura da foto do documento pela IA e consulta por placa (as duas pagas com
// os créditos da loja). O painel nunca chama a FIPE, a IA nem a APIBrasil direto.

const OFFLINE = 'Sem conexão com o servidor agora. Preencha à mão ou tente de novo.'

async function call(body) {
  const { data, error } = await supabase.functions.invoke('veiculo-dados', { body })
  if (error) {
    let message = error.name === 'FunctionsFetchError' ? OFFLINE : error.message
    let reason = ''
    try {
      const payload = await error.context?.json()
      if (payload?.error) message = payload.error
      reason = payload?.motivo || ''
    } catch {
      // resposta sem corpo JSON
    }
    const err = new Error(message)
    err.reason = reason
    throw err
  }
  if (data?.error) throw new Error(data.error)
  return data
}

// Listas da FIPE ficam guardadas enquanto a tela estiver aberta
const lists = new Map()

// nivel: 'marcas' | 'modelos' | 'anos'; params: { tipo, marca, modelo }
export async function fipeList(nivel, params) {
  const key = [nivel, params.tipo, params.marca, params.modelo].filter(Boolean).join('/')
  if (!lists.has(key)) {
    const promise = call({ acao: 'fipe', nivel, ...params }).then((r) => r.data)
    lists.set(key, promise)
    promise.catch(() => lists.delete(key))
  }
  return lists.get(key)
}

// Valor FIPE pela cascata: { tipo, marca, modelo, ano } -> { data, source, stale? }
export function fipeValue(params) {
  return call({ acao: 'fipe', nivel: 'valor', ...params })
}

// Valor FIPE pelo código guardado no carro: { tipo, codigo, ano, combustivel }
export function fipeValueByCode(params) {
  return call({ acao: 'fipe', nivel: 'codigo', ...params })
}

// PDF do CRLV-e -> dados do veículo + versões FIPE parecidas (o PDF não fica guardado)
export function readCrlv(file) {
  const form = new FormData()
  form.append('arquivo', file)
  return call(form)
}

// Foto do documento (já reduzida por documentPhotoForReading) -> os mesmos dados
// do PDF, lidos pela IA e cobrados dos créditos: { ..., charged, credits }
export function readCrlvPhoto(file) {
  const form = new FormData()
  form.append('acao', 'crlv_foto')
  form.append('arquivo', file)
  return call(form)
}

// Consulta paga por placa -> { vehicle, fipeCandidates, fromCache }
export function lookupPlate(placa) {
  return call({ acao: 'placa', placa })
}

// O que está ligado para a loja e o saldo dos créditos:
// { placa, fotoDocumento, credits: { balance, price, queries, docPrice, docReads, packages, admin } | null }
export function vehicleDataFeatures() {
  return call({ acao: 'recursos' }).catch(() => ({ placa: false, fotoDocumento: false, credits: null }))
}
