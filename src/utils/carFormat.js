// Fotos reais da M&3 (public/categorias/) — diferente das outras lojas, que
// usam fotos genéricas. Ao trazer atualizações da Dom, manter estas linhas.
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
  { value: 'reservado', label: 'Reservado' },
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

export const SUPPLIER_CATEGORIES = [
  { slug: 'servico', label: 'Prestação de serviço' },
  { slug: 'pecas', label: 'Compra de peças' },
  { slug: 'outros', label: 'Outros' },
]

export function supplierCategoryLabel(slug) {
  return SUPPLIER_CATEGORIES.find((c) => c.slug === slug)?.label || slug
}

export function formatCurrency(value) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

// Comissões podem ter centavos (ex: 1,5% de R$ 79.900)
export function formatCurrencyCents(value) {
  return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
}

// Data de hoje no fuso local (toISOString() usaria UTC e pode virar o dia)
export function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Soma dias a uma data ISO (yyyy-mm-dd) sem passar por UTC
export function addDaysISO(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(y, m - 1, d + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Dias de uma data ISO até outra (negativo se "to" for antes de "from")
export function daysBetweenISO(fromISO, toISO) {
  const [y1, m1, d1] = fromISO.split('-').map(Number)
  const [y2, m2, d2] = toISO.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

// Aceita números digitados no padrão brasileiro: "." separa milhar, ","
// separa decimal (ex: "119.900" ou "95.000,00"). Nenhum valor deste sistema
// (preço, km, gastos) tem centavos, então a parte depois da vírgula é
// descartada — só o "." precisa ser removido antes de extrair os dígitos.
export function parseIntBR(value) {
  if (value === null || value === undefined) return null
  const str = String(value).trim()
  if (!str) return null
  const integerPart = str.split(',')[0].replace(/\./g, '')
  const digits = integerPart.replace(/\D/g, '')
  return digits ? parseInt(digits, 10) : null
}

// Placa só com letras e números, em maiúsculas: "abc-1d23" e "ABC1D23" batem
export function normalizePlate(plate) {
  return String(plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// Busca que também encontra pela placa, digitada com ou sem hífen
export function matchesCarSearch(car, query) {
  const text = query.trim().toLowerCase()
  if (!text) return true
  if (`${car.brand} ${car.model} ${car.version}`.toLowerCase().includes(text)) return true
  const plateQuery = normalizePlate(text)
  return plateQuery.length >= 2 && normalizePlate(car.plate).includes(plateQuery)
}

export function formatDateBR(isoDate) {
  if (!isoDate) return '—'
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('pt-BR')
}

// Dias em estoque: do cadastro (createdAt) até hoje, ou até a venda (soldAt)
// pra carros já vendidos — assim o número não continua subindo depois de vendido.
export function daysInStock(car) {
  const start = new Date(car.createdAt)
  const end = car.status === 'vendido' && car.soldAt ? new Date(car.soldAt) : new Date()
  const diffMs = end - start
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}

// Prazo do aviso vermelho: o do carro, ou o padrão da loja
export function stockAlertThreshold(car, defaultDays = 60) {
  return car.stockAlertDays || defaultDays
}

export function isStockStale(car, defaultDays = 60) {
  return car.status !== 'vendido' && daysInStock(car) >= stockAlertThreshold(car, defaultDays)
}

export function daysInStockLabel(car) {
  const days = daysInStock(car)
  const suffix = days === 1 ? 'dia' : 'dias'
  return car.status === 'vendido' ? `Vendido em ${days} ${suffix}` : `${days} ${suffix} em estoque`
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
