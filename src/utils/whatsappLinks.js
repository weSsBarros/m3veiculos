// Leitura de links do WhatsApp (sem tela e sem banco; usada pelo whatsappRouter.js)

// "https://wa.me/5598...?text=..." → { number, text } (null se não for WhatsApp)
export function parseWhatsappUrl(href) {
  try {
    const url = new URL(href, typeof window !== 'undefined' ? window.location.origin : 'https://localhost')
    if (url.hostname === 'wa.me') return { number: url.pathname.replace(/\D/g, ''), text: url.searchParams.get('text') || '' }
    if (url.hostname === 'api.whatsapp.com') return { number: (url.searchParams.get('phone') || '').replace(/\D/g, ''), text: url.searchParams.get('text') || '' }
  } catch {
    // endereço inválido
  }
  return null
}

// Carro da mensagem (o texto leva o link /carro/<slug>)
export function carSlugFromText(text) {
  const match = /\/carro\/([a-z0-9-]+)/i.exec(text || '')
  return match ? match[1] : null
}
