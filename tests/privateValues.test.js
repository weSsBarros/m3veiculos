import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withoutPrivate, itemsWithoutPrivate, privateNote, privateLabel, isValuesHidden } from '../src/utils/privateValues.js'
import { storeResult } from '../src/utils/storeResult.js'

const cars = [
  { id: 'a', purchasePrice: 50000 },
  { id: 'b', valuesHidden: true, purchasePrice: null, privateValues: { ownerName: 'Ana', isOwner: false, canSee: false } },
  { id: 'c', purchasePrice: 30000, privateValues: { ownerName: 'Eu', isOwner: true, canSee: true } },
]

test('valores privados: carro trancado por outro sócio sai das contas', () => {
  const r = withoutPrivate(cars)
  assert.deepEqual(r.cars.map((c) => c.id), ['a', 'c'])
  assert.equal(r.hidden, 1)
  assert.equal(isValuesHidden(cars[1]), true)
  assert.equal(isValuesHidden(cars[2]), false)
  assert.deepEqual(withoutPrivate(null), { cars: [], hidden: 0 })
})

test('valores privados: vendas e gastos dos carros trancados saem junto', () => {
  const sales = [{ carId: 'a', salePrice: 60000 }, { carId: 'b', salePrice: 90000 }]
  const r = itemsWithoutPrivate(sales, cars)
  assert.deepEqual(r.items.map((s) => s.carId), ['a'])
  assert.equal(r.hidden, 1)
  assert.equal(itemsWithoutPrivate([{ car_id: 'b' }], cars, 'car_id').hidden, 1)
})

test('valores privados: aviso e etiqueta', () => {
  assert.equal(privateNote(0), '')
  assert.equal(privateNote(1), '1 carro com valores privados fica fora destes números.')
  assert.equal(privateNote(3), '3 carros com valores privados ficam fora destes números.')
  assert.equal(privateLabel(cars[0]), '')
  assert.equal(privateLabel(cars[1]), 'Valores privados de Ana')
  assert.equal(privateLabel(cars[2]), 'Valores privados (seu cadeado)')
  assert.equal(privateLabel({ privateValues: { ownerName: 'Ana', isOwner: false, canSee: true } }), 'Valores privados de Ana (liberado para você)')
})

test('valores privados: o lucro do mês deixa de fora a venda do carro trancado', () => {
  const range = { start: '2026-10-01', end: '2026-10-31' }
  const soldEntries = [
    { car: cars[0], sale: { commissionAmount: 600, commissionPaidOn: '2026-10-10' }, price: 60000, date: '2026-10-05' },
    { car: cars[1], sale: { commissionAmount: 900, commissionPaidOn: '2026-10-12' }, price: 90000, date: '2026-10-08' },
  ]
  const r = storeResult({ soldEntries, carExpenses: [{ carId: 'a', amount: 1000 }], companyExpenses: [], range })
  assert.equal(r.soldCount, 1)
  assert.equal(r.revenue, 60000)
  assert.equal(r.carsCost, 51000)
  assert.equal(r.commissions, 600)
  assert.equal(r.net, 60000 - 51000 - 600)
  assert.equal(r.privateCount, 1)
  // Fora do período não conta no aviso
  assert.equal(storeResult({ soldEntries, range: { start: '2026-11-01', end: '2026-11-30' } }).privateCount, 0)
})
