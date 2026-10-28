import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bankIncomeForm, bankIncomeFromForm, resolveBankAmount, bankIncomeInRange, saleBankFinanced } from '../src/utils/bankIncome.js'
import { storeResult } from '../src/utils/storeResult.js'

const OCT = { start: '2026-10-01', end: '2026-10-31' }

test('retorno e plus: em % do financiado ou em R$', () => {
  assert.deepEqual(resolveBankAmount('percent', '2,5', 60000), { amount: 1500, percent: 2.5, error: '' })
  assert.deepEqual(resolveBankAmount('valor', '300,00', 60000), { amount: 300, percent: null, error: '' })
  assert.deepEqual(resolveBankAmount('valor', '', 60000), { amount: null, percent: null, error: '' })
  assert.match(resolveBankAmount('percent', '2', 0).error, /valor financiado/)
  assert.match(resolveBankAmount('percent', '120', 60000).error, /de 0 a 100/)
})

test('retorno e plus: da tela para o banco e de volta', () => {
  const form = { returnMode: 'percent', returnInput: '2', rateTable: ' r4 ', plusMode: 'valor', plusInput: '300,00', plusReceivedOn: '2026-11-05' }
  const { value, error } = bankIncomeFromForm(form, 50000)
  assert.equal(error, '')
  assert.deepEqual(value, { storeReturn: 1000, returnPercent: 2, rateTable: 'R4', storePlus: 300, plusPercent: null, plusReceivedOn: '2026-11-05' })
  const back = bankIncomeForm(value)
  assert.equal(back.returnMode, 'percent')
  assert.equal(back.returnInput, '2')
  assert.equal(back.plusMode, 'valor')
  assert.equal(back.plusInput, '300,00')
  // Sem plus, a data de recebimento não fica
  assert.equal(bankIncomeFromForm({ ...form, plusInput: '' }, 50000).value.plusReceivedOn, null)
  assert.match(bankIncomeFromForm({ ...form, returnInput: 'abc' }, 50000).error, /^Retorno:/)
  // Venda nova: o retorno começa em % e o plus em R$
  assert.equal(bankIncomeForm(null).returnMode, 'percent')
  assert.equal(bankIncomeForm(null).plusMode, 'valor')
})

test('retorno e plus: financiado no banco sai das partes "Financiamento bancário" da venda', () => {
  assert.equal(saleBankFinanced({ payments: [{ method: 'a_vista', amount: 20000 }, { method: 'financiamento', amount: 40000 }] }), 40000)
  assert.equal(saleBankFinanced({ payments: [], financedAmount: 35000 }), 35000)
})

test('retorno e plus no período: retorno pela data da venda (ou do externo pago), plus pela data recebida', () => {
  const soldEntries = [
    { car: { brand: 'Fiat', model: 'Toro' }, date: '2026-10-10', sale: { bank: 'BV', storeReturn: 1500, storePlus: 300, plusReceivedOn: '2026-11-02' } },
    { car: { brand: 'VW', model: 'Gol' }, date: '2026-10-20', sale: { storeReturn: 800, storePlus: 200, plusReceivedOn: null } },
    { car: { brand: 'Jeep', model: 'Compass', valuesHidden: true }, date: '2026-10-15', sale: { storeReturn: 5000 } },
    { car: { brand: 'Honda', model: 'Civic' }, date: '2026-09-28', sale: { storeReturn: 900, storePlus: 250, plusReceivedOn: '2026-10-05' } },
  ]
  const externalFinancings = [
    { customerName: 'Ana', status: 'pago', paidOn: '2026-10-12', storeReturn: 700, storePlus: 150, plusReceivedOn: '2026-10-30' },
    { customerName: 'Beto', status: 'aprovado', paidOn: null, storeReturn: 999 },
    { customerName: 'Caio', status: 'cancelado', paidOn: '2026-10-01', storeReturn: 999, storePlus: 99, plusReceivedOn: '2026-10-02' },
  ]
  const r = bankIncomeInRange({ soldEntries, externalFinancings, range: OCT })
  // Retornos: Toro 1500 + Gol 800 + Ana 700; plus: Civic 250 (recebido em outubro) + Ana 150
  assert.equal(r.returns, 3000)
  assert.equal(r.plus, 400)
  assert.equal(r.total, 3400)
  // A receber: só o do Gol (o da Toro já tem data, em novembro)
  assert.equal(r.plusOpen, 200)
  assert.deepEqual(r.items.map((i) => i.kind + ':' + i.amount), ['plus:250', 'retorno:1500', 'retorno:700', 'retorno:800', 'plus:150'])
})

test('lucro líquido: soma retorno e plus e desconta a comissão de financiamento externo paga no período', () => {
  const soldEntries = [
    { car: { id: 'c1', purchasePrice: 50000 }, price: 60000, date: '2026-10-10', sale: { storeReturn: 1200, storePlus: 300, plusReceivedOn: '2026-10-20', commissionAmount: 600, commissionPaidOn: '2026-10-25' } },
  ]
  const externalFinancings = [
    { customerName: 'Ana', status: 'pago', paidOn: '2026-10-12', storeReturn: 700, commissionAmount: 100, commissionPaidOn: '2026-10-15' },
  ]
  const r = storeResult({ soldEntries, externalFinancings, range: OCT })
  assert.equal(r.grossMargin, 10000)
  assert.equal(r.bankIncome.total, 2200)
  assert.equal(r.saleCommissions, 600)
  assert.equal(r.extCommissions, 100)
  assert.equal(r.commissions, 700)
  assert.equal(r.net, 10000 + 2200 - 700)
  // Sem financiamentos externos e sem retorno, o resultado fica como antes
  const before = storeResult({ soldEntries: [{ ...soldEntries[0], sale: { commissionAmount: 600, commissionPaidOn: '2026-10-25' } }], range: OCT })
  assert.equal(before.net, 10000 - 600)
})
