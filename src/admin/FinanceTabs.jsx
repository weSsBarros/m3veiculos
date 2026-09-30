import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

// Abas do Financeiro. Só o admin vê as duas; o gerente (com acesso aos
// valores) entra direto no Financeiro dos clientes.
export default function FinanceTabs() {
  const { isAdmin } = useAuth()
  if (!isAdmin) return null
  return (
    <nav className="admin-tabs" aria-label="Financeiro">
      <NavLink to="/admin/financeiro" end className={({ isActive }) => (isActive ? 'is-active' : '')}>
        Financeiro da loja
      </NavLink>
      <NavLink to="/admin/financeiro/clientes" className={({ isActive }) => (isActive ? 'is-active' : '')}>
        Financeiro dos clientes
      </NavLink>
    </nav>
  )
}
