import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { isSupabaseConfigured } from '../lib/supabaseClient.js'
import SetupNotice from '../components/SetupNotice.jsx'
import TermsGate from './TermsGate.jsx'

export default function AdminGuard({ children }) {
  const { user, loading, account } = useAuth()
  const location = useLocation()

  if (!isSupabaseConfigured) return <SetupNotice />
  if (loading) return <div className="admin-boot">Carregando…</div>
  // Depois de entrar, volta para a tela que a pessoa abriu (painel da loja ou WB.Dev)
  if (!user) return <Navigate to="/admin/login" replace state={{ from: location.pathname + location.search }} />
  // Contrato de adesão publicado e ainda não aceito pela loja (a equipe WB.Dev passa)
  if (account?.terms && !account.terms.accepted && !account.platformTeam) return <TermsGate />

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
