import { useState } from 'react'
import { Link } from 'react-router-dom'
import { X, MessageCircle, QrCode, Receipt } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { storeBillingNotice } from '../utils/billing.js'
import { supportLink } from '../utils/support.js'

// Avisos da WB.Dev no topo do painel: os escritos no painel WB.Dev (Avisos), a
// resposta de um chamado do suporte e, só para o admin, o aviso automático da
// mensalidade (3 dias antes, no dia e em atraso), com o PIX e o "Já paguei".
// Fechar esconde o aviso até o dia seguinte.
const today = () => new Date().toISOString().slice(0, 10)
const storageKey = (id) => `aviso-wbdev-${id}-${today()}`

function wasClosed(id) {
  try {
    return localStorage.getItem(storageKey(id)) === '1'
  } catch {
    return false
  }
}

export default function AccountNotices({ storeName }) {
  const { account } = useAuth()
  const [, setClosedTick] = useState(0)
  if (!account) return null

  const billing = storeBillingNotice(account.billing, new Date(), account.payment?.claims || [])
  const unread = account.support?.unread || 0
  const termsPending = account.platformTeam && account.terms && !account.terms.accepted
  const items = [
    ...(billing
      ? [
          {
            id: `mensalidade-${account.billing.situation}${billing.informed ? '-informada' : ''}`,
            level: billing.level,
            title: 'Mensalidade do sistema',
            message: billing.text,
            pay: !billing.informed,
          },
        ]
      : []),
    ...(unread
      ? [{ id: `suporte-${unread}`, level: 'info', title: 'Suporte', message: unread === 1 ? 'A WB.Dev respondeu o seu chamado.' : `A WB.Dev respondeu ${unread} chamados.`, support: true }]
      : []),
    ...(termsPending
      ? [{ id: 'termos-pendentes', level: 'aviso', title: 'Contrato de adesão', message: 'Este cliente ainda não aceitou o contrato de adesão (o admin da loja aceita no próximo acesso).' }]
      : []),
    ...account.notices,
  ].filter((n) => !wasClosed(n.id))
  if (items.length === 0) return null

  function close(id) {
    try {
      localStorage.setItem(storageKey(id), '1')
    } catch {
      // sem armazenamento: o aviso volta ao recarregar
    }
    setClosedTick((n) => n + 1)
  }

  return (
    <div className="account-notices">
      {items.map((n) => (
        <div key={n.id} className={`account-notice is-${n.level}`} role={n.level === 'urgente' ? 'alert' : 'status'}>
          <div>
            <strong>{n.title}</strong>
            {n.message && <p>{n.message}</p>}
          </div>
          <div className="account-notice-actions">
            {n.pay && (
              <>
                <Link to="/admin/mensalidade" className="btn btn-primary">
                  <QrCode size={15} /> Pagar com PIX
                </Link>
                <Link to="/admin/mensalidade?pago=1" className="btn btn-outline">
                  <Receipt size={15} /> Já paguei
                </Link>
                <a href={supportLink(storeName)} target="_blank" rel="noreferrer" className="btn btn-outline">
                  <MessageCircle size={15} /> Falar com a WB.Dev
                </a>
              </>
            )}
            {n.support && (
              <Link to="/admin/suporte" className="btn btn-primary">
                Ver a resposta
              </Link>
            )}
            <button type="button" className="account-notice-close" onClick={() => close(n.id)} aria-label="Fechar aviso até amanhã">
              <X size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
