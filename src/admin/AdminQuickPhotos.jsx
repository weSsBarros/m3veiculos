import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, ImagePlus, RotateCcw, X, Check, Loader2, PlusCircle, Trash2, FileText } from 'lucide-react'
import { uploadCarImage, deleteCarImage } from '../lib/carsApi.js'
import { fetchCarDrafts, createCarDraft, updateCarDraft, deleteCarDraft } from '../lib/carDraftsApi.js'
import { thumbUrl } from '../utils/carPhotos.js'
import CameraCapture from './CameraCapture.jsx'
import NewCarTabs from './NewCarTabs.jsx'
import useConfirm from '../components/useConfirm.jsx'
import './admin.css'

let shotSeq = 0
const newKey = () => `foto-${Date.now()}-${++shotSeq}`

function formatWhen(iso) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Fotos pelo celular (seção 72): tira as fotos do carro agora e deixa um
// rascunho fora do estoque e do site; o cadastro se completa depois, no
// computador, em "Completar cadastro" (Novo carro com as fotos).
export default function AdminQuickPhotos() {
  const { confirm, confirmDialog } = useConfirm()
  const [drafts, setDrafts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [current, setCurrent] = useState(null)
  const [note, setNote] = useState('')
  const [shots, setShots] = useState([])
  const [camera, setCamera] = useState(false)
  const draftRef = useRef(null)
  const noteRef = useRef('')
  const queue = useRef(Promise.resolve())
  const galleryRef = useRef(null)

  async function loadDrafts() {
    try {
      setDrafts(await fetchCarDrafts())
      setError('')
    } catch (err) {
      setError(err.message || 'Não foi possível carregar os rascunhos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDrafts()
  }, [])

  // Cada foto sobe na hora, uma de cada vez; a primeira cria o rascunho
  async function sendShot(key, file) {
    try {
      const url = await uploadCarImage(file)
      const draft = draftRef.current
      const images = [...(draft?.images || []), url]
      const saved = draft
        ? await updateCarDraft(draft.id, { images })
        : await createCarDraft({ images, note: noteRef.current })
      draftRef.current = saved
      setCurrent(saved)
      setShots((prev) => prev.map((s) => (s.key === key ? { ...s, status: 'ok', url } : s)))
    } catch (err) {
      setShots((prev) => prev.map((s) => (s.key === key ? { ...s, status: 'erro', error: err.message } : s)))
    }
  }

  function addPhoto(file) {
    const key = newKey()
    setShots((prev) => [...prev, { key, preview: URL.createObjectURL(file), status: 'enviando', file }])
    queue.current = queue.current.then(() => sendShot(key, file))
  }

  function retry(shot) {
    setShots((prev) => prev.map((s) => (s.key === shot.key ? { ...s, status: 'enviando', error: '' } : s)))
    queue.current = queue.current.then(() => sendShot(shot.key, shot.file))
  }

  async function removeShot(shot) {
    setShots((prev) => prev.filter((s) => s.key !== shot.key))
    if (shot.status !== 'ok' || !draftRef.current) return
    const images = draftRef.current.images.filter((url) => url !== shot.url)
    queue.current = queue.current.then(async () => {
      try {
        const saved = await updateCarDraft(draftRef.current.id, { images })
        draftRef.current = saved
        setCurrent(saved)
        await deleteCarImage(shot.url).catch(() => {})
      } catch (err) {
        setError(err.message || 'Não foi possível tirar a foto do rascunho.')
      }
    })
  }

  function saveNote() {
    noteRef.current = note
    if (!draftRef.current || draftRef.current.note === note.trim()) return
    queue.current = queue.current.then(async () => {
      try {
        const saved = await updateCarDraft(draftRef.current.id, { note })
        draftRef.current = saved
        setCurrent(saved)
      } catch (err) {
        setError(err.message || 'Não foi possível salvar a anotação.')
      }
    })
  }

  function handleGallery(e) {
    Array.from(e.target.files || []).forEach(addPhoto)
    e.target.value = ''
  }

  // Termina este carro e deixa a tela pronta para o próximo
  async function finish() {
    await queue.current
    draftRef.current = null
    noteRef.current = ''
    setCurrent(null)
    setNote('')
    setShots([])
    loadDrafts()
  }

  function continueDraft(draft) {
    draftRef.current = draft
    noteRef.current = draft.note
    setCurrent(draft)
    setNote(draft.note)
    setShots(draft.images.map((url) => ({ key: url, preview: thumbUrl(url), status: 'ok', url })))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function discard(draft) {
    const ok = await confirm(
      `Descartar o rascunho${draft.note ? ` "${draft.note}"` : ''} com ${draft.images.length} ${draft.images.length === 1 ? 'foto' : 'fotos'}? As fotos saem do site. Não dá para desfazer.`,
      { title: 'Descartar rascunho', confirmLabel: 'Descartar' }
    )
    if (!ok) return
    try {
      await deleteCarDraft(draft, { removePhotos: true })
      if (draftRef.current?.id === draft.id) await finish()
      else loadDrafts()
    } catch (err) {
      setError(err.message || 'Não foi possível descartar o rascunho.')
    }
  }

  const sending = shots.filter((s) => s.status === 'enviando').length
  const failed = shots.filter((s) => s.status === 'erro').length
  const lastPreview = shots.length ? shots[shots.length - 1].preview : ''
  const others = drafts.filter((d) => d.id !== current?.id)

  return (
    <div className="admin-page quick-photos">
      <div className="admin-page-head">
        <h1>Novo carro</h1>
      </div>
      <NewCarTabs />
      <p className="quick-photos-intro">
        Tire as fotos do carro agora. Ele fica salvo como rascunho, fora do site, para completar o cadastro depois no computador.
      </p>

      {error && <p className="admin-error">{error}</p>}

      <section className="admin-form-section quick-photos-current" aria-labelledby="quick-photos-current">
        <h2 id="quick-photos-current">{current ? 'Carro em andamento' : 'Novo carro'}</h2>
        <div className="quick-photos-actions">
          <button type="button" className="btn btn-primary quick-photos-camera" onClick={() => setCamera(true)}>
            <Camera size={20} /> Abrir a câmera
          </button>
          <button type="button" className="btn btn-outline" onClick={() => galleryRef.current?.click()}>
            <ImagePlus size={17} /> Escolher da galeria
          </button>
          <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={handleGallery} />
        </div>

        <label className="quick-photos-note">
          Anotação (opcional)
          <input
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            onBlur={saveNote}
            placeholder="Ex.: Corolla prata do Sr. João, placa ABC1D23"
          />
        </label>

        {shots.length > 0 && (
          <ul className="quick-photos-grid" aria-label="Fotos deste carro">
            {shots.map((shot, index) => (
              <li key={shot.key} className={`quick-photos-shot is-${shot.status}`}>
                <img src={shot.preview} alt={`Foto ${index + 1}`} />
                {shot.status === 'enviando' && (
                  <span className="quick-photos-badge" aria-label="Enviando"><Loader2 size={16} className="spin" /></span>
                )}
                {shot.status === 'ok' && <span className="quick-photos-badge is-ok" aria-label="Salva"><Check size={14} /></span>}
                {shot.status === 'erro' && (
                  <button type="button" className="quick-photos-retry" onClick={() => retry(shot)} title={shot.error}>
                    <RotateCcw size={14} /> Tentar de novo
                  </button>
                )}
                <button type="button" className="quick-photos-remove" onClick={() => removeShot(shot)} aria-label={`Tirar a foto ${index + 1}`}>
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {shots.length > 0 && (
          <div className="quick-photos-status" role="status">
            {sending > 0
              ? `Enviando ${sending} ${sending === 1 ? 'foto' : 'fotos'}… pode continuar tirando.`
              : failed > 0
                ? `${failed} ${failed === 1 ? 'foto não subiu' : 'fotos não subiram'}. Toque em "Tentar de novo".`
                : `Salvo como rascunho: ${current?.images.length || 0} ${current?.images.length === 1 ? 'foto' : 'fotos'}.`}
          </div>
        )}

        {current && (
          <div className="admin-form-actions quick-photos-finish">
            <button type="button" className="btn btn-outline" onClick={finish} disabled={sending > 0}>
              <PlusCircle size={16} /> Terminar e começar outro carro
            </button>
            <Link to={`/admin/carros/novo?rascunho=${current.id}`} className="btn btn-primary">
              <FileText size={16} /> Completar cadastro agora
            </Link>
          </div>
        )}
      </section>

      <section className="admin-form-section" aria-labelledby="quick-photos-drafts">
        <h2 id="quick-photos-drafts">Rascunhos da loja</h2>
        {loading ? (
          <p className="admin-muted">Carregando…</p>
        ) : others.length === 0 ? (
          <p className="admin-muted">Nenhum outro rascunho. Os carros fotografados pelo celular aparecem aqui até alguém completar o cadastro.</p>
        ) : (
          <ul className="car-drafts-list">
            {others.map((draft) => (
              <CarDraftCard key={draft.id} draft={draft} onContinue={() => continueDraft(draft)} onDiscard={() => discard(draft)} />
            ))}
          </ul>
        )}
      </section>

      {camera && (
        <CameraCapture
          onPhoto={addPhoto}
          onClose={() => setCamera(false)}
          count={shots.length}
          lastPreview={lastPreview}
        />
      )}
      {confirmDialog}
    </div>
  )
}

// Cartão de um rascunho (também usado no Estoque)
export function CarDraftCard({ draft, onContinue, onDiscard }) {
  const count = draft.images.length
  return (
    <li className="car-draft-card">
      <div className="car-draft-thumbs">
        {draft.images.slice(0, 4).map((url) => (
          <img key={url} src={thumbUrl(url)} alt="" loading="lazy" />
        ))}
        {count === 0 && <span className="car-draft-empty">sem fotos</span>}
      </div>
      <div className="car-draft-info">
        <strong>{draft.note || 'Carro sem anotação'}</strong>
        <span className="admin-table-sub">
          {count} {count === 1 ? 'foto' : 'fotos'} · {draft.createdByName || 'equipe'} · {formatWhen(draft.createdAt)}
        </span>
      </div>
      <div className="car-draft-actions">
        <Link to={`/admin/carros/novo?rascunho=${draft.id}`} className="btn btn-primary">
          <FileText size={15} /> Completar cadastro
        </Link>
        {onContinue && (
          <button type="button" className="btn btn-outline" onClick={onContinue}>
            <Camera size={15} /> Adicionar fotos
          </button>
        )}
        {onDiscard && (
          <button type="button" className="admin-action-btn admin-action-danger" onClick={onDiscard}>
            <Trash2 size={15} /> Descartar
          </button>
        )}
      </div>
    </li>
  )
}
