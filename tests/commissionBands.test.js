import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sortBands, bandFor, bandCommission, bandRangeLabel, bandProblem } from '../src/utils/commissionBands.js'

// Exemplo do pedido do Wesley (15/10/2026): até 30 mil = 300; até 70 mil = 500; acima = 1.000
const BANDS = [
  { id: 'c', upTo: null, amount: 1000 },
  { id: 'b', upTo: 70000, amount: 500 },
  { id: 'a', upTo: 30000, amount: 300 },
]

test('faixas em ordem: as de "até" do menor para o maior e a "acima" no fim', () => {
  assert.deepEqual(sortBands(BANDS).map((b) => b.id), ['a', 'b', 'c'])
})

test('a venda cai na menor faixa que a cobre (o "até" vale inclusive)', () => {
  assert.equal(bandCommission(BANDS, 25000), 300)
  assert.equal(bandCommission(BANDS, 30000), 300)
  assert.equal(bandCommission(BANDS, 30001), 500)
  assert.equal(bandCommission(BANDS, 70000), 500)
  assert.equal(bandCommission(BANDS, 70001), 1000)
  assert.equal(bandCommission(BANDS, 500000), 1000)
})

test('sem a faixa "acima", venda maior que a última fica sem comissão', () => {
  const semAcima = BANDS.filter((b) => b.upTo != null)
  assert.equal(bandFor(semAcima, 80000), null)
  assert.equal(bandCommission(semAcima, 80000), 0)
})

test('só a faixa "acima" vale para qualquer valor; sem valor, nenhuma faixa', () => {
  assert.equal(bandCommission([{ id: 'x', upTo: null, amount: 700 }], 12000), 700)
  assert.equal(bandFor(BANDS, null), null)
  assert.equal(bandCommission([], 50000), 0)
})

// O formato de moeda põe um espaço especial depois do R$
const plain = (text) => text.replace(/\s/g, ' ')

test('texto das faixas', () => {
  const [a, b, c] = sortBands(BANDS)
  assert.equal(plain(bandRangeLabel(BANDS, a)), 'Até R$ 30.000,00')
  assert.equal(plain(bandRangeLabel(BANDS, b)), 'De R$ 30.000,01 a R$ 70.000,00')
  assert.equal(plain(bandRangeLabel(BANDS, c)), 'Acima de R$ 70.000,00')
  assert.equal(bandRangeLabel([c], c), 'Qualquer valor')
})

test('não deixa repetir o mesmo "até" nem criar duas faixas "acima"', () => {
  assert.match(bandProblem(BANDS, { upTo: 30000, amount: 400 }), /até esse valor/)
  assert.match(bandProblem(BANDS, { upTo: null, amount: 2000 }), /acima/)
  assert.equal(bandProblem(BANDS, { id: 'c', upTo: null, amount: 1200 }), null)
  assert.equal(bandProblem(BANDS, { upTo: 100000, amount: 800 }), null)
  assert.match(bandProblem(BANDS, { upTo: 100000, amount: NaN }), /valor da comissão/)
  assert.match(bandProblem(BANDS, { upTo: 0, amount: 100 }), /até que valor/)
})
