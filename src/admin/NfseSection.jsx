import { useState } from 'react'
import { Check, Copy, Download, ExternalLink, FileText, Paperclip, Upload, X } from 'lucide-react'
import { updateSaleNfse } from '../lib/salesApi.js'
import { uploadCarDocument, getCarDocumentSignedUrl } from '../lib/carsApi.js'
import { downloadStorageFile } from '../lib/storageDownload.js'
import { formatDateBR, todayISO } from '../utils/carFormat.js'
import { NFSE_EMISSOR_URL, nfseFields, nfseStatusInfo } from '../utils/nfse.js'
import DateInputBR from '../components/DateInputBR.jsx'
import '../components/ConfirmDialog.css'

// Campo do emissor com o botão de copiar (dá para corrigir antes de copiar)
function CopyField({ field, value, onChange }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  const long = field.key === 'descricao' || field.key === 'endereco'
  return (
    <div className="nfse-copy-field">
      <label htmlFor={`nfse-${field.key}`}>{field.label}</label>
      <div className="nfse-copy-row">
        {long ? (
          <textarea id={`nfse-${field.key}`} rows={field.key === 'descricao' ? 3 : 2} value={value} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <input id={`nfse-${field.key}`} value={value} onChange={(e) => onChange(e.target.value)} />
        )}
        <button type="button" className="admin-action-btn" onClick={copy} aria-label={`Copiar ${field.label}`}>
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  )
}

// Janela "Emitir NFS-e": os dados prontos para copiar no Emissor Nacional (que
// abre noutra aba, com o login gov.br da loja) e, depois de emitir, o número,
// a data e o PDF da nota.
function NfseDialog({ sale, car, customer, canEdit, showValue, onSaved, onClose }) {
  const fields = nfseFields({ car, sale: showValue ? sale : { ...sale, salePrice: null }, customer })
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.key, f.value])))
  const [number, setNumber] = useState(sale.nfseNumber || '')
  const [issuedOn, setIssuedOn] = useState(sale.nfseIssuedOn || todayISO())
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!number.trim()) return setError('Informe o número da NFS-e.')
    if (!issuedOn) return setError('Informe a data de emissão.')
    setSaving(true)
    setError('')
    try {
      const uploaded = file ? await uploadCarDocument(car.id, file) : sale.nfseFile
      const updated = await updateSaleNfse(sale.id, { status: 'emitida', number: number.trim(), issuedOn, file: uploaded })
      onSaved(updated)
    } catch (err) {
      setError('Não foi possível salvar a nota: ' + (err.message || 'tente de novo.'))
      setSaving(false)
    }
  }

  return (
    <div className="confirm-dialog-overlay" onClick={saving ? undefined : onClose}>
      <div className="confirm-dialog admin-form sale-dialog nfse-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Emitir NFS-e">
        <button type="button" className="confirm-dialog-close" onClick={onClose} aria-label="Fechar" disabled={saving}>
          <X size={18} />
        </button>
        <h2>Emitir NFS-e</h2>
        <p>
          A nota é emitida no Emissor Nacional, com o login gov.br da loja. Abra o emissor noutra aba e copie os dados daqui. Confira o
          valor e a descrição com o contador da loja.
        </p>
        <a className="btn btn-primary nfse-open" href={NFSE_EMISSOR_URL} target="_blank" rel="noreferrer">
          <ExternalLink size={15} /> Abrir o Emissor Nacional
        </a>

        <div className="sale-dialog-section">
          <span className="admin-field-label">Dados para copiar</span>
          {!customer && <p className="admin-muted">Esta venda está sem cliente: vincule o comprador para trazer o CPF/CNPJ e o nome.</p>}
          {customer && !values.documento && <p className="admin-muted">O cliente está sem CPF/CNPJ no cadastro.</p>}
          {fields.map((f) => (
            <CopyField key={f.key} field={f} value={values[f.key] ?? ''} onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))} />
          ))}
        </div>

        {canEdit && (
          <div className="sale-dialog-section">
            <span className="admin-field-label">Depois de emitir</span>
            <div className="admin-form-grid">
              <label>
                Número da NFS-e
                <input value={number} maxLength={40} onChange={(e) => setNumber(e.target.value)} placeholder="Ex: 123" />
              </label>
              <label>
                Data de emissão
                <DateInputBR value={issuedOn} onChange={setIssuedOn} />
              </label>
            </div>
            <label className="payment-claim-file">
              PDF da nota (opcional)
              <span className="attachment-uploader-drop">
                {file ? <Paperclip size={16} /> : <Upload size={16} />}
                <span>{file ? file.name : sale.nfseFile ? `Trocar o arquivo (${sale.nfseFile.name || 'PDF guardado'})` : 'Clique para anexar o PDF da nota'}</span>
                <input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </span>
            </label>
          </div>
        )}

        {error && <p className="admin-error">{error}</p>}
        <div className="confirm-dialog-actions">
          {canEdit && (
            <button type="button" className="btn btn-primary btn-block" onClick={save} disabled={saving}>
              {saving ? 'Salvando…' : 'Guardar a nota na venda'}
            </button>
          )}
          <button type="button" className="btn btn-outline btn-block" onClick={onClose} disabled={saving}>
            {canEdit ? 'Cancelar' : 'Fechar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Seção "Nota fiscal (NFS-e)" dos detalhes da venda (seção 88). canEdit: admin e
// gerente gravam (a venda é deles); os outros só veem. showValue: false para o
// gerente que não vê valores (o valor some dos dados para copiar).
export default function NfseSection({ sale, car, customer, canEdit, showValue = true, onSaleUpdated }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const info = nfseStatusInfo(sale.nfseStatus)

  async function setStatus(status) {
    setBusy(true)
    setError('')
    try {
      onSaleUpdated(await updateSaleNfse(sale.id, { status, number: sale.nfseNumber, issuedOn: sale.nfseIssuedOn, file: sale.nfseFile }))
    } catch (err) {
      setError('Não foi possível salvar: ' + err.message)
    } finally {
      setBusy(false)
    }
  }

  async function openPdf() {
    try {
      window.open(await getCarDocumentSignedUrl(sale.nfseFile.path), '_blank', 'noreferrer')
    } catch (err) {
      setError('Não foi possível abrir o PDF: ' + err.message)
    }
  }

  async function downloadPdf() {
    try {
      await downloadStorageFile('car-documents', sale.nfseFile.path, sale.nfseFile.name || `NFS-e ${sale.nfseNumber}.pdf`)
    } catch (err) {
      setError('Não foi possível baixar o PDF: ' + err.message)
    }
  }

  return (
    <section className="admin-dialog-section">
      <div className="admin-dialog-section-head">
        <h3>Nota fiscal (NFS-e)</h3>
        <span className={`admin-pill ${info.className}`}>{info.label}</span>
      </div>
      {sale.nfseStatus === 'emitida' && (
        <p className="nfse-summary">
          <FileText size={15} aria-hidden="true" /> NFS-e nº <strong>{sale.nfseNumber || '—'}</strong>
          {sale.nfseIssuedOn ? `, emitida em ${formatDateBR(sale.nfseIssuedOn)}` : ''}
        </p>
      )}
      <div className="doc-upload-actions">
        {sale.nfseStatus === 'emitida' && sale.nfseFile?.path && (
          <>
            <button type="button" className="admin-action-btn" onClick={openPdf}>
              <ExternalLink size={14} /> Abrir PDF
            </button>
            <button type="button" className="admin-action-btn" onClick={downloadPdf}>
              <Download size={14} /> Baixar
            </button>
          </>
        )}
        <button type="button" className={sale.nfseStatus === 'emitida' ? 'btn btn-outline' : 'btn btn-primary'} onClick={() => setOpen(true)} disabled={busy}>
          <FileText size={15} /> {sale.nfseStatus === 'emitida' ? (canEdit ? 'Editar a nota' : 'Ver os dados') : 'Emitir NFS-e'}
        </button>
        {canEdit && sale.nfseStatus === 'pendente' && (
          <button type="button" className="btn btn-outline" onClick={() => setStatus('nao_precisa')} disabled={busy}>
            Não precisa de nota
          </button>
        )}
        {canEdit && sale.nfseStatus === 'nao_precisa' && (
          <button type="button" className="btn btn-outline" onClick={() => setStatus('pendente')} disabled={busy}>
            Precisa de nota
          </button>
        )}
      </div>
      {error && <p className="admin-error">{error}</p>}
      {open && (
        <NfseDialog
          sale={sale}
          car={car}
          customer={customer}
          canEdit={canEdit}
          showValue={showValue}
          onClose={() => setOpen(false)}
          onSaved={(updated) => {
            setOpen(false)
            onSaleUpdated(updated)
          }}
        />
      )}
    </section>
  )
}
