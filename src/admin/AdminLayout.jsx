import { Suspense, useEffect, useRef, useState } from 'react'
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
  LifeBuoy,
  Handshake,
  Landmark,
  FileChartColumn,
  Settings,
  EyeOff,
  Gauge,
  Megaphone,
  Moon,
  Sun,
  Receipt,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import ViewAsBar from './ViewAsBar.jsx'
import AccountNotices from './AccountNotices.jsx'
import PanelSwitch, { useRememberPanel } from './PanelSwitch.jsx'
import { usePlatformBadges } from './platform/platformBadges.js'
import { fetchOpenTransfers } from '../lib/salesApi.js'
import { fetchOverdueInstallments } from '../lib/financingApi.js'
import { transferAlert } from '../utils/transfer.js'
import { tabForPath } from '../utils/panelSettings.js'
import { storeBillingNotice } from '../utils/billing.js'
import './admin.css'
import './admin-dark.css'
import { useAdminTheme } from '../utils/adminTheme.js'

// Nome da loja nas mensagens para a WB.Dev (avisos e WhatsApp do suporte)
const STORE_NAME = 'M&3 Veículos'

const SIDEBAR_KEY = 'admin_sidebar_expanded'

const ADMIN_NAV = [
  { to: '/admin', end: true, icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/estoque', icon: Car, label: 'Estoque' },
  { to: '/admin/carros/novo', icon: PlusCircle, label: 'Novo carro' },
  { to: '/admin/portais', icon: Megaphone, label: 'Portais' },
  { to: '/admin/vendas', icon: Handshake, label: 'Vendas', alert: 'transfers' },
  { to: '/admin/financeiro', icon: Wallet, label: 'Financeiro', alert: 'installments' },
  { to: '/admin/financiamentos-externos', icon: Landmark, label: 'Financ. externos' },
  { to: '/admin/relatorios', icon: FileChartColumn, label: 'Relatórios' },
  { to: '/admin/desempenho', icon: Gauge, label: 'Desempenho' },
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
// Configurações e Desempenho são só do admin.
function managerNav(canManageCustomerFinance) {
  return ADMIN_NAV.flatMap((item) => {
    if (item.to === '/admin/configuracoes' || item.to === '/admin/desempenho') return []
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
  const { user, isAdmin, isManager, isStaff, canManageCustomerFinance, seller, viewAs, signOut, isTabHidden, isPlatformAdmin, planTabs, account } = useAuth()
  const [expanded, setExpanded] = useState(readExpanded)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [tip, setTip] = useState(null)
  const [theme, toggleTheme] = useAdminTheme()
  const navRef = useRef(null)
  const { pathname } = useLocation()
  const alerts = usePostSaleAlerts(isStaff, canManageCustomerFinance, pathname)
  // Dono do sistema: troca para o painel WB.Dev (/wbdev), com as pendências de lá
  const platformBadges = usePlatformBadges(isPlatformAdmin, pathname)
  const platformPending = platformBadges.claims + platformBadges.unread
  useRememberPanel('loja')

  useEffect(() => {
    setMobileOpen(false)
    setTip(null)
    // A aba aberta fica visível mesmo quando a lista do menu rola
    navRef.current?.querySelector('a.is-active')?.scrollIntoView({ block: 'nearest' })
  }, [pathname])

  // Nome da aba ao lado do item, com o menu recolhido
  function showTip(event) {
    const item = event.target.closest?.('[data-tooltip]')
    if (!item) return
    const rect = item.getBoundingClientRect()
    setTip({ text: item.dataset.tooltip, top: rect.top + rect.height / 2, left: rect.right + 10 })
  }

  function hideTip(event) {
    // Passar do ícone para o texto do mesmo item não esconde
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

  // Abas escondidas em Configurações somem do menu (o início nunca some)
  const nav = (isAdmin ? ADMIN_NAV : isManager ? managerNav(canManageCustomerFinance) : SELLER_NAV)
    .filter((item) => item.end || !isTabHidden(tabForPath(item.to)))
  const hiddenHere = isTabHidden(tabForPath(pathname))
  // Aba fora do plano da loja (painel WB.Dev → Planos)
  const outOfPlan = Array.isArray(planTabs) && Boolean(tabForPath(pathname)) && !planTabs.includes(tabForPath(pathname))
  const showLabels = expanded || mobileOpen
  // Suporte: respostas novas da WB.Dev; Mensalidade: vence logo ou em atraso
  const supportUnread = account?.support?.unread || 0
  // Mensalidade que vence logo ou atrasou, e que a loja ainda não informou como paga
  const billingNotice = storeBillingNotice(account?.billing, new Date(), account?.payment?.claims || [])
  const billingAlert = Boolean(billingNotice && !billingNotice.informed)

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
        {isPlatformAdmin && <PanelSwitch current="loja" compact showTooltip={false} badge={platformPending} />}
      </header>

      {mobileOpen && <div className="admin-sidebar-backdrop" onClick={() => setMobileOpen(false)} />}

      <aside
        className="admin-sidebar"
        onMouseOver={showTip}
        onMouseOut={hideTip}
        onFocus={showTip}
        onBlur={hideTip}
      >
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

        {isPlatformAdmin && (
          <div className="panel-switch-slot">
            {showLabels ? <PanelSwitch current="loja" badge={platformPending} /> : <PanelSwitch current="loja" compact badge={platformPending} />}
          </div>
        )}

        <nav className="admin-sidenav" ref={navRef} onScroll={hideTip}>
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
          <NavLink
            to="/admin/suporte"
            className={({ isActive }) => (isActive ? 'is-active' : '')}
            data-tooltip={showLabels ? undefined : supportUnread ? `Suporte (${supportUnread} ${supportUnread === 1 ? 'resposta nova' : 'respostas novas'})` : 'Suporte'}
            aria-label="Suporte: falar com a WB.Dev e acompanhar os chamados"
          >
            <LifeBuoy size={18} />
            <span className="admin-sidenav-label">Suporte</span>
            {supportUnread > 0 && <span className="admin-nav-badge">{supportUnread > 99 ? '99+' : supportUnread}</span>}
          </NavLink>
          {isAdmin && !viewAs && (
            <NavLink
              to="/admin/mensalidade"
              className={({ isActive }) => (isActive ? 'is-active' : '')}
              data-tooltip={showLabels ? undefined : billingAlert ? 'Mensalidade (vence logo ou em atraso)' : 'Mensalidade'}
              aria-label="Mensalidade do sistema: PIX e pagamentos"
            >
              <Receipt size={18} />
              <span className="admin-sidenav-label">Mensalidade</span>
              {billingAlert && <span className="admin-nav-badge" title="Mensalidade vence logo ou está em atraso">!</span>}
            </NavLink>
          )}
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

      {tip && !showLabels && (
        <div className="admin-sidebar-tip" role="tooltip" style={{ top: tip.top, left: tip.left }}>
          {tip.text}
        </div>
      )}

      <main className="admin-main">
        <ViewAsBar />
        <AccountNotices storeName={STORE_NAME} />
        {/* Trocar a visão remonta a tela, que busca os dados de novo */}
        {hiddenHere ? (
          <div className="admin-page">
            <div className="admin-hidden-tab">
              <EyeOff size={28} />
              <h1>Aba escondida</h1>
              <p>
                {outOfPlan
                  ? 'Esta aba não faz parte do plano da loja. Para liberar, fale com a WB.Dev.'
                  : isAdmin
                    ? 'Esta aba está escondida em Configurações → Painel.'
                    : 'O administrador escondeu esta aba do painel.'}
              </p>
              <div className="admin-row-actions">
                <Link to="/admin" className="btn btn-primary">Voltar para o início</Link>
                {isAdmin && !viewAs && !outOfPlan && <Link to="/admin/configuracoes" className="btn btn-outline">Abrir Configurações</Link>}
              </div>
            </div>
          </div>
        ) : (
          // As telas do painel carregam à parte (App.jsx): enquanto chega, só o conteúdo espera
          <Suspense fallback={<p className="admin-muted">Carregando…</p>}>
            <Outlet key={viewAs ? `${viewAs.role}-${viewAs.sellerId || 'generico'}` : 'normal'} />
          </Suspense>
        )}
      </main>
    </div>
  )
}
