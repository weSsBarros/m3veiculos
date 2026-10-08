import { useEffect, useState } from 'react'
import { Camera, ExternalLink, Download, Trash2, X } from 'lucide-react'
import { downloadStorageFile } from '../lib/storageDownload.js'
import {
  PERSONAL_DOC_TYPES,
  isPersonalDocType,
  customerDocTypeLabel,
  fetchCustomerDocuments,
  uploadCustomerDocument,
  deleteCustomerDocument,
  getCustomerDocumentSignedUrl,
} from '../lib/customerDocumentsApi.js'
import { compressDocumentPhoto } from '../utils/carPhotos.js'
import useConfirm from '../components/useConfirm.jsx'

// Envia os arquivos escolhidos antes de o cliente existir (cadastro novo)
export async function uploadPendingPersonalDocs(customerId, pending) {
  const uploaded = []
  for (const item of pending) {
    const file = await compressDocumentPhoto(item.file)
    uploaded.push(await uploadCustomerDocument(customerId, file, { docType: item.docType, title: customerDocTypeLabel(item.docType) }))
  }
  return uploaded
}

// Documentos pessoais do cliente (seção 67): CNH, RG, comprovante de residência e
// de renda, no cadastro e na ficha. Foto pela câmera do celular ou PDF; a foto é
// reduzida antes de enviar. Sem customerId (cliente ainda não cadastrado), os
// arquivos esperam em "pending" e quem chama envia depois de cadastrar.
// Não usa <form> para poder ficar dentro do formulário do cliente.
export default function PersonalDocuments({ customerId, canDelete, pending = [], onPendingChange, disabled = false }) {
  const { confirm, confirmDialog } = useConfirm()
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(Boolean(customerId))
  const [busyType, setBusyType] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!customerId) {
      setDocs([])
      setLoading(false)
      return undefined
    }
    let cancelled = false
    setLoading(true)
    setError('')
    fetchCustomerDocuments({ customerId })
      .then((data) => {
        if (!cancelled) setDocs(data.filter((d) => isPersonalDocType(d.docType)))
      })
      .catch((err) => {
        if (!cancelled) setError('Não foi possível carregar os documentos: ' + err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [customerId])

  // Mais antigo primeiro: frente e depois o verso
  const docsOf = (type) =>
    docs.filter((d) => d.docType === type).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
  const pendingOf = (type) => pending.filter((p) => p.docType === type)

  async function addFiles(type, fileList, input) {
    const files = Array.from(fileList || [])
    if (input) input.value = ''
    if (files.length === 0) return
    setError('')
    if (!customerId) {
      onPendingChange?.([...pending, ...files.map((file) => ({ id: crypto.randomUUID(), docType: type, file }))])
      return
    }
    setBusyType(type)
    try {
      const uploaded = await uploadPendingPersonalDocs(customerId, files.map((file) => ({ docType: type, file })))
      setDocs((prev) => [...prev, ...uploaded])
    } catch (err) {
      setError('Não foi possível enviar: ' + err.message)
    } finally {
      setBusyType('')
    }
  }

  async function handleOpen(doc) {
    try {
      const url = await getCustomerDocumentSignedUrl(doc.filePath)
      window.open(url, '_blank', 'noreferrer')
    } catch (err) {
      setError('Não foi possível abrir o documento: ' + err.message)
    }
  }

  async function handleDownload(doc) {
    try {
      await downloadStorageFile('customer-documents', doc.filePath, doc.fileName || doc.title)
    } catch (err) {
      setError('Não foi possível baixar o documento: ' + err.message)
    }
  }

  async function handleDelete(doc) {
    const label = `${customerDocTypeLabel(doc.docType)} (${doc.fileName || 'arquivo'})`
    if (!(await confirm(`Excluir ${label}? O arquivo é apagado e não pode ser recuperado.`, { title: 'Excluir documento', confirmLabel: 'Excluir' }))) return
    try {
      await deleteCustomerDocument(doc)
      setDocs((prev) => prev.filter((d) => d.id !== doc.id))
    } catch (err) {
      setError('Não foi possível excluir: ' + err.message)
    }
  }

  return (
    <div className="personal-docs">
      {loading ? (
        <p className="admin-muted">Carregando documentos…</p>
      ) : (
        <div className="personal-docs-grid">
          {PERSONAL_DOC_TYPES.map((type) => {
            const files = docsOf(type.value)
            const waiting = pendingOf(type.value)
            const count = files.length + waiting.length
            const busy = busyType === type.value
            return (
              <div key={type.value} className={`personal-doc ${count ? 'is-done' : ''}`}>
                <div className="personal-doc-head">
                  <strong>{type.label}</strong>
                  <span className={`admin-pill ${count ? 'is-success' : ''}`}>
                    {count === 0 ? 'Falta' : waiting.length && !files.length ? 'A enviar' : `${count} ${count === 1 ? 'arquivo' : 'arquivos'}`}
                  </span>
                </div>
                {count === 0 && <span className="admin-table-sub">{type.hint}</span>}
                {count > 0 && (
                  <ul className="personal-doc-files">
                    {files.map((doc) => (
                      <li key={doc.id}>
                        <span className="personal-doc-name" title={doc.fileName}>
                          <span>{doc.fileName || 'Arquivo'}</span>
                          <small>{new Date(doc.createdAt).toLocaleDateString('pt-BR')}</small>
                        </span>
                        <span className="personal-doc-actions">
                          <button type="button" className="admin-icon-btn" onClick={() => handleOpen(doc)} aria-label={`Abrir ${doc.fileName}`} title="Abrir">
                            <ExternalLink size={14} />
                          </button>
                          <button type="button" className="admin-icon-btn" onClick={() => handleDownload(doc)} aria-label={`Baixar ${doc.fileName}`} title="Baixar">
                            <Download size={14} />
                          </button>
                          {canDelete && (
                            <button type="button" className="admin-icon-btn admin-icon-btn-danger" onClick={() => handleDelete(doc)} aria-label={`Excluir ${doc.fileName}`} title="Excluir">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </span>
                      </li>
                    ))}
                    {waiting.map((item) => (
                      <li key={item.id} className="is-pending">
                        <span className="personal-doc-name" title={item.file.name}>
                          <span>{item.file.name}</span>
                          <small>vai junto com o cadastro</small>
                        </span>
                        <span className="personal-doc-actions">
                          <button
                            type="button"
                            className="admin-icon-btn"
                            onClick={() => onPendingChange?.(pending.filter((p) => p.id !== item.id))}
                            aria-label={`Tirar ${item.file.name}`}
                            title="Tirar"
                            disabled={disabled}
                          >
                            <X size={14} />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <label className={`personal-doc-add ${busy || disabled ? 'is-disabled' : ''}`}>
                  <Camera size={15} />
                  {busy ? 'Enviando…' : count ? 'Anexar mais' : 'Anexar foto ou PDF'}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    hidden
                    disabled={busy || disabled}
                    onChange={(e) => addFiles(type.value, e.target.files, e.target)}
                  />
                </label>
              </div>
            )
          })}
        </div>
      )}
      {error && <p className="admin-error">{error}</p>}
      {confirmDialog}
    </div>
  )
}
