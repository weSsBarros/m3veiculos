// Situação de cada carro na Webmotors para as telas (aba Portais, cadastro do
// carro, estoque e pendências do início). As regras do anúncio ficam em
// webmotorsAd.js; as contagens, os filtros e a ordem, em portalStatus.js.
import { wmOutReason, wmMissing, WM_MISSING_LABELS } from './webmotorsAd.js'

// Situações que contam como problema (pendência do início e filtro)
const PROBLEMS = ['faltam', 'erro', 'sem_vaga', 'removido_wm']

// "TOYOTA · COROLLA · 2.0 XEI 16V FLEX 4P AUTOMÁTICO"
export function webmotorsCatalogLabel(catalog) {
  const c = catalog || {}
  return [c.brandName, c.modelName, c.versionName].filter(Boolean).join(' · ')
}

export function webmotorsMissingText(missing) {
  return missing.map((m) => WM_MISSING_LABELS[m] || m).join(', ')
}

// Modalidade do plano escolhida em Portais (com as vagas), ou null
export function webmotorsModality(account) {
  return (account?.modalities || []).find((m) => String(m.code) === String(account.modalityCode)) || null
}

// Está no ar na Webmotors (tem código e não saiu)
export function webmotorsLive(ad) {
  return Boolean(ad?.adCode) && !['removido', 'removido_wm', 'simulado'].includes(ad.status)
}

// { key, tone, label, detail, problem } ou null quando a loja não conectou a Webmotors.
// ctx: { account (webmotorsApi), siteUrl (reserva), lists (opcional: cores, cambios, combustiveis) }
export function webmotorsCarState(car, ad, ctx) {
  const account = ctx.account
  if (!account?.connected) return null
  const state = (key, tone, label, detail = '') => ({ key, tone, label, detail, problem: PROBLEMS.includes(key) })
  const status = ad?.status || ''
  const message = ad?.message || ''

  const out = wmOutReason(car)
  if (out) {
    return webmotorsLive(ad) ? state('saindo', 'wait', 'Vai sair da Webmotors', out) : state('fora', 'off', 'Fora da Webmotors', out)
  }

  const missing = wmMissing(car, { siteUrl: account.siteUrl || ctx.siteUrl || '', lists: ctx.lists })
  const missingText = missing.length ? `Falta: ${webmotorsMissingText(missing)}.` : ''
  if (webmotorsLive(ad)) {
    if (status === 'erro') return state('erro', 'problem', 'Erro na Webmotors', [message, missingText].filter(Boolean).join(' '))
    if (status === 'pendente') return state('pendente', 'wait', 'Atualizando na Webmotors', message)
    return state('publicado', 'ok', 'Na Webmotors',
      [message, missingText && `${missingText} Sem isso, as mudanças não chegam à Webmotors.`].filter(Boolean).join(' '))
  }
  switch (status) {
    case 'simulado':
      return missing.length ? state('faltam', 'warn', 'Faltam dados', missingText) : state('simulado', 'wait', 'Simulado', message)
    case 'erro':
      return state('erro', 'problem', 'Recusado pela Webmotors', [message, missingText].filter(Boolean).join(' '))
    case 'sem_vaga':
      return state('sem_vaga', 'warn', 'Sem vaga no plano', message || 'O plano da Webmotors da loja está cheio. Tire outro anúncio ou aumente o plano.')
    case 'removido_wm':
      return state('removido_wm', 'warn', 'Tirado na Webmotors', 'O anúncio foi tirado direto na Webmotors. Para voltar, use "Publicar de novo".')
    case 'pendente':
      return state('pendente', 'wait', 'Na fila', message)
    default:
      break
  }
  if (missing.length) return state('faltam', 'warn', 'Faltam dados', missingText)
  const noModality = webmotorsModality(account) ? '' : 'Falta escolher a modalidade do plano da Webmotors (em Portais).'
  return account.autoPublish
    ? state('fila', 'wait', 'Na fila', noModality || 'Vai para a Webmotors na próxima sincronização.')
    : state('pronto', 'off', 'Pronto para publicar', noModality || 'A publicação automática está desligada: use "Publicar agora".')
}
