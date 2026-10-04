import { useEffect, useState } from 'react'
import useSlotInput from './useSlotInput.js'

const GROUPS = [2, 2, 4]

function isoToSlots(iso) {
  const [y, m, d] = String(iso || '').split('-')
  if (!y || !m || !d) return Array(8).fill('')
  return (d + m + y).split('')
}

function slotsToIso(slots) {
  if (slots.some((s) => !s)) return ''
  const digits = slots.join('')
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

// Campo de data digitável no formato brasileiro (dd/mm/aaaa), sem precisar
// abrir o calendário. Digitação por posição (utils/slotMask.js): dá para trocar
// só o dia sem o cursor pular para o fim. Recebe/emite sempre uma data ISO
// (yyyy-mm-dd); enquanto a data está incompleta ou inválida, emite ''.
export default function DateInputBR({ value, onChange, required, id, placeholder = 'dd/mm/aaaa' }) {
  const [slots, setSlots] = useState(() => isoToSlots(value))

  useEffect(() => {
    if (value !== slotsToIso(slots)) {
      setSlots(isoToSlots(value))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const field = useSlotInput(GROUPS, slots, (next) => {
    setSlots(next)
    onChange(slotsToIso(next))
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
