import { supabase, COMPANY_ID } from './supabaseClient.js'

// Publicação automática na OLX (seção 59). A conta fica em "olx_accounts" (o
// token ninguém lê pela API: a tela usa olx_account_info) e cada anúncio em
// "olx_ads" (a equipe do estoque só lê). Quem fala com a OLX é a Edge Function
// "olx-oauth".

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
}

export function olxAccountFromRow(row) {
  if (!row) return null
  const settings = row.settings || {}
  return {
    connected: Boolean(row.connected),
    userName: row.user_name || '',
    userEmail: row.user_email || '',
    status: row.status || '',
    statusDetail: row.status_detail || '',
    autoPublish: Boolean(row.auto_publish),
    settings: {
      publishDefault: settings.publish_default !== false,
      footer: settings.footer || '',
      exchange: settings.exchange || '',
    },
    connectedAt: row.connected_at || null,
    lastSyncAt: row.last_sync_at || null,
    isDemo: Boolean(row.is_demo),
    siteUrl: row.site_url || '',
    zip: row.zip || '',
    mainPhone: row.main_phone || '',
  }
}

export function olxAdFromRow(row) {
  return {
    id: row.id,
    carId: row.car_id || null,
    adId: row.ad_id,
    status: row.status,
    operation: row.operation,
    listId: row.list_id || '',
    url: row.url || '',
    message: row.message || '',
    errors: Array.isArray(row.errors) ? row.errors : [],
    payload: row.payload || null,
    sentAt: row.sent_at || null,
    checkedAt: row.checked_at || null,
    publishedAt: row.published_at || null,
    updatedAt: row.updated_at || null,
  }
}

// Conta da OLX da loja (sem o token). null = sem acesso.
let accountPromise = null

export async function fetchOlxAccount({ fresh = false } = {}) {
  requireSupabase()
  if (!accountPromise || fresh) {
    accountPromise = supabase.rpc('olx_account_info').then(({ data, error }) => {
      if (error) throw error
      return olxAccountFromRow(data)
    })
    accountPromise.catch(() => {
      accountPromise = null
    })
  }
  return accountPromise
}

export async function saveOlxSettings({ publishDefault, footer, exchange, autoPublish }) {
  requireSupabase()
  const p = {}
  if (publishDefault !== undefined) p.publish_default = publishDefault
  if (footer !== undefined) p.footer = footer
  if (exchange !== undefined) p.exchange = exchange
  if (autoPublish !== undefined) p.auto_publish = autoPublish
  const { data, error } = await supabase.rpc('save_olx_settings', { p })
  if (error) throw error
  const account = olxAccountFromRow(data)
  accountPromise = Promise.resolve(account)
  return account
}

export async function fetchOlxAds() {
  requireSupabase()
  const { data, error } = await supabase.from('olx_ads').select('*').eq('company_id', COMPANY_ID)
  if (error) throw error
  return data.map(olxAdFromRow)
}

async function call(body) {
  requireSupabase()
  const { data, error } = await supabase.functions.invoke('olx-oauth', { body })
  if (error) {
    let message = error.message
    try {
      const payload = await error.context?.json()
      if (payload?.error) message = payload.error
    } catch {
      // resposta sem corpo JSON
    }
    throw new Error(message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

// Abre o login da OLX; a OLX devolve para /admin/portais?olx=conectada
export async function connectOlx() {
  const data = await call({ action: 'conectar', origin: window.location.origin })
  window.location.assign(data.url)
}

export async function disconnectOlx(removeAds) {
  const data = await call({ action: 'desconectar', removeAds: Boolean(removeAds) })
  accountPromise = null
  return data
}

// Catálogo da OLX: kind 'carro' ou 'moto'; level 'marcas', 'modelos', 'versoes' ou 'cilindradas'
const catalogCache = new Map()

export async function fetchOlxCatalog({ kind, level, brandId, modelId }) {
  const key = [kind, level, brandId || '', modelId || ''].join('/')
  if (!catalogCache.has(key)) {
    const promise = call({ action: 'catalogo', kind, level, brandId, modelId }).then((data) => data.options || [])
    catalogCache.set(key, promise)
    promise.catch(() => catalogCache.delete(key))
  }
  return catalogCache.get(key)
}

// Concilia o estoque com a OLX. carIds: "Publicar agora" desses carros (mesmo
// sem a publicação automática); force: manda de novo mesmo sem mudança.
export async function syncOlx({ carIds, force = false, manual = false } = {}) {
  return call({ action: 'sincronizar', carIds, force, manual })
}

export async function previewOlxAd(carId) {
  return call({ action: 'previa', carId })
}

export async function renewOlxAd(carId) {
  return call({ action: 'renovar', carId })
}

// Depois de mudar um carro (salvar, vender, reservar, ocultar, excluir): se a
// loja tem a conta da OLX conectada, pede a conciliação em segundo plano (junta
// várias mudanças seguidas num pedido só)
let syncTimer = null

export function olxSyncSoon() {
  if (!supabase) return
  clearTimeout(syncTimer)
  syncTimer = setTimeout(async () => {
    try {
      const account = await fetchOlxAccount()
      if (account?.connected) await syncOlx()
    } catch {
      // sem conexão ou sem a seção 59: a rodada automática resolve depois
    }
  }, 1500)
}
