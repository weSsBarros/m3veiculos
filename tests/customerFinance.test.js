import { test } from 'node:test'
import assert from 'node:assert/strict'
import { duePeriodRange } from '../src/utils/period.js'
import { financingInPeriod } from '../src/utils/financing.js'
import { buildInstallmentsReport } from '../src/utils/reports/build.js'

const today = '2026-10-07'
const october = { start: '2026-10-01', end: '2026-10-31' }

const inst = (number, dueDate, amount, paidOn = null, extra = {}) => ({
  number,
  dueDate,
  amount,
  paidOn,
  paidAmount: paidOn ? amount : null,
  lateCharges: 0,
  paymentMethod: paidOn ? 'Pix' : '',
  ...extra,
})

const toro = {
  id: 'f1',
  customerId: 'k1',
  customerName: 'Carlos Souza',
  vehicleLabel: 'Fiat Toro 2021',
  vehiclePlate: 'rta2b34',
  downPayment: 60000,
  installmentsCount: 4,
  lateFeePercent: 2,
  lateInterestPercent: 1,
  status: 'ativo',
  installments: [
    inst(1, '2026-08-10', 1000, '2026-08-10'),
    // Venceu em setembro e foi paga em outubro, com multa e juros
    inst(2, '2026-09-10', 1000, '2026-10-02', { paidAmount: 1030 }),
    inst(3, '2026-10-10', 1000),
    inst(4, '2026-11-10', 1000),
  ],
}
const civic = {
  id: 'f2',
  customerId: 'k2',
  customerName: 'Ana Ribeiro',
  vehicleLabel: 'Honda Civic 2019',
  vehiclePlate: '',
  downPayment: 10000,
  installmentsCount: 3,
  lateFeePercent: 2,
  lateInterestPercent: 1,
  status: 'ativo',
  installments: [inst(1, '2026-09-05', 500, '2026-09-05'), inst(2, '2026-10-01', 500), inst(3, '2026-11-01', 500)],
}
const cancelled = { ...civic, id: 'f3', customerName: 'Cliente cancelado', status: 'cancelado' }

test('período do financeiro dos clientes: mês, próximo mês, 30 dias, mês passado e ano', () => {
  assert.deepEqual(duePeriodRange('tudo', null, null, today), { start: null, end: null })
  assert.deepEqual(duePeriodRange('mes', null, null, today), { start: '2026-10-01', end: '2026-10-31' })
  assert.deepEqual(duePeriodRange('proximo-mes', null, null, today), { start: '2026-11-01', end: '2026-11-30' })
  assert.deepEqual(duePeriodRange('30dias', null, null, today), { start: '2026-10-07', end: '2026-11-06' })
  assert.deepEqual(duePeriodRange('mes-anterior', null, null, today), { start: '2026-09-01', end: '2026-09-30' })
  assert.deepEqual(duePeriodRange('ano', null, null, today), { start: '2026-01-01', end: '2026-12-31' })
  assert.deepEqual(duePeriodRange('personalizado', '2026-10-10', '', today), { start: '2026-10-10', end: null })
  // Virada do ano
  assert.deepEqual(duePeriodRange('proximo-mes', null, null, '2026-12-15'), { start: '2027-01-01', end: '2027-01-31' })
  assert.deepEqual(duePeriodRange('mes-anterior', null, null, '2026-01-15'), { start: '2025-12-01', end: '2025-12-31' })
})

test('parcelas de um financiamento no período: o que vence (a receber) e o que foi recebido', () => {
  assert.deepEqual(financingInPeriod(toro, october), {
    dueCount: 1,
    dueAmount: 1000,
    dueOpenCount: 1,
    dueOpenAmount: 1000,
    paidCount: 1,
    paidAmount: 1030,
    active: true,
  })
  assert.equal(financingInPeriod(civic, october).dueOpenAmount, 500)
  assert.equal(financingInPeriod(civic, october).paidCount, 0)
  assert.equal(financingInPeriod(civic, { start: '2026-12-01', end: '2026-12-31' }).active, false)
  // Todo o período: todas as parcelas
  assert.equal(financingInPeriod(toro, { start: null, end: null }).dueCount, 4)
  assert.equal(financingInPeriod(toro, { start: null, end: null }).paidCount, 2)
})

test('relatório do financeiro dos clientes: a receber com multa e juros, recebidas e saldo por cliente', () => {
  const customersById = new Map([['k1', { phone: '(98) 98888-1111' }]])
  const report = buildInstallmentsReport({ financings: [toro, civic, cancelled], customersById, range: october, today })
  const [summary, open, paid, balance] = report.sections
  assert.equal(report.subtitle, 'Período: 01/10/2026 a 31/10/2026')

  // A receber em outubro: a do Civic (venceu dia 1) e a da Toro (dia 10); a cancelada fica de fora
  assert.deepEqual(
    open.rows.map((r) => [r.due, r.customer, r.parcel]),
    [
      ['2026-10-01', 'Ana Ribeiro', '2/3'],
      ['2026-10-10', 'Carlos Souza', '3/4'],
    ]
  )
  // Atrasada há 6 dias: multa de 2% (10,00) + juros de 1% ao mês por 6 dias (1,00)
  assert.equal(open.rows[0].situation, 'Atrasada há 6 dias')
  assert.equal(open.rows[0].updated, 511)
  assert.equal(open.rows[1].situation, 'A vencer')
  assert.equal(open.rows[1].phone, '(98) 98888-1111')
  assert.equal(open.rows[1].car, 'Fiat Toro 2021 · RTA2B34')

  // Recebida em outubro (venceu em setembro), com o valor recebido
  assert.deepEqual(
    paid.rows.map((r) => [r.paidOn, r.parcel, r.received]),
    [['2026-10-02', '2/4', 1030]]
  )

  // Saldo: Ana com 2 parcelas (1.000, das quais 500 + 11 em atraso); Carlos com 2 (2.000)
  assert.deepEqual(
    balance.rows.map((r) => [r.customer, r.openCount, r.open, r.overdue, r.next]),
    [
      ['Ana Ribeiro', 2, 1000, 511, '01/10/2026'],
      ['Carlos Souza', 2, 2000, 0, '10/10/2026'],
    ]
  )
  assert.deepEqual(
    summary.rows.map((r) => r.value),
    [1500, 511, 1030, 3000]
  )
})
