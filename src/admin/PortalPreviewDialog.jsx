import { X } from 'lucide-react'

// Janela da prévia de um anúncio num portal (OLX, Webmotors), montado com o
// cadastro salvo pela Edge Function do portal. Mostra o que impede o envio; o
// corpo do anúncio (children) é de cada portal.
// preview: { loading, error, ad, missing, outReason }; missingText(missing) → texto
export default function PortalPreviewDialog({ name, preview, missingText, onClose, children }) {
  return (
    <div className="confirm-dialog-overlay" onClick={onClose}>
      <div className="confirm-dialog admin-dialog-wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Anúncio na ${name}`}>
        <button type="button" className="confirm-dialog-close" onClick={onClose} aria-label="Fechar">
          <X size={18} />
        </button>
        <h2>Anúncio na {name}</h2>
        {preview.loading && <p className="admin-muted">Montando…</p>}
        {preview.error && <p className="admin-error">{preview.error}</p>}
        {!preview.loading && !preview.error && (
          <>
            <p className="admin-form-note">Montado com o cadastro salvo. Mudanças ainda não salvas não entram.</p>
            {preview.outReason && <p className="admin-form-note">Hoje esse carro não vai para a {name}: {preview.outReason.toLowerCase()}.</p>}
            {!preview.ad && preview.missing?.length > 0 && <p className="admin-error">Falta: {missingText(preview.missing)}.</p>}
            {preview.ad && children}
          </>
        )}
      </div>
    </div>
  )
}
