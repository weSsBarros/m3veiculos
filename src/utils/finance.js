// Painel WB.Dev → Financeiro: números do negócio ao longo do tempo (recebido, a
// receber, média mensal, despesas e lucro, ranking por cliente e previsão).
// "Recebido" conta pela data do pagamento (o que entrou no caixa); "a receber"
// vem pronto do banco (client_billing). Testado em tests/finance.test.js.

import { isCharged } from './billing.js'

const pad = (n) => String(n).padStart(2, '0')
const sumBy = (list, fn) => list.reduce((total, item) => total + (Number(fn(item)) || 0), 0)

export const EXPENSE_CATEGORIES = [
  { key: 'hospedagem', label: 'Hospedagem e servidores' },
  { key: 'dominios', label: 'Domínios' },
  { key: 'ferramentas', label: 'Ferramentas e sistemas' },
  { key: 'marketing', label: 'Anúncios e marketing' },
  { key: 'impostos', label: 'Impostos e taxas' },
  { key: 'pessoal', label: 'Pessoal e terceiros' },
  { key: 'outros', label: 'Outros' },
]

export function categoryLabel(key) {
  return EXPENSE_CATEGORIES.find((c) => c.key === key)?.label || 'Outros'
}

// 'AAAA-MM' do mês de hoje
export function currentMonth(today = new Date()) {
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}`
}

export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}

// Meses de `from` até `to` ('AAAA-MM'), inclusive
export function monthsBetween(from, to) {
  const list = []
  for (let m = from; m <= to; m = addMonths(m, 1)) list.push(m)
  return list
}

const monthOfDate = (iso) => (iso ? iso.slice(0, 7) : '')
const chargedClients = (clients) => clients.filter((c) => isCharged(c.billing))

// Mês mais antigo com movimento: início de cobrança, pagamento ou despesa
export function firstActivityMonth({ clients = [], payments = [], expenses = [] }) {
  const months = [
    ...chargedClients(clients).map((c) => monthOfDate(c.account?.billingStart)),
    ...payments.map((p) => monthOfDate(p.paidOn)),
    ...expenses.map((e) => monthOfDate(e.spentOn)),
  ].filter(Boolean)
  return months.length ? months.sort()[0] : null
}

// Opções do filtro de período: este ano, 12 meses, desde o início e anos anteriores com movimento
export function periodOptions(firstMonth, today = new Date()) {
  const year = today.getFullYear()
  const options = [
    { value: 'ano', label: `Este ano (${year})` },
    { value: '12m', label: 'Últimos 12 meses' },
    { value: 'tudo', label: 'Desde o início' },
  ]
  const firstYear = firstMonth ? Number(firstMonth.slice(0, 4)) : year
  for (let y = year - 1; y >= firstYear; y -= 1) options.push({ value: String(y), label: String(y) })
  return options
}

// { start, end, months, elapsed } de um período ('ano', '12m', 'tudo' ou 'AAAA')
export function periodRange(value, today = new Date(), firstMonth = null) {
  const cur = currentMonth(today)
  let start
  let end = cur
  if (value === '12m') start = addMonths(cur, -11)
  else if (value === 'tudo') start = firstMonth && firstMonth < cur ? firstMonth : cur
  else if (/^\d{4}$/.test(value)) {
    start = `${value}-01`
    end = `${value}-12`
  } else {
    start = `${cur.slice(0, 4)}-01`
    end = `${cur.slice(0, 4)}-12`
  }
  const months = monthsBetween(start, end)
  return { value, start, end, months, elapsed: months.filter((m) => m <= cur) }
}

// Mensalidades previstas de um mês: clientes cobrados que já tinham começado
export function expectedForMonth(clients, month) {
  return sumBy(chargedClients(clients), (c) => {
    const start = monthOfDate(c.account?.billingStart)
    return start && start <= month ? c.billing.price : 0
  })
}

// O que está para receber agora: atrasado + o que vence ainda neste mês
export function receivables(clients, today = new Date()) {
  const cur = currentMonth(today)
  const charged = chargedClients(clients)
  const late = charged.filter((c) => c.billing.situation === 'atrasado')
  const overdue = sumBy(charged, (c) => c.billing.open_total)
  const dueThisMonth = sumBy(
    charged.filter((c) => monthOfDate(c.billing.next?.month) === cur),
    (c) => c.billing.next.amount
  )
  return { overdue, dueThisMonth, total: overdue + dueThisMonth, lateCount: late.length }
}

// Resumo do período para os quadros, o gráfico e a tabela mês a mês
export function financeSummary({ clients = [], payments = [], expenses = [], period, today = new Date() }) {
  const cur = currentMonth(today)
  const inPeriod = (iso) => {
    const m = monthOfDate(iso)
    return Boolean(m) && m >= period.start && m <= period.end
  }
  const paid = payments.filter((p) => inPeriod(p.paidOn))
  const spent = expenses.filter((e) => inPeriod(e.spentOn))
  const received = sumBy(paid, (p) => p.amount)
  const costs = sumBy(spent, (e) => e.amount)
  const profit = received - costs

  const receivedIn = (m) => sumBy(payments.filter((p) => monthOfDate(p.paidOn) === m), (p) => p.amount)
  const spentIn = (m) => sumBy(expenses.filter((e) => monthOfDate(e.spentOn) === m), (e) => e.amount)

  const byMonth = period.months.map((m) => {
    const done = m <= cur
    const rec = done ? receivedIn(m) : null
    const exp = done ? spentIn(m) : null
    return { month: m, expected: expectedForMonth(clients, m), received: rec, expenses: exp, result: done ? rec - exp : null }
  })

  // Média: meses do período desde o primeiro movimento; o mês atual (parcial)
  // só entra quando ainda não há mês completo
  const first = firstActivityMonth({ clients, payments, expenses })
  let avgMonths = period.elapsed.filter((m) => !first || m >= first)
  const complete = avgMonths.filter((m) => m < cur)
  if (complete.length) avgMonths = complete
  const avgMonthly = avgMonths.length ? sumBy(avgMonths, receivedIn) / avgMonths.length : 0

  const best = byMonth.filter((m) => m.received > 0).sort((a, b) => b.received - a.received)[0] || null

  // Crescimento: último mês completo contra o anterior
  const last = addMonths(cur, -1)
  const before = addMonths(cur, -2)
  const lastValue = receivedIn(last)
  const beforeValue = receivedIn(before)
  const growth = {
    month: last,
    previous: before,
    value: lastValue,
    previousValue: beforeValue,
    pct: beforeValue > 0 ? Math.round(((lastValue - beforeValue) / beforeValue) * 100) : null,
  }

  const charged = chargedClients(clients)
  const mrr = sumBy(charged, (c) => c.billing.price)

  const share = (value, total) => (total > 0 ? Math.round((value / total) * 100) : 0)
  const group = (list, keyOf, labelOf, total) => {
    const sums = new Map()
    for (const item of list) sums.set(keyOf(item), (sums.get(keyOf(item)) || 0) + (Number(item.amount) || 0))
    return [...sums.entries()]
      .map(([key, value]) => ({ key, label: labelOf(key), value, pct: share(value, total) }))
      .sort((a, b) => b.value - a.value)
  }

  return {
    firstMonth: first,
    received,
    receivedCount: paid.length,
    costs,
    profit,
    margin: received > 0 ? Math.round((profit / received) * 100) : null,
    avgMonthly,
    avgMonthsCount: avgMonths.length,
    avgIsPartial: avgMonths.length === 1 && avgMonths[0] === cur,
    receivable: receivables(clients, today),
    mrr,
    arr: mrr * 12,
    clientsCharged: charged.length,
    ticket: charged.length ? mrr / charged.length : 0,
    best,
    growth,
    byMonth,
    byMethod: group(paid, (p) => p.method || '', (k) => k || 'Não informada', received),
    byCategory: group(spent, (e) => e.category || 'outros', categoryLabel, costs),
  }
}

// Ranking por cliente: quanto cada loja já pagou (desde sempre), o que está em
// aberto, há quanto tempo é cliente e o que sobra depois das despesas dela
export function clientRanking({ clients = [], payments = [], expenses = [], today = new Date() }) {
  const cur = currentMonth(today)
  return clients
    .map((c) => {
      const mine = payments.filter((p) => p.companyId === c.companyId)
      const totalPaid = sumBy(mine, (p) => p.amount)
      const costs = sumBy(expenses.filter((e) => e.companyId === c.companyId), (e) => e.amount)
      const paidMonths = mine.map((p) => monthOfDate(p.paidOn)).sort()
      const charged = isCharged(c.billing)
      const since = (charged && monthOfDate(c.account?.billingStart)) || paidMonths[0] || null
      const monthsAsClient = since && since <= cur ? monthsBetween(since, cur).length : 0
      return {
        companyId: c.companyId,
        slug: c.slug,
        name: c.name,
        billing: c.billing,
        price: charged ? Number(c.billing.price) || 0 : 0,
        totalPaid,
        monthsPaid: new Set(mine.map((p) => p.referenceMonth)).size,
        openTotal: Number(c.billing?.open_total) || 0,
        since,
        monthsAsClient,
        avgMonthly: monthsAsClient ? totalPaid / monthsAsClient : 0,
        lastPaidOn: mine.map((p) => p.paidOn).sort().pop() || null,
        costs,
        net: totalPaid - costs,
      }
    })
    .sort((a, b) => b.totalPaid - a.totalPaid || b.price - a.price || a.name.localeCompare(b.name, 'pt-BR'))
}

// Despesa média por mês: últimos 12 meses completos desde a primeira despesa
export function averageMonthlyCost(expenses = [], today = new Date()) {
  const cur = currentMonth(today)
  const first = expenses.map((e) => monthOfDate(e.spentOn)).filter(Boolean).sort()[0]
  if (!first) return 0
  const window = monthsBetween(addMonths(cur, -12), addMonths(cur, -1)).filter((m) => m >= first)
  if (!window.length) return 0
  return sumBy(expenses.filter((e) => window.includes(monthOfDate(e.spentOn))), (e) => e.amount) / window.length
}

// Previsão a partir do mês que vem, com os clientes e as mensalidades de hoje
export function forecast({ clients = [], expenses = [], today = new Date(), horizons = [3, 6, 12] }) {
  const cur = currentMonth(today)
  const monthlyCost = averageMonthlyCost(expenses, today)
  return horizons.map((n) => {
    const months = monthsBetween(addMonths(cur, 1), addMonths(cur, n))
    const revenue = sumBy(months, (m) => expectedForMonth(clients, m))
    const costs = monthlyCost * n
    return { months: n, from: months[0], to: months[months.length - 1], revenue, costs, profit: revenue - costs }
  })
}
