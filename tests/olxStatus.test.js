import { test } from 'node:test'
import assert from 'node:assert/strict'
import { olxCarState, olxSummary, olxMatchesFilter, olxSellerPhones, olxCatalogLabel, olxStateOrder } from '../src/utils/olxStatus.js'

const account = { connected: true, autoPublish: false, siteUrl: 'https://loja.com.br', zip: '65077357', mainPhone: '5598981295577', settings: {} }
const car = (over = {}) => ({
  id: 'c1', brand: 'Fiat', model: 'Argo', version: 'Drive 1.0', year: 2021, modelYear: '2021/2022', km: 30000, transmission: 'Manual',
  fuel: 'Flex', color: 'Branco', doors: 4, category: 'hatch', condition: 'Único dono', price: 70000, highlights: [], description: '',
  images: ['/uploads/carros/0123456789abcdef0123456789abcdef.webp'], status: 'disponivel', hidden: false, plate: 'ABC1D23',
  entryType: 'showroom', olxPublish: true, olxCatalog: { brandId: 1, modelId: 2, versionId: 3 }, ...over,
})
const ctx = { account, sellerPhones: {} }
const ad = (status, over = {}) => ({ status, operation: 'insert', listId: '', url: '', message: '', ...over })

test('olx situação: sem conta conectada não mostra nada', () => {
  assert.equal(olxCarState(car(), null, { account: { connected: false } }), null)
  assert.equal(olxCarState(car(), null, { account: null }), null)
})

test('olx situação: pronto, na fila, faltam dados e fora da OLX', () => {
  assert.equal(olxCarState(car(), null, ctx).key, 'pronto')
  assert.equal(olxCarState(car(), null, { ...ctx, account: { ...account, autoPublish: true } }).key, 'fila')
  const missing = olxCarState(car({ plate: '', olxCatalog: {} }), null, ctx)
  assert.equal(missing.key, 'faltam')
  assert.equal(missing.problem, true)
  assert.equal(missing.detail, 'Falta: placa, marca, modelo e versão da OLX.')
  assert.equal(olxCarState(car({ status: 'vendido' }), null, ctx).key, 'fora')
  assert.equal(olxCarState(car({ status: 'vendido' }), ad('publicado'), ctx).key, 'saindo')
  assert.equal(olxCarState(car({ status: 'vendido' }), ad('removendo', { operation: 'delete' }), ctx).key, 'removendo')
  assert.equal(olxCarState(car({ olxPublish: false }), ad('removido', { operation: 'delete' }), ctx).detail, 'Desmarcado para a OLX')
})

test('olx situação: estados do anúncio', () => {
  assert.equal(olxCarState(car(), ad('publicado'), ctx).label, 'Na OLX')
  assert.equal(olxCarState(car(), ad('aguardando'), ctx).label, 'Aguardando a OLX')
  assert.equal(olxCarState(car(), ad('aguardando', { listId: '8' }), ctx).label, 'Atualizando na OLX')
  assert.equal(olxCarState(car(), ad('recusado', { message: 'recusado pela OLX: preço' }), ctx).problem, true)
  assert.equal(olxCarState(car(), ad('erro'), ctx).problem, true)
  assert.equal(olxCarState(car(), ad('sem_vaga'), ctx).key, 'sem_vaga')
  assert.equal(olxCarState(car(), ad('removido_olx'), ctx).problem, true)
  assert.equal(olxCarState(car(), ad('expirado'), ctx).key, 'expirado')
  assert.equal(olxCarState(car(), ad('simulado'), ctx).key, 'simulado')
  // Publicado, mas o carro perdeu a placa: avisa no detalhe
  assert.match(olxCarState(car({ plate: '' }), ad('publicado'), ctx).detail, /Falta: placa/)
})

test('olx situação: contagens, filtros, ordem e rótulos', () => {
  const states = [
    olxCarState(car(), ad('publicado'), ctx),
    olxCarState(car(), ad('aguardando'), ctx),
    olxCarState(car({ plate: '' }), null, ctx),
    olxCarState(car(), null, ctx),
    olxCarState(car({ status: 'reservado' }), null, ctx),
  ]
  assert.deepEqual(olxSummary(states), { publicados: 1, aguardando: 1, problemas: 1, prontos: 1, fora: 1 })
  assert.equal(states.filter((s) => olxMatchesFilter(s, 'problemas')).length, 1)
  assert.equal(states.filter((s) => olxMatchesFilter(s, 'todos')).length, 5)
  assert.ok(olxStateOrder(states[2]) < olxStateOrder(states[0]))
  assert.deepEqual(olxSellerPhones([{ id: 'a', active: true, phone: '98' }, { id: 'b', active: false, phone: '97' }, { id: 'c', active: true, phone: '' }]), { a: '98' })
  assert.equal(olxCatalogLabel({ brandName: 'HONDA', modelName: 'CG', ccName: '150' }), 'HONDA · CG · 150 cc')
})
