import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import {
  LayoutDashboard, Users, FileText, Upload, Receipt, DollarSign,
  UserCheck, BarChart3, CalendarDays, Megaphone, MessageSquareText,
  Send, Calculator, Settings, Landmark, FolderOpen, Brain, FileArchive,
  FileCheck, ChevronDown, ChevronRight, Menu as MenuIcon, X, Building2,
  Bot, Rocket, KeyRound, Download
} from 'lucide-react'
import { kiraArtisBildirimleriniOlustur } from '../services/kiraService'

// Sol menu yapisi. children varsa acilir alt menu olur.
const MENU = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/musteriler', icon: Users, label: 'Müşteriler' },
  { to: '/admin/giris-takip', icon: UserCheck, label: 'Giriş Takibi' },
  {
    id: 'beyan', icon: FileText, label: 'Beyanlar',
    children: [
      { to: '/admin/aylik-beyan-takip', icon: CalendarDays, label: 'Aylık Beyan Takip' },
      { to: '/admin/all-beyan', icon: BarChart3, label: 'Tüm Beyan Raporu' }
    ]
  },
  {
    id: 'yukle', icon: Upload, label: 'Yükleme',
    children: [
      { to: '/admin/toplu-beyan-yukle', icon: FileCheck, label: 'Beyan Yükle' },
      { to: '/admin/toplu-ice-aktar', icon: Upload, label: 'Klasörden Aktar' },
      { to: '/admin/smart-import', icon: Brain, label: 'AI Smart Import' },
      { to: '/admin/e-invoice', icon: FileArchive, label: 'e-Fatura XML' },
      { to: '/admin/documents', icon: FolderOpen, label: 'Belge Merkezi' }
    ]
  },
  {
    id: 'gonderim', icon: Send, label: 'Gönderim',
    children: [
      { to: '/admin/gonderim-merkezi', icon: Send, label: 'Gönderim Merkezi' },
      { to: '/admin/duyuru-merkezi', icon: Megaphone, label: 'Duyuru Merkezi' },
      { to: '/admin/mesaj-merkezi', icon: MessageSquareText, label: 'Mesaj Merkezi' }
    ]
  },
  {
    id: 'otomasyon', icon: Bot, label: 'Otomasyon',
    children: [
      { to: '/admin/otomasyon', icon: Rocket, label: 'Otomasyon Merkezi' },
      { to: '/admin/otomasyon-belgeler', icon: FileArchive, label: 'Gelen Belgeler' }
    ]
  },
  {
    id: 'raporlar', icon: FileText, label: 'Raporlar',
    children: [
      { to: '/admin/kira-stopaj', icon: Building2, label: 'Kira Stopaj Listesi' }
    ]
  },
  {
    id: 'beyannamelerim', icon: FileCheck, label: 'Beyannamelerim',
    children: [
      { to: '/admin/beyannamelerim/documents', icon: FolderOpen, label: 'Evraklarım' },
      { to: '/admin/beyannamelerim/beyannamelerim', icon: FileCheck, label: 'Beyanname Takibi' },
      { to: '/admin/beyannamelerim/invoices', icon: FileText, label: 'Faturalarım' },
      { to: '/admin/beyannamelerim/messages', icon: MessageSquareText, label: 'Mesajlarım' },
      { to: '/admin/beyannamelerim/upload', icon: Upload, label: 'Belge Yükle' },
      { to: '/admin/beyannamelerim/notifications', icon: CalendarDays, label: 'Vergi Takvimi' },
      { to: '/admin/beyannamelerim/profile', icon: Settings, label: 'Profilim' }
    ]
  },
  { to: '/admin/odeme-takip', icon: DollarSign, label: 'Ödeme Takip' },
  { to: '/admin/izin-takip', icon: UserCheck, label: 'Personel / İzin' },
  { to: '/admin/tax-calendar', icon: CalendarDays, label: 'Vergi Takvimi' },
  { to: '/admin/hesaplamalar', icon: Calculator, label: 'Hesaplamalar' },
  { to: '/admin/ayarlar', icon: Settings, label: 'Ayarlar' },
  { to: '/admin/ofisler', icon: Building2, label: 'Ofis Yönetimi', superAdminOnly: true },
  { to: '/admin/kurum-sifreleri', icon: KeyRound, label: 'Kurum Şifreleri', superAdminOnly: true }
]

export default function AdminSidebar() {
  const { user, office } = useAuth()
  const { clients } = useClients()
  const location = useLocation()
  const [acik, setAcik] = useState(false)
  const [acikGrup, setAcikGrup] = useState(null)
  const [hoverAcik, setHoverAcik] = useState(false)

  const path = location.pathname
  const superAdmin = user?.role === 'super_admin'

  // Rol filtresi uygulanmis menu
  const menu = MENU.filter(m => !m.superAdminOnly || superAdmin)

  // Aktif rota hangi gruptaysa o grubu otomatik ac
  useEffect(() => {
    const grup = MENU.find(m => m.children?.some(c => c.to === path))
    if (grup) setAcikGrup(grup.id)
  }, [path])

  // Sayfa degisince mobil menuyu kapat
  useEffect(() => { setAcik(false) }, [path])

  useEffect(() => {
    if (!clients?.length) return
    kiraArtisBildirimleriniOlustur(clients).catch(() => {})
  }, [clients])

  const aktifMi = (to) => to === '/admin' ? path === '/admin' : path.startsWith(to)

  return (
    <>
      {/* Mobil ac/kapa butonu */}
      <button
        onClick={() => setAcik(true)}
        className="lg:hidden fixed top-3 left-3 z-40 bg-blue-800/90 border border-blue-600/40 text-white p-2.5 rounded-xl shadow-lg"
        title="Menü"
      >
        <MenuIcon className="w-5 h-5" />
      </button>

      {acik && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setAcik(false)} />
      )}

      <aside
        onMouseEnter={() => setHoverAcik(true)}
        onMouseLeave={() => setHoverAcik(false)}
        className={`fixed lg:sticky top-0 left-0 z-50 lg:z-10 w-[268px] flex-shrink-0 h-screen bg-[#0a1730] border-r border-blue-800/40 flex flex-col transition-all duration-300 ${
          acik ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${hoverAcik ? 'lg:w-[268px]' : 'lg:w-[68px]'}`}
      >
        {/* Logo */}
        <div className="relative px-4 py-5 border-b border-blue-800/40">
          <Link to="/admin" onClick={() => setAcik(false)} className="block">
            <img
              src={office?.logo_url || '/logo-text.png'}
              alt={office?.name || 'MUBiS ERP'}
              className={`mx-auto object-contain drop-shadow-[0_6px_16px_rgba(0,0,0,0.4)] ${hoverAcik ? 'w-full max-w-[210px]' : 'w-full max-w-[210px] lg:max-w-[40px]'}`}
            />
          </Link>
          <button
            onClick={() => setAcik(false)}
            className="absolute top-3 right-3 p-2 text-gray-400 hover:text-white lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Menu */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-1">{menu.map(item => {
            if (item.children) {
              const grupAcik = acikGrup === item.id
              const grupAktif = item.children.some(c => aktifMi(c.to))
              return (
                <div key={item.id}>
                  <button
                    onClick={() => setAcikGrup(grupAcik ? null : item.id)}
                    title={item.label}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      grupAktif
                        ? 'bg-blue-600/25 text-white'
                        : 'text-blue-200/80 hover:bg-blue-800/40 hover:text-white'
                    } ${hoverAcik ? '' : 'lg:justify-center lg:px-2'}`}
                  >
                    <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                    <span className={`flex-1 text-left whitespace-nowrap ${hoverAcik ? '' : 'lg:hidden'}`}>{item.label}</span>
                    {grupAcik
                      ? <ChevronDown className={`w-4 h-4 text-gray-400 ${hoverAcik ? '' : 'lg:hidden'}`} />
                      : <ChevronRight className={`w-4 h-4 text-gray-500 ${hoverAcik ? '' : 'lg:hidden'}`} />}
                  </button>
                  {grupAcik && (
                    <div className={`mt-1 ml-3 pl-3 border-l border-blue-800/50 space-y-0.5 ${hoverAcik ? '' : 'lg:hidden'}`}>
                      {item.children.map(c => (
                        <Link
                          key={c.to}
                          to={c.to}
                          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] transition-all ${
                            aktifMi(c.to)
                              ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                              : 'text-blue-200/70 hover:bg-blue-800/40 hover:text-white'
                          }`}
                        >
                          <c.icon className="w-4 h-4 flex-shrink-0" />
                          <span className="whitespace-nowrap">{c.label}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )
            }

            return (
              <Link
                key={item.to}
                to={item.to}
                title={item.label}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  aktifMi(item.to)
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                    : 'text-blue-200/80 hover:bg-blue-800/40 hover:text-white'
                } ${hoverAcik ? '' : 'lg:justify-center lg:px-2'}`}
              >
                <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                <span className={`flex-1 whitespace-nowrap ${hoverAcik ? '' : 'lg:hidden'}`}>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Yardimci program indir */}
        <div className={`p-3 border-t border-blue-800/40 ${hoverAcik ? '' : 'lg:hidden'}`}>
          <a
            href="/downloads/mubis-gib-yardimci.exe"
            download
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium bg-green-600/20 text-green-300 hover:bg-green-600/30 hover:text-green-200 transition-all"
            title="MUBiS GIB Yardimci Programi"
          >
            <Download className="w-[18px] h-[18px] flex-shrink-0" />
            <span className="flex-1 whitespace-nowrap">Yardimci Programi Indir</span>
          </a>
          <p className="text-[10px] text-gray-500 mt-1.5 px-1">GIB/SGK otomasyonlari icin bilgisayara kurulur.</p>
        </div>

      </aside>
    </>
  )
}
