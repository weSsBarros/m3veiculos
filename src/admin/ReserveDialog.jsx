import { useState } from 'react'
import { X } from 'lucide-react'
import DateInputBR from '../components/DateInputBR.jsx'
import { addDaysISO, todayISO } from '../utils/carFormat.js'
import { parseMoneyBR } from '../utils/financing.js'
import CustomerPicker from './CustomerPicker.jsx'
import { MoneyInput } from '../components/NumberInputs.jsx'
import '../components/ConfirmDialog.css'

// Reserva com sinal: cliente, vendedor, valor do sinal, prazo e observações.
// O carro some do site (como vendido) até a reserva virar venda ou ser
// cancelada. lockedSeller: o vendedor reservando no próprio nome.
export default function ReserveDialog({ car, sellers, customers, onCustomerCreated, lockedSeller = null, onConfirm, onClose, saving }) {
  const choosable = lockedSeller ? [lockedSeller] : sellers.filter((s) => s.active && !s.deletedAt)
  const [sellerId, setSellerId] = useState(lockedSeller?.id || '')
  const [customerId, setCustomerId] = useState('')
  const [deposit, setDeposit] = useState('')
  const [until, setUntil] = useState(() => addDaysISO(todayISO(), 7))
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (!customerId) {
      setError('Escolha o cliente da reserva (ou cadastre um novo).')
      return
    }
    onConfirm({
      carId: car.id,
      customerId,
      sellerId: sellerId || null,
      depositAmount: parseMoneyBR(deposit),
      reservedOn: todayISO(),
      reservedUntil: until || null,
      notes: notes.trim(),
    })
  }

  return (
    <div className="confirm-dialog-overlay" onClick={saving ? undefined : onClose}>
      <form className="confirm-dialog admin-form sale-dialog" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <button type="button" className="confirm-dialog-close" onClick={onClose} aria-label="Fechar" disabled={saving}>
          <X size={18} />
        </button>
        <h2>Reservar carro</h2>
        <p>{car.brand} {car.model} {car.version}{car.plate ? ` · ${car.plate.toUpperCase()}` : ''}</p>

        <CustomerPicker
          customers={customers}
          value={customerId}
          onChange={setCustomerId}
          onCreated={onCustomerCreated}
          disabled={saving}
          label="Cliente"
        />

        <label>
          Vendedor
          <select value={sellerId} onChange={(e) => setSellerId(e.target.value)} disabled={Boolean(lockedSeller) || saving}>
            {!lockedSeller && <option value="">Sem vendedor (loja)</option>}
            {choosable.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.role === 'manager' ? ' (gerente)' : ''}</option>
            ))}
          </select>
        </label>

        <label>
          Valor do sinal — opcional
          <MoneyInput cents value={deposit} onChange={(v) => setDeposit(v)} placeholder="Ex: 2.000,00" disabled={saving} />
        </label>

        <label>
          Reservado até
          <DateInputBR value={until} onChange={setUntil} />
        </label>

        <label>
          Observações
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex: aguardando aprovação do financiamento" disabled={saving} />
        </label>

        <span className="sale-dialog-note">
          O carro sai do site enquanto estiver reservado. A reserva vira venda ou é cancelada em Vendas → Reservas.
        </span>

        {error && <p className="admin-error">{error}</p>}

        <div className="confirm-dialog-actions">
          <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
            {saving ? 'Salvando…' : 'Reservar'}
          </button>
          <button type="button" className="btn btn-outline btn-block" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
