import { test } from 'node:test'
import assert from 'node:assert/strict'
import { finalSalePrice, priceBeforeDiscount, discountPercent, percentText, discountToCloseGap, discountError } from '../src/utils/saleDiscount.js'
import { buildDiscountReport } from '../src/utils/reports/build.js'

test('desconto: valor final, valor antes e %', () => {
  assert.equal(finalSalePrice(95000, 2000), 93000)
  assert.equal(finalSalePrice(95000, 0), 95000)
  assert.equal(finalSalePrice(95000, ''), 95000)
  assert.equal(priceBeforeDiscount({ salePrice: 93000, discount: 2000 }), 95000)
  // Venda antiga, sem a coluna
  assert.equal(priceBeforeDiscount({ salePrice: 93000 }), 93000)
  assert.equal(discountPercent(95000, 2000), 2.1)
  assert.equal(discountPercent(0, 2000), 0)
  assert.equal(percentText(2.1), '2,1%')
})

test('desconto: fechar com o que foi pago arredonda para cima', () => {
  assert.equal(discountToCloseGap(2000), 2000)
  // Pagamentos com centavos: o valor final fica coberto
  assert.equal(discountToCloseGap(1999.5), 2000)
  assert.equal(discountToCloseGap(0), 0)
  assert.equal(discountToCloseGap(-300), 0)
  assert.equal(discountToCloseGap(null), 0)
})

test('desconto: não pode ser igual ou maior que o valor da venda', () => {
  assert.equal(discountError(95000, 2000), '')
  assert.equal(discountError(95000, 0), '')
  assert.match(discountError(95000, 95000), /não pode/)
  assert.match(discountError(95000, 100000), /não pode/)
})

test('relatório de descontos: vendas do período com desconto e resumo por vendedor', () => {
  const cars = [
    { id: 'c1', brand: 'Fiat', model: 'Argo', version: 'Drive', plate: 'abc1d23', customerId: 'k1' },
    { id: 'c2', brand: 'VW', model: 'Gol', version: '', plate: '' },
    { id: 'c3', brand: 'Honda', model: 'Civic', version: 'EXL', plate: '' },
  ]
  const sellers = [{ id: 's1', name: 'Ana' }, { id: 's2', name: 'Bruno' }]
  const customers = [{ id: 'k1', name: 'Carla' }]
  const sales = [
    { carId: 'c1', sellerId: 's1', saleDate: '2026-10-05', salePrice: 93000, discount: 2000, discountByName: 'Ana' },
    { carId: 'c2', sellerId: 's1', saleDate: '2026-10-10', salePrice: 40000, discount: 0 },
    { carId: 'c3', sellerId: 's2', saleDate: '2026-10-12', salePrice: 99000, discount: 1000, discountByName: 'admin@loja.com' },
    // Fora do período
    { carId: 'c2', sellerId: 's2', saleDate: '2026-09-30', salePrice: 50000, discount: 5000 },
  ]
  const report = buildDiscountReport({ sales, cars, sellers, customers, range: { start: '2026-10-01', end: '2026-10-31' } })
  const [list, summary] = report.sections
  assert.equal(list.rows.length, 2)
  assert.deepEqual(list.rows[0], {
    date: '2026-10-05',
    car: 'Fiat Argo Drive',
    plate: 'ABC1D23',
    customer: 'Carla',
    seller: 'Ana',
    givenBy: 'Ana',
    before: 95000,
    discount: 2000,
    pct: '2,1%',
    final: 93000,
  })
  assert.equal(list.totals.discount, 3000)
  assert.equal(list.totals.before, 195000)
  assert.equal(list.totals.pct, '1,5%')
  // Ana: 2 vendas, 1 com desconto; Bruno: 1 venda com desconto
  const ana = summary.rows.find((r) => r.seller === 'Ana')
  assert.deepEqual([ana.count, ana.withDiscount, ana.discount, ana.avg], [2, 1, 2000, '2,1%'])
  assert.equal(summary.totals.count, 3)
  assert.equal(summary.totals.withDiscount, 2)
})
