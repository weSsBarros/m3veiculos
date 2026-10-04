import { SITUATION_LEVEL, situationText } from '../../utils/billing.js'

// Peças do painel WB.Dev: selos de situação do cliente e da cobrança

const STATUS = {
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
