import { useEffect, useRef, useState } from 'react'
import { downloadStorageFile } from '../lib/storageDownload.js'
import { Paperclip, Upload, Pencil, Trash2, ExternalLink, Download } from 'lucide-react'
import {
  CUSTOMER_DOC_TYPES,
  customerDocTypeLabel,
  fetchCustomerDocuments,
  uploadCustomerDocument,
  updateCustomerDocument,
  deleteCustomerDocument,
  getCustomerDocumentSignedUrl,
} from '../lib/customerDocumentsApi.js'
import { formatDateBR } from '../utils/carFormat.js'
import DateInputBR from '../components/DateInputBR.jsx'
import useConfirm from '../components/useConfirm.jsx'

const EMPTY_META = { docType: 'compra', title: '', signedOn: '', carId: '', notes: '' }

// Contratos e documentos anexados a um cliente (vários por cliente: compra,
// entrega, pós-venda, garantia...). Com carId, mostra e anexa só os daquele
// carro. Não usa <form> para poder ficar dentro de outros formulários.
// cars: carros do cliente [{ id, label }], para escolher a qual se refere.
export default function CustomerDocuments({ customerId, carId, cars = [], canDelete, onCountChange }) {
  const { confirm, confirmDialog } = useConfirm()
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [meta, setMeta] = useState(EMPTY_META)
  const [files, setFiles] = useState([])
  const [saving, setSaving] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    fetchCustomerDocuments({ customerId, carId })
      .then((data) => {
        if (!cancelled) setDocs(data)
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
  }, [customerId, carId])

  function applyDocs(next) {
    setDocs(next)
    onCountChange?.(next.length)
  }

  function carLabel(id) {
    return cars.find((c) => c.id === id)?.label || ''
  }

  function updateMeta(field, value) {
    setMeta((prev) => ({ ...prev, [field]: value }))
  }

  function openNew() {
    setEditingId(null)
    setMeta({ ...EMPTY_META, carId: carId || (cars.length === 1 ? cars[0].id : '') })
    setFiles([])
    setError('')
    setFormOpen(true)
  }

  function openEdit(doc) {
    setEditingId(doc.id)
    setMeta({ docType: doc.docType, title: doc.title, signedOn: doc.signedOn || '', carId: doc.carId || '', notes: doc.notes })
    setFiles([])
    setError('')
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setEditingId(null)
    setFiles([])
    if (inputRef.current) inputRef.current.value = ''
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      if (editingId) {
        const updated = await updateCustomerDocument(editingId, meta)
        applyDocs(docs.map((d) => (d.id === editingId ? updated : d)))
      } else {
        if (files.length === 0) {
          setError('Escolha o arquivo do documento (PDF ou foto).')
          setSaving(false)
          return
        }
        const uploaded = []
        for (const file of files) uploaded.push(await uploadCustomerDocument(customerId, file, meta))
        applyDocs([...uploaded, ...docs])
      }
      closeForm()
    } catch (err) {
      setError('Não foi possível salvar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleOpen(doc) {
    try {
      const url = await getCustomerDocumentSignedUrl(doc.filePath)
      window.open(url, '_blank', 'noreferrer')
    } catch (err) {
      alert('Não foi possível abrir o documento: ' + err.message)
    }
  }

  async function handleDownload(doc) {
    try {
      await downloadStorageFile('customer-documents', doc.filePath, doc.fileName || doc.title)
    } catch (err) {
      alert('Não foi possível baixar o documento: ' + err.message)
    }
  }

  async function handleDelete(doc) {
    if (!(await confirm(`Excluir "${doc.title || doc.fileName}"? O arquivo é apagado e não pode ser recuperado.`, { title: 'Excluir documento', confirmLabel: 'Excluir' }))) return
    try {
      await deleteCustomerDocument(doc)
      applyDocs(docs.filter((d) => d.id !== doc.id))
    } catch (err) {
      alert('Não foi possível excluir: ' + err.message)
    }
  }

  return (
    <div className="customer-documents">
      {loading ? (
        <p className="admin-muted">Carregando documentos…</p>
      ) : docs.length === 0 ? (
        <p className="admin-muted">Nenhum documento anexado{carId ? ' para este carro' : ''} ainda.</p>
      ) : (
        <ul className="doc-list">
          {docs.map((doc) => (
            <li key={doc.id}>
              <div className="doc-list-main">
                <span className="admin-pill is-info">{customerDocTypeLabel(doc.docType)}</span>
                <strong>{doc.title || doc.fileName}</strong>
                <span className="admin-table-sub">
                  {[
                    doc.title ? doc.fileName : '',
                    !carId && doc.carId ? carLabel(doc.carId) : '',
                    doc.signedOn ? `assinado em ${formatDateBR(doc.signedOn)}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {doc.notes && <span className="admin-table-sub">{doc.notes}</span>}
              </div>
              <div className="doc-list-actions">
                <button type="button" className="admin-action-btn" onClick={() => handleOpen(doc)}>
                  <ExternalLink size={14} /> Abrir
                </button>
                <button type="button" className="admin-action-btn" onClick={() => handleDownload(doc)}>
                  <Download size={14} /> Baixar
                </button>
                <button type="button" className="admin-action-btn" onClick={() => openEdit(doc)}>
                  <Pencil size={14} /> Editar
                </button>
                {canDelete && (
                  <button type="button" className="admin-action-btn admin-action-danger" onClick={() => handleDelete(doc)}>
                    <Trash2 size={14} /> Excluir
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!formOpen ? (
        <button type="button" className="btn btn-outline" onClick={openNew}>
          <Paperclip size={15} /> Anexar documento
        </button>
      ) : (
        <div className="doc-upload admin-form">
          <strong>{editingId ? 'Editar documento' : 'Anexar documento'}</strong>
          <div className="admin-form-grid">
            <label>
              Tipo
              <select value={meta.docType} onChange={(e) => updateMeta('docType', e.target.value)}>
                {CUSTOMER_DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label>
              Descrição (opcional)
              <input value={meta.title} onChange={(e) => updateMeta('title', e.target.value)} placeholder="Ex.: Garantia de motor 90 dias" />
            </label>
            <label>
              Data da assinatura
              <DateInputBR value={meta.signedOn} onChange={(iso) => updateMeta('signedOn', iso)} />
            </label>
            {!carId && cars.length > 0 && (
              <label>
                Carro
                <select value={meta.carId} onChange={(e) => updateMeta('carId', e.target.value)}>
                  <option value="">— Nenhum —</option>
                  {cars.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <label>
            Observações (opcional)
            <input value={meta.notes} onChange={(e) => updateMeta('notes', e.target.value)} />
          </label>
          <div className="doc-upload-actions">
            {!editingId && (
              <label className="doc-upload-file">
                <Upload size={15} />
                {files.length === 0 ? 'Escolher arquivo (PDF ou foto)' : files.length === 1 ? files[0].name : `${files.length} arquivos`}
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  hidden
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                  disabled={saving}
                />
              </label>
            )}
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Salvando…' : editingId ? 'Salvar' : 'Enviar'}
            </button>
            <button type="button" className="btn btn-outline" onClick={closeForm} disabled={saving}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && <p className="admin-error">{error}</p>}
      {confirmDialog}
    </div>
  )
}
