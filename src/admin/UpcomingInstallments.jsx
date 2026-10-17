import { Link } from 'react-router-dom'
import { BellRing, CalendarClock } from 'lucide-react'
import { formatCurrencyCents, formatDateBR, todayISO } from '../utils/carFormat.js'
import { dueInText, installmentReminderText } from '../utils/financing.js'
import { whatsappLinkToPhone } from '../utils/whatsapp.js'

const MAX_ROWS = 8

// Parcelas do financiamento próprio que vencem nos próximos dias (início do painel):
// quem, qual carro e parcela, quando e quanto, com o lembrete pronto no WhatsApp do
// cliente. items: fetchUpcomingInstallments (já em ordem de vencimento).
export default function UpcomingInstallments({ items, days, companyName }) {
  if (!items.length) return null
  const today = todayISO()
  const total = items.reduce((sum, i) => sum + i.amount, 0)
  const shown = items.slice(0, MAX_ROWS)

  return (
    <section className="upcoming-installments" aria-labelledby="parcelas-a-vencer">
      <div className="upcoming-installments-head">
        <h2 id="parcelas-a-vencer">
          <CalendarClock size={18} aria-hidden="true" /> Parcelas a vencer
        </h2>
        <span className="upcoming-installments-total">
          {items.length} {items.length === 1 ? 'parcela' : 'parcelas'} nos próximos {days} dias · {formatCurrencyCents(total)}
        </span>
        <Link to="/admin/financeiro/clientes" className="admin-link-btn">
          Financeiro dos clientes
        </Link>
      </div>
      <ul className="upcoming-installments-list">
        {shown.map((i) => {
          const reminder = i.customerPhone
            ? whatsappLinkToPhone(
                i.customerPhone,
                installmentReminderText({
                  customerName: i.customerName,
                  number: i.number,
                  count: i.installmentsCount,
                  vehicleLabel: i.vehicleLabel,
                  dueDate: i.dueDate,
                  amount: i.amount,
                  companyName,
                })
              )
            : null
          const when = dueInText(i.dueDate, today)
          return (
            <li key={i.id}>
              <div className="upcoming-installments-who">
                <Link to={`/admin/financeiro/clientes?financiamento=${i.financingId}`}>{i.customerName || 'Cliente'}</Link>
                <span>{[i.vehicleLabel, i.installmentsCount ? `parcela ${i.number}/${i.installmentsCount}` : `parcela ${i.number}`].filter(Boolean).join(' · ')}</span>
              </div>
              <div className="upcoming-installments-when">
                <strong>{formatCurrencyCents(i.amount)}</strong>
                <span className={when === 'vence hoje' ? 'is-today' : ''}>
                  {when} ({formatDateBR(i.dueDate)})
                </span>
              </div>
              {reminder ? (
                <a className="admin-action-btn" href={reminder} target="_blank" rel="noopener noreferrer">
                  <BellRing size={14} aria-hidden="true" /> Lembrar
                </a>
              ) : (
                <span className="admin-table-sub">sem telefone</span>
              )}
            </li>
          )
        })}
      </ul>
      {items.length > MAX_ROWS && (
        <p className="upcoming-installments-more">
          E mais {items.length - MAX_ROWS}.{' '}
          <Link to="/admin/financeiro/clientes" className="admin-link-btn">
            Ver todas
          </Link>
        </p>
      )}
    </section>
  )
}
