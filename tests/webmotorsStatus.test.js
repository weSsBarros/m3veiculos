import { test } from 'node:test'
import assert from 'node:assert/strict'
import { webmotorsCarState, webmotorsCatalogLabel, webmotorsModality, webmotorsLive, webmotorsMissingText } from '../src/utils/webmotorsStatus.js'
import { portalSummary, portalMatchesFilter, portalStateOrder, portalBadge, portalFilters } from '../src/utils/portalStatus.js'

const modalities = [{ code: 2943, name: 'Usados', type: 'U', total: 30, used: 2, photos: true }]
const account = { connected: true, autoPublish: false, siteUrl: 'https://loja.com.br', modalityCode: '2943', modalities, settings: {} }
const car = (over = {}) => ({
  id: 'c1', brand: 'Fiat', model: 'Argo', version: 'Drive 1.0', year: 2021, modelYear: '2021/2022', km: 30000, transmission: 'Manual',
  fuel: 'Flex', color: 'Branco', doors: 4, category: 'hatch', condition: 'Único dono', price: 70000, highlights: [], description: '',
  images: ['/uploads/carros/0123456789abcdef0123456789abcdef.webp'], status: 'disponivel', hidden: false, plate: 'ABC1D23',
  entryType: 'showroom', webmotorsPublish: true, webmotorsCatalog: { brandId: 1, brandName: 'FIAT', modelId: 2, modelName: 'ARGO', versionId: 3, versionName: '1.0 DRIVE' },
  ...over,
})
const ctx = { account }
const ad = (status, over = {}) => ({ status, adCode: null, message: '', ...over })

test('webmotors situação: sem conta conectada não mostra nada', () => {
  assert.equal(webmotorsCarState(car(), null, { account: { connected: false } }), null)
  assert.equal(webmotorsCarState(car(), null, { account: null }), null)
})

test('webmotors situação: pronto, na fila, faltam dados, sem modalidade e fora', () => {
  assert.equal(webmotorsCarState(car(), null, ctx).key, 'pronto')
  assert.equal(webmotorsCarState(car(), null, { account: { ...account, autoPublish: true } }).key, 'fila')
  const missing = webmotorsCarState(car({ plate: '', webmotorsCatalog: {} }), null, ctx)
  assert.equal(missing.key, 'faltam')
  assert.equal(missing.problem, true)
  assert.equal(missing.detail, 'Falta: marca, modelo e versão da Webmotors, placa.')
  // Com as listas da Webmotors, também confere a cor
  const lists = { cores: [{ id: 1, name: 'Preto' }], cambios: [{ id: 2, name: 'Manual' }], combustiveis: [{ id: 3, name: 'Gasolina e álcool' }] }
  assert.match(webmotorsCarState(car(), null, { account, lists }).detail, /cor na lista da Webmotors/)
  assert.equal(webmotorsCarState(car({ color: 'Preto' }), null, { account, lists }).key, 'pronto')
  // Sem a modalidade escolhida: não é problema do carro, mas avisa
  const noModality = webmotorsCarState(car(), null, { account: { ...account, modalityCode: '' } })
  assert.equal(noModality.key, 'pronto')
  assert.match(noModality.detail, /modalidade do plano/)
  assert.equal(webmotorsCarState(car({ status: 'vendido' }), null, ctx).key, 'fora')
  assert.equal(webmotorsCarState(car({ status: 'vendido' }), ad('publicado', { adCode: 9 }), ctx).key, 'saindo')
  assert.equal(webmotorsCarState(car({ category: 'moto' }), null, ctx).detail, 'Moto (a Webmotors usa outro serviço para motos)')
})

test('webmotors situação: estados do anúncio', () => {
  assert.equal(webmotorsCarState(car(), ad('publicado', { adCode: 9 }), ctx).label, 'Na Webmotors')
  // Atualização recusada: o anúncio continua no ar, mas é problema
  const updateError = webmotorsCarState(car(), ad('erro', { adCode: 9, message: 'a Webmotors recusou (código 22)' }), ctx)
  assert.equal(updateError.label, 'Erro na Webmotors')
  assert.equal(updateError.problem, true)
  assert.equal(webmotorsCarState(car(), ad('erro'), ctx).label, 'Recusado pela Webmotors')
  assert.equal(webmotorsCarState(car(), ad('pendente', { adCode: 9 }), ctx).label, 'Atualizando na Webmotors')
  assert.equal(webmotorsCarState(car(), ad('pendente'), ctx).label, 'Na fila')
  assert.equal(webmotorsCarState(car(), ad('sem_vaga'), ctx).problem, true)
  assert.equal(webmotorsCarState(car(), ad('removido_wm', { adCode: 9 }), ctx).key, 'removido_wm')
  assert.equal(webmotorsCarState(car(), ad('simulado'), ctx).key, 'simulado')
  assert.equal(webmotorsCarState(car(), ad('removido', { adCode: 9 }), ctx).key, 'pronto')
  assert.match(webmotorsCarState(car({ plate: '' }), ad('publicado', { adCode: 9 }), ctx).detail, /Falta: placa/)
})

test('webmotors situação: rótulos, modalidade e no ar', () => {
  assert.equal(webmotorsCatalogLabel(car().webmotorsCatalog), 'FIAT · ARGO · 1.0 DRIVE')
  assert.equal(webmotorsCatalogLabel(null), '')
  assert.equal(webmotorsModality(account).name, 'Usados')
  assert.equal(webmotorsModality({ ...account, modalityCode: '1' }), null)
  assert.equal(webmotorsLive({ adCode: 9, status: 'erro' }), true)
  assert.equal(webmotorsLive({ adCode: 9, status: 'removido' }), false)
  assert.equal(webmotorsLive({ adCode: null, status: 'publicado' }), false)
  assert.equal(webmotorsMissingText(['placa', 'foto']), 'placa, foto')
})

test('portais: contagens, filtros, ordem e etiqueta do estoque', () => {
  const states = [
    webmotorsCarState(car(), ad('publicado', { adCode: 9 }), ctx),
    webmotorsCarState(car(), ad('pendente'), ctx),
    webmotorsCarState(car({ plate: '' }), null, ctx),
    webmotorsCarState(car(), null, ctx),
    webmotorsCarState(car({ status: 'reservado' }), null, ctx),
  ]
  assert.deepEqual(portalSummary(states), { publicados: 1, aguardando: 1, problemas: 1, prontos: 1, fora: 1 })
  assert.equal(states.filter((s) => portalMatchesFilter(s, 'problemas')).length, 1)
  assert.equal(states.filter((s) => portalMatchesFilter(s, 'todos')).length, 5)
  assert.ok(portalStateOrder(states[2]) < portalStateOrder(states[0]))
  assert.deepEqual(portalFilters('Webmotors').map((f) => f.label), ['Todos', 'Com problema', 'Na Webmotors', 'Prontos', 'Fora da Webmotors'])
  assert.deepEqual(portalBadge(states[0], 'Webmotors'), { label: 'Na Webmotors', tone: 'is-ok' })
  assert.deepEqual(portalBadge(states[2], 'Webmotors'), { label: 'Webmotors: faltam dados', tone: 'is-problem' })
  assert.deepEqual(portalBadge(states[1], 'Webmotors'), { label: 'Webmotors: na fila', tone: 'is-wait' })
  assert.equal(portalBadge(states[3], 'Webmotors'), null)
  assert.equal(portalBadge(null, 'OLX'), null)
})
