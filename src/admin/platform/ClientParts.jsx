import { SITUATION_LEVEL, situationText, whatsappLink, whatsappWebLink } from '../../utils/billing.js'

// Peças do painel WB.Dev: selos de situação do cliente e da cobrança e o botão de WhatsApp

const STATUS = {
  implantacao: { label: 'Em implantação', level: 'blue' },
  ativo: { label: 'Ativo', level: 'green' },
  bloqueado: { label: 'Bloqueado', level: 'red' },
  cancelado: { label: 'Cancelado', level: 'gray' },
}

export function StatusPill({ status }) {
  const s = STATUS[status] || STATUS.ativo
  return <span className={`platform-health is-${s.level}`}>{s.label}</span>
}

export function BillingPill({ billing }) {
  const level = SITUATION_LEVEL[billing?.situation] || 'gray'
  return <span className={`platform-health is-${level}`}>{situationText(billing)}</span>
}

// Celular ou tablet (o iPad se apresenta como Mac, mas tem toque)
const IS_MOBILE = typeof navigator !== 'undefined' &&
  (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1))

// Botão de WhatsApp do painel WB.Dev (pedido do Wesley em 10/10/2026): no computador
// abre o WhatsApp Web, sempre na mesma aba ("whatsapp-web"); no celular, o aplicativo.
// Sem rel="noopener" no computador: a aba com nome só é reaproveitada se continuar
// ligada a esta página (senão cada clique abriria uma aba nova).
export function WhatsAppLink({ phone, text, className = 'btn btn-outline', title, children }) {
  const href = IS_MOBILE ? whatsappLink(phone, text) : whatsappWebLink(phone, text)
  if (!href) return null
  return IS_MOBILE ? (
    <a className={className} href={href} target="_blank" rel="noreferrer" title={title}>{children}</a>
  ) : (
    <a className={className} href={href} target="whatsapp-web" title={title}>{children}</a>
  )
}
