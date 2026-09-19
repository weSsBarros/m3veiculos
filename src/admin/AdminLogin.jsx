import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { isSupabaseConfigured } from '../lib/supabaseClient.js'
import SetupNotice from '../components/SetupNotice.jsx'
import './admin.css'

export default function AdminLogin() {
  const { user, loading, signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!isSupabaseConfigured) return <SetupNotice />
  if (!loading && user) return <Navigate to="/admin" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signIn(email, password)
      navigate('/admin')
    } catch (err) {
      setError('E-mail ou senha inválidos.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="admin-login">
      <form className="admin-login-card" onSubmit={handleSubmit}>
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

        {error && <p className="admin-login-error">{error}</p>}

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
