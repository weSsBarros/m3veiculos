import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { Routes, Route, Outlet, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import { CarsProvider } from './context/CarsContext.jsx'
import TopBar from './components/TopBar.jsx'
import Header from './components/Header.jsx'
import Footer from './components/Footer.jsx'
import WhatsAppButton from './components/WhatsAppButton.jsx'
import Home from './pages/Home.jsx'
import Estoque from './pages/Estoque.jsx'
import CarDetail from './pages/CarDetail.jsx'
import About from './pages/About.jsx'
import Contact from './pages/Contact.jsx'
import AdminGuard, { AdminOnly, StaffOnly, CustomerFinanceOnly } from './admin/AdminGuard.jsx'
import { useAuth } from './context/AuthContext.jsx'
import { trackSiteVisit } from './lib/statsApi.js'
import { fetchCompanyStatus } from './lib/clientsApi.js'
import MaintenancePage from './components/MaintenancePage.jsx'
import { pageSeo } from './utils/seoPages.js'

// Painel da loja (/admin): carrega à parte, só quando alguém entra nele. O site
// público não baixa o código do painel (fica mais leve e mais rápido, o que
// também conta no Google).
const AdminLogin = lazy(() => import('./admin/AdminLogin.jsx'))
const AdminLayout = lazy(() => import('./admin/AdminLayout.jsx'))
const AdminCarList = lazy(() => import('./admin/AdminCarList.jsx'))
const AdminCarForm = lazy(() => import('./admin/AdminCarForm.jsx'))
const AdminQuickPhotos = lazy(() => import('./admin/AdminQuickPhotos.jsx'))
const AdminCarExpenses = lazy(() => import('./admin/AdminCarExpenses.jsx'))
const AdminDashboard = lazy(() => import('./admin/AdminDashboard.jsx'))
const AdminFinance = lazy(() => import('./admin/AdminFinance.jsx'))
const AdminCustomerFinance = lazy(() => import('./admin/AdminCustomerFinance.jsx'))
const AdminCompanyExpenses = lazy(() => import('./admin/AdminCompanyExpenses.jsx'))
const AdminBilling = lazy(() => import('./admin/AdminBilling.jsx'))
const AdminSupport = lazy(() => import('./admin/AdminSupport.jsx'))
const AdminSales = lazy(() => import('./admin/AdminSales.jsx'))
const AdminExternalFinance = lazy(() => import('./admin/AdminExternalFinance.jsx'))
const AdminReports = lazy(() => import('./admin/AdminReports.jsx'))
const AdminContracts = lazy(() => import('./admin/AdminContracts.jsx'))
const AdminContractTemplates = lazy(() => import('./admin/AdminContractTemplates.jsx'))
const AdminHistory = lazy(() => import('./admin/AdminHistory.jsx'))
const AdminSuppliers = lazy(() => import('./admin/AdminSuppliers.jsx'))
const AdminCustomers = lazy(() => import('./admin/AdminCustomers.jsx'))
const AdminSellers = lazy(() => import('./admin/AdminSellers.jsx'))
const AdminActivity = lazy(() => import('./admin/AdminActivity.jsx'))
const AdminSettings = lazy(() => import('./admin/AdminSettings.jsx'))
const SellerSales = lazy(() => import('./admin/SellerSales.jsx'))

// Painel WB.Dev (/wbdev, só o dono do sistema) e aba "Desempenho" (admin da
// loja): carregam à parte, quando abrem
const WbdevLayout = lazy(() => import('./admin/platform/WbdevLayout.jsx'))
const PlatformOverview = lazy(() => import('./admin/platform/PlatformOverview.jsx'))
const PlatformStore = lazy(() => import('./admin/platform/PlatformStore.jsx'))
const AdminPerformance = lazy(() => import('./admin/platform/AdminPerformance.jsx'))
const PlatformClients = lazy(() => import('./admin/platform/PlatformClients.jsx'))
const ClientFile = lazy(() => import('./admin/platform/ClientFile.jsx'))
const PlatformBilling = lazy(() => import('./admin/platform/PlatformBilling.jsx'))
const PlatformFinance = lazy(() => import('./admin/platform/PlatformFinance.jsx'))
const PlatformNotices = lazy(() => import('./admin/platform/PlatformNotices.jsx'))
const PlatformPlans = lazy(() => import('./admin/platform/PlatformPlans.jsx'))
const PlatformSupport = lazy(() => import('./admin/platform/PlatformSupport.jsx'))
const PlatformContacts = lazy(() => import('./admin/platform/PlatformContacts.jsx'))
const PlatformTerms = lazy(() => import('./admin/platform/PlatformTerms.jsx'))
const ContractTemplateEditor = lazy(() => import('./admin/ContractTemplateEditor.jsx'))
const AdminPortals = lazy(() => import('./admin/AdminPortals.jsx'))

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

// Painel WB.Dev: só o dono da plataforma (platform_admins)
function PlatformOnly({ children }) {
  const { isPlatformAdmin } = useAuth()
  if (!isPlatformAdmin) return <Navigate to="/admin" replace />
  return children
}

// Endereços antigos da aba Plataforma (/admin/plataforma/...) vão para o painel WB.Dev
function PlatformRedirect() {
  const { pathname, search } = useLocation()
  return <Navigate to={pathname.replace(/^\/admin\/plataforma/, '/wbdev') + search} replace />
}

function AdminHome() {
  const { isStaff } = useAuth()
  return isStaff ? <AdminDashboard /> : <SellerSales />
}

// Estoque: toda a equipe cadastra e edita (sem custo de compra e sem excluir,
// fora o admin); a tela esconde o que cada papel não pode ver ou fazer
function AdminStock() {
  return <AdminCarList />
}

// Conta a visita a cada página do site público. Quem está logado no painel
// (equipe da loja, no mesmo navegador) não entra na contagem.
function VisitTracker() {
  const { pathname } = useLocation()
  const { user, loading } = useAuth()
  useEffect(() => {
    if (!loading && !user) trackSiteVisit()
  }, [pathname, loading, user])
  return null
}

// Loja bloqueada pela WB.Dev (painel WB.Dev → Clientes → Acesso): o site mostra
// só a página de manutenção. ?manutencao=ver mostra a página sem bloquear.
function useMaintenance() {
  const preview = new URLSearchParams(window.location.search).get('manutencao') === 'ver'
  const [blocked, setBlocked] = useState(false)
  useEffect(() => {
    if (preview) return undefined
    let cancelled = false
    fetchCompanyStatus().then((status) => {
      if (!cancelled) setBlocked(status.blocked)
    })
    return () => {
      cancelled = true
    }
  }, [preview])
  return preview || blocked
}

// Título e descrição de cada página ao navegar no site (os mesmos que o
// api/pagina.php põe no HTML; na primeira página o HTML já veio certo). A página
// do carro cuida dos seus (carSeo.js).
function usePageSeo() {
  const { pathname } = useLocation()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (pathname.startsWith('/carro/')) return
    const env = import.meta.env
    const store = { name: env.VITE_STORE_NAME || '', city: env.VITE_STORE_CITY || '', hasAddress: env.VITE_STORE_HAS_ADDRESS === '1' }
    const page = pathname === '/' ? { title: env.VITE_STORE_TITLE, description: env.VITE_STORE_DESCRIPTION } : pageSeo(pathname, store)
    if (!page?.title || !store.name) return
    document.title = page.title
    document.querySelector('meta[name="description"]')?.setAttribute('content', page.description || '')
  }, [pathname])
}

function PublicLayout() {
  const maintenance = useMaintenance()
  usePageSeo()
  if (maintenance) return <MaintenancePage />

  return (
    <CarsProvider>
      <VisitTracker />
      <TopBar />
      <Header />
      <main>
        <Outlet />
      </main>
      <Footer />
      <WhatsAppButton />
    </CarsProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ScrollToTop />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/estoque" element={<Estoque />} />
          <Route path="/carro/:slug" element={<CarDetail />} />
          <Route path="/sobre" element={<About />} />
          <Route path="/contato" element={<Contact />} />
        </Route>

        <Route
          path="/admin/login"
          element={
            <Suspense fallback={<div className="admin-boot">Carregando…</div>}>
              <AdminLogin />
            </Suspense>
          }
        />
        <Route
          path="/admin"
          element={
            <AdminGuard>
              <Suspense fallback={<div className="admin-boot">Carregando…</div>}>
                <AdminLayout />
              </Suspense>
            </AdminGuard>
          }
        >
          <Route index element={<AdminHome />} />
          <Route path="estoque" element={<AdminStock />} />
          <Route path="contratos" element={<AdminContracts />} />
          <Route path="clientes" element={<AdminCustomers />} />
          <Route path="vendas" element={<AdminSales />} />
          <Route path="financiamentos-externos" element={<AdminExternalFinance />} />
          <Route path="relatorios" element={<AdminReports />} />
          <Route path="carros/novo" element={<AdminCarForm />} />
          <Route path="carros/novo/fotos" element={<AdminQuickPhotos />} />
          <Route path="fotos-celular" element={<Navigate to="/admin/carros/novo/fotos" replace />} />
          <Route path="carros/:id" element={<AdminCarForm />} />
          <Route path="carros/:id/gastos" element={<AdminCarExpenses />} />
          <Route path="suporte" element={<AdminSupport />} />
          <Route element={<StaffOnly><Outlet /></StaffOnly>}>
            <Route path="historico" element={<AdminHistory />} />
            <Route path="fornecedores" element={<AdminSuppliers />} />
            <Route path="equipe" element={<AdminSellers />} />
            <Route path="atividades" element={<AdminActivity />} />
            <Route
              path="portais"
              element={
                <Suspense fallback={<p className="admin-muted">Carregando…</p>}>
                  <AdminPortals />
                </Suspense>
              }
            />
          </Route>
          <Route element={<AdminOnly><Outlet /></AdminOnly>}>
            <Route path="financeiro" element={<AdminFinance />} />
            <Route path="financeiro/despesas" element={<AdminCompanyExpenses />} />
            <Route path="mensalidade" element={<AdminBilling />} />
            <Route path="contratos/modelos" element={<AdminContractTemplates />} />
            <Route
              path="contratos/modelos/:id"
              element={
                <Suspense fallback={<p className="admin-muted">Carregando…</p>}>
                  <ContractTemplateEditor />
                </Suspense>
              }
            />
            <Route path="configuracoes" element={<AdminSettings />} />
            <Route
              path="desempenho"
              element={
                <Suspense fallback={<p className="admin-muted">Carregando…</p>}>
                  <AdminPerformance />
                </Suspense>
              }
            />
          </Route>
          <Route element={<CustomerFinanceOnly><Outlet /></CustomerFinanceOnly>}>
            <Route path="financeiro/clientes" element={<AdminCustomerFinance />} />
          </Route>
        </Route>

        {/* Endereços antigos da aba Plataforma: fora do painel da loja, direto para o /wbdev */}
        <Route path="/admin/plataforma/*" element={<PlatformRedirect />} />

        <Route
          path="/wbdev"
          element={
            <AdminGuard>
              <PlatformOnly>
                <Suspense fallback={<div className="admin-boot">Carregando…</div>}>
                  <WbdevLayout />
                </Suspense>
              </PlatformOnly>
            </AdminGuard>
          }
        >
          <Route index element={<PlatformOverview />} />
          <Route path="clientes" element={<PlatformClients />} />
          <Route path="clientes/:slug" element={<ClientFile />} />
          <Route path="cobranca" element={<PlatformBilling />} />
          <Route path="financeiro" element={<PlatformFinance />} />
          <Route path="avisos" element={<PlatformNotices />} />
          <Route path="suporte" element={<PlatformSupport />} />
          <Route path="contatos" element={<PlatformContacts />} />
          <Route path="contrato" element={<PlatformTerms />} />
          <Route path="planos" element={<PlatformPlans />} />
          <Route path=":slug" element={<PlatformStore />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
