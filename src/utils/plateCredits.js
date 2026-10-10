// Créditos da consulta por placa (seção 71): pré-pago, saldo em reais. A loja
// compra pacotes pelo PIX da WB.Dev e cada consulta nova debita o preço. A
// leitura da foto do documento pela IA usa o mesmo saldo, com preço próprio.

export const PLATE_PRICE_DEFAULT = 0.4
export const DOC_PHOTO_PRICE_DEFAULT = 0.2
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
  const packages = (Array.isArray(row.packages) && row.packages.length ? row.packages : PLATE_PACKAGES_DEFAULT).map(toNumber).filter((v) => v > 0)
  return {
    balance,
    price,
    queries: queriesFor(balance, price),
    docPrice,
    docReads: queriesFor(balance, docPrice),
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
  return entry.note ? `Ajuste da WB.Dev: ${entry.note}` : 'Ajuste da WB.Dev'
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
