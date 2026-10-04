import { supabase } from './supabaseClient.js'

// Aba "Plataforma" (só para o dono do sistema, tabela platform_admins): números
// de todas as lojas, calculados no banco (seções 33 e 35 do schema.sql). A aba
// "Desempenho" de cada loja usa os mesmos números, só da própria loja. Nada de
// dados sensíveis: só quantidades, datas e tipos de atividade.

const num = (value) => Number(value) || 0
// Nome de carro sem espaço sobrando (o cadastro às vezes tem espaço duplo)
const clean = (text) => String(text || '').replace(/\s+/g, ' ').trim()

function pair(total, period) {
  return { total: num(total), period: num(period) }
}

function toStore(row) {
  const site = row.site || {}
  const views = row.car_views || {}
  const leads = row.leads || {}
  const stock = row.stock || {}
  const sales = row.sales || {}
  const usage = row.usage || {}
  const team = row.team || {}
  const features = Object.fromEntries(
    Object.entries(row.features || {}).map(([key, value]) => [key, pair(value?.total, value?.period)])
  )
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    siteUrl: row.site_url || '',
    isDemo: Boolean(row.is_demo),
    createdAt: row.created_at,
    stockAlertDays: num(row.stock_alert_days) || 60,
    whatsappMode: row.whatsapp_mode || 'fixo',
    whatsappOk: Boolean(row.whatsapp_ok),
    settingsCustomized: Boolean(row.settings_customized),
    site: {
      visits: num(site.visits),
      visitors: num(site.visitors),
      visitsPrev: num(site.visits_prev),
      visitorsPrev: num(site.visitors_prev),
      views: num(views.views),
      viewsPrev: num(views.views_prev),
    },
    leads: { total: num(leads.total), prev: num(leads.prev) },
    stock: {
      available: num(stock.available),
      reserved: num(stock.reserved),
      maintenance: num(stock.maintenance),
      hidden: num(stock.hidden),
      inStock: num(stock.in_stock),
      noPhoto: num(stock.no_photo),
      stale: num(stock.stale),
      added: num(stock.added),
      addedPrev: num(stock.added_prev),
      lastAddedAt: stock.last_added_at || null,
      lastUpdatedAt: stock.last_updated_at || null,
    },
    sales: {
      sold: num(sales.sold),
      soldPrev: num(sales.sold_prev),
      soldSite: num(sales.sold_site),
      soldSitePrev: num(sales.sold_site_prev),
      total: num(sales.total),
    },
    usage: {
      lastActivityAt: usage.last_activity_at || null,
      lastWorkAt: usage.last_work_at || null,
      activities: num(usage.activities),
      activitiesPrev: num(usage.activities_prev),
      logins: num(usage.logins),
      activeUsers: num(usage.active_users),
      activeDays: num(usage.active_days),
    },
    lastLoginAt: row.last_login_at || null,
    team: { admins: num(team.admins), managers: num(team.managers), sellers: num(team.sellers) },
    features,
  }
}

export async function fetchIsPlatformAdmin() {
  const { data, error } = await supabase.rpc('is_platform_admin')
  if (error) return false
  return data === true
}

// range: { start, end } em 'AAAA-MM-DD'
export async function fetchPlatformOverview(range) {
  const { data, error } = await supabase.rpc('platform_overview', { p_start: range.start, p_end: range.end })
  if (error) throw error
  return (data || []).map(toStore)
}

// Aba "Desempenho": os mesmos números, só da loja de quem está logado (admin)
export async function fetchStorePerformance(range) {
  const { data, error } = await supabase.rpc('store_performance', { p_start: range.start, p_end: range.end })
  if (error) throw error
  if (!data) throw new Error('Loja não encontrada.')
  return toStore(data)
}

export async function fetchStoreDetail(companyId, range) {
  const { data, error } = await supabase.rpc('platform_store_detail', {
    p_company: companyId,
    p_start: range.start,
    p_end: range.end,
  })
  if (error) throw error
  const detail = data || {}
  return {
    daily: (detail.daily || []).map((d) => ({
      day: d.day,
      visits: num(d.visits),
      visitors: num(d.visitors),
      views: num(d.views),
      leads: num(d.leads),
    })),
    topViewed: (detail.top_viewed || []).map((t) => ({ car: clean(t.car), count: num(t.count) })),
    topLeads: (detail.top_leads || []).map((t) => ({ car: clean(t.car), count: num(t.count) })),
    team: (detail.team || []).map((t) => ({
      name: t.name,
      role: t.role,
      active: t.active !== false,
      lastSignInAt: t.last_sign_in_at || null,
    })),
    activities: (detail.activities || []).map((a) => ({
      at: a.at,
      action: a.action,
      entity: a.entity,
      label: clean(a.label),
      details: a.details || '',
      who: a.who || '',
      role: a.role || '',
    })),
  }
}
