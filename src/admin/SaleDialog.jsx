import { useState } from 'react'
import { X } from 'lucide-react'
import DateInputBR from '../components/DateInputBR.jsx'
import { formatCurrencyCents, parseIntBR, todayISO } from '../utils/carFormat.js'
import { describeCommission } from '../lib/sellersApi.js'
import CustomerPicker from './CustomerPicker.jsx'
import '../components/ConfirmDialog.css'

// Janela aberta ao marcar um carro como "Vendido": vendedor, cliente
// comprador (opcional), valor final negociado e data. A comissão mostrada é só
// uma prévia — o valor oficial é calculado e gravado pelo banco.
// showCommission: false para o gerente que vê só quantidades.
export default function SaleDialog({
  car,
  sellers,
  customers,
  onCustomerCreated,
  initialSale,
  showCommission = true,
  onConfirm,
  onClose,
  saving,
}) {
  const activeSellers = sellers.filter((s) => s.active || s.id === initialSale?.sellerId)
  const [sellerId, setSellerId] = useState(initialSale?.sellerId || '')
  const [customerId, setCustomerId] = useState(car.customerId || '')
  const [price, setPrice] = useState(
    String(initialSale?.salePrice ?? car.price ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  )
  const [date, setDate] = useState(() => {
    if (initialSale?.saleDate) return initialSale.saleDate
    if (car.status === 'vendido' && car.soldAt) {
      const d = new Date(car.soldAt)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    return todayISO()
  })
  const [error, setError] = useState('')

  const seller = activeSellers.find((s) => s.id === sellerId)
  const priceValue = parseIntBR(price)
  let commissionPreview = null
  if (seller && priceValue) {
    if (seller.commissionType === 'percent') commissionPreview = Math.round(priceValue * seller.commissionValue) / 100
    else if (seller.commissionType === 'fixed') commissionPreview = seller.commissionValue
    else commissionPreview = 0
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!priceValue) {
      setError('Informe o valor final da venda.')
      return
    }
    if (!date) {
      setError('Informe uma data válida (dd/mm/aaaa).')
      return
    }
    onConfirm({ sellerId: sellerId || null, customerId: customerId || null, salePrice: priceValue, saleDate: date })
  }

  return (
    <div className="confirm-dialog-overlay" onClick={saving ? undefined : onClose}>
      <form className="confirm-dialog admin-form sale-dialog" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <button type="button" className="confirm-dialog-close" onClick={onClose} aria-label="Fechar" disabled={saving}>
          <X size={18} />
        </button>
        <h2>Registrar venda</h2>
        <p>{car.brand} {car.model} {car.version}</p>

        <label>
          Vendedor
          <select value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
            <option value="">Sem vendedor (venda direta da loja)</option>
            {activeSellers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.role === 'manager' ? ' (gerente)' : ''}{s.deletedAt ? ' (excluído)' : ''}</option>
            ))}
          </select>
        </label>
        {sellers.every((s) => s.deletedAt) && (
          <span className="sale-dialog-note">Ninguém cadastrado na equipe ainda — cadastre na aba Equipe.</span>
        )}

        <CustomerPicker
          customers={customers}
          value={customerId}
          onChange={setCustomerId}
          onCreated={onCustomerCreated}
          disabled={saving}
        />

        <label>
          Valor final da venda (R$)
          <input
            type="text"
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Ex: 95.000"
            required
          />
        </label>

        <label>
          Data da venda
          <DateInputBR value={date} onChange={setDate} required />
        </label>

        {seller && showCommission && (
          <div className="sale-dialog-commission">
            <span>Comissão ({describeCommission(seller)})</span>
            <strong>{commissionPreview != null ? formatCurrencyCents(commissionPreview) : '—'}</strong>
          </div>
        )}

        {error && <p className="admin-error">{error}</p>}

        <div className="confirm-dialog-actions">
          <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
            {saving ? 'Salvando…' : 'Confirmar venda'}
          </button>
          <button type="button" className="btn btn-outline btn-block" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
