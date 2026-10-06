import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateSigners, signatureStatus, signerState, pendingToRefresh, latestByContract, isValidEmail } from '../src/utils/signatures.js'

const cliente = { role: 'cliente', name: 'Maria Souza', email: 'maria@exemplo.com' }
const loja = { role: 'loja', name: 'João Lima', email: 'joao@loja.com' }

test('assinantes: cliente e loja com e-mails válidos e diferentes', () => {
  assert.equal(validateSigners([cliente, loja]), '')
  assert.equal(validateSigners([cliente]), 'Escolha quem assina pela loja.')
  assert.equal(validateSigners([loja]), 'Falta o cliente.')
  assert.equal(validateSigners([{ ...cliente, email: 'maria' }, loja]), 'O e-mail de Maria Souza não é válido.')
  assert.equal(validateSigners([{ ...cliente, name: ' ' }, loja]), 'Falta o nome: cliente.')
  assert.equal(validateSigners([cliente, { ...loja, email: 'MARIA@exemplo.com ' }]), 'Cada assinante precisa de um e-mail diferente.')
})

test('assinantes: entrada pede o dono; no máximo 2 testemunhas', () => {
  const dono = { ...cliente, role: 'dono' }
  assert.equal(validateSigners([cliente, loja], 'entrada'), 'Falta o dono do carro.')
  assert.equal(validateSigners([dono, loja], 'entrada'), '')
  const t = (n) => ({ role: 'testemunha', name: `Testemunha ${n}`, email: `t${n}@x.com` })
  assert.equal(validateSigners([cliente, loja, t(1), t(2)]), '')
  assert.equal(validateSigners([cliente, loja, t(1), t(2), t(3)]), 'No máximo 2 testemunhas.')
})

test('situação: aguardando conta quem já assinou; assinado, recusado e cancelado', () => {
  const signers = [{ signedAt: '2026-10-05T10:00:00Z' }, { signedAt: null }]
  assert.deepEqual(signatureStatus({ status: 'enviado', signers }), { label: 'Aguardando assinatura (1 de 2)', tone: 'wait' })
  assert.equal(signatureStatus({ status: 'assinado', signers }).tone, 'ok')
  assert.equal(signatureStatus({ status: 'recusado', signers }).label, 'Recusado')
  assert.equal(signatureStatus({ status: 'cancelado', signers }).tone, 'off')
  assert.equal(signerState({ viewedAt: 'x' }), 'abriu')
  assert.equal(signerState({ viewedAt: 'x', signedAt: 'y' }), 'assinou')
  assert.equal(signerState({ rejectedAt: 'y' }), 'recusou')
  assert.equal(signerState({}), 'aguardando')
})

test('atualizar: só os que aguardam e foram consultados há mais de 5 minutos, até 10', () => {
  const now = Date.parse('2026-10-05T12:00:00Z')
  const list = [
    { id: 'a', status: 'enviado', checkedAt: '2026-10-05T11:50:00Z' },
    { id: 'b', status: 'enviado', checkedAt: '2026-10-05T11:58:00Z' },
    { id: 'c', status: 'assinado', checkedAt: null },
    { id: 'd', status: 'enviado', checkedAt: null },
  ]
  assert.deepEqual(pendingToRefresh(list, now), ['a', 'd'])
  const many = Array.from({ length: 15 }, (_, i) => ({ id: String(i), status: 'enviado', checkedAt: null }))
  assert.equal(pendingToRefresh(many, now).length, 10)
})

test('contratos: fica o envio mais recente de cada um', () => {
  const map = latestByContract([
    { id: '1', contractId: 'k', createdAt: '2026-10-01T10:00:00Z' },
    { id: '2', contractId: 'k', createdAt: '2026-10-02T10:00:00Z' },
    { id: '3', contractId: null, createdAt: '2026-10-03T10:00:00Z' },
  ])
  assert.equal(map.size, 1)
  assert.equal(map.get('k').id, '2')
  assert.equal(isValidEmail(' a@b.co '), true)
})
