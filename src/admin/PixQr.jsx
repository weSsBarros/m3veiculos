import { useEffect, useState } from 'react'
import { Copy, Check } from 'lucide-react'

// QR code do PIX ("copia e cola" do BR Code), desenhado em SVG pela biblioteca
// qrcode (carregada só aqui), com os botões de copiar o código e a chave
export default function PixQr({ payload, pixKey }) {
  const [svg, setSvg] = useState('')
  const [copied, setCopied] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!payload) {
      setSvg('')
      return undefined
    }
    import('qrcode')
      .then((mod) => mod.default.toString(payload, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }))
      .then((text) => !cancelled && setSvg(text))
      .catch(() => !cancelled && setSvg(''))
    return () => {
      cancelled = true
    }
  }, [payload])

  async function copy(what, text) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
      setTimeout(() => setCopied(''), 2500)
    } catch {
      window.prompt('Copie o texto abaixo:', text)
    }
  }

  return (
    <div className="pix-qr">
      {svg ? (
        <div className="pix-qr-image" role="img" aria-label="QR code do PIX" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="pix-qr-image is-empty">QR code</div>
      )}
      <div className="pix-qr-actions">
        <button type="button" className="btn btn-primary" onClick={() => copy('codigo', payload)} disabled={!payload}>
          {copied === 'codigo' ? <Check size={15} /> : <Copy size={15} />} {copied === 'codigo' ? 'Código copiado' : 'Copiar código PIX (copia e cola)'}
        </button>
        {pixKey && (
          <button type="button" className="btn btn-outline" onClick={() => copy('chave', pixKey)}>
            {copied === 'chave' ? <Check size={15} /> : <Copy size={15} />} {copied === 'chave' ? 'Chave copiada' : `Copiar a chave (${pixKey})`}
          </button>
        )}
      </div>
    </div>
  )
}
