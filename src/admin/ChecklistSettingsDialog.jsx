import { useState } from 'react'
import { X } from 'lucide-react'
import { saveCompanyList } from '../lib/companyApi.js'
import { DEFAULT_SALE_CHECKLIST, parseChecklistText } from '../utils/saleChecklist.js'
import { DEFAULT_INTAKE_CHECKLIST, DEFAULT_INSPECTION_CHECKLIST } from '../utils/carChecklists.js'
import { DEFAULT_BANKS } from '../utils/payment.js'
import '../components/ConfirmDialog.css'

// Listas editáveis da loja (admin e gerente), uma por linha
const LISTS = {
  sale: {
    title: 'Itens do checklist',
    description: 'Conferidos na janela de venda antes de finalizar (manual, chave reserva etc.). Um item por linha.',
    note: 'Vendas já registradas mantêm o que foi marcado nelas.',
    defaults: DEFAULT_SALE_CHECKLIST,
  },
  intake: {
    title: 'Itens que vêm com o carro',
    description: 'Conferidos no cadastro do carro (manual, chave reserva etc.). Um item por linha.',
    note: 'Carros já cadastrados mantêm o que foi marcado neles.',
    defaults: DEFAULT_INTAKE_CHECKLIST,
  },
  inspection: {
    title: 'Itens da vistoria de entrada',
    description: 'Avaliados no cadastro do carro como ok, atenção ou ruim. Um item por linha.',
    note: 'Carros já cadastrados mantêm a vistoria feita neles.',
    defaults: DEFAULT_INSPECTION_CHECKLIST,
  },
  banks: {
    title: 'Bancos',
    description: 'Aparecem na venda, no contrato e no financiamento externo. Um banco por linha.',
    note: 'Vendas já registradas mantêm o banco escolhido nelas.',
    defaults: DEFAULT_BANKS,
  },
}

export default function ChecklistSettingsDialog({ kind = 'sale', items, onSaved, onClose }) {
  const list = LISTS[kind]
  const [text, setText] = useState(items.join('\n'))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    const next = parseChecklistText(text)
    setSaving(true)
    setError('')
    try {
      await saveCompanyList(kind, next)
      onSaved(next)
    } catch (err) {
      setError('Não foi possível salvar: ' + err.message)
      setSaving(false)
    }
  }

  return (
    <div className="confirm-dialog-overlay" onClick={saving ? undefined : onClose}>
      <form className="confirm-dialog admin-form sale-dialog" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <button type="button" className="confirm-dialog-close" onClick={onClose} aria-label="Fechar" disabled={saving}>
          <X size={18} />
        </button>
        <h2>{list.title}</h2>
        <p>{list.description}</p>
        <label>
          Itens
          <textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        </label>
        <button type="button" className="customer-picker-add" onClick={() => setText(list.defaults.join('\n'))} disabled={saving}>
          Restaurar a lista padrão
        </button>
        <span className="sale-dialog-note">{list.note}</span>
        {error && <p className="admin-error">{error}</p>}
        <div className="confirm-dialog-actions">
          <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
          <button type="button" className="btn btn-outline btn-block" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
