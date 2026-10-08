// Partes comuns da situação de um carro nos portais (OLX e Webmotors): tom da
// etiqueta, contagens, filtros, ordem da lista e a etiqueta do estoque. A
// situação de cada portal fica em olxStatus.js e webmotorsStatus.js.

// Classe da etiqueta (admin-pill) de cada tom
export const PORTAL_TONE_CLASS = { ok: 'is-success', wait: 'is-info', warn: 'is-warning', problem: 'is-danger', off: '' }

const WAITING = ['aguardando', 'pendente', 'fila', 'removendo', 'saindo']

// Contagens para os números da aba Portais
export function portalSummary(states) {
  const summary = { publicados: 0, aguardando: 0, problemas: 0, prontos: 0, fora: 0 }
  for (const s of states) {
    if (!s) continue
    // Na loja de demonstração o anúncio simulado conta como publicado
    if (s.key === 'publicado' || s.key === 'simulado') summary.publicados += 1
    else if (s.problem) summary.problemas += 1
    else if (WAITING.includes(s.key)) summary.aguardando += 1
    else if (s.key === 'pronto') summary.prontos += 1
    else summary.fora += 1
  }
  return summary
}

// Filtros da lista da aba Portais ("Na OLX", "Fora da Webmotors"...)
export function portalFilters(name) {
  return [
    { value: 'todos', label: 'Todos' },
    { value: 'problemas', label: 'Com problema' },
    { value: 'publicados', label: `Na ${name}` },
    { value: 'prontos', label: 'Prontos' },
    { value: 'fora', label: `Fora da ${name}` },
  ]
}

export function portalMatchesFilter(state, filter) {
  if (!state || filter === 'todos') return true
  if (filter === 'problemas') return state.problem
  if (filter === 'publicados') return state.key === 'publicado' || state.key === 'simulado'
  if (filter === 'prontos') return state.key === 'pronto' || state.key === 'fila'
  if (filter === 'fora') return state.key === 'fora'
  return true
}

// Ordem da lista: problemas, prontos, aguardando, no portal, fora
const ORDER = { pronto: 1, fila: 1, pendente: 2, aguardando: 2, simulado: 2, removendo: 2, saindo: 2, publicado: 3, fora: 4 }

export function portalStateOrder(state) {
  if (!state) return 5
  if (state.problem) return 0
  return ORDER[state.key] ?? 5
}

// Etiqueta do estoque: só quando diz algo útil ({ label, tone } ou null)
export function portalBadge(state, name) {
  if (!state) return null
  if (state.key === 'publicado') return { label: `Na ${name}`, tone: 'is-ok' }
  if (state.problem) return { label: `${name}: ${state.label.toLowerCase()}`, tone: 'is-problem' }
  if (WAITING.includes(state.key)) return { label: `${name}: ${state.label.toLowerCase()}`, tone: 'is-wait' }
  return null
}

// "06/10, 14:30" (última sincronização)
export function formatPortalDateTime(iso) {
  return iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
}
