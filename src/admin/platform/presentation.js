import { useEffect, useState } from 'react'

// Modo apresentação do painel WB.Dev: para mostrar os resultados das lojas a quem
// ainda não é cliente. Só a Visão geral aparece (com os números de cada loja);
// cobrança, financeiro, suporte, contatos e o resto ficam escondidos. Fica ligado
// na aba do navegador até sair pelo botão (recarregar a página não tira).
const KEY = 'wbdev_apresentacao'
const NAMES_KEY = 'wbdev_apresentacao_nomes'
const EVENT = 'wbdev:apresentacao'

function read(key, fallback) {
  try {
    const value = sessionStorage.getItem(key)
    return value === null ? fallback : value === '1'
  } catch {
    return fallback
  }
}

function write(key, on) {
  try {
    sessionStorage.setItem(key, on ? '1' : '0')
  } catch {
    // sem armazenamento: vale só nesta tela
  }
  window.dispatchEvent(new Event(EVENT))
}

export const setPresentation = (on) => write(KEY, on)
// Nomes das lojas na apresentação (padrão: com os nomes, escolha do Wesley)
export const setPresentationNames = (on) => write(NAMES_KEY, on)

// { presenting, showNames }
export function usePresentation() {
  const [state, setState] = useState(() => ({ presenting: read(KEY, false), showNames: read(NAMES_KEY, true) }))
  useEffect(() => {
    const sync = () => setState({ presenting: read(KEY, false), showNames: read(NAMES_KEY, true) })
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [])
  return state
}
