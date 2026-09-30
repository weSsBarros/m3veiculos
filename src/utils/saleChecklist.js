// Checklist de itens conferidos na venda (manual, chave reserva etc.). A lista
// de itens é de cada loja (companies.sale_checklist); cada venda guarda o que
// foi marcado: [{ item, status }], com status 'ok' (entregue), 'nao_possui'
// (o carro não tem o item) ou null (não conferido).

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
  nao_possui: 'Não possui',
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

export function checklistSummary(checklist) {
  const delivered = checklist.filter((e) => e.status === 'ok').length
  const missing = checklist.filter((e) => e.status === 'nao_possui').length
  return { total: checklist.length, delivered, missing, pending: checklist.length - delivered - missing }
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
