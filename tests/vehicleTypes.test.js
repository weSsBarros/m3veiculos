import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatMileage, mileageLabel, vehicleHasDoors, vehicleCountLabel, isCarCategory, fipeTipoForCategory } from '../src/utils/vehicleTypes.js'
import { VEHICLE_CATEGORIES, siteCategories } from '../src/utils/carFormat.js'

test('tipos de veículo: caminhão, jet ski, quadriciclo e UTV no painel', () => {
  const slugs = VEHICLE_CATEGORIES.map((c) => c.slug)
  for (const slug of ['suv', 'sedan', 'hatch', 'picape', 'moto', 'caminhao', 'jetski', 'quadriciclo', 'utv']) assert.ok(slugs.includes(slug), slug)
})

test('tipos de veículo: no site só aparecem os que a loja tem', () => {
  const base = siteCategories([{ category: 'suv' }]).map((c) => c.slug)
  assert.deepEqual(base, ['suv', 'sedan', 'hatch', 'picape'])
  const withJet = siteCategories([{ category: 'suv' }, { category: 'jetski' }]).map((c) => c.slug)
  assert.deepEqual(withJet.slice(4), ['jetski'])
})

test('tipos de veículo: horas de uso só no jet ski, portas só em quem tem', () => {
  assert.equal(formatMileage({ km: 45000, category: 'suv' }), '45.000 km')
  assert.equal(formatMileage({ km: 120, category: 'jetski' }), '120 h')
  assert.equal(formatMileage({ km: 3500, category: 'quadriciclo' }), '3.500 km')
  assert.equal(formatMileage({ km: null, category: 'suv' }), '')
  assert.equal(mileageLabel('jetski'), 'Horas de uso')
  assert.equal(mileageLabel('caminhao'), 'Quilometragem')
  assert.deepEqual(['suv', 'caminhao', 'moto', 'jetski', 'quadriciclo', 'utv'].map(vehicleHasDoors), [true, true, false, false, false, false])
})

test('tipos de veículo: contagem, portais e tabela FIPE', () => {
  assert.equal(vehicleCountLabel('suv', 1), '1 carro')
  assert.equal(vehicleCountLabel('caminhao', 2), '2 caminhões')
  assert.equal(vehicleCountLabel('utv', 3), '3 UTVs')
  assert.equal(isCarCategory('picape'), true)
  assert.equal(isCarCategory('moto'), false)
  assert.equal(isCarCategory('jetski'), false)
  assert.deepEqual(['moto', 'caminhao', 'jetski', 'sedan'].map(fipeTipoForCategory), ['motos', 'caminhoes', 'carros', 'carros'])
})
