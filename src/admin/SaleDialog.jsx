import { useState } from 'react'
import { X } from 'lucide-react'
import DateInputBR from '../components/DateInputBR.jsx'
import { formatCurrencyCents, parseIntBR, todayISO } from '../utils/carFormat.js'
import { describeCommission } from '../lib/sellersApi.js'
import { checklistSummary } from '../utils/saleChecklist.js'
import { deliveryChecklistFromIntake } from '../utils/carChecklists.js'
import { parseMoneyBR } from '../utils/financing.js'
import CustomerPicker from './CustomerPicker.jsx'
import SaleChecklist from './SaleChecklist.jsx'
import PaymentFields, { paymentFromSale } from './PaymentFields.jsx'
import TradeInFields, { EMPTY_TRADE_IN } from './TradeInFields.jsx'
import useConfirm from '../components/useConfirm.jsx'
import { MoneyInput } from '../components/NumberInputs.jsx'
import { parseAnoModelo } from '../utils/anoModelo.js'
import '../components/ConfirmDialog.css'

// Janela aberta ao marcar um carro como "Vendido": vendedor, cliente
// comprador (opcional), valor final negociado, data, forma de pagamento,
// carro recebido na troca e o checklist de itens entregues (já preenchido com
// o que veio com o carro no cadastro). A comissão mostrada é só uma prévia —
// o valor oficial é calculado e gravado pelo banco.
// showCommission: false para o gerente que vê só quantidades.
// checklistItems: itens do checklist da loja (companies.sale_checklist).
// banks: lista de bancos da loja. lockedSeller: o vendedor registrando a
// própria venda (o campo vendedor fica fixo nele).
export default function SaleDialog({
  car,
  sellers,
  customers,
  onCustomerCreated,
  initialSale,
  checklistItems = [],
  banks = [],
  lockedSeller = null,
  showCommission = true,
  onConfirm,
  onClose,
  saving,
}) {
  const { confirm, confirmDialog } = useConfirm()
  const activeSellers = lockedSeller
    ? [lockedSeller]
    : sellers.filter((s) => s.active || s.id === initialSale?.sellerId)
  const [sellerId, setSellerId] = useState(lockedSeller?.id || initialSale?.sellerId || '')
  const [payment, setPayment] = useState(() => paymentFromSale(initialSale))
  const [tradeIn, setTradeIn] = useState(EMPTY_TRADE_IN)
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
  const [checklist, setChecklist] = useState(() => deliveryChecklistFromIntake(checklistItems, car.intakeItems, initialSale?.checklist || []))
  const [generateTerm, setGenerateTerm] = useState(false)
  const [error, setError] = useState('')

  const seller = activeSellers.find((s) => s.id === sellerId)
  const priceValue = parseIntBR(price)
  let commissionPreview = null
  if (seller && priceValue) {
    if (seller.commissionType === 'percent') commissionPreview = Math.round(priceValue * seller.commissionValue) / 100
    else if (seller.commissionType === 'fixed') commissionPreview = seller.commissionValue
    else commissionPreview = 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!priceValue) {
      setError('Informe o valor final da venda.')
      return
    }
    if (!date) {
      setError('Informe uma data válida (dd/mm/aaaa).')
      return
    }
    let tradeInData = null
    if (tradeIn.enabled) {
      const anoModelo = parseAnoModelo(tradeIn.modelYear)
      if (!tradeIn.brand.trim() || !tradeIn.model.trim() || anoModelo.empty) {
        setError('Carro da troca: informe pelo menos marca, modelo e ano/modelo.')
        return
      }
      if (!anoModelo.ok) {
        setError(`Carro da troca: ${anoModelo.error}`)
        return
      }
      tradeInData = {
        brand: tradeIn.brand.trim(),
        model: tradeIn.model.trim(),
        version: tradeIn.version.trim(),
        year: anoModelo.year,
        modelYear: anoModelo.modelYear,
        km: parseIntBR(tradeIn.km) ?? 0,
        color: tradeIn.color.trim(),
        plate: tradeIn.plate.trim(),
        value: parseIntBR(tradeIn.value),
        date,
      }
    }
    // Checklist opcional: incompleto só pede confirmação
    const { pending } = checklistSummary(checklist)
    if (pending > 0) {
      const ok = await confirm(
        `${pending} ${pending === 1 ? 'item do checklist ficou' : 'itens do checklist ficaram'} sem conferir. Finalizar mesmo assim?`,
        { title: 'Checklist incompleto', confirmLabel: 'Finalizar mesmo assim', cancelLabel: 'Voltar e conferir' }
      )
      if (!ok) return
    }
    onConfirm({
      sellerId: sellerId || null,
      customerId: customerId || null,
      salePrice: priceValue,
      saleDate: date,
      checklist,
      generateTerm,
      payment: {
        method: payment.method,
        bank: payment.bank.trim(),
        downPayment: payment.method === 'financiado' ? parseMoneyBR(payment.downPayment) : null,
        financedAmount: payment.method === 'financiado' ? parseMoneyBR(payment.financedAmount) : null,
      },
      tradeIn: tradeInData,
    })
  }

  return (
    <>
      <div className="confirm-dialog-overlay" onClick={saving ? undefined : onClose}>
        <form className="confirm-dialog admin-form sale-dialog" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
          <button type="button" className="confirm-dialog-close" onClick={onClose} aria-label="Fechar" disabled={saving}>
            <X size={18} />
          </button>
          <h2>{initialSale ? 'Venda' : 'Registrar venda'}</h2>
          <p>{car.brand} {car.model} {car.version}{car.plate ? ` · ${car.plate.toUpperCase()}` : ''}</p>

          <label>
            Vendedor
            <select value={sellerId} onChange={(e) => setSellerId(e.target.value)} disabled={Boolean(lockedSeller)}>
              {!lockedSeller && <option value="">Sem vendedor (venda direta da loja)</option>}
              {activeSellers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.role === 'manager' ? ' (gerente)' : ''}{s.deletedAt ? ' (excluído)' : ''}</option>
              ))}
            </select>
          </label>
          {!lockedSeller && sellers.every((s) => s.deletedAt) && (
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
            Valor final da venda
            <MoneyInput
              value={price}
              onChange={(v) => setPrice(v)}
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

          <div className="sale-dialog-section">
            <span className="admin-field-label">Pagamento</span>
            <PaymentFields value={payment} onChange={setPayment} banks={banks} disabled={saving} />
          </div>

          {!initialSale && (
            <div className="sale-dialog-section">
              <TradeInFields value={tradeIn} onChange={setTradeIn} disabled={saving} />
            </div>
          )}

          <div className="sale-dialog-section">
            <span className="admin-field-label">Checklist de entrega</span>
            <SaleChecklist value={checklist} onChange={setChecklist} disabled={saving} />
          </div>

          <label className="admin-checkbox">
            <input type="checkbox" checked={generateTerm} onChange={(e) => setGenerateTerm(e.target.checked)} disabled={saving} />
            Baixar o termo de entrega (PDF) para o comprador assinar
          </label>

          {error && <p className="admin-error">{error}</p>}

          <div className="confirm-dialog-actions">
            <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
              {saving ? 'Salvando…' : initialSale ? 'Salvar venda' : 'Confirmar venda'}
            </button>
            <button type="button" className="btn btn-outline btn-block" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
      {confirmDialog}
    </>
  )
}
