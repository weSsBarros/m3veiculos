import { useState } from 'react'
import { X } from 'lucide-react'
import { createCompanyExpense, updateCompanyExpense, updateCompanyExpenseRecurrence } from '../lib/companyExpensesApi.js'
import { COMPANY_EXPENSE_CATEGORIES } from '../utils/companyExpenses.js'
import { parseMoneyBR, formatMoneyInput } from '../utils/financing.js'
import { todayISO, formatDateBR } from '../utils/carFormat.js'
import { MoneyInput } from '../components/NumberInputs.jsx'
import DateInputBR from '../components/DateInputBR.jsx'
import ExpenseAttachmentUploader from './ExpenseAttachmentUploader.jsx'
import '../components/ConfirmDialog.css'

// Nova despesa da empresa ou edição de uma. expense = null para nova.
// recurrence: o modelo ativo da despesa ("Repetir todo mês"), se houver.
export default function CompanyExpenseDialog({ expense, recurrence, suppliers, onSaved, onClose }) {
  const editing = Boolean(expense)
  const [form, setForm] = useState(() => ({
    category: expense?.category || COMPANY_EXPENSE_CATEGORIES[0].slug,
    description: expense?.description || '',
    amount: expense ? formatMoneyInput(expense.amount) : '',
    dueOn: expense?.dueOn || todayISO(),
    paid: Boolean(expense?.paidOn),
    paidOn: expense?.paidOn || todayISO(),
    supplierId: expense?.supplierId || '',
    notes: expense?.notes || '',
    attachments: expense?.attachments || [],
    repeat: false,
    applyToNext: false,
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const day = Number((form.dueOn || '').slice(8, 10)) || null

  async function handleSubmit(e) {
    e.preventDefault()
    const amount = parseMoneyBR(form.amount)
    if (amount == null || amount < 0) {
      setError('Informe o valor da despesa.')
      return
    }
    if (!form.dueOn) {
      setError('Informe o vencimento.')
      return
    }
    if (form.paid && !form.paidOn) {
      setError('Informe a data do pagamento.')
      return
    }
    const payload = {
      category: form.category,
      description: form.description.trim(),
      amount,
      dueOn: form.dueOn,
      paidOn: form.paid ? form.paidOn : null,
      supplierId: form.supplierId || null,
      notes: form.notes.trim(),
      attachments: form.attachments,
    }
    setSaving(true)
    setError('')
    try {
      let saved
      let savedRecurrence = null
      if (editing) {
        saved = await updateCompanyExpense(expense.id, payload)
        if (recurrence && form.applyToNext) {
          savedRecurrence = await updateCompanyExpenseRecurrence(recurrence.id, { ...payload, day })
        }
      } else {
        saved = await createCompanyExpense(payload, { repeat: form.repeat })
      }
      onSaved(saved, { recurrence: savedRecurrence, repeated: !editing && form.repeat })
    } catch (err) {
      setError('Não foi possível salvar: ' + (err.message || 'tente de novo.'))
      setSaving(false)
    }
  }

  return (
    <div className="confirm-dialog-overlay" onClick={saving ? undefined : onClose}>
      <form className="confirm-dialog admin-form sale-dialog company-expense-dialog" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <button type="button" className="confirm-dialog-close" onClick={onClose} aria-label="Fechar" disabled={saving}>
          <X size={18} />
        </button>
        <h2>{editing ? 'Editar despesa' : 'Nova despesa da empresa'}</h2>
        <p>Contas da loja que não são de um carro: aluguel, água, energia, salários, contador…</p>

        <div className="admin-form-grid">
          <label>
            Categoria
            <select required value={form.category} onChange={(e) => update('category', e.target.value)}>
              {COMPANY_EXPENSE_CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>{c.label}</option>
              ))}
            </select>
          </label>
          <label>
            Valor
            <MoneyInput cents required value={form.amount} onChange={(v) => update('amount', v)} placeholder="0,00" />
          </label>
          <label>
            Vencimento
            <DateInputBR required value={form.dueOn} onChange={(iso) => update('dueOn', iso)} />
          </label>
          <label>
            Fornecedor (opcional)
            <select value={form.supplierId} onChange={(e) => update('supplierId', e.target.value)}>
              <option value="">— Nenhum —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
        </div>

        <label>
          Descrição
          <input
            value={form.description}
            maxLength={300}
            onChange={(e) => update('description', e.target.value)}
            placeholder="Ex: Aluguel do galpão, conta de luz de outubro"
          />
        </label>

        <div className="company-expense-paid">
          <label className="admin-checkbox">
            <input type="checkbox" checked={form.paid} onChange={(e) => update('paid', e.target.checked)} />
            Já está paga
          </label>
          {form.paid && (
            <label>
              Pago em
              <DateInputBR required value={form.paidOn} onChange={(iso) => update('paidOn', iso)} />
            </label>
          )}
        </div>

        {!editing && (
          <label className="admin-checkbox admin-checkbox-note">
            <input type="checkbox" checked={form.repeat} onChange={(e) => update('repeat', e.target.checked)} />
            <span>
              Repetir todo mês
              <small className="admin-form-note">
                {form.repeat && day
                  ? `O sistema cria esta despesa sozinho todo mês, com vencimento no dia ${day}${day > 28 ? ' (nos meses mais curtos, no último dia)' : ''}.`
                  : 'Para contas fixas, como aluguel, internet e contador.'}
              </small>
            </span>
          </label>
        )}

        {editing && recurrence && (
          <label className="admin-checkbox">
            <input type="checkbox" checked={form.applyToNext} onChange={(e) => update('applyToNext', e.target.checked)} />
            <span>
              Aplicar também às próximas
              <small className="admin-form-note">
                Esta despesa se repete todo mês. Marque para os próximos meses saírem com estes dados
                {day ? ` (vencimento no dia ${day})` : ''}; sem marcar, muda só a de {formatDateBR(expense.dueOn)}.
              </small>
            </span>
          </label>
        )}

        <label>
          Observação (opcional)
          <textarea rows={2} maxLength={1000} value={form.notes} onChange={(e) => update('notes', e.target.value)} />
        </label>

        <label className="expense-form-attachments-label">
          Comprovante (foto ou PDF do boleto ou recibo)
          <ExpenseAttachmentUploader carId="empresa" attachments={form.attachments} onChange={(a) => update('attachments', a)} />
        </label>

        {error && <p className="admin-error">{error}</p>}

        <div className="confirm-dialog-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Salvando…' : editing ? 'Salvar' : 'Adicionar despesa'}
          </button>
        </div>
      </form>
    </div>
  )
}
