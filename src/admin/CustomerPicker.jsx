import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { createCustomer } from '../lib/customersApi.js'
import { maskCPF, maskPhoneBR } from '../utils/masks.js'

// Cliente comprador (opcional) na hora da venda: escolhe da lista ou cadastra
// na hora (nome, CPF e telefone). Fica dentro de outros <form>, então o
// cadastro rápido usa um <div> com botões, não um form próprio.
export default function CustomerPicker({ customers, value, onChange, onCreated, disabled }) {
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ name: '', document: '', phone: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function updateDraft(field, val) {
    setDraft((prev) => ({ ...prev, [field]: val }))
  }

  function openCreate() {
    setDraft({ name: '', document: '', phone: '' })
    setError('')
    setCreating(true)
  }

  async function saveCustomer() {
    if (!draft.name.trim()) {
      setError('Informe o nome do cliente.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const created = await createCustomer({ ...draft, name: draft.name.trim() })
      onCreated(created)
      onChange(created.id)
      setCreating(false)
    } catch (err) {
      setError('Não foi possível cadastrar o cliente: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Enter num campo do cadastro rápido não pode enviar o formulário da venda
  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveCustomer()
    }
  }

  return (
    <div className="customer-picker">
      <label>
        Cliente comprador (opcional)
        <select value={value || ''} onChange={(e) => onChange(e.target.value)} disabled={disabled || creating}>
          <option value="">— Nenhum —</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.document ? ` · ${c.document}` : ''}</option>
          ))}
        </select>
      </label>

      {!creating ? (
        <button type="button" className="customer-picker-add" onClick={openCreate} disabled={disabled}>
          <UserPlus size={14} /> Novo cliente
        </button>
      ) : (
        <div className="customer-picker-new">
          <strong>Cadastro rápido de cliente</strong>
          <label>
            Nome
            <input autoFocus value={draft.name} onChange={(e) => updateDraft('name', e.target.value)} onKeyDown={handleKeyDown} placeholder="Nome completo" />
          </label>
          <div className="customer-picker-row">
            <label>
              CPF
              <input
                inputMode="numeric"
                value={draft.document}
                onChange={(e) => updateDraft('document', maskCPF(e.target.value))}
                onKeyDown={handleKeyDown}
                placeholder="000.000.000-00"
              />
            </label>
            <label>
              Telefone
              <input
                inputMode="tel"
                value={draft.phone}
                onChange={(e) => updateDraft('phone', maskPhoneBR(e.target.value))}
                onKeyDown={handleKeyDown}
                placeholder="(00) 00000-0000"
              />
            </label>
          </div>
          <span className="sale-dialog-note">Os demais dados (RG, endereço) podem ser completados depois na aba Clientes.</span>
          {error && <p className="admin-error">{error}</p>}
          <div className="customer-picker-actions">
            <button type="button" className="btn btn-outline" onClick={() => setCreating(false)} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={saveCustomer} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar cliente'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
