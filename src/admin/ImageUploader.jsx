import { useRef, useState } from 'react'
import { X, ChevronLeft, ChevronRight, Upload } from 'lucide-react'
import { uploadCarImage } from '../lib/carsApi.js'
import { thumbUrl } from '../utils/carPhotos.js'

export default function ImageUploader({ images, onChange }) {
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  async function handleFiles(e) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setUploading(true)
    setError('')
    setDone(0)
    setTotal(files.length)
    // Uma foto com problema não impede as outras: as que subiram entram no
    // cadastro e cada falha é avisada.
    const urls = []
    const failures = []
    for (const [index, file] of files.entries()) {
      try {
        urls.push(await uploadCarImage(file))
      } catch (err) {
        failures.push(err.message)
      }
      setDone(index + 1)
    }
    if (urls.length > 0) onChange([...images, ...urls])
    if (failures.length > 0) {
      setError(
        (failures.length === 1 ? 'Uma foto não foi enviada: ' : `${failures.length} fotos não foram enviadas: `) +
          failures.join(' ')
      )
    }
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  // Só tira da lista: o arquivo sai do site quando o carro é salvo
  // (AdminCarForm). Se a pessoa cancelar, o carro continua com a foto.
  function handleRemove(url) {
    onChange(images.filter((i) => i !== url))
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
              <img src={thumbUrl(url)} alt="" />
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
        <span>
          {uploading
            ? `Otimizando e enviando fotos… (${done} de ${total})`
            : 'Clique para enviar fotos (pode selecionar várias)'}
        </span>
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
