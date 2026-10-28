import { useState } from 'react'
import { Copy, Check, Eye, KeyRound } from 'lucide-react'
import { viewSellerPassword } from '../lib/sellersApi.js'
import { savedPasswordInfo } from '../utils/loginAccess.js'
import '../components/ConfirmDialog.css'

// "Ver senha" da Equipe (seção 96, só o admin): a senha guardada do login de uma
// pessoa da loja. A senha só é buscada ao clicar em "Mostrar a senha", e cada vez
// fica no histórico da loja que alguém viu.
export default function LoginPasswordDialog({ seller, onClose, onNewPassword }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // undefined = ainda não mostrou; null = nenhuma senha guardada
  const [saved, setSaved] = useState(undefined)
  const [copied, setCopied] = useState(false)

  async function reveal() {
    setLoading(true)
    setError('')
    try {
      setSaved(await viewSellerPassword(seller.id))
    } catch (err) {
      setError(err.message || 'Não foi possível buscar a senha.')
    } finally {
      setLoading(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(saved.password)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      window.prompt('Copie a senha abaixo:', saved.password)
    }
  }

  return (
    <div className="confirm-dialog-overlay" onClick={loading ? undefined : onClose}>
      <div
        className="confirm-dialog login-password-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-password-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="login-password-title">Senha de {seller.name}</h2>
        <p className="login-password-email">Login: {seller.email}</p>

        {saved === undefined && (
          <>
            <p>A senha fica guardada cifrada. Ao mostrar, fica registrado no histórico da loja que você viu a senha.</p>
            {error && <p className="admin-error">{error}</p>}
            <div className="confirm-dialog-actions">
              <button type="button" className="btn btn-primary btn-block" onClick={reveal} disabled={loading}>
                <Eye size={15} /> {loading ? 'Buscando…' : 'Mostrar a senha'}
              </button>
              <button type="button" className="btn btn-outline btn-block" onClick={onClose} disabled={loading}>
                Fechar
              </button>
            </div>
          </>
        )}

        {saved && (
          <>
            <div className="login-password-box">
              <code>{saved.password}</code>
              <button type="button" className="btn btn-outline" onClick={copy}>
                {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copiada' : 'Copiar'}
              </button>
            </div>
            <p className="admin-form-note">{savedPasswordInfo(saved)}</p>
            {saved.stillValid === false && (
              <p className="login-access-warning">
                Esta senha não vale mais: o login foi trocado depois por outro caminho. Use Nova senha para definir outra.
              </p>
            )}
            <div className="confirm-dialog-actions">
              <button type="button" className="btn btn-outline btn-block" onClick={onNewPassword}>
                <KeyRound size={15} /> Nova senha
              </button>
              <button type="button" className="btn btn-primary btn-block" onClick={onClose}>
                Fechar
              </button>
            </div>
          </>
        )}

        {saved === null && (
          <>
            <p>
              Nenhuma senha guardada para este login. A senha só fica guardada quando é definida pelo painel: no cadastro,
              em Nova senha ou em Minha conta. As senhas criadas antes desta atualização não ficaram guardadas.
            </p>
            <div className="confirm-dialog-actions">
              <button type="button" className="btn btn-primary btn-block" onClick={onNewPassword}>
                <KeyRound size={15} /> Definir nova senha
              </button>
              <button type="button" className="btn btn-outline btn-block" onClick={onClose}>
                Fechar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
