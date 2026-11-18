import { legacyPayment } from './salePayments.js'
import { parseMoneyBR, parsePercentBR, priceInstallment, round2 } from './financing.js'
import { addDaysISO, todayISO } from './carFormat.js'

// Venda parcelada direto com a loja (carnê; pedido de 17/11/2026, seção 99 do banco):
// a venda com a parte "Financiamento próprio da loja" e o financiamento no Financeiro
// dos clientes, com as parcelas.

export const STORE_FINANCING_METHOD = 'financiamento_proprio'

// A parte "Financiamento próprio da loja" das partes do pagamento (ou null)
export function storeFinancingPart(parts) {
  return (parts || []).find((p) => p.method === STORE_FINANCING_METHOD) || null
}

// Venda com financiamento da loja (as partes da seção 79 ou a forma antiga, de uma só)
export function saleHasStoreFinancing(sale) {
  if (!sale) return false
  if (Array.isArray(sale.payments) && sale.payments.length) return Boolean(storeFinancingPart(sale.payments))
  return sale.paymentMethod === STORE_FINANCING_METHOD
}

// Pagamento da venda registrada pelo Novo financiamento: entrada à vista (quando tem)
// + o financiamento da loja, com as colunas antigas preenchidas como na janela da venda
export function storeFinancingSalePayment({ downPayment, financedAmount, installments }) {
  const parts = []
  if (downPayment > 0) parts.push({ method: 'a_vista', amount: round2(downPayment), bank: '', installments: null, note: '' })
  parts.push({ method: STORE_FINANCING_METHOD, amount: round2(financedAmount), bank: '', installments: installments || null, note: '' })
  return { parts, ...legacyPayment(parts) }
}

function carLabel(car) {
  return `${car.brand || ''} ${car.model || ''} ${car.version || ''}`.replace(/\s+/g, ' ').trim()
}

// Começo do Novo financiamento a partir do carro (e da venda dele, quando já vendido):
// descrição, placa, cliente e valor; com a parte "Financiamento próprio da loja" na
// venda, também a entrada (o resto do valor: à vista, cartão, troca...) e o número de
// parcelas. Os valores ficam como número (a tela formata).
export function financingDraftFromCar(car, sale = null) {
  if (!car) return null
  const vehiclePrice = sale?.salePrice ?? car.price ?? null
  const draft = {
    carId: car.id,
    vehicleLabel: carLabel(car),
    vehiclePlate: car.plate ? car.plate.toUpperCase() : '',
    vehiclePrice,
    customerId: car.status === 'vendido' ? car.customerId || '' : '',
    downPayment: null,
    installmentsCount: null,
  }
  const part = sale ? storeFinancingPart(sale.payments) : null
  if (part) {
    if (part.amount != null && vehiclePrice) draft.downPayment = round2(Math.max(0, vehiclePrice - part.amount))
    if (part.installments) draft.installmentsCount = part.installments
  }
  return draft
}

// Vendas com financiamento da loja cujo carro ainda não tem financiamento no Financeiro
// dos clientes (a venda foi registrada sem gerar as parcelas, ou por quem não cuida do
// financeiro): a tela avisa e oferece "Gerar parcelas". financings: os da loja (qualquer
// situação: cancelado também conta como resolvido).
export function salesMissingFinancing(sales, cars, financings) {
  const withFinancing = new Set((financings || []).map((f) => f.carId).filter(Boolean))
  const carsById = new Map((cars || []).map((c) => [c.id, c]))
  return (sales || [])
    .filter((s) => saleHasStoreFinancing(s) && !withFinancing.has(s.carId) && carsById.has(s.carId))
    .map((sale) => ({ sale, car: carsById.get(sale.carId) }))
    .sort((a, b) => (b.sale.saleDate || '').localeCompare(a.sale.saleDate || ''))
}

// Janela da venda (SaleStoreFinancing.jsx): juros, valor da parcela e 1º vencimento das
// parcelas geradas junto com a venda. O valor financiado e o número de parcelas vêm da
// própria forma "Financiamento próprio da loja".
export const EMPTY_STORE_FINANCING = { enabled: true, rate: '', installment: '', installmentTouched: false, firstDue: '' }

export function storeFinancingDefaults(today = todayISO()) {
  return { ...EMPTY_STORE_FINANCING, firstDue: addDaysISO(today, 30) }
}

// Valores da tela → { count, financed, rate, installment } (installment calculado pela
// Tabela Price, se tiver juros, até a pessoa digitar outro)
export function storeFinancingValues(form, part) {
  const financed = Number(part?.amount) || 0
  const count = Number(part?.installments) || 0
  const rate = parsePercentBR(form.rate)
  const suggested = priceInstallment(financed, count, rate)
  const installment = form.installmentTouched ? parseMoneyBR(form.installment) || 0 : suggested
  return { financed, count, rate, installment: round2(installment), suggested }
}

// O que falta para gerar as parcelas ('' = tudo certo)
export function storeFinancingProblem(form, part, customerId) {
  if (!form.enabled) return ''
  const v = storeFinancingValues(form, part)
  if (!v.financed) return 'Financiamento da loja: informe o valor financiado na forma de pagamento.'
  if (v.count < 1 || v.count > 240) return 'Financiamento da loja: informe o número de parcelas (de 1 a 240) na forma de pagamento.'
  if (!customerId) return 'Escolha o cliente comprador para gerar as parcelas do financiamento da loja.'
  if (!v.installment || v.installment <= 0) return 'Financiamento da loja: informe o valor da parcela.'
  if (!form.firstDue) return 'Financiamento da loja: informe o vencimento da 1ª parcela (dd/mm/aaaa).'
  return ''
}

