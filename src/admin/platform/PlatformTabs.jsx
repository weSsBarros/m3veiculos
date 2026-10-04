import { NavLink } from 'react-router-dom'

// Abas do painel WB.Dev (aba Plataforma, só para o dono do sistema)
const TABS = [
  { to: '/admin/plataforma', label: 'Visão geral', end: true },
  { to: '/admin/plataforma/clientes', label: 'Clientes' },
  { to: '/admin/plataforma/cobranca', label: 'Cobrança' },
  { to: '/admin/plataforma/avisos', label: 'Avisos' },
  { to: '/admin/plataforma/planos', label: 'Planos' },
]

export default function PlatformTabs() {
  return (
    <nav className="admin-tabs" aria-label="Painel WB.Dev">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'is-active' : '')}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  )
}
