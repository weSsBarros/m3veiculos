import { CATEGORIES, formatCurrency } from '../utils/carFormat.js'
import { EXTRA_VEHICLE_CATEGORIES } from '../utils/vehicleTypes.js'

// Partes que os três modelos de site usam (contas sobre o estoque, sem tela)

export const NAV = [
  { to: '/', label: 'Início', end: true },
  { to: '/estoque', label: 'Estoque' },
  { to: '/financiamento', label: 'Financiamento' },
  { to: '/venda-seu-veiculo', label: 'Venda ou troca' },
  { to: '/sobre', label: 'Sobre' },
  { to: '/contato', label: 'Contato' },
]

const PLURAL = {
  hatch: 'Hatches',
  sedan: 'Sedãs',
  suv: 'SUVs',
  picape: 'Picapes',
  moto: 'Motos',
  caminhao: 'Caminhões',
  jetski: 'Jet skis',
  quadriciclo: 'Quadriciclos',
  utv: 'UTVs',
}

const CATEGORY_ORDER = ['hatch', 'sedan', 'suv', 'picape', ...EXTRA_VEHICLE_CATEGORIES.map((e) => e.slug)]

export const SORTS = [
  { value: 'recentes', label: 'Mais recentes' },
  { value: 'menor-preco', label: 'Menor preço' },
  { value: 'maior-preco', label: 'Maior preço' },
  { value: 'menor-km', label: 'Menor km' },
]

export function priceText(car) {
  return car.price != null ? formatCurrency(car.price) : 'Consulte o valor'
}

export function transmissionShort(transmission) {
  if (!transmission) return ''
  return transmission.startsWith('Automático') ? 'Automático' : transmission
}

// Tem foto de verdade (a lista pode vir com um caminho vazio)
export const hasPhoto = (car) => Boolean(car.images?.find(Boolean))

// Os destaques primeiro, na ordem em que vieram
export function featuredFirst(cars) {
  return [...cars.filter((c) => c.featured), ...cars.filter((c) => !c.featured)]
}

// Os com foto primeiro (e, entre eles, os destaques): carro sem foto vai para o fim
export function photosFirst(cars) {
  return featuredFirst(cars).sort((a, b) => Number(!hasPhoto(a)) - Number(!hasPhoto(b)))
}

// Carros do palco/vitrine: só com foto; destaques primeiro (até "max")
export function showcaseCars(cars, max = 5) {
  return featuredFirst(cars.filter(hasPhoto)).slice(0, max)
}

// Categorias que a loja tem, com a contagem: [{ slug, label, count }]
export function categoryCounts(cars) {
  const counts = new Map()
  for (const car of cars) counts.set(car.category, (counts.get(car.category) || 0) + 1)
  return CATEGORY_ORDER.filter((slug) => counts.get(slug)).map((slug) => ({
    slug,
    label: PLURAL[slug] || CATEGORIES.find((c) => c.slug === slug)?.label || slug,
    count: counts.get(slug),
  }))
}

// Marcas do estoque, da que tem mais carros para a que tem menos: [{ brand, count }]
export function brandCounts(cars) {
  const counts = new Map()
  for (const car of cars) {
    if (car.brand) counts.set(car.brand, (counts.get(car.brand) || 0) + 1)
  }
  return [...counts.entries()]
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand))
}

// Ordena sem mudar a lista original. Carro sem preço vai para o fim nas ordens de preço.
export function sortCars(cars, sort = 'recentes') {
  const list = [...cars]
  const byPrice = (dir) => (a, b) => {
    if (a.price == null && b.price == null) return 0
    if (a.price == null) return 1
    if (b.price == null) return -1
    return dir * (a.price - b.price)
  }
  if (sort === 'menor-preco') return list.sort(byPrice(1))
  if (sort === 'maior-preco') return list.sort(byPrice(-1))
  if (sort === 'menor-km') return list.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity))
  return list
}

// Filtro da página inicial do modelo "Estoque primeiro"
export function filterCars(cars, { categoria = '', marca = '' } = {}) {
  return cars.filter((c) => (!categoria || c.category === categoria) && (!marca || c.brand === marca))
}

// Endereço do estoque completo com os mesmos filtros
export function stockLink({ categoria = '', marca = '' } = {}) {
  const params = new URLSearchParams()
  if (categoria) params.set('categoria', categoria)
  if (marca) params.set('marca', marca)
  const query = params.toString()
  return `/estoque${query ? `?${query}` : ''}`
}

// Link do Google Maps para o endereço da loja (sem endereço, nada)
export function mapsLink(addressLines) {
  const text = (addressLines || []).filter(Boolean).join(', ')
  return text ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}` : ''
}
