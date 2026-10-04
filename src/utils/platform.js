// Aba "Plataforma": regras sem tela e sem banco (testadas em tests/platform.test.js).
// Recebem as lojas já no formato de lib/platformApi.js.

// Limites do semáforo de saúde (ajuste aqui)
export const HEALTH_LIMITS = {
  idleRedDays: 14, // ninguém usa o painel há N dias ou mais → vermelho
  idleYellowDays: 7, // N dias sem uso → amarelo
  noNewCarDays: 30, // nenhum carro cadastrado há N dias → amarelo
  noPhotoShare: 0.2, // mais que esta fração dos carros à venda sem foto → amarelo
  staleShare: 0.5, // mais que esta fração do estoque parado além do aviso → amarelo
  visitsDrop: 0.5, // visitas caíram mais que isso em relação ao período anterior → amarelo
  minVisitsForDrop: 20, // só compara visitas se o período anterior teve pelo menos isso
}

const DAY_MS = 24 * 60 * 60 * 1000

// Dias inteiros desde uma data/hora (null se não houver data)
export function daysSince(iso, today = new Date()) {
  if (!iso) return null
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return null
  return Math.max(0, Math.floor((today.getTime() - then.getTime()) / DAY_MS))
}

// Último uso do painel: atividade registrada ou login, o mais recente
export function lastUseAt(store) {
  const dates = [store.usage?.lastActivityAt, store.lastLoginAt].filter(Boolean)
  if (dates.length === 0) return null
  return dates.reduce((a, b) => (new Date(a) > new Date(b) ? a : b))
}

// Variação em relação ao período anterior
export function trend(previous, current) {
  const prev = Number(previous) || 0
  const cur = Number(current) || 0
  const diff = cur - prev
  return {
    diff,
    pct: prev > 0 ? Math.round((diff / prev) * 100) : null,
    direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'same',
  }
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// Semáforo: { level: 'green' | 'yellow' | 'red', reasons: [{ level, text }] }
export function storeHealth(store, today = new Date(), limits = HEALTH_LIMITS) {
  const reasons = []
  const red = (text) => reasons.push({ level: 'red', text })
  const yellow = (text) => reasons.push({ level: 'yellow', text })

  const idle = daysSince(lastUseAt(store), today)
  if (idle === null) red('Ninguém entrou no painel ainda')
  else if (idle >= limits.idleRedDays) red(`Ninguém usa o painel há ${idle} dias`)
  else if (idle >= limits.idleYellowDays) yellow(`${idle} dias sem uso do painel`)

  if (!store.whatsappOk) red('WhatsApp do site sem número (os botões não funcionam)')

  const available = store.stock?.available || 0
  if (available === 0) red('Nenhum carro à venda no site')

  const sinceNewCar = daysSince(store.stock?.lastAddedAt, today)
  if (sinceNewCar !== null && sinceNewCar >= limits.noNewCarDays) yellow(`Nenhum carro cadastrado há ${sinceNewCar} dias`)

  if (available > 0) {
    const noPhoto = store.stock?.noPhoto || 0
    if (noPhoto / available > limits.noPhotoShare) yellow(`${plural(noPhoto, 'carro à venda', 'carros à venda')} sem foto`)
    const stale = store.stock?.stale || 0
    if (stale / available > limits.staleShare) {
      yellow(`${plural(stale, 'carro parado', 'carros parados')} há mais de ${store.stockAlertDays || 60} dias`)
    }
  }

  const team = (store.team?.admins || 0) + (store.team?.managers || 0) + (store.team?.sellers || 0)
  if (team > 1 && (store.usage?.activeUsers || 0) === 1) yellow(`Só 1 de ${team} pessoas da equipe usou o painel no período`)

  const prevVisits = store.site?.visitsPrev || 0
  const visits = store.site?.visits || 0
  if (prevVisits >= limits.minVisitsForDrop && visits < prevVisits * (1 - limits.visitsDrop)) {
    yellow(`Visitas caíram ${Math.round((1 - visits / prevVisits) * 100)}% em relação ao período anterior`)
  }

  const level = reasons.some((r) => r.level === 'red') ? 'red' : reasons.length > 0 ? 'yellow' : 'green'
  return { level, reasons }
}

export const HEALTH_LABELS = { green: 'Tudo certo', yellow: 'Atenção', red: 'Precisa de ajuda' }
// Na aba Desempenho, quem lê é o próprio lojista
export const STORE_HEALTH_LABELS = { green: 'Tudo certo', yellow: 'Atenção', red: 'Precisa de atenção' }

// Soma das lojas reais (a loja de demonstração fica de fora): "prova de valor"
export function platformTotals(stores, today = new Date()) {
  const real = (stores || []).filter((s) => !s.isDemo)
  const sum = (fn) => real.reduce((total, s) => total + (Number(fn(s)) || 0), 0)
  return {
    stores: real.length,
    activeStores: real.filter((s) => {
      const idle = daysSince(lastUseAt(s), today)
      return idle !== null && idle < HEALTH_LIMITS.idleRedDays
    }).length,
    available: sum((s) => s.stock.available),
    inStock: sum((s) => s.stock.inStock),
    added: sum((s) => s.stock.added),
    addedPrev: sum((s) => s.stock.addedPrev),
    visits: sum((s) => s.site.visits),
    visitsPrev: sum((s) => s.site.visitsPrev),
    visitors: sum((s) => s.site.visitors),
    visitorsPrev: sum((s) => s.site.visitorsPrev),
    views: sum((s) => s.site.views),
    viewsPrev: sum((s) => s.site.viewsPrev),
    leads: sum((s) => s.leads.total),
    leadsPrev: sum((s) => s.leads.prev),
    sold: sum((s) => s.sales.sold),
    soldPrev: sum((s) => s.sales.soldPrev),
    soldSite: sum((s) => s.sales.soldSite),
    soldSitePrev: sum((s) => s.sales.soldSitePrev),
    activities: sum((s) => s.usage.activities),
  }
}

// Funções do painel e se a loja usa (total desde sempre e no período)
export const FEATURES = [
  { key: 'sales', label: 'Vendas' },
  { key: 'customers', label: 'Clientes' },
  { key: 'customer_contacts', label: 'Atendimentos' },
  { key: 'customer_interests', label: 'Interesses' },
  { key: 'reservations', label: 'Reservas' },
  { key: 'contracts', label: 'Contratos' },
  { key: 'contract_templates', label: 'Modelos de contrato' },
  { key: 'financings', label: 'Financiamento próprio' },
  { key: 'external_financings', label: 'Financ. externos' },
  { key: 'expenses', label: 'Gastos' },
  { key: 'customer_documents', label: 'Documentos' },
  { key: 'rotation', label: 'Rodízio do WhatsApp' },
]

export function featureUsage(store) {
  return FEATURES.map((f) => {
    const value = store.features?.[f.key] || { total: 0, period: 0 }
    return { ...f, total: value.total || 0, period: value.period || 0, used: (value.total || 0) > 0 }
  })
}

// 'AAAA-MM' → { start, end } (primeiro e último dia do mês)
export function monthRange(month) {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const mm = String(m).padStart(2, '0')
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, '0')}` }
}

export function previousMonth(month) {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

export function monthLabel(month) {
  const [y, m] = month.split('-').map(Number)
  const name = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' })
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${y}`
}

// Colunas da comparação entre lojas (valor usado para ordenar)
export const COMPARE_COLUMNS = [
  { key: 'visits', label: 'Visitas', value: (s) => s.site.visits },
  { key: 'leads', label: 'Contatos', value: (s) => s.leads.total },
  { key: 'available', label: 'À venda', value: (s) => s.stock.available },
  { key: 'added', label: 'Cadastrados', value: (s) => s.stock.added },
  { key: 'sold', label: 'Vendidos', value: (s) => s.sales.sold },
  { key: 'soldSite', label: 'Vendas pelo site', value: (s) => s.sales.soldSite },
  { key: 'activeUsers', label: 'Pessoas ativas', value: (s) => s.usage.activeUsers },
  { key: 'activities', label: 'Atividades', value: (s) => s.usage.activities },
  { key: 'lastUse', label: 'Último uso', value: (s) => (lastUseAt(s) ? new Date(lastUseAt(s)).getTime() : 0) },
]

export function sortStores(stores, key, dir = 'desc') {
  const column = COMPARE_COLUMNS.find((c) => c.key === key)
  const list = [...(stores || [])]
  if (!column) return list.sort((a, b) => a.name.localeCompare(b.name))
  const sign = dir === 'asc' ? 1 : -1
  return list.sort((a, b) => sign * (column.value(a) - column.value(b)) || a.name.localeCompare(b.name))
}

// Períodos da aba (o banco aceita até 400 dias)
export const PLATFORM_PERIODS = [
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: 'mes', label: 'Este mês' },
  { value: 'mes-anterior', label: 'Mês passado' },
  { value: '90d', label: 'Últimos 90 dias' },
  { value: 'ano', label: 'Este ano' },
]

const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function platformRange(period, today = new Date()) {
  const y = today.getFullYear()
  const m = today.getMonth()
  const back = (days) => isoDay(new Date(y, m, today.getDate() - days + 1))
  switch (period) {
    case '7d':
      return { start: back(7), end: isoDay(today) }
    case 'mes':
      return { start: isoDay(new Date(y, m, 1)), end: isoDay(today) }
    case 'mes-anterior':
      return { start: isoDay(new Date(y, m - 1, 1)), end: isoDay(new Date(y, m, 0)) }
    case '90d':
      return { start: back(90), end: isoDay(today) }
    case 'ano':
      return { start: isoDay(new Date(y, 0, 1)), end: isoDay(today) }
    default:
      return { start: back(30), end: isoDay(today) }
  }
}

// Últimos N meses ('AAAA-MM'), do mais recente para o mais antigo
export function recentMonths(count = 12, today = new Date()) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}

// "Último uso há N dias" para os cartões e a comparação
export function lastUseText(store, today = new Date()) {
  const days = daysSince(lastUseAt(store), today)
  if (days === null) return 'Nunca usou o painel'
  if (days === 0) return 'Usou o painel hoje'
  if (days === 1) return 'Usou o painel ontem'
  return `Último uso há ${days} dias`
}

// Relatório mensal: o mês escolhido e o mês anterior. No mês corrente (ainda
// aberto) vai até hoje e compara com os mesmos dias do mês anterior.
export function reportRanges(month, today = new Date()) {
  const current = isoDay(new Date(today.getFullYear(), today.getMonth(), 1)).slice(0, 7)
  const full = monthRange(month)
  const previous = previousMonth(month)
  const prevFull = monthRange(previous)
  if (month !== current) return { range: full, prevRange: prevFull, previous, partialUntil: null }
  const day = today.getDate()
  const prevLastDay = Number(prevFull.end.slice(8, 10))
  return {
    range: { start: full.start, end: isoDay(today) },
    prevRange: { start: prevFull.start, end: `${previous}-${String(Math.min(day, prevLastDay)).padStart(2, '0')}` },
    previous,
    partialUntil: isoDay(today),
  }
}
