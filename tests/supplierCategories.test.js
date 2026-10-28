import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { SUPPLIER_CATEGORIES, supplierCategoryLabel } from '../src/utils/carFormat.js'

test('fornecedor: as categorias do painel são as mesmas da regra do banco (seção 97)', () => {
  const schema = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
  const rules = [...schema.matchAll(/add constraint suppliers_category_check check \(category in \(([^)]*)\)\)/g)]
  assert.ok(rules.length > 0, 'regra suppliers_category_check não encontrada no schema.sql')
  const inDatabase = [...rules.at(-1)[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
  assert.deepEqual(SUPPLIER_CATEGORIES.map((c) => c.slug), inDatabase)
})

test('fornecedor: categorias sem repetição e as antigas continuam', () => {
  const slugs = SUPPLIER_CATEGORIES.map((c) => c.slug)
  assert.equal(new Set(slugs).size, slugs.length)
  for (const old of ['servico', 'pecas', 'outros']) assert.ok(slugs.includes(old), old)
  assert.equal(supplierCategoryLabel('lava_jato'), 'Lava jato')
  assert.equal(supplierCategoryLabel('estetica'), 'Higienização e estética')
})
