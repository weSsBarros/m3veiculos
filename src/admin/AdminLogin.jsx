import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth, WRONG_COMPANY_MESSAGE, SUSPENDED_MESSAGE } from '../context/AuthContext.jsx'
import { isSupabaseConfigured } from '../lib/supabaseClient.js'
import SetupNotice from '../components/SetupNotice.jsx'
import SuspendedPayment from './SuspendedPayment.jsx'
import './admin.css'
import './admin-dark.css'
import { useAdminTheme } from '../utils/adminTheme.js'

// Tela pedida antes do login: só os painéis (/admin e /wbdev), nunca outro site
function returnPath(from) {
  return typeof from === 'string' && /^\/(admin|wbdev)(\/|$|\?)/.test(from) && !from.startsWith('/admin/login') ? from : '/admin'
}

export default function AdminLogin() {
  // O login do painel segue o tema escolhido no painel
  useAdminTheme()
  const { user, loading, signIn, suspended, suspendedInfo } = useAuth()
  const navigate = useNavigate()
  const target = returnPath(useLocation().state?.from)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!isSupabaseConfigured) return <SetupNotice />
  if (!loading && user) return <Navigate to={target} replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signIn(email, password)
      navigate(target)
    } catch (err) {
      setError([WRONG_COMPANY_MESSAGE, SUSPENDED_MESSAGE].includes(err.message) ? err.message : 'E-mail ou senha inválidos.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="admin-login">
      <form className={`admin-login-card ${suspended && suspendedInfo?.admin ? 'is-suspended' : ''}`} onSubmit={handleSubmit}>
        <div className="admin-login-icon">
          <img src="/logo.jpg" alt="M&3 Veículos" />
        </div>
        <h1>Painel M&3 Veículos</h1>
        <p>Entre com sua conta para gerenciar o estoque.</p>

        <label>
          E-mail
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@m3veiculos.com.br"
            autoFocus
          />
        </label>

        <label>
          Senha
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>

        {(error || suspended) && <p className="admin-login-error">{error || SUSPENDED_MESSAGE}</p>}
        {suspended && (!error || error === SUSPENDED_MESSAGE) && <SuspendedPayment info={suspendedInfo} />}

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
