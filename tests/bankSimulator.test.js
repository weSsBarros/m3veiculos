import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeRates, simulateBanks, simulationText, DEFAULT_TERMS } from '../src/utils/bankSimulator.js'

test('simulador: taxas válidas (vírgula, sem repetir banco, sem taxa absurda)', () => {
  assert.deepEqual(
    normalizeRates([
      { bank: 'Santander', rate: '1,89' },
      { bank: ' BV ', rate: 2.1 },
      { bank: 'Sem taxa', rate: '' },
      { bank: '', rate: '1,5' },
      { bank: 'Absurdo', rate: '45' },
      { bank: 'santander', rate: '1,79' },
    ]),
    [
      { bank: 'santander', rate: 1.79 },
      { bank: 'BV', rate: 2.1 },
    ]
  )
  assert.deepEqual(normalizeRates(null), [])
})

test('simulador: parcela de cada banco em cada prazo, a mais barata primeiro e destacada', () => {
  const r = simulateBanks({
    price: 85000,
    downPayment: 20000,
    terms: [60, 48, 48],
    rates: [{ bank: 'Caro', rate: 2.5 }, { bank: 'Barato', rate: 1.5 }],
  })
  assert.equal(r.financed, 65000)
  assert.deepEqual(r.terms, [48, 60])
  assert.deepEqual(r.rows.map((x) => x.bank), ['Barato', 'Caro'])
  // Tabela Price: 65.000 a 1,5% em 48x
  assert.equal(r.rows[0].installments[48], 1909.37)
  assert.equal(r.best[48], 'Barato')
  assert.equal(r.best[60], 'Barato')
  assert.ok(r.rows[1].installments[60] > r.rows[0].installments[60])
})

test('simulador: sem valor a financiar ou sem prazo, nada para mostrar', () => {
  assert.deepEqual(simulateBanks({ price: 50000, downPayment: 60000, rates: [{ bank: 'X', rate: 2 }] }).rows, [])
  assert.deepEqual(simulateBanks({ price: 50000, terms: [], rates: [{ bank: 'X', rate: 2 }] }).rows, [])
  assert.deepEqual(simulateBanks({ price: 50000 }).terms, DEFAULT_TERMS)
})

test('simulador: mensagem para o cliente', () => {
  const result = simulateBanks({ price: 85000, downPayment: 20000, terms: [48], rates: [{ bank: 'Barato', rate: 1.5 }] })
  const text = simulationText({ customerName: 'Carla Souza', vehicle: 'Fiat Argo Drive 2022', price: 85000, downPayment: 20000, result, storeName: 'Loja Teste' })
  const lines = text.split('\n')
  assert.equal(lines[0], 'Olá, Carla! Segue a simulação de financiamento do Fiat Argo Drive 2022:')
  assert.match(lines[1], /^Valor: R\$\s85\.000,00 · Entrada: R\$\s20\.000,00 · Financiado: R\$\s65\.000,00$/)
  assert.match(lines[3], /^Barato \(1,5% a\.m\.\): 48x R\$\s1.909,37$/)
  assert.equal(lines.at(-1), 'Loja Teste')
  assert.match(simulationText({ price: 1, result }), /^Olá! Segue a simulação de financiamento:/)
})
