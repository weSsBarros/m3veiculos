import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCcw, Save, Send, FilePlus2, Download } from 'lucide-react'
import { fetchPlatformTerms, saveTermsDraft, publishPlatformTerms, fetchTermsOverview, fetchTermsReceipt } from '../../lib/clientsApi.js'
import { exportTermsReceiptPdf } from '../../utils/termsPdf.js'
import useConfirm from '../../components/useConfirm.jsx'
import '../admin.css'

const when = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

// Plataforma → Contrato: o contrato de adesão que as lojas aceitam no painel.
// O rascunho só vale depois de publicado; cada publicação é uma versão nova, e
// as lojas aceitam de novo no próximo acesso.
export default function PlatformTerms() {
  const { confirm, confirmDialog } = useConfirm()
  const [terms, setTerms] = useState(null)
  const [overview, setOverview] = useState([])
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [openVersion, setOpenVersion] = useState(null)

  async function load() {
    setError('')
    try {
      const [t, o] = await Promise.all([fetchPlatformTerms(), fetchTermsOverview()])
      setTerms(t)
      setOverview(o)
      const d = t.find((x) => x.status === 'rascunho')
      setDraft(d ? { id: d.id, title: d.title, body: d.body } : null)
    } catch (err) {
      setError(err.message || 'Não foi possível carregar o contrato.')
      setTerms([])
    }
  }

  useEffect(() => {
    load()
  }, [])

  const published = (terms || []).filter((t) => t.status === 'publicada')
  const current = published[0] || null

  async function saveDraft() {
    setBusy('salvar')
    setError('')
    setMessage('')
    try {
      const saved = await saveTermsDraft(draft)
      setDraft({ id: saved.id, title: saved.title, body: saved.body })
      setMessage('Rascunho salvo. Ele só vale para as lojas depois de publicado.')
    } catch (err) {
      setError('Não foi possível salvar: ' + err.message)
    } finally {
      setBusy('')
    }
  }

  async function publish() {
    const pending = (draft.body.match(/\[[^\]]+\]/g) || []).slice(0, 5)
    const ok = await confirm(
      `${pending.length ? `O texto ainda tem campos entre colchetes (${pending.join(', ')}${pending.length === 5 ? '…' : ''}). ` : ''}` +
        `Publicar como versão ${(current?.version || 0) + 1}? No próximo acesso, o administrador de cada loja vai precisar ler e aceitar este texto para usar o painel.`,
      { title: 'Publicar o contrato', confirmLabel: 'Publicar', cancelLabel: 'Voltar' }
    )
    if (!ok) return
    setBusy('publicar')
    setError('')
    setMessage('')
    try {
      await saveTermsDraft(draft)
      const r = await publishPlatformTerms()
      setMessage(`Versão ${r.version} publicada. As lojas aceitam no próximo acesso.`)
      await load()
    } catch (err) {
      setError('Não foi possível publicar: ' + err.message)
    } finally {
      setBusy('')
    }
  }

  async function newVersion() {
    setBusy('nova')
    setError('')
    try {
      const saved = await saveTermsDraft({ title: current?.title || 'Contrato de Adesão e Termos de Uso do WB.AUTO', body: current?.body || '' })
      setDraft({ id: saved.id, title: saved.title, body: saved.body })
      setTerms((prev) => [saved, ...(prev || [])])
    } catch (err) {
      setError('Não foi possível criar o rascunho: ' + err.message)
    } finally {
      setBusy('')
    }
  }

  async function downloadReceipt(companyId) {
    setBusy(companyId)
    try {
      const receipt = await fetchTermsReceipt(companyId)
      if (!receipt) throw new Error('Essa loja ainda não aceitou.')
      await exportTermsReceiptPdf(receipt)
    } catch (err) {
      alert('Não foi possível gerar o comprovante: ' + err.message)
    } finally {
      setBusy('')
    }
  }

  const accepted = overview.filter((c) => current && c.acceptance?.version === current.version).length

  return (
    <div className="admin-page platform-page">
      <div className="admin-page-head">
        <div>
          <h1>Contrato de adesão</h1>
          <p>Contrato de adesão que o administrador de cada loja aceita no painel.</p>
        </div>
        <button type="button" className="btn btn-outline" onClick={load}>
          <RefreshCcw size={15} /> Atualizar
        </button>
      </div>
      {error && <p className="admin-error">{error}</p>}
      {message && <p className="admin-success">{message}</p>}

      {terms === null ? (
        <p className="admin-muted">Carregando…</p>
      ) : (
        <>
          {draft ? (
            <section className="admin-form admin-form-section terms-editor">
              <h2>Rascunho {current ? `(próxima versão: ${current.version + 1})` : '(ainda não publicado)'}</h2>
              <p className="admin-form-hint">
                Revise com um advogado e complete os campos entre colchetes antes de publicar. Enquanto for rascunho, nenhuma loja vê este texto.
              </p>
              <label>
                Título
                <input value={draft.title} maxLength={120} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
              </label>
              <label>
                Texto
                <textarea rows={24} value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} />
              </label>
              <div className="admin-form-actions">
                <button type="button" className="btn btn-outline" onClick={saveDraft} disabled={Boolean(busy)}>
                  <Save size={15} /> {busy === 'salvar' ? 'Salvando…' : 'Salvar rascunho'}
                </button>
                <button type="button" className="btn btn-primary" onClick={publish} disabled={Boolean(busy) || !draft.title.trim() || !draft.body.trim()}>
                  <Send size={15} /> {busy === 'publicar' ? 'Publicando…' : 'Publicar'}
                </button>
              </div>
            </section>
          ) : (
            <div className="admin-row-actions terms-new">
              <button type="button" className="btn btn-primary" onClick={newVersion} disabled={Boolean(busy)}>
                <FilePlus2 size={15} /> Nova versão (a partir da atual)
              </button>
            </div>
          )}

          <h2 className="admin-section-title">Versões publicadas</h2>
          {published.length === 0 ? (
            <p className="admin-muted">Nenhuma versão publicada: as lojas ainda não precisam aceitar nada.</p>
          ) : (
            <div className="billing-list">
              {published.map((t) => (
                <div key={t.id} className="terms-version">
                  <button type="button" className="billing-list-row terms-version-head" onClick={() => setOpenVersion(openVersion === t.id ? null : t.id)}>
                    <span>
                      <strong>Versão {t.version} · {t.title}</strong>
                      <span className="admin-table-sub">Publicada em {when(t.publishedAt)}{t === current ? ' · atual' : ''}</span>
                    </span>
                    <span className="admin-link-btn">{openVersion === t.id ? 'Fechar' : 'Ver o texto'}</span>
                  </button>
                  {openVersion === t.id && <div className="terms-gate-text">{t.body}</div>}
                </div>
              ))}
            </div>
          )}

          {current && (
            <>
              <h2 className="admin-section-title">
                Aceite das lojas · versão {current.version} ({accepted} de {overview.length})
              </h2>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Loja</th>
                      <th>Aceite</th>
                      <th>IP</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.map((c) => (
                      <tr key={c.companyId}>
                        <td>
                          <Link to={`/wbdev/clientes/${c.slug}`}>{c.name}</Link>
                        </td>
                        <td>
                          {c.acceptance ? (
                            <>
                              <span className={`platform-health ${c.acceptance.version === current.version ? 'is-green' : 'is-yellow'}`}>
                                {c.acceptance.version === current.version ? 'Aceitou' : `Aceitou a versão ${c.acceptance.version}`}
                              </span>
                              <span className="admin-table-sub">
                                {when(c.acceptance.acceptedAt)} · {c.acceptance.userName || c.acceptance.userEmail}
                              </span>
                            </>
                          ) : (
                            <span className="platform-health is-gray">Ainda não aceitou</span>
                          )}
                        </td>
                        <td>{c.acceptance?.ip || '—'}</td>
                        <td>
                          {c.acceptance && (
                            <button type="button" className="admin-action-btn" onClick={() => downloadReceipt(c.companyId)} disabled={busy === c.companyId}>
                              <Download size={15} /> {busy === c.companyId ? 'Gerando…' : 'Comprovante'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
      {confirmDialog}
    </div>
  )
}
