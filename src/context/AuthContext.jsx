import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured, COMPANY_ID } from '../lib/supabaseClient.js'
import { fetchMySeller } from '../lib/sellersApi.js'
import { setCarsAccess } from '../lib/carsApi.js'
import { logLogin } from '../lib/activityApi.js'
import { setViewScope } from '../lib/viewScope.js'
import { fetchStoreSettings } from '../lib/storeSettingsApi.js'
import { fetchIsPlatformAdmin } from '../lib/platformApi.js'
import { fetchMyAccount, fetchCompanyStatus } from '../lib/clientsApi.js'
import { SUPPORT_DISPLAY } from '../utils/support.js'
import { normalizePanelSettings, menuTabHidden, isBlockHidden as blockHiddenIn } from '../utils/panelSettings.js'

const AuthContext = createContext(null)

export const WRONG_COMPANY_MESSAGE = 'Essa conta não tem acesso a este painel.'
// Loja bloqueada pela WB.Dev (painel WB.Dev → Clientes → Acesso)
export const SUSPENDED_MESSAGE = `O acesso a este painel está suspenso. Fale com a WB.Dev: ${SUPPORT_DISPLAY}.`

// Conta sem acesso: é porque a loja está bloqueada?
async function suspendedOrWrong() {
  const status = await fetchCompanyStatus().catch(() => ({ blocked: false }))
  return status.blocked ? SUSPENDED_MESSAGE : WRONG_COMPANY_MESSAGE
}

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
  // Sem conseguir ler o papel, o painel abre com o menor acesso (o banco
  // bloqueia de qualquer jeito, mas a tela não deve oferecer o que não pode)
  if (error || !data?.role) return 'seller'
  return data.role
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [seller, setSeller] = useState(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  // "Ver como" (só admin): { name, role, sellerId, userId, financeAccess, seller }
  const [viewAs, setViewAs] = useState(null)
  // Configurações → Painel: abas e blocos do Dashboard escondidos
  const [panelSettings, setPanelSettings] = useState(() => normalizePanelSettings(null))
  // Dono da plataforma (aba "Plataforma": números de todas as lojas)
  const [platformAdmin, setPlatformAdmin] = useState(false)
  // Conta da loja no painel WB.Dev: situação, abas do plano, avisos e (admin)
  // a mensalidade. null = ainda não carregou ou indisponível (painel normal).
  const [account, setAccount] = useState(null)
  // Login recusado porque a loja está bloqueada (a tela de login avisa)
  const [suspended, setSuspended] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let cancelled = false

    async function applySession(session) {
      if (!session?.user) {
        if (!cancelled) {
          setUser(null)
          setRole(null)
          setSeller(null)
          setViewAs(null)
          setPlatformAdmin(false)
          setAccount(null)
          setViewScope(null)
          setLoading(false)
        }
        return
      }
      const ok = await belongsToThisCompany()
      if (cancelled) return
      if (!ok) {
        const reason = await suspendedOrWrong()
        await supabase.auth.signOut()
        if (!cancelled) {
          setUser(null)
          setRole(null)
          setSeller(null)
          setSuspended(reason === SUSPENDED_MESSAGE)
          setLoading(false)
        }
        return
      }
      const userRole = await loadRole(session.user.id)
      const sellerRecord = userRole !== 'admin' ? await fetchMySeller(session.user.id).catch(() => null) : null
      if (cancelled) return
      const store = await fetchStoreSettings().catch(() => null)
      const owner = await fetchIsPlatformAdmin().catch(() => false)
      const acc = await fetchMyAccount().catch(() => null)
      if (cancelled) return
      setPlatformAdmin(owner)
      setAccount(acc)
      setSuspended(false)
      setPanelSettings(store ? store.panel : normalizePanelSettings(null))
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
      const reason = await suspendedOrWrong()
      await supabase.auth.signOut()
      throw new Error(reason)
    }
    logLogin().catch(() => {})
    return data.user
  }

  async function signOut() {
    setViewAs(null)
    setViewScope(null)
    await supabase.auth.signOut()
  }

  // "Ver como": o admin vê o painel exatamente como uma pessoa da equipe (ou
  // como vendedor/gerente genérico). person: registro da Equipe ou
  // { role, name } para a visão genérica. Só visualização: as gravações ficam
  // bloqueadas enquanto simula (lib/supabaseClient.js).
  function startViewAs(person) {
    if (role !== 'admin' || !person) return
    const next = {
      name: person.name,
      role: person.role === 'manager' ? 'manager' : 'seller',
      sellerId: person.id || null,
      userId: person.userId || person.formerUserId || null,
      financeAccess: person.financeAccess === 'values' ? 'values' : 'counts',
      seller: person.id ? person : null,
    }
    setViewScope(next)
    setViewAs(next)
  }

  function stopViewAs() {
    setViewScope(null)
    setViewAs(null)
  }

  // Papel efetivo nas telas: o simulado, se o admin estiver "vendo como"
  const simulating = role === 'admin' && viewAs !== null
  const effectiveRole = simulating ? viewAs.role : role
  const effectiveSeller = simulating ? viewAs.seller || { id: null, financeAccess: viewAs.financeAccess } : seller

  const isAdmin = effectiveRole === 'admin'
  const isManager = effectiveRole === 'manager'
  const isSeller = effectiveRole === 'seller'
  // "Equipe de gestão": admin ou gerente (o gerente só não exclui nada)
  const isStaff = isAdmin || isManager
  // Estoque: todos da equipe cadastram e editam carros, fotos, status, gastos
  // e documentos (sem custo de compra e sem excluir, fora o admin)
  const canEditStock = Boolean(effectiveRole)
  // Custo de aquisição, gastos, margem e lucro: só o admin (o banco também bloqueia)
  const canSeeCosts = isAdmin
  // Valores das vendas (faturamento, comissões): admin, ou gerente que o admin
  // liberou para ver valores. O gerente em "só quantidades" vê só contagens.
  const canSeeSaleValues = isAdmin || (isManager && effectiveSeller?.financeAccess === 'values')
  // Financeiro dos clientes (financiamento próprio): mesma regra dos valores das vendas
  const canManageCustomerFinance = canSeeSaleValues
  // Aba escondida para quem está usando o painel (inclusive no "ver como"):
  // cargo personalizado e menu próprio da pessoa (Equipe) valem por cima do papel
  const menuPerson = {
    role: effectiveRole,
    customRole: effectiveSeller?.customRole || null,
    panelTabs: effectiveSeller?.panelTabs ?? null,
    // Abas do plano da loja (painel WB.Dev → Planos); null = todas
    planTabs: account?.features ?? null,
  }
  const isTabHidden = (key) => menuTabHidden(panelSettings, key, menuPerson)
  const isBlockHidden = (key) => blockHiddenIn(panelSettings, key)

  return (
    <AuthContext.Provider
      value={{
        user,
        role: effectiveRole,
        realRole: role,
        isAdmin,
        isManager,
        isSeller,
        isStaff,
        canEditStock,
        canSeeCosts,
        canSeeSaleValues,
        canManageCustomerFinance,
        seller: effectiveSeller,
        panelSettings,
        setPanelSettings,
        isTabHidden,
        isBlockHidden,
        account,
        planTabs: account?.features ?? null,
        suspended,
        // Some no "ver como": a aba é do dono do sistema, não da equipe da loja
        isPlatformAdmin: platformAdmin && !simulating,
        viewAs: simulating ? viewAs : null,
        startViewAs,
        stopViewAs,
        loading,
        signIn,
        signOut,
      }}
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
