import { useState } from 'react'
import { RefreshCcw, Mail, XCircle, FileDown, ChevronDown, ChevronUp } from 'lucide-react'
import { refreshSignatures, resendSignature, cancelSignature, downloadSignedPdf } from '../lib/signaturesApi.js'
import { signatureStatus, signerState, SIGNER_ROLES, SIGNER_STATE_LABELS } from '../utils/signatures.js'
import './admin.css'

const TONE_CLASS = { wait: ' is-warning', ok: ' is-success', bad: ' is-danger', off: '' }

function when(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Fortaleza',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Situação de um envio para assinatura, com quem já assinou e as ações
// (atualizar, reenviar o e-mail, cancelar, baixar o PDF assinado).
// compact: só o selo e os botões principais; os assinantes abrem no "Ver".
export default function SignatureStatus({ request, onChange, compact = false }) {
  const [busy, setBusy] = useState('')
  const [open, setOpen] = useState(!compact)
  const [notice, setNotice] = useState('')
  const status = signatureStatus(request)
  const waiting = request.status === 'enviado'

  async function run(kind, fn) {
    setBusy(kind)
    setNotice('')
    try {
      await fn()
    } catch (err) {
      alert(err.message || 'Não foi possível concluir.')
    } finally {
      setBusy('')
    }
  }

  const refresh = () =>
    run('atualizar', async () => {
      const [updated] = await refreshSignatures([request.id], true)
      if (updated) onChange?.(updated)
    })
  const resend = () =>
    run('reenviar', async () => {
      await resendSignature(request.id)
      setNotice('E-mail reenviado para quem ainda não assinou.')
    })
  const cancel = () => {
    if (!window.confirm('Cancelar este envio? O link de assinatura deixa de valer para todos.')) return
    run('cancelar', async () => onChange?.(await cancelSignature(request.id)))
  }
  const download = () => run('baixar', () => downloadSignedPdf(request.id))

  return (
    <div className={`signature-status${compact ? ' is-compact' : ''}`}>
      <div className="signature-status-head">
        <span className={`admin-pill${TONE_CLASS[status.tone]}`}>{status.label}</span>
        {request.sandbox && <span className="admin-pill is-info" title="Loja de demonstração: documento de teste, sem validade">Teste</span>}
        <div className="admin-row-actions">
          {request.status === 'assinado' && (
            <button type="button" className="admin-action-btn" onClick={download} disabled={!!busy}>
              <FileDown size={14} /> {busy === 'baixar' ? 'Baixando…' : 'PDF assinado'}
            </button>
          )}
          {waiting && (
            <button type="button" className="admin-action-btn" onClick={refresh} disabled={!!busy}>
              <RefreshCcw size={14} /> {busy === 'atualizar' ? 'Atualizando…' : 'Atualizar'}
            </button>
          )}
          {compact && (
            <button type="button" className="admin-action-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Ver
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="signature-status-body">
          <ul className="signature-signers">
            {request.signers.map((s) => {
              const state = signerState(s)
              const date = s.signedAt || s.rejectedAt || s.viewedAt
              return (
                <li key={s.email} className={`is-${state}`}>
                  <strong>{s.name}</strong>
                  <span className="admin-table-sub">
                    {SIGNER_ROLES[s.role] || 'Assinante'} · {s.email}
                  </span>
                  <span className="signature-signer-state">
                    {SIGNER_STATE_LABELS[state]}
                    {date && state !== 'aguardando' ? ` em ${when(date)}` : ''}
                    {state === 'recusou' && s.reason ? `: “${s.reason}”` : ''}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="admin-table-sub">
            Enviado em {when(request.createdAt)}
            {request.finishedAt ? ` · concluído em ${when(request.finishedAt)}` : ''}
            {request.signedDocumentId ? ' · via assinada guardada na ficha do cliente' : ''}
          </p>
          {waiting && (
            <div className="admin-row-actions">
              <button type="button" className="admin-action-btn" onClick={resend} disabled={!!busy}>
                <Mail size={14} /> {busy === 'reenviar' ? 'Reenviando…' : 'Reenviar e-mail'}
              </button>
              <button type="button" className="admin-action-btn signature-cancel" onClick={cancel} disabled={!!busy}>
                <XCircle size={14} /> {busy === 'cancelar' ? 'Cancelando…' : 'Cancelar envio'}
              </button>
            </div>
          )}
          {notice && <p className="admin-form-note">{notice}</p>}
        </div>
      )}
    </div>
  )
}
