import { useRef, useState } from 'react'
import { X, Upload, Paperclip } from 'lucide-react'
import { uploadCarDocument, deleteCarDocument, getCarDocumentSignedUrl } from '../lib/carsApi.js'

export default function CarDocumentUploader({ carId, documents, onChange }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  async function handleFiles(e) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setUploading(true)
    setError('')
    try {
      const uploaded = []
      for (const file of files) {
        const doc = await uploadCarDocument(carId, file)
        uploaded.push(doc)
      }
      onChange([...documents, ...uploaded])
    } catch (err) {
      setError('Falha ao enviar documento: ' + err.message)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleRemove(doc) {
    onChange(documents.filter((d) => d.path !== doc.path))
    deleteCarDocument(doc.path).catch(() => {})
  }

  async function handleOpen(doc) {
    try {
      const url = await getCarDocumentSignedUrl(doc.path)
      window.open(url, '_blank', 'noreferrer')
    } catch (err) {
      alert('Não foi possível abrir o documento: ' + err.message)
    }
  }

  return (
    <div className="attachment-uploader">
      {documents.length > 0 && (
        <ul className="attachment-uploader-list">
          {documents.map((doc) => (
            <li key={doc.path}>
              <button type="button" className="expense-attachment-link" onClick={() => handleOpen(doc)}>
                <Paperclip size={13} /> {doc.name}
              </button>
              <button type="button" onClick={() => handleRemove(doc)} aria-label="Remover documento">
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="attachment-uploader-drop">
        <Upload size={16} />
        <span>{uploading ? 'Enviando…' : 'Clique para anexar CRLV, laudo, nota fiscal etc. (pode selecionar vários)'}</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          onChange={handleFiles}
          disabled={uploading || !carId}
          hidden
        />
      </label>
      {!carId && <p className="admin-form-hint">Salve o carro primeiro para poder anexar documentos.</p>}

      {error && <p className="admin-error">{error}</p>}
    </div>
  )
}
