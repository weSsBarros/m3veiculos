import { Fragment } from 'react'
import { MessageCircle } from 'lucide-react'
import PixQr from './PixQr.jsx'
import { COMPANY_ID } from '../lib/supabaseClient.js'
import { pixPayload, pixTxid } from '../utils/pix.js'
import { money, monthsText } from '../utils/billing.js'
import { supportLink, supportMessageLink } from '../utils/support.js'

// Login com a loja bloqueada: o admin vê o que está em aberto, o PIX e os dados
// bancários, e manda o comprovante no WhatsApp da WB.Dev para liberar o acesso.
// Quem não é admin só fica sabendo que é com o administrador da loja.
export default function SuspendedPayment({ info }) {
  if (!info) return null
  const name = info.name || 'a loja'

  if (!info.admin) {
    return (
      <div className="suspended-pay">
        <p>Para liberar o acesso, o administrador da loja precisa regularizar a mensalidade do sistema com a WB.Dev.</p>
        <a className="btn btn-outline btn-block" href={supportLink(name)} target="_blank" rel="noreferrer">
          <MessageCircle size={15} /> Falar com a WB.Dev
        </a>
      </div>
    )
  }

  const open = info.billing?.open || []
  const months = open.map((o) => o.month)
  const total = Number(info.billing?.open_total) || 0
  const pay = info.payment || {}
  const payload = pay.pixKey
    ? pixPayload({ key: pay.pixKey, name: pay.pixName, city: pay.pixCity, amount: total || null, txid: pixTxid(COMPANY_ID.slice(0, 8), months[0] || '') })
    : ''
  const message =
    `Olá! Aqui é da ${name}. O acesso ao painel está suspenso` +
    (months.length ? ` e paguei a mensalidade de ${monthsText(months)} (${money(total)})` : '') +
    '. Segue o comprovante para liberar o acesso.'
  const bank = [
    ['Banco', pay.bankName],
    ['Agência', pay.bankAgency],
    ['Conta', pay.bankAccount],
    ['Titular', pay.bankHolder],
    ['CPF/CNPJ', pay.bankDocument],
  ].filter(([, value]) => value)

  return (
    <div className="suspended-pay">
      <h2>Regularize para liberar o acesso</h2>
      {months.length > 0 ? (
        <p>
          Em aberto: <strong>{monthsText(months)}</strong> · total <strong>{money(total)}</strong>
        </p>
      ) : (
        <p>Fale com a WB.Dev para saber o valor e liberar o acesso.</p>
      )}
      {pay.pixKey && <PixQr payload={payload} pixKey={pay.pixKey} />}
      {bank.length > 0 && (
        <div className="billing-bank">
          <h3>Transferência bancária</h3>
          <dl>
            {bank.map(([label, value]) => (
              <Fragment key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </Fragment>
            ))}
          </dl>
        </div>
      )}
      <a className="btn btn-primary btn-block" href={supportMessageLink(message)} target="_blank" rel="noreferrer">
        <MessageCircle size={15} /> Mandar o comprovante no WhatsApp
      </a>
      <p className="admin-form-note">Depois de pagar, mande o comprovante: a WB.Dev confere e libera o acesso.</p>
    </div>
  )
}
