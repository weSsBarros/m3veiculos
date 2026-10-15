// Tipos de veículo além dos carros (SUV, Sedan, Hatch, Picape ficam no
// carFormat.js de cada loja, com a foto da categoria). Igual em todas as lojas.
// * Moto (05/10/2026); caminhão, jet ski, quadriciclo e UTV (14/10/2026).
// * No site, cada um só aparece nos filtros quando a loja tem um no estoque.
// * Sem portas: moto, jet ski, quadriciclo e UTV (doors = 0, sem "Portas").
// * Jet ski conta "Horas de uso" no lugar da quilometragem (o número fica na
//   mesma coluna km; decisão do Wesley: só o jet ski).
export const EXTRA_VEHICLE_CATEGORIES = [
  { slug: 'moto', label: 'Moto', one: 'moto', many: 'motos', image: '' },
  { slug: 'caminhao', label: 'Caminhão', one: 'caminhão', many: 'caminhões', image: '' },
  { slug: 'jetski', label: 'Jet ski', one: 'jet ski', many: 'jet skis', image: '' },
  { slug: 'quadriciclo', label: 'Quadriciclo', one: 'quadriciclo', many: 'quadriciclos', image: '' },
  { slug: 'utv', label: 'UTV', one: 'UTV', many: 'UTVs', image: '' },
]

const NO_DOORS = new Set(['moto', 'jetski', 'quadriciclo', 'utv'])
const HOURS = new Set(['jetski'])
const EXTRA_SLUGS = new Set(EXTRA_VEHICLE_CATEGORIES.map((c) => c.slug))

// Carro (SUV, Sedan, Hatch, Picape): a Webmotors só recebe carros, e a OLX
// recebe carros e motos
export function isCarCategory(category) {
  return !EXTRA_SLUGS.has(category)
}

export function vehicleHasDoors(category) {
  return !NO_DOORS.has(category)
}

export function vehicleUsesHours(category) {
  return HOURS.has(category)
}

// Rótulo do campo e do dado: "Quilometragem" ou "Horas de uso"
export function mileageLabel(category) {
  return vehicleUsesHours(category) ? 'Horas de uso' : 'Quilometragem'
}

export function mileageUnit(category) {
  return vehicleUsesHours(category) ? 'h' : 'km'
}

// "45.000 km" ou "120 h"; sem número: ''
export function formatMileage(car) {
  const km = car?.km
  if (km == null || km === '' || Number.isNaN(Number(km))) return ''
  return `${Number(km).toLocaleString('pt-BR')} ${mileageUnit(car?.category)}`
}

// "1 carro", "3 motos", "2 caminhões" (contagens do site)
export function vehicleCountLabel(category, count) {
  const extra = EXTRA_VEHICLE_CATEGORIES.find((c) => c.slug === category)
  if (!extra) return `${count} ${count === 1 ? 'carro' : 'carros'}`
  return `${count} ${count === 1 ? extra.one : extra.many}`
}

// Tabela FIPE de cada tipo (o jet ski, o quadriciclo e o UTV não têm uma
// própria: a pessoa escolhe na cascata)
export function fipeTipoForCategory(category) {
  if (category === 'moto') return 'motos'
  if (category === 'caminhao') return 'caminhoes'
  return 'carros'
}
