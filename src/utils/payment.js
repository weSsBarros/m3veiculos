// Forma de pagamento da venda e lista de bancos (cada loja edita a sua em
// companies.bank_list).

export const SALE_PAYMENT_METHODS = [
  { value: 'a_vista', label: 'À vista' },
  { value: 'financiado', label: 'Financiado (banco)' },
  { value: 'financiamento_proprio', label: 'Financiamento próprio da loja' },
  { value: 'consorcio', label: 'Consórcio' },
  { value: 'outro', label: 'Outro' },
]

export const DEFAULT_BANKS = [
  'Banco do Brasil',
  'Caixa',
  'Bradesco',
  'Itaú',
  'Santander',
  'BV',
  'Banco Pan',
  'Safra',
  'Omni',
  'C6 Bank',
  'Sicredi',
  'Sicoob',
  'Banco Toyota',
  'Banco Honda',
  'Banco Volkswagen',
]

export function paymentMethodLabel(value) {
  return SALE_PAYMENT_METHODS.find((m) => m.value === value)?.label || ''
}

// "Financiado — Banco do Brasil", "À vista"... ('' quando não informada)
export function describePayment({ paymentMethod, bank } = {}) {
  if (!paymentMethod) return ''
  if (paymentMethod === 'financiado') return bank ? `Financiado — ${bank}` : 'Financiado'
  return paymentMethodLabel(paymentMethod)
}

// Texto da forma de pagamento no contrato
export function contractPaymentText(method, bank) {
  if (method === 'Financiado' && bank) return `Financiado pelo ${bank}`
  return method
}
