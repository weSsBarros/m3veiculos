// Valores privados (seção 73): carro com o cadeado de outro sócio chega com
// valuesHidden = true e sem o custo. Para quem não vê, ele fica fora das contas
// de dinheiro (custo, gastos, margem, lucro e o valor das vendas), decisão do
// Wesley, e a tela avisa quantos ficaram de fora.

export const isValuesHidden = (car) => Boolean(car?.valuesHidden)

// { cars: os que entram nas contas, hidden: quantos ficaram de fora }
export function withoutPrivate(cars) {
  const list = cars || []
  const visible = list.filter((c) => !isValuesHidden(c))
  return { cars: visible, hidden: list.length - visible.length }
}

// Itens com carId (vendas, gastos, financiamentos) dos carros que entram nas contas
export function itemsWithoutPrivate(items, cars, key = 'carId') {
  const hiddenIds = new Set((cars || []).filter(isValuesHidden).map((c) => c.id))
  const list = items || []
  const visible = list.filter((item) => !hiddenIds.has(item[key]))
  return { items: visible, hidden: list.length - visible.length }
}

export function privateNote(count) {
  if (!count) return ''
  return count === 1
    ? '1 carro com valores privados fica fora destes números.'
    : `${count} carros com valores privados ficam fora destes números.`
}

// Etiqueta do carro com cadeado: "Valores privados (só você vê)", "... de Ana"
export function privateLabel(car) {
  const p = car?.privateValues
  if (!p) return ''
  if (p.isOwner) return 'Valores privados (seu cadeado)'
  return p.canSee ? `Valores privados de ${p.ownerName} (liberado para você)` : `Valores privados de ${p.ownerName}`
}
