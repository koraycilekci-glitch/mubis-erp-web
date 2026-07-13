import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import MobileNav from './components/MobileNav'
import ProtectedRoute from './components/ProtectedRoute'
import Home from './pages/Home'
import Features from './pages/Features'
import Contact from './pages/Contact'
import Login from './pages/Login'
import AdminDashboard from './pages/AdminDashboard'
import ClientPortal from './pages/ClientPortal'
import ClientDetail from './pages/ClientDetail'
import Notifications from './pages/Notifications'
import Institutions from './pages/Institutions'

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-950 flex flex-col">
        <Navbar />
        <main className="flex-1 pb-16 md:pb-0">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/ozellikler" element={<Features />} />
            <Route path="/iletisim" element={<Contact />} />
            <Route path="/giris" element={<Login />} />
            
            {/* Admin */}
            <Route path="/admin" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            } />
            <Route path="/admin/client/:id" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <ClientDetail />
              </ProtectedRoute>
            } />
            <Route path="/admin/notifications" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Notifications />
              </ProtectedRoute>
            } />
            <Route path="/admin/institutions" element={
              <ProtectedRoute allowedRoles={['admin', 'client']}>
                <Institutions />
              </ProtectedRoute>
            } />
            
            {/* Musteri */}
            <Route path="/portal" element={
              <ProtectedRoute allowedRoles={['client']}>
                <ClientPortal />
              </ProtectedRoute>
            } />
            <Route path="/portal/institutions" element={
              <ProtectedRoute allowedRoles={['client']}>
                <Institutions />
              </ProtectedRoute>
            } />
          </Routes>
        </main>
        <MobileNav />
        <Footer />
      </div>
    </Router>
  )
}

export default App