// Interesses dos clientes. A regra de "carro que combina" é a mesma da função
// interest_matches_car do banco (que cria os avisos quando entra um carro):
// busca com pelo menos um critério; marca igual, modelo contido em "modelo
// versão", ano mínimo, preço máximo, km máximo e câmbio. Sem acento e sem
// diferença de maiúsculas.

export function normText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export function hasCriteria(interest) {
  return Boolean(
    interest.brand || interest.model || interest.category || interest.transmission ||
    interest.yearMin != null || interest.priceMax != null || interest.kmMax != null
  )
}

export function interestMatchesCar(interest, car) {
  if (!interest || !car || interest.kind !== 'procura' || !interest.active || !hasCriteria(interest)) return false
  if (interest.brand && normText(car.brand) !== normText(interest.brand)) return false
  if (interest.model && !normText(`${car.model} ${car.version}`).includes(normText(interest.model))) return false
  if (interest.category && car.category !== interest.category) return false
  if (interest.yearMin != null && !(Number(car.year) >= interest.yearMin)) return false
  if (interest.priceMax != null && (car.price == null || car.price > interest.priceMax)) return false
  if (interest.kmMax != null && !(Number(car.km) <= interest.kmMax)) return false
  if (interest.transmission && !normText(car.transmission).includes(normText(interest.transmission))) return false
  return true
}

// Carros à venda (disponíveis e visíveis no site) que já combinam com a busca
export function matchingStockCars(interest, cars) {
  return cars.filter((car) => car.status === 'disponivel' && !car.hidden && interestMatchesCar(interest, car))
}

// "Carro do estoque que ele gostou" que foi vendido ou reservado para outra pessoa
export function likedCarGone(interest, car) {
  if (!interest || interest.kind !== 'estoque' || !interest.active || !car) return false
  return (car.status === 'vendido' || car.status === 'reservado') && car.customerId !== interest.customerId
}

// Texto curto da busca: "Toyota Corolla · sedã · a partir de 2019 · até R$ 120.000"
export function describeInterest(interest, { formatCurrency, categoryLabel } = {}) {
  const money = formatCurrency || ((v) => `R$ ${Number(v).toLocaleString('pt-BR')}`)
  const parts = []
  const name = [interest.brand, interest.model].filter(Boolean).join(' ')
  if (name) parts.push(name)
  if (interest.category) parts.push(categoryLabel ? categoryLabel(interest.category) : interest.category)
  if (interest.yearMin != null) parts.push(`a partir de ${interest.yearMin}`)
  if (interest.priceMax != null) parts.push(`até ${money(interest.priceMax)}`)
  if (interest.kmMax != null) parts.push(`até ${Number(interest.kmMax).toLocaleString('pt-BR')} km`)
  if (interest.transmission) parts.push(interest.transmission)
  return parts.join(' · ') || 'Qualquer carro'
}

// Formas de pagamento que o cliente pretende usar
export const PAYMENT_INTENTS = [
  { value: '', label: 'Não informado' },
  { value: 'a_vista', label: 'À vista' },
  { value: 'financiado', label: 'Financiado' },
  { value: 'financiamento_proprio', label: 'Financiamento da loja' },
  { value: 'consorcio', label: 'Consórcio' },
  { value: 'troca', label: 'Troca + diferença' },
]

export function paymentIntentLabel(value) {
  return PAYMENT_INTENTS.find((p) => p.value === value)?.label || ''
}
