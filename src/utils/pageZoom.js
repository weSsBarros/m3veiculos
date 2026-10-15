// iPhone: ao tocar num campo com letra menor que 16px, o Safari dá zoom na
// página e não desfaz sozinho. Depois do login o painel abria "com zoom" e
// cortado, e a câmera do "Fotos pelo celular" ficava sem o obturador na tela.
// Os campos já têm 16px no celular (src/mobile.css); isto desfaz um zoom
// que tenha ficado: trocar o viewport por um instante com maximum-scale=1 faz
// o Safari voltar a 100% (a pessoa continua podendo dar zoom com os dedos).
export function resetPageZoom() {
  if (typeof document === 'undefined') return
  const active = document.activeElement
  if (active && typeof active.blur === 'function' && active !== document.body) active.blur()
  const scale = window.visualViewport?.scale ?? 1
  if (scale <= 1.01) return
  const meta = document.querySelector('meta[name="viewport"]')
  if (!meta) return
  const original = meta.getAttribute('content') || 'width=device-width, initial-scale=1.0'
  meta.setAttribute('content', `${original.replace(/,\s*maximum-scale=[^,]*/g, '')}, maximum-scale=1`)
  setTimeout(() => meta.setAttribute('content', original), 400)
}
