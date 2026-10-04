import { test } from 'node:test'
import assert from 'node:assert/strict'
import { slotPositions, slotsToText, textToSlots, editSlots, emptySlots } from '../src/utils/slotMask.js'

const DATE = [2, 2, 4]
const MONTH = [2, 4]
const slots = (text, groups = DATE) => textToSlots(text, groups)
const edit = (text, args, groups = DATE) => {
  const r = editSlots(slots(text, groups), groups, args)
  return [slotsToText(r.slots, groups), r.caret]
}

test('posições e texto das casas', () => {
  assert.deepEqual(slotPositions(DATE), [0, 1, 3, 4, 6, 7, 8, 9])
  assert.deepEqual(slotPositions(MONTH), [0, 1, 3, 4, 5, 6])
  assert.equal(slotsToText(emptySlots(DATE), DATE), '')
  assert.equal(slotsToText(slots('04102026'), DATE), '04/10/2026')
  assert.equal(slotsToText(slots('041'), DATE), '04/1')
  assert.equal(slotsToText(['', '4', '1', '0', '2', '0', '2', '6'], DATE), '_4/10/2026')
  assert.equal(slotsToText(slots('102026', MONTH), MONTH), '10/2026')
})

test('digitar do zero vai preenchendo e pula a barra', () => {
  assert.deepEqual(edit('', { start: 0, type: 'insert', data: '0' }), ['0', 1])
  assert.deepEqual(edit('0', { start: 1, type: 'insert', data: '4' }), ['04', 3])
  assert.deepEqual(edit('04', { start: 2, type: 'insert', data: '1' }), ['04/1', 4])
  assert.deepEqual(edit('04/10/202', { start: 9, type: 'insert', data: '6' }), ['04/10/2026', 10])
})

test('trocar só o dia: o mês e o ano não andam', () => {
  // cursor antes do "0" do dia, digita "1": vira 14/10/2026 e o cursor vai para a próxima casa
  assert.deepEqual(edit('04/10/2026', { start: 0, type: 'insert', data: '1' }), ['14/10/2026', 1])
  // selecionou o dia inteiro e digitou "2"
  assert.deepEqual(edit('04/10/2026', { start: 0, end: 2, type: 'insert', data: '2' }), ['2_/10/2026', 1])
  // depois o "5" completa o dia
  const [texto, cursor] = edit('04/10/2026', { start: 0, end: 2, type: 'insert', data: '25' })
  assert.deepEqual([texto, cursor], ['25/10/2026', 3])
  // Backspace depois do "4" esvazia só aquela casa
  assert.deepEqual(edit('04/10/2026', { start: 2, type: 'backward' }), ['0_/10/2026', 1])
  // Backspace logo depois da barra apaga o dígito antes dela
  assert.deepEqual(edit('04/10/2026', { start: 3, type: 'backward' }), ['0_/10/2026', 1])
  // Delete antes do mês esvazia a primeira casa do mês
  assert.deepEqual(edit('04/10/2026', { start: 3, type: 'forward' }), ['04/_0/2026', 3])
})

test('apagar no fim, selecionar tudo e campo cheio', () => {
  assert.deepEqual(edit('04/10/2026', { start: 10, type: 'backward' }), ['04/10/202', 9])
  assert.deepEqual(edit('04/10/2026', { start: 0, end: 10, type: 'backward' }), ['', 0])
  assert.deepEqual(edit('04/10/2026', { start: 0, end: 10, type: 'insert', data: '1' }), ['1', 1])
  // campo cheio com o cursor no fim: não entra mais nada
  assert.deepEqual(edit('04/10/2026', { start: 10, type: 'insert', data: '7' }), ['04/10/2026', 10])
  // letra não entra
  assert.deepEqual(edit('04', { start: 2, type: 'insert', data: 'a' }), ['04', 3])
})

test('mês (mm/aaaa) e colar uma data inteira', () => {
  assert.deepEqual(edit('10/2026', { start: 1, type: 'insert', data: '1' }, MONTH), ['11/2026', 3])
  assert.equal(slotsToText(textToSlots('04/10/2026', DATE), DATE), '04/10/2026')
  assert.equal(slotsToText(textToSlots('4102026999', DATE), DATE), '41/02/0269')
})
