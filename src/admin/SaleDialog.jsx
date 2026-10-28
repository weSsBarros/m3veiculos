import { useEffect, useState } from 'react'
import { BadgePercent, X } from 'lucide-react'
import DateInputBR from '../components/DateInputBR.jsx'
import { formatCurrency, formatCurrencyCents, formatDateBR, parseIntBR, todayISO } from '../utils/carFormat.js'
import { discountError, discountPercent, discountToCloseGap, finalSalePrice, percentText, priceBeforeDiscount } from '../utils/saleDiscount.js'
import { describeCommission } from '../lib/sellersApi.js'
import { fetchCommissionTiers, tierCommission, fetchCommissionBands } from '../lib/commissionTiersApi.js'
import { bandFor, bandCommission, bandRangeLabel } from '../utils/commissionBands.js'
import { checklistSummary } from '../utils/saleChecklist.js'
import { deliveryChecklistFromIntake } from '../utils/carChecklists.js'
import CustomerPicker from './CustomerPicker.jsx'
import SaleChecklist from './SaleChecklist.jsx'
import PaymentFields, { paymentFromSale } from './PaymentFields.jsx'
import TradeInFields, { EMPTY_TRADE_IN } from './TradeInFields.jsx'
import useConfirm from '../components/useConfirm.jsx'
import { MoneyInput } from '../components/NumberInputs.jsx'
import { parseAnoModelo } from '../utils/anoModelo.js'
import { salePayment } from '../utils/salePayments.js'
import { bankIncomeForm, bankIncomeFromForm, saleBankFinanced } from '../utils/bankIncome.js'
import BankIncomeFields from './BankIncomeFields.jsx'
import '../components/ConfirmDialog.css'

const thousands = (value) => String(value ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')

// Janela aberta ao marcar um carro como "Vendido": vendedor, cliente
// comprador (opcional), valor da venda e desconto (seção 87: o valor final é o
// que fica gravado e vale para comissão e contrato), data, forma de pagamento,
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
    thousands(initialSale ? priceBeforeDiscount(initialSale) : car.price ?? '')
  )
  // Desconto (seção 87): quem registra a venda dá; o valor final é o que fica gravado
  const [discountOpen, setDiscountOpen] = useState(Boolean(initialSale?.discount))
  const [discount, setDiscount] = useState(initialSale?.discount ? thousands(initialSale.discount) : '')
  const [date, setDate] = useState(() => {
    if (initialSale?.saleDate) return initialSale.saleDate
    if (car.status === 'vendido' && car.soldAt) {
      const d = new Date(car.soldAt)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    return todayISO()
  })
  const [checklist, setChecklist] = useState(() => deliveryChecklistFromIntake(checklistItems, car.intakeItems, initialSale?.checklist || []))
  // Retorno e plus do banco (seção 97): na parte "Financiamento bancário", só para quem
  // vê os valores da venda (o vendedor não informa; o banco também confere)
  const [bankIncome, setBankIncome] = useState(() => bankIncomeForm(initialSale))
  const [generateTerm, setGenerateTerm] = useState(false)
  const [error, setError] = useState('')
  // Faixas de comissão: prévia de quem recebe "Pela faixa do carro" (seção 78) ou
  // "Pela faixa de valor" (seção 82; o banco calcula de novo ao salvar)
  const [tiers, setTiers] = useState([])
  const [bands, setBands] = useState([])

  useEffect(() => {
    if (!showCommission) return
    fetchCommissionTiers().then(setTiers).catch(() => {})
    fetchCommissionBands().then(setBands).catch(() => {})
  }, [showCommission])

  const seller = activeSellers.find((s) => s.id === sellerId)
  const paymentNow = salePayment(payment)
  const hasBankFinancing = paymentNow.parts.some((p) => p.method === 'financiamento')
  const bankFinanced = saleBankFinanced({ payments: paymentNow.parts })
  const canSetBankIncome = showCommission && !lockedSeller
  const listValue = parseIntBR(price)
  const discountValue = discountOpen ? parseIntBR(discount) || 0 : 0
  // Valor final (com o desconto): comissão, pagamentos e o que fica gravado
  const priceValue = listValue ? finalSalePrice(listValue, discountValue) : listValue
  const discountProblem = discountError(listValue, discountValue)
  let commissionPreview = null
  if (seller && priceValue) {
    if (seller.commissionType === 'percent') commissionPreview = Math.round(priceValue * seller.commissionValue) / 100
    else if (seller.commissionType === 'fixed') commissionPreview = seller.commissionValue
    else if (seller.commissionType === 'tier') commissionPreview = tierCommission(tiers, car.commissionTierId)
    else if (seller.commissionType === 'price_band') commissionPreview = bandCommission(bands, priceValue)
    else commissionPreview = 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!listValue) {
      setError('Informe o valor da venda.')
      return
    }
    if (discountProblem) {
      setError(discountProblem)
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
    // Sem parte financiada no banco, o retorno e o plus saem da venda
    let bankIncomeData
    if (canSetBankIncome) {
      if (hasBankFinancing) {
        const resolved = bankIncomeFromForm(bankIncome, bankFinanced)
        if (resolved.error) {
          setError(resolved.error)
          return
        }
        bankIncomeData = resolved.value
      } else {
        bankIncomeData = { storeReturn: null, returnPercent: null, rateTable: '', storePlus: null, plusPercent: null, plusReceivedOn: null }
      }
    }
    onConfirm({
      sellerId: sellerId || null,
      customerId: customerId || null,
      salePrice: priceValue,
      discount: discountValue,
      saleDate: date,
      checklist,
      generateTerm,
      payment: paymentNow,
      tradeIn: tradeInData,
      ...(bankIncomeData !== undefined ? { bankIncome: bankIncomeData } : {}),
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
            Valor da venda
            <MoneyInput
              value={price}
              onChange={(v) => setPrice(v)}
              placeholder="Ex: 95.000"
              required
            />
          </label>

          {discountOpen ? (
            <div className="sale-discount">
              <div className="sale-discount-row">
                <label>
                  Desconto
                  <MoneyInput value={discount} onChange={setDiscount} placeholder="Ex: 2.000" disabled={saving} />
                </label>
                <button
                  type="button"
                  className="admin-link-btn"
                  onClick={() => {
                    setDiscountOpen(false)
                    setDiscount('')
                  }}
                  disabled={saving}
                >
                  Tirar o desconto
                </button>
              </div>
              {discountProblem ? (
                <span className="sale-discount-error">{discountProblem}</span>
              ) : (
                <p className="sale-discount-final">
                  Valor final <strong>{listValue ? formatCurrency(priceValue) : '—'}</strong>
                  {discountValue > 0 && listValue ? <span> · {percentText(discountPercent(listValue, discountValue))} de desconto</span> : null}
                </p>
              )}
              {initialSale?.discount > 0 && initialSale.discountByName && discountValue === initialSale.discount && (
                <span className="sale-dialog-note sale-discount-who">
                  Desconto dado por {initialSale.discountByName}
                  {initialSale.discountAt ? ` em ${formatDateBR(initialSale.discountAt.slice(0, 10))}` : ''}.
                </span>
              )}
            </div>
          ) : (
            <button type="button" className="admin-link-btn sale-discount-add" onClick={() => setDiscountOpen(true)} disabled={saving}>
              <BadgePercent size={15} aria-hidden="true" /> Dar desconto
            </button>
          )}

          <label>
            Data da venda
            <DateInputBR value={date} onChange={setDate} required />
          </label>

          {seller && showCommission && (
            <div className="sale-dialog-commission">
              <span>
                Comissão ({describeCommission(seller)}
                {seller.commissionType === 'tier' && car.commissionTierId ? `: ${tiers.find((t) => t.id === car.commissionTierId)?.name || ''}` : ''}
                {seller.commissionType === 'price_band' && priceValue && bandFor(bands, priceValue) ? `: ${bandRangeLabel(bands, bandFor(bands, priceValue))}` : ''})
              </span>
              <strong>{commissionPreview != null ? formatCurrencyCents(commissionPreview) : '—'}</strong>
            </div>
          )}
          {seller && showCommission && seller.commissionType === 'tier' && !car.commissionTierId && (
            <span className="sale-dialog-note">Este carro está sem faixa de comissão: escolha a faixa no cadastro do carro antes de salvar a venda.</span>
          )}
          {seller && showCommission && seller.commissionType === 'price_band' && priceValue > 0 && !bandFor(bands, priceValue) && (
            <span className="sale-dialog-note">Nenhuma faixa de valor cobre esta venda: a comissão fica zerada (o admin cadastra as faixas na Equipe).</span>
          )}

          <div className="sale-dialog-section">
            <span className="admin-field-label">Pagamento</span>
            <PaymentFields
              value={payment}
              onChange={setPayment}
              banks={banks}
              disabled={saving}
              salePrice={priceValue}
              tradeInValue={tradeIn.enabled ? parseIntBR(tradeIn.value) || 0 : initialSale?.tradeInValue || 0}
              onCloseGap={(gap) => {
                setDiscountOpen(true)
                setDiscount(thousands(discountValue + discountToCloseGap(gap)))
              }}
            />
          </div>

          {canSetBankIncome && hasBankFinancing && (
            <div className="sale-dialog-section">
              <BankIncomeFields value={bankIncome} onChange={setBankIncome} financed={bankFinanced} disabled={saving} />
            </div>
          )}

          {/* Troca: na venda nova e também ao editar uma venda sem troca (o lojista
              esqueceu de lançar o carro que entrou como parte do pagamento) */}
          {initialSale?.tradeInCarId ? (
            <div className="sale-dialog-section">
              <span className="admin-field-label">Carro da troca</span>
              <p className="sale-dialog-note">
                Esta venda já tem um carro recebido na troca
                {showCommission && initialSale.tradeInValue != null ? `, por ${formatCurrencyCents(initialSale.tradeInValue)}` : ''}. Ele está no estoque.
              </p>
            </div>
          ) : (
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
