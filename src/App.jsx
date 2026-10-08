import { useEffect, useState, lazy, Suspense } from 'react'
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
import AdminLogin from './admin/AdminLogin.jsx'
import AdminGuard, { AdminOnly, StaffOnly, CustomerFinanceOnly } from './admin/AdminGuard.jsx'
import AdminLayout from './admin/AdminLayout.jsx'
import AdminCarList from './admin/AdminCarList.jsx'
import AdminCarForm from './admin/AdminCarForm.jsx'
import AdminCarExpenses from './admin/AdminCarExpenses.jsx'
import AdminDashboard from './admin/AdminDashboard.jsx'
import AdminFinance from './admin/AdminFinance.jsx'
import AdminCustomerFinance from './admin/AdminCustomerFinance.jsx'
import AdminCompanyExpenses from './admin/AdminCompanyExpenses.jsx'
import AdminBilling from './admin/AdminBilling.jsx'
import AdminSupport from './admin/AdminSupport.jsx'
import AdminSales from './admin/AdminSales.jsx'
import AdminExternalFinance from './admin/AdminExternalFinance.jsx'
import AdminReports from './admin/AdminReports.jsx'
import AdminContracts from './admin/AdminContracts.jsx'
import AdminContractTemplates from './admin/AdminContractTemplates.jsx'
import AdminHistory from './admin/AdminHistory.jsx'
import AdminSuppliers from './admin/AdminSuppliers.jsx'
import AdminCustomers from './admin/AdminCustomers.jsx'
import AdminSellers from './admin/AdminSellers.jsx'
import AdminActivity from './admin/AdminActivity.jsx'
import AdminSettings from './admin/AdminSettings.jsx'
import SellerSales from './admin/SellerSales.jsx'
import { useAuth } from './context/AuthContext.jsx'
import { trackSiteVisit } from './lib/statsApi.js'
import { fetchCompanyStatus } from './lib/clientsApi.js'
import MaintenancePage from './components/MaintenancePage.jsx'

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

function PublicLayout() {
  const maintenance = useMaintenance()
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

        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin"
          element={
            <AdminGuard>
              <AdminLayout />
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
