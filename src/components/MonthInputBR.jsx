import { useEffect, useState } from 'react'
import useSlotInput from './useSlotInput.js'

const GROUPS = [2, 4]

function monthToSlots(value) {
  const [y, m] = String(value || '').split('-')
  return y && m ? (m + y).split('') : Array(6).fill('')
}

function slotsToMonth(slots) {
  if (slots.some((s) => !s)) return ''
  const digits = slots.join('')
  const month = Number(digits.slice(0, 2))
  if (month < 1 || month > 12) return ''
  return `${digits.slice(2, 6)}-${digits.slice(0, 2)}`
}

// Campo de mês digitável no formato brasileiro (mm/aaaa), como o DateInputBR
// (digitação por posição). Recebe/emite "aaaa-mm" (o mesmo valor de um
// <input type="month">).
export default function MonthInputBR({ value, onChange, required, id, placeholder = 'mm/aaaa' }) {
  const [slots, setSlots] = useState(() => monthToSlots(value))

  useEffect(() => {
    if (value !== slotsToMonth(slots)) {
      setSlots(monthToSlots(value))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const field = useSlotInput(GROUPS, slots, (next) => {
    setSlots(next)
    onChange(slotsToMonth(next))
  })

  return (
    <input
      ref={field.ref}
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      value={field.value}
      onChange={field.onChange}
      required={required}
    />
  )
}
