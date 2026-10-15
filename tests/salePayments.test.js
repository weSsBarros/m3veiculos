import { test } from 'node:test'
import assert from 'node:assert/strict'
import { partsFromSale, normalizeParts, paymentGap, legacyPayment, paymentsText, describeSalePayment, paymentTags } from '../src/utils/salePayments.js'
import { parseMoneyBR } from '../src/utils/financing.js'

const nbsp = (s) => s.replace(/ /g, ' ')

test('pagamentos: entrada à vista, financiamento e cartão numa venda só', () => {
  const parts = normalizeParts(
    [
      { method: 'pix', amount: '20.000,00', bank: 'ignorado', installments: '3' },
      { method: 'financiamento', amount: '50.000,00', bank: 'BV', installments: '48' },
      { method: 'credito', amount: '10.000,00', installments: '10x' },
      { method: '', amount: '' },
    ],
    parseMoneyBR
  )
  // Linha em "Não informar" sai; banco e parcelas só onde faz sentido
  assert.deepEqual(parts, [
    { method: 'pix', amount: 20000, bank: '', installments: null, note: '' },
    { method: 'financiamento', amount: 50000, bank: 'BV', installments: 48, note: '' },
    { method: 'credito', amount: 10000, bank: '', installments: 10, note: '' },
  ])
  // Com a troca de R$ 15.000: fecha os R$ 95.000
  assert.equal(paymentGap(95000, parts, 15000), 0)
  assert.equal(paymentGap(100000, parts, 15000), 5000)
  assert.equal(paymentGap(90000, parts, 15000), -5000)
  assert.equal(paymentGap(90000, [], 0), null)
  assert.deepEqual(legacyPayment(parts), { method: 'misto', bank: 'BV', downPayment: 20000, financedAmount: 50000 })
  assert.equal(describeSalePayment({ payments: parts }), 'PIX + Financiado (BV) + Cartão de crédito')
})

test('pagamentos: texto do contrato com a troca no fim', () => {
  const parts = [
    { method: 'pix', amount: 20000 },
    { method: 'financiamento', amount: 50000, bank: 'BV', installments: 48 },
    { method: 'credito', amount: 10000, installments: 10 },
  ]
  assert.equal(
    nbsp(paymentsText(parts, { description: 'VW Gol 1.0 2015, placa ABC1D23', value: 15000 })),
    'R$ 20.000,00 via PIX; R$ 50.000,00 financiados pelo BV em 48 parcelas; R$ 10.000,00 no cartão de crédito em 10 parcelas; e veículo usado recebido como parte do pagamento (VW Gol 1.0 2015, placa ABC1D23), avaliado em R$ 15.000,00'
  )
  assert.equal(nbsp(paymentsText([{ method: 'a_vista', amount: 80000 }])), 'R$ 80.000,00 à vista')
  const tags = paymentTags(parts, { description: 'Gol 2015', value: 15000 })
  assert.equal(nbsp(tags.pagamento_a_vista), 'R$ 20.000,00')
  assert.equal(nbsp(tags.pagamento_financiado), 'R$ 50.000,00')
  assert.equal(tags.banco_financiamento, 'BV')
  assert.equal(tags.parcelas_financiamento, '48')
  assert.equal(tags.veiculo_troca, 'Gol 2015')
  assert.equal(nbsp(tags.valor_troca), 'R$ 15.000,00')
})

test('pagamentos: vendas antigas (uma forma só) continuam abrindo e gravando como antes', () => {
  assert.deepEqual(partsFromSale({ paymentMethod: 'financiado', bank: 'Itaú', downPayment: 10000, financedAmount: 40000 }), [
    { method: 'a_vista', amount: '10000', bank: '', installments: '', note: '' },
    { method: 'financiamento', amount: '40000', bank: 'Itaú', installments: '', note: '' },
  ])
  assert.deepEqual(partsFromSale({ paymentMethod: 'consorcio' }), [{ method: 'consorcio', amount: '', bank: '', installments: '', note: '' }])
  assert.deepEqual(partsFromSale({ paymentMethod: '' }), [{ method: '', amount: '', bank: '', installments: '', note: '' }])
  // Forma escolhida sem valor continua gravada (editar a venda antiga não apaga o "À vista")
  assert.deepEqual(normalizeParts([{ method: 'a_vista', amount: '' }], parseMoneyBR), [{ method: 'a_vista', amount: null, bank: '', installments: null, note: '' }])
  assert.equal(legacyPayment(normalizeParts([{ method: 'a_vista', amount: '' }], parseMoneyBR)).method, 'a_vista')
  // Uma forma só ou entrada + financiamento: as colunas antigas de sempre
  assert.equal(legacyPayment([{ method: 'pix', amount: 5000 }]).method, 'a_vista')
  assert.deepEqual(legacyPayment([{ method: 'dinheiro', amount: 10000 }, { method: 'financiamento', amount: 40000, bank: 'Itaú' }]), {
    method: 'financiado', bank: 'Itaú', downPayment: 10000, financedAmount: 40000,
  })
  assert.deepEqual(legacyPayment([]), { method: '', bank: '', downPayment: null, financedAmount: null })
  assert.equal(describeSalePayment({ paymentMethod: 'a_vista' }), null)
})
