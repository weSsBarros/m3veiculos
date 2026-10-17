import { Plus, X } from 'lucide-react'
import { PAYMENT_PART_METHODS, EMPTY_PART, partMethod, partsFromSale, normalizeParts, paymentGap } from '../utils/salePayments.js'
import { parseMoneyBR } from '../utils/financing.js'
import BankSelect from './BankSelect.jsx'
import { MoneyInput } from '../components/NumberInputs.jsx'

export const EMPTY_PAYMENT = [{ ...EMPTY_PART }]

// Pagamento da venda a partir do que está gravado nela (vendas antigas, com uma
// forma só, viram uma ou duas partes)
export function paymentFromSale(sale) {
  return partsFromSale(sale)
}

const money = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Formas de pagamento da venda (14/10/2026: mais de uma por venda). Cada parte
// tem a forma, o valor e, quando faz sentido, o banco e as parcelas. Embaixo,
// quanto falta ou sobra para fechar o valor da venda (contando o carro da troca):
// só avisa, salva do mesmo jeito (decisão do Wesley).
// allowTradeIn: mostra "Veículo usado na troca" como forma (na tela Contratos;
// na venda o carro da troca tem a seção própria).
// onCloseGap(falta): na janela da venda, botão "Dar desconto" quando os pagamentos
// não fecham o valor (o cliente pagou à vista e ganhou desconto, por exemplo).
export default function PaymentFields({ value, onChange, banks = [], disabled, salePrice = null, tradeInValue = 0, allowTradeIn = false, onCloseGap = null }) {
  const parts = Array.isArray(value) && value.length ? value : EMPTY_PAYMENT
  const methods = PAYMENT_PART_METHODS.filter((m) => allowTradeIn || !m.tradeIn)

  function update(index, field, val) {
    onChange(parts.map((p, i) => (i === index ? { ...p, [field]: val } : p)))
  }

  function add() {
    onChange([...parts, { ...EMPTY_PART, method: parts.some((p) => p.method === 'financiamento') ? 'credito' : 'financiamento' }])
  }

  function remove(index) {
    const next = parts.filter((_, i) => i !== index)
    onChange(next.length ? next : [{ ...EMPTY_PART }])
  }

  const gap = paymentGap(salePrice, normalizeParts(parts, parseMoneyBR), tradeInValue)

  return (
    <div className="payment-fields">
      {parts.map((p, index) => {
        const meta = partMethod(p.method)
        return (
          <div className="payment-part" key={index}>
            <div className="admin-form-grid payment-part-grid">
              <label>
                {parts.length > 1 ? `Forma ${index + 1}` : 'Forma de pagamento (opcional)'}
                <select value={p.method} onChange={(e) => update(index, 'method', e.target.value)} disabled={disabled}>
                  <option value="">Não informar</option>
                  {methods.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </label>
              {p.method && (
                <label>
                  {meta.tradeIn ? 'Valor do veículo na troca' : 'Valor (opcional)'}
                  <MoneyInput cents value={p.amount} onChange={(v) => update(index, 'amount', v)} placeholder="0,00" disabled={disabled} />
                </label>
              )}
              {meta.bank && (
                <BankSelect
                  value={p.bank}
                  onChange={(bank) => update(index, 'bank', bank)}
                  banks={banks}
                  disabled={disabled}
                  label={p.method === 'consorcio' ? 'Administradora (opcional)' : 'Banco (opcional)'}
                />
              )}
              {meta.installments && (
                <label>
                  Parcelas (opcional)
                  <input inputMode="numeric" value={p.installments} onChange={(e) => update(index, 'installments', e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="Ex: 48" disabled={disabled} />
                </label>
              )}
              {(meta.tradeIn || p.method === 'outro') && (
                <label>
                  {meta.tradeIn ? 'Veículo (marca, modelo, ano e placa)' : 'Como foi pago'}
                  <input value={p.note} maxLength={160} onChange={(e) => update(index, 'note', e.target.value)} disabled={disabled} />
                </label>
              )}
            </div>
            {parts.length > 1 && (
              <button type="button" className="payment-part-remove" onClick={() => remove(index)} disabled={disabled} aria-label={`Tirar a forma ${index + 1}`}>
                <X size={15} />
              </button>
            )}
          </div>
        )
      })}
      <div className="payment-fields-foot">
        <button type="button" className="btn btn-outline" onClick={add} disabled={disabled || parts.length >= 12}>
          <Plus size={14} /> Adicionar outra forma de pagamento
        </button>
        {gap != null && (
          <span className={`payment-gap ${gap === 0 ? 'is-ok' : 'is-warn'}`}>
            {gap === 0
              ? 'Os pagamentos fecham o valor da venda.'
              : gap > 0
                ? `Falta ${money(gap)} para fechar o valor da venda.`
                : `Os pagamentos passam ${money(-gap)} do valor da venda.`}
            {tradeInValue ? ` (Conta o carro da troca: ${money(tradeInValue)}.)` : ''}
          </span>
        )}
        {onCloseGap && gap > 0 && (
          <button type="button" className="admin-link-btn payment-gap-discount" onClick={() => onCloseGap(gap)} disabled={disabled}>
            Dar desconto e fechar com o que foi pago
          </button>
        )}
      </div>
    </div>
  )
}
