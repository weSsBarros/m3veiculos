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
import AdminGuard from './admin/AdminGuard.jsx'
import AdminLayout from './admin/AdminLayout.jsx'
import AdminCarList from './admin/AdminCarList.jsx'
import AdminCarForm from './admin/AdminCarForm.jsx'
import AdminCarExpenses from './admin/AdminCarExpenses.jsx'
import AdminDashboard from './admin/AdminDashboard.jsx'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function PublicLayout() {
  return (
    <CarsProvider>
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
          <Route index element={<AdminCarList />} />
          <Route path="financeiro" element={<AdminDashboard />} />
          <Route path="carros/novo" element={<AdminCarForm />} />
          <Route path="carros/:id" element={<AdminCarForm />} />
          <Route path="carros/:id/gastos" element={<AdminCarExpenses />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
