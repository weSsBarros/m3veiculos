import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  storeHealth,
  trend,
  platformTotals,
  featureUsage,
  monthRange,
  previousMonth,
  monthLabel,
  sortStores,
  lastUseAt,
  daysSince,
} from '../src/utils/platform.js'

const TODAY = new Date('2026-10-20T12:00:00-03:00')
const daysAgo = (n) => new Date(TODAY.getTime() - n * 24 * 60 * 60 * 1000).toISOString()

function store(overrides = {}) {
  const base = {
    id: 'x',
    slug: 'loja',
    name: 'Loja',
    isDemo: false,
    whatsappOk: true,
    stockAlertDays: 60,
    site: { visits: 100, visitsPrev: 90, visitors: 80, visitorsPrev: 70, views: 300, viewsPrev: 250 },
    leads: { total: 10, prev: 8 },
    stock: { available: 10, inStock: 12, noPhoto: 0, stale: 0, added: 3, addedPrev: 2, lastAddedAt: daysAgo(2) },
    sales: { sold: 2, soldPrev: 1, soldSite: 1, soldSitePrev: 0, total: 5 },
    usage: { lastActivityAt: daysAgo(1), activeUsers: 2, activities: 40 },
    lastLoginAt: daysAgo(1),
    team: { admins: 1, managers: 0, sellers: 1 },
    features: {},
  }
  return {
    ...base,
    ...overrides,
    site: { ...base.site, ...overrides.site },
    stock: { ...base.stock, ...overrides.stock },
    usage: { ...base.usage, ...overrides.usage },
    team: { ...base.team, ...overrides.team },
  }
}

test('plataforma: loja em dia fica verde, sem motivos', () => {
  assert.deepEqual(storeHealth(store(), TODAY), { level: 'green', reasons: [] })
})

test('plataforma: sem uso do painel há 7 dias fica amarelo; há 14 ou mais, vermelho', () => {
  const s7 = store({ usage: { lastActivityAt: daysAgo(8) }, lastLoginAt: daysAgo(9) })
  assert.equal(storeHealth(s7, TODAY).level, 'yellow')
  assert.match(storeHealth(s7, TODAY).reasons[0].text, /8 dias sem uso/)
  const s15 = store({ usage: { lastActivityAt: daysAgo(15) }, lastLoginAt: daysAgo(20) })
  assert.equal(storeHealth(s15, TODAY).level, 'red')
  assert.match(storeHealth(s15, TODAY).reasons[0].text, /há 15 dias/)
  const never = store({ usage: { lastActivityAt: null }, lastLoginAt: null })
  assert.equal(storeHealth(never, TODAY).reasons[0].text, 'Ninguém entrou no painel ainda')
})

test('plataforma: WhatsApp sem número e estoque vazio são vermelhos', () => {
  const noPhone = storeHealth(store({ whatsappOk: false }), TODAY)
  assert.equal(noPhone.level, 'red')
  assert.ok(noPhone.reasons.some((r) => /WhatsApp do site sem número/.test(r.text)))
  const empty = storeHealth(store({ stock: { available: 0 } }), TODAY)
  assert.equal(empty.level, 'red')
  assert.ok(empty.reasons.some((r) => r.text === 'Nenhum carro à venda no site'))
})

test('plataforma: fotos, estoque parado, cadastro antigo, uma pessoa só e queda de visitas são amarelos', () => {
  const r = storeHealth(
    store({
      stock: { available: 10, noPhoto: 3, stale: 6, lastAddedAt: daysAgo(31) },
      usage: { activeUsers: 1 },
      team: { admins: 1, sellers: 2 },
      site: { visits: 40, visitsPrev: 100 },
    }),
    TODAY
  )
  assert.equal(r.level, 'yellow')
  const texts = r.reasons.map((x) => x.text)
  assert.ok(texts.includes('3 carros à venda sem foto'))
  assert.ok(texts.includes('6 carros parados há mais de 60 dias'))
  assert.ok(texts.includes('Nenhum carro cadastrado há 31 dias'))
  assert.ok(texts.includes('Só 1 de 3 pessoas da equipe usou o painel no período'))
  assert.ok(texts.includes('Visitas caíram 60% em relação ao período anterior'))
})

test('plataforma: queda de visitas só conta com movimento suficiente; loja de uma pessoa não é alerta', () => {
  const few = storeHealth(store({ site: { visits: 2, visitsPrev: 10 }, usage: { activeUsers: 1 }, team: { admins: 1, sellers: 0 } }), TODAY)
  assert.equal(few.level, 'green')
})

test('plataforma: último uso é o mais recente entre atividade e login', () => {
  assert.equal(lastUseAt(store({ usage: { lastActivityAt: daysAgo(5) }, lastLoginAt: daysAgo(2) })), daysAgo(2))
  assert.equal(lastUseAt(store({ usage: { lastActivityAt: null }, lastLoginAt: null })), null)
  assert.equal(daysSince(null, TODAY), null)
})

test('plataforma: tendência em relação ao período anterior', () => {
  assert.deepEqual(trend(100, 150), { diff: 50, pct: 50, direction: 'up' })
  assert.deepEqual(trend(80, 60), { diff: -20, pct: -25, direction: 'down' })
  assert.deepEqual(trend(0, 5), { diff: 5, pct: null, direction: 'up' })
  assert.deepEqual(trend(3, 3), { diff: 0, pct: 0, direction: 'same' })
})

test('plataforma: totais somam só as lojas reais (sem a demonstração)', () => {
  const totals = platformTotals(
    [
      store({ name: 'A' }),
      store({ name: 'B', usage: { lastActivityAt: daysAgo(30) }, lastLoginAt: daysAgo(30) }),
      store({ name: 'Demo', isDemo: true, site: { visits: 9999 } }),
    ],
    TODAY
  )
  assert.equal(totals.stores, 2)
  assert.equal(totals.activeStores, 1)
  assert.equal(totals.visits, 200)
  assert.equal(totals.leads, 20)
  assert.equal(totals.sold, 4)
  assert.equal(totals.soldSite, 2)
  assert.equal(totals.available, 20)
})

test('plataforma: uso de cada função', () => {
  const usage = featureUsage({ features: { contracts: { total: 3, period: 1 }, customers: { total: 0, period: 0 } } })
  const contracts = usage.find((f) => f.key === 'contracts')
  assert.deepEqual([contracts.total, contracts.period, contracts.used], [3, 1, true])
  assert.equal(usage.find((f) => f.key === 'customers').used, false)
  assert.equal(usage.find((f) => f.key === 'rotation').used, false)
})

test('plataforma: mês do relatório', () => {
  assert.deepEqual(monthRange('2026-02'), { start: '2026-02-01', end: '2026-02-28' })
  assert.deepEqual(monthRange('2028-02'), { start: '2028-02-01', end: '2028-02-29' })
  assert.deepEqual(monthRange('2026-12'), { start: '2026-12-01', end: '2026-12-31' })
  assert.equal(previousMonth('2026-01'), '2025-12')
  assert.equal(previousMonth('2026-10'), '2026-09')
  assert.equal(monthLabel('2026-10'), 'Outubro de 2026')
})

test('plataforma: comparação ordena pela coluna e desempata pelo nome', () => {
  const list = [store({ name: 'B', site: { visits: 5 } }), store({ name: 'A', site: { visits: 5 } }), store({ name: 'C', site: { visits: 50 } })]
  assert.deepEqual(sortStores(list, 'visits').map((s) => s.name), ['C', 'A', 'B'])
  assert.deepEqual(sortStores(list, 'visits', 'asc').map((s) => s.name), ['A', 'B', 'C'])
})

test('plataforma: períodos com início e fim definidos', async () => {
  const { platformRange, recentMonths } = await import('../src/utils/platform.js')
  const today = new Date(2026, 9, 20)
  assert.deepEqual(platformRange('7d', today), { start: '2026-10-14', end: '2026-10-20' })
  assert.deepEqual(platformRange('30d', today), { start: '2026-09-21', end: '2026-10-20' })
  assert.deepEqual(platformRange('mes', today), { start: '2026-10-01', end: '2026-10-20' })
  assert.deepEqual(platformRange('mes-anterior', today), { start: '2026-09-01', end: '2026-09-30' })
  assert.deepEqual(platformRange('ano', today), { start: '2026-01-01', end: '2026-10-20' })
  assert.deepEqual(recentMonths(3, today), ['2026-10', '2026-09', '2026-08'])
  assert.deepEqual(recentMonths(2, new Date(2026, 0, 5)), ['2026-01', '2025-12'])
})

test('plataforma: relatório do mês fechado compara com o mês anterior inteiro; o mês aberto, com os mesmos dias', async () => {
  const { reportRanges } = await import('../src/utils/platform.js')
  const today = new Date(2026, 9, 2)
  assert.deepEqual(reportRanges('2026-09', today), {
    range: { start: '2026-09-01', end: '2026-09-30' },
    prevRange: { start: '2026-08-01', end: '2026-08-31' },
    previous: '2026-08',
    partialUntil: null,
  })
  assert.deepEqual(reportRanges('2026-10', today), {
    range: { start: '2026-10-01', end: '2026-10-02' },
    prevRange: { start: '2026-09-01', end: '2026-09-02' },
    previous: '2026-09',
    partialUntil: '2026-10-02',
  })
  assert.deepEqual(reportRanges('2026-03', new Date(2026, 2, 31)).prevRange, { start: '2026-02-01', end: '2026-02-28' })
})
