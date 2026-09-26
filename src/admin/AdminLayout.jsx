import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Car,
  PlusCircle,
  Wallet,
  History,
  FileText,
  Users,
  Truck,
  BadgeCheck,
  ScrollText,
  TrendingUp,
  Menu,
  X,
  LogOut,
  ExternalLink,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import './admin.css'

const SIDEBAR_KEY = 'admin_sidebar_expanded'

const ADMIN_NAV = [
  { to: '/admin', end: true, icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/estoque', icon: Car, label: 'Estoque' },
  { to: '/admin/carros/novo', icon: PlusCircle, label: 'Novo carro' },
  { to: '/admin/financeiro', icon: Wallet, label: 'Financeiro' },
  { to: '/admin/historico', icon: History, label: 'Histórico' },
  { to: '/admin/contratos', icon: FileText, label: 'Contratos' },
  { to: '/admin/clientes', icon: Users, label: 'Clientes' },
  { to: '/admin/fornecedores', icon: Truck, label: 'Fornecedores' },
  { to: '/admin/equipe', icon: BadgeCheck, label: 'Equipe' },
  { to: '/admin/atividades', icon: ScrollText, label: 'Atividades' },
]

// Gerente: as abas do admin menos o Financeiro (custos, margem e lucro são só
// do admin); as demais telas escondem o que ele não pode ver ou fazer.
const MANAGER_NAV = ADMIN_NAV.filter((item) => item.to !== '/admin/financeiro')

const SELLER_NAV = [
  { to: '/admin', end: true, icon: TrendingUp, label: 'Minhas vendas' },
  { to: '/admin/estoque', icon: Car, label: 'Estoque' },
  { to: '/admin/contratos', icon: FileText, label: 'Contratos' },
  { to: '/admin/clientes', icon: Users, label: 'Clientes' },
]

function readExpanded() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    return false
  }
}

export default function AdminLayout() {
  const { user, isAdmin, isManager, isStaff, seller, signOut } = useAuth()
  const [expanded, setExpanded] = useState(readExpanded)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  function toggleExpanded() {
    setExpanded((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0')
      } catch {
        // armazenamento indisponível: só não lembra a escolha
      }
      return next
    })
  }

  const nav = isAdmin ? ADMIN_NAV : isManager ? MANAGER_NAV : SELLER_NAV
  const showLabels = expanded || mobileOpen

  return (
    <div className={`admin-shell ${expanded ? 'is-expanded' : 'is-collapsed'} ${mobileOpen ? 'is-mobile-open' : ''}`}>
      <header className="admin-mobilebar">
        <button type="button" className="admin-burger" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
          <Menu size={20} />
        </button>
        <Link to="/admin" className="admin-logo">
          <span className="logo-mark">
            <img src="/logo.jpg" alt="M&3 Veículos" />
          </span>
          <span>Painel M&3 Veículos</span>
        </Link>
      </header>

      {mobileOpen && <div className="admin-sidebar-backdrop" onClick={() => setMobileOpen(false)} />}

      <aside className="admin-sidebar">
        <div className="admin-sidebar-top">
          <button
            type="button"
            className="admin-burger admin-burger-desktop"
            onClick={toggleExpanded}
            aria-label={expanded ? 'Recolher menu' : 'Expandir menu'}
            aria-expanded={expanded}
          >
            <Menu size={20} />
          </button>
          <button
            type="button"
            className="admin-burger admin-burger-mobile"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
          {showLabels && (
            <Link to="/admin" className="admin-logo">
              <span className="logo-mark">
                <img src="/logo.jpg" alt="M&3 Veículos" />
              </span>
              <span>M&3 Veículos</span>
            </Link>
          )}
        </div>

        <nav className="admin-sidenav">
          {nav.map(({ to, end, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => (isActive ? 'is-active' : '')}
              data-tooltip={showLabels ? undefined : label}
              aria-label={label}
            >
              <Icon size={19} />
              <span className="admin-sidenav-label">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar-bottom">
          <a href="/" target="_blank" rel="noreferrer" data-tooltip={showLabels ? undefined : 'Ver site'} aria-label="Ver site">
            <ExternalLink size={18} />
            <span className="admin-sidenav-label">Ver site</span>
          </a>
          {showLabels && (
            <div className="admin-sidebar-user">
              <strong>{seller?.name || (isAdmin ? 'Administrador' : isStaff ? 'Gerente' : 'Vendedor')}</strong>
              {seller && <em>{isManager ? 'Gerente' : 'Vendedor'}</em>}
              <span>{user?.email}</span>
            </div>
          )}
          <button
            type="button"
            className="admin-sidebar-logout"
            onClick={signOut}
            data-tooltip={showLabels ? undefined : 'Sair'}
            aria-label="Sair"
          >
            <LogOut size={18} />
            <span className="admin-sidenav-label">Sair</span>
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  )
}
