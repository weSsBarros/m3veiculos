import { test } from 'node:test'
import assert from 'node:assert/strict'
import { personTypeOf, documentLabel, customerDocumentError } from '../src/utils/customerDocument.js'
import { maskCNPJ, maskCpfCnpj } from '../src/utils/masks.js'

test('cliente: o tipo sai do número (14 números = CNPJ)', () => {
  assert.equal(personTypeOf('123.456.789-09'), 'pf')
  assert.equal(personTypeOf(''), 'pf')
  assert.equal(personTypeOf('11.222.333/0001-81'), 'pj')
  assert.equal(documentLabel('11222333000181'), 'CNPJ')
  assert.equal(documentLabel('123.456.789-09'), 'CPF')
})

test('cliente: pessoa jurídica precisa de CNPJ com os dígitos certos; o CPF segue opcional', () => {
  assert.equal(customerDocumentError('pf', ''), '')
  assert.equal(customerDocumentError('pf', '123'), '')
  assert.equal(customerDocumentError('pj', ''), 'Informe o CNPJ da empresa.')
  assert.equal(customerDocumentError('pj', '11.222.333/0001'), 'O CNPJ precisa ter 14 números.')
  assert.equal(customerDocumentError('pj', '11.222.333/0001-82'), 'CNPJ inválido: confira os números.')
  assert.equal(customerDocumentError('pj', '11.222.333/0001-81'), '')
})

test('máscaras: CNPJ e o campo que aceita CPF ou CNPJ', () => {
  assert.equal(maskCNPJ('11222333000181'), '11.222.333/0001-81')
  assert.equal(maskCNPJ('112223'), '11.222.3')
  assert.equal(maskCNPJ('11222333000181999'), '11.222.333/0001-81')
  assert.equal(maskCpfCnpj('12345678909'), '123.456.789-09')
  assert.equal(maskCpfCnpj('112223330001'), '11.222.333/0001')
  assert.equal(maskCpfCnpj('11.222.333/0001-81'), '11.222.333/0001-81')
})
