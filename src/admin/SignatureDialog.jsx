import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { X, Send, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { fetchSignatureTeam, sendForSignature } from '../lib/signaturesApi.js'
import { fetchMyPlateCredits } from '../lib/plateCreditsApi.js'
import { validateSigners, MAX_WITNESSES } from '../utils/signatures.js'
import { signatureCost } from '../utils/plateCredits.js'
import './admin.css'

const OTHER = '__outra'
const ROLE_LABELS = { admin: 'admin', manager: 'gerente', seller: 'vendedor' }

// Manda um contrato para assinar pela Autentique (seção 53). kind 'venda'
// (contractId) ou 'entrada' (carId); party: { name, email } do cliente ou do
// dono; buildFile: () => Promise<{ blob, fileName }> com o documento pronto.
export default function SignatureDialog({ kind = 'venda', contractId, carId, defaultTitle, party, buildFile, onClose, onSent }) {
  const { user } = useAuth()
  const partyRole = kind === 'entrada' ? 'dono' : 'cliente'
  const partyLabel = kind === 'entrada' ? 'Dono do carro' : 'Cliente'
  const [title, setTitle] = useState(defaultTitle || '')
  const [partyName, setPartyName] = useState(party?.name || '')
  const [partyEmail, setPartyEmail] = useState(party?.email || '')
  const [team, setTeam] = useState([])
  const [storeChoice, setStoreChoice] = useState('')
  const [otherName, setOtherName] = useState('')
  const [otherEmail, setOtherEmail] = useState('')
  const [witnesses, setWitnesses] = useState([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  // Créditos (seção 75): franquia do mês ou R$ 1,00 do saldo. Sem conseguir ler,
  // deixa enviar (a função confere de novo e recusa se não der)
  const [credits, setCredits] = useState(null)
  const cost = signatureCost(credits)

  useEffect(() => {
    fetchMyPlateCredits().then(setCredits, () => setCredits(null))
  }, [])

  useEffect(() => {
    fetchSignatureTeam()
      .then((list) => {
        setTeam(list)
        // Já vem escolhida a pessoa logada, se ela estiver na lista
        const me = list.find((p) => p.email === (user?.email || '').toLowerCase())
        setStoreChoice(me ? me.email : list.length ? '' : OTHER)
      })
      .catch(() => setStoreChoice(OTHER))
  }, [user])

  function storeSigner() {
    if (storeChoice === OTHER) return { role: 'loja', name: otherName, email: otherEmail }
    const person = team.find((p) => p.email === storeChoice)
    return person ? { role: 'loja', name: person.name, email: person.email } : null
  }

  function updateWitness(index, field, value) {
    setWitnesses((prev) => prev.map((w, i) => (i === index ? { ...w, [field]: value } : w)))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const store = storeSigner()
    const signers = [
      { role: partyRole, name: partyName, email: partyEmail },
      ...(store ? [store] : []),
      ...witnesses.map((w) => ({ role: 'testemunha', name: w.name, email: w.email })),
    ].map((s) => ({ ...s, name: s.name.trim(), email: s.email.trim().toLowerCase() }))
    const problem = !title.trim() ? 'Dê um nome ao documento.' : validateSigners(signers, kind)
    if (problem) {
      setError(problem)
      return
    }
    setSending(true)
    setError('')
    try {
      const { blob, fileName } = await buildFile()
      const request = await sendForSignature({ kind, contractId, carId, title: title.trim(), blob, fileName, signers })
      onSent(request)
    } catch (err) {
      setError(err.message || 'Não foi possível enviar.')
      setSending(false)
    }
  }

  return (
    <div className="confirm-dialog-overlay" onClick={sending ? undefined : onClose}>
      <form className="confirm-dialog admin-dialog-wide admin-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit} noValidate>
        <button type="button" className="confirm-dialog-close" onClick={onClose} aria-label="Fechar" disabled={sending}>
          <X size={18} />
        </button>
        <div>
          <h2>Enviar para assinatura digital</h2>
          <p className="admin-table-sub">
            Cada pessoa recebe um e-mail da Autentique com o link para assinar pelo celular ou computador, sem criar conta.
            Quando todos assinarem, o PDF assinado fica guardado na ficha do {kind === 'entrada' ? 'dono' : 'cliente'}
            {kind === 'entrada' ? ' (se ele estiver cadastrado).' : ' (se o contrato tiver cliente cadastrado).'}
          </p>
        </div>

        <label>
          Nome do documento
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={180} required />
        </label>

        <div className="admin-dialog-section">
          <h3>{partyLabel}</h3>
          <div className="admin-form-grid">
            <label>
              Nome completo
              <input value={partyName} onChange={(e) => setPartyName(e.target.value)} required />
            </label>
            <label>
              E-mail
              <input type="email" value={partyEmail} onChange={(e) => setPartyEmail(e.target.value)} placeholder="email@exemplo.com" required />
            </label>
          </div>
        </div>

        <div className="admin-dialog-section">
          <h3>Pela loja</h3>
          <div className="admin-form-grid">
            <label>
              Quem assina
              <select value={storeChoice} onChange={(e) => setStoreChoice(e.target.value)}>
                <option value="">Escolha…</option>
                {team.map((p) => (
                  <option key={p.email} value={p.email}>
                    {p.name} ({ROLE_LABELS[p.role] || 'equipe'}) · {p.email}
                  </option>
                ))}
                <option value={OTHER}>Outra pessoa…</option>
              </select>
            </label>
          </div>
          {storeChoice === OTHER && (
            <div className="admin-form-grid">
              <label>
                Nome completo
                <input value={otherName} onChange={(e) => setOtherName(e.target.value)} />
              </label>
              <label>
                E-mail
                <input type="email" value={otherEmail} onChange={(e) => setOtherEmail(e.target.value)} placeholder="email@exemplo.com" />
              </label>
            </div>
          )}
        </div>

        <div className="admin-dialog-section">
          <div className="admin-dialog-section-head">
            <h3>Testemunhas (opcional)</h3>
            {witnesses.length < MAX_WITNESSES && (
              <button type="button" className="btn btn-outline" onClick={() => setWitnesses((prev) => [...prev, { name: '', email: '' }])}>
                <Plus size={15} /> Adicionar testemunha
              </button>
            )}
          </div>
          {witnesses.length === 0 && <p className="admin-muted">Sem testemunhas.</p>}
          {witnesses.map((w, i) => (
            <div key={i} className="admin-form-grid signature-witness">
              <label>
                Testemunha {i + 1}
                <input value={w.name} onChange={(e) => updateWitness(i, 'name', e.target.value)} placeholder="Nome completo" />
              </label>
              <label>
                E-mail
                <input type="email" value={w.email} onChange={(e) => updateWitness(i, 'email', e.target.value)} placeholder="email@exemplo.com" />
              </label>
              <button type="button" className="admin-action-btn" onClick={() => setWitnesses((prev) => prev.filter((_, j) => j !== i))}>
                <Trash2 size={14} /> Tirar
              </button>
            </div>
          ))}
        </div>

        {cost.text && (
          <p className={cost.canSend ? 'admin-form-note' : 'admin-error'}>
            {cost.text}{' '}
            {!cost.canSend &&
              (credits?.admin ? (
                <Link className="admin-link-btn" to="/admin/mensalidade#creditos">Comprar créditos</Link>
              ) : (
                'Peça ao administrador da loja para comprar créditos.'
              ))}
          </p>
        )}
        {error && <p className="admin-error">{error}</p>}

        <div className="admin-form-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={sending}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={sending || !cost.canSend}>
            <Send size={15} /> {sending ? 'Enviando…' : 'Enviar para assinatura'}
          </button>
        </div>
      </form>
    </div>
  )
}
