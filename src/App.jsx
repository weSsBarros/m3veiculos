import { useEffect, lazy, Suspense } from 'react'
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

// Abas "Plataforma" (só o dono do sistema) e "Desempenho" (admin da loja):
// carregam à parte, quando abrem
const PlatformOverview = lazy(() => import('./admin/platform/PlatformOverview.jsx'))
const PlatformStore = lazy(() => import('./admin/platform/PlatformStore.jsx'))
const AdminPerformance = lazy(() => import('./admin/platform/AdminPerformance.jsx'))

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function PlatformOnly() {
  const { isPlatformAdmin } = useAuth()
  if (!isPlatformAdmin) return <Navigate to="/admin" replace />
  return (
    <Suspense fallback={<p className="admin-muted">Carregando…</p>}>
      <Outlet />
    </Suspense>
  )
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

function PublicLayout() {
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
          <Route element={<StaffOnly><Outlet /></StaffOnly>}>
            <Route path="historico" element={<AdminHistory />} />
            <Route path="fornecedores" element={<AdminSuppliers />} />
            <Route path="equipe" element={<AdminSellers />} />
            <Route path="atividades" element={<AdminActivity />} />
          </Route>
          <Route element={<AdminOnly><Outlet /></AdminOnly>}>
            <Route path="financeiro" element={<AdminFinance />} />
            <Route path="contratos/modelos" element={<AdminContractTemplates />} />
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
          <Route element={<PlatformOnly />}>
            <Route path="plataforma" element={<PlatformOverview />} />
            <Route path="plataforma/:slug" element={<PlatformStore />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  )
}
