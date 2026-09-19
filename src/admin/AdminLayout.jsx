import { Link, NavLink, Outlet } from 'react-router-dom'
import { LayoutGrid, Plus, LogOut, ExternalLink } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import './admin.css'

export default function AdminLayout() {
  const { user, signOut } = useAuth()

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <Link to="/admin" className="admin-logo">
          <span className="logo-mark">
            <img src="/logo.jpg" alt="M&3 Veículos" />
          </span>
          <span>Painel M&3 Veículos</span>
        </Link>

        <nav className="admin-nav">
          <NavLink to="/admin" end className={({ isActive }) => (isActive ? 'is-active' : '')}>
            <LayoutGrid size={16} /> Estoque
          </NavLink>
          <NavLink to="/admin/carros/novo" className={({ isActive }) => (isActive ? 'is-active' : '')}>
            <Plus size={16} /> Novo carro
          </NavLink>
        </nav>

        <div className="admin-topbar-actions">
          <a href="/" target="_blank" rel="noreferrer" className="admin-view-site">
            <ExternalLink size={15} /> Ver site
          </a>
          <span className="admin-user">{user?.email}</span>
          <button type="button" className="admin-logout" onClick={signOut}>
            <LogOut size={15} /> Sair
          </button>
        </div>
      </header>

      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  )
}
