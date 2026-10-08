import { useState } from 'react'
import { X, Upload, Paperclip, MessageCircle, CheckCircle2 } from 'lucide-react'
import { informPayment, notifyWbdev, uploadPaymentReceipt } from '../lib/clientsApi.js'
import { money, dateBR, monthName, monthsText } from '../utils/billing.js'
import { parseMoneyBR, formatMoneyInput } from '../utils/financing.js'
import { todayISO } from '../utils/carFormat.js'
import { supportMessageLink } from '../utils/support.js'
import { MoneyInput } from '../components/NumberInputs.jsx'
import DateInputBR from '../components/DateInputBR.jsx'
import '../components/ConfirmDialog.css'

// "Já paguei": a loja informa os meses pagos, o valor, a data e (se quiser) o
// comprovante. A WB.Dev recebe o aviso no WhatsApp e confirma na Plataforma.
// options: meses que dá para pagar ({ month, due, amount, late }); preselected:
// os já marcados.
export default function PaymentClaimDialog({ options, preselected, storeName, onDone, onClose }) {
  const [months, setMonths] = useState(() => new Set(preselected))
  const total = options.filter((o) => months.has(o.month)).reduce((s, o) => s + o.amount, 0)
  const [amount, setAmount] = useState(() => formatMoneyInput(total))
  const [amountTouched, setAmountTouched] = useState(false)
  const [paidOn, setPaidOn] = useState(todayISO())
  const [file, setFile] = useState(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)

  function toggle(month) {
    setMonths((prev) => {
      const next = new Set(prev)
      if (next.has(month)) next.delete(month)
      else next.add(month)
      if (!amountTouched) setAmount(formatMoneyInput(options.filter((o) => next.has(o.month)).reduce((s, o) => s + o.amount, 0)))
      return next
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const chosen = options.filter((o) => months.has(o.month)).map((o) => o.month)
    const value = parseMoneyBR(amount)
    if (!chosen.length) return setError('Marque o mês (ou os meses) que você pagou.')
    if (value == null || value <= 0) return setError('Informe o valor pago.')
    if (!paidOn) return setError('Informe a data do pagamento.')
    setSaving(true)
    setError('')
    try {
      const receipt = file ? await uploadPaymentReceipt(file) : null
      const claim = await informPayment({ months: chosen, amount: value, paidOn, receipt, note: note.trim() })
      await notifyWbdev('pagamento_informado', claim.id)
      setDone({ months: chosen, amount: value })
    } catch (err) {
      setError('Não foi possível informar o pagamento: ' + (err.message || 'tente de novo.'))
      setSaving(false)
    }
  }

  if (done) {
    const text =
      `Olá! Aqui é da ${storeName}. Paguei a mensalidade do sistema de ${monthsText(done.months)} ` +
      `(${money(done.amount)}) em ${dateBR(paidOn)} pelo PIX. Segue o comprovante.`
    return (
      <div className="confirm-dialog-overlay" onClick={() => onDone()}>
        <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="confirm-dialog-close" onClick={() => onDone()} aria-label="Fechar">
            <X size={18} />
          </button>
          <h2><CheckCircle2 size={20} /> Pagamento informado</h2>
          <p>
            A WB.Dev recebeu o aviso e vai conferir o pagamento de {monthsText(done.months)}. Quando confirmar, ele aparece aqui como pago.
          </p>
          <p>Se quiser, mande também o comprovante pelo WhatsApp da WB.Dev:</p>
          <div className="confirm-dialog-actions">
            <button type="button" className="btn btn-outline" onClick={() => onDone()}>Fechar</button>
            <a className="btn btn-primary" href={supportMessageLink(text)} target="_blank" rel="noreferrer" onClick={() => onDone()}>
              <MessageCircle size={15} /> Mandar no WhatsApp
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="confirm-dialog-overlay" onClick={saving ? undefined : onClose}>
      <form className="confirm-dialog admin-form sale-dialog payment-claim-dialog" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <button type="button" className="confirm-dialog-close" onClick={onClose} aria-label="Fechar" disabled={saving}>
          <X size={18} />
        </button>
        <h2>Já paguei</h2>
        <p>Informe o pagamento para a WB.Dev conferir. Se tiver, anexe o comprovante.</p>

        <fieldset className="payment-claim-months">
          <legend>Mês pago</legend>
          {options.map((o) => (
            <label key={o.month} className="admin-checkbox">
              <input type="checkbox" checked={months.has(o.month)} onChange={() => toggle(o.month)} />
              <span>
                {monthName(o.month)} · {money(o.amount)} · {o.late ? `venceu em ${dateBR(o.due)}` : `vence em ${dateBR(o.due)}`}
              </span>
            </label>
          ))}
        </fieldset>

        <div className="admin-form-grid">
          <label>
            Valor pago
            <MoneyInput
              cents
              required
              value={amount}
              onChange={(v) => {
                setAmount(v)
                setAmountTouched(true)
              }}
            />
          </label>
          <label>
            Data do pagamento
            <DateInputBR required value={paidOn} onChange={setPaidOn} />
          </label>
        </div>

        <label className="payment-claim-file">
          Comprovante (opcional)
          <span className="attachment-uploader-drop">
            {file ? <Paperclip size={16} /> : <Upload size={16} />}
            <span>{file ? file.name : 'Clique para anexar a foto ou o PDF do comprovante'}</span>
            <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </span>
        </label>

        <label>
          Observação (opcional)
          <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Ex: paguei pela conta da empresa" />
        </label>

        {error && <p className="admin-error">{error}</p>}

        <div className="confirm-dialog-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Enviando…' : 'Informar pagamento'}
          </button>
        </div>
      </form>
    </div>
  )
}
