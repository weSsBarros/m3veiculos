import { NavLink } from 'react-router-dom'

// Abas do Novo carro: o cadastro completo e as fotos pelo celular (rascunhos,
// seção 72), que ficam dentro do Novo carro em vez de um item próprio no menu.
export default function NewCarTabs() {
  return (
    <nav className="admin-tabs" aria-label="Novo carro">
      <NavLink to="/admin/carros/novo" end className={({ isActive }) => (isActive ? 'is-active' : '')}>
        Cadastro completo
      </NavLink>
      <NavLink to="/admin/carros/novo/fotos" className={({ isActive }) => (isActive ? 'is-active' : '')}>
        Fotos pelo celular
      </NavLink>
    </nav>
  )
}
