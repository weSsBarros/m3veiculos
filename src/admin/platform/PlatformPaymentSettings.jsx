import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { fetchPlatformSettings, savePlatformSettings, parseFreeMonthly } from '../../lib/clientsApi.js'
import { pixPayload } from '../../utils/pix.js'
import { parseMoneyBR } from '../../utils/financing.js'
import { moneyBR, parsePackages, queriesFor, queriesText } from '../../utils/plateCredits.js'
import { MoneyInput } from '../../components/NumberInputs.jsx'

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
    const price = parseMoneyBR(form.platePrice) || 0
    if (price <= 0 || price > 50) return setError('Confira o preço da consulta por placa (entre R$ 0,01 e R$ 50).')
    const docPrice = parseMoneyBR(form.docPhotoPrice) || 0
    if (docPrice <= 0 || docPrice > 50) return setError('Confira o preço da leitura da foto do documento (entre R$ 0,01 e R$ 50).')
    if (!parsePackages(form.platePackages)) return setError('Confira os pacotes de crédito: de 1 a 6 valores em reais inteiros, ex.: 20, 40, 100.')
    const sigPrice = parseMoneyBR(form.signaturePrice) || 0
    if (sigPrice <= 0 || sigPrice > 50) return setError('Confira o preço do contrato enviado para assinatura (entre R$ 0,01 e R$ 50).')
    if (parseFreeMonthly(form.signatureFreeMonthly) == null) return setError('Confira os envios grátis por mês: um número de 0 a 100.')
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
  const platePrice = parseMoneyBR(form.platePrice) || 0
  const docPrice = parseMoneyBR(form.docPhotoPrice) || 0
  const packages = parsePackages(form.platePackages)

  return (
    <form className="admin-form admin-form-section" onSubmit={save}>
      <h2>Dados de pagamento e suporte</h2>
      <p className="admin-form-hint">
        As lojas pagam a mensalidade e compram os créditos da consulta por placa por estes dados (QR code e "copia e cola" na página
        Mensalidade e nos e-mails de lembrete).
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
      <h3 className="plate-settings-title">Créditos pré-pagos: consulta por placa, foto do documento e assinatura digital</h3>
      <div className="admin-form-grid">
        <label>
          Preço cobrado por consulta de placa
          <MoneyInput cents value={form.platePrice} onChange={(v) => setForm((prev) => ({ ...prev, platePrice: v }))} />
        </label>
        <label>
          Preço cobrado por leitura da foto do documento
          <MoneyInput cents value={form.docPhotoPrice} onChange={(v) => setForm((prev) => ({ ...prev, docPhotoPrice: v }))} />
        </label>
        <label>
          Pacotes de crédito (reais, separados por vírgula)
          <input value={form.platePackages} maxLength={60} placeholder="Ex: 20, 40, 100" onChange={(e) => setForm((prev) => ({ ...prev, platePackages: e.target.value }))} />
        </label>
        <label>
          Preço por contrato enviado para assinatura digital
          <MoneyInput cents value={form.signaturePrice} onChange={(v) => setForm((prev) => ({ ...prev, signaturePrice: v }))} />
        </label>
        <label>
          Envios grátis por mês (por loja)
          <input value={form.signatureFreeMonthly} inputMode="numeric" maxLength={3} placeholder="Ex: 5" onChange={(e) => setForm((prev) => ({ ...prev, signatureFreeMonthly: e.target.value.replace(/\D/g, '') }))} />
        </label>
      </div>
      <p className="admin-form-note">
        {platePrice > 0 && docPrice > 0 && packages
          ? `As lojas veem: ${packages.map((p) => `${moneyBR(p)} = ${queriesText(queriesFor(p, platePrice))}`).join(' · ')}. ` +
            `A leitura da foto do documento sai do mesmo saldo (${moneyBR(docPrice)} cada; a IA custa menos de R$ 0,01 por foto). ` +
            `Contratos para assinatura: ${form.signatureFreeMonthly || 0} grátis por mês em cada loja, depois ` +
            `${moneyBR(parseMoneyBR(form.signaturePrice) || 0)} cada (a Autentique custa cerca de R$ 0,09); cancelar não devolve.`
          : 'Preencha os preços (acima de zero) e de 1 a 6 pacotes em reais inteiros.'}
      </p>
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
