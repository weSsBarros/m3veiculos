import { useCallback, useEffect, useState } from 'react'
import { Receipt, X } from 'lucide-react'
import { moneyBR } from '../utils/plateCredits.js'
import { armPixPrompt, askOnOpen, cameBack, clearPixPrompt, readPixPrompt } from '../utils/pixPrompt.js'
import '../components/ConfirmDialog.css'

// "Você já fez o PIX?" (seção 94): depois de copiar o código ou a chave do PIX, a
// pergunta abre na frente quando a pessoa volta do app do banco para o painel.
// kind: 'creditos' ou 'mensalidade'.

function storage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

// Quando esta página abriu (o celular costuma recarregar a página na volta do banco)
const pageLoadedAt = () => (typeof performance !== 'undefined' && performance.timeOrigin ? performance.timeOrigin : Date.now())

// Uma pergunta por vez: a Mensalidade tem o PIX da mensalidade e o dos créditos
const open = new Set()

export function usePixReturnPrompt(kind) {
  const [asking, setAsking] = useState(null)

  useEffect(() => {
    const show = (entry) => {
      if (!entry || [...open].some((k) => k !== kind)) return
      open.add(kind)
      setAsking(entry)
    }
    // A página abriu de novo depois de copiar o PIX (voltou do banco e recarregou)
    const first = readPixPrompt(storage(), kind)
    if (askOnOpen(first, pageLoadedAt())) show(first)

    let awayAt = null
    const away = () => {
      if (awayAt == null && readPixPrompt(storage(), kind)) awayAt = Date.now()
    }
    const back = () => {
      if (cameBack(awayAt)) show(readPixPrompt(storage(), kind))
      awayAt = null
    }
    const onVisibility = () => (document.visibilityState === 'hidden' ? away() : back())
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', away)
    window.addEventListener('focus', back)
    return () => {
      open.delete(kind)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', away)
      window.removeEventListener('focus', back)
    }
  }, [kind])

  // Copiou o PIX: pergunta na volta
  const arm = useCallback((entry) => armPixPrompt(storage(), { ...entry, kind }), [kind])
  // Respondeu (ou clicou em "Já paguei"): não pergunta mais por esse PIX
  const close = useCallback(() => {
    clearPixPrompt(storage(), kind)
    open.delete(kind)
    setAsking(null)
  }, [kind])

  return { asking, arm, close }
}

export default function PixPaidPrompt({ entry, onYes, onNo }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onNo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onNo])

  return (
    <div className="confirm-dialog-overlay" onClick={onNo}>
      <div className="confirm-dialog pix-paid-prompt" role="dialog" aria-modal="true" aria-labelledby="pix-paid-title" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="confirm-dialog-close" onClick={onNo} aria-label="Fechar">
          <X size={18} />
        </button>
        <h2 id="pix-paid-title">
          <Receipt size={20} /> Você já fez o PIX de {moneyBR(entry.amount)}?
        </h2>
        <p>
          {entry.kind === 'mensalidade'
            ? 'Avise a WB.Dev para a mensalidade ficar paga.'
            : 'Avise a WB.Dev para o crédito entrar no seu saldo.'}
        </p>
        <div className="confirm-dialog-actions">
          <button type="button" className="btn btn-outline" onClick={onNo}>
            Ainda não
          </button>
          <button type="button" className="btn btn-primary" onClick={onYes} autoFocus>
            Sim, já paguei
          </button>
        </div>
      </div>
    </div>
  )
}
