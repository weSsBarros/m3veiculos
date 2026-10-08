import { test } from 'node:test'
import assert from 'node:assert/strict'
import { storeResult, monthRange } from '../src/utils/storeResult.js'
import { buildResultReport } from '../src/utils/reports/build.js'

const range = { start: '2026-10-01', end: '2026-10-31' }
const car = (id, purchasePrice) => ({ id, brand: 'Toyota', model: 'Corolla', version: 'XEi', year: 2021, purchasePrice, plate: 'abc1d23' })
const sale = (commissionAmount, commissionPaidOn = null) => ({ sellerId: 's1', commissionAmount, commissionPaidOn })
const soldEntries = [
  { car: car('c1', 100000), sale: sale(1200, '2026-10-05'), price: 120000, date: '2026-10-03' },
  // Vendido em outubro, comissão ainda não paga: não entra no lucro de outubro
  { car: car('c2', 50000), sale: sale(600), price: 58000, date: '2026-10-20' },
  // Vendido em setembro, comissão paga em outubro: entra em outubro
  { car: car('c3', 70000), sale: sale(800, '2026-10-02'), price: 80000, date: '2026-09-28' },
  // Vendido em outubro, comissão paga em novembro: fica para novembro
  { car: car('c4', 30000), sale: sale(400, '2026-11-03'), price: 35000, date: '2026-10-30' },
]
const carExpenses = [
  { carId: 'c1', amount: 1500 },
  { carId: 'c1', amount: 500 },
  { carId: 'c3', amount: 999 },
]
const companyExpenses = [
  { category: 'aluguel', description: 'Aluguel', amount: 3500, dueOn: '2026-10-10', paidOn: '2026-10-09' },
  { category: 'energia', description: 'Energia', amount: 289.9, dueOn: '2026-10-15', paidOn: null },
  { category: 'aluguel', description: 'Aluguel', amount: 3500, dueOn: '2026-09-10', paidOn: '2026-09-10' },
]

test('lucro líquido: vendas − custo dos carros − comissões pagas no período − despesas da empresa', () => {
  const r = storeResult({ soldEntries, carExpenses, companyExpenses, range })
  assert.equal(r.soldCount, 3)
  assert.equal(r.revenue, 213000)
  // 100.000 + 2.000 de gastos do carro + 50.000 + 30.000
  assert.equal(r.carsCost, 182000)
  assert.equal(r.grossMargin, 31000)
  // Pela data do pagamento: a do c1 e a do c3 (vendido em setembro); a do c2 está a pagar e a do c4 saiu em novembro
  assert.equal(r.commissions, 2000)
  assert.deepEqual(r.paidCommissions.map((e) => e.car.id), ['c3', 'c1'])
  assert.equal(r.commissionsOpen, 600)
  // Despesas pelo vencimento: as duas de outubro, paga ou não
  assert.equal(r.companyExpenses, 3789.9)
  assert.equal(r.companyPaid, 3500)
  assert.equal(r.companyOpen, 289.9)
  assert.equal(r.net, 25210.1)
  assert.deepEqual(r.sold.map((e) => e.car.id), ['c1', 'c2', 'c4'])
  assert.equal(r.sold[0].margin, 18000)
  assert.deepEqual(r.bills.map((e) => e.dueOn), ['2026-10-10', '2026-10-15'])
  // Novembro: a comissão do c4 entra lá
  assert.equal(storeResult({ soldEntries, range: monthRange('2026-11') }).commissions, 400)
})

test('lucro líquido: sem vendas e sem despesas fica zero; intervalo do mês', () => {
  const r = storeResult({ range })
  assert.equal(r.net, 0)
  assert.equal(r.soldCount, 0)
  assert.equal(r.commissionsOpen, 0)
  assert.deepEqual(monthRange('2026-02'), { start: '2026-02-01', end: '2026-02-28' })
  assert.deepEqual(monthRange('2028-02'), { start: '2028-02-01', end: '2028-02-29' })
  assert.deepEqual(monthRange('2026-12'), { start: '2026-12-01', end: '2026-12-31' })
})

test('relatório do resultado: resumo com os sinais, vendidos, comissões pagas e despesas', () => {
  const sellers = [{ id: 's1', name: 'Ana Lima' }]
  const report = buildResultReport({ soldEntries, carExpenses, companyExpenses, sellers, range, categoryLabel: (c) => c.toUpperCase() })
  const [summary, sold, commissions, bills] = report.sections
  assert.equal(report.subtitle, 'Período: 01/10/2026 a 31/10/2026')
  assert.equal(summary.rows.at(-1).item, 'Lucro líquido')
  assert.equal(summary.rows.at(-1).value, 25210.1)
  assert.equal(summary.rows[1].value, -182000)
  assert.equal(summary.rows[3].item, 'Comissões pagas no período (2 comissões)')
  assert.equal(summary.rows[3].value, -2000)
  assert.equal(sold.rows.length, 3)
  assert.equal(sold.rows[0].plate, 'ABC1D23')
  assert.equal(sold.columns.some((c) => c.key === 'commission'), false)
  assert.deepEqual(
    commissions.rows.map((c) => [c.paidOn, c.seller, c.soldOn, c.amount]),
    [
      ['2026-10-02', 'Ana Lima', '2026-09-28', 800],
      ['2026-10-05', 'Ana Lima', '2026-10-03', 1200],
    ]
  )
  assert.deepEqual(bills.rows.map((b) => b.paid), ['09/10/2026', 'A pagar'])
  assert.equal(bills.rows[0].category, 'ALUGUEL')
})
