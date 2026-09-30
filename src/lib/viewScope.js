// "Ver como": o admin vê o painel como uma pessoa da equipe (ou como um
// vendedor/gerente genérico, se a loja ainda não tem equipe).
//
// O login continua sendo o do admin, então o banco devolve tudo. Aqui ficam
// as regras que o banco aplicaria para aquela pessoa, repetidas no navegador:
// as funções de leitura (lib/*Api.js) passam os resultados por estes filtros.
// Enquanto simula, nenhuma gravação é feita (ver supabaseClient.js).
//
// scope: null (normal) ou { name, role: 'seller' | 'manager', sellerId,
// userId, financeAccess: 'values' | 'counts' }

let scope = null

export function setViewScope(next) {
  scope = next
}

export function getViewScope() {
  return scope
}

export function simulationMessage() {
  return scope
    ? `Você está vendo o painel como ${scope.name}. Volte para admin para fazer alterações.`
    : ''
}

export function assertCanWrite() {
  if (scope) throw new Error(simulationMessage())
}

const isSeller = () => scope?.role === 'seller'
const canSeeValues = () => scope?.role === 'manager' && scope.financeAccess === 'values'

// Vendas: o vendedor vê só as dele
export function scopeSales(rows) {
  if (!isSeller()) return rows
  return rows.filter((r) => r.sellerId && r.sellerId === scope.sellerId)
}

// Registros que o vendedor vê só quando foi ele quem criou (contratos,
// documentos do cliente)
export function scopeByCreator(rows) {
  if (!isSeller()) return rows
  return rows.filter((r) => r.createdBy && r.createdBy === scope.userId)
}

// Reservas e financiamentos externos: o vendedor vê os dele
export function scopeBySellerOrCreator(rows) {
  if (!isSeller()) return rows
  return rows.filter((r) => (r.sellerId && r.sellerId === scope.sellerId) || (r.createdBy && r.createdBy === scope.userId))
}

// Carros: sem custo de compra para quem não é admin
export function scopeCars(rows) {
  if (!scope) return rows
  return rows.map((car) => ({ ...car, purchasePrice: null, purchaseDate: null }))
}

// Gastos lançados: só o admin lê
export function scopeExpenses(rows) {
  return scope ? [] : rows
}

// Equipe: o vendedor vê só o próprio cadastro
export function scopeSellers(rows) {
  if (!isSeller()) return rows
  return rows.filter((s) => s.id === scope.sellerId)
}

// Financiamento próprio da loja: admin e gerente que vê valores
export function scopeCustomerFinance(rows) {
  if (!scope) return rows
  return canSeeValues() ? rows : []
}

// Registro de atividades: gerente não vê gastos lançados por outros nem
// financiamentos (sem "vê valores"); vendedor não vê nada
export function scopeActivity(rows) {
  if (!scope) return rows
  if (isSeller()) return []
  return rows.filter((e) => {
    if (e.entity === 'car_expenses' && e.userId !== scope.userId) return false
    if (['customer_financings', 'financing_installments'].includes(e.entity) && !canSeeValues()) return false
    return true
  })
}
