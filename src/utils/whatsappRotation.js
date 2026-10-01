// Rodízio do WhatsApp: a mesma regra da função whatsapp_contact do banco,
// usada no painel para mostrar quem recebe o próximo contato.
// Entrada: { id, sellerId, name, phone, active, position, createdAt }.
// Pessoa da Equipe com telefone em branco usa o telefone do cadastro dela;
// quem está desativado ou excluído da Equipe fica fora.

// Só dígitos e com o 55 do Brasil (vazio se não der para usar)
export function waDigits(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  if (digits.length >= 12 && digits.length <= 15) return digits
  return ''
}

// "5598991116644" → "(98) 99111-6644"; "559891116644" → "(98) 9111-6644"
export function formatWaPhone(phone) {
  const digits = waDigits(phone)
  if (!digits.startsWith('55')) return digits
  const local = digits.slice(2)
  return `(${local.slice(0, 2)}) ${local.slice(2, -4)}-${local.slice(-4)}`
}

export function entryPhone(entry, sellersById = {}) {
  const seller = entry.sellerId ? sellersById[entry.sellerId] : null
  return waDigits(entry.phone || seller?.phone || '')
}

export function entryName(entry, sellersById = {}) {
  const seller = entry.sellerId ? sellersById[entry.sellerId] : null
  return entry.name || seller?.name || 'Sem nome'
}

// Fora do rodízio e por quê ('' = está valendo)
export function entryProblem(entry, sellersById = {}) {
  const seller = entry.sellerId ? sellersById[entry.sellerId] : null
  if (!entry.active) return 'pausado'
  if (entry.sellerId && (!seller || !seller.active || seller.deletedAt)) return 'fora da Equipe'
  if (!entryPhone(entry, sellersById)) return 'sem telefone'
  return ''
}

function compare(a, b) {
  return (a.position - b.position) || String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id))
}

export function sortRotation(entries) {
  return [...entries].sort(compare)
}

// Quem recebe o próximo clique: o primeiro válido depois do último que
// atendeu (lastId); no fim da lista, recomeça.
export function nextRotationEntry(entries, lastId, sellersById = {}) {
  const valid = sortRotation(entries).filter((e) => !entryProblem(e, sellersById))
  if (!valid.length) return null
  const last = entries.find((e) => e.id === lastId)
  if (!last) return valid[0]
  return valid.find((e) => compare(e, last) > 0) || valid[0]
}
