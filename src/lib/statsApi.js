import { supabase, publicSupabase, COMPANY_ID } from './supabaseClient.js'
import { todayISO } from '../utils/carFormat.js'

// -- Registro de visitas (site público) --------------------------------------
// Cada acesso conta; voltar em até 30 min conta como o mesmo acesso (não infla
// com recarregar a página). "Pessoas" = cada navegador conta 1 vez por dia.
// O controle fica no localStorage do visitante; o banco só guarda totais
// diários (ver seção 22 do schema.sql).

const VISIT_WINDOW_MS = 30 * 60 * 1000
const SITE_KEY = 'stats_site_visit'
const CARS_KEY = 'stats_car_views'
// Em localhost só conta com localStorage "stats_dev" = "1" (testes)
const DEV_FLAG = 'stats_dev'

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {}
  } catch {
    return {}
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // armazenamento bloqueado: segue sem lembrar (pode contar a mais)
  }
}

function shouldTrack() {
  if (!publicSupabase) return false
  let devFlag = null
  try {
    devFlag = localStorage.getItem(DEV_FLAG)
  } catch {
    devFlag = null
  }
  if (devFlag === '1') return true
  const host = window.location.hostname
  if (host === 'localhost' || host === '127.0.0.1') return false
  if (navigator.webdriver) return false
  return !/bot|crawl|spider|slurp|preview|lighthouse|headless/i.test(navigator.userAgent)
}

function send(fn, params) {
  publicSupabase.rpc(fn, params).then(
    () => {},
    () => {}
  )
}

export function trackSiteVisit() {
  if (!shouldTrack()) return
  const now = Date.now()
  const today = todayISO()
  const state = readJson(SITE_KEY)
  const newVisitor = state.day !== today
  const newVisit = newVisitor || !state.last || now - state.last > VISIT_WINDOW_MS
  writeJson(SITE_KEY, { last: now, day: today })
  if (newVisit) send('track_site_visit', { p_company: COMPANY_ID, p_new_visitor: newVisitor })
}

export function trackCarView(carId) {
  if (!carId || !shouldTrack()) return
  const now = Date.now()
  const today = todayISO()
  const views = readJson(CARS_KEY)
  const entry = views[carId] || {}
  const newViewer = entry.day !== today
  const newView = newViewer || !entry.last || now - entry.last > VISIT_WINDOW_MS
  views[carId] = { last: now, day: today }
  // Esquece carros vistos há mais de 2 dias (mantém o armazenamento pequeno)
  for (const [id, v] of Object.entries(views)) {
    if (now - (v.last || 0) > 2 * 24 * 60 * 60 * 1000) delete views[id]
  }
  writeJson(CARS_KEY, views)
  if (newView) send('track_car_view', { p_car: carId, p_new_viewer: newViewer })
}

// -- Leitura (painel) ----------------------------------------------------------

// Totais do período (datas yyyy-mm-dd; null = sem limite)
export async function fetchSiteVisitTotals(start, end) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase.rpc('site_visit_totals', { p_start: start || null, p_end: end || null })
  if (error) throw error
  const row = data?.[0] || {}
  return { visits: Number(row.visits) || 0, visitors: Number(row.visitors) || 0 }
}

// Visitas dos últimos N dias, um item por dia (dias sem visita = 0)
export async function fetchDailyVisits(days = 14) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const start = new Date()
  start.setDate(start.getDate() - (days - 1))
  const startISO = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
  const { data, error } = await supabase
    .from('site_visits_daily')
    .select('day, visits, visitors')
    .eq('company_id', COMPANY_ID)
    .gte('day', startISO)
    .order('day', { ascending: true })
  if (error) throw error
  const byDay = {}
  for (const row of data) byDay[row.day] = row
  const result = []
  for (let i = 0; i < days; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    result.push({
      day: iso,
      label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
      visits: byDay[iso]?.visits || 0,
      visitors: byDay[iso]?.visitors || 0,
    })
  }
  return result
}

// Visualizações por carro no período: { [carId]: { views, viewers } }
export async function fetchCarViewTotals(start, end) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase.rpc('car_view_totals', { p_start: start || null, p_end: end || null })
  if (error) throw error
  const map = {}
  for (const row of data || []) map[row.car_id] = { views: Number(row.views) || 0, viewers: Number(row.viewers) || 0 }
  return map
}

export function formatViews(n) {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? 'visualização' : 'visualizações'}`
}
