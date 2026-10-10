// Lucro líquido de um período (Financeiro da loja, Relatórios e Desempenho):
// vendas − custo dos carros vendidos (compra + gastos do carro) − comissões
// pagas no período (pela data do pagamento, mesmo de carro vendido em outro mês;
// decisão do Wesley em 07/10/2026) − despesas da empresa com vencimento no período.
// soldEntries: [{ car, sale, price, date }] de todos os carros vendidos (valor e
// data efetivos da venda). Venda de carro com o cadeado de outro sócio (valores
// privados, seção 73) fica de fora e é contada em privateCount.
// Testado em tests/storeResult.test.js.

import { inRange } from './period.js'

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

export function storeResult({ soldEntries: allEntries = [], carExpenses = [], companyExpenses = [], range }) {
  const privateCount = allEntries.filter((e) => e.car?.valuesHidden && e.date && inRange(e.date, range)).length
  const soldEntries = allEntries.filter((e) => !e.car?.valuesHidden)
  const expensesByCar = {}
  for (const e of carExpenses) expensesByCar[e.carId] = (expensesByCar[e.carId] || 0) + (Number(e.amount) || 0)

  const sold = soldEntries
    .filter((e) => e.date && inRange(e.date, range))
    .map((e) => {
      const cost = (Number(e.car?.purchasePrice) || 0) + (expensesByCar[e.car?.id] || 0)
      const price = Number(e.price) || 0
      return { ...e, price, cost, margin: price - cost }
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  const commissionOf = (e) => Number(e.sale?.commissionAmount) || 0
  const paidCommissions = soldEntries
    .filter((e) => commissionOf(e) > 0 && e.sale?.commissionPaidOn && inRange(e.sale.commissionPaidOn, range))
    .map((e) => ({ ...e, paidOn: e.sale.commissionPaidOn, commission: commissionOf(e) }))
    .sort((a, b) => (a.paidOn < b.paidOn ? -1 : 1))
  // Comissões das vendas do período que ainda não foram pagas (só para mostrar)
  const commissionsOpen = round2(sold.filter((e) => !e.sale?.commissionPaidOn).reduce((s, e) => s + commissionOf(e), 0))

  const bills = companyExpenses.filter((e) => inRange(e.dueOn, range)).sort((a, b) => (a.dueOn < b.dueOn ? -1 : 1))

  const revenue = round2(sold.reduce((s, e) => s + e.price, 0))
  const carsCost = round2(sold.reduce((s, e) => s + e.cost, 0))
  const commissions = round2(paidCommissions.reduce((s, e) => s + e.commission, 0))
  const company = round2(bills.reduce((s, e) => s + (Number(e.amount) || 0), 0))
  const companyPaid = round2(bills.filter((e) => e.paidOn).reduce((s, e) => s + (Number(e.amount) || 0), 0))
  const grossMargin = round2(revenue - carsCost)
  return {
    sold,
    paidCommissions,
    bills,
    soldCount: sold.length,
    revenue,
    carsCost,
    grossMargin,
    commissions,
    commissionsOpen,
    companyExpenses: company,
    companyPaid,
    companyOpen: round2(company - companyPaid),
    net: round2(grossMargin - commissions - company),
    privateCount,
  }
}

// Intervalo de um mês 'AAAA-MM'
export function monthRange(month) {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const mm = String(m).padStart(2, '0')
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, '0')}` }
}
