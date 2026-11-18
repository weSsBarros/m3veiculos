import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  storeFinancingPart,
  saleHasStoreFinancing,
  storeFinancingSalePayment,
  financingDraftFromCar,
  salesMissingFinancing,
  storeFinancingDefaults,
  storeFinancingValues,
  storeFinancingProblem,
} from '../src/utils/storeFinancing.js'

const part = (method, amount, installments = null) => ({ method, amount, bank: '', installments, note: '' })

test('venda parcelada: reconhece a venda com financiamento da loja (partes e forma antiga)', () => {
  assert.equal(saleHasStoreFinancing({ payments: [part('a_vista', 20000), part('financiamento_proprio', 120000, 10)] }), true)
  assert.equal(saleHasStoreFinancing({ payments: [part('financiamento', 50000, 48)] }), false)
  assert.equal(saleHasStoreFinancing({ payments: [], paymentMethod: 'financiamento_proprio' }), true)
  assert.equal(saleHasStoreFinancing({ payments: [], paymentMethod: 'a_vista' }), false)
  assert.equal(saleHasStoreFinancing(null), false)
  assert.deepEqual(storeFinancingPart([part('pix', 1), part('financiamento_proprio', 2, 3)]), part('financiamento_proprio', 2, 3))
})

test('venda parcelada: pagamento da venda registrada pelo Novo financiamento', () => {
  const withDown = storeFinancingSalePayment({ downPayment: 20000, financedAmount: 120000, installments: 10 })
  assert.deepEqual(withDown.parts, [part('a_vista', 20000), part('financiamento_proprio', 120000, 10)])
  assert.equal(withDown.method, 'misto')
  assert.equal(withDown.downPayment, 20000)

  const noDown = storeFinancingSalePayment({ downPayment: 0, financedAmount: 140000, installments: 10 })
  assert.deepEqual(noDown.parts, [part('financiamento_proprio', 140000, 10)])
  assert.equal(noDown.method, 'financiamento_proprio')
})

test('venda parcelada: o Novo financiamento começa com os dados do carro e da venda', () => {
  const stock = { id: 'c1', brand: 'Iveco', model: 'Daily', version: '35-150', plate: 'abc1d23', price: 145000, status: 'disponivel', customerId: 'dono' }
  assert.deepEqual(financingDraftFromCar(stock), {
    carId: 'c1',
    vehicleLabel: 'Iveco Daily 35-150',
    vehiclePlate: 'ABC1D23',
    vehiclePrice: 145000,
    customerId: '',
    downPayment: null,
    installmentsCount: null,
  })
  const sold = { ...stock, status: 'vendido', customerId: 'cli' }
  const sale = { salePrice: 140000, payments: [part('pix', 20000), part('financiamento_proprio', 120000, 10)] }
  const draft = financingDraftFromCar(sold, sale)
  assert.equal(draft.vehiclePrice, 140000)
  assert.equal(draft.customerId, 'cli')
  assert.equal(draft.downPayment, 20000)
  assert.equal(draft.installmentsCount, 10)
  // Sem a parte da loja: só o valor da venda
  assert.equal(financingDraftFromCar(sold, { salePrice: 90000, payments: [part('a_vista', 90000)] }).downPayment, null)
  assert.equal(financingDraftFromCar(null), null)
})

test('venda parcelada: vendas com financiamento da loja ainda sem parcelas', () => {
  const cars = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const sales = [
    { id: 's1', carId: 'a', saleDate: '2026-11-01', payments: [part('financiamento_proprio', 1000, 10)] },
    { id: 's2', carId: 'b', saleDate: '2026-11-10', payments: [], paymentMethod: 'financiamento_proprio' },
    { id: 's3', carId: 'c', saleDate: '2026-11-12', payments: [part('a_vista', 1000)] },
    { id: 's4', carId: 'zz', saleDate: '2026-11-13', payments: [part('financiamento_proprio', 1, 1)] },
  ]
  const list = salesMissingFinancing(sales, cars, [{ carId: null }])
  assert.deepEqual(list.map((r) => r.sale.id), ['s2', 's1'])
  // Carro com financiamento (até cancelado) sai da lista
  assert.deepEqual(salesMissingFinancing(sales, cars, [{ carId: 'b', status: 'cancelado' }]).map((r) => r.sale.id), ['s1'])
})

test('venda parcelada: parcelas geradas na janela da venda', () => {
  const form = storeFinancingDefaults('2026-11-17')
  assert.equal(form.firstDue, '2026-12-17')
  assert.equal(form.enabled, true)
  const p = part('financiamento_proprio', 140000, 10)
  assert.deepEqual(storeFinancingValues(form, p), { financed: 140000, count: 10, rate: null, installment: 14000, suggested: 14000 })
  // Com juros, Tabela Price; valor digitado vale no lugar do calculado
  assert.equal(storeFinancingValues({ ...form, rate: '2' }, part('financiamento_proprio', 10000, 12)).installment, 945.6)
  assert.equal(storeFinancingValues({ ...form, installment: '15.000,00', installmentTouched: true }, p).installment, 15000)

  assert.equal(storeFinancingProblem(form, p, 'cli'), '')
  assert.match(storeFinancingProblem(form, p, ''), /cliente/)
  assert.match(storeFinancingProblem(form, part('financiamento_proprio', null, 10), 'cli'), /valor financiado/)
  assert.match(storeFinancingProblem(form, part('financiamento_proprio', 1000, null), 'cli'), /número de parcelas/)
  assert.match(storeFinancingProblem({ ...form, firstDue: '' }, p, 'cli'), /vencimento/)
  // Desmarcado: não gera nada e não cobra nada
  assert.equal(storeFinancingProblem({ ...form, enabled: false }, part('financiamento_proprio', null, null), ''), '')
})
