import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import DateInputBR from '../components/DateInputBR.jsx'
import { formatCurrencyCents, formatDateBR, todayISO } from '../utils/carFormat.js'
import '../components/ConfirmDialog.css'

// Comissões em aberto de uma pessoa da equipe (vendas + financiamentos
// externos pagos pelo banco): o admin marca as que pagou, com a data.
export default function CommissionsDialog({ seller, sales, externals, carsById, onConfirm, onClose, saving }) {
  const items = useMemo(
    () => [
      ...sales.map((s) => {
        const car = carsById[s.carId]
        return {
          key: `s-${s.id}`,
          kind: 'sale',
          id: s.id,
          date: s.saleDate,
          label: car ? `Venda — ${car.brand} ${car.model}` : 'Venda',
          amount: s.commissionAmount,
        }
      }),
      ...externals.map((e) => ({
        key: `e-${e.id}`,
        kind: 'external',
        id: e.id,
        date: e.paidOn || e.submittedOn,
        label: `Financiamento externo — ${e.customerName}`,
        amount: e.commissionAmount,
      })),
    ].sort((a, b) => (a.date < b.date ? -1 : 1)),
    [sales, externals, carsById]
  )
  const [selected, setSelected] = useState(() => new Set(items.map((i) => i.key)))
  const [paidOn, setPaidOn] = useState(todayISO())

  function toggle(key) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const total = items.filter((i) => selected.has(i.key)).reduce((sum, i) => sum + i.amount, 0)

  function handleSubmit(e) {
    e.preventDefault()
    const chosen = items.filter((i) => selected.has(i.key))
    onConfirm({
      saleIds: chosen.filter((i) => i.kind === 'sale').map((i) => i.id),
      externalIds: chosen.filter((i) => i.kind === 'external').map((i) => i.id),
      paidOn,
    })
  }

  return (
    <div className="confirm-dialog-overlay" onClick={saving ? undefined : onClose}>
      <form className="confirm-dialog admin-form sale-dialog" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <button type="button" className="confirm-dialog-close" onClick={onClose} aria-label="Fechar" disabled={saving}>
          <X size={18} />
        </button>
        <h2>Comissões de {seller.name}</h2>
        <p>Marque as comissões que foram pagas. Financiamento externo só entra depois que o banco paga a loja.</p>
        {items.length === 0 ? (
          <p className="admin-muted">Nenhuma comissão em aberto.</p>
        ) : (
          <ul className="commission-list">
            {items.map((i) => (
              <li key={i.key}>
                <label className="admin-checkbox">
                  <input type="checkbox" checked={selected.has(i.key)} onChange={() => toggle(i.key)} disabled={saving} />
                  <span>
                    {i.label}
                    <span className="admin-table-sub">{i.date ? formatDateBR(i.date) : ''}</span>
                  </span>
                </label>
                <strong>{formatCurrencyCents(i.amount)}</strong>
              </li>
            ))}
          </ul>
        )}
        <label>
          Pagas em
          <DateInputBR value={paidOn} onChange={setPaidOn} />
        </label>
        <div className="sale-dialog-commission">
          <span>Total marcado</span>
          <strong>{formatCurrencyCents(total)}</strong>
        </div>
        <div className="confirm-dialog-actions">
          <button type="submit" className="btn btn-primary btn-block" disabled={saving || selected.size === 0 || !paidOn}>
            {saving ? 'Salvando…' : 'Marcar como pagas'}
          </button>
          <button type="button" className="btn btn-outline btn-block" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
