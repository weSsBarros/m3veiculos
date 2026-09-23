export const CATEGORIES = [
  { slug: 'suv', label: 'SUV', image: '/categorias/suv.webp' },
  { slug: 'sedan', label: 'Sedan', image: '/categorias/sedan.webp' },
  { slug: 'hatch', label: 'Hatch', image: '/categorias/hatch.webp' },
  { slug: 'picape', label: 'Picape', image: '/categorias/picape.webp' },
]

export const BRANDS = [
  'Toyota', 'Honda', 'Volkswagen', 'Chevrolet', 'Jeep',
  'Fiat', 'Hyundai', 'Renault', 'Nissan', 'Ford',
]

export const TRANSMISSIONS = ['Manual', 'Automático', 'Automático CVT', 'Automático 6 marchas', 'Automático 9 marchas']

export const FUELS = ['Flex', 'Gasolina', 'Diesel', 'Híbrido', 'Elétrico', 'GNV']

export const CONDITIONS = ['Único dono', 'Segundo dono', 'Terceiro dono ou mais']

export const CAR_STATUSES = [
  { value: 'disponivel', label: 'Disponível' },
  { value: 'manutencao', label: 'Em manutenção' },
  { value: 'vendido', label: 'Vendido' },
]

export function carStatusLabel(status) {
  return CAR_STATUSES.find((s) => s.value === status)?.label || status
}

export const EXPENSE_CATEGORIES = [
  { slug: 'mecanica', label: 'Mecânica/Manutenção' },
  { slug: 'eletrica', label: 'Elétrica' },
  { slug: 'funilaria', label: 'Funilaria/Pintura' },
  { slug: 'pneus', label: 'Pneus/Suspensão' },
  { slug: 'combustivel', label: 'Combustível' },
  { slug: 'documentacao', label: 'Documentação' },
  { slug: 'higienizacao', label: 'Higienização/Estética' },
  { slug: 'outros', label: 'Outros' },
]

export function expenseCategoryLabel(slug) {
  return EXPENSE_CATEGORIES.find((c) => c.slug === slug)?.label || slug
}

export function formatCurrency(value) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

// Converte um número digitado em formato brasileiro (ex: "45.000", "35.900,50", "1.234.567")
// para um Number de verdade. Aceita "." como separador de milhar e "," como decimal,
// e também números "crus" (sem separador) digitados normalmente.
export function parseLocaleNumber(value) {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'number') return value

  let cleaned = String(value).trim().replace(/[^\d.,-]/g, '')
  if (!cleaned) return ''

  const hasComma = cleaned.includes(',')
  const hasDot = cleaned.includes('.')

  if (hasComma && hasDot) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
  } else if (hasComma) {
    cleaned = cleaned.replace(',', '.')
  } else if (hasDot) {
    const parts = cleaned.split('.')
    const lastPart = parts[parts.length - 1]
    // "45.000" (milhar) vira 45000 — "35.9" (decimal) continua 35.9
    if (parts.length > 2 || lastPart.length === 3) {
      cleaned = cleaned.replace(/\./g, '')
    }
  }

  const num = parseFloat(cleaned)
  return Number.isNaN(num) ? '' : num
}

// Aplica a máscara DD/MM/AAAA enquanto o usuário digita, sem depender do
// seletor nativo de data (que em alguns navegadores mostra mm/dd/aaaa).
export function maskBirthDate(value) {
  const digits = String(value).replace(/\D/g, '').slice(0, 8)
  const day = digits.slice(0, 2)
  const month = digits.slice(2, 4)
  const year = digits.slice(4, 8)
  let result = day
  if (month) result += '/' + month
  if (year) result += '/' + year
  return result
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
