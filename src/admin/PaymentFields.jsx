import { SALE_PAYMENT_METHODS } from '../utils/payment.js'
import BankSelect from './BankSelect.jsx'
import { MoneyInput } from '../components/NumberInputs.jsx'

export const EMPTY_PAYMENT = { method: '', bank: '', downPayment: '', financedAmount: '' }

// Pagamento da venda a partir do que está gravado nela
export function paymentFromSale(sale) {
  if (!sale) return EMPTY_PAYMENT
  const money = (v) => (v != null ? String(v).replace('.', ',') : '')
  return {
    method: sale.paymentMethod || '',
    bank: sale.bank || '',
    downPayment: money(sale.downPayment),
    financedAmount: money(sale.financedAmount),
  }
}

// Forma de pagamento da venda. Financiado pelo banco: escolhe o banco da
// lista da loja (ou digita outro), com entrada e valor financiado opcionais.
export default function PaymentFields({ value, onChange, banks = [], disabled }) {
  function update(field, val) {
    onChange({ ...value, [field]: val })
  }

  const financed = value.method === 'financiado'

  return (
    <div className="payment-fields">
      <label>
        Forma de pagamento (opcional)
        <select value={value.method} onChange={(e) => update('method', e.target.value)} disabled={disabled}>
          <option value="">Não informar</option>
          {SALE_PAYMENT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </label>
      {financed && (
        <>
          <BankSelect value={value.bank} onChange={(bank) => update('bank', bank)} banks={banks} disabled={disabled} />
          <label>
            Entrada — opcional
            <MoneyInput cents value={value.downPayment} onChange={(v) => update('downPayment', v)} placeholder="0,00" disabled={disabled} />
          </label>
          <label>
            Valor financiado — opcional
            <MoneyInput cents value={value.financedAmount} onChange={(v) => update('financedAmount', v)} placeholder="0,00" disabled={disabled} />
          </label>
        </>
      )}
    </div>
  )
}
