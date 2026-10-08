import { Suspense, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Receipt,
  Wallet,
  LifeBuoy,
  Contact,
  FileSignature,
  Megaphone,
  Layers,
  Menu,
  X,
  LogOut,
  Moon,
  Sun,
  Presentation,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useAdminTheme } from '../../utils/adminTheme.js'
import useConfirm from '../../components/useConfirm.jsx'
import PanelSwitch, { useRememberPanel } from '../PanelSwitch.jsx'
import { usePlatformBadges } from './platformBadges.js'
import { usePresentation, setPresentation } from './presentation.js'
import '../admin.css'
import '../admin-dark.css'

// Painel WB.Dev (/wbdev): gestão dos clientes do sistema, separado do painel da
// loja. Só para o dono da plataforma (platform_admins); o mesmo login troca de
// painel num clique (PanelSwitch).

const SIDEBAR_KEY = 'admin_sidebar_expanded'

const NAV = [
  { to: '/wbdev', end: true, icon: LayoutDashboard, label: 'Visão geral' },
  { to: '/wbdev/clientes', icon: Users, label: 'Clientes' },
  { to: '/wbdev/cobranca', icon: Receipt, label: 'Cobrança', badge: 'claims' },
  { to: '/wbdev/financeiro', icon: Wallet, label: 'Financeiro' },
  { to: '/wbdev/suporte', icon: LifeBuoy, label: 'Suporte', badge: 'unread' },
  { to: '/wbdev/contatos', icon: Contact, label: 'Contatos' },
  { to: '/wbdev/contrato', icon: FileSignature, label: 'Contrato' },
  { to: '/wbdev/avisos', icon: Megaphone, label: 'Avisos' },
  { to: '/wbdev/planos', icon: Layers, label: 'Planos' },
]

const BADGE_TEXT = {
  claims: (n) => `${n} ${n === 1 ? 'pagamento informado' : 'pagamentos informados'} para conferir`,
  unread: (n) => `${n} ${n === 1 ? 'chamado com mensagem nova' : 'chamados com mensagem nova'}`,
}

function readExpanded() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    return false
  }
}

function Brand() {
  return (
    <Link to="/wbdev" className="admin-logo wbdev-brand">
      <span className="logo-mark">
        <img src="/logo.png" alt="" />
      </span>
      <span>
        WB.Dev
        <small>Gestão dos clientes</small>
      </span>
    </Link>
  )
}

export default function WbdevLayout() {
  const { user, signOut } = useAuth()
  const { confirm, confirmDialog } = useConfirm()
  const [expanded, setExpanded] = useState(readExpanded)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [tip, setTip] = useState(null)
  const [theme, toggleTheme] = useAdminTheme()
  const { presenting } = usePresentation()
  const navRef = useRef(null)
  const { pathname } = useLocation()
  const badges = usePlatformBadges(true, pathname)
  useRememberPanel('wbdev')

  useEffect(() => {
    setMobileOpen(false)
    setTip(null)
    navRef.current?.querySelector('a.is-active')?.scrollIntoView({ block: 'nearest' })
  }, [pathname])

  // Título da aba do navegador; ao voltar para a loja, volta o do site
  useEffect(() => {
    const previous = document.title
    document.title = presenting ? 'Resultados das lojas · WB.Dev' : 'Painel WB.Dev'
    return () => {
      document.title = previous
    }
  }, [presenting])

  function showTip(event) {
    const item = event.target.closest?.('[data-tooltip]')
    if (!item) return
    const rect = item.getBoundingClientRect()
    setTip({ text: item.dataset.tooltip, top: rect.top + rect.height / 2, left: rect.right + 10 })
  }

  function hideTip(event) {
    const from = event?.target?.closest?.('[data-tooltip]')
    if (from && event.relatedTarget?.closest?.('[data-tooltip]') === from) return
    setTip(null)
  }

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

  async function stopPresenting() {
    const ok = await confirm('Sair do modo apresentação? Cobrança, financeiro, suporte e contatos voltam a aparecer no menu.', {
      title: 'Sair do modo apresentação',
      confirmLabel: 'Sair',
      cancelLabel: 'Continuar apresentando',
    })
    if (ok) setPresentation(false)
  }

  const showLabels = expanded || mobileOpen
  const nav = presenting ? NAV.filter((item) => item.end) : NAV
  // No modo apresentação só a Visão geral abre
  const blocked = presenting && pathname !== '/wbdev'

  return (
    <div className={`admin-shell is-wbdev ${expanded ? 'is-expanded' : 'is-collapsed'} ${mobileOpen ? 'is-mobile-open' : ''}`}>
      <header className="admin-mobilebar">
        <button type="button" className="admin-burger" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
          <Menu size={20} />
        </button>
        <Brand />
        <PanelSwitch current="wbdev" compact showTooltip={false} />
      </header>

      {mobileOpen && <div className="admin-sidebar-backdrop" onClick={() => setMobileOpen(false)} />}

      <aside className="admin-sidebar" onMouseOver={showTip} onMouseOut={hideTip} onFocus={showTip} onBlur={hideTip}>
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
          <button type="button" className="admin-burger admin-burger-mobile" onClick={() => setMobileOpen(false)} aria-label="Fechar menu">
            <X size={20} />
          </button>
          {showLabels && <Brand />}
        </div>

        <div className="panel-switch-slot">
          {showLabels ? <PanelSwitch current="wbdev" /> : <PanelSwitch current="wbdev" compact />}
        </div>

        <nav className="admin-sidenav" ref={navRef} onScroll={hideTip} aria-label="Painel WB.Dev">
          {nav.map(({ to, end, icon: Icon, label, badge }) => {
            const count = badge && !presenting ? badges[badge] : 0
            const fullLabel = count ? `${label} (${BADGE_TEXT[badge](count)})` : label
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
                <span className="admin-sidenav-label">{presenting && end ? 'Resultados' : label}</span>
                {count > 0 && (
                  <span className="admin-nav-badge" title={BADGE_TEXT[badge](count)}>
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>

        <div className="admin-sidebar-bottom">
          <button
            type="button"
            className={`admin-sidebar-action ${presenting ? 'is-presenting' : ''}`}
            onClick={presenting ? stopPresenting : () => setPresentation(true)}
            data-tooltip={showLabels ? undefined : presenting ? 'Sair do modo apresentação' : 'Modo apresentação'}
            aria-label={presenting ? 'Sair do modo apresentação' : 'Modo apresentação: mostrar só os resultados das lojas'}
          >
            <Presentation size={18} />
            <span className="admin-sidenav-label">{presenting ? 'Sair da apresentação' : 'Modo apresentação'}</span>
          </button>
          <button
            type="button"
            className="admin-sidebar-action"
            onClick={toggleTheme}
            data-tooltip={showLabels ? undefined : theme === 'escuro' ? 'Tema claro' : 'Tema escuro'}
            aria-label={theme === 'escuro' ? 'Usar o tema claro' : 'Usar o tema escuro'}
          >
            {theme === 'escuro' ? <Sun size={18} /> : <Moon size={18} />}
            <span className="admin-sidenav-label">{theme === 'escuro' ? 'Tema claro' : 'Tema escuro'}</span>
          </button>
          {showLabels && (
            <div className="admin-sidebar-user">
              <strong>WB.Dev</strong>
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

      {tip && !showLabels && (
        <div className="admin-sidebar-tip" role="tooltip" style={{ top: tip.top, left: tip.left }}>
          {tip.text}
        </div>
      )}

      <main className="admin-main">
        {presenting && (
          <div className="wbdev-present-bar">
            <Presentation size={16} />
            <span>
              <strong>Modo apresentação</strong> · só os resultados das lojas aparecem.
            </span>
            <button type="button" className="btn btn-outline" onClick={stopPresenting}>
              Sair
            </button>
          </div>
        )}
        {blocked ? (
          <Navigate to="/wbdev" replace />
        ) : (
          <Suspense fallback={<p className="admin-muted">Carregando…</p>}>
            <Outlet />
          </Suspense>
        )}
      </main>
      {confirmDialog}
    </div>
  )
}
