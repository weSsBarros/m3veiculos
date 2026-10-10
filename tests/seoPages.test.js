import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pageSeo, storeCity } from '../src/utils/seoPages.js'
import { carPageTitle, carSummary } from '../src/utils/carSeo.js'

test('SEO: título e descrição das páginas, com a cidade quando a loja tem', () => {
  const store = { name: 'Dom Motors', city: 'São Luís', hasAddress: true }
  assert.deepEqual(pageSeo('/estoque', store), {
    title: 'Carros seminovos à venda em São Luís | Dom Motors',
    description: 'Dom Motors em São Luís: carros à venda com fotos, preço e quilometragem, e atendimento direto pelo WhatsApp.',
  })
  assert.equal(pageSeo('/contato', store).description, 'Dom Motors em São Luís: WhatsApp, telefone e endereço para falar direto com a equipe.')
  // Sem endereço cadastrado, não promete endereço; sem cidade, não inventa
  const semNada = { name: 'Ultra Seminovos', city: '', hasAddress: false }
  assert.equal(pageSeo('/contato', semNada).description, 'Ultra Seminovos: WhatsApp e telefone para falar direto com a equipe.')
  assert.equal(pageSeo('/estoque', semNada).title, 'Carros seminovos à venda | Ultra Seminovos')
  assert.equal(pageSeo('/', store), null)
  assert.equal(pageSeo('/carro/x', store), null)
})

test('SEO: cidade da loja pelo título, descrição ou endereço', () => {
  assert.equal(storeCity(['Av. dos Holandeses, 879', 'Araçagi, São Luís - MA'], 'Katirão Veículos | Estoque'), 'São Luís')
  assert.equal(storeCity([], 'Araçagy Veículos | Novos e seminovos em São José de Ribamar'), 'São José de Ribamar')
  assert.equal(storeCity([], 'Dom Motors | Carros usados selecionados', 'carros revisados'), '')
})

test('SEO: título e resumo da página do carro', () => {
  const car = { brand: 'Toyota', model: 'Corolla', version: 'XEi 2.0', modelYear: '2021/2022', km: 45000, transmission: 'Automático', fuel: 'Flex', color: 'Prata', price: 129900, status: 'disponivel' }
  assert.equal(carPageTitle(car, 'WB.AUTO', 'São Luís'), 'Toyota Corolla XEi 2.0 2021/2022 à venda em São Luís | WB.AUTO')
  assert.equal(carPageTitle({ ...car, status: 'vendido' }, 'WB.AUTO', ''), 'Vendido: Toyota Corolla XEi 2.0 2021/2022 | WB.AUTO')
  assert.equal(
    carSummary(car, 'WB.AUTO', 'São Luís'),
    'Toyota Corolla XEi 2.0 2021/2022 — 45.000 km, Automático, Flex, Prata, por R$ 129.900 na WB.AUTO, em São Luís.'
  )
})
