// Despesas da empresa (Financeiro → Despesas da empresa): contas da loja que não
// são de um carro. Situação, totais, repetição mensal e a pendência do início.
// Testado em tests/companyExpenses.test.js.

export const COMPANY_EXPENSE_CATEGORIES = [
  { slug: 'aluguel', label: 'Aluguel' },
  { slug: 'agua', label: 'Água' },
  { slug: 'energia', label: 'Energia' },
  { slug: 'internet', label: 'Internet e telefone' },
  { slug: 'salarios', label: 'Salários e encargos' },
  { slug: 'prolabore', label: 'Pró-labore' },
  { slug: 'impostos', label: 'Impostos e taxas' },
  { slug: 'contador', label: 'Contador' },
  { slug: 'marketing', label: 'Marketing e anúncios' },
  { slug: 'sistemas', label: 'Sistemas e assinaturas' },
  { slug: 'limpeza', label: 'Limpeza e conservação' },
  { slug: 'manutencao', label: 'Manutenção da loja' },
  { slug: 'transporte', label: 'Transporte e combustível' },
  { slug: 'outros', label: 'Outros' },
]

export function companyExpenseCategoryLabel(slug) {
  return COMPANY_EXPENSE_CATEGORIES.find((c) => c.slug === slug)?.label || slug
}

// Dias para a conta entrar nas pendências do início antes de vencer
export const COMPANY_EXPENSE_ALERT_DAYS = 3

const DAY_MS = 24 * 60 * 60 * 1000

function daysFrom(today, iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / DAY_MS)
}

// paga | atrasada | vence_hoje | vence_em_breve | a_pagar
export function companyExpenseStatus(expense, today) {
  if (expense.paidOn) return 'paga'
  const days = daysFrom(today, expense.dueOn)
  if (days < 0) return 'atrasada'
  if (days === 0) return 'vence_hoje'
  if (days <= COMPANY_EXPENSE_ALERT_DAYS) return 'vence_em_breve'
  return 'a_pagar'
}

export const COMPANY_EXPENSE_STATUS_LABELS = {
  paga: 'Paga',
  atrasada: 'Atrasada',
  vence_hoje: 'Vence hoje',
  vence_em_breve: 'Vence em breve',
  a_pagar: 'A pagar',
}

// Filtros da lista: todas, a pagar (inclui as que vencem logo), atrasadas e pagas
export const COMPANY_EXPENSE_FILTERS = [
  { value: 'todas', label: 'Todas' },
  { value: 'a_pagar', label: 'A pagar' },
  { value: 'atrasadas', label: 'Atrasadas' },
  { value: 'pagas', label: 'Pagas' },
]

export function matchesCompanyExpenseFilter(expense, filter, today) {
  const status = companyExpenseStatus(expense, today)
  if (filter === 'pagas') return status === 'paga'
  if (filter === 'atrasadas') return status === 'atrasada'
  if (filter === 'a_pagar') return status !== 'paga' && status !== 'atrasada'
  return true
}

// Totais de uma lista (já filtrada pelo período)
export function companyExpenseTotals(expenses, today) {
  const totals = { total: 0, paid: 0, open: 0, overdue: 0, count: expenses.length, overdueCount: 0 }
  for (const e of expenses) {
    const amount = Number(e.amount) || 0
    totals.total += amount
    const status = companyExpenseStatus(e, today)
    if (status === 'paga') totals.paid += amount
    else {
      totals.open += amount
      if (status === 'atrasada') {
        totals.overdue += amount
        totals.overdueCount += 1
      }
    }
  }
  for (const key of ['total', 'paid', 'open', 'overdue']) totals[key] = Math.round(totals[key] * 100) / 100
  return totals
}

export function companyExpensesByCategory(expenses) {
  const map = {}
  for (const e of expenses) map[e.category] = (map[e.category] || 0) + (Number(e.amount) || 0)
  return Object.entries(map)
    .map(([slug, amount]) => ({ slug, label: companyExpenseCategoryLabel(slug), amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount)
}

// Pendência do início: contas a pagar que vencem em até 3 dias ou já venceram
export function companyExpensePendency(expenses, today) {
  const items = expenses.filter((e) => {
    const status = companyExpenseStatus(e, today)
    return status === 'atrasada' || status === 'vence_hoje' || status === 'vence_em_breve'
  })
  const overdue = items.filter((e) => companyExpenseStatus(e, today) === 'atrasada').length
  return { count: items.length, overdue, total: Math.round(items.reduce((s, e) => s + (Number(e.amount) || 0), 0) * 100) / 100 }
}

// Dia do vencimento num mês (29 a 31 viram o último dia nos meses mais curtos)
export function dueDateInMonth(month, day) {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`
}

// Meses ('AAAA-MM-01') que o modelo ainda precisa criar até o mês de hoje
// (a mesma conta da company_expenses_generate, seção 63)
export function monthsToGenerate(recurrence, today) {
  if (!recurrence.active) return []
  const months = []
  const [y, m] = recurrence.lastGeneratedMonth.split('-').map(Number)
  const [ty, tm] = today.split('-').map(Number)
  let year = y
  let month = m + 1
  while (year < ty || (year === ty && month <= tm)) {
    if (month > 12) {
      year += 1
      month = 1
      continue
    }
    months.push(`${year}-${String(month).padStart(2, '0')}-01`)
    month += 1
  }
  return months
}

// Próximo vencimento de um modelo (para mostrar "próxima: 05/11")
export function nextRecurrenceDue(recurrence) {
  const [y, m] = recurrence.lastGeneratedMonth.split('-').map(Number)
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  return dueDateInMonth(next, recurrence.day)
}

// Busca: descrição, categoria, fornecedor, observação e valor
export function matchesCompanyExpenseSearch(expense, query, supplierName = '') {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const text = `${expense.description} ${companyExpenseCategoryLabel(expense.category)} ${supplierName} ${expense.notes || ''}`.toLowerCase()
  if (text.includes(q)) return true
  // Valor: "3500", "3.500,00" ou "289,90"
  const digits = q.replace(/[^\d,]/g, '').replace(',', '.')
  if (!digits) return false
  return String(expense.amount).includes(digits) || Number(digits) === Number(expense.amount)
}
