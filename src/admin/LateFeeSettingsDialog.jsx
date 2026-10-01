import { useState } from 'react'
import { X } from 'lucide-react'
import { saveCustomerFinanceDefaults } from '../lib/companyApi.js'
import { parsePercentBR } from '../utils/financing.js'
import '../components/ConfirmDialog.css'

// Padrão da loja para multa e juros das parcelas novas
export default function LateFeeSettingsDialog({ settings, onSaved, onClose }) {
  const [fee, setFee] = useState(String(settings.lateFeePercent).replace('.', ','))
  const [interest, setInterest] = useState(String(settings.lateInterestPercent).replace('.', ','))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    const feeValue = parsePercentBR(fee)
    const interestValue = parsePercentBR(interest)
    if (feeValue == null || interestValue == null || feeValue < 0 || feeValue > 100 || interestValue < 0 || interestValue > 100) {
      setError('Informe percentuais entre 0 e 100.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await saveCustomerFinanceDefaults(feeValue, interestValue)
      onSaved({ lateFeePercent: feeValue, lateInterestPercent: interestValue })
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
        <h2>Multa e juros por atraso</h2>
        <p>Padrão da loja para os próximos financiamentos. Cada financiamento guarda as taxas com que foi feito (dá para mudar em Editar).</p>
        <label>
          Multa (%), cobrada uma vez
          <input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} autoFocus />
        </label>
        <label>
          Juros (% ao mês), proporcionais aos dias de atraso
          <input inputMode="decimal" value={interest} onChange={(e) => setInterest(e.target.value)} />
        </label>
        <span className="sale-dialog-note">Na venda ao consumidor, o Código de Defesa do Consumidor limita a multa a 2%.</span>
        {error && <p className="admin-error">{error}</p>}
        <div className="confirm-dialog-actions">
          <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar padrão'}
          </button>
          <button type="button" className="btn btn-outline btn-block" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
