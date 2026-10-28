// Retorno e plus do financiamento bancário (seção 97): o que o banco paga à loja
// quando o financiamento passa por ela, na venda com parte financiada no banco e no
// financiamento externo. Retorno = % do valor financiado (pela "tabela" do banco,
// ex.: R4); plus = adicional além do retorno (valor fixo ou %), que muitas vezes cai
// depois. Informados em R$ ou em %; nas contas vale o R$ (store_return/store_plus).
// Testado em tests/bankIncome.test.js.
import { inRange } from './period.js'
import { formatMoneyInput, parseMoneyBR, parsePercentBR, round2 } from './financing.js'

const percentText = (value) => (value === null || value === undefined ? '' : String(value).replace('.', ','))

// Valores gravados → campos da tela. O retorno costuma vir em % e o plus em R$.
export function bankIncomeForm(item) {
  const returnMode = item?.storeReturn != null && item?.returnPercent == null ? 'valor' : 'percent'
  const plusMode = item?.plusPercent != null ? 'percent' : 'valor'
  return {
    returnMode,
    returnInput: returnMode === 'percent' ? percentText(item?.returnPercent) : formatMoneyInput(item?.storeReturn ?? ''),
    rateTable: item?.rateTable || '',
    plusMode,
    plusInput: plusMode === 'percent' ? percentText(item?.plusPercent) : formatMoneyInput(item?.storePlus ?? ''),
    plusReceivedOn: item?.plusReceivedOn || '',
  }
}

// Um valor em R$ ou em % do financiado → { amount (R$), percent, error }
export function resolveBankAmount(mode, input, financed) {
  const text = String(input ?? '').trim()
  if (!text) return { amount: null, percent: null, error: '' }
  if (mode === 'percent') {
    const percent = parsePercentBR(text)
    if (percent == null || percent < 0 || percent > 100) return { amount: null, percent: null, error: 'percentual inválido (de 0 a 100).' }
    if (!(Number(financed) > 0)) return { amount: null, percent: null, error: 'informe o valor financiado para calcular pelo %.' }
    return { amount: round2((Number(financed) * percent) / 100), percent, error: '' }
  }
  const amount = parseMoneyBR(text)
  if (amount == null || amount < 0) return { amount: null, percent: null, error: 'valor inválido.' }
  return { amount, percent: null, error: '' }
}

// Campos da tela → o que vai para o banco: { value, error }
export function bankIncomeFromForm(form, financed) {
  const ret = resolveBankAmount(form.returnMode, form.returnInput, financed)
  if (ret.error) return { value: null, error: `Retorno: ${ret.error}` }
  const plus = resolveBankAmount(form.plusMode, form.plusInput, financed)
  if (plus.error) return { value: null, error: `Plus: ${plus.error}` }
  return {
    error: '',
    value: {
      storeReturn: ret.amount,
      returnPercent: ret.percent,
      rateTable: String(form.rateTable || '').trim().toUpperCase().slice(0, 20),
      storePlus: plus.amount,
      plusPercent: plus.percent,
      plusReceivedOn: plus.amount ? form.plusReceivedOn || null : null,
    },
  }
}

export function bankIncomeTotal(item) {
  return round2((Number(item?.storeReturn) || 0) + (Number(item?.storePlus) || 0))
}

// Financiado no banco de uma venda: as partes "Financiamento bancário" (seção 79)
export function saleBankFinanced(sale) {
  const parts = Array.isArray(sale?.payments) ? sale.payments : []
  const financed = parts.filter((p) => p.method === 'financiamento').reduce((s, p) => s + (Number(p.amount) || 0), 0)
  return financed > 0 ? round2(financed) : Number(sale?.financedAmount) || 0
}

// Entradas do período para o lucro líquido (decisão do Wesley): o retorno da venda
// pela data da venda e o do financiamento externo pela data em que ficou pago; o plus
// pela data em que foi recebido. plusOpen = plus ainda não recebido das vendas e dos
// externos pagos no período. Venda de carro com valores privados de outro sócio fica
// de fora (como no resto do resultado); externo recusado ou cancelado também.
export function bankIncomeInRange({ soldEntries = [], externalFinancings = [], range }) {
  const items = []
  let plusOpen = 0
  for (const e of soldEntries) {
    if (e.car?.valuesHidden || !e.sale) continue
    const label = [e.car?.brand, e.car?.model].filter(Boolean).join(' ')
    const bank = e.sale.bank || ''
    const ret = Number(e.sale.storeReturn) || 0
    const plus = Number(e.sale.storePlus) || 0
    if (ret > 0 && e.date && inRange(e.date, range)) items.push({ kind: 'retorno', source: 'venda', date: e.date, amount: ret, label, bank })
    if (plus > 0 && e.sale.plusReceivedOn && inRange(e.sale.plusReceivedOn, range)) {
      items.push({ kind: 'plus', source: 'venda', date: e.sale.plusReceivedOn, amount: plus, label, bank })
    }
    if (plus > 0 && !e.sale.plusReceivedOn && e.date && inRange(e.date, range)) plusOpen += plus
  }
  for (const f of externalFinancings) {
    if (f.status === 'recusado' || f.status === 'cancelado') continue
    const label = `Financ. externo: ${f.customerName || 'cliente'}`
    const ret = Number(f.storeReturn) || 0
    const plus = Number(f.storePlus) || 0
    const paidInRange = f.status === 'pago' && f.paidOn && inRange(f.paidOn, range)
    if (ret > 0 && paidInRange) items.push({ kind: 'retorno', source: 'externo', date: f.paidOn, amount: ret, label, bank: f.bank || '' })
    if (plus > 0 && f.plusReceivedOn && inRange(f.plusReceivedOn, range)) {
      items.push({ kind: 'plus', source: 'externo', date: f.plusReceivedOn, amount: plus, label, bank: f.bank || '' })
    }
    if (plus > 0 && !f.plusReceivedOn && paidInRange) plusOpen += plus
  }
  items.sort((a, b) => (a.date < b.date ? -1 : 1))
  const sumOf = (kind) => round2(items.filter((i) => i.kind === kind).reduce((s, i) => s + i.amount, 0))
  const returns = sumOf('retorno')
  const plus = sumOf('plus')
  return { items, returns, plus, total: round2(returns + plus), plusOpen: round2(plusOpen) }
}
