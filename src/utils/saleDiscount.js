// Desconto na venda (seção 87, pedido do Wesley em 16/10/2026). O valor da venda
// (o preço combinado antes do desconto) menos o desconto é o valor final, que é o
// que fica gravado em sales.sale_price: comissão, contrato e recibo seguem por ele.
// Valores em reais inteiros, como o sale_price.

const toInt = (v) => {
  const n = Math.round(Number(v) || 0)
  return n > 0 ? n : 0
}

export function finalSalePrice(price, discount) {
  return Math.max(0, toInt(price) - toInt(discount))
}

// Valor da venda antes do desconto de uma venda gravada
export function priceBeforeDiscount(sale) {
  if (!sale) return 0
  return toInt(sale.salePrice) + toInt(sale.discount)
}

// "2,1%" do valor antes do desconto
export function discountPercent(price, discount) {
  const p = toInt(price)
  if (!p || !toInt(discount)) return 0
  return Math.round((toInt(discount) / p) * 1000) / 10
}

export function percentText(value) {
  return `${String(value).replace('.', ',')}%`
}

// Desconto que fecha a venda com o que foi pago: o que falta, arredondado para
// cima (em reais inteiros), para os pagamentos cobrirem o valor final.
export function discountToCloseGap(gap) {
  const g = Number(gap) || 0
  return g > 0.004 ? Math.ceil(g - 1e-9) : 0
}

// Erro do desconto digitado ('' = ok)
export function discountError(price, discount) {
  const d = toInt(discount)
  if (!d) return ''
  if (d >= toInt(price)) return 'O desconto não pode ser igual ou maior que o valor da venda.'
  return ''
}
