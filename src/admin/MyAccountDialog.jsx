import { useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { updateMyAccount } from '../lib/sellersApi.js'
import { myAccountError, emailChanged, MIN_PASSWORD } from '../utils/loginAccess.js'
import '../components/ConfirmDialog.css'

// "Minha conta" (seção 96): qualquer pessoa da equipe troca o próprio e-mail e a
// própria senha, confirmando com a senha atual. Abre pelo nome no canto de cima.
// passwordNote: avisa que os administradores da loja veem a senha definida aqui.
export default function MyAccountDialog({ email, passwordNote, onClose, onSaved }) {
  const [form, setForm] = useState({ email: email || '', password: '', currentPassword: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function submit(e) {
    e.preventDefault()
    const problem = myAccountError({ currentEmail: email, ...form })
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError('')
    try {
      const changedEmail = emailChanged(email, form.email)
      const changedPassword = form.password !== ''
      const result = await updateMyAccount({
        currentPassword: form.currentPassword,
        email: changedEmail ? form.email : '',
        password: form.password,
      })
      // O login guardado neste aparelho passa a ter o e-mail novo
      if (changedEmail) {
        try {
          await supabase?.auth.refreshSession?.()
        } catch {
          // fica com o e-mail antigo até a próxima renovação da sessão
        }
      }
      onSaved?.(result.email)
      setDone(
        changedEmail && changedPassword
          ? `Pronto. Agora você entra com ${result.email} e a senha nova.`
          : changedEmail
            ? `Pronto. Agora você entra com ${result.email}.`
            : 'Pronto. A senha nova já vale no próximo login.'
      )
    } catch (err) {
      setError(err.message || 'Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="confirm-dialog-overlay" onClick={saving ? undefined : onClose}>
      <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="my-account-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="my-account-title">Minha conta</h2>
        {done ? (
          <>
            <p className="admin-success">{done}</p>
            <div className="confirm-dialog-actions">
              <button type="button" className="btn btn-primary btn-block" onClick={onClose}>
                Fechar
              </button>
            </div>
          </>
        ) : (
          <form className="admin-form" onSubmit={submit}>
            <p>Troque o e-mail do seu login, a sua senha ou os dois. Para confirmar, digite a senha que você usa hoje.</p>
            <label>
              E-mail do login
              <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} autoComplete="username" />
            </label>
            <label>
              Nova senha
              <input
                type="password"
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
                placeholder={`Deixe em branco para manter (mínimo ${MIN_PASSWORD} caracteres)`}
                autoComplete="new-password"
              />
            </label>
            <label>
              Senha atual
              <input
                type="password"
                required
                value={form.currentPassword}
                onChange={(e) => update('currentPassword', e.target.value)}
                autoComplete="current-password"
              />
            </label>
            {passwordNote && <p className="admin-form-note">Os administradores da loja podem ver a senha definida pelo painel.</p>}
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
        )}
      </div>
    </div>
  )
}
