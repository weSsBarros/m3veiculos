import { Moon, Sun } from 'lucide-react'

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
// vier em children (o "Ver como" do admin).
export default function PanelTopBar({ name, role, email, theme, onToggleTheme, children }) {
  return (
    <div className="panel-topbar">
      <div className="panel-topbar-who" title={email || undefined}>
        <strong>{name}</strong>
        {role && <span>{role}</span>}
      </div>
      <div className="panel-topbar-actions">
        <ThemeSwitch theme={theme} onToggle={onToggleTheme} />
        {children}
      </div>
    </div>
  )
}
