// Configurações → Painel: abas escondidas (da loja toda ou só do gerente ou
// do vendedor) e blocos escondidos do Dashboard. Fica em
// companies.panel_settings: { hiddenTabs: { all, manager, seller }, hiddenBlocks }.
// O início do painel (Dashboard / Minhas vendas) e as Configurações não somem.

// roles: papéis que têm a aba no menu (as outras células ficam desabilitadas)
export const PANEL_TABS = [
  { key: 'estoque', label: 'Estoque', path: '/admin/estoque', roles: ['admin', 'manager', 'seller'] },
  { key: 'novo-carro', label: 'Novo carro', path: '/admin/carros/novo', roles: ['admin', 'manager', 'seller'] },
  { key: 'vendas', label: 'Vendas', path: '/admin/vendas', roles: ['admin', 'manager', 'seller'] },
  { key: 'financeiro', label: 'Financeiro', path: '/admin/financeiro', roles: ['admin', 'manager'] },
  { key: 'financiamentos-externos', label: 'Financ. externos', path: '/admin/financiamentos-externos', roles: ['admin', 'manager', 'seller'] },
  { key: 'relatorios', label: 'Relatórios', path: '/admin/relatorios', roles: ['admin', 'manager', 'seller'] },
  { key: 'historico', label: 'Histórico', path: '/admin/historico', roles: ['admin', 'manager'] },
  { key: 'contratos', label: 'Contratos', path: '/admin/contratos', roles: ['admin', 'manager', 'seller'] },
  { key: 'clientes', label: 'Clientes', path: '/admin/clientes', roles: ['admin', 'manager', 'seller'] },
  { key: 'fornecedores', label: 'Fornecedores', path: '/admin/fornecedores', roles: ['admin', 'manager'] },
  { key: 'equipe', label: 'Equipe', path: '/admin/equipe', roles: ['admin', 'manager'] },
  { key: 'atividades', label: 'Atividades', path: '/admin/atividades', roles: ['admin', 'manager'] },
  { key: 'desempenho', label: 'Desempenho', path: '/admin/desempenho', roles: ['admin'] },
]

export const DASHBOARD_BLOCKS = [
  { key: 'alerts', label: 'Alertas de transferências e parcelas em atraso' },
  { key: 'pendencies', label: 'Pendências' },
  { key: 'stats', label: 'Números do período (vendas, faturamento, estoque)' },
  { key: 'revenue6m', label: 'Faturamento dos últimos 6 meses' },
  { key: 'salesByMonth', label: 'Vendas por mês' },
  { key: 'byStatus', label: 'Carros por status' },
  { key: 'bySeller', label: 'Vendas por vendedor' },
  { key: 'expensesByCategory', label: 'Gastos por categoria' },
  { key: 'expensesBySupplier', label: 'Gastos por fornecedor' },
  { key: 'visits', label: 'Visitas no site' },
]

// Aba de cada pendência do Dashboard: escondida a aba, some o aviso
export const PENDENCY_TABS = {
  'res-exp': 'vendas',
  'res-soon': 'vendas',
  'inst-soon': 'financeiro',
  'ext-stale': 'financiamentos-externos',
  'ext-approved': 'financiamentos-externos',
  commissions: 'equipe',
  'sale-customer': 'vendas',
  'sale-contract': 'vendas',
  'sale-checklist': 'vendas',
  'car-photo': 'estoque',
  'car-price': 'estoque',
  'car-docs': 'estoque',
  'interest-match': 'clientes',
  'follow-up': 'clientes',
  'liked-car-gone': 'clientes',
}

function list(value) {
  return Array.isArray(value) ? value.filter((x) => typeof x === 'string') : []
}

export function normalizePanelSettings(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const tabs = src.hiddenTabs && typeof src.hiddenTabs === 'object' ? src.hiddenTabs : {}
  return {
    hiddenTabs: { all: list(tabs.all), manager: list(tabs.manager), seller: list(tabs.seller) },
    hiddenBlocks: list(src.hiddenBlocks),
  }
}

// Aba escondida para quem está usando o painel (role: papel em uso, inclusive
// no "ver como"). "Esconder de todos" vale também para o admin.
export function isTabHidden(settings, key, role) {
  if (!key) return false
  const { hiddenTabs } = normalizePanelSettings(settings)
  if (hiddenTabs.all.includes(key)) return true
  if (role === 'manager') return hiddenTabs.manager.includes(key)
  if (role === 'seller') return hiddenTabs.seller.includes(key)
  return false
}

// Abas que um nível de acesso pode ter (o vendedor, por exemplo, nunca tem o
// Financeiro): as opções dos cargos e do menu de cada pessoa
export function tabsForRole(role) {
  return PANEL_TABS.filter((t) => t.roles.includes(role))
}

// Aba escondida no menu de quem está usando o painel (inclusive no "ver como").
// person: { role, customRole, panelTabs }.
// - "Esconder de todos" vale para todo mundo, inclusive o admin.
// - Menu próprio da pessoa (panelTabs) ou cargo personalizado (customRole.tabs):
//   só as abas da lista aparecem (aba nova fica escondida até o admin marcar).
// - Sem cargo personalizado: as colunas de gerente e vendedor de Configurações.
export function menuTabHidden(settings, key, person = {}) {
  if (!key) return false
  const { role, customRole = null, panelTabs = null } = person
  const { hiddenTabs } = normalizePanelSettings(settings)
  if (hiddenTabs.all.includes(key)) return true
  if (role !== 'manager' && role !== 'seller') return false
  const shown = Array.isArray(panelTabs) ? panelTabs : customRole ? list(customRole.tabs) : null
  if (shown) return !shown.includes(key)
  return hiddenTabs[role].includes(key)
}

export function isBlockHidden(settings, key) {
  return normalizePanelSettings(settings).hiddenBlocks.includes(key)
}

// Aba de um endereço do painel (para a tela de "aba escondida")
export function tabForPath(pathname) {
  if (pathname === '/admin/carros/novo') return 'novo-carro'
  if (pathname.startsWith('/admin/carros/')) return 'estoque'
  const tab = PANEL_TABS.find((t) => pathname === t.path || pathname.startsWith(`${t.path}/`))
  return tab ? tab.key : null
}

// Liga ou desliga uma aba numa das colunas (all, manager, seller)
export function toggleHiddenTab(settings, column, key) {
  const next = normalizePanelSettings(settings)
  const current = next.hiddenTabs[column]
  next.hiddenTabs[column] = current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
  return next
}

export function toggleHiddenBlock(settings, key) {
  const next = normalizePanelSettings(settings)
  next.hiddenBlocks = next.hiddenBlocks.includes(key) ? next.hiddenBlocks.filter((k) => k !== key) : [...next.hiddenBlocks, key]
  return next
}

// Nome de cada pendência (lista de avisos escondidos)
export const PENDENCY_LABELS = {
  'res-exp': 'Reservas que passaram do prazo',
  'res-soon': 'Reservas vencendo',
  'inst-soon': 'Parcelas de clientes vencendo',
  'ext-stale': 'Financiamentos externos parados em análise',
  'ext-approved': 'Financiamentos externos aprovados aguardando o banco',
  commissions: 'Comissões a pagar',
  'sale-customer': 'Vendas sem cliente vinculado',
  'sale-contract': 'Vendas sem contrato ou documento',
  'sale-checklist': 'Checklist de entrega incompleto',
  'car-photo': 'Carros sem foto',
  'car-price': 'Carros sem preço',
  'car-docs': 'Carros sem documento anexado',
  'interest-match': 'Clientes com carro novo que combina',
  'follow-up': 'Retornos de atendimento',
  'liked-car-gone': 'Carro de que o cliente gostou foi vendido ou reservado',
}
