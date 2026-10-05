import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  situationText,
  storeBillingNotice,
  chargeMessage,
  whatsappLink,
  billingTotals,
  receivedByMonth,
  domainAlert,
  onboardingStatus,
  monthName,
  isCharged,
  firstAutoDue,
  firstDueDate,
  implantationDays,
} from '../src/utils/billing.js'

const today = new Date(2026, 9, 7) // 07/10/2026

const atrasado = {
  situation: 'atrasado',
  price: 150,
  days_late: 27,
  open: [
    { month: '2026-09-01', due: '2026-09-10', amount: 150 },
    { month: '2026-10-01', due: '2026-10-05', amount: 150 },
  ],
  open_total: 300,
}
const vencendo = { situation: 'vence_em_breve', price: 150, next: { month: '2026-10-01', due: '2026-10-10', amount: 150 }, open: [] }
const hoje = { situation: 'vence_hoje', price: 150, next: { month: '2026-10-01', due: '2026-10-07', amount: 150 }, open: [] }
const emDia = { situation: 'em_dia', price: 150, next: { month: '2026-11-01', due: '2026-11-10', amount: 150 }, open: [] }

test('cobrança: texto da situação', () => {
  assert.equal(situationText(atrasado, today), 'Atrasado há 27 dias')
  assert.equal(situationText(vencendo, today), 'Vence em 3 dias (10/10)')
  assert.equal(situationText(hoje, today), 'Vence hoje')
  assert.equal(situationText(emDia, today), 'Em dia · próximo 10/11')
  assert.equal(situationText({ situation: 'sem_cobranca' }, today), 'Sem cobrança')
  assert.equal(situationText(null, today), 'Sem cobrança')
  assert.equal(monthName('2026-09-01'), 'setembro de 2026')
})

test('cobrança: aviso no painel da loja só quando vence logo ou atrasou', () => {
  assert.equal(storeBillingNotice(emDia, today), null)
  assert.equal(storeBillingNotice({ situation: 'sem_cobranca' }, today), null)
  assert.equal(storeBillingNotice(null, today), null)
  assert.match(storeBillingNotice(vencendo, today).text, /vence em 3 dias \(10\/10\)/)
  assert.equal(storeBillingNotice(hoje, today).level, 'aviso')
  const late = storeBillingNotice(atrasado, today)
  assert.equal(late.level, 'urgente')
  assert.match(late.text, /2 mensalidades em atraso/)
  assert.match(late.text, /há 27 dias/)
  assert.match(storeBillingNotice({ ...atrasado, open: [atrasado.open[0]], days_late: 1 }, today).text, /setembro de 2026 está em atraso há 1 dia/)
})

test('cobrança: mensagem do WhatsApp e link', () => {
  const msg = chargeMessage({ storeName: 'Loja X', responsibleName: 'Ana Souza', billing: atrasado })
  assert.match(msg, /^Olá, Ana!/)
  assert.match(msg, /setembro de 2026 \(venceu em 10\/09\/2026\), outubro de 2026/)
  assert.match(chargeMessage({ storeName: 'Loja X', responsibleName: '', billing: vencendo }), /^Olá! .*vence em 10\/10\/2026/)
  assert.equal(whatsappLink('(98) 98129-5577', 'oi'), 'https://wa.me/5598981295577?text=oi')
  assert.equal(whatsappLink('', 'oi'), '')
})

test('cobrança: totais, recebido por mês, domínio e implantação', () => {
  const clients = [
    { companyId: 'a', billing: atrasado },
    { companyId: 'b', billing: emDia },
    { companyId: 'c', billing: { situation: 'sem_cobranca' } },
  ]
  const payments = [
    { companyId: 'b', referenceMonth: '2026-10-01', paidOn: '2026-10-03', amount: 150 },
    { companyId: 'a', referenceMonth: '2026-08-01', paidOn: '2026-08-12', amount: 150 },
  ]
  const totals = billingTotals(clients, payments, today)
  assert.equal(totals.clients, 2)
  assert.equal(totals.mrr, 300)
  assert.equal(totals.received, 150)
  assert.equal(totals.overdue, 300)
  assert.equal(totals.lateRate, 50)
  assert.equal(totals.paidThisMonth, 1)
  assert.deepEqual(receivedByMonth(payments, ['2026-08', '2026-09', '2026-10']).map((m) => m.value), [150, 0, 150])
  assert.equal(domainAlert({ domainExpiresOn: '2026-10-20' }, today), 'Domínio vence em 13 dias')
  assert.equal(domainAlert({ domainExpiresOn: '2027-01-20' }, today), null)
  assert.equal(domainAlert({ domainExpiresOn: '2026-10-05' }, today), 'Domínio venceu há 2 dias')
  const items = onboardingStatus({ account: { onboarding: { visual: true } }, checks: { cars: 3, logins: 0, whatsappOk: true, ownDomain: false } })
  const byKey = Object.fromEntries(items.map((i) => [i.key, i]))
  assert.equal(byKey.visual.done, true)
  assert.equal(byKey.estoque.done, true)
  assert.equal(byKey.estoque.auto, true)
  assert.equal(byKey.logins.done, false)
  assert.equal(byKey.dominio.done, false)
})

test('implantação: sem cobrança, sem aviso e fora dos totais', () => {
  const impl = { situation: 'implantacao', price: 150, due_day: null, due_day_auto: true }
  assert.equal(situationText(impl), 'Em implantação')
  assert.equal(storeBillingNotice(impl, today), null)
  assert.equal(isCharged(impl), false)
  assert.equal(isCharged({ situation: 'sem_cobranca' }), false)
  assert.equal(isCharged({ situation: 'em_dia' }), true)
  assert.equal(billingTotals([{ billing: impl }], [], today).clients, 0)
})

test('vencimento automático: 30 dias após ativar; dia 29 a 31 vira dia 1 do mês seguinte', () => {
  assert.equal(firstAutoDue('2026-10-10'), '2026-11-09')
  assert.equal(firstAutoDue('2026-10-01'), '2026-11-01')
  assert.equal(firstAutoDue('2026-01-30'), '2026-03-01')
  assert.equal(firstAutoDue('2026-12-31'), '2027-02-01')
  assert.equal(firstAutoDue(null), null)
  assert.equal(firstDueDate({ activatedOn: '2026-10-10' }), '2026-11-09')
  // o dia escolhido à mão vale no lugar do automático
  assert.equal(firstDueDate({ activatedOn: '2026-10-10', dueDay: 5 }), '2026-11-05')
  assert.equal(firstDueDate({ activatedOn: '2026-10-10', dueDay: 5, billingStart: '2026-12-01' }), '2026-12-05')
  assert.equal(firstDueDate({ dueDay: 10, billingStart: '2026-01-01' }), '2026-01-10')
  assert.equal(firstDueDate({}), null)
})

test('dias em implantação: contando e quanto levou até ativar', () => {
  assert.deepEqual(implantationDays({ status: 'implantacao', implantationStartedOn: '2026-10-01' }, today), { days: 6, done: false })
  assert.deepEqual(implantationDays({ status: 'ativo', implantationStartedOn: '2026-10-01', activatedOn: '2026-10-20' }, today), { days: 19, done: true })
  assert.equal(implantationDays({ status: 'ativo', implantationStartedOn: null }, today), null)
})
