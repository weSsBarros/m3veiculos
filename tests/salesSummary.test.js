import { test } from 'node:test'
import assert from 'node:assert/strict'
import { saleCost, salesSummary, saleAgeLabel } from '../src/utils/salesSummary.js'

test('vendas: custo total e margem de cada carro vendido', () => {
  assert.deepEqual(saleCost({ purchasePrice: 50000 }, 3000, 60000), { totalCost: 53000, margin: 7000 })
  // Prejuízo aparece negativo
  assert.deepEqual(saleCost({ purchasePrice: 50000 }, 12000, 60000), { totalCost: 62000, margin: -2000 })
  // Sem "Preço de compra": custo só dos gastos e sem margem
  assert.deepEqual(saleCost({ purchasePrice: null }, 3000, 60000), { totalCost: 3000, margin: null })
  // Sem valor de venda: sem margem
  assert.deepEqual(saleCost({ purchasePrice: 50000 }, 0, null), { totalCost: 50000, margin: null })
  // Cadeado de outro sócio: nada de custo nem margem
  assert.deepEqual(saleCost({ purchasePrice: 50000, valuesHidden: true }, 3000, 60000), { totalCost: null, margin: null })
})

test('vendas: totais do período (quantidade, faturamento, ticket médio e lucro)', () => {
  const rows = [
    { car: { purchasePrice: 50000 }, price: 60000, margin: 7000 },
    { car: { purchasePrice: 80000 }, price: 95000, margin: -1000 },
    // Sem preço de compra: entra no faturamento, fica fora do lucro
    { car: { purchasePrice: null }, price: 40001, margin: null },
    // Cadeado de outro sócio: só na quantidade
    { car: { valuesHidden: true }, price: 70000, margin: null },
  ]
  assert.deepEqual(salesSummary(rows), {
    count: 4,
    hidden: 1,
    revenue: 195001,
    pricedCount: 3,
    avgTicket: 65000,
    profit: 6000,
    marginCount: 2,
    missingCost: 1,
  })
})

test('vendas: período sem venda não quebra', () => {
  assert.deepEqual(salesSummary([]), {
    count: 0,
    hidden: 0,
    revenue: 0,
    pricedCount: 0,
    avgTicket: null,
    profit: 0,
    marginCount: 0,
    missingCost: 0,
  })
})

test('vendas: há quantos dias o carro foi vendido', () => {
  const hoje = new Date(2026, 9, 14, 21, 30)
  assert.equal(saleAgeLabel('2026-10-14', hoje), 'Hoje')
  assert.equal(saleAgeLabel('2026-10-13', hoje), '1 dia')
  assert.equal(saleAgeLabel('2026-09-29', hoje), '15 dias')
  // Virada de ano e horário de verão não mudam a conta
  assert.equal(saleAgeLabel('2025-10-14', hoje), '365 dias')
  assert.equal(saleAgeLabel('2023-01-01', hoje), '1.382 dias')
  // Data no futuro ou vazia: nada
  assert.equal(saleAgeLabel('2026-10-20', hoje), '')
  assert.equal(saleAgeLabel(null, hoje), '')
})
