import { useEffect } from 'react'
import { Routes, Route, Outlet, useLocation } from 'react-router-dom'
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
import AdminGuard, { AdminOnly, StaffOnly } from './admin/AdminGuard.jsx'
import AdminLayout from './admin/AdminLayout.jsx'
import AdminCarList from './admin/AdminCarList.jsx'
import AdminCarForm from './admin/AdminCarForm.jsx'
import AdminCarExpenses from './admin/AdminCarExpenses.jsx'
import AdminDashboard from './admin/AdminDashboard.jsx'
import AdminFinance from './admin/AdminFinance.jsx'
import AdminContracts from './admin/AdminContracts.jsx'
import AdminContractTemplates from './admin/AdminContractTemplates.jsx'
import AdminHistory from './admin/AdminHistory.jsx'
import AdminSuppliers from './admin/AdminSuppliers.jsx'
import AdminCustomers from './admin/AdminCustomers.jsx'
import AdminSellers from './admin/AdminSellers.jsx'
import AdminActivity from './admin/AdminActivity.jsx'
import SellerSales from './admin/SellerSales.jsx'
import SellerStock from './admin/SellerStock.jsx'
import { useAuth } from './context/AuthContext.jsx'
import { trackSiteVisit } from './lib/statsApi.js'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function AdminHome() {
  const { isStaff } = useAuth()
  return isStaff ? <AdminDashboard /> : <SellerSales />
}

function AdminStock() {
  const { isStaff } = useAuth()
  return isStaff ? <AdminCarList /> : <SellerStock />
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
          <Route element={<StaffOnly><Outlet /></StaffOnly>}>
            <Route path="historico" element={<AdminHistory />} />
            <Route path="fornecedores" element={<AdminSuppliers />} />
            <Route path="equipe" element={<AdminSellers />} />
            <Route path="atividades" element={<AdminActivity />} />
            <Route path="carros/novo" element={<AdminCarForm />} />
            <Route path="carros/:id" element={<AdminCarForm />} />
            <Route path="carros/:id/gastos" element={<AdminCarExpenses />} />
          </Route>
          <Route element={<AdminOnly><Outlet /></AdminOnly>}>
            <Route path="financeiro" element={<AdminFinance />} />
            <Route path="contratos/modelos" element={<AdminContractTemplates />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  )
}
