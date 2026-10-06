import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatCnpj, formatCep, isValidCnpj, formatAddress, cleanAddress, hasAddress, companyFromFiscal, fiscalMissing } from '../src/utils/fiscal.js'

test('fiscal: máscara e validação do CNPJ', () => {
  assert.equal(formatCnpj('11222333000181'), '11.222.333/0001-81')
  assert.equal(formatCnpj('112223'), '11.222.3')
  assert.equal(isValidCnpj('11.222.333/0001-81'), true)
  assert.equal(isValidCnpj('11.222.333/0001-80'), false)
  assert.equal(isValidCnpj('11111111111111'), false)
  assert.equal(formatCep('65000123'), '65000-123')
})

test('fiscal: endereço numa linha, com s/n quando falta o número', () => {
  const parts = { street: 'Av. dos Holandeses', number: '10', complement: 'Sala 2', district: 'Calhau', city: 'São Luís', state: 'MA', zip: '65071380' }
  assert.equal(formatAddress(parts), 'Av. dos Holandeses, 10, Sala 2 - Calhau, São Luís/MA, CEP 65071-380')
  assert.equal(formatAddress({ street: 'Rua A', city: 'São Luís', state: 'MA' }), 'Rua A, s/n, São Luís/MA')
  assert.equal(formatAddress({}), '')
})

test('fiscal: limpeza do endereço e se tem algo preenchido', () => {
  assert.deepEqual(cleanAddress({ zip: '65.000-000', state: 'ma', street: ' Rua A ', number: '', extra: 'x' }), { zip: '65000000', street: 'Rua A', state: 'MA' })
  assert.equal(hasAddress({ number: ' ' }), false)
  assert.equal(hasAddress({ city: 'São Luís' }), true)
})

test('fiscal: empresa dos documentos vem dos dados fiscais', () => {
  assert.equal(companyFromFiscal({}, 'Loja'), null)
  const company = companyFromFiscal({ cnpj: '11222333000181', city: 'São Luís', state: 'MA', phone: '(98) 9999-0000' }, 'Loja')
  assert.deepEqual(company, { name: 'Loja', document: '11.222.333/0001-81', address: 'São Luís/MA', phone: '(98) 9999-0000', email: '', city: 'São Luís/MA' })
})

test('fiscal: o que falta para emitir nota', () => {
  assert.equal(fiscalMissing({}).length, 11)
  const full = { legal_name: 'A', cnpj: '1', ie: '1', crt: '1', zip: '1', street: '1', number: '1', district: '1', city: '1', city_code: '1', state: 'MA' }
  assert.deepEqual(fiscalMissing(full), [])
  assert.deepEqual(fiscalMissing({ ...full, ie: '' }), ['Inscrição Estadual'])
})
