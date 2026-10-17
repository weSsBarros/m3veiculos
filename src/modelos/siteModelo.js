import { useSyncExternalStore } from 'react'

// Modelos de visual do site. O admin da loja escolhe em Configurações → Aparência
// (seção 84, companies.site_modelo): o api/pagina.php já entrega o <html> com
// data-modelo e o site confirma pelo company_status (aparencia.js). ?modelo=1, 2 ou 3
// no endereço é a prévia: liga o modelo só nesta aba do navegador (sessionStorage) e
// mostra a barrinha para trocar; ?modelo=0 mostra o visual próprio da loja. O <html>
// fica com data-modelo, que os CSS de src/modelos/ usam (o visual próprio não tem
// atributo).

export const MODELOS = [
  { id: 'atual', numero: 0, nome: 'Próprio da loja', resumo: 'O visual feito para a loja, com as cores e as fotos dela' },
  { id: 'estoque', numero: 1, nome: 'Estoque primeiro', resumo: 'Muitos carros: busca e lista logo no topo' },
  { id: 'vitrine', numero: 2, nome: 'Vitrine', resumo: 'Poucos carros: fotos grandes, um de cada vez' },
  { id: 'bairro', numero: 3, nome: 'Revenda de bairro', resumo: 'Preço e WhatsApp em destaque em cada carro' },
]

export const MODELO_PADRAO = 'atual'
const KEY_PREVIA = 'site_modelo_previa'
const KEY_LOJA = 'site_modelo_loja'

// "1", "estoque" ou "Estoque" → "estoque"; o que não existe → null
export function modeloFromParam(value) {
  if (value == null) return null
  const text = String(value).trim().toLowerCase()
  if (!text) return null
  const found = MODELOS.find((m) => m.id === text || String(m.numero) === text)
  return found ? found.id : null
}

// Qual modelo abrir. A prévia (do endereço ou a guardada nesta aba) vence a escolha
// da loja; a escolha da loja vem do <html> (pagina.php) ou da última visita neste
// navegador. { modelo, previa, loja }
export function modeloInicial({ daUrl, previaGuardada, doHtml, guardadoDaLoja } = {}) {
  const loja = modeloFromParam(doHtml) || modeloFromParam(guardadoDaLoja) || MODELO_PADRAO
  const previa = modeloFromParam(daUrl) || modeloFromParam(previaGuardada)
  return previa ? { modelo: previa, previa: true, loja } : { modelo: loja, previa: false, loja }
}

// sessionStorage/localStorage podem não existir (aba anônima, bloqueio): sem eles,
// a prévia vale até recarregar e a escolha da loja vem sempre do servidor
function ler(tipo, key) {
  try {
    return window[tipo].getItem(key)
  } catch {
    return null
  }
}

function gravar(tipo, key, value) {
  try {
    if (value == null) window[tipo].removeItem(key)
    else window[tipo].setItem(key, value)
  } catch {
    // armazenamento indisponível
  }
}

function readInitial() {
  if (typeof window === 'undefined') return { modelo: MODELO_PADRAO, previa: false, loja: MODELO_PADRAO }
  const daUrl = new URLSearchParams(window.location.search).get('modelo')
  const doHtml = document.documentElement.getAttribute('data-modelo')
  const inicial = modeloInicial({
    daUrl,
    previaGuardada: ler('sessionStorage', KEY_PREVIA),
    doHtml,
    guardadoDaLoja: ler('localStorage', KEY_LOJA),
  })
  if (modeloFromParam(daUrl)) gravar('sessionStorage', KEY_PREVIA, inicial.modelo)
  if (modeloFromParam(doHtml)) gravar('localStorage', KEY_LOJA, inicial.loja)
  return inicial
}

let state = readInitial()
const listeners = new Set()

function applyToDocument() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (state.modelo === MODELO_PADRAO) root.removeAttribute('data-modelo')
  else root.setAttribute('data-modelo', state.modelo)
}

// O endereço acompanha a prévia (recarregar a página mostra o mesmo modelo)
function syncUrl(modelo) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (modelo == null) url.searchParams.delete('modelo')
  else url.searchParams.set('modelo', String(MODELOS.find((m) => m.id === modelo)?.numero ?? 0))
  window.history.replaceState(window.history.state, '', url)
}

applyToDocument()

function emit() {
  applyToDocument()
  listeners.forEach((listener) => listener())
}

export function setModeloPrevia(value) {
  const modelo = modeloFromParam(value) || MODELO_PADRAO
  gravar('sessionStorage', KEY_PREVIA, modelo)
  syncUrl(modelo)
  state = { ...state, modelo, previa: true }
  emit()
}

// Sai da prévia e volta ao modelo que a loja escolheu
export function sairDaPrevia() {
  gravar('sessionStorage', KEY_PREVIA, null)
  syncUrl(null)
  state = { ...state, modelo: state.loja, previa: false }
  emit()
}

// Escolha da loja (do company_status ou de quem acabou de salvar em Configurações)
export function setModeloDaLoja(value) {
  const loja = modeloFromParam(value) || MODELO_PADRAO
  gravar('localStorage', KEY_LOJA, loja)
  if (loja === state.loja) return
  state = { ...state, loja, modelo: state.previa ? state.modelo : loja }
  emit()
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getSnapshot = () => state

// { modelo, previa, loja }
export function useModeloState() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useSiteModelo() {
  return useModeloState().modelo
}
