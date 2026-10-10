// Edge Function "veiculo-dados" — preenchimento automático do cadastro do carro.
// Ações (POST com JSON { acao, ... }; o CRLV-e vai como multipart, campo "arquivo"):
//  - fipe: tabela FIPE em cascata (marcas, modelos, anos, valor) e pelo código
//    FIPE. BrasilAPI com reserva na fipe.api.br; cache no banco (fipe_cache),
//    o mesmo para todas as lojas: listas por 30 dias, valor até virar o mês de
//    referência. Fontes fora do ar: usa o que estiver no cache, mesmo vencido.
//  - crlv: lê o texto do PDF do CRLV-e (unpdf) e devolve só os dados do VEÍCULO
//    e as versões FIPE parecidas. O PDF não é guardado aqui; nome e CPF/CNPJ do
//    dono são apagados antes da leitura e nunca voltam, nem vão para log ou banco.
//    PDF escaneado (sem texto) responde "sem_texto"; OCR fica para depois (ver ocr).
//  - placa: consulta paga (APIBrasil: Agregados Própria + Placa FIPE), ligada com
//    os segredos PLACA_PROVEDOR=apibrasil e APIBRASIL_TOKEN. A loja paga com os
//    créditos pré-pagos (seção 71): plate_credit_hold reserva o preço antes e
//    plate_credit_release devolve se não achar o carro ou der erro; a mesma placa
//    de novo na mesma loja em 30 dias sai de graça. A loja de demonstração
//    (companies.is_demo) usa o modo de teste da APIBrasil. Cache de 30 dias por
//    placa (placa_cache, só dados do veículo) e registro das consultas
//    (placa_consultas). Nunca consulta proprietário.
//  - crlv_foto (multipart, campos "acao" = crlv_foto e "arquivo" = foto JPG/PNG/WebP):
//    a FOTO do documento lida pela IA (Claude Haiku 5.5, o modelo mais barato que lê
//    imagem). Desconta dos créditos da loja com preço próprio (doc_photo_price):
//    doc_photo_credit_hold reserva antes e plate_credit_release devolve se a foto não
//    der leitura ou der erro. A IA só devolve os dados do VEÍCULO (o pedido nem tem
//    campo para nome ou CPF/CNPJ do dono) e a resposta passa pelas mesmas regras do PDF
//    (parseCrlvAiFields). A foto não é guardada aqui nem vai para log ou banco.
//  - recursos: o que está ligado para a loja ({ placa, fotoDocumento, credits }).
// Só a equipe ativa da loja chama (can_edit_stock). "Verify JWT" desligado: o
// login é conferido pelo banco, como nas outras funções.
// Segredos: FIPE_API_TOKEN (opcional; token gratuito da fipe.api.br, sobe o
// limite de 500 para 1.000 consultas por dia), PLACA_PROVEDOR, APIBRASIL_TOKEN e
// PLACA_LIMITE_DIA (opcional; consultas pagas por loja em 24 h, padrão 30),
// ANTHROPIC_API_KEY (a mesma da descrição com IA) e DOC_FOTO_LIMITE_DIA (opcional;
// leituras de foto por loja em 24 h, padrão 30).
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { getDocumentProxy } from 'npm:unpdf@1'
import Anthropic from 'npm:@anthropic-ai/sdk'
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const PDF_MAX_BYTES = 4 * 1024 * 1024
const PHOTO_MAX_BYTES = 4 * 1024 * 1024
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const PDF_MAX_PAGES = 4
const PLATE_TTL_MS = 30 * 24 * 60 * 60 * 1000
const FIPE_STATUS: Record<string, number> = { invalido: 404, limite: 429, fora: 503 }
const PLACA_STATUS: Record<string, number> = { placa: 400, saldo: 402, sem_credito: 402, recusado: 422, fora: 503 }

// Ponto de extensão do OCR (fora do escopo agora): recebe os bytes de um PDF
// escaneado e devolve o texto. Enquanto for null, PDF sem texto = "sem_texto".
const ocr: ((bytes: Uint8Array) => Promise<string>) | null = null

type Json = Record<string, unknown>

// -- FIPE com cache ----------------------------------------------------------------

function fipeWithCache(service: SupabaseClient) {
  const sources = makeFipeSources({ token: Deno.env.get('FIPE_API_TOKEN') || '' })
  return async function query(level: string, params: Json) {
    checkFipeParams(level, params)
    const key = fipeCacheKey(level, params)
    const { data: row } = await service.from('fipe_cache').select('data, reference, fetched_at').eq('key', key).maybeSingle()
    if (row && fipeCacheFresh(level, row)) return { data: row.data, source: 'cache' }
    try {
      const fresh = await fipeQuery(sources, level, params)
      const reference = level === 'valor' || level === 'codigo' ? String((fresh.data as Json).reference || '') : ''
      await service.from('fipe_cache').upsert({ key, data: fresh.data, reference, fetched_at: new Date().toISOString() })
      return fresh
    } catch (err) {
      // As duas fontes falharam: o cache vencido é melhor que nada
      if (row && err instanceof FipeError && err.reason !== 'invalido') return { data: row.data, source: 'cache', stale: true }
      throw err
    }
  }
}

function fipeParams(body: Json) {
  const text = (v: unknown, max = 12) => (v === undefined || v === null ? undefined : String(v).slice(0, max))
  return {
    tipo: text(body.tipo),
    marca: text(body.marca),
    modelo: text(body.modelo),
    ano: text(body.ano),
    codigo: text(body.codigo),
    combustivel: text(body.combustivel, 20) || '',
  }
}

// -- CRLV-e ------------------------------------------------------------------------

class CrlvError extends Error {
  code: string
  constructor(code: string) {
    super(code)
    this.code = code
  }
}

const CRLV_MESSAGES: Record<string, string> = {
  sem_arquivo: 'Escolha o PDF do CRLV-e.',
  grande: 'O PDF passa de 4 MB. O CRLV-e baixado do app tem bem menos: confira se é o arquivo certo.',
  nao_pdf: 'O arquivo não é um PDF. Baixe o CRLV-e em PDF no app Carteira Digital de Trânsito.',
  pdf_protegido: 'O PDF tem senha. Baixe de novo sem senha ou preencha à mão.',
  pdf_invalido: 'Não consegui abrir esse PDF. Baixe de novo ou preencha à mão.',
  sem_texto: 'PDF sem texto, preencha manualmente.',
  nao_e_crlv: 'Esse PDF não parece um CRLV-e. Confira o arquivo ou preencha à mão.',
  foto_sem_arquivo: 'Tire ou escolha a foto do documento.',
  foto_grande: 'A foto passa de 4 MB. Tire de novo ou escolha uma menor.',
  nao_imagem: 'O arquivo não é uma foto (JPG, PNG ou WebP).',
  foto_nao_crlv: 'Essa foto não parece um documento de veículo (CRLV). Tire de novo com o documento inteiro na foto.',
  ilegivel: 'Não deu para ler o documento nessa foto. Tire de novo com o documento inteiro, reto e com boa luz, ou preencha à mão.',
  ia_desligada: 'A leitura da foto ainda não está ligada. Fale com a WB.Dev.',
}

async function pdfText(bytes: Uint8Array) {
  let pdf
  try {
    pdf = await getDocumentProxy(bytes)
  } catch (err) {
    const name = (err as { name?: string })?.name || ''
    throw new CrlvError(name === 'PasswordException' ? 'pdf_protegido' : 'pdf_invalido')
  }
  try {
    const pages = []
    for (let i = 1; i <= Math.min(pdf.numPages, PDF_MAX_PAGES); i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      pages.push(content.items)
    }
    return textFromPdfItems(pages)
  } finally {
    // Libera a memória do documento (o nome muda entre versões do pdf.js)
    try {
      await (pdf.destroy?.() ?? pdf.cleanup?.())
    } catch {
      // nada a fazer
    }
  }
}

async function readCrlv(form: FormData, query: ReturnType<typeof fipeWithCache>) {
  const value = form.get('arquivo')
  const file = value instanceof File ? value : null
  if (!file || !file.size) throw new CrlvError('sem_arquivo')
  if (file.size > PDF_MAX_BYTES) throw new CrlvError('grande')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new CrlvError('nao_pdf')

  let text = await pdfText(bytes)
  if (!text.replace(/\s+/g, '') && ocr) text = await ocr(bytes)
  const parsed = parseCrlvText(text)
  text = ''
  if (!parsed.ok) throw new CrlvError(parsed.error)
  return await crlvReply(parsed, query)
}

// Resposta comum ao PDF e à foto: campos do veículo e as versões FIPE parecidas
// deno-lint-ignore no-explicit-any
async function crlvReply(parsed: any, query: ReturnType<typeof fipeWithCache>) {
  let fipe: Json
  try {
    fipe = await fipeCandidatesForCrlv(parsed, async (level: string, params: Json) => (await query(level, params)).data)
  } catch (err) {
    // Sem FIPE agora: os dados do documento valem do mesmo jeito
    fipe = { error: err instanceof FipeError ? err.message : 'A tabela FIPE não respondeu agora.' }
  }
  // Só dados do veículo (o parser já deixou o dono de fora)
  return {
    fields: parsed.fields,
    invalid: parsed.invalid,
    missing: parsed.missing,
    warnings: parsed.warnings,
    documento: { marcaModelo: parsed.raw.brandModel, combustivel: parsed.raw.fuel, especie: parsed.raw.especie },
    fipe,
  }
}

// -- Foto do documento lida pela IA (paga com os créditos da loja) ---------------------

const DOC_FIELDS = ['placa', 'renavam', 'chassi', 'marca_modelo_versao', 'ano_fabricacao', 'ano_modelo', 'cor', 'combustivel', 'especie_tipo']
const DOC_SCHEMA = {
  type: 'object',
  properties: {
    e_documento_veiculo: { type: 'boolean' },
    ...Object.fromEntries(DOC_FIELDS.map((k) => [k, { type: 'string' }])),
  },
  required: ['e_documento_veiculo', ...DOC_FIELDS],
  additionalProperties: false,
}

const DOC_SYSTEM = [
  'Você lê fotos de documentos de veículos brasileiros (CRLV-e, CRLV ou CRV) para preencher o cadastro do carro numa loja.',
  'Devolva só os dados do VEÍCULO, copiados como estão impressos:',
  '- placa (ex.: ABC1D23 ou ABC1234);',
  '- renavam (os dígitos do código RENAVAM);',
  '- chassi (17 letras e números);',
  '- marca_modelo_versao: a linha "MARCA / MODELO / VERSÃO" inteira, como impressa (ex.: TOYOTA/COROLLA XEI20FLEX ou I/BMW 320I M SPORT);',
  '- ano_fabricacao e ano_modelo, com 4 dígitos;',
  '- cor (a cor predominante);',
  '- combustivel, como impresso (ex.: ALCOOL/GASOLINA);',
  '- especie_tipo, como impresso (ex.: PASSAGEIRO/AUTOMOVEL).',
  'Nunca escreva nome, CPF, CNPJ ou endereço do proprietário, nem o número do CRV ou o código de segurança.',
  'Campo que não dá para ler com certeza fica vazio: não adivinhe. Se a imagem não for um documento de veículo, e_documento_veiculo é false e os outros campos ficam vazios.',
].join('\n')

async function readCrlvPhoto(form: FormData, service: SupabaseClient, caller: SupabaseClient, companyId: string, userId: string | null, query: ReturnType<typeof fipeWithCache>) {
  const value = form.get('arquivo')
  const file = value instanceof File ? value : null
  if (!file || !file.size) throw new CrlvError('foto_sem_arquivo')
  if (file.size > PHOTO_MAX_BYTES) throw new CrlvError('foto_grande')
  const mediaType = PHOTO_TYPES.find((t) => t === file.type)
  if (!mediaType) throw new CrlvError('nao_imagem')
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY') || ''
  if (!apiKey) throw new CrlvError('ia_desligada')

  // Teto diário por loja (protege o saldo da WB.Dev na Anthropic)
  const limit = Number(Deno.env.get('DOC_FOTO_LIMITE_DIA')) || 30
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await service.from('plate_credit_ledger').select('id', { count: 'exact', head: true })
    .eq('company_id', companyId).eq('kind', 'documento').gte('created_at', since)
  if ((count || 0) >= limit) throw new PlacaError(`A loja chegou a ${limit} leituras de documento nas últimas 24 horas. Tente mais tarde ou preencha à mão.`, 'recusado')

  const { data: hold, error: holdError } = await service.rpc('doc_photo_credit_hold', { p_company: companyId, p_user: userId })
  if (holdError) {
    if (String(holdError.message || '').includes('SALDO_INSUFICIENTE')) {
      throw new PlacaError('Sem crédito para ler a foto do documento. O administrador da loja compra créditos na página Mensalidade.', 'sem_credito')
    }
    throw new PlacaError('Não deu para conferir o saldo agora. Tente de novo.', 'fora')
  }

  try {
    const client = new Anthropic({ apiKey })
    let response
    try {
      response = await client.messages.create({
        model: 'claude-haiku-5-5',
        max_tokens: 2048,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: DOC_SCHEMA } },
        system: DOC_SYSTEM,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: encodeBase64(new Uint8Array(await file.arrayBuffer())) } },
            { type: 'text', text: 'Leia os dados do veículo neste documento.' },
          ],
        }],
      } as never)
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) throw new PlacaError('Muitas leituras agora. Tente de novo em instantes.', 'fora')
      if (err instanceof Anthropic.APIError) throw new PlacaError(`A leitura da foto não respondeu (erro ${err.status}). Tente de novo.`, 'fora')
      throw new PlacaError('Não deu para ler a foto agora. Tente de novo.', 'fora')
    }
    if (response.stop_reason === 'refusal') throw new CrlvError('ilegivel')
    const text = response.content.find((b: { type: string }) => b.type === 'text') as { text?: string } | undefined
    let ai: Json
    try {
      ai = JSON.parse(text?.text || '')
    } catch {
      throw new CrlvError('ilegivel')
    }
    const parsed = parseCrlvAiFields(ai)
    if (!parsed.ok) throw new CrlvError(parsed.error === 'nao_e_crlv' ? 'foto_nao_crlv' : 'ilegivel')
    return { ...(await crlvReply(parsed, query)), charged: true, credits: await creditsFor(caller) }
  } catch (err) {
    // Foto sem leitura ou erro: a loja não paga
    if (hold?.ledger_id) await service.rpc('plate_credit_release', { p_id: hold.ledger_id })
    throw err
  }
}

// -- Placa (paga com os créditos da loja) --------------------------------------------

async function placaSetup(service: SupabaseClient, companyId: string) {
  const provider = Deno.env.get('PLACA_PROVEDOR') || ''
  const token = Deno.env.get('APIBRASIL_TOKEN') || ''
  if (provider !== 'apibrasil' || !token) return { on: false, demo: false, token: '' }
  const { data: company } = await service.from('companies').select('is_demo').eq('id', companyId).single()
  return { on: true, demo: company?.is_demo === true, token }
}

// Saldo da loja (o banco confere quem chama): { balance, price, queries, packages, admin }
async function creditsFor(caller: SupabaseClient) {
  const { data, error } = await caller.rpc('my_plate_credits')
  if (error || !data) return null
  const balance = Number(data.balance) || 0
  const price = Number(data.price) || 0
  const docPrice = Number(data.doc_price) || 0
  return {
    balance,
    price,
    queries: price > 0 ? Math.floor((balance + 1e-9) / price) : 0,
    docPrice,
    docReads: docPrice > 0 ? Math.floor((balance + 1e-9) / docPrice) : 0,
    packages: Array.isArray(data.packages) ? data.packages.map(Number) : [],
    admin: data.admin === true,
  }
}

async function lookupPlate(service: SupabaseClient, caller: SupabaseClient, companyId: string, userId: string | null, placa: unknown) {
  const setup = await placaSetup(service, companyId)
  if (!setup.on) throw new PlacaError('A consulta por placa ainda não está ligada. Fale com a WB.Dev.', 'recusado')
  const plate = normalizePlate(placa)
  if (!isValidPlate(plate)) throw new PlacaError('Placa fora do padrão (ex.: ABC1234 ou ABC1D23).', 'placa')

  // Reserva o valor antes de consultar (a mesma placa desta loja em 30 dias sai de graça)
  const { data: hold, error: holdError } = await service.rpc('plate_credit_hold', { p_company: companyId, p_plate: plate, p_user: userId })
  if (holdError) {
    if (String(holdError.message || '').includes('SALDO_INSUFICIENTE')) {
      throw new PlacaError('Sem crédito para consultar placa. O administrador da loja compra créditos na página Mensalidade.', 'sem_credito')
    }
    throw new PlacaError('Não deu para conferir o saldo agora. Tente de novo.', 'fora')
  }

  const log = (fromCache: boolean) =>
    service.from('placa_consultas').insert({ company_id: companyId, plate, from_cache: fromCache, provider: 'apibrasil' })

  try {
    let result
    let fromCache = false
    const { data: cached } = await service.from('placa_cache').select('data, fetched_at').eq('plate', plate).maybeSingle()
    if (cached && Date.now() - new Date(cached.fetched_at).getTime() < PLATE_TTL_MS) {
      result = sanitizePlateResult(cached.data)
      fromCache = true
    } else {
      // Teto diário por loja de consultas novas (protege o saldo da WB.Dev na APIBrasil)
      const limit = Number(Deno.env.get('PLACA_LIMITE_DIA')) || 30
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { count } = await service.from('placa_consultas').select('id', { count: 'exact', head: true })
        .eq('company_id', companyId).eq('from_cache', false).gte('created_at', since)
      if ((count || 0) >= limit) throw new PlacaError(`A loja chegou a ${limit} consultas por placa nas últimas 24 horas. Tente mais tarde ou preencha à mão.`, 'recusado')
      const provider = makeApiBrasilProvider({ token: setup.token, homolog: setup.demo })
      result = sanitizePlateResult(await provider.lookupByPlate(plate))
      await service.from('placa_cache').upsert({ plate, data: result, fetched_at: new Date().toISOString() })
    }
    await log(fromCache)
    return { ...result, fromCache, charged: hold?.charged === true, credits: await creditsFor(caller) }
  } catch (err) {
    // Não achou o carro ou deu erro: a loja não paga
    if (hold?.charged && hold.ledger_id) await service.rpc('plate_credit_release', { p_id: hold.ledger_id })
    throw err
  }
}

// -- Entrada ----------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return reply({ error: 'Método não permitido' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const { data: canEdit } = await caller.rpc('can_edit_stock')
  const { data: companyId } = await caller.rpc('current_company_id')
  if (canEdit !== true || !companyId) return reply({ error: 'Acesso restrito à equipe da loja' }, 403)
  const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const query = fipeWithCache(service)

  try {
    if ((req.headers.get('content-type') || '').includes('multipart/form-data')) {
      let form: FormData
      try {
        form = await req.formData()
      } catch {
        throw new CrlvError('sem_arquivo')
      }
      if (form.get('acao') === 'crlv_foto') {
        const { data: userData } = await caller.auth.getUser()
        return reply(await readCrlvPhoto(form, service, caller, companyId as string, userData?.user?.id || null, query))
      }
      return reply(await readCrlv(form, query))
    }

    let body: Json = {}
    try {
      body = await req.json()
    } catch {
      return reply({ error: 'Corpo inválido' }, 400)
    }

    switch (body.acao) {
      case 'fipe':
        return reply(await query(String(body.nivel || ''), fipeParams(body)))
      case 'placa': {
        const { data: userData } = await caller.auth.getUser()
        return reply(await lookupPlate(service, caller, companyId as string, userData?.user?.id || null, body.placa))
      }
      case 'recursos': {
        const setup = await placaSetup(service, companyId as string)
        const fotoDocumento = Boolean(Deno.env.get('ANTHROPIC_API_KEY'))
        return reply({ placa: setup.on, fotoDocumento, credits: setup.on || fotoDocumento ? await creditsFor(caller) : null })
      }
      default:
        return reply({ error: 'Ação desconhecida' }, 400)
    }
  } catch (err) {
    if (err instanceof FipeError) return reply({ error: err.message, motivo: err.reason }, FIPE_STATUS[err.reason] || 503)
    if (err instanceof CrlvError) return reply({ error: CRLV_MESSAGES[err.code] || CRLV_MESSAGES.pdf_invalido, motivo: err.code }, 422)
    if (err instanceof PlacaError) return reply({ error: err.message, motivo: err.code }, PLACA_STATUS[err.code] || 503)
    // Só o tipo do erro vai para o log (nada do PDF, da foto nem do documento)
    console.error('veiculo-dados: erro inesperado', (err as Error)?.name || 'Error')
    return reply({ error: 'Não deu certo agora. Tente de novo ou preencha à mão.' }, 500)
  }
})

// -- Cópia dos módulos do painel (não editar aqui: rode
//    node supabase/functions/veiculo-dados/atualizar-copia.mjs) ---------------------
// <documentosVeiculo.js>
// Placa, chassi e RENAVAM: normaliza o que a pessoa digitou (ou o que veio do
// CRLV-e) e confere o formato. No cadastro do carro um valor fora do padrão só
// gera aviso (decisão do Wesley, 09/10/2026): carros antigos não travam.
// Arquivo sem dependências: também vai copiado para a função veiculo-dados.

const PLATE_RE = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/
// 17 caracteres, sem I, O e Q (não existem no chassi, para não confundir com 1 e 0)
const CHASSIS_RE = /^[A-HJ-NPR-Z0-9]{17}$/

// Placa só com letras e números, em maiúsculas: "abc-1d23" e "ABC1D23" batem
export function normalizePlate(plate) {
  return String(plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// Placa antiga (ABC1234) ou Mercosul (ABC1D23)
export function isValidPlate(value) {
  return PLATE_RE.test(normalizePlate(value))
}

export function normalizeChassis(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function isValidChassis(value) {
  return CHASSIS_RE.test(normalizeChassis(value))
}

// Só os números; o RENAVAM antigo, de 9 ou 10 dígitos, ganha zeros à esquerda
export function normalizeRenavam(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length === 9 || digits.length === 10 ? digits.padStart(11, '0') : digits
}

// Dígito verificador: pesos 3 2 9 8 7 6 5 4 3 2 nos 10 primeiros dígitos,
// soma × 10, resto da divisão por 11 (resto 10 vale 0)
export function isValidRenavam(value) {
  const digits = normalizeRenavam(value)
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false
  const weights = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const sum = weights.reduce((total, w, i) => total + w * Number(digits[i]), 0)
  const check = (sum * 10) % 11
  return (check === 10 ? 0 : check) === Number(digits[10])
}

// Avisos do cadastro (campo vazio não é aviso)
export function vehicleDocWarnings({ plate, chassis, renavam }) {
  const warnings = {}
  if (normalizePlate(plate) && !isValidPlate(plate)) {
    warnings.plate = 'Placa fora do padrão (ex.: ABC1234 ou ABC1D23).'
  }
  if (normalizeChassis(chassis) && !isValidChassis(chassis)) {
    warnings.chassis = 'O chassi tem 17 letras e números, sem I, O ou Q.'
  }
  if (String(renavam ?? '').replace(/\D/g, '') && !isValidRenavam(renavam)) {
    warnings.renavam = 'O RENAVAM tem 11 números e o último não confere com os outros.'
  }
  return warnings
}
// </documentosVeiculo.js>
// <fipeMatch.js>
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
// </fipeMatch.js>
// <crlvParser.js>
// Leitura do CRLV-e (texto já tirado do PDF pela função veiculo-dados): devolve
// só os dados do VEÍCULO. LGPD: nome e CPF/CNPJ do proprietário são apagados do
// texto antes de qualquer leitura e nunca saem daqui (nem o número do CRV e o
// código de segurança, que servem para transferir o carro).
// Lê pelos rótulos do documento, aguentando quebras de linha, espaços e a
// ordem embaralhada que a extração do PDF às vezes produz.
// Arquivo copiado para a função veiculo-dados (sem dependências fora dos utils).

// Rótulos do CRLV-e (sem acento, maiúsculos). Na busca, o mais longo ganha onde
// dois se sobrepõem ("PLACA ANTERIOR" não vira "PLACA").
const LABELS = [
  ['marca', ['MARCA / MODELO / VERSAO', 'MARCA/MODELO/VERSAO', 'MARCA / MODELO', 'MARCA/MODELO']],
  ['placaAnterior', ['PLACA ANTERIOR / UF', 'PLACA ANTERIOR/UF', 'PLACA ANTERIOR']],
  ['seguranca', ['CODIGO DE SEGURANCA DO CLA', 'CODIGO DE SEGURANCA CLA', 'CODIGO DE SEGURANCA']],
  ['renavam', ['CODIGO RENAVAM', 'COD. RENAVAM', 'RENAVAM']],
  ['crv', ['NUMERO DO CRV', 'NUMERO CRV']],
  ['anoFab', ['ANO FABRICACAO', 'ANO DE FABRICACAO', 'ANO FAB']],
  ['anoMod', ['ANO MODELO', 'ANO MOD']],
  ['especie', ['ESPECIE / TIPO', 'ESPECIE/TIPO', 'ESPECIE']],
  ['cor', ['COR PREDOMINANTE', 'COR']],
  ['combustivel', ['COMBUSTIVEL']],
  ['potencia', ['POTENCIA/CILINDRADA', 'POTENCIA / CILINDRADA', 'POTENCIA']],
  ['peso', ['PESO BRUTO TOTAL']],
  ['capacidade', ['CAPACIDADE']],
  ['lotacao', ['LOTACAO']],
  ['carroceria', ['CARROCERIA']],
  ['categoria', ['CATEGORIA']],
  ['exercicio', ['EXERCICIO']],
  ['motor', ['MOTOR']],
  ['eixos', ['EIXOS']],
  ['cmt', ['CMT']],
  ['cpf', ['CPF / CNPJ', 'CPF/CNPJ', 'CPF', 'CNPJ']],
  ['nome', ['NOME']],
  ['local', ['LOCAL']],
  ['data', ['DATA']],
  ['chassi', ['CHASSI']],
  ['placa', ['PLACA']],
  ['observacoes', ['OBSERVACOES DO VEICULO', 'OBSERVACOES']],
  ['mensagens', ['MENSAGENS SENATRAN', 'MENSAGENS']],
]

// Linha do valor apagada inteira: dados do proprietário
const OWNER_KEYS = ['nome', 'cpf']
// Apagados só quando o valor é um número sozinho na linha (no layout em colunas
// a linha traz outros dados; o número do CRV, de 12 dígitos, sai de qualquer jeito)
const NUMBER_KEYS = ['crv', 'seguranca']

const FUEL_RE = /\b(ALCOOL\s*\/\s*GASOLINA(?:\s*\/\s*(?:GNV|ELETRICO))*|GASOLINA\s*\/\s*ALCOOL(?:\s*\/\s*(?:GNV|ELETRICO))*|GASOLINA\s*\/\s*(?:GNV|ELETRICO)|ALCOOL\s*\/\s*GNV|DIESEL(?:\s*\/\s*ELETRICO)?|GASOLINA|ALCOOL|ETANOL|ELETRICO|FLEX)\b/
const COLORS = ['AMARELA', 'AMARELO', 'AZUL', 'BEGE', 'BRANCA', 'BRANCO', 'CINZA', 'DOURADA', 'DOURADO', 'GRENA', 'LARANJA', 'MARROM', 'PRATA', 'PRETA', 'PRETO', 'ROSA', 'ROXA', 'ROXO', 'VERDE', 'VERMELHA', 'VERMELHO', 'FANTASIA']
const COLOR_RE = new RegExp(`\\b(${COLORS.join('|')})\\b`)
const ESPECIE_RE = /\b(PASSAGEIRO|CARGA|MISTO|ESPECIAL|TRACAO|COLECAO|COMPETICAO)\b\s*\/?\s*(AUTOMOVEL|MOTOCICLETA|MOTONETA|CICLOMOTOR|CAMIONETA|CAMINHONETE|UTILITARIO|TRICICLO|QUADRICICLO|CAMINHAO|MICROONIBUS|ONIBUS|REBOQUE|SEMI-REBOQUE)?/
const MOTO_TYPES = ['MOTOCICLETA', 'MOTONETA', 'CICLOMOTOR']
const PLATE_IN_TEXT = /\b([A-Z]{3})\s?-?\s?([0-9][A-Z0-9][0-9]{2})\b/g
const CHASSIS_IN_TEXT = /\b(?=[A-HJ-NPR-Z0-9]*[A-HJ-NPR-Z])(?=[A-HJ-NPR-Z0-9]*[0-9])[A-HJ-NPR-Z0-9]{17}\b/
const YEAR_RE = /\b(19[5-9]\d|20[0-4]\d)\b/g
// Palavras que aparecem com "/" e não são marca
const NOT_BRAND = /^(PASSAGEIRO|CARGA|MISTO|ESPECIAL|ALCOOL|GASOLINA|DIESEL|ETANOL|ELETRICO|CPF|CNPJ|ESPECIE|POTENCIA|PLACA|MARCA|ANO)\b/

function upperPlain(text) {
  return String(text ?? '').normalize('NFD').replace(/\p{M}/gu, '').toUpperCase()
}

// "PRATA" -> "Prata"; siglas e palavras com número ficam como vieram ("VW", "CG", "HR-V", "HB20")
function title(text) {
  return String(text || '').split(' ').map((w) => (w.length <= 3 || /[^A-Z]/.test(w) ? w : w[0] + w.slice(1).toLowerCase())).join(' ')
}

// No layout em colunas, cor, combustível e espécie vêm colados depois do modelo
const AFTER_MODEL = new RegExp(`\\s+\\b(${[...COLORS, 'ALCOOL', 'GASOLINA', 'DIESEL', 'ETANOL', 'ELETRICO', 'FLEX', 'PASSAGEIRO', 'CARGA', 'MISTO', 'ESPECIAL', 'PARTICULAR', 'ALUGUEL', 'OFICIAL'].join('|')})\\b.*$`)

function escapeRe(text) {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace(/ /g, '\\s*')
}

// Posição de cada rótulo no texto
function findLabels(text) {
  const hits = []
  const taken = new Array(text.length).fill(false)
  const all = LABELS.flatMap(([key, names]) => names.map((name) => ({ key, name })))
    .sort((a, b) => b.name.length - a.name.length)
  for (const { key, name } of all) {
    const re = new RegExp(`(^|[^A-Z])(${escapeRe(name)})(?![A-Z])`, 'g')
    let m
    while ((m = re.exec(text))) {
      const start = m.index + m[1].length
      const end = start + m[2].length
      if (taken.slice(start, end).some(Boolean)) continue
      for (let i = start; i < end; i++) taken[i] = true
      hits.push({ key, start, end })
    }
  }
  return hits.sort((a, b) => a.start - b.start)
}

// Texto entre cada rótulo e o próximo
function segments(text, hits) {
  const out = {}
  hits.forEach((h, i) => {
    const next = hits[i + 1]
    const value = text.slice(h.end, next ? next.start : text.length).replace(/^[\s:.-]+/, '').trim()
    if (!out[h.key]) out[h.key] = []
    out[h.key].push({ value })
  })
  return out
}

// LGPD: apaga do texto nome e CPF/CNPJ do proprietário, o número do CRV e o
// código de segurança, antes de procurar qualquer outro dado
function redact(text) {
  let out = text
    .replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, ' ')
    .replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, ' ')
    .replace(/[*X]{3}\.?\d{3}\.?\d{3}-?[*X]{2}/g, ' ')
    // 11 ou 14 dígitos logo depois de "CPF"/"CNPJ" (sem pontuação)
    .replace(/(CPF|CNPJ)([^0-9]{0,30})\b\d{11,14}\b/g, '$1$2 ')
    // número do CRV (12 dígitos; o RENAVAM tem 11)
    .replace(/\b\d{12}\b/g, ' ')
  const hits = findLabels(out)
  const chars = out.split('')
  hits.forEach((h, i) => {
    if (NUMBER_KEYS.includes(h.key)) {
      const next = hits[i + 1]
      const limit = next ? next.start : chars.length
      const rest = chars.slice(h.end, limit).join('')
      const m = rest.match(/^[\s:.-]*(\d{8,14})[ \t]*(?:\n|$)/)
      if (m) for (let k = h.end; k < h.end + m[0].length; k++) if (chars[k] !== '\n') chars[k] = ' '
      return
    }
    if (!OWNER_KEYS.includes(h.key)) return
    const next = hits[i + 1]
    const limit = next ? next.start : chars.length
    // O valor fica na mesma linha do rótulo ou na linha de baixo
    let pos = h.end
    while (pos < limit && chars[pos] !== '\n') pos++
    const sameLine = chars.slice(h.end, pos).join('').trim()
    let stop = pos
    if (!sameLine && pos < limit) {
      stop = pos + 1
      while (stop < limit && chars[stop] !== '\n') stop++
    }
    for (let k = h.end; k < Math.min(stop, limit); k++) if (chars[k] !== '\n') chars[k] = ' '
  })
  return chars.join('')
}

function firstMatch(re, text) {
  const m = String(text || '').match(re)
  return m ? m[0] : ''
}

function cleanLine(value) {
  return String(value || '').split('\n').map((l) => l.trim()).find(Boolean) || ''
}

function nearValue(value) {
  return String(value || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 2).join(' ')
}

// "FIAT/ARGO DRIVE 1.3" (nacional) e "I/TOYOTA COROLLA XEI20FLEX" (importado:
// "I/", a marca e o modelo separados por espaço) -> marca, modelo e versão
export function splitCrlvBrandModel(raw) {
  const text = cleanLine(raw).replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ')
  const imported = /^I\//.test(text)
  const rest = text.replace(/^I\//, '')
  const slash = rest.indexOf('/')
  const space = rest.indexOf(' ')
  const cut = slash > 0 ? slash : imported ? space : -1
  if (cut < 1) return null
  const brand = rest.slice(0, cut).trim()
  const modelText = rest.slice(cut + 1).replace(AFTER_MODEL, '').replace(/\/.*$/, '').trim()
  if (!brand || !modelText || NOT_BRAND.test(brand) || !/[A-Z]/.test(modelText)) return null
  const [model, ...version] = modelText.split(' ')
  return { imported, brand, modelText, model, version: version.join(' ') }
}

// Combustível do documento -> lista do painel (vazio quando não há equivalente)
export function fuelFromCrlv(raw) {
  const t = upperPlain(raw)
  if (!t) return ''
  if (t.includes('ELETRICO')) return /GASOLINA|ALCOOL|DIESEL|ETANOL/.test(t) ? 'Híbrido' : 'Elétrico'
  if ((t.includes('ALCOOL') || t.includes('ETANOL')) && t.includes('GASOLINA')) return 'Flex'
  if (t.includes('FLEX')) return 'Flex'
  if (t.includes('DIESEL')) return 'Diesel'
  if (t.includes('GNV')) return 'GNV'
  if (t.includes('GASOLINA')) return 'Gasolina'
  return ''
}

function pickBrandModel(seg, text) {
  for (const s of seg.marca || []) {
    const found = splitCrlvBrandModel(s.value)
    if (found) return found
  }
  // Layout em colunas: procura "MARCA/MODELO ..." no texto todo
  const re = /(?:^|\s)(I\s*\/\s*[A-Z][A-Z.-]{1,14}\s+[A-Z0-9][A-Z0-9 .,-]{1,40}|[A-Z][A-Z.-]{1,14}\s*\/\s*[A-Z0-9][A-Z0-9 .,-]{1,40})/g
  let m
  while ((m = re.exec(text))) {
    const found = splitCrlvBrandModel(m[1])
    if (found && !/^[A-Z]{3}[0-9]/.test(found.brand) && found.model.length > 1 && !/^[A-Z]{2}$/.test(found.modelText)) return found
  }
  return null
}

function plateFrom(text) {
  PLATE_IN_TEXT.lastIndex = 0
  const m = PLATE_IN_TEXT.exec(text)
  return m ? normalizePlate(m[1] + m[2]) : ''
}

function pickPlate(seg, text) {
  for (const s of seg.placa || []) {
    const plate = plateFrom(nearValue(s.value))
    if (plate) return plate
  }
  // Sem valor junto do rótulo: a primeira placa que não é a "placa anterior / UF"
  const anterior = new Set((seg.placaAnterior || []).map((s) => plateFrom(nearValue(s.value))).filter(Boolean))
  PLATE_IN_TEXT.lastIndex = 0
  let m
  while ((m = PLATE_IN_TEXT.exec(text))) {
    const plate = normalizePlate(m[1] + m[2])
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 5)
    if (!anterior.has(plate) && !/^\s*\/\s*[A-Z]{2}\b/.test(after)) return plate
  }
  return ''
}

function pickRenavam(seg, text) {
  for (const s of seg.renavam || []) {
    const numbers = nearValue(s.value).match(/\b\d{9,11}\b/g) || []
    const valid = numbers.find((n) => isValidRenavam(n))
    if (valid) return normalizeRenavam(valid)
    if (numbers[0]) return normalizeRenavam(numbers[0])
  }
  // Layout em colunas: o primeiro número de 11 dígitos com o dígito verificador certo
  return (text.match(/\b\d{11}\b/g) || []).find((n) => isValidRenavam(n)) || ''
}

function pickChassis(seg, text) {
  for (const s of seg.chassi || []) {
    const found = firstMatch(CHASSIS_IN_TEXT, nearValue(s.value))
    if (found) return normalizeChassis(found)
  }
  return normalizeChassis(firstMatch(CHASSIS_IN_TEXT, text))
}

function yearIn(list) {
  for (const s of list || []) {
    const y = (nearValue(s.value).match(/\b(19[5-9]\d|20[0-4]\d)\b/) || [])[0]
    if (y) return Number(y)
  }
  return 0
}

function pickYears(seg, text) {
  let fab = yearIn(seg.anoFab)
  let mod = yearIn(seg.anoMod)
  if (fab && mod && mod >= fab && mod - fab <= 1) return { fab, mod }
  const exercise = yearIn(seg.exercicio)
  // Colunas: dois anos seguidos (fabricação e modelo), que não sejam o exercício repetido
  const years = [...text.matchAll(YEAR_RE)].map((m) => Number(m[1]))
  for (let i = 0; i < years.length - 1; i++) {
    const a = years[i]
    const b = years[i + 1]
    if (b >= a && b - a <= 1 && !(a === exercise && b === exercise)) {
      if (!fab) fab = a
      if (!mod) mod = b
      break
    }
  }
  if (fab && mod && (mod < fab || mod - fab > 1)) return { fab, mod: 0 }
  return { fab, mod }
}

// Itens de texto do PDF (pdf.js: { str, transform, width }, uma lista por página)
// -> linhas de cima para baixo e da esquerda para a direita. Pedaços colados
// ("PLA" + "CA") viram uma palavra; colunas separadas ganham um espaço.
export function textFromPdfItems(pages) {
  const out = []
  for (const items of pages || []) {
    const rows = []
    for (const item of items || []) {
      const str = String(item?.str ?? '')
      if (!str.trim() || !Array.isArray(item.transform)) continue
      const [, , c, d, x, y] = item.transform.map(Number)
      const size = Math.hypot(c, d) || Number(item.height) || 10
      let row = rows.find((r) => Math.abs(r.y - y) <= Math.max(r.size, size) * 0.4)
      if (!row) {
        row = { y, size, items: [] }
        rows.push(row)
      }
      row.items.push({ str, x, end: x + (Number(item.width) || 0), size })
    }
    rows.sort((a, b) => b.y - a.y)
    for (const row of rows) {
      row.items.sort((a, b) => a.x - b.x)
      let line = ''
      let prevEnd = null
      for (const it of row.items) {
        if (prevEnd !== null && it.x - prevEnd > it.size * 0.15) line += ' '
        line += it.str
        prevEnd = it.end
      }
      out.push(line.replace(/\s+/g, ' ').trim())
    }
  }
  return out.filter(Boolean).join('\n')
}

// Texto do CRLV-e -> { ok, fields, invalid, missing, warnings, raw } ou { ok: false, error }
export function parseCrlvText(rawText) {
  const original = upperPlain(rawText).replace(/\r/g, '').replace(/[ \t]+/g, ' ')
  if (!original.replace(/\s+/g, '')) return { ok: false, error: 'sem_texto' }
  const text = redact(original)
  const hits = findLabels(text)
  const keys = new Set(hits.map((h) => h.key))
  const crlvKeys = ['renavam', 'chassi', 'marca', 'placa', 'anoFab', 'anoMod', 'combustivel']
  if (crlvKeys.filter((k) => keys.has(k)).length < 3) return { ok: false, error: 'nao_e_crlv' }
  const seg = segments(text, hits)

  const plate = pickPlate(seg, text)
  const renavam = pickRenavam(seg, text)
  const chassis = pickChassis(seg, text)
  const brandModel = pickBrandModel(seg, text)
  const { fab, mod } = pickYears(seg, text)
  const fuelRaw = firstMatch(FUEL_RE, (seg.combustivel || []).map((s) => nearValue(s.value)).join(' ')) || firstMatch(FUEL_RE, text)
  // Cor: junto do rótulo; no layout em colunas, a primeira cor do texto (nome do dono já foi apagado)
  const colorRaw = firstMatch(COLOR_RE, (seg.cor || []).map((s) => nearValue(s.value)).join(' ')) || firstMatch(COLOR_RE, text)
  const especieMatch = (seg.especie || []).map((s) => nearValue(s.value)).join(' ').match(ESPECIE_RE) || text.match(ESPECIE_RE)
  const especie = especieMatch ? especieMatch[0].replace(/\s*\/\s*/g, '/').trim() : ''
  return crlvResult({ plate, renavam, chassis, brandModel, fab, mod, fuelRaw, colorRaw, especie })
}

// Resultado comum à leitura do PDF e da foto: campos do cadastro, avisos e o que faltou
function crlvResult({ plate, renavam, chassis, brandModel, fab, mod, fuelRaw, colorRaw, especie }) {
  const fields = {}
  const invalid = []
  if (plate) {
    fields.plate = plate
    if (!isValidPlate(plate)) invalid.push('plate')
  }
  if (renavam) {
    fields.renavam = renavam
    if (!isValidRenavam(renavam)) invalid.push('renavam')
  }
  if (chassis) {
    fields.chassis = chassis
    if (!isValidChassis(chassis)) invalid.push('chassis')
  }
  if (brandModel) {
    fields.brand = title(brandModel.brand)
    fields.model = title(brandModel.model)
    if (brandModel.version) fields.version = brandModel.version
  }
  if (fab) fields.year = fab
  if (mod) {
    fields.modelYearNumber = mod
    fields.modelYear = fab ? `${fab}/${mod}` : String(mod)
  }
  const fuel = fuelFromCrlv(fuelRaw)
  if (fuel) fields.fuel = fuel
  if (colorRaw) fields.color = title(colorRaw)
  if (MOTO_TYPES.some((t) => especie.includes(t))) fields.category = 'moto'

  const warnings = []
  if (invalid.includes('renavam')) warnings.push('O RENAVAM lido não confere (dígito verificador). Confira no documento.')
  if (invalid.includes('plate')) warnings.push('A placa lida está fora do padrão. Confira no documento.')
  if (invalid.includes('chassis')) warnings.push('O chassi lido está fora do padrão. Confira no documento.')
  if (fuelRaw && !fuel) warnings.push(`O combustível "${title(fuelRaw)}" não tem opção no cadastro: escolha à mão.`)
  const missing = ['plate', 'renavam', 'chassis', 'brand', 'year', 'modelYear', 'color', 'fuel'].filter((k) => !fields[k])

  return {
    ok: true,
    fields,
    invalid,
    missing,
    warnings,
    raw: {
      brandModel: brandModel ? (brandModel.imported ? `I/${brandModel.brand} ${brandModel.modelText}` : `${brandModel.brand}/${brandModel.modelText}`) : '',
      brand: brandModel?.brand || '',
      modelText: brandModel?.modelText || '',
      fuel: fuelRaw ? title(fuelRaw) : '',
      color: colorRaw ? title(colorRaw) : '',
      especie: especie ? title(especie) : '',
    },
  }
}

// Dados da FOTO do CRLV-e lidos pela IA (função veiculo-dados, ação crlv_foto):
// as mesmas regras do PDF. ai = { e_documento_veiculo, placa, renavam, chassi,
// marca_modelo_versao, ano_fabricacao, ano_modelo, cor, combustivel, especie_tipo }.
// Nome e CPF/CNPJ do dono nem são pedidos à IA; qualquer outro campo é ignorado.
export function parseCrlvAiFields(ai, today = new Date()) {
  if (!ai || typeof ai !== 'object' || ai.e_documento_veiculo !== true) return { ok: false, error: 'nao_e_crlv' }
  const up = (v) => upperPlain(v).replace(/\s+/g, ' ').trim()
  const maxYear = today.getFullYear() + 1
  const year = (v) => {
    const n = Number(String(v ?? '').replace(/\D/g, ''))
    return n >= 1950 && n <= maxYear ? n : 0
  }
  const plate = plateFrom(up(ai.placa))
  const renavamDigits = up(ai.renavam).replace(/\D/g, '')
  const renavam = renavamDigits.length >= 9 && renavamDigits.length <= 11 ? normalizeRenavam(renavamDigits) : ''
  const chassis = normalizeChassis(firstMatch(CHASSIS_IN_TEXT, up(ai.chassi).replace(/[\s.-]/g, '')))
  const brandModel = splitCrlvBrandModel(up(ai.marca_modelo_versao))
  let fab = year(ai.ano_fabricacao)
  let mod = year(ai.ano_modelo)
  if (fab && mod && (mod < fab || mod - fab > 1)) mod = 0
  const fuelRaw = firstMatch(FUEL_RE, up(ai.combustivel)) || up(ai.combustivel)
  const colorRaw = firstMatch(COLOR_RE, up(ai.cor))
  const especieMatch = up(ai.especie_tipo).match(ESPECIE_RE)
  const especie = especieMatch ? especieMatch[0].replace(/\s*\/\s*/g, '/').trim() : ''
  const read = [plate, renavam, chassis, brandModel, fab].filter(Boolean).length
  if (read < 2) return { ok: false, error: 'ilegivel' }
  return crlvResult({ plate, renavam, chassis, brandModel, fab, mod, fuelRaw, colorRaw, especie })
}
// </crlvParser.js>
// <fipeFontes.js>
// Fontes da tabela FIPE para a função veiculo-dados: BrasilAPI (principal,
// gratuita) e fipe.api.br (reserva; 500 consultas por dia sem token, 1.000 com o
// token gratuito no segredo FIPE_API_TOKEN). As duas usam os códigos oficiais
// da FIPE (marca 56, modelo 5194, ano "2023-5"), então uma cobre a outra.
// O painel nunca chama a FIPE: só a função, com cache no banco (fipe_cache).
// Arquivo copiado para a função veiculo-dados.

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
// </fipeFontes.js>
// <placaProvedor.js>
// Consulta por placa (paga): interface de provedor + adaptador da APIBrasil.
// DESLIGADA por padrão: a função veiculo-dados só chama quando o plano da loja
// tem "placa", o segredo PLACA_PROVEDOR vale "apibrasil" e há token
// (APIBRASIL_TOKEN). Usa só produtos com dados do VEÍCULO (Agregados Própria e
// Placa FIPE); nada de proprietário, contatos ou histórico de donos.
// Interface: { name, lookupByPlate(placa) -> { vehicle, fipeCandidates } }.
// Arquivo copiado para a função veiculo-dados.

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
// </placaProvedor.js>
