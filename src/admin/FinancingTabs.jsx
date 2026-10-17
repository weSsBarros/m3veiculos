import { NavLink } from 'react-router-dom'

// Abas de Financ. externos: os financiamentos e o simulador de bancos (seção 90),
// que fica aqui em vez de um item próprio no menu (vale o mesmo acesso da aba).
export default function FinancingTabs() {
  return (
    <nav className="admin-tabs" aria-label="Financiamentos">
      <NavLink to="/admin/financiamentos-externos" end className={({ isActive }) => (isActive ? 'is-active' : '')}>
        Financiamentos externos
      </NavLink>
      <NavLink to="/admin/financiamentos-externos/simulador" className={({ isActive }) => (isActive ? 'is-active' : '')}>
        Simulador de bancos
      </NavLink>
    </nav>
  )
}
