import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  periodRange,
  periodOptions,
  financeSummary,
  clientRanking,
  forecast,
  averageMonthlyCost,
  receivables,
  addMonths,
  categoryLabel,
} from '../src/utils/finance.js'

// Hoje: 15/10/2026
const today = new Date(2026, 9, 15)

const clients = [
  {
    companyId: 'a', slug: 'loja-a', name: 'Loja A',
    account: { billingStart: '2026-08-01' },
    billing: { situation: 'em_dia', price: 150, open: [], open_total: 0, next: { month: '2026-11-01', due: '2026-11-07', amount: 150 } },
  },
  {
    companyId: 'b', slug: 'loja-b', name: 'Loja B',
    account: { billingStart: '2026-09-01' },
    billing: { situation: 'atrasado', price: 200, open: [{ month: '2026-09-01' }], open_total: 200, next: { month: '2026-10-01', due: '2026-10-20', amount: 200 } },
  },
  { companyId: 'c', slug: 'loja-c', name: 'Loja C', account: { billingStart: null }, billing: { situation: 'sem_cobranca' } },
  {
    companyId: 'd', slug: 'loja-d', name: 'Loja D',
    account: { billingStart: '2026-10-01' },
    billing: { situation: 'vence_em_breve', price: 100, open: [], open_total: 0, next: { month: '2026-10-01', due: '2026-10-18', amount: 100 } },
  },
]

const payments = [
  { companyId: 'a', referenceMonth: '2026-08-01', amount: 150, paidOn: '2026-08-07', method: 'Pix' },
  { companyId: 'a', referenceMonth: '2026-09-01', amount: 150, paidOn: '2026-09-08', method: 'Pix' },
  { companyId: 'a', referenceMonth: '2026-10-01', amount: 150, paidOn: '2026-10-05', method: 'Dinheiro' },
]

const expenses = [
  { spentOn: '2026-09-10', category: 'hospedagem', amount: 60, companyId: null },
  { spentOn: '2026-10-02', category: 'dominios', amount: 40, companyId: 'a' },
]

test('períodos: este ano, 12 meses, desde o início e ano fechado', () => {
  const ano = periodRange('ano', today)
  assert.equal(ano.start, '2026-01')
  assert.equal(ano.end, '2026-12')
  assert.equal(ano.months.length, 12)
  assert.equal(ano.elapsed.length, 10)
  const doze = periodRange('12m', today)
  assert.deepEqual([doze.start, doze.end, doze.months.length], ['2025-11', '2026-10', 12])
  const tudo = periodRange('tudo', today, '2026-08')
  assert.deepEqual(tudo.months, ['2026-08', '2026-09', '2026-10'])
  assert.deepEqual([periodRange('2025', today).start, periodRange('2025', today).elapsed.length], ['2025-01', 12])
  assert.deepEqual(periodOptions('2024-05', today).map((o) => o.value), ['ano', '12m', 'tudo', '2025', '2024'])
  assert.equal(addMonths('2026-12', 1), '2027-01')
  assert.equal(addMonths('2026-01', -1), '2025-12')
})

test('a receber: atrasado + o que vence ainda neste mês', () => {
  assert.deepEqual(receivables(clients, today), { overdue: 200, dueThisMonth: 300, total: 500, lateCount: 1 })
})

test('resumo do ano: recebido, despesas, lucro, média e previsto', () => {
  const s = financeSummary({ clients, payments, expenses, period: periodRange('ano', today), today })
  assert.equal(s.received, 450)
  assert.equal(s.firstMonth, '2026-08')
  assert.equal(s.costs, 100)
  assert.equal(s.profit, 350)
  assert.equal(s.margin, 78)
  // média só dos meses completos desde o primeiro movimento (agosto e setembro)
  assert.equal(s.avgMonthly, 150)
  assert.equal(s.avgMonthsCount, 2)
  assert.equal(s.avgIsPartial, false)
  assert.equal(s.mrr, 450)
  assert.equal(s.arr, 5400)
  assert.equal(s.ticket, 150)
  assert.equal(s.clientsCharged, 3)
  assert.equal(s.receivable.total, 500)
  const out = s.byMonth.find((m) => m.month === '2026-10')
  assert.deepEqual(out, { month: '2026-10', expected: 450, received: 150, expenses: 40, result: 110 })
  assert.equal(s.byMonth.find((m) => m.month === '2026-08').expected, 150)
  assert.equal(s.byMonth.find((m) => m.month === '2026-09').expected, 350)
  assert.deepEqual(s.byMonth.find((m) => m.month === '2026-11'), { month: '2026-11', expected: 450, received: null, expenses: null, result: null })
  assert.equal(s.best.received, 150)
  assert.deepEqual([s.growth.month, s.growth.previous, s.growth.pct], ['2026-09', '2026-08', 0])
  assert.deepEqual(s.byMethod.map((m) => [m.label, m.value, m.pct]), [['Pix', 300, 67], ['Dinheiro', 150, 33]])
  assert.deepEqual(s.byCategory.map((c) => [c.label, c.value, c.pct]), [['Hospedagem e servidores', 60, 60], ['Domínios', 40, 40]])
})

test('resumo: período sem movimento e mês atual sozinho', () => {
  const vazio = financeSummary({ clients, payments, expenses, period: periodRange('2025', today), today })
  assert.deepEqual([vazio.received, vazio.costs, vazio.profit, vazio.margin, vazio.best], [0, 0, 0, null, null])
  const novo = financeSummary({ clients: [], payments: [payments[2]], expenses: [], period: periodRange('ano', today), today })
  assert.equal(novo.avgMonthly, 150)
  assert.equal(novo.avgIsPartial, true)
})

test('ranking por cliente: total pago, em aberto, tempo de cliente e o que sobra', () => {
  const r = clientRanking({ clients, payments, expenses, today })
  assert.deepEqual(r.map((c) => c.name), ['Loja A', 'Loja B', 'Loja D', 'Loja C'])
  const a = r[0]
  assert.deepEqual(
    [a.totalPaid, a.monthsPaid, a.costs, a.net, a.since, a.monthsAsClient, a.avgMonthly, a.lastPaidOn],
    [450, 3, 40, 410, '2026-08', 3, 150, '2026-10-05']
  )
  assert.deepEqual([r[1].openTotal, r[1].since, r[1].monthsAsClient], [200, '2026-09', 2])
  assert.deepEqual([r[3].since, r[3].monthsAsClient, r[3].price], [null, 0, 0])
})

test('previsão: mensalidades de hoje menos a despesa média', () => {
  assert.equal(averageMonthlyCost(expenses, today), 60)
  assert.equal(averageMonthlyCost([], today), 0)
  const [tres] = forecast({ clients, expenses, today, horizons: [3] })
  assert.deepEqual(tres, { months: 3, from: '2026-11', to: '2027-01', revenue: 1350, costs: 180, profit: 1170 })
  assert.equal(categoryLabel('xyz'), 'Outros')
})
