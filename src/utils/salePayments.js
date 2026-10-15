import { parseMoneyBR } from './financing.js'

// Venda com vários pagamentos (seção 79, 14/10/2026): entrada à vista,
// financiamento, cartão... cada parte com o valor (e banco ou parcelas quando
// tem). O carro da troca continua à parte (trade_in_car_id/trade_in_value) e
// entra na conta e no texto do contrato. Fica em sales.payments; as colunas
// antigas (payment_method, bank, down_payment, financed_amount) continuam
// preenchidas para as listas e relatórios ("misto" quando tem mais de uma forma).

export const PAYMENT_PART_METHODS = [
  { value: 'a_vista', label: 'À vista (dinheiro, PIX ou transferência)', short: 'À vista', cash: true },
  { value: 'pix', label: 'PIX', short: 'PIX', cash: true },
  { value: 'dinheiro', label: 'Dinheiro', short: 'Dinheiro', cash: true },
  { value: 'transferencia', label: 'Transferência / TED', short: 'Transferência', cash: true },
  { value: 'debito', label: 'Cartão de débito', short: 'Débito', cash: true },
  { value: 'credito', label: 'Cartão de crédito', short: 'Cartão de crédito', installments: true },
  { value: 'financiamento', label: 'Financiamento bancário', short: 'Financiado', bank: true, installments: true },
  { value: 'financiamento_proprio', label: 'Financiamento próprio da loja', short: 'Financiamento da loja', installments: true },
  { value: 'consorcio', label: 'Consórcio (carta de crédito)', short: 'Consórcio', bank: true },
  { value: 'cheque', label: 'Cheque', short: 'Cheque' },
  { value: 'boleto', label: 'Boleto', short: 'Boleto' },
  { value: 'troca', label: 'Veículo usado na troca', short: 'Troca', tradeIn: true },
  { value: 'outro', label: 'Outro', short: 'Outro' },
]

// method '' = "Não informar" (o pagamento continua opcional, como antes)
export const EMPTY_PART = { method: '', amount: '', bank: '', installments: '', note: '' }
const NOT_INFORMED = { value: '', label: 'Não informar', short: '' }

export function partMethod(value) {
  if (!value) return NOT_INFORMED
  return PAYMENT_PART_METHODS.find((m) => m.value === value) || PAYMENT_PART_METHODS[PAYMENT_PART_METHODS.length - 1]
}

const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const moneyText = (value) => (value != null && !Number.isNaN(Number(value)) ? money(value) : '')
const asInput = (value) => (value != null ? String(value).replace('.', ',') : '')

// Formas antigas (uma só por venda) → partes
const LEGACY_PART = { a_vista: 'a_vista', financiado: 'financiamento', financiamento_proprio: 'financiamento_proprio', consorcio: 'consorcio', outro: 'outro' }

// Partes da tela (texto nos campos de dinheiro) a partir da venda gravada
export function partsFromSale(sale) {
  if (!sale) return [{ ...EMPTY_PART }]
  if (Array.isArray(sale.payments) && sale.payments.length) {
    return sale.payments.map((p) => ({
      method: p.method || 'outro',
      amount: asInput(p.amount),
      bank: p.bank || '',
      installments: p.installments ? String(p.installments) : '',
      note: p.note || '',
    }))
  }
  // Venda de antes da seção 79: monta pelas colunas antigas
  const method = LEGACY_PART[sale.paymentMethod]
  if (!method) return [{ ...EMPTY_PART }]
  if (method === 'financiamento') {
    const parts = []
    if (sale.downPayment) parts.push({ ...EMPTY_PART, method: 'a_vista', amount: asInput(sale.downPayment) })
    parts.push({ ...EMPTY_PART, method: 'financiamento', amount: asInput(sale.financedAmount), bank: sale.bank || '' })
    return parts
  }
  return [{ ...EMPTY_PART, method, amount: '' }]
}

// Partes da tela → o que vai para o banco ([{ method, amount, bank, installments, note }]).
// Sai a parte em "Não informar"; a forma escolhida fica mesmo sem valor (venda
// antiga só com "À vista", por exemplo). parseMoney: o leitor de "R$ 1.234,56"
// da tela (utils/financing.js parseMoneyBR).
export function normalizeParts(parts, parseMoney) {
  return (parts || [])
    .filter((p) => p.method)
    .map((p) => {
      const meta = partMethod(p.method)
      const amount = typeof p.amount === 'number' ? p.amount : parseMoney(p.amount)
      const installments = meta.installments ? Number.parseInt(String(p.installments || '').replace(/\D/g, ''), 10) || null : null
      return {
        method: meta.value,
        amount: amount != null && !Number.isNaN(amount) ? amount : null,
        bank: meta.bank ? String(p.bank || '').trim() : '',
        installments,
        note: String(p.note || '').trim(),
      }
    })
}

export function paymentsTotal(parts) {
  return (parts || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
}

// Quanto falta (positivo) ou sobra (negativo) para fechar o valor da venda,
// contando o carro da troca. Sem valor informado em nenhuma parte: null.
export function paymentGap(salePrice, parts, tradeInValue = 0) {
  const priced = (parts || []).filter((p) => p.amount != null)
  if (!salePrice || priced.length === 0) return null
  return Math.round((salePrice - paymentsTotal(priced) - (Number(tradeInValue) || 0)) * 100) / 100
}

// Colunas antigas da venda, para as listas e os relatórios que ainda olham para elas
export function legacyPayment(parts) {
  const list = (parts || []).filter((p) => p.method !== 'troca')
  if (list.length === 0) return { method: '', bank: '', downPayment: null, financedAmount: null }
  const financing = list.find((p) => p.method === 'financiamento')
  const cash = list.filter((p) => partMethod(p.method).cash)
  const cashTotal = cash.length ? paymentsTotal(cash) : null
  if (list.length === 1) {
    const p = list[0]
    const method = partMethod(p.method).cash ? 'a_vista'
      : p.method === 'financiamento' ? 'financiado'
        : p.method === 'financiamento_proprio' || p.method === 'consorcio' ? p.method
          : 'outro'
    return { method, bank: financing?.bank || '', downPayment: null, financedAmount: financing?.amount ?? null }
  }
  // Entrada à vista + financiamento continua sendo "Financiado" (como antes)
  if (financing && list.every((p) => p === financing || partMethod(p.method).cash)) {
    return { method: 'financiado', bank: financing.bank || '', downPayment: cashTotal, financedAmount: financing.amount ?? null }
  }
  return { method: 'misto', bank: financing?.bank || '', downPayment: cashTotal, financedAmount: financing?.amount ?? null }
}

// "R$ 20.000,00 à vista (PIX)", "R$ 50.000,00 financiados pelo BV em 48 parcelas"
export function partText(p) {
  const value = moneyText(p.amount)
  const times = p.installments ? ` em ${p.installments} ${p.installments === 1 ? 'parcela' : 'parcelas'}` : ''
  const note = p.note ? ` (${p.note})` : ''
  const v = value ? `${value} ` : ''
  switch (p.method) {
    case 'a_vista':
      return `${v}à vista${note}`.trim()
    case 'pix':
      return `${v}via PIX${note}`.trim()
    case 'dinheiro':
      return `${v}em dinheiro${note}`.trim()
    case 'transferencia':
      return `${v}por transferência bancária${note}`.trim()
    case 'debito':
      return `${v}no cartão de débito${note}`.trim()
    case 'credito':
      return `${v}no cartão de crédito${times}${note}`.trim()
    case 'financiamento':
      return `${value ? `${value} financiados` : 'financiamento'}${p.bank ? ` pelo ${p.bank}` : ' por instituição financeira'}${times}${note}`
    case 'financiamento_proprio':
      return `${value ? `${value} parcelados diretamente com a VENDEDORA` : 'parcelamento direto com a VENDEDORA'}${times}${note}`
    case 'consorcio':
      return `${value ? `${value} por carta de crédito de consórcio` : 'carta de crédito de consórcio'}${p.bank ? ` (${p.bank})` : ''}${note}`
    case 'cheque':
      return `${v}em cheque${note}`.trim()
    case 'boleto':
      return `${v}por boleto${note}`.trim()
    case 'troca':
      return `veículo usado recebido como parte do pagamento${p.note ? ` (${p.note})` : ''}${value ? `, avaliado em ${value}` : ''}`
    default:
      return `${v}${p.note || 'outra forma combinada entre as partes'}`.trim()
  }
}

function joinPT(items) {
  if (items.length <= 1) return items[0] || ''
  return `${items.slice(0, -1).join('; ')}; e ${items[items.length - 1]}`
}

// Texto da forma de pagamento no contrato (e no marcador forma_pagamento).
// tradeIn: { description, value } do carro da troca registrado na venda.
export function paymentsText(parts, tradeIn = null) {
  const list = [...(parts || [])]
  if (tradeIn && (tradeIn.value || tradeIn.description) && !list.some((p) => p.method === 'troca')) {
    list.push({ method: 'troca', amount: tradeIn.value ?? null, note: tradeIn.description || '' })
  }
  return joinPT(list.map(partText))
}

// Resumo curto para as listas: "PIX + Financiado (BV) + Cartão de crédito"
export function describeSalePayment(sale) {
  if (Array.isArray(sale?.payments) && sale.payments.length) {
    return sale.payments
      .map((p) => {
        const meta = partMethod(p.method)
        return p.method === 'financiamento' && p.bank ? `${meta.short} (${p.bank})` : meta.short
      })
      .join(' + ')
  }
  return null
}

// Marcadores dos modelos de contrato com os valores de cada forma
export function paymentTags(parts, tradeIn = null) {
  const list = parts || []
  const sum = (filter) => {
    const chosen = list.filter(filter)
    return chosen.length ? moneyText(paymentsTotal(chosen)) : ''
  }
  const financing = list.find((p) => p.method === 'financiamento')
  const trade = list.find((p) => p.method === 'troca')
  return {
    pagamento_a_vista: sum((p) => partMethod(p.method).cash),
    pagamento_financiado: sum((p) => p.method === 'financiamento'),
    banco_financiamento: financing?.bank || '',
    parcelas_financiamento: financing?.installments ? String(financing.installments) : '',
    pagamento_cartao: sum((p) => p.method === 'credito'),
    veiculo_troca: trade?.note || tradeIn?.description || '',
    valor_troca: moneyText(trade?.amount ?? tradeIn?.value ?? null),
  }
}

// O que a venda grava: as partes e as colunas antigas
export function salePayment(uiParts) {
  const parts = normalizeParts(uiParts, parseMoneyBR)
  return { parts, ...legacyPayment(parts) }
}
