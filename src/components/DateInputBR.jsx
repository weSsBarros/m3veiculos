import { useEffect, useState } from 'react'

function isoToDigits(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return ''
  return d + m + y
}

function digitsToIso(digits) {
  if (digits.length !== 8) return ''
  const day = digits.slice(0, 2)
  const month = digits.slice(2, 4)
  const year = digits.slice(4, 8)
  const d = Number(day)
  const m = Number(month)
  const y = Number(year)
  const date = new Date(y, m - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return ''
  return `${year}-${month}-${day}`
}

function digitsToDisplay(digits) {
  const day = digits.slice(0, 2)
  const month = digits.slice(2, 4)
  const year = digits.slice(4, 8)
  return [day, month, year].filter(Boolean).join('/')
}

// Campo de data digitável no formato brasileiro (dd/mm/aaaa), sem precisar
// abrir o calendário. Recebe/emite sempre uma data ISO (yyyy-mm-dd) para
// continuar compatível com o que o resto do app já espera.
export default function DateInputBR({ value, onChange, required, id, placeholder = 'dd/mm/aaaa' }) {
  const [digits, setDigits] = useState(() => isoToDigits(value))

  useEffect(() => {
    if (value !== digitsToIso(digits)) {
      setDigits(isoToDigits(value))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function handleChange(e) {
    const next = e.target.value.replace(/\D/g, '').slice(0, 8)
    setDigits(next)
    onChange(digitsToIso(next))
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      maxLength={10}
      value={digitsToDisplay(digits)}
      onChange={handleChange}
      required={required}
    />
  )
}
