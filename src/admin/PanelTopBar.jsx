import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import MyAccountDialog from './MyAccountDialog.jsx'

// Interruptor do tema do painel: sol (claro) e lua (escuro)
export function ThemeSwitch({ theme, onToggle }) {
  const dark = theme === 'escuro'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Tema escuro"
      title={dark ? 'Tema escuro: clique para o claro' : 'Tema claro: clique para o escuro'}
      className={`theme-switch${dark ? ' is-dark' : ''}`}
      onClick={onToggle}
    >
      <Sun size={13} className="theme-switch-icon is-sun" aria-hidden="true" />
      <Moon size={13} className="theme-switch-icon is-moon" aria-hidden="true" />
      <span className="theme-switch-knob" aria-hidden="true">
        {dark ? <Moon size={12} /> : <Sun size={12} />}
      </span>
    </button>
  )
}

// Canto superior direito do painel (17/10/2026: saiu do menu lateral, para sobrar
// espaço para as abas): quem está logado e, embaixo, o interruptor do tema e o que
// vier em children (o "Ver como" do admin). Clicar no nome abre "Minha conta"
// (seção 96: trocar o próprio e-mail e a própria senha).
// passwordNote: avisa no "Minha conta" que os admins da loja veem a senha.
export default function PanelTopBar({ name, role, email, theme, onToggleTheme, passwordNote = false, children }) {
  const [accountOpen, setAccountOpen] = useState(false)
  // E-mail trocado agora no "Minha conta" (a sessão só atualiza depois)
  const [savedEmail, setSavedEmail] = useState('')
  const loginEmail = savedEmail || email || ''

  return (
    <div className="panel-topbar">
      <button
        type="button"
        className="panel-topbar-who"
        title={loginEmail ? `${loginEmail}: trocar e-mail e senha` : 'Trocar e-mail e senha'}
        onClick={() => setAccountOpen(true)}
      >
        <strong>{name}</strong>
        <span>{role ? `${role} · ` : ''}Minha conta</span>
      </button>
      <div className="panel-topbar-actions">
        <ThemeSwitch theme={theme} onToggle={onToggleTheme} />
        {children}
      </div>
      {accountOpen && (
        <MyAccountDialog email={loginEmail} passwordNote={passwordNote} onClose={() => setAccountOpen(false)} onSaved={setSavedEmail} />
      )}
    </div>
  )
}
