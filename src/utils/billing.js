// Painel WB.Dev: mensalidades dos clientes (cobrança manual) e o aviso de
// mensalidade no painel da loja. A situação de cada loja vem pronta do banco
// (client_billing, seção 39): { situation, price, due_day, open, open_total,
// days_late, next }. Aqui ficam os textos, os totais e a mensagem de cobrança.
// Testado em tests/billing.test.js.

import { waDigits } from './whatsappRotation.js'
import { SUPPORT_DISPLAY } from './support.js'

const DAY_MS = 24 * 60 * 60 * 1000

// Dias que faltam do dia de hoje até uma data 'AAAA-MM-DD'
function daysUntil(isoDate, today = new Date()) {
  if (!isoDate) return null
  const [y, m, d] = isoDate.split('-').map(Number)
  const target = Date.UTC(y, m - 1, d)
  const base = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((target - base) / DAY_MS)
}

export function money(value) {
  return (Number(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
}

export function dayMonth(isoDate) {
  if (!isoDate) return ''
  const [, m, d] = isoDate.split('-')
  return `${d}/${m}`
}

export function dateBR(isoDate) {
  if (!isoDate) return '—'
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

// "setembro de 2026" a partir de 'AAAA-MM-01'
export function monthName(isoDate) {
  if (!isoDate) return ''
  const [y, m] = isoDate.split('-').map(Number)
  const name = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' })
  return `${name} de ${y}`
}

export const SITUATION_LEVEL = {
  implantacao: 'blue',
  sem_cobranca: 'gray',
  em_dia: 'green',
  vence_em_breve: 'yellow',
  vence_hoje: 'yellow',
  atrasado: 'red',
}

// Texto curto da situação (lista de clientes e ficha)
export function situationText(billing, today = new Date()) {
  const s = billing?.situation || 'sem_cobranca'
  if (s === 'implantacao') return 'Em implantação'
  if (s === 'sem_cobranca') return 'Sem cobrança'
  if (s === 'atrasado') {
    const n = Number(billing.days_late) || 0
    return `Atrasado há ${n} ${n === 1 ? 'dia' : 'dias'}`
  }
  if (s === 'vence_hoje') return 'Vence hoje'
  const days = daysUntil(billing.next?.due, today)
  if (s === 'vence_em_breve') return `Vence em ${days} ${days === 1 ? 'dia' : 'dias'} (${dayMonth(billing.next?.due)})`
  return billing.next?.due ? `Em dia · próximo ${dayMonth(billing.next.due)}` : 'Em dia'
}

// Aviso automático no painel do admin da loja (null = nada a avisar)
export function storeBillingNotice(billing, today = new Date()) {
  const s = billing?.situation
  if (!s || s === 'implantacao' || s === 'sem_cobranca' || s === 'em_dia') return null
  if (s === 'atrasado') {
    const n = Number(billing.days_late) || 0
    const oldest = billing.open?.[0]
    const months = billing.open?.length || 0
    const what = months > 1 ? `${months} mensalidades em atraso (${money(billing.open_total)})` : `A mensalidade de ${monthName(oldest?.month)} está em atraso`
    return {
      level: 'urgente',
      text: `${what} há ${n} ${n === 1 ? 'dia' : 'dias'}. Regularize para evitar a suspensão do acesso. Dúvidas: ${SUPPORT_DISPLAY}.`,
    }
  }
  if (s === 'vence_hoje') {
    return { level: 'aviso', text: `Sua mensalidade de ${money(billing.next?.amount ?? billing.price)} vence hoje.` }
  }
  const days = daysUntil(billing.next?.due, today)
  return {
    level: 'info',
    text: `Sua mensalidade de ${money(billing.next?.amount ?? billing.price)} vence em ${days} ${days === 1 ? 'dia' : 'dias'} (${dayMonth(billing.next?.due)}).`,
  }
}

// Mensagem de cobrança para o WhatsApp do responsável
export function chargeMessage({ storeName, responsibleName, billing }) {
  const hello = responsibleName ? `Olá, ${responsibleName.split(' ')[0]}!` : 'Olá!'
  const open = billing?.open || []
  if (open.length > 0) {
    const list = open.map((o) => `${monthName(o.month)} (venceu em ${dateBR(o.due)})`).join(', ')
    return (
      `${hello} Aqui é da WB.Dev. Consta em aberto a mensalidade do sistema da ${storeName}: ${list}, ` +
      `total de ${money(billing.open_total)}. Pode me enviar o comprovante quando pagar? Obrigado!`
    )
  }
  if (billing?.next) {
    return (
      `${hello} Aqui é da WB.Dev. Passando para lembrar que a mensalidade do sistema da ${storeName} ` +
      `(${money(billing.next.amount)}) vence em ${dateBR(billing.next.due)}. Qualquer dúvida, estou à disposição!`
    )
  }
  return `${hello} Aqui é da WB.Dev, sobre o sistema da ${storeName}.`
}

export function whatsappLink(phone, text) {
  const digits = waDigits(phone)
  if (!digits) return ''
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

// Mês 'AAAA-MM-01' de uma data 'AAAA-MM-DD'
export const monthOf = (isoDate) => (isoDate ? `${isoDate.slice(0, 7)}-01` : '')

// Totais da aba Cobrança. clients: lista de platform_clients();
// payments: pagamentos (paid_on, amount, reference_month)
export function billingTotals(clients, payments, today = new Date()) {
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const charged = clients.filter((c) => isCharged(c.billing))
  const mrr = charged.reduce((sum, c) => sum + (Number(c.billing.price) || 0), 0)
  const late = charged.filter((c) => c.billing.situation === 'atrasado')
  const overdue = late.reduce((sum, c) => sum + (Number(c.billing.open_total) || 0), 0)
  const received = payments.filter((p) => monthOf(p.paidOn) === thisMonth).reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  const paidThisMonth = new Set(payments.filter((p) => p.referenceMonth === thisMonth).map((p) => p.companyId))
  return {
    clients: charged.length,
    mrr,
    expected: mrr,
    received,
    overdue,
    lateCount: late.length,
    lateRate: charged.length ? Math.round((late.length / charged.length) * 100) : 0,
    paidThisMonth: charged.filter((c) => paidThisMonth.has(c.companyId)).length,
  }
}

// Recebido por mês (gráfico), do mais antigo ao atual
export function receivedByMonth(payments, months) {
  const sums = Object.fromEntries(months.map((m) => [m, 0]))
  for (const p of payments) {
    const key = monthOf(p.paidOn).slice(0, 7)
    if (key in sums) sums[key] += Number(p.amount) || 0
  }
  return months.map((m) => ({ month: m, value: sums[m] }))
}

// Domínio vencendo em até 30 dias (ou vencido)
export function domainAlert(account, today = new Date()) {
  const days = daysUntil(account?.domainExpiresOn, today)
  if (days === null || days > 30) return null
  return days < 0 ? `Domínio venceu há ${-days} ${days === -1 ? 'dia' : 'dias'}` : `Domínio vence em ${days} ${days === 1 ? 'dia' : 'dias'}`
}

// Checklist de implantação: o que dá para conferir sozinho vem marcado
export const ONBOARDING_ITEMS = [
  { key: 'visual', label: 'Logo e cores do site' },
  { key: 'contatos', label: 'Contatos da loja no site' },
  { key: 'dominio', label: 'Domínio próprio', auto: (c) => c.checks?.ownDomain },
  { key: 'whatsapp', label: 'WhatsApp do site configurado', auto: (c) => c.checks?.whatsappOk },
  { key: 'logins', label: 'Logins da equipe criados', auto: (c) => (c.checks?.logins || 0) > 0 },
  { key: 'estoque', label: 'Primeiro estoque cadastrado', auto: (c) => (c.checks?.cars || 0) > 0 },
  { key: 'contratos', label: 'Modelos de contrato da loja' },
  { key: 'treinamento', label: 'Treinamento da equipe' },
]

export function onboardingStatus(client) {
  const marks = client.account?.onboarding || {}
  return ONBOARDING_ITEMS.map((item) => {
    const auto = item.auto ? Boolean(item.auto(client)) : false
    return { ...item, auto, done: auto || Boolean(marks[item.key]) }
  })
}

// Cliente com mensalidade correndo (em implantação ou sem cobrança não conta)
export function isCharged(billing) {
  return Boolean(billing?.situation) && !['implantacao', 'sem_cobranca'].includes(billing.situation)
}

// 1º vencimento automático: 30 dias depois da ativação; se cair no dia 29, 30
// ou 31, vira o dia 1 do mês seguinte (a mesma regra do client_billing, seção 43)
export function firstAutoDue(activatedOn) {
  if (!activatedOn) return null
  const [y, m, d] = activatedOn.split('-').map(Number)
  let due = new Date(Date.UTC(y, m - 1, d + 30))
  if (due.getUTCDate() > 28) due = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth() + 1, 1))
  return due.toISOString().slice(0, 10)
}

// Dias em implantação: contando (ainda em implantação) ou quanto levou até ativar
export function implantationDays(account, today = new Date()) {
  const start = account?.implantationStartedOn
  if (!start) return null
  if (account.status === 'implantacao') return { days: Math.max(0, -daysUntil(start, today)), done: false }
  if (account.activatedOn) return { days: Math.max(0, daysUntil(account.activatedOn, new Date(`${start}T12:00:00`))), done: true }
  return null
}

// 1º vencimento depois de ativar: o dia e o mês escolhidos à mão valem no
// lugar dos automáticos (como no client_billing)
export function firstDueDate({ activatedOn, dueDay, billingStart }) {
  const auto = firstAutoDue(activatedOn)
  if (!auto && !(dueDay && billingStart)) return null
  const month = billingStart ? billingStart.slice(0, 7) : auto.slice(0, 7)
  const day = dueDay || Number(auto.slice(8, 10))
  return `${month}-${String(day).padStart(2, '0')}`
}
