import { useRef } from 'react'
import { maskIntBR, maskMoneyBR, toMaskedBR } from '../utils/masks.js'
import './NumberInputs.css'

// Posição no texto formatado depois de `count` dígitos (ou vírgula)
function caretAfter(text, count) {
  if (count <= 0) return 0
  let seen = 0
  for (let i = 0; i < text.length; i++) {
    if (/[\d,]/.test(text[i])) seen++
    if (seen === count) return i + 1
  }
  return text.length
}

// Campo de número formatado enquanto digita (milhar com ponto), com um texto
// fixo dentro da caixa ("R$" antes ou "km" depois). Recebe e devolve o texto
// formatado ("119.900", "1.250,90"), que parseIntBR/parseMoneyBR já entendem.
// Sem `cents`, a vírgula aparece enquanto digita, mas os centavos saem ao sair
// do campo (e o parseIntBR também os descarta).
function AffixNumberInput({ value, onChange, cents = false, affix, side, maxDigits, onKeyDown, onBlur, ...rest }) {
  const ref = useRef(null)

  function handleChange(e) {
    const input = e.target
    const raw = input.value
    const caret = input.selectionStart ?? raw.length
    const next = maskMoneyBR(raw, maxDigits)
    const atEnd = caret >= raw.length
    const pos = atEnd ? next.length : caretAfter(next, raw.slice(0, caret).replace(/[^\d,]/g, '').length)
    onChange(next)
    // Depois que o React escrever o valor novo, o cursor volta para o lugar certo
    setTimeout(() => {
      if (ref.current && document.activeElement === ref.current) ref.current.setSelectionRange(pos, pos)
    }, 0)
  }

  // Apagar em cima do ponto de milhar apaga o dígito ao lado (senão o ponto volta)
  function handleKeyDown(e) {
    const input = e.target
    const { selectionStart: start, selectionEnd: end, value: text } = input
    if (start === end && start !== null) {
      if (e.key === 'Backspace' && text[start - 1] === '.') input.setSelectionRange(start - 1, start - 1)
      if (e.key === 'Delete' && text[start] === '.') input.setSelectionRange(start + 1, start + 1)
    }
    onKeyDown?.(e)
  }

  // Campo sem centavos: "119.900,00" (costume de digitar centavos) fica "119.900" ao sair
  function handleBlur(e) {
    if (!cents && e.target.value.includes(',')) onChange(maskIntBR(e.target.value, maxDigits))
    onBlur?.(e)
  }

  return (
    <span className={`affix-input affix-input--${side}`}>
      <input
        {...rest}
        ref={ref}
        type="text"
        inputMode={cents ? 'decimal' : 'numeric'}
        value={toMaskedBR(value, cents)}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        style={side === 'prefix' ? { paddingLeft: '2.9em' } : { paddingRight: '2.9em' }}
      />
      <span className="affix-input-text" aria-hidden="true">{affix}</span>
    </span>
  )
}

// Valor em reais. `cents` libera a vírgula para centavos (financiamento, parcelas…).
export function MoneyInput(props) {
  return <AffixNumberInput {...props} affix="R$" side="prefix" />
}

// Quilometragem (até 9.999.999 km)
export function KmInput(props) {
  return <AffixNumberInput maxDigits={7} {...props} cents={false} affix="km" side="suffix" />
}
