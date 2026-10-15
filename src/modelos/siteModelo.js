import { useSyncExternalStore } from 'react'

// Modelos de visual do site (e um toque no painel). O lojista vai escolher em
// Configurações → Aparência depois que os modelos forem aprovados; por enquanto só há
// a prévia: ?modelo=1, 2 ou 3 no endereço liga o modelo nesta aba do navegador
// (sessionStorage) e mostra a barrinha para trocar; ?modelo=0 volta ao atual. O <html>
// recebe data-modelo, que os CSS de src/modelos/ usam (o atual não tem atributo).

export const MODELOS = [
  { id: 'atual', numero: 0, nome: 'Atual', resumo: 'O visual de hoje da loja' },
  { id: 'estoque', numero: 1, nome: 'Estoque primeiro', resumo: 'Muitos carros: busca e lista logo no topo' },
  { id: 'vitrine', numero: 2, nome: 'Vitrine', resumo: 'Poucos carros: fotos grandes, um de cada vez' },
  { id: 'bairro', numero: 3, nome: 'Revenda de bairro', resumo: 'Preço e WhatsApp em destaque em cada carro' },
]

export const MODELO_PADRAO = 'atual'
const KEY = 'site_modelo_previa'

// "1", "estoque" ou "Estoque" → "estoque"; o que não existe → null
export function modeloFromParam(value) {
  if (value == null) return null
  const text = String(value).trim().toLowerCase()
  if (!text) return null
  const found = MODELOS.find((m) => m.id === text || String(m.numero) === text)
  return found ? found.id : null
}

function readStored() {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

function writeStored(value) {
  try {
    if (value == null) sessionStorage.removeItem(KEY)
    else sessionStorage.setItem(KEY, value)
  } catch {
    // armazenamento indisponível: a prévia vale só até recarregar a página
  }
}

function readInitial() {
  if (typeof window === 'undefined') return { modelo: MODELO_PADRAO, previa: false }
  const fromUrl = modeloFromParam(new URLSearchParams(window.location.search).get('modelo'))
  if (fromUrl) {
    writeStored(fromUrl)
    return { modelo: fromUrl, previa: true }
  }
  const stored = modeloFromParam(readStored())
  if (stored) return { modelo: stored, previa: true }
  return { modelo: MODELO_PADRAO, previa: false }
}

let state = readInitial()
const listeners = new Set()

function applyToDocument() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (state.modelo === MODELO_PADRAO) root.removeAttribute('data-modelo')
  else root.setAttribute('data-modelo', state.modelo)
}

// O endereço acompanha a escolha (recarregar a página mostra o mesmo modelo)
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
  writeStored(modelo)
  syncUrl(modelo)
  state = { modelo, previa: true }
  emit()
}

export function sairDaPrevia() {
  writeStored(null)
  syncUrl(null)
  state = { modelo: MODELO_PADRAO, previa: false }
  emit()
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getSnapshot = () => state

// { modelo, previa }
export function useModeloState() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useSiteModelo() {
  return useModeloState().modelo
}
