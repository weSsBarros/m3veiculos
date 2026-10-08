import { useEffect, useState } from 'react'
import { publicSupabase, COMPANY_ID } from '../lib/supabaseClient.js'
import { WHATSAPP_NUMBER } from './whatsapp.js'
import { parseWhatsappUrl, carSlugFromText } from './whatsappLinks.js'

// WhatsApp do site com o número escolhido em Configurações (fixo ou rodízio
// entre vendedores). Os botões continuam montando o link com WHATSAPP_NUMBER;
// no clique, o site pergunta ao banco (whatsapp_contact) para qual número
// mandar e troca o número do link. O mesmo navegador guarda o vendedor que
// recebeu e volta para ele enquanto valer (Configurações → dias).
// Se o banco não responder em 3 segundos, vai para o número do link.

const KEEP_KEY = 'wa_vendedor'
const TIMEOUT_MS = 3000

function readKeep() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEEP_KEY) || 'null')
    return saved && saved.id && saved.until > Date.now() ? saved.id : null
  } catch {
    return null
  }
}

function saveKeep(id, days) {
  try {
    if (id && days > 0) localStorage.setItem(KEEP_KEY, JSON.stringify({ id, until: Date.now() + days * 86400000 }))
    else localStorage.removeItem(KEEP_KEY)
  } catch {
    // sem armazenamento: só não lembra o vendedor
  }
}

async function resolveNumber(text) {
  if (!publicSupabase || !COMPANY_ID) return null
  const call = publicSupabase.rpc('whatsapp_contact', {
    p_company: COMPANY_ID,
    p_car_slug: carSlugFromText(text),
    p_keep: readKeep(),
    p_page: window.location.pathname,
  })
  const timeout = new Promise((resolve) => setTimeout(() => resolve({ data: null }), TIMEOUT_MS))
  const { data, error } = await Promise.race([call, timeout])
  if (error || !data?.phone) return null
  if (data.mode === 'rodizio') saveKeep(data.entry_id, data.sticky_days ?? 30)
  return String(data.phone)
}

function buildUrl(number, text) {
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

// Abre o WhatsApp com o número da vez (formulários chamam direto; os links
// passam pelo installWhatsAppRouter)
export async function openWhatsApp(href) {
  const parsed = parseWhatsappUrl(href)
  if (!parsed) {
    window.open(href, '_blank', 'noreferrer')
    return
  }
  // A aba abre já no clique: o navegador bloqueia janela aberta depois de
  // esperar a resposta do banco
  const win = window.open('', '_blank')
  let number = null
  try {
    number = await resolveNumber(parsed.text)
  } catch {
    number = null
  }
  const url = buildUrl(number || parsed.number, parsed.text)
  if (win && !win.closed) {
    win.opener = null
    win.location.href = url
  } else {
    window.location.href = url
  }
}

// Intercepta os cliques nos links de WhatsApp da loja (só os que apontam para
// o número do site; links para o telefone de um cliente, no painel, passam)
export function installWhatsAppRouter() {
  document.addEventListener(
    'click',
    (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = event.target.closest?.('a[href]')
      if (!link || /^\/(admin|wbdev)(\/|$)/.test(window.location.pathname)) return
      const parsed = parseWhatsappUrl(link.href)
      if (!parsed || parsed.number !== WHATSAPP_NUMBER) return
      event.preventDefault()
      openWhatsApp(link.href)
    },
    true
  )
}

// Número principal (topo e rodapé), configurado no painel. Até a resposta
// chegar — ou se falhar —, vale o número do site (WHATSAPP_NUMBER).
let mainPhoneCache = null
let mainPhoneRequest = null

function fetchMainPhone() {
  if (!publicSupabase || !COMPANY_ID) return Promise.resolve(null)
  if (!mainPhoneRequest) {
    mainPhoneRequest = publicSupabase
      .rpc('store_contact', { p_company: COMPANY_ID })
      .then(({ data, error }) => {
        mainPhoneCache = !error && data?.main ? String(data.main) : WHATSAPP_NUMBER
        return mainPhoneCache
      })
      .catch(() => WHATSAPP_NUMBER)
  }
  return mainPhoneRequest
}

export function useMainPhone() {
  const [phone, setPhone] = useState(mainPhoneCache || WHATSAPP_NUMBER)
  useEffect(() => {
    let cancelled = false
    fetchMainPhone().then((value) => {
      if (!cancelled && value) setPhone(value)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return phone
}

export const hasRealPhone = (phone) => Boolean(phone) && !/^550+$/.test(phone)
