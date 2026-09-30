// Financiamento externo: o cliente achou o carro fora da loja e só fez o
// financiamento por ela. A loja recebe um retorno do banco quando o
// financiamento é pago, e o vendedor ganha a comissão configurada na Equipe.

export const EXTERNAL_STATUSES = [
  { value: 'em_analise', label: 'Em análise', tone: 'info' },
  { value: 'aprovado', label: 'Aprovado', tone: 'warn' },
  { value: 'pago', label: 'Pago', tone: 'ok' },
  { value: 'recusado', label: 'Recusado', tone: 'muted' },
  { value: 'cancelado', label: 'Cancelado', tone: 'muted' },
]

export function externalStatusLabel(value) {
  return EXTERNAL_STATUSES.find((s) => s.value === value)?.label || value
}

export function externalStatusTone(value) {
  return EXTERNAL_STATUSES.find((s) => s.value === value)?.tone || 'muted'
}

export const EXT_COMMISSION_TYPES = [
  { value: 'none', label: 'Não recebe' },
  { value: 'percent_financed', label: '% do valor financiado' },
  { value: 'percent_return', label: '% do retorno da loja' },
  { value: 'fixed', label: 'Valor fixo por financiamento' },
]

// Mesma conta do banco (gatilho external_financings_compute): serve para a
// prévia na tela; o valor oficial é o gravado no banco.
export function computeExternalCommission(type, value, financedAmount, storeReturn) {
  const v = Number(value) || 0
  if (type === 'percent_financed') return Math.round((Number(financedAmount) || 0) * v) / 100
  if (type === 'percent_return') return Math.round((Number(storeReturn) || 0) * v) / 100
  if (type === 'fixed') return v
  return 0
}

export function describeExternalCommission(type, value) {
  const v = Number(value) || 0
  const pct = v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  if (type === 'percent_financed') return `${pct}% do financiado`
  if (type === 'percent_return') return `${pct}% do retorno da loja`
  if (type === 'fixed') return `${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} por financiamento`
  return 'Sem comissão'
}

// Em análise há mais de `days` dias (aviso no Dashboard)
export function isStaleAnalysis(item, days = 7, today = new Date()) {
  if (item.status !== 'em_analise' || !item.submittedOn) return false
  const start = new Date(`${item.submittedOn}T00:00:00`)
  const diff = Math.floor((today - start) / 86400000)
  return diff > days
}
