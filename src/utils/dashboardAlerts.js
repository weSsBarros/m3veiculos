// Pendências do Dashboard (sem tela e sem banco — recebem os dados já
// carregados). Cada função devolve só contagens/valores; a tela decide o
// texto e para onde cada aviso leva.

import { addDaysISO, todayISO } from './carFormat.js'
import { checklistSummary } from './saleChecklist.js'
import { isStaleAnalysis } from './externalFinancing.js'
import { reservationAlert } from './reservations.js'
import { likedCarGone } from './customerInterests.js'

// Janela das vendas "recentes": vendas antigas (de antes do sistema) não
// viram pendência para sempre
export const RECENT_SALES_DAYS = 90

// Carros em estoque sem foto, sem preço ou sem nenhum documento anexado
export function stockGaps(cars) {
  const inStock = cars.filter((c) => c.status !== 'vendido')
  return {
    noPhoto: inStock.filter((c) => !c.images || c.images.length === 0).length,
    noPrice: inStock.filter((c) => c.price == null).length,
    noDocs: inStock.filter((c) => !c.documents || c.documents.length === 0).length,
  }
}

// Vendas recentes sem cliente vinculado, sem contrato/documento ou com o
// checklist de entrega incompleto
export function saleGaps({ sales, cars, contracts = [], docs = [], today = todayISO() }) {
  const since = addDaysISO(today, -RECENT_SALES_DAYS)
  const carsById = new Map(cars.map((c) => [c.id, c]))
  const carsWithPaper = new Set([...contracts.map((c) => c.carId), ...docs.map((d) => d.carId)].filter(Boolean))
  const recent = sales.filter((s) => s.saleDate >= since && carsById.get(s.carId)?.status === 'vendido')
  return {
    noCustomer: recent.filter((s) => !carsById.get(s.carId)?.customerId).length,
    noContract: recent.filter((s) => !carsWithPaper.has(s.carId)).length,
    checklistIncomplete: recent.filter((s) => s.checklist.length > 0 && checklistSummary(s.checklist).pending > 0).length,
  }
}

// Financiamentos externos parados em análise e aprovados esperando o banco pagar
export function externalGaps(externals, { staleDays = 7, today = new Date() } = {}) {
  return {
    staleAnalysis: externals.filter((e) => isStaleAnalysis(e, staleDays, today)).length,
    approvedUnpaid: externals.filter((e) => e.status === 'aprovado').length,
  }
}

// Comissões ainda não pagas (vendas + financiamentos externos pagos pelo banco)
export function unpaidCommissions(sales, externals = []) {
  const fromSales = sales.filter((s) => s.sellerId && s.commissionAmount && !s.commissionPaidOn)
  const fromExternals = externals.filter((e) => e.sellerId && e.status === 'pago' && e.commissionAmount && !e.commissionPaidOn)
  const amount = [...fromSales, ...fromExternals].reduce((sum, x) => sum + x.commissionAmount, 0)
  return { count: fromSales.length + fromExternals.length, amount: Math.round(amount * 100) / 100 }
}

// Reservas vencidas ou vencendo em até 2 dias
export function reservationGaps(reservations, today = new Date()) {
  const alerts = reservations.map((r) => reservationAlert(r, 2, today))
  return {
    expired: alerts.filter((a) => a === 'vencida').length,
    dueSoon: alerts.filter((a) => a === 'vence_logo').length,
  }
}

// Clientes: avisos de carro que combina ainda não tratados, retornos de
// atendimento para hoje ou atrasados e carros de que o cliente gostou que
// foram vendidos ou reservados para outra pessoa. mine(customerId, row):
// se o registro é da pessoa (o vendedor vê os clientes dele e os sem
// responsável; admin e gerente, todos).
export function customerGaps({ matches = [], contacts = [], interests = [], cars = [], mine = () => true, today = todayISO() }) {
  const carsById = new Map(cars.map((c) => [c.id, c]))
  const followUps = contacts.filter((c) => c.followUpOn && !c.followUpDone && c.followUpOn <= today && mine(c.customerId, c))
  const gone = interests.filter((i) => likedCarGone(i, carsById.get(i.carId)) && mine(i.customerId, i))
  return {
    newMatches: new Set(matches.filter((m) => m.status === 'novo' && mine(m.customerId, m)).map((m) => m.customerId)).size,
    followUps: followUps.length,
    likedCarGone: new Set(gone.map((i) => i.customerId)).size,
  }
}

// Pendência excluída volta quando a contagem passa da que havia ao excluir;
// adiada, quando passa a hora. dismissal: { dismissedCount, snoozedUntil }.
export function isPendencyVisible(dismissal, count, now = new Date()) {
  if (!count) return false
  if (!dismissal) return true
  if (dismissal.snoozedUntil && new Date(dismissal.snoozedUntil) > now) return false
  if (dismissal.dismissedCount != null && count <= dismissal.dismissedCount) return false
  return true
}

// Contagem caiu depois de excluir: guarda a menor, para o aviso voltar assim
// que aparecer um item novo (ex.: excluiu com 3, resolveu 2 e entrou 1 novo).
export function lowerDismissedCount(dismissal, count) {
  if (!dismissal || dismissal.dismissedCount == null) return null
  return count < dismissal.dismissedCount ? count : null
}
