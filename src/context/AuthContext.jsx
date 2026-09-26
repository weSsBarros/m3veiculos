import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured, COMPANY_ID } from '../lib/supabaseClient.js'
import { fetchMySeller } from '../lib/sellersApi.js'
import { setCarsAccess } from '../lib/carsApi.js'
import { logLogin } from '../lib/activityApi.js'

const AuthContext = createContext(null)

export const WRONG_COMPANY_MESSAGE = 'Essa conta não tem acesso a este painel.'

// A autenticação (auth.users) é compartilhada entre todas as empresas do
// projeto multi-tenant — só a RLS isola os dados. Aqui garantimos que uma
// conta só "entra" no painel se ela realmente pertencer à empresa deste site
// (mesma checagem que a RLS usa: current_company_id(), que também devolve
// null pra vendedor desativado).
async function belongsToThisCompany() {
  const { data, error } = await supabase.rpc('current_company_id')
  if (error) return false
  return data === COMPANY_ID
}

async function loadRole(userId) {
  const { data, error } = await supabase
    .from('user_company')
    .select('role')
    .eq('user_id', userId)
    .eq('company_id', COMPANY_ID)
    .maybeSingle()
  if (error || !data) return 'admin'
  return data.role || 'admin'
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [seller, setSeller] = useState(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let cancelled = false

    async function applySession(session) {
      if (!session?.user) {
        if (!cancelled) {
          setUser(null)
          setRole(null)
          setSeller(null)
          setLoading(false)
        }
        return
      }
      const ok = await belongsToThisCompany()
      if (cancelled) return
      if (!ok) {
        await supabase.auth.signOut()
        if (!cancelled) {
          setUser(null)
          setRole(null)
          setSeller(null)
          setLoading(false)
        }
        return
      }
      const userRole = await loadRole(session.user.id)
      const sellerRecord = userRole !== 'admin' ? await fetchMySeller(session.user.id).catch(() => null) : null
      if (cancelled) return
      setCarsAccess(userRole)
      setUser(session.user)
      setRole(userRole)
      setSeller(sellerRecord)
      setLoading(false)
    }

    supabase.auth.getSession().then(({ data }) => applySession(data.session))

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // TOKEN_REFRESHED não muda nada de acesso; evita recarregar o papel à toa
      if (event === 'TOKEN_REFRESHED') return
      applySession(session)
    })

    return () => {
      cancelled = true
      listener.subscription.unsubscribe()
    }
  }, [])

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    const ok = await belongsToThisCompany()
    if (!ok) {
      await supabase.auth.signOut()
      throw new Error(WRONG_COMPANY_MESSAGE)
    }
    logLogin().catch(() => {})
    return data.user
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const isAdmin = role === 'admin'
  const isManager = role === 'manager'
  // "Equipe de gestão": admin ou gerente (o gerente só não exclui nada)
  const isStaff = isAdmin || isManager
  // Custo de aquisição, gastos, margem e lucro: só o admin (o banco também bloqueia)
  const canSeeCosts = isAdmin
  // Valores das vendas (faturamento, comissões): admin, ou gerente que o admin
  // liberou para ver valores. O gerente em "só quantidades" vê só contagens.
  const canSeeSaleValues = isAdmin || (isManager && seller?.financeAccess === 'values')

  return (
    <AuthContext.Provider
      value={{ user, role, isAdmin, isManager, isStaff, canSeeCosts, canSeeSaleValues, seller, loading, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}
