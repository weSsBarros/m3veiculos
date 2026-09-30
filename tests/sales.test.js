import { test } from 'node:test'
import assert from 'node:assert/strict'
import { transferAlert, transferDueDate, transferDueText, isTransferOpen, transferStatusLabel } from '../src/utils/transfer.js'
import { buildChecklist, checklistSummary, parseChecklistText } from '../src/utils/saleChecklist.js'
import { addDaysISO, daysBetweenISO, matchesCarSearch, normalizePlate, parseIntBR, slugify } from '../src/utils/carFormat.js'
import { whatsappLinkToPhone } from '../src/utils/whatsapp.js'

test('transferência: prazo padrão de 30 dias e avisos', () => {
  const sale = { saleDate: '2026-09-01', transferStatus: 'pendente', transferDueDate: null }
  assert.equal(transferDueDate(sale), '2026-10-01')
  assert.equal(transferAlert(sale, '2026-09-20'), null)
  assert.equal(transferAlert(sale, '2026-09-24'), 'vence_logo')
  assert.equal(transferAlert(sale, '2026-10-01'), 'vence_logo')
  assert.equal(transferAlert(sale, '2026-10-02'), 'atrasada')
  assert.equal(transferDueText(sale, '2026-10-04'), 'atrasada há 3 dias')
  assert.equal(transferDueText(sale, '2026-10-02'), 'atrasada há 1 dia')
  assert.equal(transferDueText(sale, '2026-10-01'), 'vence hoje')
  assert.equal(transferDueText(sale, '2026-09-30'), 'vence em 1 dia')
})

test('transferência: prazo informado, concluída, não informada e venda sem registro', () => {
  const sale = { saleDate: '2026-09-01', transferStatus: 'em_andamento', transferDueDate: '2026-12-31' }
  assert.equal(transferAlert(sale, '2026-12-01'), null)
  assert.equal(transferAlert({ ...sale, transferStatus: 'concluida' }, '2027-06-01'), null)
  assert.equal(transferAlert({ ...sale, transferStatus: 'nao_informada' }, '2027-06-01'), null)
  assert.equal(transferAlert(null), null)
  assert.equal(isTransferOpen(null), false)
  assert.equal(transferDueText({ ...sale, transferStatus: 'concluida' }), '')
  assert.equal(transferStatusLabel('em_andamento'), 'Em andamento')
  assert.equal(transferStatusLabel('xyz'), 'Não informada')
})

test('checklist: junta a lista da loja com o que a venda marcou', () => {
  const cl = buildChecklist(['Manual', 'Chave reserva'], [{ item: 'Chave reserva', status: 'ok' }, { item: 'Antigo', status: 'nao_possui' }])
  assert.deepEqual(cl, [
    { item: 'Manual', status: null },
    { item: 'Chave reserva', status: 'ok' },
    { item: 'Antigo', status: 'nao_possui' },
  ])
  assert.deepEqual(checklistSummary(cl), { total: 3, delivered: 1, missing: 1, pending: 1 })
  assert.deepEqual(buildChecklist([], []), [])
  assert.deepEqual(parseChecklistText(' Manual \n\nmanual\nChave reserva\n'), ['Manual', 'Chave reserva'])
})

test('datas sem erro de fuso', () => {
  assert.equal(addDaysISO('2026-01-31', 30), '2026-03-02')
  assert.equal(addDaysISO('2026-12-15', 30), '2027-01-14')
  assert.equal(addDaysISO('2028-02-28', 1), '2028-02-29')
  assert.equal(daysBetweenISO('2026-03-01', '2026-03-31'), 30)
  assert.equal(daysBetweenISO('2026-10-20', '2026-10-10'), -10)
  assert.equal(daysBetweenISO('2026-10-18', '2026-10-19'), 1)
})

test('busca por placa, com ou sem hífen', () => {
  const car = { brand: 'Toyota', model: 'Corolla', version: 'XEi', plate: 'abc-1d23' }
  assert.equal(normalizePlate('abc-1d23'), 'ABC1D23')
  assert.equal(normalizePlate(null), '')
  assert.ok(matchesCarSearch(car, 'ABC1D23'))
  assert.ok(matchesCarSearch(car, 'abc-1'))
  assert.ok(matchesCarSearch(car, '1D2'))
  assert.ok(matchesCarSearch(car, 'corolla'))
  assert.ok(matchesCarSearch(car, ''))
  assert.ok(!matchesCarSearch(car, 'XYZ9'))
  assert.ok(!matchesCarSearch({ ...car, plate: '' }, 'abc'))
  assert.ok(!matchesCarSearch({ ...car, plate: null }, 'zz9'))
})

test('valores inteiros digitados (preço, km)', () => {
  assert.equal(parseIntBR('119.900'), 119900)
  assert.equal(parseIntBR('95.000,00'), 95000)
  assert.equal(parseIntBR(''), null)
})

test('WhatsApp do cliente: DDI do Brasil e telefone inválido', () => {
  assert.equal(whatsappLinkToPhone('(98) 98888-7777', 'Olá'), 'https://wa.me/5598988887777?text=Ol%C3%A1')
  assert.equal(whatsappLinkToPhone('+55 98 3222-1111', 'x'), 'https://wa.me/559832221111?text=x')
  assert.equal(whatsappLinkToPhone('98888-7777', 'x'), null)
  assert.equal(whatsappLinkToPhone('', 'x'), null)
})

test('nome de arquivo sem acento (senão o navegador pode salvar como "download")', () => {
  assert.equal(slugify('João da Silva'), 'joao-da-silva')
  assert.equal(slugify('Antônio Conceição'), 'antonio-conceicao')
  assert.equal(slugify(''), '')
})
