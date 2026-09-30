import { addDaysISO, daysBetweenISO, todayISO } from './carFormat.js'

// Transferência do veículo para o nome do comprador, acompanhada na venda.

export const TRANSFER_STATUSES = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'concluida', label: 'Concluída' },
  { value: 'nao_informada', label: 'Não informada' },
]

export const TRANSFER_RESPONSIBLES = [
  { value: 'comprador', label: 'Comprador' },
  { value: 'loja', label: 'Loja' },
]

// Prazo legal para o comprador transferir (o mesmo do contrato padrão)
export const TRANSFER_DEFAULT_DAYS = 30
// Aviso de "vence logo" quando faltam até estes dias
export const TRANSFER_WARNING_DAYS = 7

export function transferStatusLabel(status) {
  return TRANSFER_STATUSES.find((s) => s.value === status)?.label || 'Não informada'
}

export function transferResponsibleLabel(value) {
  return TRANSFER_RESPONSIBLES.find((r) => r.value === value)?.label || 'Comprador'
}

export function isTransferOpen(sale) {
  return Boolean(sale) && (sale.transferStatus === 'pendente' || sale.transferStatus === 'em_andamento')
}

// Prazo informado na venda, ou 30 dias após a data da venda
export function transferDueDate(sale) {
  if (!sale) return null
  if (sale.transferDueDate) return sale.transferDueDate
  return sale.saleDate ? addDaysISO(sale.saleDate, TRANSFER_DEFAULT_DAYS) : null
}

// 'atrasada' | 'vence_logo' | null (em dia, concluída ou não acompanhada)
export function transferAlert(sale, today = todayISO()) {
  if (!isTransferOpen(sale)) return null
  const due = transferDueDate(sale)
  if (!due) return null
  const daysLeft = daysBetweenISO(today, due)
  if (daysLeft < 0) return 'atrasada'
  if (daysLeft <= TRANSFER_WARNING_DAYS) return 'vence_logo'
  return null
}

// Texto curto do prazo: "atrasada há 3 dias", "vence em 5 dias", "vence hoje"
export function transferDueText(sale, today = todayISO()) {
  const due = transferDueDate(sale)
  if (!due || !isTransferOpen(sale)) return ''
  const daysLeft = daysBetweenISO(today, due)
  if (daysLeft < 0) return `atrasada há ${-daysLeft} ${daysLeft === -1 ? 'dia' : 'dias'}`
  if (daysLeft === 0) return 'vence hoje'
  return `vence em ${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'}`
}
