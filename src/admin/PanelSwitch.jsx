import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeftRight } from 'lucide-react'

// Troca rápida entre o painel da loja (/admin) e o painel WB.Dev (/wbdev), só para
// o dono da plataforma. Cada painel lembra a última tela aberta (nesta aba do
// navegador) e a troca volta para ela, sem entrar de novo.
const LAST_KEY = { loja: 'painel_ultima_loja', wbdev: 'painel_ultima_wbdev' }
const HOME = { loja: '/admin', wbdev: '/wbdev' }
const LABEL = { loja: 'Loja', wbdev: 'WB.Dev' }

// Só telas do próprio painel (o endereço antigo /admin/plataforma leva ao WB.Dev)
const BELONGS = {
  loja: (path) => /^\/admin(\/|$|\?)/.test(path) && !/^\/admin\/(plataforma|login)/.test(path),
  wbdev: (path) => /^\/wbdev(\/|$|\?)/.test(path),
}

function lastPath(panel) {
  try {
    const saved = sessionStorage.getItem(LAST_KEY[panel])
    return saved && BELONGS[panel](saved) ? saved : HOME[panel]
  } catch {
    return HOME[panel]
  }
}

// Guarda a tela aberta de cada painel
export function useRememberPanel(panel) {
  const { pathname, search } = useLocation()
  useEffect(() => {
    if (!BELONGS[panel](pathname)) return
    try {
      sessionStorage.setItem(LAST_KEY[panel], pathname + search)
    } catch {
      // sem armazenamento: a troca vai para o início do outro painel
    }
  }, [panel, pathname, search])
}

const badgeText = (n) => (n > 99 ? '99+' : n)

// current: 'loja' ou 'wbdev'. compact: só o ícone (menu recolhido e barra do
// celular). badge: pendências do painel WB.Dev (pagamentos a conferir e chamados).
export default function PanelSwitch({ current, compact = false, badge = 0, showTooltip = true }) {
  const navigate = useNavigate()
  const other = current === 'loja' ? 'wbdev' : 'loja'
  const go = (panel) => {
    if (panel !== current) navigate(lastPath(panel))
  }

  if (compact) {
    const label = other === 'wbdev' ? 'Ir para o painel WB.Dev' : 'Ir para o painel da loja'
    return (
      <button
        type="button"
        className="panel-switch-compact"
        onClick={() => go(other)}
        data-tooltip={showTooltip ? label : undefined}
        aria-label={label}
        title={showTooltip ? undefined : label}
      >
        <ArrowLeftRight size={18} />
        {badge > 0 && other === 'wbdev' && <span className="admin-nav-badge">{badgeText(badge)}</span>}
      </button>
    )
  }

  return (
    <div className="panel-switch" role="group" aria-label="Trocar de painel">
      {['loja', 'wbdev'].map((panel) => (
        <button
          key={panel}
          type="button"
          className={panel === current ? 'is-active' : ''}
          aria-pressed={panel === current}
          onClick={() => go(panel)}
          title={panel === current ? undefined : panel === 'wbdev' ? 'Ir para o painel WB.Dev (seus clientes)' : 'Ir para o painel da loja'}
        >
          {LABEL[panel]}
          {panel === 'wbdev' && panel !== current && badge > 0 && <span className="admin-nav-badge">{badgeText(badge)}</span>}
        </button>
      ))}
    </div>
  )
}
