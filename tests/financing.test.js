import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  priceInstallment,
  parseMoneyBR,
  formatMoneyInput,
  parsePercentBR,
  lateCharges,
  installmentStatus,
  summarizeFinancing,
} from '../src/utils/financing.js'

test('parcela pela Tabela Price e sem juros', () => {
  assert.equal(priceInstallment(10000, 12, 2), 945.6)
  assert.equal(priceInstallment(78900, 12, 1.99), 7456.17)
  assert.equal(priceInstallment(10000, 3, 0), 3333.33)
  assert.equal(priceInstallment(10000, 3, null), 3333.33)
  assert.equal(priceInstallment(0, 12, 2), 0)
  assert.equal(priceInstallment(10000, 0, 2), 0)
})

test('valores digitados no padrão brasileiro', () => {
  assert.equal(parseMoneyBR('1.234,56'), 1234.56)
  assert.equal(parseMoneyBR('R$ 80.000,00'), 80000)
  assert.equal(parseMoneyBR('80.000'), 80000)
  assert.equal(parseMoneyBR('10500.55'), 10500.55)
  assert.equal(parseMoneyBR('0,5'), 0.5)
  assert.equal(parseMoneyBR('abc'), 0)
  assert.equal(parseMoneyBR(''), null)
  assert.equal(parseMoneyBR(null), null)
  assert.equal(formatMoneyInput(1234.5).replace(/\s/g, ''), '1.234,50')
  assert.equal(formatMoneyInput(''), '')
  assert.equal(parsePercentBR('1,5'), 1.5)
  assert.equal(parsePercentBR('2%'), 2)
  assert.equal(parsePercentBR(''), null)
})

test('multa uma vez + juros proporcionais aos dias de atraso', () => {
  const fin = { lateFeePercent: 2, lateInterestPercent: 1 }
  assert.deepEqual(lateCharges({ amount: 1000, dueDate: '2026-09-01' }, fin, '2026-09-11'), { days: 10, fee: 20, interest: 3.33, total: 23.33 })
  assert.deepEqual(lateCharges({ amount: 7450, dueDate: '2026-09-20' }, fin, '2026-09-29'), { days: 9, fee: 149, interest: 22.35, total: 171.35 })
  assert.equal(lateCharges({ amount: 1000, dueDate: '2026-09-11' }, fin, '2026-09-11').total, 0)
  assert.equal(lateCharges({ amount: 1000, dueDate: '2026-09-20' }, fin, '2026-09-11').total, 0)
  assert.equal(lateCharges({ amount: 1000, dueDate: '2026-09-01' }, { lateFeePercent: 0, lateInterestPercent: 0 }, '2026-10-01').total, 0)
})

test('situação de cada parcela', () => {
  assert.equal(installmentStatus({ dueDate: '2026-09-01', paidOn: '2026-09-05' }, '2026-09-29'), 'paga')
  assert.equal(installmentStatus({ dueDate: '2026-09-01', paidOn: null }, '2026-09-29'), 'atrasada')
  assert.equal(installmentStatus({ dueDate: '2026-09-29', paidOn: null }, '2026-09-29'), 'aberta')
})

test('resumo do financiamento: total = pago + saldo, multa e juros à parte', () => {
  const fin = {
    downPayment: 5000,
    status: 'ativo',
    lateFeePercent: 2,
    lateInterestPercent: 1,
    installments: [
      { amount: 1000, dueDate: '2026-08-10', paidOn: '2026-08-12', paidAmount: 1021, lateCharges: 21 },
      { amount: 1000, dueDate: '2026-09-10', paidOn: null },
      { amount: 1000, dueDate: '2026-10-10', paidOn: null },
    ],
  }
  const s = summarizeFinancing(fin, '2026-09-20')
  assert.equal(s.total, 8000)
  assert.equal(s.paid, 6000)
  assert.equal(s.open, 2000)
  assert.equal(s.total, s.paid + s.open)
  assert.equal(s.chargesReceived, 21)
  assert.equal(s.status, 'em_atraso')
  assert.equal(s.overdueCount, 1)
  assert.equal(s.nextDue.dueDate, '2026-09-10')
  const allPaid = { ...fin, installments: fin.installments.map((i) => ({ ...i, paidOn: '2026-10-10', paidAmount: 1000 })) }
  assert.equal(summarizeFinancing(allPaid, '2026-12-01').status, 'quitado')
  assert.equal(summarizeFinancing({ ...fin, status: 'cancelado' }, '2026-09-20').status, 'cancelado')
  assert.equal(summarizeFinancing({ ...fin, installments: [] }, '2026-09-20').status, 'em_dia')
})
