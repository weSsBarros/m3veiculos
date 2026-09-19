import { useRef, useState } from 'react'
import { X, ChevronLeft, ChevronRight, Upload } from 'lucide-react'
import { uploadCarImage, deleteCarImage } from '../lib/carsApi.js'

export default function ImageUploader({ images, onChange }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  async function handleFiles(e) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setUploading(true)
    setError('')
    try {
      const urls = []
      for (const file of files) {
        const url = await uploadCarImage(file)
        urls.push(url)
      }
      onChange([...images, ...urls])
    } catch (err) {
      setError('Falha ao enviar foto: ' + err.message)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleRemove(url) {
    onChange(images.filter((i) => i !== url))
    deleteCarImage(url).catch(() => {})
  }

  function move(index, dir) {
    const next = [...images]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <div className="image-uploader">
      {images.length > 0 && (
        <div className="image-uploader-grid">
          {images.map((url, i) => (
            <div className="image-uploader-item" key={url}>
              <img src={url} alt="" />
              {i === 0 && <span className="image-uploader-main-badge">Capa</span>}
              <div className="image-uploader-item-actions">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Mover para a esquerda">
                  <ChevronLeft size={14} />
                </button>
                <button type="button" onClick={() => handleRemove(url)} aria-label="Remover foto">
                  <X size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === images.length - 1}
                  aria-label="Mover para a direita"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <label className="image-uploader-drop">
        <Upload size={18} />
        <span>{uploading ? 'Enviando fotos…' : 'Clique para enviar fotos (pode selecionar várias)'}</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
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
