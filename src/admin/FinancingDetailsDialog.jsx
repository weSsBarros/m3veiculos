import { useState } from 'react'
import { Link } from 'react-router-dom'
import { X, FolderOpen, Pencil, Trash2, Receipt, Undo2, MessageCircle, BadgeCheck, CalendarClock, BellRing } from 'lucide-react'
import { payInstallment, undoInstallmentPayment, updateInstallment, updateFinancing, deleteFinancing } from '../lib/financingApi.js'
import { formatCurrencyCents, formatDateBR, todayISO } from '../utils/carFormat.js'
import {
  FINANCING_STATUS_LABELS,
  PAYMENT_METHODS,
  formatMoneyInput,
  installmentStatus,
  isDueSoon,
  lateCharges,
  parseMoneyBR,
  parsePercentBR,
  round2,
  summarizeFinancing,
} from '../utils/financing.js'
import { generateInstallmentReceiptPdf } from '../utils/installmentReceipt.js'
import { companyForDocuments } from '../utils/contractCompany.js'
import { whatsappLinkToPhone } from '../utils/whatsapp.js'
import DateInputBR from '../components/DateInputBR.jsx'
import useConfirm from '../components/useConfirm.jsx'
import '../components/ConfirmDialog.css'

const STATUS_PILL = { em_dia: 'is-success', em_atraso: 'is-danger', quitado: 'is-info', cancelado: '' }

// Baixa de uma parcela: multa e juros sugeridos pela data do pagamento
// (dá para mudar ou dispensar) e valor recebido (dá para dar desconto).
function PaymentDialog({ financing, installment, onConfirm, onClose, saving }) {
  const [paidOn, setPaidOn] = useState(todayISO())
  const [chargesInput, setChargesInput] = useState(null)
  const [receivedInput, setReceivedInput] = useState(null)
  const [method, setMethod] = useState('Pix')
  const [notes, setNotes] = useState('')
  const [receipt, setReceipt] = useState(true)
  const [error, setError] = useState('')

  const suggested = lateCharges(installment, financing, paidOn || todayISO())
  const charges = chargesInput === null ? suggested.total : parseMoneyBR(chargesInput) || 0
  const received = receivedInput === null ? round2(installment.amount + charges) : parseMoneyBR(receivedInput) || 0

  function handleSubmit(e) {
    e.preventDefault()
    if (!paidOn) return setError('Informe a data do pagamento (dd/mm/aaaa).')
    if (!received || received <= 0) return setError('Informe o valor recebido.')
    onConfirm({ paidOn, paidAmount: received, lateCharges: charges, paymentMethod: method, notes, receipt })
  }

  return (
    <div className="confirm-dialog-overlay" onClick={saving ? undefined : onClose}>
      <form className="confirm-dialog admin-form sale-dialog" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <button type="button" className="confirm-dialog-close" onClick={onClose} aria-label="Fechar" disabled={saving}>
          <X size={18} />
        </button>
        <h2>Registrar pagamento</h2>
        <p>
          Parcela {installment.number}/{financing.installmentsCount} · vence em {formatDateBR(installment.dueDate)} ·{' '}
          {formatCurrencyCents(installment.amount)}
        </p>
        <label>
          Data do pagamento
          <DateInputBR value={paidOn} onChange={setPaidOn} required />
        </label>
        <label>
          Multa e juros por atraso (R$)
          <input
            inputMode="decimal"
            value={chargesInput === null ? formatMoneyInput(suggested.total) : chargesInput}
            onChange={(e) => {
              setChargesInput(e.target.value)
              setReceivedInput(null)
            }}
          />
        </label>
        {suggested.days > 0 && (
          <span className="sale-dialog-note">
            {suggested.days} {suggested.days === 1 ? 'dia' : 'dias'} de atraso: multa {formatCurrencyCents(suggested.fee)} ({financing.lateFeePercent}%) + juros{' '}
            {formatCurrencyCents(suggested.interest)} ({financing.lateInterestPercent}% ao mês). Pode alterar ou zerar.
          </span>
        )}
        <label>
          Valor recebido (R$)
          <input
            inputMode="decimal"
            value={receivedInput === null ? formatMoneyInput(received) : receivedInput}
            onChange={(e) => setReceivedInput(e.target.value)}
            required
          />
        </label>
        <label>
          Forma de pagamento
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label>
          Observação (opcional)
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <label className="admin-checkbox">
          <input type="checkbox" checked={receipt} onChange={(e) => setReceipt(e.target.checked)} />
          Baixar o recibo (PDF) para o cliente
        </label>
        {error && <p className="admin-error">{error}</p>}
        <div className="confirm-dialog-actions">
          <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
            {saving ? 'Salvando…' : 'Confirmar pagamento'}
          </button>
          <button type="button" className="btn btn-outline btn-block" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}

// Ajuste de vencimento e valor de uma parcela em aberto (renegociação)
function AdjustDialog({ financing, installment, onConfirm, onClose, saving }) {
  const [dueDate, setDueDate] = useState(installment.dueDate)
  const [amount, setAmount] = useState(formatMoneyInput(installment.amount))
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    const value = parseMoneyBR(amount)
    if (!dueDate) return setError('Informe o vencimento (dd/mm/aaaa).')
    if (!value || value <= 0) return setError('Informe o valor da parcela.')
    onConfirm({ dueDate, amount: value })
  }

  return (
    <div className="confirm-dialog-overlay" onClick={saving ? undefined : onClose}>
      <form className="confirm-dialog admin-form sale-dialog" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <button type="button" className="confirm-dialog-close" onClick={onClose} aria-label="Fechar" disabled={saving}>
          <X size={18} />
        </button>
        <h2>Ajustar parcela {installment.number}/{financing.installmentsCount}</h2>
        <p>Para renegociar o vencimento ou o valor desta parcela.</p>
        <label>
          Vencimento
          <DateInputBR value={dueDate} onChange={setDueDate} required />
        </label>
        <label>
          Valor (R$)
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </label>
        {error && <p className="admin-error">{error}</p>}
        <div className="confirm-dialog-actions">
          <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
          <button type="button" className="btn btn-outline btn-block" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}

// Observações, taxas de atraso e cancelamento do financiamento
function EditDialog({ financing, onConfirm, onClose, saving }) {
  const [notes, setNotes] = useState(financing.notes)
  const [status, setStatus] = useState(financing.status)
  const [lateFee, setLateFee] = useState(String(financing.lateFeePercent).replace('.', ','))
  const [lateInterest, setLateInterest] = useState(String(financing.lateInterestPercent).replace('.', ','))
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    const fee = parsePercentBR(lateFee) ?? 0
    const interest = parsePercentBR(lateInterest) ?? 0
    if (fee < 0 || fee > 100 || interest < 0 || interest > 100) return setError('Multa e juros devem ficar entre 0 e 100%.')
    onConfirm({ notes, status, lateFeePercent: fee, lateInterestPercent: interest })
  }

  return (
    <div className="confirm-dialog-overlay" onClick={saving ? undefined : onClose}>
      <form className="confirm-dialog admin-form sale-dialog" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <button type="button" className="confirm-dialog-close" onClick={onClose} aria-label="Fechar" disabled={saving}>
          <X size={18} />
        </button>
        <h2>Editar financiamento</h2>
        <label>
          Situação
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ativo">Ativo</option>
            <option value="cancelado">Cancelado (venda desfeita, carro devolvido etc.)</option>
          </select>
        </label>
        <label>
          Multa por atraso (%)
          <input inputMode="decimal" value={lateFee} onChange={(e) => setLateFee(e.target.value)} />
        </label>
        <label>
          Juros por atraso (% ao mês)
          <input inputMode="decimal" value={lateInterest} onChange={(e) => setLateInterest(e.target.value)} />
        </label>
        <label>
          Observações
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {error && <p className="admin-error">{error}</p>}
        <div className="confirm-dialog-actions">
          <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
          <button type="button" className="btn btn-outline btn-block" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}

function whatsappMessage({ financing, installment, customer, companyName }) {
  const charges = lateCharges(installment, financing)
  const firstName = (customer?.name || financing.customerName).split(' ')[0]
  return [
    `Olá, ${firstName}! Aqui é da ${companyName || 'loja'}.`,
    `Consta em aberto a parcela ${installment.number}/${financing.installmentsCount} do financiamento do ${financing.vehicleLabel || 'seu veículo'}, com vencimento em ${formatDateBR(installment.dueDate)}.`,
    charges.total
      ? `Valor atualizado para hoje: ${formatCurrencyCents(installment.amount + charges.total)} (parcela ${formatCurrencyCents(installment.amount)} + multa e juros ${formatCurrencyCents(charges.total)}).`
      : `Valor: ${formatCurrencyCents(installment.amount)}.`,
    'Podemos combinar o pagamento?',
  ].join('\n')
}

// Lembrete antes do vencimento
function reminderMessage({ financing, installment, customer, companyName }) {
  const firstName = (customer?.name || financing.customerName).split(' ')[0]
  return [
    `Olá, ${firstName}! Aqui é da ${companyName || 'loja'}.`,
    `Passando para lembrar que a parcela ${installment.number}/${financing.installmentsCount} do financiamento do ${financing.vehicleLabel || 'seu veículo'} vence em ${formatDateBR(installment.dueDate)}, no valor de ${formatCurrencyCents(installment.amount)}.`,
    'Qualquer dúvida, é só chamar!',
  ].join('\n')
}

function InstallmentAmount({ row }) {
  return (
    <>
      {formatCurrencyCents(row.inst.amount)}
      {row.charges && row.charges.total > 0 && (
        <span className="installment-charges">hoje: {formatCurrencyCents(row.inst.amount + row.charges.total)}</span>
      )}
    </>
  )
}

function InstallmentSituation({ row }) {
  const { inst, status, charges } = row
  if (status === 'paga') {
    return (
      <>
        <span className="admin-pill is-success">Paga em {formatDateBR(inst.paidOn)}</span>
        <span className="admin-table-sub">
          {formatCurrencyCents(inst.paidAmount)}
          {inst.lateCharges ? ` (com ${formatCurrencyCents(inst.lateCharges)} de multa e juros)` : ''}
          {inst.paymentMethod ? ` · ${inst.paymentMethod}` : ''}
        </span>
      </>
    )
  }
  if (status === 'atrasada') {
    return <span className="admin-pill is-danger">Atrasada há {charges.days} {charges.days === 1 ? 'dia' : 'dias'}</span>
  }
  return <span className="admin-pill">Em aberto</span>
}

// Detalhes de um financiamento: resumo, parcelas, baixa de pagamento, recibo,
// cobrança pelo WhatsApp e ajustes. Excluir só o admin.
export default function FinancingDetailsDialog({ financing, customer, companyName, isAdmin, onChanged, onDeleted, onClose }) {
  const { confirm, confirmDialog } = useConfirm()
  const [paying, setPaying] = useState(null)
  const [adjusting, setAdjusting] = useState(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const today = todayISO()
  const summary = summarizeFinancing(financing, today)
  const cancelled = financing.status === 'cancelado'
  const company = companyForDocuments(companyName)

  const rows = financing.installments.map((inst) => {
    const status = installmentStatus(inst, today)
    const charges = status === 'atrasada' ? lateCharges(inst, financing, today) : null
    const whatsapp =
      status === 'atrasada' && customer?.phone
        ? whatsappLinkToPhone(customer.phone, whatsappMessage({ financing, installment: inst, customer, companyName: company.name }))
        : null
    const dueSoon = !cancelled && isDueSoon(inst, today)
    const reminder =
      dueSoon && customer?.phone
        ? whatsappLinkToPhone(customer.phone, reminderMessage({ financing, installment: inst, customer, companyName: company.name }))
        : null
    return { inst, status, charges, whatsapp, dueSoon, reminder }
  })

  function renderActions({ inst, status, whatsapp, dueSoon, reminder }) {
    return (
      <div className="admin-action-group">
        {status === 'paga' ? (
          <>
            <button type="button" className="admin-action-btn" onClick={() => downloadReceipt(financing, inst)}>
              <Receipt size={14} /> Recibo
            </button>
            <button type="button" className="admin-action-btn" onClick={() => handleUndo(inst)}>
              <Undo2 size={14} /> Desfazer
            </button>
          </>
        ) : (
          !cancelled && (
            <>
              <button type="button" className="admin-action-btn is-active" onClick={() => setPaying(inst)}>
                <BadgeCheck size={14} /> Registrar pagamento
              </button>
              {status === 'atrasada' &&
                (whatsapp ? (
                  <a href={whatsapp} target="_blank" rel="noreferrer" className="admin-action-btn">
                    <MessageCircle size={14} /> Cobrar no WhatsApp
                  </a>
                ) : (
                  <span className="admin-action-btn is-disabled" title="Cliente sem telefone no cadastro">
                    <MessageCircle size={14} /> Sem telefone
                  </span>
                ))}
              {dueSoon &&
                (reminder ? (
                  <a href={reminder} target="_blank" rel="noreferrer" className="admin-action-btn">
                    <BellRing size={14} /> Lembrar no WhatsApp
                  </a>
                ) : (
                  <span className="admin-action-btn is-disabled" title="Cliente sem telefone no cadastro">
                    <BellRing size={14} /> Sem telefone
                  </span>
                ))}
              <button type="button" className="admin-action-btn" onClick={() => setAdjusting(inst)}>
                <CalendarClock size={14} /> Ajustar
              </button>
            </>
          )
        )}
      </div>
    )
  }

  function withInstallment(updated) {
    return { ...financing, installments: financing.installments.map((i) => (i.id === updated.id ? updated : i)) }
  }

  async function handlePay({ receipt, ...payment }) {
    const target = paying
    setSaving(true)
    let next
    try {
      const updated = await payInstallment(target.id, payment)
      next = withInstallment(updated)
      onChanged(next)
      setPaying(null)
    } catch (err) {
      alert('Não foi possível registrar o pagamento: ' + err.message)
      return
    } finally {
      setSaving(false)
    }
    if (receipt) downloadReceipt(next, next.installments.find((i) => i.id === target.id))
  }

  async function downloadReceipt(fin, installment) {
    try {
      await generateInstallmentReceiptPdf({ company, customer, financing: fin, installment })
    } catch (err) {
      alert('Não foi possível gerar o recibo: ' + err.message)
    }
  }

  async function handleUndo(installment) {
    if (!(await confirm(`Desfazer o pagamento da parcela ${installment.number}? Ela volta a ficar em aberto.`, { title: 'Desfazer pagamento', confirmLabel: 'Desfazer' }))) return
    try {
      onChanged(withInstallment(await undoInstallmentPayment(installment.id)))
    } catch (err) {
      alert('Não foi possível desfazer: ' + err.message)
    }
  }

  async function handleAdjust(values) {
    setSaving(true)
    try {
      onChanged(withInstallment(await updateInstallment(adjusting.id, values)))
      setAdjusting(null)
    } catch (err) {
      alert('Não foi possível ajustar a parcela: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleEdit(values) {
    setSaving(true)
    try {
      onChanged(await updateFinancing(financing.id, values))
      setEditing(false)
    } catch (err) {
      alert('Não foi possível salvar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!(await confirm(`Excluir o financiamento de ${financing.customerName}, com todas as parcelas e pagamentos registrados? Essa ação não pode ser desfeita.`, { title: 'Excluir financiamento', confirmLabel: 'Excluir' }))) return
    try {
      await deleteFinancing(financing.id)
      onDeleted(financing.id)
    } catch (err) {
      alert('Não foi possível excluir: ' + err.message)
    }
  }

  return (
    <>
      <div className="confirm-dialog-overlay" onClick={onClose}>
        <div className="confirm-dialog admin-dialog-wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Financiamento">
          <button type="button" className="confirm-dialog-close" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
          <div>
            <span className={`admin-pill ${STATUS_PILL[summary.status]}`}>{FINANCING_STATUS_LABELS[summary.status]}</span>
            <h2>{financing.customerName}</h2>
            <p className="admin-table-sub">
              {[financing.vehicleLabel, financing.vehiclePlate && financing.vehiclePlate.toUpperCase(), customer?.phone].filter(Boolean).join(' · ')}
            </p>
          </div>

          <div className="admin-row-actions">
            {financing.customerId && (
              <Link to={`/admin/clientes?cliente=${financing.customerId}`} className="btn btn-outline">
                <FolderOpen size={15} /> Ficha do cliente
              </Link>
            )}
            <button type="button" className="btn btn-outline" onClick={() => setEditing(true)}>
              <Pencil size={15} /> Editar
            </button>
            {isAdmin && (
              <button type="button" className="btn btn-outline admin-delete-btn" onClick={handleDelete}>
                <Trash2 size={15} /> Excluir
              </button>
            )}
          </div>

          <div className="admin-detail-grid">
            <div>
              <span>Valor do veículo</span>
              <strong>{formatCurrencyCents(financing.vehiclePrice)}</strong>
            </div>
            <div>
              <span>Entrada</span>
              <strong>{formatCurrencyCents(financing.downPayment)}</strong>
            </div>
            <div>
              <span>Valor financiado</span>
              <strong>{formatCurrencyCents(financing.financedAmount)}</strong>
            </div>
            <div>
              <span>Parcelas</span>
              <strong>{financing.installmentsCount}x de {formatCurrencyCents(financing.installmentAmount)}</strong>
            </div>
            <div>
              <span>Juros do financiamento</span>
              <strong>{financing.interestRate ? `${String(financing.interestRate).replace('.', ',')}% ao mês` : 'Sem juros'}</strong>
            </div>
            <div>
              <span>Total a prazo</span>
              <strong>{formatCurrencyCents(summary.total)}</strong>
            </div>
            <div>
              <span>Pago (entrada + parcelas)</span>
              <strong>{formatCurrencyCents(summary.paid)}</strong>
            </div>
            <div>
              <span>Saldo devedor</span>
              <strong>{formatCurrencyCents(summary.open)}</strong>
            </div>
            <div>
              <span>Parcelas pagas</span>
              <strong>{summary.paidCount} de {summary.count}</strong>
            </div>
            <div>
              <span>Multa e juros por atraso</span>
              <strong>{financing.lateFeePercent}% + {financing.lateInterestPercent}% ao mês</strong>
            </div>
            {summary.chargesReceived > 0 && (
              <div>
                <span>Multa e juros recebidos</span>
                <strong>{formatCurrencyCents(summary.chargesReceived)}</strong>
              </div>
            )}
          </div>
          {financing.notes && <p className="admin-form-note">{financing.notes}</p>}

          <section className="admin-dialog-section">
            <h3>Parcelas</h3>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Nº</th>
                    <th>Vencimento</th>
                    <th>Valor</th>
                    <th>Situação</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.inst.id} className={row.status === 'atrasada' && !cancelled ? 'installment-row-overdue' : ''}>
                      <td>{row.inst.number}/{financing.installmentsCount}</td>
                      <td className="admin-nowrap">{formatDateBR(row.inst.dueDate)}</td>
                      <td className="admin-nowrap"><InstallmentAmount row={row} /></td>
                      <td><InstallmentSituation row={row} /></td>
                      <td>{renderActions(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="admin-card-list">
              {rows.map((row) => (
                <div className={`admin-card ${row.status === 'atrasada' && !cancelled ? 'installment-card-overdue' : ''}`} key={row.inst.id}>
                  <div className="admin-card-top">
                    <div className="admin-card-title">
                      <strong>Parcela {row.inst.number}/{financing.installmentsCount}</strong>
                      <span className="admin-card-meta">
                        Vence em {formatDateBR(row.inst.dueDate)} · <InstallmentAmount row={row} />
                      </span>
                    </div>
                  </div>
                  <InstallmentSituation row={row} />
                  {renderActions(row)}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {paying && <PaymentDialog financing={financing} installment={paying} onConfirm={handlePay} onClose={() => setPaying(null)} saving={saving} />}
      {adjusting && <AdjustDialog financing={financing} installment={adjusting} onConfirm={handleAdjust} onClose={() => setAdjusting(null)} saving={saving} />}
      {editing && <EditDialog financing={financing} onConfirm={handleEdit} onClose={() => setEditing(false)} saving={saving} />}
      {confirmDialog}
    </>
  )
}
