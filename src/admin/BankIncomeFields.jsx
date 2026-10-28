import { MoneyInput } from '../components/NumberInputs.jsx'
import DateInputBR from '../components/DateInputBR.jsx'
import { resolveBankAmount } from '../utils/bankIncome.js'
import { formatCurrencyCents } from '../utils/carFormat.js'

const MODES = [
  { value: 'percent', label: '%' },
  { value: 'valor', label: 'R$' },
]

const percentLabel = (value) => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`

// Retorno ou plus: em % do valor financiado ou em R$, com o outro calculado embaixo
function AmountField({ label, mode, input, financed, onMode, onInput, disabled }) {
  const resolved = resolveBankAmount(mode, input, financed)
  let hint = ''
  if (resolved.error) hint = resolved.error.charAt(0).toUpperCase() + resolved.error.slice(1)
  else if (mode === 'percent' && resolved.amount != null) hint = `= ${formatCurrencyCents(resolved.amount)}`
  else if (mode === 'valor' && resolved.amount != null && financed > 0) hint = `= ${percentLabel((resolved.amount / financed) * 100)} do financiado`
  return (
    <div className="bank-income-field">
      <div className="bank-income-head">
        <span className="admin-field-label">{label}</span>
        <div className="admin-segmented bank-income-mode" role="radiogroup" aria-label={`${label} em`}>
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={mode === m.value}
              className={mode === m.value ? 'is-active' : ''}
              onClick={() => onMode(m.value)}
              disabled={disabled}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      {mode === 'percent' ? (
        <input inputMode="decimal" aria-label={`${label} (%)`} value={input} onChange={(e) => onInput(e.target.value)} placeholder="Ex: 2,5" disabled={disabled} />
      ) : (
        <MoneyInput cents aria-label={`${label} (R$)`} value={input} onChange={onInput} placeholder="0,00" disabled={disabled} />
      )}
      {hint && <small className={`bank-income-hint${resolved.error ? ' is-error' : ''}`}>{hint}</small>}
    </div>
  )
}

// Retorno e plus do financiamento bancário (seção 97): o que o banco paga à loja.
// value: os campos de bankIncomeForm (utils/bankIncome.js); financed: valor financiado.
// Só para quem vê os valores (admin e gerente com valores; o banco também confere).
export default function BankIncomeFields({ value, onChange, financed, disabled }) {
  const update = (field, next) => onChange({ ...value, [field]: next })
  // Trocou R$ ↔ %: o número digitado não vale mais no outro jeito
  const switchMode = (modeField, inputField, mode) => {
    if (value[modeField] !== mode) onChange({ ...value, [modeField]: mode, [inputField]: '' })
  }
  const ret = resolveBankAmount(value.returnMode, value.returnInput, financed)
  const plus = resolveBankAmount(value.plusMode, value.plusInput, financed)
  const total = (ret.amount || 0) + (plus.amount || 0)

  return (
    <div className="bank-income">
      <span className="admin-field-label">Retorno e plus do banco</span>
      <p className="sale-dialog-note">O que o banco paga à loja por este financiamento. Entra no lucro do mês.</p>
      <div className="admin-form-grid bank-income-grid">
        <AmountField
          label="Retorno"
          mode={value.returnMode}
          input={value.returnInput}
          financed={financed}
          onMode={(m) => switchMode('returnMode', 'returnInput', m)}
          onInput={(v) => update('returnInput', v)}
          disabled={disabled}
        />
        <label>
          Tabela (opcional)
          <input value={value.rateTable} onChange={(e) => update('rateTable', e.target.value.toUpperCase())} maxLength={20} placeholder="Ex: R4" disabled={disabled} />
        </label>
        <AmountField
          label="Plus"
          mode={value.plusMode}
          input={value.plusInput}
          financed={financed}
          onMode={(m) => switchMode('plusMode', 'plusInput', m)}
          onInput={(v) => update('plusInput', v)}
          disabled={disabled}
        />
        {plus.amount > 0 && (
          <label>
            Plus recebido em
            <DateInputBR value={value.plusReceivedOn} onChange={(v) => update('plusReceivedOn', v)} />
            <small className="bank-income-hint">Em branco = ainda não recebido (não entra no lucro até cair).</small>
          </label>
        )}
      </div>
      {total > 0 && (
        <p className="bank-income-total">
          Total do banco para a loja: <strong>{formatCurrencyCents(total)}</strong>
        </p>
      )}
    </div>
  )
}
