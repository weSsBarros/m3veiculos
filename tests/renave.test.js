import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renaveEntryPending, renaveExitPending, renaveGaps, renavePendingLabel, renavePending } from '../src/utils/renave.js'

const car = (status, entry, exit, soldAt = null) => ({ status, renaveEntryStatus: entry, renaveExitStatus: exit, soldAt })
const SOLD_NOW = '2026-10-05T15:00:00.000Z'
const SOLD_OLD = '2026-09-10T15:00:00.000Z'

test('renave: entrada pendente até registrar ou dispensar; sem valor conta como pendente', () => {
  assert.equal(renaveEntryPending(car('disponivel', 'pendente', 'pendente')), true)
  assert.equal(renaveEntryPending(car('disponivel', undefined, undefined)), true)
  assert.equal(renaveEntryPending(car('disponivel', 'registrado', 'pendente')), false)
  assert.equal(renaveEntryPending(car('reservado', 'dispensado', 'pendente')), false)
})

test('renave: saída só fica pendente depois de vendido', () => {
  assert.equal(renaveExitPending(car('reservado', 'registrado', 'pendente')), false)
  assert.equal(renaveExitPending(car('vendido', 'registrado', 'pendente', SOLD_NOW)), true)
  assert.equal(renaveExitPending(car('vendido', 'registrado', 'registrado', SOLD_NOW)), false)
  assert.equal(renavePending(car('vendido', 'registrado', 'registrado', SOLD_NOW)), false)
})

test('renave: vendido antes de 28/09/2026 (ou sem data) não vira pendência', () => {
  assert.equal(renavePending(car('vendido', 'pendente', 'pendente', SOLD_OLD)), false)
  assert.equal(renavePending(car('vendido', 'pendente', 'pendente', null)), false)
  assert.equal(renavePending(car('vendido', 'pendente', 'pendente', '2026-09-28T12:00:00Z')), true)
})

test('renave: contagens e texto do que falta', () => {
  const cars = [
    car('disponivel', 'pendente', 'pendente'),
    car('vendido', 'pendente', 'pendente', SOLD_NOW),
    car('vendido', 'registrado', 'pendente', SOLD_NOW),
    car('vendido', 'dispensado', 'dispensado', SOLD_NOW),
    car('vendido', 'pendente', 'pendente', SOLD_OLD),
  ]
  assert.deepEqual(renaveGaps(cars), { entry: 2, exit: 2 })
  assert.equal(renavePendingLabel(cars[0]), 'RENAVE: entrada')
  assert.equal(renavePendingLabel(cars[1]), 'RENAVE: entrada e saída')
  assert.equal(renavePendingLabel(cars[2]), 'RENAVE: saída')
  assert.equal(renavePendingLabel(cars[3]), '')
  assert.equal(renavePendingLabel(cars[4]), '')
})
