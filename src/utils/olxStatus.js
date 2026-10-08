// Situação de cada carro na OLX para as telas (aba Portais, cadastro do carro,
// estoque e pendências do início). As regras do anúncio ficam em olxAd.js; as
// contagens, os filtros e a ordem são os mesmos dos outros portais (portalStatus.js).
import { olxOutReason, olxMissing, olxContactPhone, OLX_MISSING_LABELS } from './olxAd.js'
import { PORTAL_TONE_CLASS, portalSummary, portalFilters, portalMatchesFilter, portalStateOrder } from './portalStatus.js'

export const OLX_TONE_CLASS = PORTAL_TONE_CLASS
export const olxSummary = portalSummary
export const OLX_FILTERS = portalFilters('OLX')
export const olxMatchesFilter = portalMatchesFilter
export const olxStateOrder = portalStateOrder

// Situações que contam como problema (pendência do início e filtro)
const PROBLEMS = ['faltam', 'erro', 'recusado', 'sem_vaga', 'removido_olx', 'expirado']

// ctx: { account (olxApi), sellerPhones: { id: telefone }, siteUrl (reserva) }
export function olxContext(car, ctx) {
  const account = ctx.account || {}
  return {
    siteUrl: account.siteUrl || ctx.siteUrl || '',
    zip: account.zip || '',
    phone: olxContactPhone(car, ctx.sellerPhones || {}, account.mainPhone || ''),
    settings: account.settings || {},
  }
}

// Telefones da equipe para o anúncio: só quem está ativo e tem telefone
export function olxSellerPhones(sellers) {
  return Object.fromEntries((sellers || []).filter((s) => s.active && !s.deletedAt && s.phone).map((s) => [s.id, s.phone]))
}

// "TOYOTA · COROLLA · COROLLA XEI 2.0" (e a cilindrada, na moto)
export function olxCatalogLabel(catalog) {
  const c = catalog || {}
  return [c.brandName, c.modelName, c.versionName, c.ccName ? `${c.ccName} cc` : ''].filter(Boolean).join(' · ')
}

export function olxMissingText(missing) {
  return missing.map((m) => OLX_MISSING_LABELS[m] || m).join(', ')
}

// { key, tone, label, detail, problem } ou null quando a loja não conectou a OLX
export function olxCarState(car, ad, ctx) {
  const account = ctx.account
  if (!account?.connected) return null
  const state = (key, tone, label, detail = '') => ({ key, tone, label, detail, problem: PROBLEMS.includes(key) })
  const status = ad?.status || ''
  const message = ad?.message || ''

  if (status === 'removendo') return state('removendo', 'wait', 'Saindo da OLX', message)
  const out = olxOutReason(car)
  if (out) {
    const live = ad && ad.operation === 'insert' && ['publicado', 'aguardando', 'expirado'].includes(status)
    return live ? state('saindo', 'wait', 'Vai sair da OLX', out) : state('fora', 'off', 'Fora da OLX', out)
  }

  const missing = olxMissing(car, olxContext(car, ctx))
  const missingText = missing.length ? `Falta: ${olxMissingText(missing)}.` : ''
  switch (status) {
    case 'publicado':
      return state('publicado', 'ok', 'Na OLX', [message, missingText && `${missingText} Sem isso, as mudanças não chegam à OLX.`].filter(Boolean).join(' '))
    case 'aguardando':
      return state('aguardando', 'wait', ad.listId ? 'Atualizando na OLX' : 'Aguardando a OLX', message)
    case 'simulado':
      return missing.length ? state('faltam', 'warn', 'Faltam dados', missingText) : state('simulado', 'wait', 'Simulado', message)
    case 'recusado':
      return state('recusado', 'problem', 'Recusado pela OLX', message)
    case 'erro':
      return state('erro', 'problem', 'Erro na OLX', [message, missingText].filter(Boolean).join(' '))
    case 'sem_vaga':
      return state('sem_vaga', 'warn', 'Sem vaga no plano', 'O plano da OLX da loja está cheio. Tire outro anúncio ou aumente o plano.')
    case 'removido_olx':
      return state('removido_olx', 'warn', 'Removido na OLX', 'O anúncio foi removido direto na OLX. Para voltar, use "Publicar de novo".')
    case 'expirado':
      return state('expirado', 'warn', 'Expirado na OLX', 'O anúncio expirou na OLX. Use "Renovar".')
    case 'pendente':
      return state('pendente', 'wait', 'Na fila', message)
    default:
      break
  }
  if (missing.length) return state('faltam', 'warn', 'Faltam dados', missingText)
  return account.autoPublish
    ? state('fila', 'wait', 'Na fila', 'Vai para a OLX na próxima sincronização.')
    : state('pronto', 'off', 'Pronto para publicar', 'A publicação automática está desligada: use "Publicar agora".')
}
