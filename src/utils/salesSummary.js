import { isValuesHidden } from './privateValues.js'

// Números da aba Vendas (até 11/10/2026 ficavam na aba Histórico): custo e
// margem de cada carro vendido e os totais do período escolhido.

// Custo total = compra + todos os gastos do carro (sem filtro de período: é o
// lucro real daquela venda). Sem "Preço de compra" ou com o cadeado de outro
// sócio, a margem fica de fora (null).
export function saleCost(car, carExpenses, revenue) {
  if (isValuesHidden(car)) return { totalCost: null, margin: null }
  const totalCost = (car.purchasePrice || 0) + (carExpenses || 0)
  const margin = car.purchasePrice && revenue != null ? revenue - totalCost : null
  return { totalCost, margin }
}

// rows: [{ car, price, margin }] das vendas do período.
// A quantidade conta todas; faturamento, ticket médio e lucro deixam de fora os
// carros com valores privados de outro sócio (seção 73).
export function salesSummary(rows) {
  const list = rows || []
  const hidden = list.filter((r) => isValuesHidden(r.car)).length
  const priced = list.filter((r) => r.price != null && !isValuesHidden(r.car))
  const withMargin = list.filter((r) => r.margin != null && !isValuesHidden(r.car))
  const revenue = priced.reduce((sum, r) => sum + r.price, 0)
  return {
    count: list.length,
    hidden,
    revenue,
    pricedCount: priced.length,
    avgTicket: priced.length ? Math.round(revenue / priced.length) : null,
    profit: withMargin.reduce((sum, r) => sum + r.margin, 0),
    marginCount: withMargin.length,
    // Vendidos que poderiam ter margem, mas estão sem "Preço de compra"
    missingCost: list.length - hidden - withMargin.length,
  }
}
