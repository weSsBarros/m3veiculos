import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isTabHidden, isBlockHidden, normalizePanelSettings, tabForPath, toggleHiddenTab } from '../src/utils/panelSettings.js'
import { fillTemplate, normalizeTemplates, DEFAULT_TEMPLATES, firstName } from '../src/utils/messageTemplates.js'
import { interestMatchesCar, matchingStockCars, likedCarGone, describeInterest } from '../src/utils/customerInterests.js'
import { nextRotationEntry, waDigits, formatWaPhone, entryProblem } from '../src/utils/whatsappRotation.js'
import { isPendencyVisible, lowerDismissedCount, customerGaps } from '../src/utils/dashboardAlerts.js'
import { parseWhatsappUrl, carSlugFromText } from '../src/utils/whatsappLinks.js'
import { buildLeadsReport } from '../src/utils/reports/build.js'

test('painel: aba escondida de todos vale para o admin; por papel, só para o papel', () => {
  const settings = { hiddenTabs: { all: ['fornecedores'], manager: ['equipe'], seller: ['relatorios'] }, hiddenBlocks: ['visits'] }
  assert.equal(isTabHidden(settings, 'fornecedores', 'admin'), true)
  assert.equal(isTabHidden(settings, 'equipe', 'admin'), false)
  assert.equal(isTabHidden(settings, 'equipe', 'manager'), true)
  assert.equal(isTabHidden(settings, 'relatorios', 'manager'), false)
  assert.equal(isTabHidden(settings, 'relatorios', 'seller'), true)
  assert.equal(isTabHidden(settings, null, 'seller'), false)
  assert.equal(isBlockHidden(settings, 'visits'), true)
  assert.equal(isBlockHidden(null, 'visits'), false)
  // Configuração vazia ou estragada não esconde nada
  assert.deepEqual(normalizePanelSettings('x'), { hiddenTabs: { all: [], manager: [], seller: [] }, hiddenBlocks: [] })
  const toggled = toggleHiddenTab(toggleHiddenTab(null, 'seller', 'vendas'), 'seller', 'clientes')
  assert.deepEqual(toggled.hiddenTabs.seller, ['vendas', 'clientes'])
  assert.deepEqual(toggleHiddenTab(toggled, 'seller', 'vendas').hiddenTabs.seller, ['clientes'])
})

test('painel: aba de cada endereço (edição do carro conta como Estoque)', () => {
  assert.equal(tabForPath('/admin/carros/novo'), 'novo-carro')
  assert.equal(tabForPath('/admin/carros/abc/gastos'), 'estoque')
  assert.equal(tabForPath('/admin/financeiro/clientes'), 'financeiro')
  assert.equal(tabForPath('/admin/contratos/modelos'), 'contratos')
  assert.equal(tabForPath('/admin'), null)
  assert.equal(tabForPath('/admin/configuracoes'), null)
})

test('mensagens prontas: campos preenchidos e campo vazio sem deixar sobra', () => {
  const text = 'Olá, {nome}! Aqui é {vendedor}, da {loja}. Chegou um {carro}: {link}'
  assert.equal(
    fillTemplate(text, { nome: 'Maria', vendedor: 'João', loja: 'WB.AUTO', carro: 'Corolla XEi 2022', link: 'https://x/carro/corolla' }),
    'Olá, Maria! Aqui é João, da WB.AUTO. Chegou um Corolla XEi 2022: https://x/carro/corolla'
  )
  assert.equal(fillTemplate('Olá, {nome}! Tudo bem?', {}), 'Olá! Tudo bem?')
  assert.equal(fillTemplate('Aqui é {vendedor}, da {loja}.', { loja: 'WB.AUTO' }), 'Aqui é da WB.AUTO.')
  assert.equal(fillTemplate('Campo {desconhecido} fica', { nome: 'x' }), 'Campo {desconhecido} fica')
  assert.equal(firstName('  Maria  da Silva '), 'Maria')
  assert.deepEqual(normalizeTemplates([]), DEFAULT_TEMPLATES)
  assert.deepEqual(normalizeTemplates([{ name: 'A', text: 'oi' }, { name: '', text: 'sem nome' }]), [{ id: 'modelo-1', name: 'A', text: 'oi' }])
})

test('interesse do cliente: mesma regra do banco para carro que combina', () => {
  const car = { brand: 'Toyota', model: 'Corolla', version: 'XEi 2.0', category: 'sedan', year: 2021, km: 30000, transmission: 'Automático CVT', price: 110000, status: 'disponivel', hidden: false }
  const base = { kind: 'procura', active: true, brand: '', model: '', category: '', transmission: '', yearMin: null, priceMax: null, kmMax: null }
  assert.equal(interestMatchesCar({ ...base, brand: 'TOYOTA', model: 'corolla', priceMax: 120000 }, car), true)
  assert.equal(interestMatchesCar({ ...base, model: 'xei' }, car), true)
  assert.equal(interestMatchesCar({ ...base, transmission: 'automatico' }, car), true)
  assert.equal(interestMatchesCar({ ...base, brand: 'Honda' }, car), false)
  assert.equal(interestMatchesCar({ ...base, priceMax: 100000 }, car), false)
  assert.equal(interestMatchesCar({ ...base, yearMin: 2022 }, car), false)
  assert.equal(interestMatchesCar({ ...base, kmMax: 20000 }, car), false)
  // Sem critério nenhum, pausado ou "carro do estoque" não gera aviso
  assert.equal(interestMatchesCar(base, car), false)
  assert.equal(interestMatchesCar({ ...base, brand: 'Toyota', active: false }, car), false)
  assert.equal(interestMatchesCar({ ...base, kind: 'estoque', brand: 'Toyota' }, car), false)
  // Carro sem preço não combina com quem tem preço máximo
  assert.equal(interestMatchesCar({ ...base, priceMax: 200000 }, { ...car, price: null }), false)
  // No estoque: só disponível e visível
  const cars = [car, { ...car, status: 'vendido' }, { ...car, hidden: true }]
  assert.equal(matchingStockCars({ ...base, brand: 'Toyota' }, cars).length, 1)
  assert.equal(describeInterest({ ...base, brand: 'Toyota', model: 'Corolla', yearMin: 2019, priceMax: 120000 }, { formatCurrency: (v) => `R$ ${v}` }), 'Toyota Corolla · a partir de 2019 · até R$ 120000')
})

test('interesse do cliente: carro de que gostou vendido para outra pessoa', () => {
  const interest = { kind: 'estoque', active: true, customerId: 'c1', carId: 'car1' }
  assert.equal(likedCarGone(interest, { status: 'vendido', customerId: 'c2' }), true)
  assert.equal(likedCarGone(interest, { status: 'reservado', customerId: null }), true)
  assert.equal(likedCarGone(interest, { status: 'vendido', customerId: 'c1' }), false)
  assert.equal(likedCarGone(interest, { status: 'disponivel' }), false)
})

test('rodízio: em sequência depois do último, pulando pausado, sem telefone e fora da Equipe', () => {
  const sellersById = {
    s1: { id: 's1', name: 'Ana', phone: '(98) 91111-0001', active: true },
    s2: { id: 's2', name: 'Bia', phone: '(98) 91111-0002', active: false },
    s3: { id: 's3', name: 'Caio', phone: '', active: true },
  }
  const entries = [
    { id: 'a', sellerId: 's1', name: '', phone: '', active: true, position: 1, createdAt: '2026-01-01' },
    { id: 'b', sellerId: 's2', name: '', phone: '', active: true, position: 2, createdAt: '2026-01-01' },
    { id: 'c', sellerId: 's3', name: '', phone: '', active: true, position: 3, createdAt: '2026-01-01' },
    { id: 'd', sellerId: null, name: 'Recepção', phone: '98 3222-0003', active: true, position: 4, createdAt: '2026-01-01' },
    { id: 'e', sellerId: null, name: 'Pausado', phone: '98 99999-0000', active: false, position: 5, createdAt: '2026-01-01' },
  ]
  assert.equal(nextRotationEntry(entries, null, sellersById).id, 'a')
  assert.equal(nextRotationEntry(entries, 'a', sellersById).id, 'd')
  assert.equal(nextRotationEntry(entries, 'd', sellersById).id, 'a')
  assert.equal(nextRotationEntry(entries, 'removido', sellersById).id, 'a')
  assert.equal(entryProblem(entries[1], sellersById), 'fora da Equipe')
  assert.equal(entryProblem(entries[2], sellersById), 'sem telefone')
  assert.equal(entryProblem(entries[4], sellersById), 'pausado')
  assert.equal(nextRotationEntry([entries[4]], null, sellersById), null)
  assert.equal(waDigits('(98) 99911-3000'), '5598999113000')
  assert.equal(waDigits('+55 98 91116644'), '559891116644')
  assert.equal(waDigits('123'), '')
  assert.equal(formatWaPhone('559891116644'), '(98) 9111-6644')
})

test('pendências: excluir esconde até a contagem aumentar; adiar esconde até a hora', () => {
  const now = new Date('2026-10-01T12:00:00Z')
  assert.equal(isPendencyVisible(null, 3, now), true)
  assert.equal(isPendencyVisible(null, 0, now), false)
  assert.equal(isPendencyVisible({ dismissedCount: 3 }, 3, now), false)
  assert.equal(isPendencyVisible({ dismissedCount: 3 }, 4, now), true)
  assert.equal(isPendencyVisible({ snoozedUntil: '2026-10-01T18:00:00Z' }, 5, now), false)
  assert.equal(isPendencyVisible({ snoozedUntil: '2026-10-01T06:00:00Z' }, 5, now), true)
  // Resolveu parte: guarda a contagem menor para avisar do próximo item novo
  assert.equal(lowerDismissedCount({ dismissedCount: 3 }, 1), 1)
  assert.equal(lowerDismissedCount({ dismissedCount: 3 }, 3), null)
  assert.equal(lowerDismissedCount({ snoozedUntil: 'x' }, 1), null)
})

test('pendências de clientes: só os do vendedor (ou sem responsável)', () => {
  const matches = [
    { customerId: 'c1', status: 'novo' },
    { customerId: 'c1', status: 'novo' },
    { customerId: 'c2', status: 'novo' },
    { customerId: 'c3', status: 'avisado' },
  ]
  const contacts = [
    { customerId: 'c1', followUpOn: '2026-10-01', followUpDone: false, createdBy: 'u1' },
    { customerId: 'c2', followUpOn: '2026-10-05', followUpDone: false, createdBy: 'u1' },
    { customerId: 'c2', followUpOn: '2026-09-20', followUpDone: true, createdBy: 'u1' },
  ]
  const interests = [{ kind: 'estoque', active: true, customerId: 'c2', carId: 'car1' }]
  const cars = [{ id: 'car1', status: 'vendido', customerId: 'c9' }]
  const all = customerGaps({ matches, contacts, interests, cars, today: '2026-10-01' })
  assert.deepEqual(all, { newMatches: 2, followUps: 1, likedCarGone: 1 })
  const onlyC1 = customerGaps({ matches, contacts, interests, cars, today: '2026-10-01', mine: (id) => id === 'c1' })
  assert.deepEqual(onlyC1, { newMatches: 1, followUps: 1, likedCarGone: 0 })
})

test('site: link do WhatsApp e carro da mensagem', () => {
  assert.deepEqual(parseWhatsappUrl('https://wa.me/5598988975777?text=Ol%C3%A1'), { number: '5598988975777', text: 'Olá' })
  assert.deepEqual(parseWhatsappUrl('https://api.whatsapp.com/send?phone=5598900000000&text=x'), { number: '5598900000000', text: 'x' })
  assert.equal(parseWhatsappUrl('https://example.com'), null)
  assert.equal(carSlugFromText('Tenho interesse:\nhttps://loja.com/carro/toyota-corolla-xei-2022'), 'toyota-corolla-xei-2022')
  assert.equal(carSlugFromText('Quero vender meu carro'), null)
})

test('relatório de contatos do WhatsApp: por vendedor, por carro e lista', () => {
  const leads = [
    { sellerId: 's1', rotationId: 'r1', carId: 'car1', isReturning: false, createdAt: '2026-09-10T13:00:00Z' },
    { sellerId: 's1', rotationId: 'r1', carId: 'car1', isReturning: true, createdAt: '2026-09-11T13:00:00Z' },
    { sellerId: null, rotationId: 'r2', carId: null, isReturning: false, createdAt: '2026-09-12T13:00:00Z' },
    { sellerId: null, rotationId: null, carId: null, isReturning: false, createdAt: '2026-09-13T13:00:00Z' },
    { sellerId: 's1', rotationId: 'r1', carId: 'car1', isReturning: false, createdAt: '2026-08-01T13:00:00Z' },
  ]
  const report = buildLeadsReport({
    leads,
    team: [{ id: 's1', name: 'Ana' }],
    rotation: [{ id: 'r2', name: 'Recepção' }],
    cars: [{ id: 'car1', brand: 'Toyota', model: 'Corolla', version: 'XEi' }],
    range: { start: '2026-09-01', end: '2026-09-30' },
  })
  const [byPerson, byCar, list] = report.sections
  assert.deepEqual(byPerson.rows[0], { name: 'Ana', fresh: 1, returning: 1, total: 2 })
  assert.deepEqual(byPerson.totals, { name: 'Total', fresh: 3, returning: 1, total: 4 })
  assert.ok(byPerson.rows.some((r) => r.name === 'Recepção') && byPerson.rows.some((r) => r.name === 'Número principal'))
  assert.deepEqual(byCar.rows[0], { car: 'Toyota Corolla XEi', total: 2 })
  assert.equal(list.rows.length, 4)
})
