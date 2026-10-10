// @ts-nocheck — a cópia de src/utils/webmotorsAd.js (no fim do arquivo) é JavaScript puro
// Edge Function "webmotors" — publicação automática na Webmotors (seção 61).
//
// POST com o login da pessoa no Authorization:
//   situacao: se a integração já foi liberada (chave da ponte) e o ambiente;
//   conectar (admin): testa na Webmotors o usuário de integração da loja (CNPJ,
//     e-mail e senha) e, se der certo, guarda (a senha vai para o Vault);
//   desconectar (admin): tira da Webmotors os anúncios do sistema (se pedido) e
//     apaga a conta e a senha;
//   modalidades: lê de novo as modalidades do plano da loja (com as vagas);
//   catalogo: marcas, modelos, versões, cores, câmbios, combustíveis e opcionais
//     da Webmotors (cache no banco, 30 dias);
//   sincronizar (equipe do estoque): concilia o estoque da loja com a Webmotors;
//   previa: o anúncio de um carro como vai para a Webmotors.
// POST {"action":"rodada"} sem login: rodada automática (pg_cron a cada 10 min;
//   no máximo uma a cada 4 min), para todas as lojas conectadas.
//
// A API é SOAP (.asmx): wsLoginSistemaRevendedor.autenticar devolve um hash que
// vale 1000 minutos, usado no wsEstoqueRevendedorWebMotors (IncluirCarro,
// AlterarCarro, ExcluirCarro, IncluirFotoUrl, ExcluirFoto, ObterEstoqueAtualPaginado,
// ObterModalidade e as listas). A resposta vem na hora, com o código do anúncio.
// A Webmotors libera essa integração por IP fixo (07/10/2026: o app do Portal do
// Desenvolvedor não é usado nela). A função não tem IP fixo, então cada chamada
// passa pela ponte da hospedagem (public/api/webmotors-ponte.php, que sai pelo
// IPv4 do servidor, o IP liberado na Webmotors), com a chave do segredo
// WEBMOTORS_PONTE_CHAVE; WEBMOTORS_PONTE_URL troca o endereço da ponte.
// WEBMOTORS_AMBIENTE diz "homologacao" (padrão) ou "producao", e WEBMOTORS_URL
// troca o endereço da Webmotors. Os códigos de retorno e os de motivo são
// conferidos com o ambiente de teste.
//
// Conciliação: carro marcado, disponível, visível no site e fora do repasse vai
// (IncluirCarro e as fotos uma a uma, com a capa primeiro) ou é alterado quando
// o anúncio muda; o que sai disso é tirado do ar (ExcluirCarro). Até 20 carros e
// 150 chamadas por vez. Sem a publicação automática, só mexe no que já está na
// Webmotors e no que a pessoa pediu ("Publicar agora"). Anúncio tirado direto
// na Webmotors não volta sozinho. A loja de demonstração (companies.is_demo) só
// simula em produção; em homologação ela usa o ambiente de teste da Webmotors.
// Publicar com "Verify JWT" desligado (a rodada vem do pg_cron sem login); as
// ações do painel conferem o login pelo banco (can_edit_stock e is_company_admin).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const AMBIENTE = Deno.env.get('WEBMOTORS_AMBIENTE') === 'producao' ? 'producao' : 'homologacao'
const ENDPOINTS = {
  homologacao: 'https://hportal.webmotors.com.br/IntegracaoRevendedor',
  producao: 'https://integracao.webmotors.com.br',
}
const SOAP_URL = (Deno.env.get('WEBMOTORS_URL') || ENDPOINTS[AMBIENTE]).replace(/\/+$/, '')
// Ponte com IP fixo na hospedagem da WB.Dev (a Webmotors só aceita o IP liberado)
const PONTE_URL = Deno.env.get('WEBMOTORS_PONTE_URL') || 'https://sandybrown-mallard-175177.hostingersite.com/api/webmotors-ponte.php'
const PONTE_CHAVE = Deno.env.get('WEBMOTORS_PONTE_CHAVE') || ''
const CONFIGURED = Boolean(PONTE_URL && PONTE_CHAVE)

const MAX_SENDS = 20
const MAX_CALLS = 150
const SESSION_MS = 900 * 60 * 1000
const LIST_EVERY_MS = 60 * 60 * 1000
const CATALOG_TTL_MS = 30 * 24 * 60 * 60 * 1000
const ROUND_GAP_MS = 4 * 60 * 1000
const ROUND_BUDGET_MS = 100 * 1000
const LOCK_MS = 2 * 60 * 1000
const SLOT_RETRY_MS = 60 * 60 * 1000
const FRESH_AD_MS = 10 * 60 * 1000
// Motivo da exclusão (pMotivoExclusao): a tabela vem com o ambiente de teste;
// o exemplo oficial da Webmotors usa 3
const EXCLUSION_REASON = { vendido: '3', outro: '3' }
// Códigos de retorno de sessão vencida (tabelas do manual: 401 hash inválido, 402 sessão
// expirou; na manutenção do anúncio, 31 hash inválido): renova o login uma vez
const SESSION_CODES = ['401', '402', '31']
const CAR_COLUMNS = 'id, brand, model, version, year, model_year, km, transmission, fuel, color, doors, category, condition, price, ' +
  'original_price, highlights, description, images, status, hidden, plate, entry_type, webmotors_publish, webmotors_catalog'
const COMPANY_COLUMNS = 'id, name, slug, site_url, is_demo'
const LIST_LEVELS = ['cores', 'cambios', 'combustiveis', 'opcionais']
const OPERATIONS = {
  marcas: 'ObterMarca',
  modelos: 'ObterModelo',
  versoes: 'ObterVersao',
  cores: 'ObterCores',
  cambios: 'ObterCambio',
  combustiveis: 'ObterCombustivel',
  opcionais: 'ObterOpcionais',
}
const NOT_CONFIGURED = 'A integração com a Webmotors ainda não foi liberada para a WB.AUTO. Assim que a Webmotors liberar, dá para conectar aqui.'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

class UserError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

const nowIso = () => new Date().toISOString()

async function sha256(value) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function formatCnpj(cnpj) {
  return String(cnpj).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

// Em produção a loja de demonstração só simula; em homologação ela usa o
// ambiente de teste da Webmotors (os anúncios lá são de teste)
function simulated(company) {
  return Boolean(company.is_demo) && AMBIENTE === 'producao'
}

async function account(service, companyId) {
  const { data, error } = await service.from('wm_accounts').select('*').eq('company_id', companyId).maybeSingle()
  if (error) throw error
  return data
}

async function setAccount(service, acc, patch) {
  await service.from('wm_accounts').update(patch).eq('company_id', acc.company_id)
  Object.assign(acc, patch)
}

async function log(service, companyId, userId, label) {
  let email = null
  if (userId) {
    const { data } = await service.auth.admin.getUserById(userId)
    email = data?.user?.email || null
  }
  await service.from('activity_log').insert({ company_id: companyId, user_id: userId, user_email: email, action: 'update', entity: 'webmotors', label, details: '' })
}

// -- Webmotors (SOAP) ---------------------------------------------------------------

async function soap(acc, service, operation, params) {
  const login = service === 'login'
  const url = `${SOAP_URL}/${login ? 'wsLoginSistemaRevendedor.asmx' : 'wsEstoqueRevendedorWebMotors.asmx'}`
  const namespace = login ? WM_LOGIN_NAMESPACE : WM_NAMESPACE
  const headers = {
    'Content-Type': 'text/xml; charset=utf-8',
    SOAPAction: `"${namespace}/${operation}"`,
    'User-Agent': 'WB.AUTO/1.0',
    'X-Ponte-Chave': PONTE_CHAVE,
    'X-Ponte-Destino': url,
  }
  let res
  try {
    res = await fetch(PONTE_URL, { method: 'POST', headers, body: wmSoapEnvelope(namespace, operation, params) })
  } catch {
    return { status: 0, fault: 'sem resposta', result: null }
  }
  const text = await res.text()
  // Só vale o que a ponte trouxe da Webmotors. Erro da própria ponte (chave,
  // destino, Webmotors fora do ar) ou bloqueio antes dela é passageiro: não
  // pode virar "usuário recusado"
  if (res.headers.get('X-Ponte') !== 'webmotors') {
    console.error('webmotors ponte', operation, res.status, text.slice(0, 200))
    return { status: 0, fault: 'ponte', result: null }
  }
  const parsed = wmSoapResult(text, operation)
  if (parsed.fault) console.error('webmotors', operation, res.status, parsed.fault.slice(0, 200))
  return { status: res.status, ...parsed }
}

// Deu certo: resposta SOAP com o resultado e o código de retorno 500
function okResult(r) {
  return !r.fault && Boolean(r.result) && typeof r.result === 'object' && wmReturnOk(wmResultCode(r.result))
}

function resultCodes(r) {
  return wmReturnCodes(wmResultCode(r.result))
}

// Lista recusada: veio um código de retorno e ele não é o 500
function refusedList(r) {
  const code = wmResultCode(r.result)
  return Boolean(code) && !wmReturnOk(code)
}

// Falha passageira (sem resposta, ponte ou Webmotors fora, limite de chamadas): tenta de novo depois
function transient(r) {
  return r.skipped || r.status === 0 || r.status === 429 || (r.status >= 500 && r.fault === 'resposta inválida da Webmotors')
}

// Login do usuário de integração: { ok, hash } ou { ok: false, rejected, stage }
async function login(acc, creds) {
  const r = await soap(acc, 'login', 'autenticar', { cnpj: creds.cnpj, email: creds.email, senha: creds.password })
  if (transient(r)) return { ok: false, rejected: false, stage: 'login' }
  // A Webmotors barrou a chamada (ex.: IP ainda não liberado)
  if (r.status === 401 || r.status === 403) return { ok: false, rejected: true, stage: 'acesso' }
  const hash = r.result && typeof r.result === 'object' ? String(r.result.HashAutenticacao || '').trim() : ''
  if (hash && okResult(r)) return { ok: true, hash }
  console.error('webmotors login recusado', r.status, wmResultCode(r.result) || r.fault || 'sem código')
  return { ok: false, rejected: true, stage: 'login', codes: resultCodes(r) }
}

async function storedPassword(service, companyId) {
  const { data, error } = await service.rpc('wm_password', { p_company: companyId })
  if (error) console.error('webmotors senha', error.message)
  return typeof data === 'string' && data ? data : ''
}

// Sessão da loja (hash de 1000 minutos): renova com folga ou quando pedido
async function ensureSession(service, acc, { force = false } = {}) {
  if (!force && acc.session_hash && acc.session_expires_at && new Date(acc.session_expires_at).getTime() > Date.now()) return true
  const password = await storedPassword(service, acc.company_id)
  if (!password) {
    await setAccount(service, acc, { status: 'erro', status_detail: 'A senha do usuário de integração não foi encontrada. Conecte a Webmotors de novo em Portais.' })
    return false
  }
  const result = await login(acc, { cnpj: acc.cnpj, email: acc.email, password })
  if (!result.ok) {
    if (result.rejected) {
      await setAccount(service, acc, {
        status: 'erro',
        status_detail: result.stage === 'acesso'
          ? 'A Webmotors recusou o acesso da integração. Fale com a WB.Dev.'
          : 'A Webmotors recusou o usuário de integração (CNPJ, e-mail ou senha). Confira com a Webmotors e conecte de novo em Portais.',
        session_hash: null,
        session_expires_at: null,
      })
    }
    return false
  }
  await setAccount(service, acc, {
    session_hash: result.hash,
    session_expires_at: new Date(Date.now() + SESSION_MS).toISOString(),
    status: 'conectada',
    status_detail: '',
  })
  return true
}

function sessionProblem(r) {
  if (r.status === 401 || r.status === 403) return true
  if (resultCodes(r).some((c) => SESSION_CODES.includes(c))) return true
  return /hash|autentica|sess[aã]o|expirad|token/i.test(r.fault || '')
}

// Chamada ao serviço de estoque com a sessão da loja. ctx: { calls, relogged }.
// Renova o hash uma vez por conciliação quando a Webmotors recusa a sessão.
async function call(service, acc, ctx, operation, params = {}) {
  if (ctx.calls >= MAX_CALLS) return { status: 0, fault: 'limite de chamadas desta vez', result: null, skipped: true }
  ctx.calls++
  let r = await soap(acc, 'estoque', operation, { pHashAutenticacao: acc.session_hash, ...params })
  if (sessionProblem(r) && !ctx.relogged) {
    ctx.relogged = true
    if (await ensureSession(service, acc, { force: true })) {
      ctx.calls++
      r = await soap(acc, 'estoque', operation, { pHashAutenticacao: acc.session_hash, ...params })
    }
  }
  return r
}

// -- Listas da Webmotors ------------------------------------------------------------

function catalogPath(level, { brandId, modelId } = {}) {
  if (level === 'modelos') return `modelos/${brandId}`
  if (level === 'versoes') return `versoes/${modelId}`
  return level
}

async function cachedOptions(service, path) {
  const { data } = await service.from('wm_catalog').select('data, fetched_at').eq('path', path).maybeSingle()
  return data
}

// Lista do catálogo: do cache (30 dias) ou da Webmotors. null = não deu.
async function catalogOptions(service, acc, ctx, level, ids = {}) {
  const path = catalogPath(level, ids)
  const cached = await cachedOptions(service, path)
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CATALOG_TTL_MS) return cached.data
  if (!acc || !(await ensureSession(service, acc))) return cached ? cached.data : null
  const params = level === 'modelos'
    ? { pCodigoMarca: ids.brandId }
    : level === 'versoes'
      ? { pCodigoModelo: String(ids.modelId), pDataInicioAtualizacao: '1900-01-01T00:00:00', pDataFimAtualizacao: `${new Date(Date.now() + 86400000).toISOString().slice(0, 10)}T00:00:00` }
      : {}
  const r = await call(service, acc, ctx, OPERATIONS[level], params)
  const options = !r.fault && r.result !== null && !refusedList(r) ? wmOptionsFrom(level, r.result) : null
  if (options?.length) {
    await service.from('wm_catalog').upsert({ path, data: options, fetched_at: nowIso() })
    return options
  }
  if (cached) return cached.data
  return options
}

async function loadLists(service, acc, ctx) {
  const lists = {}
  for (const level of LIST_LEVELS) lists[level] = await catalogOptions(service, acc, ctx, level)
  return lists
}

async function refreshModalities(service, acc, ctx) {
  const r = await call(service, acc, ctx, 'ObterModalidade')
  if (r.fault || !r.result || typeof r.result !== 'object' || refusedList(r)) return false
  const list = wmModalities(r.result)
  const patch = { modalities: list, modalities_at: nowIso() }
  // Com uma modalidade só, ela já fica escolhida
  if (!acc.modality_code && list.length === 1) patch.modality_code = String(list[0].code)
  await setAccount(service, acc, patch)
  return true
}

// Códigos dos anúncios no ar na conta (ObterEstoqueAtualPaginado). null quando
// a lista não veio inteira (assim nada é marcado como tirado por engano).
async function stockCodes(service, acc, ctx) {
  const codes = new Set()
  let total = 0
  for (let page = 1; page <= 50; page++) {
    const r = await call(service, acc, ctx, 'ObterEstoqueAtualPaginado', { pPagina: page, pTamanho: 100 })
    if (r.fault || !r.result || typeof r.result !== 'object' || refusedList(r)) return null
    total = Number(r.result.TotalAnuncios) || 0
    const items = wmList(r.result.Anuncios, 'Anuncio')
    for (const item of items) {
      const code = Number(item.CodigoAnuncio)
      if (code > 0) codes.add(code)
    }
    if (!items.length || codes.size >= total) break
  }
  return codes.size >= total ? codes : null
}

// -- Anúncios -------------------------------------------------------------------------

// Está no ar na Webmotors (tem código e não saiu)
function live(ad) {
  return Boolean(ad?.ad_code) && !['removido', 'removido_wm', 'simulado'].includes(ad.status)
}

async function saveAd(service, ad, patch) {
  if (ad) {
    const { error } = await service.from('wm_ads').update(patch).eq('id', ad.id)
    if (error) throw error
    Object.assign(ad, patch)
    return ad
  }
  const { data, error } = await service.from('wm_ads').insert(patch).select().single()
  if (error) throw error
  return data
}

function samePhotos(saved, desired) {
  const urls = (Array.isArray(saved) ? saved : []).map((p) => p?.url)
  return urls.length === desired.length && urls.every((url, i) => url === desired[i])
}

function failedPhotos(photos) {
  return (Array.isArray(photos) ? photos : []).filter((p) => p?.failed).length
}

// Fotos: tira as que saíram do carro e, da primeira diferença de ordem em
// diante, tira e põe de novo (na Webmotors a ordem é a de inclusão e a capa é a
// primeira). Foto recusada fica marcada e não é mandada de novo sozinha.
async function syncPhotos(service, acc, ctx, ad, desired) {
  if (ctx.modality && ctx.modality.photos === false) return
  let saved = (Array.isArray(ad.photos) ? ad.photos : []).filter((p) => p && p.url)
  if (samePhotos(saved, desired)) return
  const remove = saved.filter((p) => !desired.includes(p.url))
  let kept = saved.filter((p) => desired.includes(p.url))
  let first = 0
  while (first < kept.length && kept[first].url === desired[first]) first++
  remove.push(...kept.slice(first))
  kept = kept.slice(0, first)
  let stopped = false
  for (const photo of remove) {
    if (photo.code) {
      const r = await call(service, acc, ctx, 'ExcluirFoto', { pCodigoFoto: photo.code, pCodigoAnuncio: ad.ad_code })
      if (transient(r)) {
        stopped = true
        break
      }
    }
    saved = saved.filter((p) => p !== photo)
  }
  if (!stopped) {
    saved = [...kept]
    for (const url of desired.slice(first)) {
      const r = await call(service, acc, ctx, 'IncluirFotoUrl', { oUrlImagem: url, pCodigoAnuncio: ad.ad_code })
      if (transient(r)) break
      const code = r.result && typeof r.result === 'object' ? Number(r.result.CodigoFoto) || 0 : 0
      saved.push(okResult(r) && code > 0 ? { url, code } : { url, code: 0, failed: true })
    }
  }
  const failures = failedPhotos(saved)
  const patch = { photos: saved }
  if (ad.status === 'publicado') {
    patch.message = failures ? `Publicado, mas a Webmotors não aceitou ${failures === 1 ? '1 foto' : `${failures} fotos`}.` : ''
  }
  await saveAd(service, ad, patch)
}

// Recusa com código = erro (não repete sozinho até o carro mudar ou a pessoa
// pedir de novo); sem resposta = tenta de novo na próxima vez
async function failedSend(service, acc, ctx, ad, base, r, hash, { update = false } = {}) {
  if (transient(r)) {
    if (r.skipped) return ad
    return saveAd(service, ad, {
      ...base,
      payload_hash: ad?.payload_hash || '',
      payload: ad?.payload ?? base.payload,
      status: live(ad) ? ad.status : 'pendente',
      message: 'A Webmotors não respondeu agora; o sistema tenta de novo em alguns minutos.',
    })
  }
  const codes = resultCodes(r)
  // Plano cheio: confere as vagas da modalidade
  if (!update && (await refreshModalities(service, acc, ctx))) {
    const modality = (acc.modalities || []).find((m) => String(m.code) === String(acc.modality_code))
    if (wmModalityFull(modality)) {
      ctx.modality = { ...modality }
      return saveAd(service, ad, {
        ...base,
        payload_hash: hash,
        status: 'sem_vaga',
        errors: codes,
        message: `Sem vaga na modalidade "${modality.name}" do plano da Webmotors (${modality.used} de ${modality.total}).`,
      })
    }
  }
  const reason = codes.length ? wmReturnText(codes) : `a Webmotors recusou: ${String(r.fault || 'sem detalhe').slice(0, 200)}`
  return saveAd(service, ad, {
    ...base,
    payload_hash: hash,
    status: 'erro',
    errors: codes,
    message: update ? `${reason}. O anúncio continua no ar com os dados anteriores.` : reason,
  })
}

async function sendInsert(service, company, acc, ctx, car, ad, built, hash) {
  const base = { company_id: company.id, car_id: car.id, payload: built.ad, sent_at: nowIso(), attempts: (ad?.attempts || 0) + 1 }
  if (simulated(company)) {
    return saveAd(service, ad, {
      ...base,
      payload_hash: hash,
      status: 'simulado',
      ad_code: null,
      errors: [],
      photos: built.photos.map((url) => ({ url, code: 0 })),
      message: 'Simulado: na loja de demonstração nada vai para a Webmotors.',
    })
  }
  if (wmModalityFull(ctx.modality)) {
    return saveAd(service, ad, {
      ...base,
      payload_hash: hash,
      status: 'sem_vaga',
      ad_code: null,
      errors: [],
      message: `Sem vaga na modalidade "${ctx.modality.name}" do plano da Webmotors (${ctx.modality.used} de ${ctx.modality.total}).`,
    })
  }
  const r = await call(service, acc, ctx, 'IncluirCarro', { pAnuncio: wmAnuncioParam(built.ad, 0) })
  const code = r.result && typeof r.result === 'object' ? Number(r.result.CodigoAnuncio) || 0 : 0
  if (okResult(r) && code > 0) {
    ctx.modality.used += 1
    const saved = await saveAd(service, ad, {
      ...base,
      payload_hash: hash,
      ad_code: code,
      status: 'publicado',
      errors: [],
      photos: [],
      message: '',
      published_at: nowIso(),
      removed_at: null,
    })
    await syncPhotos(service, acc, ctx, saved, built.photos)
    return saved
  }
  return failedSend(service, acc, ctx, ad, { ...base, ad_code: null }, r, hash)
}

async function sendUpdate(service, acc, ctx, ad, built, hash, force) {
  if (ad.payload_hash !== hash || force) {
    const base = { payload: built.ad, sent_at: nowIso(), attempts: (ad.attempts || 0) + 1 }
    const r = await call(service, acc, ctx, 'AlterarCarro', { pAnuncio: wmAnuncioParam(built.ad, ad.ad_code) })
    if (!okResult(r)) return failedSend(service, acc, ctx, ad, base, r, hash, { update: true })
    await saveAd(service, ad, { ...base, payload_hash: hash, status: 'publicado', errors: [], message: '' })
  }
  await syncPhotos(service, acc, ctx, ad, built.photos)
  return ad
}

// Tira do ar. reason: 'vendido' ou 'outro'
async function sendExclude(service, company, acc, ctx, ad, reason) {
  const removed = { status: 'removido', removed_at: nowIso(), photos: [], message: '', checked_at: nowIso() }
  if (simulated(company) || !live(ad)) return saveAd(service, ad, removed)
  const r = await call(service, acc, ctx, 'ExcluirCarro', { pCodigoAnuncio: ad.ad_code, pMotivoExclusao: EXCLUSION_REASON[reason] || EXCLUSION_REASON.outro })
  if (okResult(r)) return saveAd(service, ad, removed)
  if (!transient(r)) {
    // Recusou: talvez já tenha saído direto na Webmotors (confere na lista do estoque)
    if (ctx.stock === undefined) ctx.stock = await stockCodes(service, acc, ctx)
    if (ctx.stock && !ctx.stock.has(Number(ad.ad_code))) return saveAd(service, ad, removed)
  }
  if (r.skipped) return ad
  return saveAd(service, ad, { message: 'A Webmotors não confirmou a retirada do anúncio; o sistema tenta de novo em alguns minutos.', checked_at: nowIso() })
}

// Lista do estoque na Webmotors (uma vez por hora): anúncio que sumiu de lá foi
// tirado direto na Webmotors
async function checkListing(service, acc, ctx, ads) {
  const codes = await stockCodes(service, acc, ctx)
  ctx.stock = codes
  if (!codes) return
  // Lista vazia com anúncios no ar aqui: pode ser falha da Webmotors (ou a
  // numeração das páginas); não marca nada como tirado
  if (!codes.size && ads.some(live)) {
    console.error('webmotors estoque vazio na Webmotors com anúncios no ar no painel', acc.company_id)
    return
  }
  for (const ad of ads) {
    if (!live(ad) || codes.has(Number(ad.ad_code))) continue
    if (ad.sent_at && Date.now() - new Date(ad.sent_at).getTime() < FRESH_AD_MS) continue
    await saveAd(service, ad, { status: 'removido_wm', photos: [], message: 'Tirado direto na Webmotors (pela loja ou pela Webmotors).', checked_at: nowIso() })
  }
}

// -- Conciliação --------------------------------------------------------------------

async function reconcile(service, company, acc, { manual = false, carIds = [], force = false, deadline = Infinity } = {}) {
  const now = nowIso()
  const { data: locked } = await service
    .from('wm_accounts')
    .update({ sync_lock_until: new Date(Date.now() + LOCK_MS).toISOString() })
    .eq('company_id', company.id)
    .or(`sync_lock_until.is.null,sync_lock_until.lt."${now}"`)
    .select('company_id')
  if (!locked?.length) return { busy: true }

  // sent/updated: a Webmotors aceitou; refused: recusou (fica em "Com problema");
  // waiting: não respondeu agora (tenta de novo sozinho)
  const result = { sent: 0, updated: 0, removed: 0, refused: 0, waiting: 0, status: acc.status }
  const ctx = { calls: 0, relogged: false, modality: null, stock: undefined }
  try {
    const [carsRes, adsRes] = await Promise.all([
      service.from('cars').select(CAR_COLUMNS).eq('company_id', company.id),
      service.from('wm_ads').select('*').eq('company_id', company.id),
    ])
    if (carsRes.error) throw carsRes.error
    if (adsRes.error) throw adsRes.error
    const ads = adsRes.data || []
    const simulate = simulated(company)

    // 1) Sessão; uma vez por hora (ou quando a pessoa pede), as vagas do plano e
    //    a lista do que está no ar na Webmotors
    if (!simulate) {
      if (!(await ensureSession(service, acc))) {
        result.status = acc.status
        return result
      }
      if (manual || !acc.last_list_at || Date.now() - new Date(acc.last_list_at).getTime() > LIST_EVERY_MS) {
        await refreshModalities(service, acc, ctx)
        await checkListing(service, acc, ctx, ads)
        await setAccount(service, acc, { last_list_at: nowIso() })
      }
    }
    const lists = await loadLists(service, simulate ? null : acc, ctx)
    const listsOk = LIST_LEVELS.every((level) => Array.isArray(lists[level]))
    const modality = (acc.modalities || []).find((m) => String(m.code) === String(acc.modality_code))
    ctx.modality = modality ? { ...modality } : null
    // A tela avisa quando falta a modalidade ou as listas da Webmotors não vieram
    result.modality = Boolean(ctx.modality)
    result.lists = listsOk
    const settings = acc.settings || {}

    // 2) Um carro por vez
    const blocked = acc.status !== 'conectada' && !manual
    const adsByCar = new Map(ads.filter((a) => a.car_id).map((a) => [a.car_id, a]))
    let sends = 0
    for (const row of carsRes.data || []) {
      if (Date.now() > deadline || sends >= MAX_SENDS || ctx.calls >= MAX_CALLS) break
      const car = wmCarFromRow(row)
      const ad = adsByCar.get(car.id) || null
      const requested = carIds.includes(car.id)
      if (wmEligible(car)) {
        if (blocked || !listsOk || !ctx.modality) continue
        // Sem a publicação automática: só o que já está na Webmotors ou o que a pessoa pediu
        if (!acc.auto_publish && !requested && !live(ad)) continue
        if (ad?.status === 'removido_wm' && !requested) continue
        const built = buildWebmotorsAd(car, { siteUrl: company.site_url, settings, modality: ctx.modality, lists })
        if (!built.ad) continue
        if (requested && force && ad) ad.photos = (ad.photos || []).filter((p) => !p?.failed)
        const hash = await sha256(JSON.stringify(built.ad))
        if (live(ad)) {
          if (ad.payload_hash === hash && samePhotos(ad.photos, built.photos) && !(requested && force)) continue
          const saved = await sendUpdate(service, acc, ctx, ad, built, hash, requested && force)
          // Sem resposta, o anúncio fica com o hash anterior (tenta de novo depois)
          if (saved?.status === 'erro') result.refused++
          else if (saved?.payload_hash !== hash) result.waiting++
          else result.updated++
        } else {
          const status = ad?.status || ''
          const retry = !ad || ['removido', 'pendente'].includes(status) || (requested && (force || status === 'removido_wm'))
            || (['erro', 'sem_vaga', 'simulado'].includes(status) && ad.payload_hash !== hash)
            || (status === 'sem_vaga' && Date.now() - new Date(ad.sent_at || 0).getTime() > SLOT_RETRY_MS)
          if (!retry) continue
          const saved = await sendInsert(service, company, acc, ctx, car, ad, built, hash)
          if (['publicado', 'simulado'].includes(saved?.status)) result.sent++
          else if (['erro', 'sem_vaga'].includes(saved?.status)) result.refused++
          else result.waiting++
        }
        sends++
      } else if (ad && !['removido', 'removido_wm'].includes(ad.status)) {
        // Saiu de venda (ou foi desmarcado): tira do ar
        const counted = live(ad) || ad.status === 'simulado'
        await sendExclude(service, company, acc, ctx, ad, car.status === 'vendido' ? 'vendido' : 'outro')
        if (counted && ad.status === 'removido') result.removed++
      }
    }

    // 3) Carro excluído do painel com anúncio no ar: tira da Webmotors; os outros saem da tabela
    for (const ad of ads.filter((a) => !a.car_id)) {
      if (Date.now() > deadline || ctx.calls >= MAX_CALLS) break
      if (live(ad)) {
        await sendExclude(service, company, acc, ctx, ad, 'outro')
        result.removed++
      } else {
        await service.from('wm_ads').delete().eq('id', ad.id)
      }
    }
    result.status = acc.status
    return result
  } finally {
    await service.from('wm_accounts').update({ sync_lock_until: null, last_sync_at: nowIso() }).eq('company_id', company.id)
  }
}

// Rodada automática: todas as lojas conectadas (menos as bloqueadas e a de
// demonstração quando só simula)
async function round(service) {
  if (!CONFIGURED) return json({ ok: true, stores: 0, configured: false })
  const cutoff = new Date(Date.now() - ROUND_GAP_MS).toISOString()
  const { data: lock } = await service.from('wm_state').update({ last_round_at: nowIso() }).eq('id', 1).lt('last_round_at', cutoff).select('id')
  if (!lock?.length) return json({ skipped: true })
  const deadline = Date.now() + ROUND_BUDGET_MS
  const { data: accounts } = await service.from('wm_accounts').select('*').eq('status', 'conectada')
  const ids = (accounts || []).map((a) => a.company_id)
  if (!ids.length) return json({ ok: true, stores: 0 })
  const [{ data: companies }, { data: clients }] = await Promise.all([
    service.from('companies').select(COMPANY_COLUMNS).in('id', ids),
    service.from('client_accounts').select('company_id, status').in('company_id', ids),
  ])
  let stores = 0
  for (const acc of accounts) {
    if (Date.now() > deadline) break
    const company = (companies || []).find((c) => c.id === acc.company_id)
    const client = (clients || []).find((c) => c.company_id === acc.company_id)
    if (!company || simulated(company) || ['bloqueado', 'cancelado'].includes(client?.status)) continue
    try {
      await reconcile(service, company, acc, { deadline })
      stores++
    } catch (err) {
      console.error('webmotors rodada', company.slug, err)
    }
  }
  return json({ ok: true, stores })
}

// -- Conectar e desconectar ----------------------------------------------------------

async function connect(service, caller, user, company, body) {
  const { data: isAdmin } = await caller.rpc('is_company_admin')
  if (isAdmin !== true) throw new UserError('Só o administrador conecta a Webmotors.', 403)
  if (!CONFIGURED) throw new UserError(NOT_CONFIGURED, 503)
  const cnpj = wmCnpj(body.cnpj)
  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.senha || '')
  if (!cnpj) throw new UserError('Digite o CNPJ da loja (14 números).')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new UserError('Digite o e-mail do usuário de integração.')
  if (!password || password.length > 200) throw new UserError('Digite a senha do usuário de integração.')

  const existing = await account(service, company.id)
  const probe = { company_id: company.id, cnpj, email }
  const result = await login(probe, { cnpj, email, password })
  if (!result.ok) {
    if (!result.rejected) throw new UserError('A Webmotors não respondeu agora. Tente de novo em instantes.', 502)
    throw new UserError(result.stage === 'acesso'
      ? 'A Webmotors recusou o acesso da integração. Confira com a Webmotors se o usuário de integração foi liberado para a WB.AUTO.'
      : 'A Webmotors não aceitou o CNPJ, o e-mail e a senha. Confira os dados do usuário de integração que a Webmotors mandou para a loja.')
  }

  const values = {
    cnpj,
    email,
    session_hash: result.hash,
    session_expires_at: new Date(Date.now() + SESSION_MS).toISOString(),
    status: 'conectada',
    status_detail: '',
    connected_by: user.id,
    connected_at: nowIso(),
    sync_lock_until: null,
  }
  const { error } = existing
    ? await service.from('wm_accounts').update(values).eq('company_id', company.id)
    : await service.from('wm_accounts').insert({ company_id: company.id, ...values, settings: { publish_default: true } })
  if (error) throw error
  const { error: vaultError } = await service.rpc('wm_save_password', { p_company: company.id, p_password: password })
  if (vaultError) {
    console.error('webmotors vault', vaultError.message)
    if (!existing) await service.from('wm_accounts').delete().eq('company_id', company.id)
    throw new UserError('Não foi possível guardar a senha com segurança. Tente de novo; se continuar, fale com a WB.Dev.', 500)
  }
  const acc = await account(service, company.id)
  await refreshModalities(service, acc, { calls: 0, relogged: false })
  await log(service, company.id, user.id, `Conectou a Webmotors (CNPJ ${formatCnpj(cnpj)})`)
  return json({ ok: true, modalities: acc.modalities || [] })
}

async function disconnect(service, company, acc, user, removeAds) {
  let removed = 0
  if (removeAds) {
    const { data: ads } = await service.from('wm_ads').select('*').eq('company_id', company.id)
    const ctx = { calls: 0, relogged: false, modality: null, stock: undefined }
    const online = simulated(company) || (CONFIGURED && (await ensureSession(service, acc)))
    for (const ad of (ads || []).filter((a) => live(a) || a.status === 'simulado')) {
      if (live(ad) && !online) continue
      await sendExclude(service, company, acc, ctx, ad, 'outro')
      if (ad.status === 'removido') removed++
    }
  }
  await service.from('wm_accounts').delete().eq('company_id', company.id)
  const { error } = await service.rpc('wm_delete_password', { p_company: company.id })
  if (error) console.error('webmotors vault', error.message)
  await log(service, company.id, user.id, removed ? `Desconectou a Webmotors e tirou ${removed} ${removed === 1 ? 'anúncio' : 'anúncios'}` : 'Desconectou a Webmotors')
  return json({ ok: true, removed })
}

// -- Entrada -----------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)
  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  try {
    let body = {}
    try {
      body = (await req.json()) || {}
    } catch {
      return json({ error: 'Corpo inválido' }, 400)
    }
    if (body.action === 'rodada') return await round(service)

    const caller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false },
    })
    const { data: userData } = await caller.auth.getUser()
    const { data: canEdit } = await caller.rpc('can_edit_stock')
    const { data: companyId } = await caller.rpc('current_company_id')
    if (!userData?.user || canEdit !== true || !companyId) return json({ error: 'Acesso restrito à equipe da loja' }, 403)
    const { data: company, error: companyError } = await service.from('companies').select(COMPANY_COLUMNS).eq('id', companyId).single()
    if (companyError) throw companyError

    if (body.action === 'situacao') return json({ configured: CONFIGURED, ambiente: AMBIENTE })
    if (body.action === 'conectar') return await connect(service, caller, userData.user, company, body)

    const acc = await account(service, companyId)
    if (body.action === 'desconectar') {
      const { data: isAdmin } = await caller.rpc('is_company_admin')
      if (isAdmin !== true) throw new UserError('Só o administrador desconecta a Webmotors.', 403)
      if (!acc) return json({ ok: true, removed: 0 })
      return await disconnect(service, company, acc, userData.user, body.removeAds === true)
    }
    if (!acc) throw new UserError('Conecte a Webmotors em Portais primeiro.', 409)
    if (!CONFIGURED) throw new UserError(NOT_CONFIGURED, 503)

    switch (body.action) {
      case 'modalidades': {
        if (!simulated(company) && !(await ensureSession(service, acc))) {
          throw new UserError(acc.status_detail || 'A Webmotors não respondeu agora. Tente de novo em instantes.', 502)
        }
        if (!simulated(company)) await refreshModalities(service, acc, { calls: 0, relogged: false })
        return json({ modalities: acc.modalities || [], modality_code: acc.modality_code || '' })
      }
      case 'catalogo': {
        const level = String(body.level || '')
        if (!OPERATIONS[level]) throw new UserError('Lista desconhecida.')
        const brandId = Number(body.brandId)
        const modelId = Number(body.modelId)
        if (level === 'modelos' && !Number.isInteger(brandId)) throw new UserError('Escolha a marca.')
        if (level === 'versoes' && !Number.isInteger(modelId)) throw new UserError('Escolha o modelo.')
        const options = await catalogOptions(service, simulated(company) ? null : acc, { calls: 0, relogged: false }, level, { brandId, modelId })
        if (!options) {
          throw new UserError(acc.status === 'erro' && acc.status_detail ? acc.status_detail : 'A Webmotors não respondeu a lista agora. Tente de novo em instantes.', 502)
        }
        return json({ options })
      }
      case 'sincronizar': {
        const carIds = (Array.isArray(body.carIds) ? body.carIds : []).map(String).slice(0, MAX_SENDS)
        const result = await reconcile(service, company, acc, { manual: carIds.length > 0 || body.manual === true, carIds, force: body.force === true })
        return json(result)
      }
      case 'previa': {
        const { data: row } = await service.from('cars').select(CAR_COLUMNS).eq('company_id', companyId).eq('id', String(body.carId || '')).maybeSingle()
        if (!row) throw new UserError('Carro não encontrado.', 404)
        const car = wmCarFromRow(row)
        const lists = await loadLists(service, simulated(company) ? null : acc, { calls: 0, relogged: false })
        const modality = (acc.modalities || []).find((m) => String(m.code) === String(acc.modality_code)) || null
        const built = buildWebmotorsAd(car, { siteUrl: company.site_url, settings: acc.settings || {}, modality, lists })
        const listsMissing = LIST_LEVELS.filter((level) => !Array.isArray(lists[level]))
        return json({ ad: built.ad, photos: built.photos, labels: built.labels, missing: built.missing, outReason: wmOutReason(car), listsMissing })
      }
      default:
        throw new UserError('Ação desconhecida.')
    }
  } catch (err) {
    if (err instanceof UserError) return json({ error: err.message }, err.status)
    console.error(err)
    return json({ error: 'Erro inesperado na integração com a Webmotors.' }, 500)
  }
})

// -- Cópia de src/utils/webmotorsAd.js (não editar aqui: rode
//    node supabase/functions/webmotors/atualizar-copia.mjs) -----------------------
// <webmotorsAd.js>
// Anúncio da Webmotors (seção 61): monta o anúncio de um carro no formato da
// API de estoque da Webmotors (SOAP, wsEstoqueRevendedorWebMotors), diz o que
// falta para publicar, liga a cor, o câmbio, o combustível e os opcionais às
// listas da Webmotors e monta e lê as mensagens SOAP. Só carros: as motos usam
// outro serviço da Webmotors, contratado à parte pela loja.
// Código puro, sem imports: o mesmo texto vai copiado dentro da Edge Function
// webmotors (o teste tests/webmotorsAd.test.js confere que a cópia é idêntica).
// Os códigos de retorno e de motivo da Webmotors ainda vão ser conferidos no
// ambiente de teste (o manual não traz a tabela em texto).

export const WM_NAMESPACE = 'www.webmotors.com.br/wsEstoqueRevendedorWebMotors'
export const WM_LOGIN_NAMESPACE = 'www.webmotors.com.br/wsLoginSistemaRevendedor'
export const WM_MAX_IMAGES = 20
export const WM_MAX_TEXT = 3000

function clean(value) {
  return String(value ?? '').trim()
}

// Minúsculo e sem acento (para procurar palavras nos destaques)
function plain(value) {
  return clean(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

// Maiúsculo, sem acento, só letras, números e espaço; "1,0" e "1.0" viram "1.0"
export function wmNormalize(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/(\d)[.,](\d)/g, '$1#$2')
    .replace(/[^A-Z0-9#]+/g, ' ')
    .replace(/#/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
}

// Placa em maiúsculas, sem hífen (antiga ABC1234 ou Mercosul ABC1D23)
export function wmPlate(plate) {
  const value = clean(plate).toUpperCase().replace(/[^A-Z0-9]/g, '')
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(value) ? value : ''
}

export function wmCnpj(value) {
  const digits = clean(value).replace(/\D/g, '')
  return digits.length === 14 ? digits : ''
}

function validYear(n) {
  return Number.isInteger(n) && n >= 1900 && n <= 2100
}

// Anos do anúncio: "2022/2023" → fabricação 2022 e modelo 2023; com um ano só,
// vale para os dois. null quando não dá para saber.
export function wmYears(car) {
  const text = clean(car.modelYear)
  const pair = text.match(/^(\d{4})\s*\/\s*(\d{4})$/)
  const single = text.match(/^(\d{4})$/)
  const year = Number(car.year)
  let fab = null
  let model = null
  if (pair) {
    fab = Number(pair[1])
    model = Number(pair[2])
  } else if (single) {
    model = Number(single[1])
    fab = validYear(year) && year <= model && year >= model - 1 ? year : model
  } else if (validYear(year)) {
    fab = year
    model = year
  }
  if (!validYear(fab) || !validYear(model) || model < fab || model > fab + 1) return null
  return { fab, model }
}

export function wmDoors(doors) {
  const n = Number(doors)
  return Number.isInteger(n) && n >= 2 && n <= 5 ? n : 0
}

export function wmTitle(car) {
  const text = [car.brand, car.model, car.version].map(clean).filter(Boolean).join(' ').replace(/\s+/g, ' ')
  return text.length >= 2 ? text : 'Veículo'
}

// Fotos: as do site (/uploads/carros/<nome>.webp) vão pela cópia em JPG, que o
// site gera na primeira vez (api/foto-jpg.php), como na OLX
export function wmImageUrl(url, siteUrl) {
  const site = clean(siteUrl).replace(/\/+$/, '')
  const value = clean(url)
  const local = /^\/uploads\/carros\/([A-Za-z0-9-]{8,64})\.(webp|jpg|jpeg|png)$/i.exec(value)
  if (local) {
    if (!/^https?:\/\//.test(site)) return null
    return local[2].toLowerCase() === 'webp' ? `${site}/uploads/carros/jpg/${local[1]}.jpg` : `${site}${value}`
  }
  if (/^https?:\/\/\S+\.(jpe?g|png)(\?\S*)?$/i.test(value)) return value
  return null
}

export function wmImages(car, siteUrl) {
  const out = []
  for (const url of car.images || []) {
    const image = wmImageUrl(url, siteUrl)
    if (image && !out.includes(image)) out.push(image)
    if (out.length === WM_MAX_IMAGES) break
  }
  return out
}

// Por que o carro não vai para a Webmotors (vazio = vai). As mesmas regras da
// OLX (decisão do Wesley): só os disponíveis, visíveis no site, fora do
// repasse e marcados "Publicar na Webmotors". Moto fica de fora.
export function wmOutReason(car) {
  if (car.category === 'moto') return 'Moto (a Webmotors usa outro serviço para motos)'
  if (car.webmotorsPublish === false) return 'Desmarcado para a Webmotors'
  if (car.entryType === 'repasse') return 'Repasse'
  if (car.status === 'vendido') return 'Vendido'
  if (car.status === 'reservado') return 'Reservado'
  if (car.status === 'manutencao') return 'Em manutenção'
  if (car.status !== 'disponivel') return 'Fora de venda'
  if (car.hidden) return 'Oculto do site'
  return ''
}

export function wmEligible(car) {
  return !wmOutReason(car)
}

export const WM_MISSING_LABELS = {
  catalogo: 'marca, modelo e versão da Webmotors',
  placa: 'placa',
  preco: 'preço',
  ano: 'ano de fabricação e ano modelo',
  portas: 'número de portas',
  foto: 'foto',
  cor: 'cor na lista da Webmotors',
  cambio: 'câmbio na lista da Webmotors',
  combustivel: 'combustível na lista da Webmotors',
  modalidade: 'modalidade do plano da Webmotors (em Portais)',
}

// -- Cor, câmbio e combustível --------------------------------------------------------
// A Webmotors tem listas próprias (ObterCores, ObterCambio, ObterCombustivel).
// O escolhido no cadastro (webmotors_catalog) vale; sem ele, o sistema usa o
// item da lista que combina com o texto do carro.

const round3 = (n) => Math.round(n * 1000) / 1000

function rank(options, scoreOf) {
  return (options || [])
    .map((o) => ({ ...o, score: round3(scoreOf(o.name)) }))
    .sort((a, b) => b.score - a.score || String(a.name).length - String(b.name).length || String(a.name).localeCompare(String(b.name)))
}

// A melhor da lista quando a nota passa do mínimo. No empate fica o nome mais
// curto, que é o mais geral ("Automática" antes de "Automática sequencial").
export function wmPick(ranked, min = 0.75) {
  const best = (ranked || [])[0]
  return best && best.score >= min ? { id: best.id, name: best.name } : null
}

const COLOR_STEMS = ['PRET', 'BRANC', 'PRAT', 'CINZ', 'GRAFIT', 'CHUMB', 'VERMELH', 'AZUL', 'VERDE', 'AMAREL', 'LARANJ', 'BEGE',
  'MARROM', 'DOURAD', 'VINHO', 'BORDO', 'ROX', 'ROSA', 'BRONZE', 'CHAMPA', 'MARFIM', 'PEROL', 'CREME', 'FUME', 'CARAMEL']

// Tons que, sem a cor exata na lista, entram na cor básica
const COLOR_BASE = { GRAFIT: 'CINZ', CHUMB: 'CINZ', FUME: 'CINZ', BORDO: 'VINHO', PEROL: 'BRANC', CHAMPA: 'BEGE', CREME: 'BEGE',
  MARFIM: 'BEGE', CARAMEL: 'MARROM' }

function colorStems(value) {
  return wmNormalize(value).split(' ').map((w) => COLOR_STEMS.find((s) => w.startsWith(s))).filter(Boolean)
}

export function wmRankColors(color, options) {
  const q = wmNormalize(color)
  const ours = colorStems(color)
  return rank(options, (name) => {
    const n = wmNormalize(name)
    if (!q || !n) return 0
    if (n === q) return 1
    const theirs = colorStems(name)
    if (!ours.length || !theirs.length) return 0
    if (theirs[0] === ours[0]) {
      // "Branco" para "Branco Pérola"; uma cor composta só se for a mesma
      if (!theirs.every((s) => ours.includes(s))) return 0.5
      return theirs.length === ours.length ? 0.95 : 0.9
    }
    return theirs.length === 1 && COLOR_BASE[ours[0]] === theirs[0] ? 0.8 : 0
  })
}

function gearKind(value) {
  const t = plain(value)
  if (!t) return ''
  if (/manual|mecanic/.test(t)) return 'manual'
  if (/semi/.test(t)) return 'semi'
  if (/automatizad/.test(t)) return 'automatizado'
  if (/cvt|continu/.test(t)) return 'cvt'
  if (/autom|tiptronic|dsg|sequencial|\bat\b/.test(t)) return 'automatico'
  return ''
}

export function wmRankGears(transmission, options) {
  const ours = gearKind(transmission)
  return rank(options, (name) => {
    const theirs = gearKind(name)
    if (!ours || !theirs) return 0
    if (theirs === ours) return 1
    // Sem "CVT" na lista, o CVT entra como automático
    return ours === 'cvt' && theirs === 'automatico' ? 0.8 : 0
  })
}

function fuelKind(value) {
  const t = plain(value)
  if (!t) return ''
  const gas = /gasolina/.test(t)
  const alc = /alcool|etanol/.test(t)
  const ele = /eletric/.test(t)
  const die = /diesel/.test(t)
  const gnv = /gnv|gas natural/.test(t)
  if (/hibrid/.test(t) || (ele && (gas || alc || die))) return 'hibrido'
  if (ele) return 'eletrico'
  if (/flex|bicombust/.test(t) || (gas && alc)) return gnv ? 'flex-gnv' : 'flex'
  if (die) return 'diesel'
  if (gnv) return gas ? 'gasolina-gnv' : alc ? 'alcool-gnv' : 'gnv'
  if (alc) return 'alcool'
  if (gas) return 'gasolina'
  return ''
}

export function wmRankFuels(fuel, options) {
  const ours = fuelKind(fuel)
  return rank(options, (name) => {
    const theirs = fuelKind(name)
    if (!ours || !theirs) return 0
    if (theirs === ours) return 1
    // "GNV" no cadastro: o kit vai com qualquer combustível de base
    return ours === 'gnv' && theirs.endsWith('-gnv') ? 0.8 : 0
  })
}

// lists: { cores, cambios, combustiveis } ([{ id, name }]); lista que não veio = não escolhe
export function wmResolve(car, lists = {}) {
  const cat = car.webmotorsCatalog || {}
  const chosen = (id, name) => (id ? { id, name: clean(name) } : null)
  return {
    color: chosen(cat.colorId, cat.colorName) || (lists.cores ? wmPick(wmRankColors(car.color, lists.cores)) : null),
    gear: chosen(cat.gearId, cat.gearName) || (lists.cambios ? wmPick(wmRankGears(car.transmission, lists.cambios)) : null),
    fuel: chosen(cat.fuelId, cat.fuelName) || (lists.combustiveis ? wmPick(wmRankFuels(car.fuel, lists.combustiveis)) : null),
  }
}

// O que falta no carro. ctx: { siteUrl, lists }. Sem as listas da Webmotors
// (ctx.lists vazio), a cor, o câmbio e o combustível ficam para a função
// conferir no envio.
export function wmMissing(car, ctx = {}) {
  const cat = car.webmotorsCatalog || {}
  const lists = ctx.lists || {}
  const missing = []
  if (!cat.brandId || !cat.modelId || !cat.versionId) missing.push('catalogo')
  if (!wmPlate(car.plate)) missing.push('placa')
  if (!(Number(car.price) > 0)) missing.push('preco')
  if (!wmYears(car)) missing.push('ano')
  if (!wmDoors(car.doors)) missing.push('portas')
  if (wmImages(car, ctx.siteUrl).length === 0) missing.push('foto')
  const resolved = wmResolve(car, lists)
  if (lists.cores && !resolved.color) missing.push('cor')
  if (lists.cambios && !resolved.gear) missing.push('cambio')
  if (lists.combustiveis && !resolved.fuel) missing.push('combustivel')
  return missing
}

// -- Opcionais ----------------------------------------------------------------------
// Palavras dos destaques do carro e o nome do opcional na lista da Webmotors

const FEATURES = [
  [/ar[ -]?condicionado|ar digital|climatiza/, /^AR CONDICIONADO|CLIMATIZ/],
  [/ar quente/, /AR QUENTE/],
  [/vidros? eletric/, /VIDROS? ELETRIC/],
  [/travas? eletric/, /TRAVAS? ELETRIC/],
  [/retrovisor(es)? eletric/, /RETROVISOR(ES)? ELETRIC/],
  [/air ?bags?/, /AIR ?BAG/],
  [/alarme/, /ALARME/],
  [/\babs\b/, /\bABS\b/],
  [/controle de tracao/, /CONTROLE DE TRACAO/],
  [/controle de estabilidade/, /ESTABILIDADE/],
  [/multimidia/, /MULTIMIDIA/],
  [/\bradio\b|\bsom\b/, /^RADIO|\bSOM\b/],
  [/android auto|carplay|car play/, /ANDROID|CAR ?PLAY/],
  [/bluetooth/, /BLUETOOTH/],
  [/\busb\b/, /USB/],
  [/\bgps\b|navegador/, /GPS|NAVEGADOR/],
  [/sensor(es)? de (re|estacionamento)\b/, /SENSOR(ES)? DE (ESTACIONAMENTO|RE)\b/],
  [/camera de re/, /CAMERA DE RE/],
  [/sensor de chuva/, /SENSOR DE CHUVA/],
  [/sensor crepuscular|farol automatico/, /CREPUSCULAR|FAROL AUTOMATICO/],
  [/couro/, /COURO/],
  [/computador de bordo/, /COMPUTADOR DE BORDO/],
  [/volante multifuncional|comandos? no volante/, /VOLANTE MULTIFUNCIONAL|COMANDOS? NO VOLANTE/],
  [/piloto automatico|controle (automatico )?de (velocidade|cruzeiro)|cruise/, /PILOTO AUTOMATICO|CONTROLE (AUTOMATICO )?DE VELOCIDADE|CRUZEIRO/],
  [/rodas? (de )?liga/, /RODAS? (DE )?LIGA/],
  [/teto solar|teto panoramico/, /TETO SOLAR|PANORAMIC/],
  [/4x4|tracao integral|\bawd\b|\b4wd\b/, /4X4|TRACAO INTEGRAL/],
  [/direcao eletro[- ]?hidraulica/, /ELETRO ?HIDRAULICA/],
  [/direcao eletrica/, /DIRECAO ELETRICA/],
  [/direcao hidraulica/, /^DIRECAO HIDRAULICA/],
  [/neblina|farol de milha/, /NEBLINA|MILHA/],
  [/partida (sem chave|por botao)|keyless|start[ -]?stop/, /PARTIDA|KEYLESS|START/],
  [/desembacador/, /DESEMBACADOR/],
  [/limpador traseiro/, /LIMPADOR TRASEIRO/],
  [/carregador (por )?inducao|carregamento sem fio|wireless/, /INDUCAO|SEM FIO|WIRELESS/],
  [/isofix/, /ISOFIX/],
]

// Códigos dos opcionais da lista da Webmotors que os destaques do carro citam
// (na ordem da lista, para o mesmo carro dar sempre o mesmo anúncio)
export function wmOptionals(car, options) {
  const list = options || []
  if (!list.length) return []
  const text = plain((car.highlights || []).join(' \n '))
  const ownNames = new Set((car.highlights || []).map(wmNormalize).filter(Boolean))
  const picked = new Set()
  for (const [ours, theirs] of FEATURES) {
    if (!ours.test(text)) continue
    const match = list
      .filter((o) => theirs.test(wmNormalize(o.name)))
      .sort((a, b) => wmNormalize(a.name).length - wmNormalize(b.name).length)[0]
    if (match) picked.add(String(match.id))
  }
  for (const o of list) if (ownNames.has(wmNormalize(o.name))) picked.add(String(o.id))
  return list.filter((o) => picked.has(String(o.id))).map((o) => o.id)
}

// -- Anúncio --------------------------------------------------------------------------

function thousands(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

// Texto do anúncio: a descrição do carro (ou um texto com os dados, se estiver
// vazia) e o texto padrão da loja no fim
export function wmObservation(car, settings = {}) {
  let text = clean(car.description)
  if (text.length < 2) {
    const facts = [
      clean(car.modelYear) ? `Ano ${clean(car.modelYear)}` : car.year ? `Ano ${car.year}` : '',
      car.km != null && car.km !== '' ? `${thousands(car.km)} km` : '',
      clean(car.transmission) ? `Câmbio ${clean(car.transmission).toLowerCase()}` : '',
      clean(car.fuel),
      clean(car.color) ? `Cor ${clean(car.color).toLowerCase()}` : '',
    ].filter(Boolean)
    const highlights = (car.highlights || []).map(clean).filter(Boolean)
    text = [wmTitle(car), facts.join(' · '), highlights.map((h) => `- ${h}`).join('\n')].filter(Boolean).join('\n\n')
  }
  const footer = clean(settings.footer)
  if (footer) text = `${text}\n\n${footer}`
  return text.slice(0, WM_MAX_TEXT)
}

function yesNo(value) {
  return value ? 'S' : 'N'
}

// Monta o anúncio (o "pAnuncio" de IncluirCarro e AlterarCarro, sem o
// CodigoAnuncio). ctx: { siteUrl, settings, modality: { code, type, name },
// lists: { cores, cambios, combustiveis, opcionais } }.
// Devolve { ad, photos, labels, missing }; ad = null quando falta dado.
export function buildWebmotorsAd(car, ctx = {}) {
  const lists = ctx.lists || {}
  const missing = wmMissing(car, ctx)
  const resolved = wmResolve(car, lists)
  for (const [key, value] of [['cor', resolved.color], ['cambio', resolved.gear], ['combustivel', resolved.fuel]]) {
    if (!value && !missing.includes(key)) missing.push(key)
  }
  if (!ctx.modality?.code) missing.push('modalidade')
  if (missing.length) return { ad: null, photos: [], labels: null, missing }

  const cat = car.webmotorsCatalog
  const years = wmYears(car)
  const text = plain((car.highlights || []).join(' \n '))
  const settings = ctx.settings || {}
  const price = Math.round(Number(car.price))
  const optionals = wmOptionals(car, lists.opcionais)
  const ad = {
    CodigoModalidade: Number(ctx.modality.code),
    TipoAnuncio: ctx.modality.type === 'N' ? 'N' : 'U',
    CodigoMarca: Number(cat.brandId),
    CodigoModelo: Number(cat.modelId),
    CodigoVersao: Number(cat.versionId),
    AnoDoModelo: years.model,
    AnoFabricacao: years.fab,
    Km: Math.max(0, Math.round(Number(car.km) || 0)),
    Placa: wmPlate(car.plate),
    CodigoCambio: Number(resolved.gear.id),
    NrPortas: wmDoors(car.doors),
    CodigoCor: Number(resolved.color.id),
    CodigoCombustivel: Number(resolved.fuel.id),
    Blindado: yesNo(/blindad/.test(text)),
    AdaptadoDeficientesFisicos: yesNo(/adaptad[oa]s? (para )?(pcd|deficien)/.test(text)),
    UnicoDono: yesNo(plain(car.condition).includes('unico')),
    Alienado: 'N',
    IpvaPago: yesNo(/ipva (\d{4} )?(pago|quitado)/.test(text)),
    NaoAceitaTroca: yesNo(settings.exchange === 'nao'),
    RevisadoOficinaAgendaDoCarro: 'N',
    RevisoesEmConcessionaria: yesNo(/revis(ad[oa]s?|oes)( feitas)? (na|em|pela) concessionaria/.test(text)),
    GarantiaDeFabrica: yesNo(/garantia de fabrica|na garantia/.test(text)),
    Licenciado: yesNo(/licenciad/.test(text)),
    Leilao: 'N',
    // PrecoVenda é o preço do anúncio. A Webmotors exige PrecoVenda maior que
    // PrecoReal (iguais = erro 22|78; Gabriel, Webmotors, 09/10/2026). O PrecoReal
    // parece ser o antigo PrecoRevenda (preço para outros revendedores): vai R$ 1
    // abaixo (decisão do Wesley). Não há "de/por": o preço antigo não vai.
    PrecoReal: price - 1,
    PrecoVenda: price,
    Observacao: wmObservation(car, settings),
    Opcional: optionals,
  }
  const labels = {
    marca: clean(cat.brandName),
    modelo: clean(cat.modelName),
    versao: clean(cat.versionName),
    cor: resolved.color.name,
    cambio: resolved.gear.name,
    combustivel: resolved.fuel.name,
    opcionais: (lists.opcionais || []).filter((o) => optionals.includes(o.id)).map((o) => o.name),
    modalidade: clean(ctx.modality.name),
  }
  return { ad, photos: wmImages(car, ctx.siteUrl), labels, missing: [] }
}

// Linha do banco (cars) no formato do painel
export function wmCarFromRow(row) {
  return {
    id: row.id,
    brand: row.brand,
    model: row.model,
    version: row.version,
    year: row.year,
    modelYear: row.model_year,
    km: row.km,
    transmission: row.transmission,
    fuel: row.fuel,
    color: row.color,
    doors: row.doors,
    category: row.category,
    condition: row.condition,
    price: row.price,
    originalPrice: row.original_price,
    highlights: row.highlights || [],
    description: row.description || '',
    images: row.images || [],
    status: row.status,
    hidden: Boolean(row.hidden),
    plate: row.plate || '',
    entryType: row.entry_type || 'showroom',
    webmotorsPublish: row.webmotors_publish !== false,
    webmotorsCatalog: row.webmotors_catalog || {},
  }
}

// Versões do ano modelo do carro primeiro: só as que têm o ano, quando houver
export function wmVersionsForYear(options, year) {
  const list = options || []
  const y = Number(year)
  const withYear = list.filter((o) => Array.isArray(o.years) && o.years.includes(y))
  return withYear.length ? withYear : list
}

// -- SOAP ---------------------------------------------------------------------------

// Ordem dos campos do "Anuncio" no WSDL (o serviço .asmx lê na ordem)
const AD_FIELDS = ['CodigoModalidade', 'TipoAnuncio', 'CodigoMarca', 'CodigoModelo', 'CodigoVersao', 'AnoDoModelo', 'AnoFabricacao', 'Km',
  'Placa', 'CodigoCambio', 'NrPortas', 'CodigoCor', 'CodigoCombustivel', 'Blindado', 'AdaptadoDeficientesFisicos', 'UnicoDono', 'Alienado',
  'IpvaPago', 'NaoAceitaTroca', 'RevisadoOficinaAgendaDoCarro', 'RevisoesEmConcessionaria', 'GarantiaDeFabrica', 'Licenciado', 'Leilao',
  'PrecoReal', 'PrecoVenda', 'Observacao']

// O "pAnuncio" do envio: CodigoAnuncio 0 para incluir, o código para alterar
export function wmAnuncioParam(ad, code = 0) {
  const out = { CodigoAnuncio: code || 0 }
  for (const key of AD_FIELDS) {
    if (ad[key] !== undefined && ad[key] !== null && ad[key] !== '') out[key] = ad[key]
  }
  if (Array.isArray(ad.Opcional) && ad.Opcional.length) out.Opcional = { OpcionalWM: ad.Opcional.map((c) => ({ CodigoOpcional: c })) }
  return out
}

// Texto seguro no XML: tira caracteres de controle e escapa < > &
function xmlText(value) {
  let out = ''
  for (const ch of String(value)) {
    const c = ch.codePointAt(0)
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) continue
    out += ch
  }
  return out.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function xmlNode(name, value) {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return value.map((v) => xmlNode(name, v)).join('')
  if (typeof value === 'object') return `<${name}>${Object.entries(value).map(([k, v]) => xmlNode(k, v)).join('')}</${name}>`
  return `<${name}>${xmlText(value)}</${name}>`
}

// Envelope SOAP 1.1 de uma operação; params na ordem do WSDL. Lista vira
// elementos repetidos com o mesmo nome.
export function wmSoapEnvelope(namespace, operation, params = {}) {
  const body = Object.entries(params).map(([k, v]) => xmlNode(k, v)).join('')
  return '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" ' +
    'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
    `<soap:Body><${operation} xmlns="${namespace}">${body}</${operation}></soap:Body></soap:Envelope>`
}

const XML_ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

function decodeXml(text) {
  return text.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z]+);/g, (whole, name) => {
    if (name[0] !== '#') return XML_ENTITIES[name] ?? whole
    const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
  })
}

function xmlValue(node) {
  if (!node.kids.length) return node.text.trim()
  const out = {}
  for (const kid of node.kids) {
    const value = xmlValue(kid)
    if (!Object.prototype.hasOwnProperty.call(out, kid.name)) out[kid.name] = value
    else if (Array.isArray(out[kid.name])) out[kid.name].push(value)
    else out[kid.name] = [out[kid.name], value]
  }
  return out
}

// Lê o XML da resposta: cada elemento vira texto (sem filhos) ou objeto com os
// filhos pelo nome sem o prefixo; repetidos viram lista. Atributos são ignorados.
export function wmParseXml(xml) {
  const stack = [{ name: '', kids: [], text: '' }]
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z_][\w.:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)/g
  for (const m of String(xml || '').matchAll(re)) {
    const top = stack[stack.length - 1]
    if (m[1] !== undefined) top.text += m[1]
    else if (m[3]) {
      const name = m[3].replace(/^[^:]*:/, '')
      if (m[2]) {
        if (stack.length > 1) stack[stack.length - 2].kids.push(stack.pop())
      } else {
        const node = { name, kids: [], text: '' }
        if (/\/\s*$/.test(m[4])) top.kids.push(node)
        else stack.push(node)
      }
    } else if (m[5] !== undefined) top.text += decodeXml(m[5])
  }
  while (stack.length > 1) stack[stack.length - 2].kids.push(stack.pop())
  return xmlValue(stack[0])
}

// Resultado de uma operação: { fault, result } (result = o "<Operação>Result")
export function wmSoapResult(xml, operation) {
  const doc = wmParseXml(xml)
  const body = doc && typeof doc === 'object' ? doc.Envelope?.Body : null
  if (!body || typeof body !== 'object') return { fault: 'resposta inválida da Webmotors', result: null }
  if (body.Fault) {
    const f = body.Fault
    const text = typeof f === 'object' ? f.faultstring || f.Reason?.Text || f.faultcode || '' : f
    return { fault: clean(typeof text === 'object' ? JSON.stringify(text) : text) || 'erro da Webmotors', result: null }
  }
  const response = body[`${operation}Response`]
  const result = response && typeof response === 'object' ? response[`${operation}Result`] : undefined
  return { fault: null, result: result === undefined ? null : result }
}

// Itens de uma lista do resultado ({ MarcaWM: [...] } ou um só objeto)
export function wmList(value, key) {
  if (!value || typeof value !== 'object') return []
  const items = value[key]
  if (items === undefined || items === null || items === '') return []
  return [].concat(items).filter((i) => i && typeof i === 'object')
}

function wmNumber(value) {
  const text = clean(value)
  const n = Number(text)
  return text !== '' && Number.isFinite(n) ? n : null
}

const LIST_FIELDS = {
  marcas: ['MarcaWM', 'CodigoMarca', 'NomeMarca'],
  modelos: ['ModeloWM', 'CodigoModelo', 'NomeModelo'],
  versoes: ['Versao', 'CodigoVersao', 'NomeVersao'],
  cores: ['CorWM', 'CodigoCor', 'Descricao'],
  cambios: ['TipoCambioWM', 'CodigoCambio', 'Descricao'],
  combustiveis: ['CombustivelWM', 'CodigoCombustivel', 'Descricao'],
  opcionais: ['OpcionalWM', 'CodigoOpcional', 'Descricao'],
}

// Listas da Webmotors no formato das telas: [{ id, name }], em ordem
// alfabética; as versões trazem os anos modelo (years)
export function wmOptionsFrom(level, result) {
  if (level === 'modalidades') return wmModalities(result)
  const fields = LIST_FIELDS[level]
  if (!fields) return []
  const [item, idKey, nameKey] = fields
  return wmList(result, item)
    .map((o) => {
      const option = { id: wmNumber(o[idKey]), name: clean(o[nameKey]) }
      if (level === 'versoes') {
        option.years = wmList(o.AnoModelo, 'AnoModeloWM').map((y) => wmNumber(y.AnoModelo)).filter((y) => y !== null)
      }
      return option
    })
    .filter((o) => o.id !== null && o.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

// Modalidades do plano da loja (ObterModalidade), com as vagas: total e usadas
export function wmModalities(result) {
  return wmList(result, 'ModalidadeWM')
    .map((o) => ({
      code: wmNumber(o.CodigoModalidade),
      name: clean(o.Descricao),
      type: clean(o.TipoAnuncio).toUpperCase(),
      total: wmNumber(o.QuantidadeAnunciosTotal) ?? 0,
      used: wmNumber(o.QuantidadeAnuncios) ?? 0,
      photos: clean(o.PermiteFoto).toUpperCase() !== 'N',
    }))
    .filter((m) => m.code > 0)
}

// Plano cheio: a modalidade já tem todos os anúncios que cabem
export function wmModalityFull(modality) {
  return Boolean(modality) && modality.total > 0 && modality.used >= modality.total
}

// -- Códigos de retorno ---------------------------------------------------------------
// "500" = deu certo (é o que a Webmotors devolve nos testes da coleção oficial do
// Postman, no login, nos envios e em cada item das listas); outro código = recusa.
// Um código é o número sozinho (500, 401) ou o par "grupo|item" das tabelas do manual
// (43|22 = "Cor deve ser preenchida"); vários códigos vêm separados por ; , ou espaço.

export const WM_SUCCESS = '500'

function returnParts(code) {
  return clean(code)
    .replace(/[()]/g, ' ')
    .replace(/\s*\|\s*/g, '|')
    .split(/[^0-9A-Za-z_|-]+/)
    .map((c) => c.replace(/^\|+|\|+$/g, ''))
    .filter(Boolean)
}

export function wmReturnOk(code) {
  const parts = returnParts(code)
  return parts.length > 0 && parts.every((c) => c === WM_SUCCESS)
}

export function wmReturnCodes(code) {
  return returnParts(code).filter((c) => c !== WM_SUCCESS && !/^0+$/.test(c))
}

// Código de retorno de um resultado: o do próprio resultado ou, nas listas
// (MarcaWM, ModalidadeWM, Anuncios...), o do primeiro item
export function wmResultCode(result) {
  if (!result || typeof result !== 'object') return ''
  if (result.CodigoRetorno !== undefined) return clean(result.CodigoRetorno)
  for (const value of Object.values(result)) {
    const first = [].concat(value)[0]
    if (first && typeof first === 'object') {
      const code = wmResultCode(first)
      if (code) return code
    }
  }
  return ''
}

// Textos das tabelas de retorno do manual de integração (serviços de carros: login,
// manutenção do anúncio, exclusão e fotos). Código fora da tabela aparece pelo número.
const WM_RETURN_TEXTS = {
  400: 'falha inesperada na Webmotors (fale com o suporte técnico de lá)',
  401: 'o login da integração não vale mais (hash inválido)',
  402: 'a sessão com a Webmotors expirou',
  403: 'o usuário de integração não tem permissão para esta operação',
  31: 'o login da integração não vale mais (hash inválido)',
  32: 'falha inesperada na Webmotors (fale com o suporte técnico de lá)',
  '28|2': 'preço de venda inválido',
  '31|1': 'falta preencher um campo obrigatório',
  '21|9': 'foto com mais de 500 KB',
  '21|10': 'formato da foto inválido',
  '42|1': 'falta preencher um campo da foto',
  '42|2': 'fotos demais para o anúncio',
  '42|3': 'a modalidade do plano não aceita fotos',
  '42|4': 'a Webmotors não conseguiu gravar a foto',
  '43|7': 'falta o preço do carro',
  '43|8': 'falta o ano do modelo',
  '43|9': 'falta o ano de fabricação',
  '43|10': 'falta o câmbio',
  '43|11': 'falta a cor',
  '43|12': 'falta o número de portas',
  '43|13': 'falta a placa',
  '43|14': 'falta a quilometragem',
  '43|15': 'falta a marca',
  '43|16': 'falta o modelo',
  '43|17': 'falta a versão',
  '43|18': 'falta a quilometragem',
  '43|19': 'falta a placa',
  '43|20': 'falta o câmbio',
  '43|21': 'falta o número de portas',
  '43|22': 'falta a cor',
  '43|25': 'a loja está bloqueada na Webmotors',
  '43|30': 'falta o combustível',
  '43|32': 'acabaram as vagas da modalidade do plano',
  '43|33': 'acabaram as vagas do pacote de anúncios',
  '43|36': 'o anúncio não pode ser alterado (ou não é desta loja)',
  '43|37': 'ano do modelo inválido',
  '43|39': 'o anúncio não é desta loja na Webmotors',
  '43|40': 'anúncio inválido',
  '43|41': 'marca, modelo, versão e ano do modelo não combinam',
  '43|42': 'a cor não vale para esta versão',
  '43|43': 'opcionais inválidos',
  '43|44': 'combustível inválido',
  '43|45': 'câmbio inválido',
  '43|46': 'campo "adaptado para deficientes" inválido (S ou N)',
  '43|47': 'campo "alienado" inválido (S ou N)',
  '43|48': 'campo "blindado" inválido (S ou N)',
  '43|49': 'campo "IPVA pago" inválido (S ou N)',
  '43|50': 'campo "garantia de fábrica" inválido (S ou N)',
  '43|51': 'campo "licenciado" inválido (S ou N)',
  '43|52': 'campo "revisado" inválido (S ou N)',
  '43|53': 'campo "revisões na concessionária" inválido (S ou N)',
  '43|54': 'campo "único dono" inválido (S ou N)',
  '43|55': 'tipo do anúncio inválido (U ou N)',
  '43|56': 'a modalidade escolhida não vale para esta loja ou tipo de anúncio',
  '43|57': 'o tipo do anúncio não pode ser alterado',
  '43|58': 'falta o motivo da exclusão',
  '43|62': 'número de portas inválido',
  '43|63': 'combustível inválido',
  '43|64': 'cor inválida',
  '43|65': 'a descrição tem código HTML',
  '43|66': 'o preço está fora do praticado pelo mercado (tabelas Webmotors e FIPE)',
  '43|67': 'preço de revenda inválido',
  '43|68': 'quilometragem não permitida',
  '43|69': 'a foto não é deste anúncio',
  '43|70': 'falta a marca',
  '43|71': 'falta o modelo',
  '43|72': 'falta a versão',
  '43|73': 'falta a cor',
  '43|74': 'falta a placa',
  '43|75': 'falta o câmbio',
  '43|76': 'falta o número de portas',
  '43|77': 'falta o combustível',
  '43|78': 'falta o preço de venda',
  '43|79': 'um campo tem número inválido',
  '43|80': 'a loja está bloqueada na Webmotors',
  '43|82': 'neste anúncio só o preço pode ser alterado',
  '43|84': 'placa inválida',
  '43|85': 'ano de fabricação inválido',
  '43|97': 'a descrição passou de 1.500 caracteres',
  '43|102': 'preço de venda acima do permitido pela tabela FIPE',
  '43|104': 'o preço de revenda está fora do praticado pelo mercado',
  '43|105': 'preço de revenda acima do permitido pela tabela FIPE',
  '43|106': 'falta o código do anúncio',
  '43|107': 'a quilometragem só pode aumentar em relação à cadastrada',
  '43|112': 'ano de fabricação inválido',
}

export function wmReturnText(codes) {
  const list = [].concat(codes || []).map(clean).filter(Boolean)
  const known = list.filter((c) => WM_RETURN_TEXTS[c])
  const parts = [...new Set(known.map((c) => WM_RETURN_TEXTS[c]))]
  if (parts.length) parts[0] = parts[0][0].toUpperCase() + parts[0].slice(1)
  const text = parts.length ? `${parts.join('; ')} (código ${known.join(', ')})` : ''
  const unknown = list.filter((c) => !WM_RETURN_TEXTS[c])
  const rest = unknown.length ? `a Webmotors recusou (código ${unknown.join(', ')})` : ''
  return [text, rest].filter(Boolean).join('; ') || 'a Webmotors recusou o pedido'
}
// </webmotorsAd.js>
