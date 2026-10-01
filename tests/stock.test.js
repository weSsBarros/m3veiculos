import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildInspection, buildIntake, compactChecklist, deliveryChecklistFromIntake, inspectionSummary } from '../src/utils/carChecklists.js'
import { describePayment, contractPaymentText } from '../src/utils/payment.js'
import { computeExternalCommission, describeExternalCommission, isStaleAnalysis } from '../src/utils/externalFinancing.js'
import { stockGaps, saleGaps, externalGaps, unpaidCommissions, reservationGaps } from '../src/utils/dashboardAlerts.js'
import { reservationAlert } from '../src/utils/reservations.js'
import { isDueSoon } from '../src/utils/financing.js'
import { buildSalesReport, buildStockReport, buildCustomersReport } from '../src/utils/reports/build.js'
import { setViewScope, scopeSales, scopeCars, scopeByCreator, scopeExpenses, scopeSellers, scopeActivity, assertCanWrite } from '../src/lib/viewScope.js'
import { removedPhotos } from '../src/utils/carPhotos.js'

test('cadastro: itens que vieram com o carro e vistoria juntam a lista da loja com o que foi gravado', () => {
  const intake = buildIntake(['Manual', 'Chave reserva'], [{ item: 'Chave reserva', status: 'ok' }, { item: 'Rádio', status: 'nao_possui' }])
  assert.deepEqual(intake, [
    { item: 'Manual', status: null },
    { item: 'Chave reserva', status: 'ok' },
    { item: 'Rádio', status: 'nao_possui' },
  ])
  const inspection = buildInspection(['Pneus', 'Motor'], [{ item: 'Pneus', status: 'atencao', note: 'trocar dianteiros' }])
  assert.deepEqual(inspection[0], { item: 'Pneus', status: 'atencao', note: 'trocar dianteiros' })
  assert.deepEqual(inspection[1], { item: 'Motor', status: null, note: '' })
  assert.deepEqual(inspectionSummary(inspection), { total: 2, ok: 0, atencao: 1, ruim: 0, pending: 1 })
  // Só o que foi preenchido é gravado
  assert.deepEqual(compactChecklist(inspection), [{ item: 'Pneus', status: 'atencao', note: 'trocar dianteiros' }])
  assert.deepEqual(compactChecklist(intake), [{ item: 'Chave reserva', status: 'ok' }, { item: 'Rádio', status: 'nao_possui' }])
})

test('venda: checklist de entrega já vem com o que veio com o carro', () => {
  const intake = [{ item: 'chave reserva', status: 'ok' }, { item: 'Estepe', status: 'nao_possui' }]
  assert.deepEqual(deliveryChecklistFromIntake(['Chave reserva', 'Estepe', 'Manual'], intake), [
    { item: 'Chave reserva', status: 'ok' },
    { item: 'Estepe', status: 'nao_possui' },
    { item: 'Manual', status: null },
  ])
  // Venda já registrada mantém o que foi marcado nela
  assert.deepEqual(deliveryChecklistFromIntake(['Estepe'], intake, [{ item: 'Estepe', status: 'ok' }]), [{ item: 'Estepe', status: 'ok' }])
})

test('forma de pagamento e banco no contrato', () => {
  assert.equal(describePayment({ paymentMethod: 'financiado', bank: 'Banco do Brasil' }), 'Financiado — Banco do Brasil')
  assert.equal(describePayment({ paymentMethod: 'financiado', bank: '' }), 'Financiado')
  assert.equal(describePayment({ paymentMethod: 'a_vista' }), 'À vista')
  assert.equal(describePayment({ paymentMethod: '' }), '')
  assert.equal(contractPaymentText('Financiado', 'Caixa'), 'Financiado pelo Caixa')
  assert.equal(contractPaymentText('À vista', 'Caixa'), 'À vista')
})

test('financiamento externo: comissão igual à do banco e aviso de análise parada', () => {
  assert.equal(computeExternalCommission('percent_financed', 1.5, 60000, 3000), 900)
  assert.equal(computeExternalCommission('percent_return', 10, 60000, 3000), 300)
  assert.equal(computeExternalCommission('percent_return', 10, 60000, null), 0)
  assert.equal(computeExternalCommission('fixed', 250, 60000, 3000), 250)
  assert.equal(computeExternalCommission('none', 5, 60000, 3000), 0)
  assert.match(describeExternalCommission('percent_financed', 1.5), /1,5% do financiado/)
  const today = new Date('2026-09-20T12:00:00')
  assert.equal(isStaleAnalysis({ status: 'em_analise', submittedOn: '2026-09-10' }, 7, today), true)
  assert.equal(isStaleAnalysis({ status: 'em_analise', submittedOn: '2026-09-15' }, 7, today), false)
  assert.equal(isStaleAnalysis({ status: 'aprovado', submittedOn: '2026-09-01' }, 7, today), false)
})

test('reserva: vencida e vencendo', () => {
  const today = new Date('2026-09-20T10:00:00')
  assert.equal(reservationAlert({ status: 'ativa', reservedUntil: '2026-09-19' }, 2, today), 'vencida')
  assert.equal(reservationAlert({ status: 'ativa', reservedUntil: '2026-09-21' }, 2, today), 'vence_logo')
  assert.equal(reservationAlert({ status: 'ativa', reservedUntil: '2026-09-30' }, 2, today), null)
  assert.equal(reservationAlert({ status: 'cancelada', reservedUntil: '2026-09-19' }, 2, today), null)
  assert.deepEqual(
    reservationGaps([{ status: 'ativa', reservedUntil: '2026-09-19' }, { status: 'ativa', reservedUntil: '2026-09-21' }], today),
    { expired: 1, dueSoon: 1 }
  )
})

test('parcela vencendo nos próximos 7 dias', () => {
  assert.equal(isDueSoon({ dueDate: '2026-09-25', paidOn: null }, '2026-09-20'), true)
  assert.equal(isDueSoon({ dueDate: '2026-09-28', paidOn: null }, '2026-09-20'), false)
  assert.equal(isDueSoon({ dueDate: '2026-09-19', paidOn: null }, '2026-09-20'), false)
  assert.equal(isDueSoon({ dueDate: '2026-09-25', paidOn: '2026-09-18' }, '2026-09-20'), false)
})

test('Dashboard: carros e vendas incompletos, externos e comissões a pagar', () => {
  const cars = [
    { id: 'a', status: 'disponivel', images: [], price: null, documents: [] },
    { id: 'b', status: 'reservado', images: ['/x.webp'], price: 50000, documents: [{ path: 'p' }] },
    { id: 'c', status: 'vendido', images: [], price: null, documents: [], customerId: null },
    { id: 'd', status: 'vendido', images: [], price: 1, documents: [], customerId: 'cli' },
  ]
  assert.deepEqual(stockGaps(cars), { noPhoto: 1, noPrice: 1, noDocs: 1 })
  const sales = [
    { carId: 'c', saleDate: '2026-09-10', checklist: [{ item: 'x', status: null }], sellerId: 's1', commissionAmount: 500, commissionPaidOn: null },
    { carId: 'd', saleDate: '2026-09-11', checklist: [{ item: 'x', status: 'ok' }], sellerId: 's1', commissionAmount: 300, commissionPaidOn: '2026-09-15' },
    { carId: 'd', saleDate: '2025-01-01', checklist: [], sellerId: null, commissionAmount: 0 },
  ]
  assert.deepEqual(saleGaps({ sales, cars, contracts: [{ carId: 'd' }], today: '2026-09-20' }), { noCustomer: 1, noContract: 1, checklistIncomplete: 1 })
  const externals = [
    { status: 'pago', sellerId: 's1', commissionAmount: 200, commissionPaidOn: null, submittedOn: '2026-09-01' },
    { status: 'aprovado', sellerId: 's1', commissionAmount: 100, commissionPaidOn: null, submittedOn: '2026-09-01' },
    { status: 'em_analise', sellerId: 's1', commissionAmount: 0, submittedOn: '2026-09-01' },
  ]
  assert.deepEqual(unpaidCommissions(sales, externals), { count: 2, amount: 700 })
  assert.deepEqual(externalGaps(externals, { today: new Date('2026-09-20T12:00:00') }), { staleAnalysis: 1, approvedUnpaid: 1 })
})

test('relatórios: vendas e comissões, estoque sem custo para quem não vê custos, clientes', () => {
  const cars = [
    { id: 'c1', brand: 'Fiat', model: 'Argo', version: 'Drive', plate: 'abc1d23', status: 'vendido', customerId: 'k1', createdAt: '2026-08-01T00:00:00Z' },
    { id: 'c2', brand: 'VW', model: 'Gol', version: '1.0', status: 'disponivel', price: 50000, purchasePrice: 40000, km: 10, modelYear: '2020', createdAt: '2026-09-01T00:00:00Z' },
  ]
  const sales = [{ id: 's', carId: 'c1', sellerId: 'v1', saleDate: '2026-09-10', salePrice: 70000, commissionAmount: 700, paymentMethod: 'financiado', bank: 'Itaú' }]
  const externals = [{ status: 'pago', paidOn: '2026-09-12', submittedOn: '2026-09-01', customerName: 'Ana', vehicleLabel: 'Onix', bank: 'BV', financedAmount: 40000, sellerId: 'v1', commissionAmount: 400 }]
  const report = buildSalesReport({
    sales,
    cars,
    sellers: [{ id: 'v1', name: 'João' }],
    customers: [{ id: 'k1', name: 'Maria' }],
    externals,
    range: { start: '2026-09-01', end: '2026-09-30' },
  })
  const [vendas, externos, resumo] = report.sections
  assert.equal(vendas.rows[0].customer, 'Maria')
  assert.equal(vendas.rows[0].payment, 'Financiado — Itaú')
  assert.equal(vendas.rows[0].plate, 'ABC1D23')
  assert.equal(externos.rows.length, 1)
  assert.deepEqual(
    { count: resumo.rows[0].count, externals: resumo.rows[0].externals, commission: resumo.rows[0].commission, toPay: resumo.rows[0].toPay },
    { count: 1, externals: 1, commission: 1100, toPay: 1100 }
  )
  // Sem valores (gerente em "só quantidades")
  const semValores = buildSalesReport({ sales, cars, sellers: [], customers: [], externals, range: { start: null, end: null }, showValues: false })
  assert.ok(!semValores.sections[0].columns.some((c) => c.key === 'price'))

  const estoque = buildStockReport({ cars, showCosts: false })
  assert.equal(estoque.sections[0].rows.length, 1)
  assert.ok(!estoque.sections[0].columns.some((c) => c.key === 'cost'))
  const estoqueAdmin = buildStockReport({ cars, expenses: [{ carId: 'c2', amount: 1000 }], showCosts: true })
  assert.equal(estoqueAdmin.sections[0].rows[0].margin, 9000)

  const clientes = buildCustomersReport({ customers: [{ id: 'k1', name: 'Maria', createdAt: '2026-01-01' }], cars })
  assert.equal(clientes.sections[0].rows[0].cars, 'Fiat Argo Drive (ABC1D23)')
})

test('"ver como": filtros de quem está sendo simulado e gravações bloqueadas', () => {
  setViewScope({ name: 'João', role: 'seller', sellerId: 'v1', userId: 'u1', financeAccess: 'counts' })
  try {
    assert.deepEqual(scopeSales([{ sellerId: 'v1' }, { sellerId: 'v2' }, { sellerId: null }]), [{ sellerId: 'v1' }])
    assert.deepEqual(scopeByCreator([{ createdBy: 'u1' }, { createdBy: 'u2' }]), [{ createdBy: 'u1' }])
    assert.deepEqual(scopeCars([{ id: 'c', purchasePrice: 1, purchaseDate: '2026-01-01' }]), [{ id: 'c', purchasePrice: null, purchaseDate: null }])
    assert.deepEqual(scopeExpenses([{ id: 1 }]), [])
    assert.deepEqual(scopeSellers([{ id: 'v1' }, { id: 'v2' }]), [{ id: 'v1' }])
    assert.deepEqual(scopeActivity([{ entity: 'cars' }]), [])
    assert.throws(() => assertCanWrite(), /vendo o painel como João/)

    setViewScope({ name: 'Ana', role: 'manager', sellerId: 'g1', userId: 'u9', financeAccess: 'counts' })
    assert.equal(scopeSales([{ sellerId: 'v1' }]).length, 1)
    assert.deepEqual(
      scopeActivity([{ entity: 'car_expenses', userId: 'u2' }, { entity: 'car_expenses', userId: 'u9' }, { entity: 'customer_financings' }, { entity: 'cars' }]),
      [{ entity: 'car_expenses', userId: 'u9' }, { entity: 'cars' }]
    )
  } finally {
    setViewScope(null)
  }
  // Fora da simulação nada é filtrado e gravar é permitido
  assert.equal(scopeSales([{ sellerId: 'v2' }]).length, 1)
  assert.doesNotThrow(() => assertCanWrite())
})

test('fotos: só as que saíram do cadastro são apagadas, e só depois de salvar', () => {
  const a = '/uploads/carros/a.webp'
  const b = '/uploads/carros/b.webp'
  const nova = '/uploads/carros/nova.webp'
  // Carro tinha a e b; enviou "nova", removeu b e salvou
  assert.deepEqual(removedPhotos([a, b, nova, a], [nova, a]), [b])
  // Enviou uma foto e tirou antes de salvar: ela também sai do site
  assert.deepEqual(removedPhotos([a, nova], [a]), [nova])
  // Nada removido
  assert.deepEqual(removedPhotos([a, b], [b, a]), [])
  assert.deepEqual(removedPhotos([], []), [])
})
