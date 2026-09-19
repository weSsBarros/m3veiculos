import { useRef, useState } from 'react'
import { X, Upload, Paperclip } from 'lucide-react'
import { uploadExpenseAttachment, deleteExpenseAttachment } from '../lib/expensesApi.js'

export default function ExpenseAttachmentUploader({ carId, attachments, onChange }) {
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
        const attachment = await uploadExpenseAttachment(carId, file)
        uploaded.push(attachment)
      }
      onChange([...attachments, ...uploaded])
    } catch (err) {
      setError('Falha ao enviar anexo: ' + err.message)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleRemove(attachment) {
    onChange(attachments.filter((a) => a.path !== attachment.path))
    deleteExpenseAttachment(attachment.path).catch(() => {})
  }

  return (
    <div className="attachment-uploader">
      {attachments.length > 0 && (
        <ul className="attachment-uploader-list">
          {attachments.map((attachment) => (
            <li key={attachment.path}>
              <Paperclip size={13} />
              <span>{attachment.name}</span>
              <button type="button" onClick={() => handleRemove(attachment)} aria-label="Remover anexo">
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="attachment-uploader-drop">
        <Upload size={16} />
        <span>{uploading ? 'Enviando…' : 'Clique para anexar fotos ou PDF (pode selecionar vários)'}</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          onChange={handleFiles}
          disabled={uploading}
          hidden
        />
      </label>

      {error && <p className="admin-error">{error}</p>}
    </div>
  )
}
