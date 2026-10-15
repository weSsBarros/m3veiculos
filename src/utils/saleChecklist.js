// Checklist de itens conferidos na venda (manual, chave reserva etc.). A lista
// de itens é de cada loja (companies.sale_checklist); cada venda guarda o que
// foi marcado: [{ item, status }], com status 'ok' (possui e foi entregue),
// 'retido' (possui, mas fica com a loja: ex.: a chave reserva até a quitação),
// 'possui' (possui, entrega ainda não marcada), 'nao_possui' (o carro não tem o
// item) ou null (não conferido). Desde 14/10/2026 a venda mostra as colunas
// "Possui" e "Entregue"; a lista de itens do cadastro do carro usa só 'ok' e
// 'nao_possui' ("Veio" / "Não veio").

export const DEFAULT_SALE_CHECKLIST = [
  'Manual do proprietário',
  'Chave reserva',
  'Livro de revisões',
  'Estepe',
  'Macaco e chave de roda',
  'Triângulo',
  'Tapetes',
  'CRLV (documento do veículo)',
]

export const CHECKLIST_STATUS_LABELS = {
  ok: 'Entregue',
  retido: 'Possui, não entregue (fica com a loja)',
  possui: 'Possui (entrega não conferida)',
  nao_possui: 'Não possui',
}

// Colunas da venda: "Possui" (true/false/null) e "Entregue" (true/false/null)
export function checklistHas(status) {
  if (status === 'ok' || status === 'retido' || status === 'possui') return true
  return status === 'nao_possui' ? false : null
}

export function checklistDelivered(status) {
  if (status === 'ok') return true
  return status === 'retido' ? false : null
}

// Clique em "Sim" ou "Não" de uma coluna; clicar de novo no marcado desmarca.
// Marcar "Entregue" já conta como "Possui".
export function nextChecklistStatus(status, column, value) {
  if (column === 'possui') {
    if (checklistHas(status) === value) return null
    return value ? 'possui' : 'nao_possui'
  }
  if (checklistDelivered(status) === value) return 'possui'
  return value ? 'ok' : 'retido'
}

// Itens que a loja tem e não entregou (o termo e os detalhes da venda avisam)
export function retainedItems(checklist) {
  return (checklist || []).filter((e) => e.status === 'retido').map((e) => e.item)
}

// Junta a lista da loja com o que a venda já tem marcado. Itens marcados que
// saíram da lista da loja continuam aparecendo na venda antiga.
export function buildChecklist(items, saved = []) {
  const byItem = new Map(saved.map((entry) => [entry.item, entry.status || null]))
  const result = items.map((item) => ({ item, status: byItem.get(item) ?? null }))
  for (const entry of saved) {
    if (!items.includes(entry.item)) result.push({ item: entry.item, status: entry.status || null })
  }
  return result
}

// Conferido = entregue, fica com a loja ou não possui. "Possui" sem marcar a
// entrega ainda conta como pendente.
export function checklistSummary(checklist) {
  const delivered = checklist.filter((e) => e.status === 'ok').length
  const retained = checklist.filter((e) => e.status === 'retido').length
  const missing = checklist.filter((e) => e.status === 'nao_possui').length
  return { total: checklist.length, delivered, retained, missing, pending: checklist.length - delivered - retained - missing }
}

// "Chave reserva, Tapetes" → lista limpa, sem repetidos nem linhas vazias
export function parseChecklistText(text) {
  const seen = new Set()
  const items = []
  for (const line of text.split('\n')) {
    const item = line.trim()
    if (!item || seen.has(item.toLowerCase())) continue
    seen.add(item.toLowerCase())
    items.push(item)
  }
  return items
}
