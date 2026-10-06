import { useState } from 'react'
import { saveCompanyFiscal } from '../lib/companyApi.js'
import { CRT_OPTIONS, formatCnpj, isValidCnpj, onlyDigits, fiscalMissing, ADDRESS_KEYS } from '../utils/fiscal.js'
import { maskPhoneBR, maskKeepingCaret } from '../utils/masks.js'
import AddressFields from '../components/AddressFields.jsx'

// Dados fiscais da loja (seção 57, só o admin): usados nos contratos, no termo
// de entrega e nos recibos, e depois na nota fiscal (Focus NFe).
export default function FiscalSettings({ fiscal, onSaved }) {
  const [form, setForm] = useState(() => ({ ...fiscal, cnpj: fiscal?.cnpj ? formatCnpj(fiscal.cnpj) : '' }))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const missing = fiscalMissing({ ...form, cnpj: onlyDigits(form.cnpj) })

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function setAddress(parts) {
    setForm((prev) => ({ ...prev, ...Object.fromEntries(ADDRESS_KEYS.map((k) => [k, parts[k] || ''])) }))
  }

  async function save(e) {
    e.preventDefault()
    if (form.cnpj && !isValidCnpj(form.cnpj)) {
      setMsg('Confira o CNPJ: os números não batem.')
      return
    }
    setSaving(true)
    setMsg('')
    try {
      const saved = await saveCompanyFiscal({ ...form, cnpj: onlyDigits(form.cnpj) })
      setForm({ ...saved, cnpj: saved.cnpj ? formatCnpj(saved.cnpj) : '' })
      onSaved?.(saved)
      setMsg('Dados fiscais salvos. Os contratos e recibos já usam estes dados.')
    } catch (err) {
      setMsg('Não foi possível salvar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="admin-form" onSubmit={save} noValidate>
      <div className="admin-form-grid">
        <label>
          Razão social
          <input value={form.legal_name || ''} onChange={(e) => set('legal_name', e.target.value)} />
        </label>
        <label>
          Nome fantasia
          <input value={form.trade_name || ''} onChange={(e) => set('trade_name', e.target.value)} placeholder="Opcional" />
        </label>
        <label>
          CNPJ
          <input value={form.cnpj || ''} onChange={(e) => set('cnpj', formatCnpj(e.target.value))} placeholder="00.000.000/0000-00" inputMode="numeric" />
        </label>
        <label>
          Inscrição Estadual
          <input value={form.ie || ''} onChange={(e) => set('ie', e.target.value)} placeholder="Só números (ou ISENTO)" />
        </label>
        <label>
          Regime tributário
          <select value={form.crt || ''} onChange={(e) => set('crt', e.target.value)}>
            <option value="">Escolha (confirme com o contador)…</option>
            {CRT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label>
          Telefone
          <input value={form.phone || ''} onChange={(e) => set('phone', maskKeepingCaret(e, maskPhoneBR))} placeholder="(00) 00000-0000" />
        </label>
        <label>
          E-mail
          <input type="email" value={form.email || ''} onChange={(e) => set('email', e.target.value)} />
        </label>
      </div>
      <AddressFields value={form} onChange={setAddress} disabled={saving} />
      <p className="admin-form-note">
        {missing.length === 0
          ? 'Tudo preenchido para a nota fiscal.'
          : `Para a nota fiscal ainda falta: ${missing.join(', ')}.`}
      </p>
      <div className="settings-buttons">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar dados fiscais'}
        </button>
      </div>
      {msg && <p className="admin-form-note">{msg}</p>}
    </form>
  )
}
