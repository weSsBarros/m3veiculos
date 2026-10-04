import { useEffect, useState } from 'react'

function monthToDigits(value) {
  const [y, m] = String(value || '').split('-')
  return y && m ? m + y : ''
}

function digitsToMonth(digits) {
  if (digits.length !== 6) return ''
  const month = Number(digits.slice(0, 2))
  if (month < 1 || month > 12) return ''
  return `${digits.slice(2, 6)}-${digits.slice(0, 2)}`
}

// Campo de mês digitável no formato brasileiro (mm/aaaa), como o DateInputBR.
// Recebe/emite "aaaa-mm" (o mesmo valor de um <input type="month">).
export default function MonthInputBR({ value, onChange, required, id, placeholder = 'mm/aaaa' }) {
  const [digits, setDigits] = useState(() => monthToDigits(value))

  useEffect(() => {
    if (value !== digitsToMonth(digits)) {
      setDigits(monthToDigits(value))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function handleChange(e) {
    const next = e.target.value.replace(/\D/g, '').slice(0, 6)
    setDigits(next)
    onChange(digitsToMonth(next))
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      maxLength={7}
      value={digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits}
      onChange={handleChange}
      required={required}
    />
  )
}
