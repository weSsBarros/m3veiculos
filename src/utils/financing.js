import { daysBetweenISO, todayISO } from './carFormat.js'
import { inRange } from './period.js'

// Financiamento próprio da loja (carnê): cálculo de parcela, multa e juros por
// atraso e o resumo de cada financiamento. Diferente do resto do sistema, aqui
// os valores têm centavos.

export const PAYMENT_METHODS = ['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito', 'Boleto', 'Transferência', 'Outro']

export function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

// "1.234,56" → 1234.56. Sem vírgula, "1234.5" ou "1234.56" também é aceito
// como decimal; nos demais casos o ponto é separador de milhar.
export function parseMoneyBR(value) {
  if (value === null || value === undefined) return null
  const str = String(value).trim().replace(/[R$\s]/g, '')
  if (!str) return null
  let normalized
  if (str.includes(',')) normalized = str.replace(/\./g, '').replace(',', '.')
  else if (/^\d+\.\d{1,2}$/.test(str)) normalized = str
  else normalized = str.replace(/\./g, '')
  const number = Number(normalized.replace(/[^\d.]/g, ''))
  return Number.isFinite(number) ? round2(number) : null
}

// 1234.5 → "1.234,50" (para preencher campos de valor)
export function formatMoneyInput(value) {
  if (value === null || value === undefined || value === '') return ''
  return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// "1,5" → 1.5 (percentuais)
export function parsePercentBR(value) {
  if (value === null || value === undefined) return null
  const str = String(value).trim().replace('%', '').replace(',', '.')
  if (!str) return null
  const number = Number(str)
  return Number.isFinite(number) ? number : null
}

// Parcela fixa (Tabela Price). Taxa em % ao mês; sem taxa = valor dividido igualmente.
export function priceInstallment(principal, months, monthlyRatePercent) {
  if (!principal || !months) return 0
  const i = (monthlyRatePercent || 0) / 100
  if (!i) return round2(principal / months)
  return round2((principal * i) / (1 - Math.pow(1 + i, -months)))
}

export function isInstallmentPaid(installment) {
  return Boolean(installment.paidOn)
}

// 'paga' | 'atrasada' | 'aberta'
export function installmentStatus(installment, today = todayISO()) {
  if (isInstallmentPaid(installment)) return 'paga'
  return installment.dueDate < today ? 'atrasada' : 'aberta'
}

// Multa (uma vez) + juros ao dia (taxa mensal / 30) sobre o valor da parcela,
// contados do vencimento até a data do pagamento.
export function lateCharges(installment, financing, onDate = todayISO()) {
  const days = Math.max(0, daysBetweenISO(installment.dueDate, onDate))
  if (!days) return { days: 0, fee: 0, interest: 0, total: 0 }
  const fee = round2((installment.amount * (financing.lateFeePercent || 0)) / 100)
  const interest = round2(((installment.amount * (financing.lateInterestPercent || 0)) / 100 / 30) * days)
  return { days, fee, interest, total: round2(fee + interest) }
}

// Resumo de um financiamento:
// total = entrada + parcelas; pago = entrada + parcelas pagas; saldo = parcelas em aberto.
// Multa e juros recebidos ficam à parte (não entram no total nem no saldo).
export function summarizeFinancing(financing, today = todayISO()) {
  const installments = financing.installments || []
  let paidAmount = 0
  let openAmount = 0
  let paidCount = 0
  let overdueCount = 0
  let overdueAmount = 0
  let chargesReceived = 0
  let nextDue = null
  for (const inst of installments) {
    if (isInstallmentPaid(inst)) {
      paidCount += 1
      paidAmount += inst.amount
      chargesReceived += inst.lateCharges || 0
      continue
    }
    openAmount += inst.amount
    if (!nextDue || inst.dueDate < nextDue.dueDate) nextDue = inst
    if (inst.dueDate < today) {
      overdueCount += 1
      overdueAmount += inst.amount + lateCharges(inst, financing, today).total
    }
  }
  let status
  if (financing.status === 'cancelado') status = 'cancelado'
  else if (installments.length > 0 && paidCount === installments.length) status = 'quitado'
  else if (overdueCount > 0) status = 'em_atraso'
  else status = 'em_dia'
  return {
    total: round2(financing.downPayment + paidAmount + openAmount),
    paid: round2(financing.downPayment + paidAmount),
    open: round2(openAmount),
    paidCount,
    count: installments.length,
    overdueCount,
    overdueAmount: round2(overdueAmount),
    chargesReceived: round2(chargesReceived),
    nextDue,
    status,
  }
}

export const FINANCING_STATUS_LABELS = {
  em_dia: 'Em dia',
  em_atraso: 'Em atraso',
  quitado: 'Quitado',
  cancelado: 'Cancelado',
}

// Parcela em aberto que vence nos próximos `days` dias (lembrete ao cliente)
export function isDueSoon(installment, today = todayISO(), days = 7) {
  if (isInstallmentPaid(installment) || installment.dueDate < today) return false
  return daysBetweenISO(today, installment.dueDate) <= days
}

// Parcelas de um financiamento num período (Financeiro dos clientes): as que
// vencem nele (em aberto = a receber) e as pagas nele (recebido)
export function financingInPeriod(financing, range) {
  const installments = financing.installments || []
  const due = installments.filter((i) => inRange(i.dueDate, range))
  const dueOpen = due.filter((i) => !isInstallmentPaid(i))
  const paid = installments.filter((i) => isInstallmentPaid(i) && inRange(i.paidOn, range))
  return {
    dueCount: due.length,
    dueAmount: round2(due.reduce((s, i) => s + i.amount, 0)),
    dueOpenCount: dueOpen.length,
    dueOpenAmount: round2(dueOpen.reduce((s, i) => s + i.amount, 0)),
    paidCount: paid.length,
    paidAmount: round2(paid.reduce((s, i) => s + (i.paidAmount ?? i.amount), 0)),
    active: due.length > 0 || paid.length > 0,
  }
}
