import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildEntryTypeReport } from '../src/utils/reports/build.js'
import { siteCategories, vehicleCategoryLabel, entryTypeLabel } from '../src/utils/carFormat.js'

const car = (id, entryType, purchasePrice, extra = {}) => ({
  id,
  brand: 'Marca',
  model: 'Modelo',
  entryType,
  purchasePrice,
  price: 100000,
  status: 'vendido',
  createdAt: '2026-09-01T12:00:00Z',
  soldAt: '2026-09-11T12:00:00Z',
  ...extra,
})

test('margem por tipo de entrada: vendidos no período e estoque de agora', () => {
  const cars = [
    car('a', 'showroom', 80000),
    car('b', 'consignado', 90000),
    car('c', 'repasse', 70000),
    car('d', 'consignado', 50000, { status: 'disponivel', soldAt: null, price: 60000 }),
    car('e', undefined, 40000, { status: 'disponivel', soldAt: null, price: 55000 }),
  ]
  const sales = [
    { carId: 'a', salePrice: 100000, saleDate: '2026-09-11' },
    { carId: 'b', salePrice: 100000, saleDate: '2026-09-11' },
    { carId: 'c', salePrice: 75000, saleDate: '2026-08-01' },
  ]
  const expenses = [{ carId: 'a', amount: 5000 }, { carId: 'e', amount: 1000 }]
  const report = buildEntryTypeReport({ sales, cars, expenses, range: { start: '2026-09-01', end: '2026-09-30' } })
  const [sold, stock] = report.sections
  assert.deepEqual(sold.rows.map((r) => [r.type, r.count, r.margin, r.marginPct]), [
    ['Showroom', 1, 15000, '15,0%'],
    ['Consignado', 1, 10000, '10,0%'],
    ['Repasse', 0, null, ''],
  ])
  assert.equal(sold.rows[0].avgDays, 10)
  assert.equal(sold.totals.margin, 25000)
  // Consignado não conta como dinheiro da loja parado; carro sem tipo é showroom
  assert.deepEqual(stock.rows.map((r) => [r.type, r.count, r.invested]), [
    ['Showroom', 1, 41000],
    ['Consignado', 1, 0],
    ['Repasse', 0, 0],
  ])
})

test('moto: categoria do painel e só aparece no site quando a loja tem moto', () => {
  assert.equal(vehicleCategoryLabel('moto'), 'Moto')
  assert.equal(siteCategories([{ category: 'hatch' }]).some((c) => c.slug === 'moto'), false)
  assert.equal(siteCategories([{ category: 'moto' }]).some((c) => c.slug === 'moto'), true)
  assert.equal(entryTypeLabel(undefined), 'Showroom')
  assert.equal(entryTypeLabel('repasse'), 'Repasse')
})
