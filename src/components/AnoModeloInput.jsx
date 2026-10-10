import { useState } from 'react'
import { parseAnoModelo, cleanAnoModeloTyping, ANO_MODELO_EXEMPLO } from '../utils/anoModelo.js'

// Campo único de Ano/Modelo (utils/anoModelo.js). Enquanto digita aceita só
// números e separadores; ao sair do campo vira "2025/2026" ou mostra o erro.
// onChange(texto, lido): lido = { ok, year, modelYear } ou { ok: false, error }.
export default function AnoModeloInput({ value, onChange, required = false, disabled = false, className, id }) {
  const [error, setError] = useState('')

  function handleChange(e) {
    const text = cleanAnoModeloTyping(e.target.value)
    if (error) setError('')
    onChange(text, parseAnoModelo(text))
  }

  function handleBlur() {
    const parsed = parseAnoModelo(value)
    if (parsed.ok) {
      if (parsed.modelYear !== value) onChange(parsed.modelYear, parsed)
      setError('')
    } else if (!parsed.empty) {
      setError(parsed.error)
    }
  }

  return (
    <>
      <input
        id={id}
        className={className}
        value={value ?? ''}
        onChange={handleChange}
        onBlur={handleBlur}
        inputMode="decimal"
        autoComplete="off"
        placeholder={ANO_MODELO_EXEMPLO}
        required={required}
        disabled={disabled}
        aria-invalid={error ? 'true' : undefined}
      />
      {error && <small className="ano-modelo-erro" role="alert">{error}</small>}
    </>
  )
}
