import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { createFinancing, editFinancing } from '../lib/financingApi.js'
import { addDaysISO, formatCurrencyCents, formatDateBR, todayISO } from '../utils/carFormat.js'
import { formatMoneyInput, parseMoneyBR, parsePercentBR, priceInstallment, round2 } from '../utils/financing.js'
import DateInputBR from '../components/DateInputBR.jsx'
import CustomerPicker from './CustomerPicker.jsx'
import { MoneyInput } from '../components/NumberInputs.jsx'
import '../components/ConfirmDialog.css'

function carLabel(car) {
  return `${car.brand} ${car.model} ${car.version}`.trim()
}

const percentText = (value) => (value === null || value === undefined ? '' : String(value).replace('.', ','))

// Novo financiamento próprio (carnê da loja) ou, com `financing`, a edição de um
// que já existe (seção 97: muda tudo depois de criado). O valor financiado e o valor
// da parcela são calculados sozinhos (Tabela Price, se tiver juros) até a pessoa
// digitar um valor diferente; na edição começam com os valores gravados.
// soldCars: carros vendidos; salesByCar: valor negociado de cada venda.
// financedCarIds: carros que já têm financiamento ativo (aviso na lista).
export default function FinancingFormDialog({ financing, soldCars, salesByCar, financedCarIds, customers, onCustomerCreated, defaults, onSaved, onClose }) {
  const editing = Boolean(financing)
  const [carId, setCarId] = useState(financing?.carId || '')
  const [vehicleLabel, setVehicleLabel] = useState(financing?.vehicleLabel || '')
  const [vehiclePlate, setVehiclePlate] = useState(financing?.vehiclePlate || '')
  const [customerId, setCustomerId] = useState(financing?.customerId || '')
  const [vehiclePrice, setVehiclePrice] = useState(() => formatMoneyInput(financing?.vehiclePrice || ''))
  const [downPayment, setDownPayment] = useState(() => formatMoneyInput(financing?.downPayment || ''))
  const [financedInput, setFinancedInput] = useState(() => formatMoneyInput(financing?.financedAmount ?? ''))
  const [financedTouched, setFinancedTouched] = useState(editing)
  const [count, setCount] = useState(String(financing?.installmentsCount ?? 12))
  const [rate, setRate] = useState(percentText(financing?.interestRate))
  const [installmentInput, setInstallmentInput] = useState(() => formatMoneyInput(financing?.installmentAmount ?? ''))
  const [installmentTouched, setInstallmentTouched] = useState(editing)
  const [firstDue, setFirstDue] = useState(() => financing?.firstDueDate || addDaysISO(todayISO(), 30))
  const [lateFee, setLateFee] = useState(percentText(editing ? financing.lateFeePercent : defaults.lateFeePercent))
  const [lateInterest, setLateInterest] = useState(percentText(editing ? financing.lateInterestPercent : defaults.lateInterestPercent))
  const [notes, setNotes] = useState(financing?.notes || '')
  const [status, setStatus] = useState(financing?.status || 'ativo')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const priceValue = parseMoneyBR(vehiclePrice) || 0
  const downValue = parseMoneyBR(downPayment) || 0
  const financed = financedTouched ? parseMoneyBR(financedInput) || 0 : round2(Math.max(0, priceValue - downValue))
  const countValue = Number.parseInt(count, 10) || 0
  const rateValue = parsePercentBR(rate)
  const suggestedInstallment = priceInstallment(financed, countValue, rateValue)
  const installment = installmentTouched ? parseMoneyBR(installmentInput) || 0 : suggestedInstallment

  // Edição: parcelas já pagas (ficam como estão) e se as em aberto serão refeitas
  const paid = editing ? financing.installments.filter((i) => i.paidOn) : []
  const lastPaid = paid.reduce((max, i) => Math.max(max, i.number), 0)
  const scheduleChanged =
    editing &&
    (countValue !== financing.installmentsCount || round2(installment) !== round2(financing.installmentAmount) || firstDue !== financing.firstDueDate)
  const paidText = paid.length === 0 ? '' : paid.length === 1 ? 'A parcela paga fica como está. ' : `As ${paid.length} parcelas pagas ficam como estão. `

  const preview = useMemo(() => {
    if (!financed || !countValue || !installment) return null
    const totalInstallments = round2(installment * countValue)
    return { totalInstallments, total: round2(downValue + totalInstallments), interest: round2(totalInstallments - financed) }
  }, [financed, countValue, installment, downValue])

  function selectCar(id) {
    setCarId(id)
    const car = soldCars.find((c) => c.id === id)
    if (!car) return
    setVehicleLabel(carLabel(car))
    setVehiclePlate(car.plate ? car.plate.toUpperCase() : '')
    const salePrice = salesByCar[car.id]?.salePrice ?? car.price
    if (salePrice) setVehiclePrice(formatMoneyInput(salePrice))
    if (car.customerId) setCustomerId(car.customerId)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const customer = customers.find((c) => c.id === customerId)
    // Financiamento antigo cujo cliente saiu do cadastro: continua com o nome gravado
    const keepsOldName = editing && !customerId && Boolean(financing.customerName)
    if (!customer && !keepsOldName) return setError('Escolha o cliente (ou cadastre um novo).')
    if (!financed || financed <= 0) return setError('Informe o valor financiado.')
    if (countValue < 1 || countValue > 240) return setError('Informe o número de parcelas (de 1 a 240).')
    if (countValue < lastPaid) {
      return setError(`A parcela ${lastPaid} já foi paga: o financiamento precisa ter pelo menos ${lastPaid} parcelas. Para diminuir, desfaça o pagamento dela.`)
    }
    if (!installment || installment <= 0) return setError('Informe o valor da parcela.')
    if (!firstDue) return setError('Informe o vencimento da primeira parcela (dd/mm/aaaa).')
    const lateFeeValue = parsePercentBR(lateFee) ?? 0
    const lateInterestValue = parsePercentBR(lateInterest) ?? 0
    if (lateFeeValue < 0 || lateFeeValue > 100 || lateInterestValue < 0 || lateInterestValue > 100) {
      return setError('Multa e juros por atraso devem ficar entre 0 e 100%.')
    }
    setSaving(true)
    setError('')
    const data = {
      customerId: customer ? customer.id : null,
      carId: carId || null,
      customerName: customer ? customer.name : financing.customerName,
      vehicleLabel: vehicleLabel.trim(),
      vehiclePlate: vehiclePlate.trim(),
      vehiclePrice: priceValue,
      downPayment: downValue,
      financedAmount: financed,
      installmentsCount: countValue,
      installmentAmount: installment,
      interestRate: rateValue,
      firstDueDate: firstDue,
      lateFeePercent: lateFeeValue,
      lateInterestPercent: lateInterestValue,
      notes,
      status,
    }
    try {
      onSaved(editing ? await editFinancing(financing.id, data) : await createFinancing(data))
    } catch (err) {
      setError(`Não foi possível ${editing ? 'salvar' : 'criar o financiamento'}: ${err.message}`)
      setSaving(false)
    }
  }

  return (
    <div className="confirm-dialog-overlay" onClick={saving ? undefined : onClose}>
      <form className="confirm-dialog admin-dialog-wide admin-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit} noValidate>
        <button type="button" className="confirm-dialog-close" onClick={onClose} aria-label="Fechar" disabled={saving}>
          <X size={18} />
        </button>
        <div>
          <h2>{editing ? 'Editar financiamento' : 'Novo financiamento'}</h2>
          <p className="admin-table-sub">
            {editing
              ? 'Corrija o que for preciso. As parcelas já pagas não mudam.'
              : 'Venda parcelada direto com a loja. As parcelas são geradas com vencimento mensal.'}
          </p>
        </div>

        {editing && (
          <label>
            Situação
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="ativo">Ativo</option>
              <option value="cancelado">Cancelado (venda desfeita, carro devolvido etc.)</option>
            </select>
          </label>
        )}

        <div className="admin-form-grid">
          <label>
            Carro vendido (opcional)
            <select value={carId} onChange={(e) => selectCar(e.target.value)}>
              <option value="">— Escolher —</option>
              {soldCars.map((car) => (
                <option key={car.id} value={car.id}>
                  {car.brand} {car.model}{car.plate ? ` · ${car.plate.toUpperCase()}` : ''}
                  {financedCarIds.has(car.id) && car.id !== financing?.carId ? ' (já tem financiamento)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Veículo (descrição)
            <input value={vehicleLabel} onChange={(e) => setVehicleLabel(e.target.value)} placeholder="Ex.: Fiat Toro Freedom 2.0" />
          </label>
          <label>
            Placa
            <input value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())} placeholder="ABC1D23" />
          </label>
        </div>

        {carId && carId !== financing?.carId && financedCarIds.has(carId) && (
          <p className="admin-error">Este carro já tem um financiamento ativo. Confira em Financeiro dos clientes antes de criar outro.</p>
        )}

        <CustomerPicker
          customers={customers}
          value={customerId}
          onChange={setCustomerId}
          onCreated={onCustomerCreated}
          disabled={saving}
          label="Cliente"
        />

        <div className="admin-form-grid">
          <label>
            Valor do veículo
            <MoneyInput cents value={vehiclePrice} onChange={(v) => setVehiclePrice(v)} placeholder="Ex: 80.000,00" />
          </label>
          <label>
            Entrada — opcional
            <MoneyInput cents value={downPayment} onChange={(v) => setDownPayment(v)} placeholder="0,00" />
          </label>
          <label>
            Valor financiado
            <MoneyInput
              cents
              value={financedTouched ? financedInput : formatMoneyInput(financed || '')}
              onChange={(v) => {
                setFinancedTouched(true)
                setFinancedInput(v)
              }}
              placeholder="Valor do veículo menos a entrada"
              required
            />
          </label>
          <label>
            Número de parcelas
            <input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, '').slice(0, 3))} required />
          </label>
          <label>
            Juros do financiamento (% ao mês)
            <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Em branco = sem juros" />
          </label>
          <label>
            Valor da parcela
            <MoneyInput
              cents
              value={installmentTouched ? installmentInput : formatMoneyInput(suggestedInstallment || '')}
              onChange={(v) => {
                setInstallmentTouched(true)
                setInstallmentInput(v)
              }}
              required
            />
          </label>
          <label>
            Vencimento da 1ª parcela
            <DateInputBR value={firstDue} onChange={setFirstDue} required />
          </label>
        </div>
        {(financedTouched || installmentTouched) && (
          <button
            type="button"
            className="customer-picker-add"
            onClick={() => {
              setFinancedTouched(false)
              setInstallmentTouched(false)
            }}
          >
            Voltar a calcular sozinho o valor financiado e a parcela
          </button>
        )}

        {preview && (
          <div className="financing-preview">
            <span>
              {countValue}x de <strong>{formatCurrencyCents(installment)}</strong>
            </span>
            <span>
              Total a prazo (entrada + parcelas): <strong>{formatCurrencyCents(preview.total)}</strong>
            </span>
            <span>
              Juros no total: <strong>{formatCurrencyCents(Math.max(0, preview.interest))}</strong>
            </span>
          </div>
        )}

        {scheduleChanged && firstDue && countValue > 0 && installment > 0 && (
          <p className="financing-redo-note">
            {paidText}
            {paid.length > 0 ? 'As em aberto serão refeitas' : 'As parcelas serão refeitas'} com {formatCurrencyCents(installment)} cada, vencendo todo
            mês a partir de {formatDateBR(firstDue)} ({countValue} parcelas no total). Ajustes feitos parcela a parcela nas em aberto se perdem.
          </p>
        )}

        <div className="admin-form-grid">
          <label>
            Multa por atraso (%)
            <input inputMode="decimal" value={lateFee} onChange={(e) => setLateFee(e.target.value)} />
          </label>
          <label>
            Juros por atraso (% ao mês)
            <input inputMode="decimal" value={lateInterest} onChange={(e) => setLateInterest(e.target.value)} />
          </label>
        </div>
        <p className="admin-form-note">
          Parcela paga depois do vencimento: multa cobrada uma vez + juros proporcionais aos dias de atraso. Na venda ao consumidor, o
          Código de Defesa do Consumidor limita a multa a 2%.
        </p>

        <label>
          Observações
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: pagamento por boleto, dia 10 de cada mês" />
        </label>

        {error && <p className="admin-error">{error}</p>}

        <div className="admin-form-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? (editing ? 'Salvando…' : 'Criando…') : editing ? 'Salvar alterações' : 'Criar financiamento'}
          </button>
        </div>
      </form>
    </div>
  )
}
