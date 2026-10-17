import { useSyncExternalStore } from 'react'

// Visual do painel da loja (seção 84, companies.painel_visual), escolhido pelo admin
// em Configurações → Aparência, sem depender do modelo do site. Vale para toda a
// equipe: o <html> recebe data-painel, que o painel.css usa (o padrão não tem
// atributo). O navegador guarda a última escolha para o painel já abrir com ela.

export const PAINEIS = [
  { id: 'atual', nome: 'Padrão', resumo: 'O painel de sempre, com o menu claro' },
  { id: 'compacto', nome: 'Compacto', resumo: 'Menos espaço e cantos menores: cabe mais na tela' },
  { id: 'escuro', nome: 'Menu escuro', resumo: 'O menu lateral escuro, o resto claro' },
  { id: 'cor', nome: 'Menu na cor da loja', resumo: 'O menu lateral na cor principal da loja' },
]

export const PAINEL_PADRAO = 'atual'
const KEY = 'painel_visual'

// "escuro" → "escuro"; o que não existe → null
export function painelFromValue(value) {
  if (value == null) return null
  const text = String(value).trim().toLowerCase()
  return PAINEIS.some((p) => p.id === text) ? text : null
}

function ler() {
  try {
    return window.localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function gravar(value) {
  try {
    window.localStorage.setItem(KEY, value)
  } catch {
    // armazenamento indisponível: o painel abre no padrão e troca quando a escolha chegar
  }
}

let state = typeof window === 'undefined' ? PAINEL_PADRAO : painelFromValue(ler()) || PAINEL_PADRAO
const listeners = new Set()

function applyToDocument() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (state === PAINEL_PADRAO) root.removeAttribute('data-painel')
  else root.setAttribute('data-painel', state)
}

applyToDocument()

// guardar = false: só mostra como fica (Configurações → Aparência, antes de salvar)
export function setPainelVisual(value, { guardar = true } = {}) {
  const painel = painelFromValue(value) || PAINEL_PADRAO
  if (guardar) gravar(painel)
  if (painel === state) return
  state = painel
  applyToDocument()
  listeners.forEach((listener) => listener())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getSnapshot = () => state

export function usePainelVisual() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
