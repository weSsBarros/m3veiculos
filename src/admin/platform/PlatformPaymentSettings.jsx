import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { fetchPlatformSettings, savePlatformSettings } from '../../lib/clientsApi.js'
import { pixPayload } from '../../utils/pix.js'

const FIELDS = [
  { key: 'pixKey', label: 'Chave PIX', placeholder: 'E-mail, CPF/CNPJ, telefone ou chave aleatória', max: 77 },
  { key: 'pixName', label: 'Nome do recebedor (como no banco, até 25 letras)', placeholder: 'Ex: WESLEY BARROS', max: 25 },
  { key: 'pixCity', label: 'Cidade do recebedor (até 15 letras)', placeholder: 'Ex: SAO LUIS', max: 15 },
  { key: 'bankName', label: 'Banco (opcional)', max: 80 },
  { key: 'bankAgency', label: 'Agência (opcional)', max: 20 },
  { key: 'bankAccount', label: 'Conta (opcional)', max: 30 },
  { key: 'bankHolder', label: 'Titular da conta (opcional)', max: 80 },
  { key: 'bankDocument', label: 'CPF/CNPJ do titular (opcional)', max: 20 },
  { key: 'notifyPhone', label: 'WhatsApp que recebe os avisos ("Já paguei" e chamados)', placeholder: '(98) 98129-5577', max: 20 },
  { key: 'supportEmail', label: 'E-mail de suporte (aparece na página Suporte das lojas)', max: 120 },
  { key: 'supportHours', label: 'Horário de atendimento (aparece na página Suporte)', placeholder: 'Ex: Seg a sex, 8h às 18h', max: 120 },
]

// Plataforma → Cobrança: dados do PIX e do banco que as lojas veem na página
// Mensalidade, e os contatos do suporte
export default function PlatformPaymentSettings() {
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetchPlatformSettings()
      .then(setForm)
      .catch((err) => setError(err.message || 'Não foi possível carregar os dados de pagamento.'))
  }, [])

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      setForm(await savePlatformSettings(form))
      setMessage('Dados de pagamento e suporte salvos. As lojas já veem na página Mensalidade e no Suporte.')
    } catch (err) {
      setError('Não foi possível salvar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!form) return error ? <p className="admin-error">{error}</p> : null
  const pixReady = Boolean(pixPayload({ key: form.pixKey, name: form.pixName, city: form.pixCity }))

  return (
    <form className="admin-form admin-form-section" onSubmit={save}>
      <h2>Dados de pagamento e suporte</h2>
      <p className="admin-form-hint">
        As lojas pagam a mensalidade por estes dados (QR code e "copia e cola" na página Mensalidade e nos e-mails de lembrete).
        {pixReady ? ' O PIX está pronto.' : ' Para o QR code funcionar, preencha a chave, o nome e a cidade do recebedor.'}
      </p>
      <div className="admin-form-grid">
        {FIELDS.map((f) => (
          <label key={f.key}>
            {f.label}
            <input value={form[f.key]} maxLength={f.max} placeholder={f.placeholder || ''} onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))} />
          </label>
        ))}
      </div>
      {error && <p className="admin-error">{error}</p>}
      {message && <p className="admin-success">{message}</p>}
      <div className="admin-form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          <Save size={15} /> {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  )
}
