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
  Handshake,
  Landmark,
  FileChartColumn,
  Settings,
  EyeOff,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import ViewAsBar from './ViewAsBar.jsx'
import { fetchOpenTransfers } from '../lib/salesApi.js'
import { fetchOverdueInstallments } from '../lib/financingApi.js'
import { transferAlert } from '../utils/transfer.js'
import { tabForPath } from '../utils/panelSettings.js'
import './admin.css'

const SIDEBAR_KEY = 'admin_sidebar_expanded'

const ADMIN_NAV = [
  { to: '/admin', end: true, icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/estoque', icon: Car, label: 'Estoque' },
  { to: '/admin/carros/novo', icon: PlusCircle, label: 'Novo carro' },
  { to: '/admin/vendas', icon: Handshake, label: 'Vendas', alert: 'transfers' },
  { to: '/admin/financeiro', icon: Wallet, label: 'Financeiro', alert: 'installments' },
  { to: '/admin/financiamentos-externos', icon: Landmark, label: 'Financ. externos' },
  { to: '/admin/relatorios', icon: FileChartColumn, label: 'Relatórios' },
  { to: '/admin/historico', icon: History, label: 'Histórico' },
  { to: '/admin/contratos', icon: FileText, label: 'Contratos' },
  { to: '/admin/clientes', icon: Users, label: 'Clientes' },
  { to: '/admin/fornecedores', icon: Truck, label: 'Fornecedores' },
  { to: '/admin/equipe', icon: BadgeCheck, label: 'Equipe' },
  { to: '/admin/atividades', icon: ScrollText, label: 'Atividades' },
  { to: '/admin/configuracoes', icon: Settings, label: 'Configurações' },
]

// Gerente: as abas do admin, mas o Financeiro só com o "Financeiro dos
// clientes" e só se ele vê os valores das vendas (custos, margem e lucro são
// só do admin); as demais telas escondem o que ele não pode ver ou fazer.
function managerNav(canManageCustomerFinance) {
  return ADMIN_NAV.flatMap((item) => {
    if (item.to === '/admin/configuracoes') return []
    if (item.to !== '/admin/financeiro') return [item]
    return canManageCustomerFinance ? [{ ...item, to: '/admin/financeiro/clientes' }] : []
  })
}

const ALERT_TOOLTIPS = {
  transfers: (n) => `${n} ${n === 1 ? 'transferência' : 'transferências'} de veículo para acompanhar`,
  installments: (n) => `${n} ${n === 1 ? 'parcela' : 'parcelas'} de clientes em atraso`,
}

// Números no menu: transferências atrasadas ou vencendo em até 7 dias e
// parcelas de clientes em atraso. Recarrega a cada troca de tela.
function usePostSaleAlerts(isStaff, canManageCustomerFinance, pathname) {
  const [alerts, setAlerts] = useState({ transfers: 0, installments: 0 })
  useEffect(() => {
    let cancelled = false
    Promise.all([
      isStaff ? fetchOpenTransfers().catch(() => []) : [],
      canManageCustomerFinance ? fetchOverdueInstallments().catch(() => []) : [],
    ]).then(([transfers, installments]) => {
      if (cancelled) return
      setAlerts({ transfers: transfers.filter((sale) => transferAlert(sale)).length, installments: installments.length })
    })
    return () => {
      cancelled = true
    }
  }, [isStaff, canManageCustomerFinance, pathname])
  return alerts
}

const SELLER_NAV = [
  { to: '/admin', end: true, icon: TrendingUp, label: 'Minhas vendas' },
  { to: '/admin/estoque', icon: Car, label: 'Estoque' },
  { to: '/admin/carros/novo', icon: PlusCircle, label: 'Novo carro' },
  { to: '/admin/vendas', icon: Handshake, label: 'Vendas' },
  { to: '/admin/financiamentos-externos', icon: Landmark, label: 'Financ. externos' },
  { to: '/admin/contratos', icon: FileText, label: 'Contratos' },
  { to: '/admin/clientes', icon: Users, label: 'Clientes' },
  { to: '/admin/relatorios', icon: FileChartColumn, label: 'Relatórios' },
]

function readExpanded() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    return false
  }
}

export default function AdminLayout() {
  const { user, isAdmin, isManager, isStaff, canManageCustomerFinance, seller, viewAs, signOut, isTabHidden } = useAuth()
  const [expanded, setExpanded] = useState(readExpanded)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { pathname } = useLocation()
  const alerts = usePostSaleAlerts(isStaff, canManageCustomerFinance, pathname)

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

  // Abas escondidas em Configurações somem do menu (o início nunca some)
  const nav = (isAdmin ? ADMIN_NAV : isManager ? managerNav(canManageCustomerFinance) : SELLER_NAV).filter(
    (item) => item.end || !isTabHidden(tabForPath(item.to))
  )
  const hiddenHere = isTabHidden(tabForPath(pathname))
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
          {nav.map(({ to, end, icon: Icon, label, alert }) => {
            const count = alert ? alerts[alert] : 0
            const fullLabel = count ? `${label} (${ALERT_TOOLTIPS[alert](count)})` : label
            return (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => (isActive ? 'is-active' : '')}
                data-tooltip={showLabels ? undefined : fullLabel}
                aria-label={fullLabel}
              >
                <Icon size={19} />
                <span className="admin-sidenav-label">{label}</span>
                {count > 0 && (
                  <span className="admin-nav-badge" title={ALERT_TOOLTIPS[alert](count)}>
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </NavLink>
            )
          })}
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
        <ViewAsBar />
        {/* Trocar a visão remonta a tela, que busca os dados de novo */}
        {hiddenHere ? (
          <div className="admin-page">
            <div className="admin-hidden-tab">
              <EyeOff size={28} />
              <h1>Aba escondida</h1>
              <p>{isAdmin ? 'Esta aba está escondida em Configurações → Painel.' : 'O administrador escondeu esta aba do painel.'}</p>
              <div className="admin-row-actions">
                <Link to="/admin" className="btn btn-primary">Voltar para o início</Link>
                {isAdmin && !viewAs && <Link to="/admin/configuracoes" className="btn btn-outline">Abrir Configurações</Link>}
              </div>
            </div>
          </div>
        ) : (
          <Outlet key={viewAs ? `${viewAs.role}-${viewAs.sellerId || 'generico'}` : 'normal'} />
        )}
      </main>
    </div>
  )
}
