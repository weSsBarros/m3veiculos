// Simulador de bancos (seção 90, pedido do Wesley em 16/10/2026): a parcela do
// mesmo financiamento em cada banco, com as taxas que a loja cadastra (% ao mês,
// Tabela Price). É uma estimativa: sem IOF, tarifas e seguros, e sem consulta aos
// bancos.
import { priceInstallment, parsePercentBR } from './financing.js'

export const SIM_TERMS = [12, 24, 36, 48, 60]
export const DEFAULT_TERMS = [36, 48, 60]

// Taxas válidas: banco com nome e taxa entre 0 e 10% ao mês (o mesmo banco uma vez só)
export function normalizeRates(list) {
  const seen = new Map()
  for (const item of Array.isArray(list) ? list : []) {
    const bank = String(item?.bank || '').trim()
    const rate = typeof item?.rate === 'number' ? item.rate : parsePercentBR(item?.rate)
    if (!bank || rate == null || !(rate > 0) || rate > 10) continue
    seen.set(bank.toLowerCase(), { bank, rate: Math.round(rate * 10000) / 10000 })
  }
  return [...seen.values()]
}

// { financed, rows: [{ bank, rate, installments: { 36: 1234.56, ... } }], best: { 36: 'Banco' } }
// rows na ordem da parcela do primeiro prazo (a mais barata primeiro)
export function simulateBanks({ price, downPayment = 0, terms = DEFAULT_TERMS, rates = [] }) {
  const financed = Math.max(0, Math.round(((Number(price) || 0) - (Number(downPayment) || 0)) * 100) / 100)
  const months = [...new Set((terms || []).map(Number).filter((n) => n > 0))].sort((a, b) => a - b)
  if (!financed || !months.length) return { financed, terms: months, rows: [], best: {} }
  const rows = normalizeRates(rates).map((r) => ({
    bank: r.bank,
    rate: r.rate,
    installments: Object.fromEntries(months.map((n) => [n, priceInstallment(financed, n, r.rate)])),
  }))
  rows.sort((a, b) => a.installments[months[0]] - b.installments[months[0]] || a.bank.localeCompare(b.bank))
  const best = {}
  for (const n of months) {
    const cheapest = rows.reduce((min, r) => (min && min.installments[n] <= r.installments[n] ? min : r), null)
    if (cheapest) best[n] = cheapest.bank
  }
  return { financed, terms: months, rows, best }
}

const money = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pct = (v) => `${String(v).replace('.', ',')}% a.m.`

// Mensagem para o cliente no WhatsApp (e o texto salvo no atendimento)
export function simulationText({ customerName = '', vehicle = '', price, downPayment = 0, result, storeName = '' }) {
  const first = String(customerName || '').trim().split(/\s+/)[0] || ''
  const lines = [
    `Olá${first ? `, ${first}` : ''}! Segue a simulação de financiamento${vehicle ? ` do ${vehicle}` : ''}:`,
    `Valor: ${money(price)} · Entrada: ${money(downPayment)} · Financiado: ${money(result.financed)}`,
    '',
    ...result.rows.map((r) => `${r.bank} (${pct(r.rate)}): ${result.terms.map((n) => `${n}x ${money(r.installments[n])}`).join(' · ')}`),
    '',
    'Valores aproximados, sem IOF e tarifas. A aprovação e as condições finais dependem da análise de crédito do banco.',
  ]
  if (storeName) lines.push(storeName)
  return lines.join('\n')
}
