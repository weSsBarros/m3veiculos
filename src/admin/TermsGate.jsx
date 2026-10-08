import { useState } from 'react'
import { FileSignature, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { acceptPlatformTerms } from '../lib/clientsApi.js'
import './admin.css'

// Contrato de adesão do WB.AUTO (seção 65): com uma versão publicada que a loja
// ainda não aceitou, o admin lê e aceita antes de usar o painel; a equipe espera
// o aceite do admin. Os logins da equipe WB.Dev não passam por aqui (só um aviso).
export default function TermsGate() {
  const { account, realRole, refreshAccount, signOut, user } = useAuth()
  const terms = account?.terms
  const [agree, setAgree] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isAdmin = realRole === 'admin'

  async function accept() {
    setSaving(true)
    setError('')
    try {
      await acceptPlatformTerms(terms.version)
      await refreshAccount()
    } catch (err) {
      const changed = /mudou|recarregue/i.test(err.message || '')
      setError(changed ? 'O texto foi atualizado agora. Leia a versão nova abaixo e aceite de novo.' : `Não foi possível registrar o aceite: ${err.message}`)
      if (changed) await refreshAccount()
      setSaving(false)
    }
  }

  return (
    <div className="terms-gate">
      <div className="terms-gate-card">
        <div className="terms-gate-head">
          <span className="terms-gate-icon"><FileSignature size={22} /></span>
          <div>
            <h1>{terms.title || 'Contrato de adesão'}</h1>
            <p>
              {isAdmin
                ? 'Para continuar usando o sistema, leia e aceite o contrato de adesão do WB.AUTO.'
                : 'O administrador da loja precisa aceitar o contrato de adesão do WB.AUTO para o painel ser liberado.'}
            </p>
          </div>
        </div>

        {isAdmin ? (
          <>
            <div className="terms-gate-text" tabIndex={0} aria-label="Texto do contrato">
              {terms.body}
            </div>
            <label className="admin-checkbox terms-gate-agree">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              Li e concordo com o {terms.title || 'contrato de adesão'} (versão {terms.version}).
            </label>
            <p className="admin-form-note">
              O aceite fica registrado com a data, a hora, o seu login ({user?.email}) e o endereço IP, e vale como assinatura
              eletrônica deste contrato. Depois, a cópia fica em Mensalidade.
            </p>
            {error && <p className="admin-error">{error}</p>}
            <div className="terms-gate-actions">
              <button type="button" className="btn btn-outline" onClick={signOut} disabled={saving}>
                <LogOut size={15} /> Sair
              </button>
              <button type="button" className="btn btn-primary" onClick={accept} disabled={!agree || saving}>
                {saving ? 'Registrando…' : 'Aceitar e continuar'}
              </button>
            </div>
          </>
        ) : (
          <div className="terms-gate-actions">
            <button type="button" className="btn btn-outline" onClick={() => refreshAccount()}>
              Já aceitou? Conferir de novo
            </button>
            <button type="button" className="btn btn-outline" onClick={signOut}>
              <LogOut size={15} /> Sair
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
