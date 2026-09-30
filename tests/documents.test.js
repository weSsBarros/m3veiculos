import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDeliveryTermParagraphs } from '../src/utils/deliveryTerm.js'
import { buildInstallmentReceiptParagraphs } from '../src/utils/installmentReceipt.js'

const company = { name: 'Loja', document: '12.345.678/0001-90', address: 'Rua A, 1' }
const car = { brand: 'Toyota', model: 'Corolla', version: 'XEi', modelYear: '2022/2022', color: 'Branco', km: 32000, plate: 'abc1d23', chassis: 'C', renavam: 'R' }

test('termo de entrega: checklist, comprador e compromisso de transferência', () => {
  const checklist = [{ item: 'Chave reserva', status: 'ok' }, { item: 'Estepe', status: 'nao_possui' }, { item: 'Manual', status: null }]
  const text = buildDeliveryTermParagraphs({
    company, buyer: { name: 'João', document: '111' }, car, checklist, saleDate: '2026-09-25', deliveryDate: '2026-09-29', transferResponsible: 'comprador', city: 'São Luís/MA',
  }).join('\n')
  assert.match(text, /entrega a João, portador\(a\) do CPF\/CNPJ nº 111/)
  assert.match(text, /Placa: ABC1D23/)
  assert.match(text, /• Chave reserva: Entregue/)
  assert.match(text, /• Estepe: Não possui/)
  assert.match(text, /• Manual: não conferido/)
  assert.match(text, /transferência de propriedade/)
  assert.match(text, /São Luís\/MA, 29 de setembro de 2026/)
})

test('termo de entrega: loja faz a transferência, sem comprador e sem itens', () => {
  const text = buildDeliveryTermParagraphs({ company: { name: '' }, buyer: null, car, checklist: [], deliveryDate: '2026-09-29', transferResponsible: 'loja' }).join('\n')
  assert.doesNotMatch(text, /transferência de propriedade/)
  assert.doesNotMatch(text, /ITENS CONFERIDOS/)
  assert.match(text, /a loja vendedora/)
  assert.match(text, /_{10,}/)
})

test('recibo de parcela: encargos, desconto e saldo restante', () => {
  const financing = {
    customerName: 'João', vehicleLabel: 'Corolla', vehiclePlate: 'abc1d23', installmentsCount: 3, downPayment: 0, status: 'ativo', lateFeePercent: 2, lateInterestPercent: 1,
    installments: [
      { number: 1, amount: 1000, dueDate: '2026-08-10', paidOn: '2026-08-20', paidAmount: 1000, lateCharges: 30, paymentMethod: 'Pix' },
      { number: 2, amount: 1000, dueDate: '2026-09-10', paidOn: null },
      { number: 3, amount: 1000, dueDate: '2026-10-10', paidOn: null },
    ],
  }
  const text = buildInstallmentReceiptParagraphs({ company, customer: { document: '111' }, financing, installment: financing.installments[0] }).join('\n')
  assert.match(text, /parcela 1 de 3/)
  assert.match(text, /placa ABC1D23/)
  assert.match(text, /Multa e juros por atraso: R\$\s30,00/)
  assert.match(text, /Desconto: R\$\s30,00/)
  assert.match(text, /Restam 2 parcelas, totalizando R\$\s2\.000,00/)
  const last = { ...financing, installments: financing.installments.map((i) => ({ ...i, paidOn: '2026-10-10', paidAmount: 1000, lateCharges: 0 })) }
  assert.match(buildInstallmentReceiptParagraphs({ company, customer: null, financing: last, installment: last.installments[2] }).join('\n'), /todas as parcelas do financiamento estão quitadas/)
})
