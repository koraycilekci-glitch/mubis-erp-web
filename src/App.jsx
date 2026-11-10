import { useEffect, useRef } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import ClientKiraStopaj from './pages/ClientKiraStopaj'
const StorageLinkHandler = () => null
import { useAuth } from './context/AuthContext'
import Navbar from './components/Navbar'
import YardimciSurumUyari from './components/YardimciSurumUyari'
import AdminSidebar from './components/AdminSidebar'
import NotificationCenter from './components/NotificationCenter'
import SayfaKilavuzu from './components/SayfaKilavuzu'
import Footer from './components/Footer'
import MobileNav from './components/MobileNav'
import MubisAssistant from './components/MubisAssistant'
import Home from './pages/Home'
import Features from './pages/Features'
import HizmetSayfasi from './pages/HizmetSayfasi'
import Hakkimizda from './pages/Hakkimizda'
import Contact from './pages/Contact'
import Login from './pages/Login'
import AdminDashboard from './pages/AdminDashboard'
import ClientPortal from './pages/ClientPortal'
import ClientDetail from './pages/ClientDetail'
import NewClient from './pages/NewClient'
import Notifications from './pages/Notifications'
import TaxCalendar from './pages/TaxCalendar'
import AllBeyanReport from './pages/AllBeyanReport'
import TaxCenter from './pages/TaxCenter'
import EInvoiceDownloader from './pages/EInvoiceDownloader'
import DocumentCenter from './pages/DocumentCenter'
import SmartImport from './pages/SmartImport'
import ClientBeyanProfile from './pages/ClientBeyanProfile'
import AylikBeyanTakip from './pages/AylikBeyanTakip'
import ClientBeyanTakip from './pages/ClientBeyanTakip'
import MusteriListesi from './pages/MusteriListesi'
import SetupPage from './pages/SetupPage'
import ChangePassword from './pages/ChangePassword'
import Settings from './pages/Settings'
import PratikHesaplamalar from './pages/PratikHesaplamalar'
import IzinTakip from './pages/IzinTakip'
import PersonelDuzenle from './pages/PersonelDuzenle'
import OdemeTakip from './pages/OdemeTakip'
import OdemeBasarili from './pages/OdemeBasarili'
import OdemeBasarisiz from './pages/OdemeBasarisiz'
import GonderimMerkezi from './pages/GonderimMerkezi'
import TopluBeyanYukle from './pages/TopluBeyanYukle'
import TopluIceAktar from './pages/TopluIceAktar'
import DuyuruMerkezi from './pages/DuyuruMerkezi'
import MesajMerkezi from './pages/MesajMerkezi'
import OfisYonetimi from './pages/OfisYonetimi'
import OtomasyonMerkezi from './pages/OtomasyonMerkezi'
import OtomasyonBelgeler from './pages/OtomasyonBelgeler'
import Tebligatlar from './pages/Tebligatlar'
import KiraStopajListesi from './pages/KiraStopajListesi'
import MusteriGirisTakip from './pages/MusteriGirisTakip'
import KurumSifreleri from './pages/KurumSifreleri'
import FaturaSorgulama from './pages/FaturaSorgulama'
import BeyannameKontrol from './pages/BeyannameKontrol'
import MuhasebeKayit from './pages/MuhasebeKayit'
import KontrolMerkezi from './pages/KontrolMerkezi'
import Taramalar from './pages/Taramalar'
import Fisler from './pages/Fisler'
import KdvDokumler from './pages/KdvDokumler'
import KrediKartiHasilat from './pages/KrediKartiHasilat'
import MusteriBorcDokumu from './pages/MusteriBorcDokumu'
import { KVCCAydinlatma, GizlilikPolitikasi, CerezPolitikasi, KullanimKosullari } from './pages/Yasal'
import CerezBanneri from './components/CerezBanneri'
import BeyannameGonderim from './pages/BeyannameGonderim'
import BeyanHazirlama from './pages/BeyanHazirlama'
import EFaturaKesim from './pages/EFaturaKesim'
import AdminOcrYukle from './pages/AdminOcrYukle'

// Admin/super admin kendi sirketinin beyannamelerini musteri portalı
// arayuzu uzerinden goruntuler (muhasebe odemesi haric)
// 2.7.623: ownerId verildiyse baska mukellefin dosyasi acilir —
// ClientPortal o client kaydinin verisiyle calisir (ownerClientId).
// Baskasinin dosyasinda Profilim sekmesi acilmaz (documents'a yonlendirilir).
function AdminBeyannamelerim() {
  const { tab, ownerId } = useParams()
  const etkinTab = ownerId && tab === 'profile' ? 'documents' : (tab || 'beyannamelerim')
  return (
    <ClientPortal
      embedded
      key={(ownerId || 'own') + '-' + (etkinTab || 'default')}
      initialTab={etkinTab}
      ownerClientId={ownerId || null}
    />
  )
}

function RootRedirect() {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-950 via-blue-900 to-blue-950">
        <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'personel') return <Navigate to="/admin" replace />
  if (user?.role === 'musteri' || user?.clientId) return <Navigate to="/portal" replace />
  return <Home />
}

// 2.7.542: Sekme geri yükleme (Chrome bellek tasarrufu / sekme çökmesi) sonrası
// Chrome bazen sekmenin SON BELGE URL'sinden yükler — SPA aslında başka sayfada
// olsa bile (pushState ile gezinilen sayfa unutulur). Kullanıcı ana ekrandayken
// yenileme yapınca beklenmedik bir alt sayfaya düşüyordu (örn. Aylık Beyan Takip).
// SPA konumunu sessionStorage'da tutar; yalnızca yenileme/geri dönme ile açılışta
// kayıtlı konum ile belge URL'si farklıysa gerçek konuma döndürür.
// Yeni sekmede link açma / adres elle yazma ('navigate') hiç etkilenmez.
function OturumRotaGeriYukle() {
  const location = useLocation()
  const navigate = useNavigate()
  const durum = useRef({ ilk: true })
  useEffect(() => {
    const mevcut = location.pathname + location.search
    if (durum.current.ilk) {
      durum.current.ilk = false
      try {
        const nav = performance.getEntriesByType('navigation')[0]
        const tur = nav ? nav.type : ''
        // document.wasDiscarded: Chrome bellek tasarrufuyla uyutulup geri
        // yuklenen sekmelerde true doner (tur 'navigate' bile olabilir).
        const geriYukleme = tur === 'reload' || tur === 'back_forward' || document.wasDiscarded === true
        const kayitli = sessionStorage.getItem('mubis_son_rota')
        if (geriYukleme && kayitli && kayitli !== mevcut) {
          navigate(kayitli, { replace: true })
          return // kayitli rota yazildi zaten
        }
      } catch { /* yoksay */ }
    }
    try { sessionStorage.setItem('mubis_son_rota', mevcut) } catch { /* yoksay */ }
  }, [location, navigate])
  return null
}

function AppContent() {
  const { user, loading, needsPasswordChange } = useAuth()
  const location = useLocation()

  if (loading) return null

  // Gecici sifre varsa sifre degistirme sayfasina zorla
  if (needsPasswordChange && user && location.pathname !== '/sifre-degistir') {
    return <Navigate to="/sifre-degistir" replace />
  }

  // 2.7.575: Müşteri admin sayfalarına düşemesin (ör. asistan tebligat bildirimi
  // eski linklerle /admin/etebligatlar'a götürüyordu) — portalın e-Tebligatlarım
  // sekmesine yönlendir.
  const personelRol = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'personel'
  if (user && !personelRol && location.pathname.startsWith('/admin')) {
    return <Navigate to="/portal?tab=tebligatlarim" replace />
  }

  // Giris / kurulum sayfalarinda ust menu gizlenir (tek logo gorunsun)
  const menusuzSayfalar = ['/giris', '/setup', '/sifre-degistir', '/portal']
  const menuGizli = menusuzSayfalar.includes(location.pathname)

  // Admin sayfalarinda ust menu yok; tum navigasyon sol yan menude
  const adminLayout = (user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'personel')
    && location.pathname.startsWith('/admin')

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-950 flex flex-col">
      {!menuGizli && !adminLayout && <Navbar />}
      <div className="flex flex-1 min-h-0">
        {adminLayout && <AdminSidebar />}
        {adminLayout && <NotificationCenter />}
        {adminLayout && <SayfaKilavuzu />}
        <main className="flex-1 min-w-0 pb-16 md:pb-0">
        {/* Guncelleme uyarisi: giris yapmis admin VE musteri sayfalarinda gorunur;
            giris yapilmamis herkese acik ana sayfada cikmaz */}
        {user && <YardimciSurumUyari />}
        <Routes>
          <Route path="/musteri/kira-stopaj" element={<ClientKiraStopaj />} />
          <Route path="/" element={<RootRedirect />} />
          <Route path="/ozellikler" element={<Features />} />
          <Route path="/hizmet/:slug" element={<HizmetSayfasi />} />
          <Route path="/hakkimizda" element={<Hakkimizda />} />
          <Route path="/iletisim" element={<Contact />} />
          <Route path="/hesaplamalar" element={<PratikHesaplamalar />} />
          <Route path="/giris" element={<Login />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/sifre-degistir" element={<ChangePassword />} />
          <Route path="/kvkk-aydinlatma" element={<KVCCAydinlatma />} />
          <Route path="/gizlilik-politikasi" element={<GizlilikPolitikasi />} />
          <Route path="/cerez-politikasi" element={<CerezPolitikasi />} />
          <Route path="/kullanim-kosullari" element={<KullanimKosullari />} />
          
          {/* Admin Routes */}
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/musteriler" element={<MusteriListesi />} />
          <Route path="/admin/giris-takip" element={<MusteriGirisTakip />} />
          <Route path="/admin/client/:id" element={<ClientDetail />} />
          <Route path="/admin/clients/new" element={<NewClient />} />
          <Route path="/admin/notifications" element={<Notifications />} />
          <Route path="/admin/tax-calendar" element={<TaxCalendar />} />
          <Route path="/admin/all-beyan" element={<AllBeyanReport />} />
          <Route path="/admin/tax-center" element={<TaxCenter />} />
          <Route path="/admin/documents" element={<DocumentCenter />} />
          <Route path="/admin/e-invoice" element={<EInvoiceDownloader />} />
          <Route path="/admin/smart-import" element={<SmartImport />} />
          <Route path="/admin/client/:id/beyan-profile" element={<ClientBeyanProfile />} />
          <Route path="/admin/beyan-takip" element={<Navigate to="/admin/aylik-beyan-takip" replace />} />
          <Route path="/admin/aylik-beyan-takip" element={<AylikBeyanTakip />} />
          <Route path="/admin/client/:id/beyan-takip" element={<ClientBeyanTakip />} />
          <Route path="/admin/ayarlar" element={<Settings />} />
          <Route path="/admin/hesaplamalar" element={<PratikHesaplamalar />} />
          <Route path="/admin/izin-takip" element={<IzinTakip />} />
          <Route path="/admin/izin-takip/personel/yeni" element={<PersonelDuzenle />} />
          <Route path="/admin/izin-takip/personel/:employeeId/duzenle" element={<PersonelDuzenle />} />
          <Route path="/admin/odeme-takip" element={<OdemeTakip />} />
          <Route path="/admin/gonderim-merkezi" element={<GonderimMerkezi />} />
          <Route path="/admin/toplu-beyan-yukle" element={<TopluBeyanYukle />} />
          <Route path="/admin/toplu-ice-aktar" element={<TopluIceAktar />} />
          <Route path="/admin/duyuru-merkezi" element={<DuyuruMerkezi />} />
          <Route path="/admin/mesaj-merkezi" element={<MesajMerkezi />} />
          <Route path="/admin/ofisler" element={<OfisYonetimi />} />
          <Route path="/admin/kurum-sifreleri" element={<KurumSifreleri />} />
          <Route path="/admin/otomasyon" element={<OtomasyonMerkezi />} />
          <Route path="/admin/etebligatlar" element={<Tebligatlar />} />
          <Route path="/admin/otomasyon-belgeler" element={<OtomasyonBelgeler />} />
          <Route path="/admin/kira-stopaj" element={<KiraStopajListesi />} />
          <Route path="/admin/fatura-sorgulama" element={<FaturaSorgulama />} />
          <Route path="/admin/beyanname-kontrol" element={<BeyannameKontrol />} />
          <Route path="/admin/beyanname-gonderim" element={<BeyannameGonderim />} />
          <Route path="/admin/beyan-hazirlama" element={<BeyanHazirlama />} />
          <Route path="/admin/muhasebe-kayit" element={<MuhasebeKayit />} />
          <Route path="/admin/kontrol-merkezi" element={<KontrolMerkezi />} />
          <Route path="/admin/taramalar" element={<Taramalar />} />
          <Route path="/admin/fisler" element={<Fisler />} />
          <Route path="/admin/kdv-dokumleri" element={<KdvDokumler />} />
          <Route path="/admin/kredi-karti-hasilat" element={<KrediKartiHasilat />} />
          <Route path="/admin/musteri-borc-dokumu" element={<MusteriBorcDokumu />} />
          <Route path="/admin/efatura-islemleri" element={<EFaturaKesim />} />
          <Route path="/admin/z-raporu-yukle" element={<AdminOcrYukle tip="zrapor" />} />
          <Route path="/admin/gider-fisi-yukle" element={<AdminOcrYukle tip="gider" />} />
          <Route path="/admin/beyannamelerim" element={<AdminBeyannamelerim />} />
          <Route path="/admin/beyannamelerim/o/:ownerId" element={<AdminBeyannamelerim />} />
          <Route path="/admin/beyannamelerim/o/:ownerId/:tab" element={<AdminBeyannamelerim />} />
          <Route path="/admin/beyannamelerim/:tab" element={<AdminBeyannamelerim />} />
          <Route path="/odeme-basarili" element={<OdemeBasarili />} />
          <Route path="/odeme-basarisiz" element={<OdemeBasarisiz />} />

          {/* Client Routes */}
          <Route path="/portal" element={<ClientPortal />} />
          <Route path="/portal/tax-center" element={<TaxCenter />} />
        </Routes>
        </main>
      </div>
      <MobileNav />
      <MubisAssistant />
      <Footer />
      <CerezBanneri />
    </div>
  )
}

function App() {
  return (
    <Router>
      <OturumRotaGeriYukle />
      <AppContent />
    </Router>
  )
}

export default App