// Listas preenchidas no cadastro do carro (as duas são opcionais):
// * Itens que vieram com o carro (manual, chave reserva...): [{ item, status }],
//   com status 'ok' (veio), 'nao_possui' (não veio) ou null (não conferido) —
//   o mesmo formato do checklist de entrega da venda.
// * Vistoria de entrada (pneus, lataria...): [{ item, status, note }], com
//   status 'ok', 'atencao', 'ruim' ou null.
// As listas de itens são de cada loja (companies.intake_checklist e
// companies.inspection_checklist).

import { buildChecklist } from './saleChecklist.js'

export const DEFAULT_INTAKE_CHECKLIST = [
  'Manual do proprietário',
  'Chave reserva',
  'Livro de revisões',
  'Estepe',
  'Macaco e chave de roda',
  'Triângulo',
  'Tapetes',
  'CRLV (documento do veículo)',
]

export const DEFAULT_INSPECTION_CHECKLIST = [
  'Lataria e pintura',
  'Pneus',
  'Vidros e retrovisores',
  'Faróis e lanternas',
  'Motor',
  'Câmbio',
  'Suspensão',
  'Freios',
  'Ar-condicionado',
  'Parte elétrica',
  'Painel e luzes de alerta',
  'Bancos e acabamento interno',
]

export const INSPECTION_STATUSES = [
  { value: 'ok', label: 'Ok' },
  { value: 'atencao', label: 'Atenção' },
  { value: 'ruim', label: 'Ruim' },
]

export function buildIntake(items, saved = []) {
  return buildChecklist(items, Array.isArray(saved) ? saved : [])
}

// Junta a lista da loja com a vistoria já gravada no carro. Itens gravados
// que saíram da lista da loja continuam aparecendo no carro.
export function buildInspection(items, saved = []) {
  const list = Array.isArray(saved) ? saved : []
  const byItem = new Map(list.map((entry) => [entry.item, entry]))
  const result = items.map((item) => ({
    item,
    status: byItem.get(item)?.status || null,
    note: byItem.get(item)?.note || '',
  }))
  for (const entry of list) {
    if (!items.includes(entry.item)) result.push({ item: entry.item, status: entry.status || null, note: entry.note || '' })
  }
  return result
}

export function inspectionSummary(list) {
  const count = (status) => list.filter((e) => e.status === status).length
  const ok = count('ok')
  const atencao = count('atencao')
  const ruim = count('ruim')
  return { total: list.length, ok, atencao, ruim, pending: list.length - ok - atencao - ruim }
}

// Grava só o que foi preenchido (lista vazia = nada conferido)
export function compactChecklist(list) {
  return list.filter((e) => e.status || (e.note && e.note.trim())).map((e) => (e.note !== undefined ? { item: e.item, status: e.status || null, note: e.note.trim() } : { item: e.item, status: e.status }))
}

// Checklist de entrega da venda já preenchido com o que veio com o carro:
// o que veio fica "Entregue" e o que não veio fica "Não possui" (a loja
// confere e muda o que precisar). Venda já registrada mantém o que foi marcado.
export function deliveryChecklistFromIntake(saleItems, intake = [], saved = []) {
  if (Array.isArray(saved) && saved.length > 0) return buildChecklist(saleItems, saved)
  const byItem = new Map((Array.isArray(intake) ? intake : []).map((e) => [String(e.item).trim().toLowerCase(), e.status]))
  return saleItems.map((item) => {
    const status = byItem.get(item.trim().toLowerCase())
    return { item, status: status === 'ok' || status === 'nao_possui' ? status : null }
  })
}
