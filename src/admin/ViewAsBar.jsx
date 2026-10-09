import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, ChevronDown, Undo2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { fetchSellers, roleLabel } from '../lib/sellersApi.js'

// "Ver como" (só o admin): escolhe uma pessoa da equipe e o painel passa a
// mostrar exatamente o que ela vê. Sem ninguém de um papel na equipe, dá para
// ver como um vendedor ou gerente genérico. Só visualização: as gravações
// ficam bloqueadas até voltar para admin.
export default function ViewAsBar() {
  const { realRole, viewAs, startViewAs, stopViewAs } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [team, setTeam] = useState(null)
  const [error, setError] = useState('')

  if (realRole !== 'admin') return null

  if (viewAs) {
    return (
      <div className="viewas-banner" role="status">
        <Eye size={17} />
        <span>
          Você está vendo o painel como <strong>{viewAs.name}</strong> ({roleLabel(viewAs.role, viewAs.seller?.customRole).toLowerCase()}). Só visualização:
          nada é salvo enquanto estiver nesta visão.
        </span>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            stopViewAs()
            navigate('/admin')
          }}
        >
          <Undo2 size={15} /> Voltar para admin
        </button>
      </div>
    )
  }

  async function toggle() {
    const next = !open
    setOpen(next)
    // Recarrega a cada abertura: cargo e menu da pessoa podem ter mudado na Equipe
    if (next) {
      try {
        setError('')
        // Administrador na Equipe (seção 69) não entra: ver como ele é o próprio painel
        setTeam((await fetchSellers()).filter((s) => s.active && !s.deletedAt && s.role !== 'admin'))
      } catch (err) {
        setError(err.message || 'Não foi possível carregar a equipe.')
        setTeam((prev) => prev || [])
      }
    }
  }

  function choose(person) {
    setOpen(false)
    startViewAs(person)
    navigate('/admin')
  }

  const managers = (team || []).filter((s) => s.role === 'manager')
  const sellers = (team || []).filter((s) => s.role !== 'manager')

  return (
    <div className="viewas-bar">
      <button type="button" className="viewas-toggle" onClick={toggle} aria-expanded={open}>
        <Eye size={15} /> Ver como… <ChevronDown size={14} />
      </button>
      {open && (
        <>
          <div className="viewas-backdrop" onClick={() => setOpen(false)} />
          <div className="viewas-menu" role="menu">
            <p className="viewas-menu-note">Veja o painel como a pessoa vê (só visualização).</p>
            {team === null && <p className="admin-muted">Carregando a equipe…</p>}
            {error && <p className="admin-error">{error}</p>}
            {team !== null && (
              <>
                <span className="viewas-menu-group">Gerentes</span>
                {managers.map((s) => (
                  <button key={s.id} type="button" role="menuitem" onClick={() => choose(s)}>
                    {s.name}
                    {s.customRole && <small> ({s.customRole.name})</small>}
                  </button>
                ))}
                {managers.length === 0 && (
                  <button type="button" role="menuitem" onClick={() => choose({ role: 'manager', name: 'um gerente (visão genérica)' })}>
                    Gerente (visão genérica)
                  </button>
                )}
                <span className="viewas-menu-group">Vendedores</span>
                {sellers.map((s) => (
                  <button key={s.id} type="button" role="menuitem" onClick={() => choose(s)}>
                    {s.name}
                    {s.customRole && <small> ({s.customRole.name})</small>}
                  </button>
                ))}
                {sellers.length === 0 && (
                  <button type="button" role="menuitem" onClick={() => choose({ role: 'seller', name: 'um vendedor (visão genérica)' })}>
                    Vendedor (visão genérica)
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
