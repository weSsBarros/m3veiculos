// Créditos da consulta por placa (seção 71): pré-pago, saldo em reais. A loja
// compra pacotes pelo PIX da WB.Dev e cada consulta nova debita o preço. A
// leitura da foto do documento pela IA usa o mesmo saldo, com preço próprio, e o
// contrato mandado para assinatura digital também (seção 75), depois da franquia
// de envios grátis do mês.

export const PLATE_PRICE_DEFAULT = 0.4
export const DOC_PHOTO_PRICE_DEFAULT = 0.2
export const SIGNATURE_PRICE_DEFAULT = 1
export const SIGNATURE_FREE_DEFAULT = 5
export const PLATE_PACKAGES_DEFAULT = [20, 40, 100]

const toNumber = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Quantas consultas cabem no valor (sem arredondar para cima)
export function queriesFor(amount, price) {
  const p = toNumber(price)
  return p > 0 ? Math.floor((toNumber(amount) + 1e-9) / p) : 0
}

export function moneyBR(value) {
  return toNumber(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
}

// "41 consultas" / "1 consulta" / "nenhuma consulta"
export function queriesText(n) {
  if (!n) return 'nenhuma consulta'
  return n === 1 ? '1 consulta' : `${n.toLocaleString('pt-BR')} consultas`
}

// "98 leituras" / "1 leitura" / "nenhuma leitura" (foto do documento)
export function readsText(n) {
  if (!n) return 'nenhuma leitura'
  return n === 1 ? '1 leitura' : `${n.toLocaleString('pt-BR')} leituras`
}

// Resposta de my_plate_credits() (ou o resumo que a função veiculo-dados devolve)
export function creditsFromRow(row) {
  if (!row) return null
  const balance = toNumber(row.balance)
  const price = toNumber(row.price) || PLATE_PRICE_DEFAULT
  const docPrice = toNumber(row.doc_price ?? row.docPrice) || DOC_PHOTO_PRICE_DEFAULT
  const signaturePrice = toNumber(row.signature_price ?? row.signaturePrice) || SIGNATURE_PRICE_DEFAULT
  const signatureFreeMonthly = row.signature_free_monthly ?? row.signatureFreeMonthly
  const signatureFreeLeft = row.signature_free_left ?? row.signatureFreeLeft
  const packages = (Array.isArray(row.packages) && row.packages.length ? row.packages : PLATE_PACKAGES_DEFAULT).map(toNumber).filter((v) => v > 0)
  return {
    balance,
    price,
    queries: queriesFor(balance, price),
    docPrice,
    docReads: queriesFor(balance, docPrice),
    signaturePrice,
    signatureFreeMonthly: signatureFreeMonthly == null ? SIGNATURE_FREE_DEFAULT : Math.max(0, Math.floor(toNumber(signatureFreeMonthly))),
    signatureFreeLeft: signatureFreeLeft == null ? 0 : Math.max(0, Math.floor(toNumber(signatureFreeLeft))),
    packages: packages.map((amount) => ({ amount, queries: queriesFor(amount, price) })),
    admin: row.admin === true,
    orders: (row.orders || []).map((o) => ({
      id: o.id,
      amount: toNumber(o.amount),
      paidOn: o.paid_on || '',
      status: o.status || 'pendente',
      response: o.response || '',
      createdAt: o.created_at || '',
    })),
    ledger: (row.ledger || []).map((l) => ({
      id: l.id,
      kind: l.kind,
      amount: toNumber(l.amount),
      plate: l.plate || '',
      note: l.note || '',
      createdAt: l.created_at || '',
      userEmail: l.user_email || '',
    })),
  }
}

// Linha do extrato
export function ledgerText(entry) {
  if (entry.kind === 'recarga') return 'Compra de créditos'
  if (entry.kind === 'consulta') return `Consulta da placa ${entry.plate}`
  if (entry.kind === 'documento') return 'Leitura da foto do documento'
  if (entry.kind === 'assinatura') return 'Contrato enviado para assinatura digital'
  return entry.note ? `Ajuste da WB.Dev: ${entry.note}` : 'Ajuste da WB.Dev'
}

// Próximo envio para assinatura digital: grátis (franquia do mês), pago com os
// créditos ou bloqueado (sem franquia e sem saldo). { free, canSend, text }
export function signatureCost(credits) {
  if (!credits) return { free: false, canSend: true, text: '' }
  const total = credits.signatureFreeMonthly
  const left = credits.signatureFreeLeft
  if (left > 0) {
    const rest = left - 1
    return {
      free: true,
      canSend: true,
      text: `Este envio é grátis (franquia de ${total} por mês). ${rest === 0 ? 'É o último grátis deste mês.' : `Depois dele, ${rest === 1 ? 'resta 1 grátis' : `restam ${rest} grátis`} no mês.`}`,
    }
  }
  const ended = total > 0 ? `Os ${total} envios grátis do mês acabaram` : ''
  if (credits.balance + 1e-9 >= credits.signaturePrice) {
    const cost = `${moneyBR(credits.signaturePrice)} dos créditos (saldo ${moneyBR(credits.balance)})`
    return { free: false, canSend: true, text: ended ? `${ended}: este custa ${cost}.` : `Este envio custa ${cost}.` }
  }
  const price = `${moneyBR(credits.signaturePrice)} por contrato`
  return {
    free: false,
    canSend: false,
    text: ended ? `${ended} e não há crédito para este (${price}).` : `Não há crédito para este envio (${price}).`,
  }
}

// Pacotes digitados na Plataforma, em reais inteiros ("20, 40, 100") -> [20, 40, 100].
// null se vazio, mais de 6 ou fora de 1 a 10.000.
export function parsePackages(text) {
  const values = (String(text || '').match(/\d+/g) || []).map(Number)
  if (!values.length || values.length > 6 || values.some((v) => v < 1 || v > 10000)) return null
  return [...new Set(values)].sort((a, b) => a - b)
}

export function packagesText(packages) {
  return (packages || []).map((v) => String(Math.round(toNumber(v)))).join(', ')
}
