import { supabase, COMPANY_ID } from './supabaseClient.js'

// Publicação automática na Webmotors (seção 61). A conta fica em "wm_accounts"
// (a senha, no Vault; ninguém lê pela API: a tela usa webmotors_account_info) e
// cada anúncio em "wm_ads" (a equipe do estoque só lê). Quem fala com a
// Webmotors é a Edge Function "webmotors".

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
}

export function webmotorsAccountFromRow(row) {
  if (!row) return null
  const settings = row.settings || {}
  return {
    connected: Boolean(row.connected),
    cnpj: row.cnpj || '',
    email: row.email || '',
    status: row.status || '',
    statusDetail: row.status_detail || '',
    autoPublish: Boolean(row.auto_publish),
    settings: {
      publishDefault: settings.publish_default !== false,
      footer: settings.footer || '',
      exchange: settings.exchange || '',
    },
    modalityCode: row.modality_code || '',
    modalities: Array.isArray(row.modalities) ? row.modalities : [],
    modalitiesAt: row.modalities_at || null,
    connectedAt: row.connected_at || null,
    lastSyncAt: row.last_sync_at || null,
    isDemo: Boolean(row.is_demo),
    siteUrl: row.site_url || '',
    fiscalCnpj: row.fiscal_cnpj || '',
  }
}

export function webmotorsAdFromRow(row) {
  return {
    id: row.id,
    carId: row.car_id || null,
    adCode: row.ad_code ? Number(row.ad_code) : null,
    status: row.status,
    url: row.url || '',
    message: row.message || '',
    errors: Array.isArray(row.errors) ? row.errors : [],
    payload: row.payload || null,
    photos: Array.isArray(row.photos) ? row.photos : [],
    sentAt: row.sent_at || null,
    checkedAt: row.checked_at || null,
    publishedAt: row.published_at || null,
    updatedAt: row.updated_at || null,
  }
}

// Conta da Webmotors da loja (sem a senha). null = sem acesso.
let accountPromise = null

export async function fetchWebmotorsAccount({ fresh = false } = {}) {
  requireSupabase()
  if (!accountPromise || fresh) {
    accountPromise = supabase.rpc('webmotors_account_info').then(({ data, error }) => {
      if (error) throw error
      return webmotorsAccountFromRow(data)
    })
    accountPromise.catch(() => {
      accountPromise = null
    })
  }
  return accountPromise
}

export async function saveWebmotorsSettings({ publishDefault, footer, exchange, autoPublish, modalityCode }) {
  requireSupabase()
  const p = {}
  if (publishDefault !== undefined) p.publish_default = publishDefault
  if (footer !== undefined) p.footer = footer
  if (exchange !== undefined) p.exchange = exchange
  if (autoPublish !== undefined) p.auto_publish = autoPublish
  if (modalityCode !== undefined) p.modality_code = modalityCode
  const { data, error } = await supabase.rpc('save_webmotors_settings', { p })
  if (error) throw error
  const account = webmotorsAccountFromRow(data)
  accountPromise = Promise.resolve(account)
  return account
}

export async function fetchWebmotorsAds() {
  requireSupabase()
  const { data, error } = await supabase.from('wm_ads').select('*').eq('company_id', COMPANY_ID)
  if (error) throw error
  return data.map(webmotorsAdFromRow)
}

async function call(body) {
  requireSupabase()
  const { data, error } = await supabase.functions.invoke('webmotors', { body })
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

// A integração já foi liberada pela Webmotors (segredos do app da WB.Dev)?
// { configured, ambiente }
let setupPromise = null

export async function fetchWebmotorsSetup() {
  if (!setupPromise) {
    setupPromise = call({ action: 'situacao' })
    setupPromise.catch(() => {
      setupPromise = null
    })
  }
  return setupPromise
}

// Testa e guarda o usuário de integração (a senha vai cifrada para o Vault)
export async function connectWebmotors({ cnpj, email, password }) {
  const data = await call({ action: 'conectar', cnpj, email, senha: password })
  accountPromise = null
  return data
}

export async function disconnectWebmotors(removeAds) {
  const data = await call({ action: 'desconectar', removeAds: Boolean(removeAds) })
  accountPromise = null
  return data
}

// Lê de novo as modalidades do plano da loja (com as vagas)
export async function refreshWebmotorsModalities() {
  const data = await call({ action: 'modalidades' })
  accountPromise = null
  return data
}

// Listas da Webmotors: level 'marcas', 'modelos', 'versoes', 'cores', 'cambios',
// 'combustiveis' ou 'opcionais'
const catalogCache = new Map()

export async function fetchWebmotorsCatalog({ level, brandId, modelId }) {
  const key = [level, brandId || '', modelId || ''].join('/')
  if (!catalogCache.has(key)) {
    const promise = call({ action: 'catalogo', level, brandId, modelId }).then((data) => data.options || [])
    catalogCache.set(key, promise)
    promise.catch(() => catalogCache.delete(key))
  }
  return catalogCache.get(key)
}

// Cor, câmbio e combustível da Webmotors (para a sugestão e o que falta)
export async function fetchWebmotorsLists() {
  const [cores, cambios, combustiveis] = await Promise.all([
    fetchWebmotorsCatalog({ level: 'cores' }),
    fetchWebmotorsCatalog({ level: 'cambios' }),
    fetchWebmotorsCatalog({ level: 'combustiveis' }),
  ])
  return { cores, cambios, combustiveis }
}

// Concilia o estoque com a Webmotors. carIds: "Publicar agora" desses carros
// (mesmo sem a publicação automática); force: manda de novo mesmo sem mudança.
export async function syncWebmotors({ carIds, force = false, manual = false } = {}) {
  return call({ action: 'sincronizar', carIds, force, manual })
}

export async function previewWebmotorsAd(carId) {
  return call({ action: 'previa', carId })
}

// Depois de mudar um carro: se a loja tem a Webmotors conectada, pede a
// conciliação em segundo plano (junta várias mudanças seguidas num pedido só)
let syncTimer = null

export function webmotorsSyncSoon() {
  if (!supabase) return
  clearTimeout(syncTimer)
  syncTimer = setTimeout(async () => {
    try {
      const account = await fetchWebmotorsAccount()
      if (account?.connected) await syncWebmotors()
    } catch {
      // sem conexão ou sem a seção 61: a rodada automática resolve depois
    }
  }, 1500)
}
