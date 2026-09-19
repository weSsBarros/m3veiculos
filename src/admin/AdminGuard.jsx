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
