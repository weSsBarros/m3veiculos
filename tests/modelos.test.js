import { test } from 'node:test'
import assert from 'node:assert/strict'
import { categoryCounts, brandCounts, sortCars, filterCars, stockLink, showcaseCars, photosFirst, mapsLink, priceText } from '../src/modelos/comum.js'
import { modeloFromParam, modeloInicial } from '../src/modelos/siteModelo.js'
import { painelFromValue, PAINEIS } from '../src/modelos/painelVisual.js'

// Modelos de site (src/modelos, 15/10/2026): contas sobre o estoque e a prévia ?modelo=

const CARS = [
  { id: 1, brand: 'Fiat', model: 'Argo', category: 'hatch', price: 62000, km: 30000, images: ['/a.webp'], featured: false },
  { id: 2, brand: 'Jeep', model: 'Compass', category: 'suv', price: 145000, km: 12000, images: ['/b.webp'], featured: true },
  { id: 3, brand: 'Fiat', model: 'Toro', category: 'picape', price: null, km: 50000, images: [], featured: false },
  { id: 4, brand: 'Honda', model: 'CG 160', category: 'moto', price: 14000, km: 8000, images: ['/d.webp'], featured: false },
  { id: 5, brand: 'Fiat', model: 'Mobi', category: 'hatch', price: 45000, km: undefined, images: ['/e.webp'], featured: true },
]

test('prévia: aceita o número ou o nome do modelo; o resto não vale', () => {
  assert.equal(modeloFromParam('1'), 'estoque')
  assert.equal(modeloFromParam('2'), 'vitrine')
  assert.equal(modeloFromParam(' 3 '), 'bairro')
  assert.equal(modeloFromParam('0'), 'atual')
  assert.equal(modeloFromParam('Vitrine'), 'vitrine')
  assert.equal(modeloFromParam('9'), null)
  assert.equal(modeloFromParam(''), null)
  assert.equal(modeloFromParam(null), null)
})

test('aparência: a prévia vence a escolha da loja; a escolha vem do <html> ou da última visita', () => {
  // sem nada: o visual próprio da loja
  assert.deepEqual(modeloInicial({}), { modelo: 'atual', previa: false, loja: 'atual' })
  // a loja escolheu a Vitrine (o pagina.php pôs no <html>)
  assert.deepEqual(modeloInicial({ doHtml: 'vitrine' }), { modelo: 'vitrine', previa: false, loja: 'vitrine' })
  // o <html> vale mais que a última visita guardada no navegador
  assert.deepEqual(modeloInicial({ doHtml: 'atual', guardadoDaLoja: 'bairro' }), { modelo: 'atual', previa: false, loja: 'atual' })
  // sem o <html> (painel ou banco fora do ar): a última visita
  assert.deepEqual(modeloInicial({ guardadoDaLoja: 'bairro' }), { modelo: 'bairro', previa: false, loja: 'bairro' })
  // prévia pelo endereço (até ?modelo=0, o visual próprio) e a guardada nesta aba
  assert.deepEqual(modeloInicial({ daUrl: '0', doHtml: 'vitrine' }), { modelo: 'atual', previa: true, loja: 'vitrine' })
  assert.deepEqual(modeloInicial({ previaGuardada: 'estoque', doHtml: 'vitrine' }), { modelo: 'estoque', previa: true, loja: 'vitrine' })
  assert.deepEqual(modeloInicial({ daUrl: '3', previaGuardada: 'estoque' }), { modelo: 'bairro', previa: true, loja: 'atual' })
  // valor estranho não vale
  assert.deepEqual(modeloInicial({ daUrl: 'neon', doHtml: '<script>' }), { modelo: 'atual', previa: false, loja: 'atual' })
})

test('aparência: visual do painel só aceita os quatro que existem', () => {
  assert.deepEqual(PAINEIS.map((p) => p.id), ['atual', 'compacto', 'escuro', 'cor'])
  assert.equal(painelFromValue(' Escuro '), 'escuro')
  assert.equal(painelFromValue('cor'), 'cor')
  assert.equal(painelFromValue('vitrine'), null)
  assert.equal(painelFromValue(''), null)
  assert.equal(painelFromValue(null), null)
})

test('categorias da loja na ordem do site, só as que têm carro, com a contagem', () => {
  assert.deepEqual(categoryCounts(CARS).map((c) => [c.slug, c.label, c.count]), [
    ['hatch', 'Hatches', 2],
    ['suv', 'SUVs', 1],
    ['picape', 'Picapes', 1],
    ['moto', 'Motos', 1],
  ])
})

test('marcas da que tem mais carros para a que tem menos (empate: ordem alfabética)', () => {
  assert.deepEqual(brandCounts(CARS), [
    { brand: 'Fiat', count: 3 },
    { brand: 'Honda', count: 1 },
    { brand: 'Jeep', count: 1 },
  ])
})

test('ordem por preço deixa o "consulte o valor" no fim; menor km deixa sem km no fim', () => {
  assert.deepEqual(sortCars(CARS, 'menor-preco').map((c) => c.id), [4, 5, 1, 2, 3])
  assert.deepEqual(sortCars(CARS, 'maior-preco').map((c) => c.id), [2, 1, 5, 4, 3])
  assert.deepEqual(sortCars(CARS, 'menor-km').map((c) => c.id), [4, 2, 1, 3, 5])
  assert.deepEqual(sortCars(CARS).map((c) => c.id), [1, 2, 3, 4, 5])
})

test('filtro de categoria e marca e o link do estoque completo com os mesmos filtros', () => {
  assert.deepEqual(filterCars(CARS, { categoria: 'hatch', marca: 'Fiat' }).map((c) => c.id), [1, 5])
  assert.equal(filterCars(CARS, {}).length, 5)
  assert.equal(stockLink({ categoria: 'suv', marca: 'Jeep' }), '/estoque?categoria=suv&marca=Jeep')
  assert.equal(stockLink(), '/estoque')
})

test('palco da vitrine: só carros com foto, destaques primeiro', () => {
  assert.deepEqual(showcaseCars(CARS, 3).map((c) => c.id), [2, 5, 1])
})

test('listas dos modelos: destaques primeiro e carro sem foto no fim', () => {
  assert.deepEqual(photosFirst(CARS).map((c) => c.id), [2, 5, 1, 4, 3])
})

test('mapa só com endereço; preço "Consulte o valor" sem preço', () => {
  assert.equal(mapsLink([]), '')
  assert.match(mapsLink(['Av. Vitorino Freire, 50', 'Areinha, São Luís – MA']), /query=Av\.%20Vitorino%20Freire%2C%2050%2C%20Areinha/)
  assert.equal(priceText({ price: null }), 'Consulte o valor')
})
