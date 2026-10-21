import { useEffect, useState } from 'react'
import { countPendingClaims } from '../../lib/clientsApi.js'
import { countWbdevUnread } from '../../lib/supportApi.js'
import { countPendingPlateOrders } from '../../lib/plateCreditsApi.js'
import { countOpenPixIntents } from '../../lib/pixIntentsApi.js'

// Números do menu do painel WB.Dev (pagamentos a conferir e chamados com mensagem
// nova), também somados na troca de painel da loja. Quem muda um deles avisa o
// menu para contar de novo.
const EVENT = 'plataforma:contadores'

export function refreshPlatformBadges() {
  window.dispatchEvent(new Event(EVENT))
}

export function onPlatformBadgesChange(callback) {
  window.addEventListener(EVENT, callback)
  return () => window.removeEventListener(EVENT, callback)
}

// { claims, credits, unread }. enabled = false (quem não é dono da plataforma): não busca nada.
// Conta de novo a cada troca de tela (pathname).
export function usePlatformBadges(enabled = true, pathname = '') {
  const [badges, setBadges] = useState({ claims: 0, credits: 0, unread: 0 })
  useEffect(() => {
    if (!enabled) return undefined
    let active = true
    function load() {
      // "claims": mensalidades informadas; "credits": compras de créditos a conferir (aba Créditos).
      // Os dois somam o PIX copiado sem o "Já paguei" (seção 94).
      Promise.all([
        countPendingClaims().catch(() => 0),
        countPendingPlateOrders().catch(() => 0),
        countWbdevUnread().catch(() => 0),
        countOpenPixIntents().catch(() => ({ creditos: 0, mensalidade: 0 })),
      ]).then(([claims, credits, unread, pix]) => {
        if (active) setBadges({ claims: claims + pix.mensalidade, credits: credits + pix.creditos, unread })
      })
    }
    load()
    const stop = onPlatformBadgesChange(load)
    return () => {
      active = false
      stop()
    }
  }, [enabled, pathname])
  return badges
}
