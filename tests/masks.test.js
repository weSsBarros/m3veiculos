import { test } from 'node:test'
import assert from 'node:assert/strict'
import { maskIntBR, maskMoneyBR, toMaskedBR } from '../src/utils/masks.js'
import { parseIntBR } from '../src/utils/carFormat.js'
import { parseMoneyBR } from '../src/utils/financing.js'

test('maskIntBR: milhar automático, sem centavos', () => {
  assert.equal(maskIntBR(''), '')
  assert.equal(maskIntBR('8'), '8')
  assert.equal(maskIntBR('8000'), '8.000')
  assert.equal(maskIntBR('119900'), '119.900')
  assert.equal(maskIntBR('1.199.00'), '119.900')
  assert.equal(maskIntBR('1234567'), '1.234.567')
  assert.equal(maskIntBR('95.000,00'), '95.000')
  assert.equal(maskIntBR('95.000,'), '95.000')
  assert.equal(maskIntBR('007'), '7')
  assert.equal(maskIntBR('0'), '0')
  assert.equal(maskIntBR('R$ 1a2b3'), '123')
  assert.equal(maskIntBR('12345678901'), '123.456.789')
  assert.equal(maskIntBR('12345678', 7), '1.234.567')
})

test('maskMoneyBR: milhar automático e centavos só com vírgula', () => {
  assert.equal(maskMoneyBR('80000'), '80.000')
  assert.equal(maskMoneyBR('1250,9'), '1.250,9')
  assert.equal(maskMoneyBR('1.250,90'), '1.250,90')
  assert.equal(maskMoneyBR('1.250,909'), '1.250,90')
  assert.equal(maskMoneyBR('1.250,'), '1.250,')
  assert.equal(maskMoneyBR(','), '0,')
  assert.equal(maskMoneyBR(',5'), '0,5')
  // o ponto digitado é ignorado: quem digita "80.000" à mão fica com 80 mil
  assert.equal(maskMoneyBR('80.'), '80')
  assert.equal(maskMoneyBR('80.0'), '800')
  assert.equal(maskMoneyBR('80.000'), '80.000')
  assert.equal(maskMoneyBR('1.250.'), '1.250')
  // costume de digitar centavos num campo sem centavos: a vírgula segura os dígitos
  assert.equal(maskMoneyBR('119.900,'), '119.900,')
  assert.equal(maskMoneyBR('119.900,5'), '119.900,5')
  assert.equal(maskMoneyBR('119.900,50'), '119.900,50')
  assert.equal(maskIntBR('119.900,50'), '119.900')
  // apagar o último dígito de "1.250" não vira centavos
  assert.equal(maskMoneyBR('1.25'), '125')
  assert.equal(maskMoneyBR('1.250,5,3'), '1.250,53')
})

test('toMaskedBR: valores do banco no formato dos campos', () => {
  assert.equal(toMaskedBR(null, false), '')
  assert.equal(toMaskedBR('', true), '')
  assert.equal(toMaskedBR(119900, false), '119.900')
  assert.equal(toMaskedBR('119900', false), '119.900')
  assert.equal(toMaskedBR(1234.5, true), '1.234,50')
  assert.equal(toMaskedBR('1234.5', true), '1.234,5')
  assert.equal(toMaskedBR(150, true), '150')
  assert.equal(toMaskedBR('1.234,50', true), '1.234,50')
  assert.equal(toMaskedBR('45000.0', false), '45.000')
  assert.equal(toMaskedBR(45000.7, false), '45.000')
  // enquanto digita, a vírgula do campo sem centavos continua aparecendo
  assert.equal(toMaskedBR('119.900,5', false), '119.900,5')
  // o que as máscaras devolvem não muda ao passar de novo
  for (const v of ['1.250', '1.250,', '1.250,9', '0,5', '119.900']) assert.equal(toMaskedBR(v, true), v)
})

test('o texto formatado é lido certo pelos parsers de sempre', () => {
  assert.equal(parseIntBR(maskIntBR('119900')), 119900)
  assert.equal(parseMoneyBR(maskMoneyBR('80000')), 80000)
  assert.equal(parseMoneyBR(maskMoneyBR('1250,9')), 1250.9)
  assert.equal(parseMoneyBR(maskMoneyBR('1.250,')), 1250)
  assert.equal(parseMoneyBR(maskMoneyBR('1000')), 1000)
  assert.equal(parseIntBR(maskMoneyBR('119900,50')), 119900)
})
