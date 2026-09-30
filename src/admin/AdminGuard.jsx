import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { isSupabaseConfigured } from '../lib/supabaseClient.js'
import SetupNotice from '../components/SetupNotice.jsx'

export default function AdminGuard({ children }) {
  const { user, loading } = useAuth()

  if (!isSupabaseConfigured) return <SetupNotice />
  if (loading) return <div className="admin-boot">Carregando…</div>
  if (!user) return <Navigate to="/admin/login" replace />

  return children
}

// Telas restritas. O bloqueio de verdade é a RLS no banco; isto só evita
// cair numa tela que não carregaria nada.
export function AdminOnly({ children }) {
  const { isAdmin } = useAuth()
  if (!isAdmin) return <Navigate to="/admin" replace />
  return children
}

// Admin ou gerente
export function StaffOnly({ children }) {
  const { isStaff } = useAuth()
  if (!isStaff) return <Navigate to="/admin" replace />
  return children
}

// Financeiro dos clientes: admin ou gerente que vê os valores das vendas
export function CustomerFinanceOnly({ children }) {
  const { canManageCustomerFinance } = useAuth()
  if (!canManageCustomerFinance) return <Navigate to="/admin" replace />
  return children
}
