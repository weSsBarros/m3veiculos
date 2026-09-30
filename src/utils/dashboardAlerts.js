// Pendências do Dashboard (sem tela e sem banco — recebem os dados já
// carregados). Cada função devolve só contagens/valores; a tela decide o
// texto e para onde cada aviso leva.

import { addDaysISO, todayISO } from './carFormat.js'
import { checklistSummary } from './saleChecklist.js'
import { isStaleAnalysis } from './externalFinancing.js'
import { reservationAlert } from './reservations.js'

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
