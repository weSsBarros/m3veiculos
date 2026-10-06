import { useEffect, useRef, useState } from 'react'

// Mostra um .docx (Blob) como ele fica no Word: páginas, tabelas, logo e
// negrito (biblioteca docx-preview, carregada só quando aparece). A página é
// reduzida para caber na largura da tela.
export default function DocxPreview({ blob, error = '', loading = false, empty = 'Sem prévia.' }) {
  const boxRef = useRef(null)
  const [renderError, setRenderError] = useState('')
  const [rendering, setRendering] = useState(false)

  function fit() {
    const box = boxRef.current
    const host = box?.firstElementChild
    const page = host?.querySelector('section.docx')
    if (!page) return
    host.style.zoom = ''
    const wrapper = host.querySelector('.docx-wrapper') || host
    const style = getComputedStyle(wrapper)
    const needed = page.offsetWidth + parseFloat(style.paddingLeft || 0) + parseFloat(style.paddingRight || 0)
    const scale = Math.min(1, box.clientWidth / needed)
    host.style.zoom = scale < 1 ? String(scale) : ''
  }

  useEffect(() => {
    const box = boxRef.current
    if (!box || !blob) return
    let cancelled = false
    setRendering(true)
    setRenderError('')
    import('docx-preview')
      .then(async ({ renderAsync }) => {
        const host = document.createElement('div')
        host.className = 'docx-preview-host'
        await renderAsync(blob, host, host, {
          className: 'docx',
          inWrapper: true,
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
          renderHeaders: true,
          renderFooters: true,
          useBase64URL: true,
        })
        if (cancelled) return
        box.replaceChildren(host)
        fit()
      })
      .catch((err) => {
        if (!cancelled) setRenderError('Não foi possível mostrar a prévia: ' + (err.message || err))
      })
      .finally(() => {
        if (!cancelled) setRendering(false)
      })
    return () => {
      cancelled = true
    }
  }, [blob])

  useEffect(() => {
    const box = boxRef.current
    if (!box || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => fit())
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  const message = error || renderError
  return (
    <div className="docx-preview">
      {message && <p className="admin-error">{message}</p>}
      {!blob && !message && <p className="admin-muted">{loading ? 'Montando a prévia…' : empty}</p>}
      {(loading || rendering) && blob && <p className="docx-preview-status">Atualizando…</p>}
      <div ref={boxRef} className="docx-preview-pages" hidden={!blob || Boolean(error)} />
    </div>
  )
}
