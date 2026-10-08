import { useEffect, useState } from 'react'

// Tema do painel (claro ou escuro), guardado no navegador. Fica no <html> como
// data-admin-theme="escuro" só enquanto o painel está aberto; o site público
// continua no visual da loja. As cores do escuro estão em admin/admin-dark.css.

const KEY = 'admin_tema'

export function readAdminTheme() {
  try {
    return localStorage.getItem(KEY) === 'escuro' ? 'escuro' : 'claro'
  } catch {
    return 'claro'
  }
}

export function applyAdminTheme(theme) {
  const root = document.documentElement
  if (theme === 'escuro') root.setAttribute('data-admin-theme', 'escuro')
  else root.removeAttribute('data-admin-theme')
}

function saveAdminTheme(theme) {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // armazenamento indisponível: só não lembra a escolha
  }
}

// [tema, trocar]. Ao sair do painel (site público) o tema escuro sai junto.
export function useAdminTheme() {
  const [theme, setTheme] = useState(readAdminTheme)
  useEffect(() => {
    applyAdminTheme(theme)
    return () => applyAdminTheme('claro')
  }, [theme])
  function toggle() {
    setTheme((prev) => {
      const next = prev === 'escuro' ? 'claro' : 'escuro'
      saveAdminTheme(next)
      return next
    })
  }
  return [theme, toggle]
}
