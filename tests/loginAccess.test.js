import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeEmail, isValidEmail, emailChanged, savedPasswordInfo, myAccountError, MIN_PASSWORD } from '../src/utils/loginAccess.js'

test('login: e-mail sem espaço e em minúsculas; formato conferido', () => {
  assert.equal(normalizeEmail('  Maria@Loja.COM '), 'maria@loja.com')
  assert.equal(isValidEmail('maria@loja.com'), true)
  assert.equal(isValidEmail(' Maria@Loja.com '), true)
  assert.equal(isValidEmail('maria@loja'), false)
  assert.equal(isValidEmail('maria loja@x.com'), false)
  assert.equal(isValidEmail(''), false)
})

test('login: só conta como troca de e-mail quando muda de verdade', () => {
  assert.equal(emailChanged('maria@loja.com', 'MARIA@loja.com '), false)
  assert.equal(emailChanged('maria@loja.com', ''), false)
  assert.equal(emailChanged('maria@loja.com', 'maria.silva@loja.com'), true)
  assert.equal(emailChanged('', 'nova@loja.com'), true)
})

test('senha guardada: diz como, quando e quem definiu (horário de São Luís)', () => {
  assert.equal(
    savedPasswordInfo({ origin: 'admin', savedAt: '2026-10-27T17:05:00Z', savedByEmail: 'admin@loja' }),
    'Definida pelo administrador, em Nova senha, em 27/10/2026 às 14:05 (admin@loja).'
  )
  assert.equal(
    savedPasswordInfo({ origin: 'propria', savedAt: '2026-10-28T02:30:00Z', savedByEmail: 'vendedor@loja' }),
    'Definida pela própria pessoa, em Minha conta, em 27/10/2026 às 23:30.'
  )
  assert.equal(savedPasswordInfo({ origin: 'cadastro', savedAt: null, savedByEmail: null }), 'Definida no cadastro do login.')
  assert.equal(savedPasswordInfo(null), '')
})

test('Minha conta: precisa mudar algo, e-mail válido, senha nova com o mínimo e a senha atual', () => {
  const base = { currentEmail: 'maria@loja.com', email: 'maria@loja.com', password: '', currentPassword: 'atual123' }
  assert.equal(myAccountError(base), 'Troque o e-mail ou digite a nova senha.')
  assert.equal(myAccountError({ ...base, email: 'maria@' }), 'E-mail inválido.')
  assert.equal(myAccountError({ ...base, password: '12345' }), `A senha nova precisa ter pelo menos ${MIN_PASSWORD} caracteres.`)
  assert.equal(myAccountError({ ...base, password: '123456', currentPassword: '' }), 'Digite a sua senha atual para confirmar.')
  assert.equal(myAccountError({ ...base, password: '123456' }), '')
  assert.equal(myAccountError({ ...base, email: 'maria.silva@loja.com' }), '')
})
