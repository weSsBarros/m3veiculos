import { useEffect, useRef, useState } from 'react'
import { X, Check, ImagePlus } from 'lucide-react'

// Câmera dentro do painel (Fotos pelo celular): abre a câmera traseira em tela
// cheia e tira várias fotos seguidas. Cada foto vira um JPG e vai para onPhoto,
// que envia como as fotos do cadastro (comprimidas, para o api/fotos.php).
// Sem câmera liberada (ou navegador sem suporte), oferece o seletor de fotos do
// celular, que também abre a câmera do aparelho.
export default function CameraCapture({ onPhoto, onClose, count = 0, lastPreview = '' }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const fileRef = useRef(null)
  const [status, setStatus] = useState('abrindo') // abrindo | pronta | erro
  const [error, setError] = useState('')
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function open() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('erro')
        setError('Este navegador não abre a câmera dentro do site. Use o botão abaixo para tirar as fotos pela câmera do celular.')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setStatus('pronta')
      } catch (err) {
        if (cancelled) return
        setStatus('erro')
        setError(
          err?.name === 'NotAllowedError'
            ? 'A câmera foi bloqueada. Libere a câmera para este site nas permissões do navegador, ou use o botão abaixo.'
            : 'Não deu para abrir a câmera aqui. Use o botão abaixo para tirar as fotos pela câmera do celular.'
        )
      }
    }
    open()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  function shoot() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        onPhoto(new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.92
    )
    setFlash(true)
    setTimeout(() => setFlash(false), 160)
    if (navigator.vibrate) navigator.vibrate(30)
  }

  function handleFiles(e) {
    Array.from(e.target.files || []).forEach((file) => onPhoto(file))
    e.target.value = ''
  }

  return (
    <div className="camera-capture" role="dialog" aria-modal="true" aria-label="Câmera">
      <div className="camera-capture-top">
        <button type="button" className="camera-capture-icon" onClick={onClose} aria-label="Fechar a câmera">
          <X size={22} />
        </button>
        <span>{count === 0 ? 'Tire quantas fotos quiser' : `${count} ${count === 1 ? 'foto' : 'fotos'} neste carro`}</span>
      </div>

      <div className="camera-capture-view">
        <video ref={videoRef} playsInline muted autoPlay />
        {status === 'abrindo' && <p className="camera-capture-msg">Abrindo a câmera…</p>}
        {status === 'erro' && (
          <div className="camera-capture-msg">
            <p>{error}</p>
            <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>
              <ImagePlus size={17} /> Tirar ou escolher fotos
            </button>
          </div>
        )}
        {flash && <div className="camera-capture-flash" aria-hidden="true" />}
      </div>

      <div className="camera-capture-bottom">
        <div className="camera-capture-last">
          {lastPreview ? <img src={lastPreview} alt="Última foto" /> : <span aria-hidden="true" />}
        </div>
        <button
          type="button"
          className="camera-capture-shutter"
          onClick={shoot}
          disabled={status !== 'pronta'}
          aria-label="Tirar foto"
        />
        <button type="button" className="camera-capture-done" onClick={onClose}>
          <Check size={18} /> Concluir
        </button>
      </div>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={handleFiles} />
    </div>
  )
}
