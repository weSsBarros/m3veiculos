import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseAnoModelo, anoModeloFromSaved, cleanAnoModeloTyping } from '../src/utils/anoModelo.js'

const HOJE = new Date('2026-10-09T12:00:00')
const ler = (texto) => parseAnoModelo(texto, HOJE)

test('ano/modelo: os formatos aceitos viram sempre "2025/2026"', () => {
  for (const texto of ['2025/2026', '25/26', '2025/26', '2025-2026', '2025.2026', '25,26', ' 2025 / 2026 ', '2025 2026']) {
    assert.deepEqual(ler(texto), { ok: true, year: 2025, modelYear: '2025/2026' }, texto)
  }
  assert.deepEqual(ler('2026'), { ok: true, year: 2026, modelYear: '2026/2026' })
  assert.deepEqual(ler('26'), { ok: true, year: 2026, modelYear: '2026/2026' })
  assert.deepEqual(ler('26/27'), { ok: true, year: 2026, modelYear: '2026/2027' }) // modelo do ano que vem
})

test('ano/modelo: ano com 2 dígitos vira 19xx quando 20xx passaria do ano que vem', () => {
  assert.deepEqual(ler('98/99'), { ok: true, year: 1998, modelYear: '1998/1999' })
  assert.deepEqual(ler('99/00'), { ok: true, year: 1999, modelYear: '1999/2000' })
  assert.deepEqual(ler('1999/00'), { ok: true, year: 1999, modelYear: '1999/2000' })
  assert.deepEqual(ler('07/08'), { ok: true, year: 2007, modelYear: '2007/2008' })
})

test('ano/modelo: recusa o que não faz sentido', () => {
  assert.equal(ler('').empty, true)
  assert.equal(ler('   ').ok, false)
  assert.match(ler('2025/2027').error, /mesmo da fabricação ou o seguinte/)
  assert.match(ler('2026/2025').error, /mesmo da fabricação ou o seguinte/)
  assert.match(ler('2027/2028').error, /fabricação 2027/) // fabricação no futuro
  assert.match(ler('1940').error, /fabricação 1940/)
  assert.equal(ler('202/2026').ok, false)
  assert.equal(ler('2025/2026/2027').ok, false)
  assert.equal(ler('abc').ok, false)
})

test('ano/modelo: o que está gravado aparece no padrão', () => {
  assert.equal(anoModeloFromSaved('2022/2023', 2022, HOJE), '2022/2023')
  assert.equal(anoModeloFromSaved('22/23', 2022, HOJE), '2022/2023')
  assert.equal(anoModeloFromSaved('2023', 2022, HOJE), '2022/2023') // carro antigo: só o modelo no texto
  assert.equal(anoModeloFromSaved('2023', 2023, HOJE), '2023/2023')
  assert.equal(anoModeloFromSaved('', 2021, HOJE), '2021/2021')
  assert.equal(anoModeloFromSaved('modelo 2023', 2022, HOJE), '2022/2023') // letras no texto antigo são ignoradas
  assert.equal(anoModeloFromSaved('sem ano', 2022, HOJE), 'sem ano') // não dá para entender: fica como está
  assert.equal(anoModeloFromSaved('', '', HOJE), '')
})

test('ano/modelo: enquanto digita, só números e separadores', () => {
  assert.equal(cleanAnoModeloTyping('2025/2026a'), '2025/2026')
  assert.equal(cleanAnoModeloTyping('25,26'), '25,26')
  assert.equal(cleanAnoModeloTyping('2025 / 2026 / 2027'), '2025 / 2026')
})
