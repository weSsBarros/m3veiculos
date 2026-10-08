// @ts-nocheck — a cópia de src/utils/olxAd.js (no fim do arquivo) é JavaScript puro
// Edge Function "olx-oauth" — publicação automática na OLX (seção 59).
// O nome é o da URI de retorno cadastrada na OLX, então não pode mudar:
//   https://pifqnbdmaytlhmdfnipz.supabase.co/functions/v1/olx-oauth
//
// GET ?code=…&state=… (volta do login na OLX): troca o code pelo token, lê o
//   nome e o e-mail da conta e devolve a pessoa para a aba Portais da loja.
// POST com o login da pessoa no Authorization:
//   conectar (admin): link de login na OLX, com um state de uso único (15 min);
//   desconectar (admin): tira da OLX os anúncios do sistema (se pedido) e apaga o token;
//   catalogo: marcas, modelos, versões e cilindradas da OLX (cache no banco, 30 dias);
//   sincronizar (equipe do estoque): concilia o estoque da loja com a OLX;
//   previa: o anúncio de um carro como vai para a OLX;
//   renovar: renova um anúncio expirado.
// POST {"action":"rodada"} sem login: rodada automática (pg_cron a cada 10 min;
//   no máximo uma a cada 4 min), para todas as lojas conectadas.
//
// Conciliação: carro marcado "Publicar na OLX", disponível, visível no site e
// fora do repasse vai (ou é editado quando o anúncio muda); o que sai disso é
// tirado do ar. Um carro por envio (se um anúncio falha, a OLX cancela o lote
// inteiro), até 20 por vez. Sem a publicação automática, só mexe no que já
// está na OLX e no que a pessoa pediu ("Publicar agora"). Anúncio removido
// direto na OLX não volta sozinho.
// Segredos OLX_CLIENT_ID e OLX_CLIENT_SECRET (cadastrados pelo Wesley). A loja
// de demonstração (companies.is_demo) nunca publica: os envios ficam como
// "simulado". Publicar com "Verify JWT" desligado (a OLX volta sem login); as
// ações do painel conferem o login pelo banco (can_edit_stock e is_company_admin).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const CLIENT_ID = Deno.env.get('OLX_CLIENT_ID') || ''
const CLIENT_SECRET = Deno.env.get('OLX_CLIENT_SECRET') || ''

const REDIRECT_URI = 'https://pifqnbdmaytlhmdfnipz.supabase.co/functions/v1/olx-oauth'
const AUTH_URL = 'https://auth.olx.com.br/oauth'
const TOKEN_URL = 'https://auth.olx.com.br/oauth/token'
const API = 'https://apps.olx.com.br'
const SCOPES = 'autoupload basic_user_info autoservice'
const MAX_SENDS = 20
const STATE_TTL_MS = 15 * 60 * 1000
const LIST_EVERY_MS = 60 * 60 * 1000
const CATALOG_TTL_MS = 30 * 24 * 60 * 60 * 1000
const ROUND_GAP_MS = 4 * 60 * 1000
const ROUND_BUDGET_MS = 100 * 1000
const LOCK_MS = 2 * 60 * 1000
const SLOT_RETRY_MS = 60 * 60 * 1000
const CAR_COLUMNS = 'id, brand, model, version, year, model_year, km, transmission, fuel, color, doors, category, condition, price, ' +
  'highlights, description, images, status, hidden, plate, entry_type, whatsapp_seller_id, olx_publish, olx_catalog'
const COMPANY_COLUMNS = 'id, name, slug, site_url, is_demo, fiscal, whatsapp_main'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function plainText(message, status = 400) {
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

function redirect(url) {
  return new Response(null, { status: 302, headers: { Location: url } })
}

class UserError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

const nowIso = () => new Date().toISOString()

function randomHex(bytes) {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256(value) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// -- OLX ---------------------------------------------------------------------------

async function olx(path, { method = 'POST', body, token } = {}) {
  const headers = { 'User-Agent': 'WB.AUTO/1.0', Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  let res
  try {
    res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    return { status: 0, data: null }
  }
  const raw = await res.text()
  let data = null
  try {
    data = raw ? JSON.parse(raw) : null
  } catch {
    data = { raw: raw.slice(0, 300) }
  }
  return { status: res.status, data }
}

async function account(service, companyId) {
  const { data, error } = await service.from('olx_accounts').select('*').eq('company_id', companyId).maybeSingle()
  if (error) throw error
  return data
}

async function setAccount(service, acc, patch) {
  await service.from('olx_accounts').update(patch).eq('company_id', acc.company_id)
  Object.assign(acc, patch)
}

async function log(service, companyId, userId, label) {
  let email = null
  if (userId) {
    const { data } = await service.auth.admin.getUserById(userId)
    email = data?.user?.email || null
  }
  await service.from('activity_log').insert({ company_id: companyId, user_id: userId, user_email: email, action: 'update', entity: 'olx', label, details: '' })
}

// -- Conectar (OAuth) -----------------------------------------------------------------

function originOf(value) {
  try {
    const url = new URL(String(value || ''))
    return /^https?:$/.test(url.protocol) ? url.origin : ''
  } catch {
    return ''
  }
}

async function startConnect(service, caller, user, company, body) {
  const { data: isAdmin } = await caller.rpc('is_company_admin')
  if (isAdmin !== true) throw new UserError('Só o administrador conecta a conta da OLX.', 403)
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new UserError('A integração com a OLX ainda não foi configurada (faltam os segredos OLX_CLIENT_ID e OLX_CLIENT_SECRET).', 503)
  }
  // Volta para o painel de onde a pessoa clicou (ou para o site cadastrado)
  const base = originOf(body.origin) || originOf(company.site_url)
  if (!base) throw new UserError('Não foi possível saber o endereço do painel da loja.')
  const state = randomHex(24)
  await service.from('olx_oauth_states').delete().lt('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
  const { error } = await service.from('olx_oauth_states').insert({ state, company_id: company.id, user_id: user.id, return_url: `${base}/admin/portais` })
  if (error) throw error
  const query = new URLSearchParams({ client_id: CLIENT_ID, response_type: 'code', scope: SCOPES, redirect_uri: REDIRECT_URI, state })
  return json({ url: `${AUTH_URL}?${query.toString().replace(/\+/g, '%20')}` })
}

async function finishConnect(service, url) {
  const state = url.searchParams.get('state') || ''
  const { data: row } = /^[0-9a-f]{48}$/.test(state)
    ? await service.from('olx_oauth_states').select('*').eq('state', state).maybeSingle()
    : { data: null }
  if (!row) return plainText('Este link de conexão com a OLX não vale mais. Volte ao painel e clique em "Conectar conta da OLX" de novo.')
  const back = (status, reason = '') => redirect(`${row.return_url}?olx=${status}${reason ? `&motivo=${encodeURIComponent(reason)}` : ''}`)
  if (row.used_at || Date.now() - new Date(row.created_at).getTime() > STATE_TTL_MS) return back('erro', 'expirado')
  await service.from('olx_oauth_states').update({ used_at: nowIso() }).eq('state', state)

  const error = url.searchParams.get('error')
  if (error) return back('erro', error === 'access_denied' ? 'negado' : 'olx')
  const code = url.searchParams.get('code')
  if (!code) return back('erro', 'olx')

  let tokenData = null
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'WB.AUTO/1.0', Accept: 'application/json' },
      body: new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }),
    })
    tokenData = res.ok ? await res.json().catch(() => null) : null
    if (!res.ok) console.error('olx token', res.status, (await res.text().catch(() => '')).slice(0, 300))
  } catch (err) {
    console.error('olx token', err)
  }
  const token = tokenData?.access_token
  if (!token) return back('erro', 'token')

  const info = await olx('/oauth_api/basic_user_info', { body: { access_token: token } })
  const values = {
    access_token: token,
    scope: String(tokenData.scope || SCOPES).slice(0, 200),
    user_name: String(info.data?.user_name || '').slice(0, 160),
    user_email: String(info.data?.user_email || '').slice(0, 160),
    status: 'conectada',
    status_detail: '',
    connected_by: row.user_id,
    connected_at: nowIso(),
    sync_lock_until: null,
  }
  const existing = await account(service, row.company_id)
  const { error: saveError } = existing
    ? await service.from('olx_accounts').update(values).eq('company_id', row.company_id)
    : await service.from('olx_accounts').insert({ company_id: row.company_id, ...values, settings: { publish_default: true } })
  if (saveError) {
    console.error('olx conta', saveError)
    return back('erro', 'banco')
  }
  await log(service, row.company_id, row.user_id, `Conectou a conta da OLX${values.user_name ? ` (${values.user_name})` : ''}`)
  return back('conectada')
}

// -- Catálogo -------------------------------------------------------------------------

const CATALOG_PATHS = {
  carro: { marcas: () => 'car_info', modelos: (b) => `car_info/${b}`, versoes: (b, m) => `car_info/${b}/${m}` },
  moto: { marcas: () => 'moto_info', modelos: (b) => `moto_info/${b}`, versoes: (b, m) => `moto_info/${b}/${m}`, cilindradas: () => 'moto_cubiccms_info' },
}

async function catalog(service, acc, body) {
  const kind = body.kind === 'moto' ? 'moto' : 'carro'
  const level = String(body.level || 'marcas')
  const build = CATALOG_PATHS[kind][level]
  if (!build) throw new UserError('Lista desconhecida.')
  const brandId = Number(body.brandId)
  const modelId = Number(body.modelId)
  if ((level === 'modelos' || level === 'versoes') && !Number.isInteger(brandId)) throw new UserError('Escolha a marca.')
  if (level === 'versoes' && !Number.isInteger(modelId)) throw new UserError('Escolha o modelo.')
  const path = build(brandId, modelId)

  const { data: cached } = await service.from('olx_catalog').select('data, fetched_at').eq('path', path).maybeSingle()
  let data = cached && Date.now() - new Date(cached.fetched_at).getTime() < CATALOG_TTL_MS ? cached.data : null
  if (!data) {
    const res = await olx(`/autoupload/${path}`, { body: { access_token: acc.access_token } })
    if (res.status === 200 && res.data?.status === 'ok' && res.data.data && typeof res.data.data === 'object') {
      data = res.data.data
      await service.from('olx_catalog').upsert({ path, data, fetched_at: nowIso() })
    } else if (cached) {
      data = cached.data
    } else {
      console.error('olx catalogo', path, res.status, JSON.stringify(res.data).slice(0, 300))
      throw new UserError(res.status === 401
        ? 'A OLX recusou o acesso da conta conectada. Conecte de novo em Portais.'
        : 'A OLX não respondeu o catálogo agora. Tente de novo em instantes.', 502)
    }
  }
  // Marcas, modelos e versões vêm como { nome: id }; cilindradas, como { id: nome }
  const options = Object.entries(data)
    .map(([key, value]) => (level === 'cilindradas' ? { id: Number(key), name: String(value) } : { id: Number(value), name: String(key) }))
    .filter((o) => Number.isFinite(o.id) && o.name)
    .sort((a, b) => (level === 'cilindradas'
      ? (parseInt(a.name.replace(/\D/g, ''), 10) || 99999) - (parseInt(b.name.replace(/\D/g, ''), 10) || 99999)
      : a.name.localeCompare(b.name, 'pt-BR')))
  return json({ options })
}

// -- Anúncios -------------------------------------------------------------------------

// Está (ou pode estar) no ar na OLX: precisa de "delete" para sair
function liveOnOlx(ad) {
  if (!ad || ad.operation !== 'insert') return false
  return ['aguardando', 'publicado', 'expirado'].includes(ad.status) || (ad.status === 'recusado' && Boolean(ad.list_id))
}

async function saveAd(service, ad, patch) {
  if (ad) {
    const { error } = await service.from('olx_ads').update(patch).eq('id', ad.id)
    if (error) throw error
    Object.assign(ad, patch)
    return ad
  }
  const { data, error } = await service.from('olx_ads').insert(patch).select().single()
  if (error) throw error
  return data
}

function importErrors(res) {
  return (res.data?.errors || [])
    .flatMap((e) => (Array.isArray(e.messages) ? e.messages : []).map((m) => m?.category || m?.error))
    .filter(Boolean)
    .map(String)
}

async function sendInsert(service, company, acc, car, ad, payload, hash) {
  const base = {
    company_id: company.id,
    car_id: car.id,
    ad_id: payload.id,
    category: payload.category,
    operation: 'insert',
    payload,
    payload_hash: hash,
    sent_at: nowIso(),
    attempts: (ad?.attempts || 0) + 1,
  }
  if (company.is_demo) {
    return saveAd(service, ad, { ...base, status: 'simulado', import_token: null, errors: [], message: 'Simulado: na loja de demonstração nada vai para a OLX.' })
  }
  const res = await olx('/autoupload/import', { method: 'PUT', body: { access_token: acc.access_token, ad_list: [payload] } })
  const code = res.data?.statusCode
  if (res.status === 200 && code === 0 && res.data?.token) {
    if (acc.status !== 'conectada') await setAccount(service, acc, { status: 'conectada', status_detail: '' })
    return saveAd(service, ad, {
      ...base,
      status: 'aguardando',
      import_token: String(res.data.token),
      errors: [],
      message: ad?.list_id ? 'Atualização enviada; a OLX processa em alguns minutos.' : 'Enviado; a OLX processa em alguns minutos.',
    })
  }
  const errors = importErrors(res)
  if (code === -4) {
    return saveAd(service, ad, { ...base, status: 'erro', import_token: null, errors, message: errors.map(olxErrorText).join('; ') || 'a OLX recusou o anúncio' })
  }
  if (code === -6) {
    await setAccount(service, acc, {
      status: 'sem_plano',
      status_detail: 'A conta OLX conectada não tem plano Empresa: a OLX só aceita anúncios por integração em plano Empresa.',
    })
    return saveAd(service, ad, { ...base, status: 'erro', import_token: null, errors: ['WITHOUT_PERMISSION'], message: 'A conta OLX conectada não tem plano Empresa.' })
  }
  if (code === -7 || code === -8) {
    return saveAd(service, ad, { ...base, status: 'sem_vaga', import_token: null, errors: ['NOT_ENOUGH_AD_SLOTS'], message: 'Sem vaga no plano da OLX.' })
  }
  if (res.status === 401) {
    await setAccount(service, acc, { status: 'erro', status_detail: 'A OLX recusou o acesso da conta conectada. Conecte de novo em Portais.' })
  }
  console.error('olx envio', company.slug, res.status, JSON.stringify(res.data).slice(0, 300))
  // -1, -2, -5, rede: tenta de novo na próxima rodada (não grava a impressão nova)
  return saveAd(service, ad, {
    ...base,
    payload_hash: ad?.payload_hash || '',
    payload: ad?.payload ?? payload,
    status: ad && liveOnOlx(ad) ? ad.status : 'pendente',
    message: 'A OLX não respondeu agora; o sistema tenta de novo em alguns minutos.',
  })
}

async function sendDelete(service, company, acc, ad) {
  if (company.is_demo || !liveOnOlx(ad)) {
    return saveAd(service, ad, { operation: 'delete', status: 'removido', removed_at: nowIso(), import_token: null, message: '' })
  }
  const res = await olx('/autoupload/import', { method: 'PUT', body: { access_token: acc.access_token, ad_list: [{ id: ad.ad_id, operation: 'delete' }] } })
  if (res.status === 200 && res.data?.statusCode === 0 && res.data?.token) {
    return saveAd(service, ad, { operation: 'delete', status: 'removendo', import_token: String(res.data.token), sent_at: nowIso(), message: 'Saindo da OLX.' })
  }
  console.error('olx delete', company.slug, res.status, JSON.stringify(res.data).slice(0, 300))
  return saveAd(service, ad, { message: 'A OLX não respondeu ao pedido para tirar o anúncio; o sistema tenta de novo em alguns minutos.' })
}

// Resultado da importação (token devolvido no envio, vale 7 dias)
async function checkImport(service, acc, ad) {
  const res = await olx(`/autoupload/import/${encodeURIComponent(ad.import_token)}`, { body: { access_token: acc.access_token } })
  const patch = { checked_at: nowIso() }
  if (res.status === 404) patch.import_token = null
  const item = res.status === 200 ? res.data?.ads?.[ad.ad_id] : null
  if (item) {
    const status = String(item.status || '').toLowerCase()
    const codes = (Array.isArray(item.message) ? item.message : []).map((m) => m?.error || m?.category).filter(Boolean).map(String)
    const imageErrors = item.image_errors || item.imageErrors || []
    if (item.list_id) patch.list_id = String(item.list_id)
    if (item.url) patch.url = String(item.url)
    if (status === 'accepted' || status === 'accept') {
      patch.import_token = null
      if (ad.operation === 'delete') Object.assign(patch, { status: 'removido', removed_at: nowIso(), message: '', errors: [] })
      else {
        Object.assign(patch, {
          status: 'publicado',
          published_at: ad.published_at || nowIso(),
          errors: imageErrors.map((e) => String(e.status || e.image_url || 'foto')),
          message: imageErrors.length ? 'Publicado, mas a OLX não conseguiu usar algumas fotos.' : '',
        })
      }
    } else if (status === 'refused' || status === 'error') {
      patch.import_token = null
      if (ad.operation === 'delete') Object.assign(patch, { status: 'removido', removed_at: nowIso(), message: '' })
      else Object.assign(patch, { status: status === 'refused' ? 'recusado' : 'erro', errors: codes, message: codes.map(olxErrorText).join('; ') || 'recusado pela OLX' })
    } else if (status === 'queued') {
      patch.message = 'Na fila de ativação da OLX.'
    }
  }
  if (patch.list_id && !patch.url && !ad.url) patch.url = `https://www.olx.com.br/vi/${patch.list_id}.htm`
  await saveAd(service, ad, patch)
}

// Lista geral da conta: pega o que mudou direto na OLX (removido, recusado, expirado)
async function checkListing(service, acc, ads) {
  const seen = new Map()
  let pageToken = null
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({ fetch_size: '200' })
    if (pageToken) query.set('page_token', pageToken)
    const res = await olx(`/autoupload/v1/published?${query}`, { method: 'GET', token: acc.access_token })
    if (res.status === 401) {
      await setAccount(service, acc, { status: 'erro', status_detail: 'A OLX recusou o acesso da conta conectada. Conecte de novo em Portais.' })
      return
    }
    if (res.status !== 200) return
    for (const item of res.data?.data || []) seen.set(String(item.id), item)
    pageToken = res.data?.next_token
    if (!pageToken) break
  }
  for (const ad of ads) {
    const item = seen.get(ad.ad_id)
    if (!item || ad.operation !== 'insert' || ad.import_token) continue
    const status = String(item.status || '').toLowerCase()
    const patch = {}
    if (item.list_id && String(item.list_id) !== ad.list_id) patch.list_id = String(item.list_id)
    if (status === 'published' && ad.status !== 'publicado') Object.assign(patch, { status: 'publicado', published_at: ad.published_at || nowIso(), message: '' })
    else if (status === 'pending_review' && !['aguardando', 'publicado'].includes(ad.status)) Object.assign(patch, { status: 'aguardando', message: 'Em revisão na OLX.' })
    else if (status === 'refused' && ad.status !== 'recusado') Object.assign(patch, { status: 'recusado', message: ad.message || 'recusado pela OLX' })
    else if (status === 'deleted' && ['publicado', 'aguardando', 'expirado'].includes(ad.status)) {
      Object.assign(patch, { status: 'removido_olx', message: 'Removido direto na OLX (pela loja ou pela OLX).' })
    } else if (status === 'expired' && ad.status !== 'expirado') Object.assign(patch, { status: 'expirado', message: 'O anúncio expirou na OLX.' })
    if ((patch.list_id || ad.list_id) && !ad.url) patch.url = `https://www.olx.com.br/vi/${patch.list_id || ad.list_id}.htm`
    if (Object.keys(patch).length) await saveAd(service, ad, { ...patch, checked_at: nowIso() })
  }
}

// -- Conciliação --------------------------------------------------------------------

async function reconcile(service, company, acc, { manual = false, carIds = [], force = false, deadline = Infinity } = {}) {
  const now = nowIso()
  const { data: locked } = await service
    .from('olx_accounts')
    .update({ sync_lock_until: new Date(Date.now() + LOCK_MS).toISOString() })
    .eq('company_id', company.id)
    .or(`sync_lock_until.is.null,sync_lock_until.lt."${now}"`)
    .select('company_id')
  if (!locked?.length) return { busy: true }

  // sent: a OLX recebeu (processa em minutos); published: saiu da análise publicado;
  // refused: recusado (na hora ou na análise; fica em "Com problema");
  // waiting: a OLX não respondeu agora (tenta de novo sozinho)
  const result = { sent: 0, removed: 0, checked: 0, published: 0, refused: 0, waiting: 0, status: acc.status }
  try {
    const [carsRes, adsRes, teamRes] = await Promise.all([
      service.from('cars').select(CAR_COLUMNS).eq('company_id', company.id),
      service.from('olx_ads').select('*').eq('company_id', company.id),
      service.from('sellers').select('id, phone, active, deleted_at').eq('company_id', company.id),
    ])
    if (carsRes.error) throw carsRes.error
    if (adsRes.error) throw adsRes.error
    const ads = adsRes.data || []
    const phones = Object.fromEntries((teamRes.data || []).filter((s) => s.active && !s.deleted_at && s.phone).map((s) => [s.id, s.phone]))
    const ctx = { siteUrl: company.site_url, zip: company.fiscal?.zip || '', settings: acc.settings || {} }

    // 1) Resultado dos envios que aguardam a OLX
    if (!company.is_demo) {
      for (const ad of ads.filter((a) => a.import_token && ['aguardando', 'removendo'].includes(a.status))) {
        if (Date.now() > deadline) break
        const before = ad.status
        await checkImport(service, acc, ad)
        result.checked++
        if (ad.status !== before && ad.operation === 'insert') {
          if (ad.status === 'publicado') result.published++
          else if (['recusado', 'erro'].includes(ad.status)) result.refused++
        }
      }
      // 2) Uma vez por hora (ou quando a pessoa pede), a lista geral da conta
      if (manual || !acc.last_list_at || Date.now() - new Date(acc.last_list_at).getTime() > LIST_EVERY_MS) {
        await checkListing(service, acc, ads)
        await setAccount(service, acc, { last_list_at: nowIso() })
      }
    }

    // 3) Envios: um carro por vez
    const blocked = acc.status !== 'conectada' && !manual
    const adsByCar = new Map(ads.filter((a) => a.car_id).map((a) => [a.car_id, a]))
    let sends = 0
    for (const row of carsRes.data || []) {
      if (Date.now() > deadline || sends >= MAX_SENDS || blocked) break
      const car = olxCarFromRow(row)
      const ad = adsByCar.get(car.id) || null
      const requested = carIds.includes(car.id)
      if (olxEligible(car)) {
        // Sem a publicação automática: só o que já está na OLX ou o que a pessoa pediu
        if (!acc.auto_publish && !requested && !liveOnOlx(ad)) continue
        if (ad?.status === 'removido_olx' && !requested) continue
        const { ad: payload } = buildOlxAd(car, { ...ctx, phone: olxContactPhone(car, phones, company.whatsapp_main) })
        if (!payload) continue
        const hash = await sha256(JSON.stringify(payload))
        const changed = !ad || ad.payload_hash !== hash || ad.operation === 'delete' || ['removido', 'removido_olx', 'pendente'].includes(ad.status)
        const slotRetry = ad?.status === 'sem_vaga' && Date.now() - new Date(ad.sent_at || 0).getTime() > SLOT_RETRY_MS
        if (!changed && !slotRetry && !(requested && force)) continue
        const saved = await sendInsert(service, company, acc, car, ad, payload, hash)
        sends++
        if (['aguardando', 'simulado'].includes(saved?.status)) result.sent++
        else if (['erro', 'sem_vaga', 'recusado'].includes(saved?.status) && saved?.payload_hash === hash) result.refused++
        else result.waiting++
        if (acc.status !== 'conectada' && !requested) break
      } else if (ad && ad.operation === 'insert' && ad.status !== 'removido' && ad.status !== 'removido_olx') {
        if (liveOnOlx(ad)) sends++
        await sendDelete(service, company, acc, ad)
        if (['removendo', 'removido'].includes(ad.status)) result.removed++
        else result.waiting++
      }
    }

    // 4) Carro excluído do painel com anúncio no ar: tira da OLX; os já removidos saem da tabela
    for (const ad of ads.filter((a) => !a.car_id)) {
      if (Date.now() > deadline || sends >= MAX_SENDS) break
      if (liveOnOlx(ad)) {
        await sendDelete(service, company, acc, ad)
        sends++
        if (['removendo', 'removido'].includes(ad.status)) result.removed++
        else result.waiting++
      } else if (ad.status === 'removido' || ad.operation === 'insert') {
        await service.from('olx_ads').delete().eq('id', ad.id)
      }
    }
    result.status = acc.status
    return result
  } finally {
    await service.from('olx_accounts').update({ sync_lock_until: null, last_sync_at: nowIso() }).eq('company_id', company.id)
  }
}

// Rodada automática: todas as lojas conectadas (menos a de demonstração e as bloqueadas)
async function round(service) {
  const cutoff = new Date(Date.now() - ROUND_GAP_MS).toISOString()
  const { data: lock } = await service.from('olx_state').update({ last_round_at: nowIso() }).eq('id', 1).lt('last_round_at', cutoff).select('id')
  if (!lock?.length) return json({ skipped: true })
  const deadline = Date.now() + ROUND_BUDGET_MS
  const { data: accounts } = await service.from('olx_accounts').select('*').eq('status', 'conectada')
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
    if (!company || company.is_demo || ['bloqueado', 'cancelado'].includes(client?.status)) continue
    try {
      await reconcile(service, company, acc, { deadline })
      stores++
    } catch (err) {
      console.error('olx rodada', company.slug, err)
    }
  }
  return json({ ok: true, stores })
}

// -- Entrada -----------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  try {
    if (req.method === 'GET') {
      if (!CLIENT_ID || !CLIENT_SECRET) return plainText('A integração com a OLX ainda não foi configurada.', 503)
      return await finishConnect(service, new URL(req.url))
    }
    if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

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

    if (body.action === 'conectar') return await startConnect(service, caller, userData.user, company, body)

    const acc = await account(service, companyId)
    if (body.action === 'desconectar') {
      const { data: isAdmin } = await caller.rpc('is_company_admin')
      if (isAdmin !== true) throw new UserError('Só o administrador desconecta a conta da OLX.', 403)
      if (!acc) return json({ ok: true })
      const { data: ads } = await service.from('olx_ads').select('*').eq('company_id', companyId)
      let removed = 0
      if (body.removeAds) {
        for (const ad of (ads || []).filter((a) => liveOnOlx(a) || a.status === 'simulado')) {
          await sendDelete(service, company, acc, ad)
          removed++
        }
        // Sem a conta não dá mais para conferir: o pedido aceito vale como removido
        await service.from('olx_ads').update({ status: 'removido', removed_at: nowIso(), import_token: null, message: '' })
          .eq('company_id', companyId).eq('status', 'removendo')
      }
      await service.from('olx_accounts').delete().eq('company_id', companyId)
      await service.from('olx_oauth_states').delete().eq('company_id', companyId)
      await log(service, companyId, userData.user.id, removed ? `Desconectou a conta da OLX e tirou ${removed} ${removed === 1 ? 'anúncio' : 'anúncios'}` : 'Desconectou a conta da OLX')
      return json({ ok: true, removed })
    }
    if (!acc) throw new UserError('Conecte a conta da OLX em Portais primeiro.', 409)

    switch (body.action) {
      case 'catalogo':
        return await catalog(service, acc, body)
      case 'sincronizar': {
        const carIds = (Array.isArray(body.carIds) ? body.carIds : []).map(String).slice(0, MAX_SENDS)
        const result = await reconcile(service, company, acc, { manual: carIds.length > 0 || body.manual === true, carIds, force: body.force === true })
        return json(result)
      }
      case 'previa': {
        const { data: row } = await service.from('cars').select(CAR_COLUMNS).eq('company_id', companyId).eq('id', String(body.carId || '')).maybeSingle()
        if (!row) throw new UserError('Carro não encontrado.', 404)
        const { data: team } = await service.from('sellers').select('id, phone, active, deleted_at').eq('company_id', companyId)
        const phones = Object.fromEntries((team || []).filter((s) => s.active && !s.deleted_at && s.phone).map((s) => [s.id, s.phone]))
        const car = olxCarFromRow(row)
        const { ad, missing } = buildOlxAd(car, {
          siteUrl: company.site_url,
          zip: company.fiscal?.zip || '',
          settings: acc.settings || {},
          phone: olxContactPhone(car, phones, company.whatsapp_main),
        })
        return json({ ad, missing, outReason: olxOutReason(car) })
      }
      case 'renovar': {
        const { data: ad } = await service.from('olx_ads').select('*').eq('company_id', companyId).eq('car_id', String(body.carId || '')).maybeSingle()
        if (!ad?.list_id) throw new UserError('Esse carro não tem anúncio publicado na OLX.')
        if (company.is_demo) throw new UserError('Na loja de demonstração nada vai para a OLX.')
        const res = await olx('/autoupload/v1/ads/renewals', { method: 'PATCH', token: acc.access_token, body: { list_ids: [ad.list_id] } })
        const item = res.data?.result?.[ad.list_id]
        if (res.status === 200 && item?.renewed) {
          await saveAd(service, ad, { status: 'aguardando', message: 'Renovado; a OLX revisa o anúncio.', checked_at: nowIso() })
          return json({ ok: true })
        }
        if (item?.reason === 'AD_NOT_EXPIRED') throw new UserError('O anúncio não está expirado na OLX.')
        console.error('olx renovar', company.slug, res.status, JSON.stringify(res.data).slice(0, 300))
        throw new UserError('A OLX não renovou o anúncio agora. Tente de novo mais tarde.', 502)
      }
      default:
        throw new UserError('Ação desconhecida.')
    }
  } catch (err) {
    if (err instanceof UserError) return json({ error: err.message }, err.status)
    console.error(err)
    return json({ error: 'Erro inesperado na integração com a OLX.' }, 500)
  }
})

// -- Cópia de src/utils/olxAd.js (não editar aqui: rode
//    node supabase/functions/olx-oauth/atualizar-copia.mjs) -------------------------
// <olxAd.js>
// Anúncio da OLX (seção 59): monta o anúncio de um carro no formato da API de
// importação da OLX (autoupload), diz o que falta para publicar e sugere a
// marca, o modelo e a versão do catálogo da OLX. Documentação:
// developers.olx.com.br/anuncio/api (carros: categoria 2020; motos: 2060).
// Código puro, sem imports: o mesmo texto vai copiado dentro da Edge Function
// olx-oauth (o teste tests/olxAd.test.js confere que a cópia é idêntica).

export const OLX_CATEGORY_CAR = 2020
export const OLX_CATEGORY_MOTO = 2060
export const OLX_MAX_IMAGES = 20

function clean(value) {
  return String(value ?? '').trim()
}

// Minúsculo e sem acento (para procurar palavras nos destaques)
function plain(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

// Maiúsculo, sem acento, só letras, números e espaço; "1,0" e "1.0" viram "1.0"
export function olxNormalize(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/(\d)[.,](\d)/g, '$1#$2')
    .replace(/\+/g, ' PLUS ')
    .replace(/[^A-Z0-9#]+/g, ' ')
    .replace(/#/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
}

// O id do anúncio na OLX aceita até 19 letras e números: sai do id do carro
export function olxAdId(carId) {
  return clean(carId).replace(/[^A-Za-z0-9]/g, '').slice(0, 19)
}

// Placa em maiúsculas, sem hífen (antiga ABC1234 ou Mercosul ABC1D23)
export function olxPlate(plate) {
  const value = clean(plate).toUpperCase().replace(/[^A-Z0-9]/g, '')
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(value) ? value : ''
}

// Telefone com DDD, 10 ou 11 números, sem o 55 do Brasil
export function olxPhone(phone) {
  let digits = clean(phone).replace(/\D/g, '')
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2)
  return digits.length === 10 || digits.length === 11 ? digits : ''
}

export function olxZip(zip) {
  const digits = clean(zip).replace(/\D/g, '')
  return digits.length === 8 ? digits : ''
}

// Telefone do anúncio: o WhatsApp da pessoa que atende o carro (ativa e com
// telefone) ou, sem ela, o número principal da loja. sellerPhones: { id: telefone }.
export function olxContactPhone(car, sellerPhones = {}, mainPhone = '') {
  const own = car.whatsappSellerId ? olxPhone(sellerPhones[car.whatsappSellerId]) : ''
  return own || olxPhone(mainPhone)
}

// Ano modelo ("2022/2023" → 2023). Antes de 1980 a OLX usa faixas de 5 anos.
export function olxYear(car) {
  const fromText = clean(car.modelYear).match(/(\d{4})\s*$/)
  const year = fromText ? Number(fromText[1]) : Number(car.year)
  if (!Number.isInteger(year) || year < 1900 || year > 2100) return ''
  if (year >= 1980) return String(year)
  for (const start of [1975, 1970, 1965, 1960, 1955]) if (year >= start) return String(start)
  return '1950'
}

export function olxCategory(car) {
  return car.category === 'moto' ? OLX_CATEGORY_MOTO : OLX_CATEGORY_CAR
}

export function olxSubject(car) {
  const text = [car.brand, car.model, car.version].map(clean).filter(Boolean).join(' ').replace(/\s+/g, ' ')
  return (text.length >= 2 ? text : 'Veículo').slice(0, 90).trim()
}

function thousands(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

// Descrição: a do carro (ou um texto com os dados, se estiver vazia) e o texto
// padrão da loja no fim
export function olxBody(car, settings = {}) {
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
    text = [olxSubject(car), facts.join(' · '), highlights.map((h) => `- ${h}`).join('\n')].filter(Boolean).join('\n\n')
  }
  const footer = clean(settings.footer)
  if (footer) text = `${text}\n\n${footer}`
  return text.slice(0, 6000)
}

// Fotos: as do site (/uploads/carros/<nome>.webp) vão pela cópia em JPG, que o
// site gera na primeira vez (api/foto-jpg.php), porque a OLX não aceita WebP
export function olxImageUrl(url, siteUrl) {
  const site = clean(siteUrl).replace(/\/+$/, '')
  const value = clean(url)
  const local = /^\/uploads\/carros\/([A-Za-z0-9-]{8,64})\.(webp|jpg|jpeg|png)$/i.exec(value)
  if (local) {
    if (!/^https?:\/\//.test(site)) return null
    return local[2].toLowerCase() === 'webp' ? `${site}/uploads/carros/jpg/${local[1]}.jpg` : `${site}${value}`
  }
  if (/^https?:\/\/\S+\.(jpe?g|png|gif)(\?\S*)?$/i.test(value)) return value
  return null
}

export function olxImages(car, siteUrl) {
  const out = []
  for (const url of car.images || []) {
    const image = olxImageUrl(url, siteUrl)
    if (image && !out.includes(image)) out.push(image)
    if (out.length === OLX_MAX_IMAGES) break
  }
  return out
}

// Por que o carro não vai para a OLX (vazio = vai). Só os disponíveis, visíveis
// no site, fora do repasse e marcados "Publicar na OLX" (decisão do Wesley).
export function olxOutReason(car) {
  if (car.olxPublish === false) return 'Desmarcado para a OLX'
  if (car.entryType === 'repasse') return 'Repasse'
  if (car.status === 'vendido') return 'Vendido'
  if (car.status === 'reservado') return 'Reservado'
  if (car.status === 'manutencao') return 'Em manutenção'
  if (car.status !== 'disponivel') return 'Fora de venda'
  if (car.hidden) return 'Oculto do site'
  return ''
}

export function olxEligible(car) {
  return !olxOutReason(car)
}

export const OLX_MISSING_LABELS = {
  placa: 'placa',
  catalogo: 'marca, modelo e versão da OLX',
  cilindrada: 'cilindrada da OLX',
  preco: 'preço',
  ano: 'ano',
  foto: 'foto',
  cep: 'CEP da loja (Configurações → Dados fiscais)',
  telefone: 'telefone (número principal da loja ou WhatsApp do carro)',
}

// ctx: { siteUrl, zip, phone (já escolhido por olxContactPhone), settings }
export function olxMissing(car, ctx = {}) {
  const moto = car.category === 'moto'
  const cat = car.olxCatalog || {}
  const missing = []
  if (!moto && !olxPlate(car.plate)) missing.push('placa')
  if (!cat.brandId || !cat.modelId || (!moto && !cat.versionId)) missing.push('catalogo')
  if (moto && !cat.ccId) missing.push('cilindrada')
  if (!(Number(car.price) > 0)) missing.push('preco')
  if (!olxYear(car)) missing.push('ano')
  if (olxImages(car, ctx.siteUrl).length === 0) missing.push('foto')
  if (!olxZip(ctx.zip)) missing.push('cep')
  if (!olxPhone(ctx.phone)) missing.push('telefone')
  return missing
}

// -- Parâmetros da OLX ------------------------------------------------------------

const CAR_FUEL = [['flex', '3'], ['gasolina', '1'], ['alcool', '2'], ['etanol', '2'], ['diesel', '5'], ['hibrido', '6'], ['eletrico', '7']]
const MOTO_FUEL = [['flex', '3'], ['gasolina', '1'], ['alcool', '2'], ['etanol', '2'], ['diesel', '4'], ['hibrido', '5'], ['eletrico', '6']]
const COLORS = [['pret', '1'], ['branc', '2'], ['prat', '3'], ['vermelh', '4'], ['cinz', '5'], ['grafit', '5'], ['chumb', '5'],
  ['azul', '6'], ['amarel', '7'], ['verde', '8'], ['laranj', '9']]
const CAR_TYPES = { suv: '5', sedan: '8', hatch: '9', picape: '3' }

const CAR_FEATURES = [
  ['1', /ar[ -]?condicionado|ar digital|ar automatico|climatiza/],
  ['3', /vidros? eletric/],
  ['4', /travas? eletric/],
  ['5', /air ?bags?/],
  ['6', /alarme/],
  ['7', /\bsom\b|multimidia|\bradio\b|android auto|carplay/],
  ['8', /sensor(es)? de (re|estacionamento)/],
  ['9', /camera de re/],
  ['10', /blindad/],
  ['11', /couro/],
  ['12', /computador de bordo/],
  ['13', /\busb\b/],
  ['14', /volante multifuncional/],
  ['15', /bluetooth/],
  ['16', /\bgps\b|navegador/],
  ['17', /piloto automatico|controle (automatico )?de (velocidade|cruzeiro)|cruise/],
  ['18', /rodas? (de )?liga/],
  ['19', /teto solar|teto panoramico/],
  ['20', /4x4|tracao integral|\bawd\b|\b4wd\b/],
]

const MOTO_FEATURES = [
  ['1', /\babs\b/],
  ['2', /computador de bordo|painel digital/],
  ['3', /escapamento esportivo|ponteira/],
  ['4', /\bbau\b|bauleto|alforge|bolsa/],
  ['5', /contra ?peso/],
  ['6', /alarme/],
  ['7', /amortecedor de direcao/],
  ['8', /neblina|farol de milha/],
  ['9', /\bgps\b|navegador/],
  ['10', /\bsom\b/],
]

function gearbox(transmission, moto) {
  const t = plain(transmission)
  if (!t) return ''
  if (t.includes('manual')) return '1'
  if (t.includes('semi')) return '3'
  if (!moto && t.includes('automatizad')) return '4'
  if (t.includes('autom') || t.includes('cvt')) return '2'
  return ''
}

function fuelCode(fuel, moto) {
  const f = plain(fuel)
  const found = (moto ? MOTO_FUEL : CAR_FUEL).find(([name]) => f.includes(name))
  return found ? found[1] : ''
}

function colorCode(color) {
  const c = plain(color)
  if (!c) return ''
  const found = COLORS.find(([name]) => c.includes(name))
  return found ? found[1] : '10'
}

function doorsCode(doors) {
  const n = Number(doors)
  if (n === 2) return '1'
  if (n === 3) return '3'
  if (n === 4 || n === 5) return '2'
  return ''
}

// Motor pelo texto da versão ("XEi 2.0 Flex" → 2.0)
function motorpower(version) {
  const m = clean(version).match(/(?:^|[^\d.,])(\d)[.,](\d)(?!\d)/)
  if (!m) return ''
  const value = Number(`${m[1]}.${m[2]}`)
  if (value >= 4) return '12'
  if (value >= 3) return '11'
  if (value >= 2) return '10'
  const codes = { '1': '1', '1.2': '2', '1.3': '3', '1.4': '4', '1.5': '5', '1.6': '6', '1.7': '7', '1.8': '8', '1.9': '9' }
  return codes[String(value)] || ''
}

function steering(text) {
  if (/direcao eletro[- ]?hidraulica/.test(text)) return '5'
  if (/direcao eletrica/.test(text)) return '2'
  if (/direcao hidraulica/.test(text)) return '1'
  if (/direcao mecanica/.test(text)) return '3'
  if (/direcao assistida/.test(text)) return '4'
  return ''
}

function ownerCode(condition) {
  const c = plain(condition)
  if (!c) return ''
  if (c.includes('unico')) return '1'
  if (c.includes('segundo') || c.includes('terceiro')) return '2'
  return ''
}

// Monta o anúncio (sem o access_token). Devolve { ad: null, missing } quando
// falta algum dado obrigatório.
export function buildOlxAd(car, ctx = {}) {
  const missing = olxMissing(car, ctx)
  if (missing.length) return { ad: null, missing }
  const moto = car.category === 'moto'
  const cat = car.olxCatalog
  const settings = ctx.settings || {}
  const text = plain((car.highlights || []).join(' \n '))

  const params = {
    vehicle_brand: String(cat.brandId),
    vehicle_model: String(cat.modelId),
  }
  if (cat.versionId) params.vehicle_version = String(cat.versionId)
  if (moto) params.cubiccms = String(cat.ccId)
  params.regdate = olxYear(car)
  params.mileage = Math.max(0, Math.round(Number(car.km) || 0))
  if (!moto) params.vehicle_tag = olxPlate(car.plate)

  const gear = gearbox(car.transmission, moto)
  if (gear) params.gearbox = gear
  // A moto exige o combustível; GNV no carro vira "kit GNV" (o código 4 saiu)
  const fuel = fuelCode(car.fuel, moto)
  if (fuel || moto) params.fuel = fuel || '1'
  if (!moto && plain(car.fuel).includes('gnv')) params.gnv_kit = '1'
  const color = colorCode(car.color)
  if (color) params.carcolor = color
  if (!moto) {
    const doors = doorsCode(car.doors)
    if (doors) params.doors = doors
    if (CAR_TYPES[car.category]) params.cartype = CAR_TYPES[car.category]
    const power = motorpower(car.version)
    if (power) params.motorpower = power
    const steer = steering(text)
    if (steer) params.car_steering = steer
  }
  const features = (moto ? MOTO_FEATURES : CAR_FEATURES).filter(([, re]) => re.test(text)).map(([code]) => code)
  if (features.length) params[moto ? 'moto_features' : 'car_features'] = features
  const owner = ownerCode(car.condition)
  if (owner) params.owner = owner
  if (settings.exchange === 'sim') params.exchange = '1'
  if (settings.exchange === 'nao') params.exchange = '2'
  if (!moto) {
    if (/chave reserva/.test(text)) params.extra_key = '1'
    if (/manual do proprietario|com manual|manual e chave/.test(text)) params.owner_manual = '1'
    if (/revis(ad[oa]s?|oes)( feitas)? (na|em|pela) concessionaria/.test(text)) params.dealership_review = '1'
    if (/garantia de fabrica|na garantia/.test(text)) params.warranty = '1'
  }

  const ad = {
    id: olxAdId(car.id),
    operation: 'insert',
    category: olxCategory(car),
    subject: olxSubject(car),
    body: olxBody(car, settings),
    phone: Number(olxPhone(ctx.phone)),
    type: 's',
    price: Math.round(Number(car.price)),
    zipcode: olxZip(ctx.zip),
    params,
    images: olxImages(car, ctx.siteUrl),
  }
  return { ad, missing: [] }
}

// Linha do banco (cars) no formato do painel
export function olxCarFromRow(row) {
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
    highlights: row.highlights || [],
    description: row.description || '',
    images: row.images || [],
    status: row.status,
    hidden: Boolean(row.hidden),
    plate: row.plate || '',
    entryType: row.entry_type || 'showroom',
    whatsappSellerId: row.whatsapp_seller_id || null,
    olxPublish: row.olx_publish !== false,
    olxCatalog: row.olx_catalog || {},
  }
}

// -- Mensagens da OLX ---------------------------------------------------------------

const OLX_ERRORS = {
  UNDEFINED_AD_ID: 'anúncio sem identificação',
  NO_IMAGE: 'anúncio sem fotos',
  NO_REGION: 'CEP inválido para a OLX',
  ERROR_FUEL_4_DEPRECATED: 'combustível inválido',
  ERROR_FINANCIAL_INVALID: 'situação financeira inválida',
  ERROR_CAR_FEATURE_2_INVALID: 'opcional inválido',
  ERROR_CAR_TYPE_1_OR_4_INVALID: 'tipo de carro inválido',
  ERROR_VEHICLE_TAG_INVALID: 'placa inválida',
  ERROR_VEHICLE_BRAND_INVALID: 'marca inválida no catálogo da OLX',
  ERROR_VEHICLE_MODEL_INVALID: 'modelo inválido no catálogo da OLX',
  ERROR_VEHICLE_VERSION_INVALID: 'versão inválida no catálogo da OLX',
  ERROR_VEHICLE_BRAND_MODEL_VERSION_INVALID: 'marca, modelo e versão não batem com o catálogo da OLX',
  INVALID_PLATE: 'a OLX não encontrou a placa (ou a consulta de placas estava fora do ar)',
  ERROR_IMAGE_TOO_SMALL: 'foto pequena demais',
  ERROR_DOWNLOADING_IMAGE: 'a OLX não conseguiu baixar as fotos',
  ERROR_UPLOADING_IMAGE: 'erro da OLX ao guardar as fotos',
  ERROR_VIDEOS_URL_INVALID: 'link de vídeo inválido',
  NOT_ENOUGH_AD_SLOTS: 'sem vaga no plano da OLX',
  REFUSED_SUSPECT_CATEGORY: 'recusado pela OLX: categoria suspeita',
  REFUSED_SUSPECT_REGION: 'recusado pela OLX: região suspeita',
  REFUSED_DENOUNCE: 'recusado pela OLX: denúncia',
  REFUSED_DENOUNCED: 'recusado pela OLX: denúncia',
  REFUSED_SUSPECT_AUTOS: 'recusado pela OLX: veículo suspeito',
  REFUSED_SUSPECT_DUPLICATES: 'recusado pela OLX: anúncio duplicado',
  REFUSED_SUSPECT_PRICE: 'recusado pela OLX: preço fora do esperado',
  REFUSED_SUSPECT_LINK_TAGS: 'recusado pela OLX: link ou contato na descrição',
  REFUSED_SUSPECT_CART: 'recusado pela OLX: telefone suspeito',
  REFUSED_SUSPECT_EMAIL: 'recusado pela OLX: e-mail suspeito',
  REFUSED_SUSPECT_IP: 'recusado pela OLX: acesso suspeito',
  REFUSED_SUSPECT_USER: 'recusado pela OLX: conta suspeita',
  REFUSED_SUSPECT_FRAUD: 'recusado pela OLX: suspeita de fraude',
  REFUSED_SUSPECT_ITEMS: 'recusado pela OLX: item proibido',
  AUTOS_FRAUD_MODEL: 'recusado pela OLX: suspeita de fraude',
  REFUSED_GENERIC: 'recusado pela OLX',
  GENERIC_REFUSED: 'recusado pela OLX',
}

export function olxErrorText(code) {
  const key = clean(code).toUpperCase()
  return OLX_ERRORS[key] || (key ? `erro da OLX (${key})` : 'erro da OLX')
}

// -- Sugestão do catálogo da OLX -----------------------------------------------------
// Calibrada com o catálogo real da OLX (06/10/2026): nomes de versão como
// "Pick-up LS 2.8 TDI 4X2 CS Dies. Mec.", "Pro4x CD 4X4 2.3 Bi-TB Die. AUT" ou
// "SW4 SRX 4X4 2.8 TDI 16V Dies. Aut." (a SW4 fica dentro do modelo Hilux).

const BRAND_ALIASES = {
  VW: 'VOLKSWAGEN',
  VOLKS: 'VOLKSWAGEN',
  GM: 'CHEVROLET',
  CHEVY: 'CHEVROLET',
  MERCEDES: 'MERCEDES BENZ',
  BENZ: 'MERCEDES BENZ',
  'CAOA CHERY': 'CHERY',
  CAOA: 'CHERY',
  'GREAT WALL': 'GWM',
  HARLEY: 'HARLEY DAVIDSON',
}

// Modelos que a OLX guarda dentro de outro (a versão diz qual é)
const MODEL_ALIASES = { SW4: 'HILUX', 'HILUX SW4': 'HILUX' }

// Grafias da OLX e do cadastro que querem dizer a mesma coisa
const VERSION_REWRITES = [
  [/\bGR[\s-]?S(PORT)?\b/g, ' GRS '],
  [/\bBI[\s-]?(TB|TURBO)\b/g, ' BITURBO '],
  [/\bT[\s-]?GDI\b/g, ' TURBO '],
  [/\bPRO[\s-]?4X\b/g, ' PRO4X '],
  [/\bCAB(INE|\.)?\s*SIMPLES\b/g, ' CS '],
  [/\bCAB(INE|\.)?\s*DUPLA\b/g, ' CD '],
  [/\bCAB(INE|\.)?\s*ESTENDIDA\b/g, ' CE '],
  [/\bF\.?\s?POWER\b/g, ' FLEX '],
  [/\bP(ICK)?[\s.-]?UP\b/g, ' '],
  [/\b\d+\s*LUGARES\b/g, ' '],
  [/\bPLUG[\s-]?IN\b/g, ' '],
]

const VERSION_SYNONYMS = {
  AUTOMATICO: 'AUT', AUTOMATICA: 'AUT', AUTOM: 'AUT', AUT: 'AUT', AT: 'AUT', CVT: 'AUT', TIPTRONIC: 'AUT',
  MANUAL: 'MEC', MT: 'MEC', MEC: 'MEC',
  TB: 'TURBO', TURBO: 'TURBO',
  TDI: ['TURBO', 'DIESEL'],
  DIES: 'DIESEL', DIE: 'DIESEL', DIESEL: 'DIESEL',
  FLEXFUEL: 'FLEX', FLEXPOWER: 'FLEX', TOTALFLEX: 'FLEX', FLEXONE: 'FLEX', FLEX: 'FLEX',
  HYBRID: 'HIBRIDO', HYBRIDO: 'HIBRIDO', HIBRIDO: 'HIBRIDO',
  AWD: '4X4', '4WD': '4X4', '4MOTION': '4X4',
}

// Válvulas, portas, cavalos e siglas de injeção não ajudam a escolher
const NOISE = [/^\d+V$/, /^\dP$/, /^\d+CV$/, /^(MPFI|EFI|INT|INTERC|INTERCOOLER)$/]

// Carroceria na versão não conta como palavra a mais, mas pesa contra quando
// contraria a categoria do cadastro (sedã x hatch)
const BODY_TOKENS = { SEDAN: 'sedan', HATCH: 'hatch' }

const FUEL_TOKENS = [['flex', 'FLEX'], ['diesel', 'DIESEL'], ['hibrido', 'HIBRIDO'], ['eletrico', 'ELETRICO']]

function tokens(value) {
  return olxNormalize(value).split(' ').filter(Boolean)
}

function contains(haystack, needle) {
  return needle !== '' && ` ${haystack} `.includes(` ${needle} `)
}

function versionTokens(value) {
  let text = clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  for (const [re, to] of VERSION_REWRITES) text = text.replace(re, to)
  const out = []
  for (const t of tokens(text)) {
    const mapped = VERSION_SYNONYMS[t] || (/^AT\d$/.test(t) ? 'AUT' : t)
    for (const m of [].concat(mapped)) if (!NOISE.some((re) => re.test(m)) && !out.includes(m)) out.push(m)
  }
  return out
}

// Igual ou abreviado ("ECOBO." = "ECOBOOST"), só em palavras sem número
function tokenIn(t, list) {
  if (list.includes(t)) return true
  if (t.length < 4 || /\d/.test(t)) return false
  return list.some((u) => u.length >= 4 && !/\d/.test(u) && (u.startsWith(t) || t.startsWith(u)))
}

// options: [{ id, name }]; devolve a lista ordenada com a nota (0 a 1)
export function olxRankBrands(brand, options) {
  const q = olxNormalize(brand)
  const alias = BRAND_ALIASES[q] || q
  return rank(options, (name) => {
    const n = olxNormalize(name)
    if (n === q || n === alias) return 1
    if (contains(n, alias) || contains(n, q)) return 0.9
    const optionAlias = BRAND_ALIASES[n]
    if (optionAlias && (optionAlias === q || optionAlias === alias)) return 0.9
    return 0
  })
}

export function olxRankModels(model, options) {
  const q = olxNormalize(model)
  const qt = tokens(model)
  const alias = MODEL_ALIASES[q] || ''
  return rank(options, (name) => {
    const n = olxNormalize(name)
    if (!n) return 0
    if (n === q) return 1
    if (alias && n === alias) return 0.95
    const nt = n.split(' ')
    // A OLX mais detalhada ("ONIX PLUS" para "Onix") ou a nossa ("Corolla Cross" para "COROLLA")
    if (contains(n, q) && nt[0] === qt[0]) return Math.max(0.6, 0.85 - 0.05 * (nt.length - qt.length))
    if (contains(q, n) && nt[0] === qt[0]) return 0.8
    const common = qt.filter((t) => nt.includes(t)).length
    return common ? 0.5 * (common / Math.max(qt.length, nt.length)) : 0
  })
}

function engineOf(list) {
  return list.find((t) => /^\d\.\d$/.test(t)) || ''
}

// Versão: palavras em comum com o cadastro (versão, câmbio, combustível e o que
// o nosso modelo tem a mais que o da OLX, como "Cross" ou "SW4"); o motor vale o
// dobro. Perde nota: motor diferente, palavras sobrando e a versão da OLX que
// começa com outro nome ("SW4…" numa Hilux, "SEL…" num Titanium).
// modelName: o modelo escolhido no catálogo da OLX.
export function olxRankVersions(car, options, modelName = '') {
  const skip = [...versionTokens(car.brand), ...versionTokens(modelName || car.model)]
  const ours = versionTokens(`${modelName ? car.model : ''} ${car.version}`).filter((t) => !skip.includes(t))
  const gear = gearbox(car.transmission, car.category === 'moto')
  if (gear === '1' && !ours.includes('MEC')) ours.push('MEC')
  if (gear === '2' && !ours.includes('AUT')) ours.push('AUT')
  const fuel = FUEL_TOKENS.find(([name]) => plain(car.fuel).includes(name))
  if (fuel && !ours.includes(fuel[1])) ours.push(fuel[1])
  const engine = engineOf(ours)
  const weight = (t) => (t === engine ? 2 : 1)
  const total = ours.reduce((sum, t) => sum + weight(t), 0)
  return rankDetailed(options, (name) => {
    const theirs = versionTokens(name).filter((t) => !skip.includes(t))
    if (!total || !theirs.length) return { score: 0, extras: 99, coverage: 0, key: '' }
    const matched = ours.filter((t) => tokenIn(t, theirs)).reduce((sum, t) => sum + weight(t), 0)
    const words = theirs.filter((u) => !BODY_TOKENS[u])
    const extras = words.filter((u) => !ours.some((t) => tokenIn(t, [u]))).length
    let score = matched / (total + 0.25 * extras)
    const theirEngine = engineOf(theirs)
    if (engine && theirEngine && theirEngine !== engine) score *= 0.4
    const body = ['sedan', 'hatch'].includes(car.category) ? car.category : ''
    if (body && theirs.some((u) => BODY_TOKENS[u] && BODY_TOKENS[u] !== body)) score *= 0.7
    const first = words[0]
    if (first && /[A-Z]/.test(first) && first.length >= 3 && !ours.some((t) => tokenIn(t, [first]))) score *= 0.8
    return { score, extras, coverage: matched / total, key: [...theirs].sort().join(' ') }
  })
}

// Cilindrada da moto: o número de "CG 160" ou "Fazer 250" que existir na lista
export function olxRankCc(car, options) {
  const numbers = `${clean(car.model)} ${clean(car.version)}`.match(/\b\d{2,4}\b/g) || []
  return rank(options, (name) => (numbers.includes(olxNormalize(name)) ? 1 : 0))
}

const round3 = (n) => Math.round(n * 1000) / 1000

function rank(options, scoreOf) {
  return rankDetailed(options, (name) => ({ score: scoreOf(name) }))
}

function rankDetailed(options, detailOf) {
  return (options || [])
    .map((o) => {
      const d = detailOf(o.name)
      return { ...d, id: o.id, name: o.name, score: round3(d.score) }
    })
    .sort((a, b) => b.score - a.score || (a.extras ?? 0) - (b.extras ?? 0)
      || String(a.name).length - String(b.name).length || String(a.name).localeCompare(String(b.name)))
}

// Escolhe sozinho só quando a combinação é clara: nota boa e distante da
// segunda; ou, nas versões, duas grafias da mesma versão ou a segunda com
// alguma coisa a mais que o cadastro não diz ("Iconic Plus" para "Iconic")
export function olxConfident(ranked, { min = 0.75, margin = 0.1 } = {}) {
  const [best, second] = ranked || []
  if (!best || best.score < min) return null
  if (!second || best.score - second.score >= margin - 1e-9) return best
  if (best.key && best.key === second.key) return best
  if (best.extras === 0 && second.extras > 0 && best.coverage >= second.coverage - 1e-9) return best
  return null
}
// </olxAd.js>
