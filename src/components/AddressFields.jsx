import { useState } from 'react'
import { lookupCep } from '../lib/viacep.js'
import { formatCep, onlyDigits } from '../utils/fiscal.js'

// Endereço em partes (seção 57): ao completar o CEP, busca rua, bairro, cidade,
// UF e código IBGE no ViaCEP e preenche o que veio (a pessoa confere e ajusta).
// value/onChange: objeto com zip, street, number, complement, district, city,
// city_code e state.
export default function AddressFields({ value, onChange, disabled = false }) {
  const parts = value || {}
  const [status, setStatus] = useState('')

  function set(field, v) {
    onChange({ ...parts, [field]: v })
  }

  async function changeZip(raw) {
    const zip = onlyDigits(raw).slice(0, 8)
    const next = { ...parts, zip }
    onChange(next)
    if (zip.length !== 8 || zip === onlyDigits(parts.zip)) return
    setStatus('Buscando o CEP…')
    const found = await lookupCep(zip)
    if (!found) {
      setStatus('CEP não encontrado: preencha à mão.')
      return
    }
    setStatus('')
    // O que veio do CEP entra; número e complemento ficam como estavam
    onChange({ ...next, ...Object.fromEntries(Object.entries(found).filter(([, v]) => v)) })
  }

  return (
    <>
      <div className="admin-form-grid">
        <label>
          CEP
          <input value={formatCep(parts.zip)} onChange={(e) => changeZip(e.target.value)} placeholder="00000-000" inputMode="numeric" disabled={disabled} />
        </label>
        <label>
          Rua
          <input value={parts.street || ''} onChange={(e) => set('street', e.target.value)} disabled={disabled} />
        </label>
        <label>
          Número
          <input value={parts.number || ''} onChange={(e) => set('number', e.target.value)} placeholder="Sem número: deixe em branco" disabled={disabled} />
        </label>
        <label>
          Complemento
          <input value={parts.complement || ''} onChange={(e) => set('complement', e.target.value)} disabled={disabled} />
        </label>
        <label>
          Bairro
          <input value={parts.district || ''} onChange={(e) => set('district', e.target.value)} disabled={disabled} />
        </label>
        <label>
          Cidade
          <input value={parts.city || ''} onChange={(e) => set('city', e.target.value)} disabled={disabled} />
        </label>
        <label>
          UF
          <input value={parts.state || ''} onChange={(e) => set('state', e.target.value.toUpperCase().slice(0, 2))} maxLength={2} disabled={disabled} />
        </label>
        <label>
          Código IBGE da cidade
          <input value={parts.city_code || ''} onChange={(e) => set('city_code', onlyDigits(e.target.value).slice(0, 7))} placeholder="Vem com o CEP" inputMode="numeric" disabled={disabled} />
        </label>
      </div>
      {status && <p className="admin-form-note">{status}</p>}
    </>
  )
}
