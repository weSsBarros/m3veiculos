import { useState } from 'react'
import { X } from 'lucide-react'
import DateInputBR from '../components/DateInputBR.jsx'
import { todayISO, formatCurrencyCents } from '../utils/carFormat.js'
import { parseMoneyBR, formatMoneyInput } from '../utils/financing.js'
import { EXTERNAL_STATUSES, computeExternalCommission, describeExternalCommission } from '../utils/externalFinancing.js'
import CustomerPicker from './CustomerPicker.jsx'
import BankSelect from './BankSelect.jsx'
import '../components/ConfirmDialog.css'

function money(value) {
  return value != null ? formatMoneyInput(value) : ''
}

// Cadastro e edição de financiamento externo. Admin e gerente preenchem
// tudo; o vendedor cadastra no nome dele e não marca como pago nem informa o
// retorno da loja (regra também no banco).
export default function ExternalFinancingDialog({
  initial,
  customers,
  onCustomerCreated,
  sellers,
  banks,
  isStaff,
  lockedSeller,
  showValues,
  onConfirm,
  onClose,
  saving,
}) {
  const [form, setForm] = useState(() => ({
    customerId: initial?.customerId || '',
    vehicleLabel: initial?.vehicleLabel || '',
    vehiclePlate: initial?.vehiclePlate || '',
    vehicleYear: initial?.vehicleYear || '',
    vehiclePrice: money(initial?.vehiclePrice),
    vehicleSource: initial?.vehicleSource || 'particular',
    vehicleSourceName: initial?.vehicleSourceName || '',
    bank: initial?.bank || '',
    downPayment: money(initial?.downPayment),
    financedAmount: money(initial?.financedAmount),
    installmentsCount: initial?.installmentsCount ? String(initial.installmentsCount) : '',
    installmentAmount: money(initial?.installmentAmount),
    sellerId: lockedSeller?.id || initial?.sellerId || '',
    status: initial?.status || 'em_analise',
    submittedOn: initial?.submittedOn || todayISO(),
    storeReturn: money(initial?.storeReturn),
    notes: initial?.notes || '',
  }))
  const [error, setError] = useState('')

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const statusOptions = isStaff ? EXTERNAL_STATUSES : EXTERNAL_STATUSES.filter((s) => s.value !== 'pago' || initial?.status === 'pago')
  const seller = (lockedSeller ? [lockedSeller] : sellers).find((s) => s.id === form.sellerId)
  // Regra da época (financiamento já gravado) ou a atual do vendedor
  const commissionType = initial && initial.sellerId === form.sellerId ? initial.commissionType : seller?.extCommissionType
  const commissionValue = initial && initial.sellerId === form.sellerId ? initial.commissionValue : seller?.extCommissionValue
  const commissionPreview = seller
    ? computeExternalCommission(commissionType, commissionValue, parseMoneyBR(form.financedAmount), parseMoneyBR(form.storeReturn))
    : null

  function handleSubmit(e) {
    e.preventDefault()
    const customer = customers.find((c) => c.id === form.customerId)
    if (!customer) return setError('Escolha o cliente (ou cadastre um novo).')
    if (!form.vehicleLabel.trim()) return setError('Descreva o carro (marca, modelo e versão).')
    const financed = parseMoneyBR(form.financedAmount)
    if (!financed || financed <= 0) return setError('Informe o valor financiado.')
    const count = form.installmentsCount ? Number.parseInt(form.installmentsCount, 10) : null
    if (count !== null && (!Number.isFinite(count) || count < 1 || count > 240)) return setError('Número de parcelas inválido (de 1 a 240).')
    onConfirm({
      customerId: customer.id,
      customerName: customer.name,
      vehicleLabel: form.vehicleLabel.trim(),
      vehiclePlate: form.vehiclePlate.trim(),
      vehicleYear: form.vehicleYear.trim(),
      vehiclePrice: parseMoneyBR(form.vehiclePrice),
      vehicleSource: form.vehicleSource,
      vehicleSourceName: form.vehicleSourceName.trim(),
      bank: form.bank.trim(),
      downPayment: parseMoneyBR(form.downPayment),
      financedAmount: financed,
      installmentsCount: count,
      installmentAmount: parseMoneyBR(form.installmentAmount),
      sellerId: form.sellerId || null,
      status: form.status,
      submittedOn: form.submittedOn || todayISO(),
      approvedOn: initial?.approvedOn || null,
      paidOn: initial?.paidOn || null,
      closedOn: initial?.closedOn || null,
      // O vendedor não altera o retorno da loja: manda o que já estava gravado
      storeReturn: isStaff ? parseMoneyBR(form.storeReturn) : initial?.storeReturn ?? null,
      notes: form.notes.trim(),
    })
  }

  return (
    <div className="confirm-dialog-overlay" onClick={saving ? undefined : onClose}>
      <form className="confirm-dialog admin-form sale-dialog" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <button type="button" className="confirm-dialog-close" onClick={onClose} aria-label="Fechar" disabled={saving}>
          <X size={18} />
        </button>
        <h2>{initial ? 'Financiamento externo' : 'Novo financiamento externo'}</h2>
        <p>O cliente achou o carro fora da loja e só fez o financiamento com a loja.</p>

        <CustomerPicker
          customers={customers}
          value={form.customerId}
          onChange={(id) => update('customerId', id)}
          onCreated={onCustomerCreated}
          disabled={saving}
          label="Cliente"
        />

        <span className="admin-field-label">Carro</span>
        <div className="admin-form-grid">
          <label>
            Descrição
            <input value={form.vehicleLabel} onChange={(e) => update('vehicleLabel', e.target.value)} placeholder="Ex: Toyota Corolla XEi 2.0" />
          </label>
          <label>
            Ano
            <input value={form.vehicleYear} onChange={(e) => update('vehicleYear', e.target.value)} placeholder="Ex: 2021/2022" />
          </label>
          <label>
            Placa
            <input value={form.vehiclePlate} onChange={(e) => update('vehiclePlate', e.target.value)} placeholder="Ex: ABC1D23" />
          </label>
          <label>
            Valor do carro (R$)
            <input inputMode="decimal" value={form.vehiclePrice} onChange={(e) => update('vehiclePrice', e.target.value)} placeholder="Ex: 85.000,00" />
          </label>
          <label>
            O carro está com
            <select value={form.vehicleSource} onChange={(e) => update('vehicleSource', e.target.value)}>
              <option value="particular">Particular</option>
              <option value="loja">Outra loja</option>
            </select>
          </label>
          <label>
            {form.vehicleSource === 'loja' ? 'Nome da loja' : 'Nome do vendedor (particular)'}
            <input value={form.vehicleSourceName} onChange={(e) => update('vehicleSourceName', e.target.value)} placeholder="Opcional" />
          </label>
        </div>

        <span className="admin-field-label">Financiamento</span>
        <div className="admin-form-grid">
          <BankSelect value={form.bank} onChange={(bank) => update('bank', bank)} banks={banks} disabled={saving} label="Banco" />
          <label>
            Entrada (R$) — opcional
            <input inputMode="decimal" value={form.downPayment} onChange={(e) => update('downPayment', e.target.value)} placeholder="0,00" />
          </label>
          <label>
            Valor financiado (R$)
            <input inputMode="decimal" value={form.financedAmount} onChange={(e) => update('financedAmount', e.target.value)} placeholder="Ex: 60.000,00" />
          </label>
          <label>
            Parcelas — opcional
            <input inputMode="numeric" value={form.installmentsCount} onChange={(e) => update('installmentsCount', e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="Ex: 48" />
          </label>
          <label>
            Valor da parcela (R$) — opcional
            <input inputMode="decimal" value={form.installmentAmount} onChange={(e) => update('installmentAmount', e.target.value)} placeholder="0,00" />
          </label>
          <label>
            Enviado ao banco em
            <DateInputBR value={form.submittedOn} onChange={(v) => update('submittedOn', v)} />
          </label>
          <label>
            Situação
            <select value={form.status} onChange={(e) => update('status', e.target.value)}>
              {statusOptions.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
          <label>
            Vendedor
            <select value={form.sellerId} onChange={(e) => update('sellerId', e.target.value)} disabled={Boolean(lockedSeller)}>
              {!lockedSeller && <option value="">Sem vendedor (loja)</option>}
              {(lockedSeller ? [lockedSeller] : sellers.filter((s) => (s.active && !s.deletedAt) || s.id === form.sellerId)).map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.role === 'manager' ? ' (gerente)' : ''}</option>
              ))}
            </select>
          </label>
          {isStaff && showValues && (
            <label>
              Retorno da loja (R$)
              <input inputMode="decimal" value={form.storeReturn} onChange={(e) => update('storeReturn', e.target.value)} placeholder="Quanto o banco paga à loja" />
            </label>
          )}
        </div>

        {seller && showValues && (
          <div className="sale-dialog-commission">
            <span>Comissão ({describeExternalCommission(commissionType, commissionValue)})</span>
            <strong>{commissionPreview != null ? formatCurrencyCents(commissionPreview) : '—'}</strong>
          </div>
        )}

        <label>
          Observações
          <textarea rows={2} value={form.notes} onChange={(e) => update('notes', e.target.value)} />
        </label>

        {error && <p className="admin-error">{error}</p>}

        <div className="confirm-dialog-actions">
          <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
            {saving ? 'Salvando…' : initial ? 'Salvar alterações' : 'Cadastrar'}
          </button>
          <button type="button" className="btn btn-outline btn-block" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
