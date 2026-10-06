// Assinatura digital dos contratos (Autentique, seção 53): papéis, situação e
// conferência dos assinantes. As mesmas regras são conferidas de novo na Edge
// Function "assinaturas".

export const SIGNER_ROLES = {
  cliente: 'Cliente',
  dono: 'Dono do carro',
  loja: 'Pela loja',
  testemunha: 'Testemunha',
}

export const MAX_WITNESSES = 2

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())
}

// Confere os assinantes antes de enviar. Devolve o texto do problema ou ''.
export function validateSigners(signers, kind = 'venda') {
  const list = signers.map((s) => ({ ...s, name: String(s.name || '').trim(), email: String(s.email || '').trim().toLowerCase() }))
  for (const s of list) {
    const who = SIGNER_ROLES[s.role] || 'Assinante'
    if (!s.name) return `Falta o nome: ${who.toLowerCase()}.`
    if (!s.email) return `Falta o e-mail de ${s.name}.`
    if (!isValidEmail(s.email)) return `O e-mail de ${s.name} não é válido.`
  }
  const party = kind === 'entrada' ? 'dono' : 'cliente'
  if (!list.some((s) => s.role === party)) return kind === 'entrada' ? 'Falta o dono do carro.' : 'Falta o cliente.'
  if (!list.some((s) => s.role === 'loja')) return 'Escolha quem assina pela loja.'
  if (list.filter((s) => s.role === 'testemunha').length > MAX_WITNESSES) return 'No máximo 2 testemunhas.'
  if (new Set(list.map((s) => s.email)).size !== list.length) return 'Cada assinante precisa de um e-mail diferente.'
  return ''
}

// Situação para mostrar: { label, tone } (tone: wait, ok, bad, off)
export function signatureStatus(request) {
  const signers = request?.signers || []
  const signed = signers.filter((s) => s.signedAt).length
  switch (request?.status) {
    case 'assinado':
      return { label: 'Assinado por todos', tone: 'ok' }
    case 'recusado':
      return { label: 'Recusado', tone: 'bad' }
    case 'cancelado':
      return { label: 'Cancelado', tone: 'off' }
    default:
      return { label: `Aguardando assinatura (${signed} de ${signers.length})`, tone: 'wait' }
  }
}

// Situação de uma pessoa: 'assinou', 'recusou', 'abriu' ou 'aguardando'
export function signerState(signer) {
  if (signer.signedAt) return 'assinou'
  if (signer.rejectedAt) return 'recusou'
  if (signer.viewedAt) return 'abriu'
  return 'aguardando'
}

export const SIGNER_STATE_LABELS = {
  assinou: 'Assinou',
  recusou: 'Recusou',
  abriu: 'Abriu, ainda não assinou',
  aguardando: 'Ainda não abriu',
}

// Envios aguardando assinatura consultados há mais de `minutes` minutos
// (a Autentique limita os pedidos por minuto; vão no máximo 10 por vez)
export function pendingToRefresh(requests, now = Date.now(), minutes = 5) {
  return requests
    .filter((r) => r.status === 'enviado')
    .filter((r) => !r.checkedAt || now - new Date(r.checkedAt).getTime() > minutes * 60000)
    .slice(0, 10)
    .map((r) => r.id)
}

// O envio mais recente de cada contrato (Map contractId → envio)
export function latestByContract(requests) {
  const map = new Map()
  for (const r of requests) {
    if (!r.contractId) continue
    const prev = map.get(r.contractId)
    if (!prev || new Date(r.createdAt) > new Date(prev.createdAt)) map.set(r.contractId, r)
  }
  return map
}
