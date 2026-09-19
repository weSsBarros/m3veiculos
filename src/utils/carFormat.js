export const CATEGORIES = [
  { slug: 'suv', label: 'SUV', image: 'https://images.unsplash.com/photo-1658988297153-e173ba9c490d?auto=format&fit=crop&w=800&q=80' },
  { slug: 'sedan', label: 'Sedan', image: 'https://images.unsplash.com/photo-1774854158646-589f7c712bdc?auto=format&fit=crop&w=800&q=80' },
  { slug: 'hatch', label: 'Hatch', image: 'https://images.unsplash.com/photo-1605270396307-d00ba5cda1d0?auto=format&fit=crop&w=800&q=80' },
  { slug: 'picape', label: 'Picape', image: 'https://images.unsplash.com/photo-1598043249911-1122b7faa4f3?auto=format&fit=crop&w=800&q=80' },
]

export const BRANDS = [
  'Toyota', 'Honda', 'Volkswagen', 'Chevrolet', 'Jeep',
  'Fiat', 'Hyundai', 'Renault', 'Nissan', 'Ford',
]

export const TRANSMISSIONS = ['Manual', 'Automático', 'Automático CVT', 'Automático 6 marchas', 'Automático 9 marchas']

export const FUELS = ['Flex', 'Gasolina', 'Diesel', 'Híbrido', 'Elétrico', 'GNV']

export const CONDITIONS = ['Único dono', 'Segundo dono', 'Terceiro dono ou mais']

export function formatCurrency(value) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

export function estimateInstallment(price, months = 48) {
  const value = (price * 1.22) / months
  return formatCurrency(Math.round(value))
}

export function discountPercent(price, originalPrice) {
  if (!originalPrice || originalPrice <= price) return null
  return Math.round(100 - (price / originalPrice) * 100)
}

export function slugify(text) {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
