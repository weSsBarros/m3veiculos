import { test } from 'node:test'
import assert from 'node:assert/strict'
import { queriesFor, queriesText, readsText, creditsFromRow, ledgerText, parsePackages, packagesText, moneyBR, signatureCost } from '../src/utils/plateCredits.js'

test('créditos: assinatura digital com franquia do mês e depois R$ 1,00 do saldo', () => {
  const base = { balance: 3, price: 0.4, doc_price: 0.2, signature_price: 1, signature_free_monthly: 5 }
  const freeTwo = creditsFromRow({ ...base, signature_free_left: 2 })
  assert.equal(freeTwo.signaturePrice, 1)
  assert.equal(freeTwo.signatureFreeMonthly, 5)
  assert.equal(freeTwo.signatureFreeLeft, 2)
  assert.deepEqual({ ...signatureCost(freeTwo), text: undefined }, { free: true, canSend: true, text: undefined })
  assert.match(signatureCost(freeTwo).text, /grátis.*resta 1 grátis/)
  assert.match(signatureCost(creditsFromRow({ ...base, signature_free_left: 1 })).text, /último grátis/)
  const paid = signatureCost(creditsFromRow({ ...base, signature_free_left: 0 }))
  assert.equal(paid.free, false)
  assert.equal(paid.canSend, true)
  assert.match(paid.text, /acabaram: este custa R\$\s1,00 dos créditos \(saldo R\$\s3,00\)/)
  const blocked = signatureCost(creditsFromRow({ ...base, balance: 0.5, signature_free_left: 0 }))
  assert.equal(blocked.canSend, false)
  assert.match(blocked.text, /não há crédito/)
  // Sem franquia configurada (0 por mês)
  assert.match(signatureCost(creditsFromRow({ ...base, signature_free_monthly: 0, signature_free_left: 0 })).text, /^Este envio custa/)
  // Resposta antiga (sem os campos novos): R$ 1,00 e 5 por mês; sem saber o que sobra, cobra
  const old = creditsFromRow({ balance: 0 })
  assert.equal(old.signaturePrice, 1)
  assert.equal(old.signatureFreeMonthly, 5)
  assert.equal(signatureCost(old).canSend, false)
  assert.equal(signatureCost(null).canSend, true)
  assert.equal(ledgerText({ kind: 'assinatura' }), 'Contrato enviado para assinatura digital')
})

test('créditos: consultas que cabem no saldo (sem arredondar para cima)', () => {
  assert.equal(queriesFor(20, 0.4), 50)
  assert.equal(queriesFor(41.6, 0.4), 104)
  assert.equal(queriesFor(0.39, 0.4), 0)
  assert.equal(queriesFor(12.4, 0.4), 31)
  assert.equal(queriesFor(10, 0), 0)
  assert.equal(queriesText(0), 'nenhuma consulta')
  assert.equal(queriesText(1), '1 consulta')
  assert.equal(queriesText(1250), '1.250 consultas')
  assert.equal(moneyBR(41.6).replace(/\s/g, ' '), 'R$ 41,60')
})

test('créditos: resposta do banco vira saldo, pacotes, pedidos e extrato', () => {
  const c = creditsFromRow({
    balance: '41.60', price: '0.40', packages: [20, 40, 100], admin: true,
    orders: [{ id: 'o1', amount: '40.00', paid_on: '2026-10-09', status: 'confirmado', response: '', created_at: '2026-10-09T12:00:00Z' }],
    ledger: [{ id: 3, kind: 'consulta', amount: '-0.40', plate: 'ABC1D23', note: '', created_at: '2026-10-09T13:00:00Z', user_email: 'vendedor@loja' }],
  })
  assert.equal(c.balance, 41.6)
  assert.equal(c.queries, 104)
  assert.deepEqual(c.packages, [{ amount: 20, queries: 50 }, { amount: 40, queries: 100 }, { amount: 100, queries: 250 }])
  assert.equal(c.orders[0].paidOn, '2026-10-09')
  assert.equal(c.ledger[0].amount, -0.4)
  assert.equal(ledgerText(c.ledger[0]), 'Consulta da placa ABC1D23')
  assert.equal(ledgerText({ kind: 'recarga' }), 'Compra de créditos')
  assert.equal(ledgerText({ kind: 'ajuste', note: 'Bônus' }), 'Ajuste da WB.Dev: Bônus')
  // Sem preço ou pacotes (banco antigo): os padrões
  const d = creditsFromRow({ balance: 0 })
  assert.equal(d.price, 0.4)
  assert.equal(d.docPrice, 0.2)
  assert.equal(d.packages.length, 3)
  assert.equal(creditsFromRow(null), null)
})

test('créditos: a foto do documento sai do mesmo saldo, com preço próprio', () => {
  const c = creditsFromRow({ balance: '0.30', price: '0.40', doc_price: '0.25', packages: [20] })
  assert.equal(c.queries, 0)
  assert.equal(c.docPrice, 0.25)
  assert.equal(c.docReads, 1)
  // o resumo que a função devolve (camelCase) também serve
  assert.equal(creditsFromRow({ balance: 19.6, price: 0.4, docPrice: 0.2 }).docReads, 98)
  assert.equal(ledgerText({ kind: 'documento', amount: -0.2 }), 'Leitura da foto do documento')
  assert.equal(readsText(0), 'nenhuma leitura')
  assert.equal(readsText(1), '1 leitura')
  assert.equal(readsText(1250), '1.250 leituras')
})

test('créditos: pacotes digitados na Plataforma', () => {
  assert.deepEqual(parsePackages('20, 40, 100'), [20, 40, 100])
  assert.deepEqual(parsePackages('100;20 40 20'), [20, 40, 100])
  assert.deepEqual(parsePackages('R$ 50'), [50])
  assert.equal(parsePackages(''), null)
  assert.equal(parsePackages('0, 10'), null)
  assert.equal(parsePackages('1 2 3 4 5 6 7'), null)
  assert.equal(packagesText([20, 40, 100]), '20, 40, 100')
})
