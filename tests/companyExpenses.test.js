import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  companyExpenseStatus,
  matchesCompanyExpenseFilter,
  companyExpenseTotals,
  companyExpensesByCategory,
  companyExpensePendency,
  dueDateInMonth,
  monthsToGenerate,
  nextRecurrenceDue,
  matchesCompanyExpenseSearch,
} from '../src/utils/companyExpenses.js'

const today = '2026-10-07'
const e = (dueOn, amount, extra = {}) => ({ category: 'outros', description: '', amount, dueOn, paidOn: null, notes: '', ...extra })

test('despesas da empresa: situação pelo vencimento (aviso 3 dias antes)', () => {
  assert.equal(companyExpenseStatus(e('2026-10-01', 10, { paidOn: '2026-10-01' }), today), 'paga')
  assert.equal(companyExpenseStatus(e('2026-10-06', 10), today), 'atrasada')
  assert.equal(companyExpenseStatus(e('2026-10-07', 10), today), 'vence_hoje')
  assert.equal(companyExpenseStatus(e('2026-10-10', 10), today), 'vence_em_breve')
  assert.equal(companyExpenseStatus(e('2026-10-11', 10), today), 'a_pagar')
  // Paga continua paga, mesmo paga depois do vencimento
  assert.equal(companyExpenseStatus(e('2026-09-01', 10, { paidOn: '2026-10-05' }), today), 'paga')
})

test('despesas da empresa: filtros, totais, categorias e pendência do início', () => {
  const list = [
    e('2026-10-10', 3500, { category: 'aluguel' }), // vence em breve
    e('2026-10-05', 289.9, { category: 'energia' }), // atrasada
    e('2026-10-02', 120.35, { category: 'agua', paidOn: '2026-10-02' }), // paga
    e('2026-10-20', 149.9, { category: 'internet' }), // a pagar
  ]
  const filtered = (filter) => list.filter((x) => matchesCompanyExpenseFilter(x, filter, today)).map((x) => x.category)
  assert.deepEqual(filtered('a_pagar'), ['aluguel', 'internet'])
  assert.deepEqual(filtered('atrasadas'), ['energia'])
  assert.deepEqual(filtered('pagas'), ['agua'])
  assert.equal(filtered('todas').length, 4)

  const totals = companyExpenseTotals(list, today)
  assert.equal(totals.total, 4060.15)
  assert.equal(totals.paid, 120.35)
  assert.equal(totals.open, 3939.8)
  assert.equal(totals.overdue, 289.9)
  assert.equal(totals.overdueCount, 1)
  assert.equal(totals.count, 4)

  const byCategory = companyExpensesByCategory(list)
  assert.equal(byCategory[0].slug, 'aluguel')
  assert.equal(byCategory[0].label, 'Aluguel')
  assert.equal(byCategory.at(-1).slug, 'agua')

  // A atrasada e a que vence em até 3 dias (a do dia 20 ainda não)
  assert.deepEqual(companyExpensePendency(list, today), { count: 2, overdue: 1, total: 3789.9 })
})

test('despesas da empresa: vencimento no mês e meses que a repetição cria', () => {
  assert.equal(dueDateInMonth('2026-10-01', 10), '2026-10-10')
  // 29 a 31: o último dia nos meses mais curtos
  assert.equal(dueDateInMonth('2026-02-01', 31), '2026-02-28')
  assert.equal(dueDateInMonth('2028-02-01', 30), '2028-02-29')
  assert.equal(dueDateInMonth('2026-11-01', 31), '2026-11-30')

  const rec = { active: true, day: 31, lastGeneratedMonth: '2026-07-01' }
  assert.deepEqual(monthsToGenerate(rec, today), ['2026-08-01', '2026-09-01', '2026-10-01'])
  // Já criou o mês de hoje, ou parou de repetir: nada a criar
  assert.deepEqual(monthsToGenerate({ ...rec, lastGeneratedMonth: '2026-10-01' }, today), [])
  assert.deepEqual(monthsToGenerate({ ...rec, active: false }, today), [])
  // Virada do ano
  assert.deepEqual(monthsToGenerate({ ...rec, lastGeneratedMonth: '2025-11-01' }, '2026-02-15'), ['2025-12-01', '2026-01-01', '2026-02-01'])

  assert.equal(nextRecurrenceDue(rec), '2026-08-31')
  assert.equal(nextRecurrenceDue({ ...rec, lastGeneratedMonth: '2026-10-01' }), '2026-11-30')
  assert.equal(nextRecurrenceDue({ ...rec, lastGeneratedMonth: '2026-12-01', day: 5 }), '2027-01-05')
})

test('despesas da empresa: busca por descrição, categoria, fornecedor, observação e valor', () => {
  const x = e('2026-10-10', 3500, { category: 'aluguel', description: 'Galpão da avenida', notes: 'contrato até 2027' })
  assert.equal(matchesCompanyExpenseSearch(x, ''), true)
  assert.equal(matchesCompanyExpenseSearch(x, 'galpão'), true)
  assert.equal(matchesCompanyExpenseSearch(x, 'ALUGUEL'), true)
  assert.equal(matchesCompanyExpenseSearch(x, 'imobiliária', 'Imobiliária Central'), true)
  assert.equal(matchesCompanyExpenseSearch(x, '2027'), true)
  assert.equal(matchesCompanyExpenseSearch(x, '3500'), true)
  assert.equal(matchesCompanyExpenseSearch(x, '3.500,00'), true)
  assert.equal(matchesCompanyExpenseSearch(e('2026-10-05', 289.9), '289,90'), true)
  assert.equal(matchesCompanyExpenseSearch(x, 'energia'), false)
  assert.equal(matchesCompanyExpenseSearch(x, '120'), false)
})
