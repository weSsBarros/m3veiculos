import { useState } from 'react'

// Banco: escolhe da lista da loja ou digita outro
export default function BankSelect({ value, onChange, banks = [], disabled, label = 'Banco (opcional)' }) {
  const [typing, setTyping] = useState(Boolean(value) && !banks.includes(value))

  return (
    <label>
      {label}
      {typing ? (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Nome do banco" disabled={disabled} />
      ) : (
        <select
          value={value}
          onChange={(e) => {
            if (e.target.value === '__outro') {
              setTyping(true)
              onChange('')
            } else {
              onChange(e.target.value)
            }
          }}
          disabled={disabled}
        >
          <option value="">Escolha o banco…</option>
          {banks.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
          <option value="__outro">Outro banco…</option>
        </select>
      )}
    </label>
  )
}
