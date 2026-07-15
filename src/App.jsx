import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import MobileNav from './components/MobileNav'
import Home from './pages/Home'
import Features from './pages/Features'
import Contact from './pages/Contact'
import Login from './pages/Login'
import AdminDashboard from './pages/AdminDashboard'
import ClientPortal from './pages/ClientPortal'
import ClientDetail from './pages/ClientDetail'
import NewClient from './pages/NewClient'
import Notifications from './pages/Notifications'
import Institutions from './pages/Institutions'
import TaxCalendar from './pages/TaxCalendar'
import AllBeyanReport from './pages/AllBeyanReport'
import TaxCenter from './pages/TaxCenter'
import EInvoiceDownloader from './pages/EInvoiceDownloader'
import DocumentCenter from './pages/DocumentCenter'
import BeyanTakip from './pages/BeyanTakip'
import SmartImport from './pages/SmartImport'
import ClientBeyanProfile from './pages/ClientBeyanProfile'
import AylikBeyanTakip from './pages/AylikBeyanTakip'
import ClientBeyanTakip from './pages/ClientBeyanTakip'
import MusteriListesi from './pages/MusteriListesi'
import SetupPage from './pages/SetupPage'

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
            <Route path="/setup" element={<SetupPage />} />
            
            {/* Admin Routes */}
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/musteriler" element={<MusteriListesi />} />
            <Route path="/admin/client/:id" element={<ClientDetail />} />
            <Route path="/admin/clients/new" element={<NewClient />} />
            <Route path="/admin/notifications" element={<Notifications />} />
            <Route path="/admin/institutions" element={<Institutions />} />
            <Route path="/admin/tax-calendar" element={<TaxCalendar />} />
            <Route path="/admin/all-beyan" element={<AllBeyanReport />} />
            <Route path="/admin/tax-center" element={<TaxCenter />} />
            <Route path="/admin/documents" element={<DocumentCenter />} />
            <Route path="/admin/e-invoice" element={<EInvoiceDownloader />} />
            <Route path="/admin/beyan-takip" element={<BeyanTakip />} />
            <Route path="/admin/smart-import" element={<SmartImport />} />
            <Route path="/admin/client/:id/beyan-profile" element={<ClientBeyanProfile />} />
            <Route path="/admin/aylik-beyan-takip" element={<AylikBeyanTakip />} />
            <Route path="/admin/client/:id/beyan-takip" element={<ClientBeyanTakip />} />

            {/* Client Routes */}
            <Route path="/portal" element={<ClientPortal />} />
            <Route path="/portal/institutions" element={<Institutions />} />
            <Route path="/portal/tax-center" element={<TaxCenter />} />
          </Routes>
        </main>
        <MobileNav />
        <Footer />
      </div>
    </Router>
  )
}

export default App