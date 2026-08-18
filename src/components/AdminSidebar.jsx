import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  LayoutDashboard, Users, FileText, Upload, Receipt, DollarSign,
  UserCheck, BarChart3, CalendarDays, Megaphone, MessageSquareText,
  Send, Calculator, Settings, Landmark, FolderOpen, Brain, FileArchive,
  FileCheck, ChevronDown, ChevronRight, Menu as MenuIcon, X, LogOut, Building2,
  Bot, Rocket
} from 'lucide-react'

// Sol menu yapisi. children varsa acilir alt menu olur.
const MENU = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/musteriler', icon: Users, label: 'Müşteriler' },
  {
    id: 'beyan', icon: FileText, label: 'Beyanlar',
    children: [
      { to: '/admin/aylik-beyan-takip', icon: CalendarDays, label: 'Aylık Beyan Takip' },
      { to: '/admin/beyan-takip', icon: FileCheck, label: 'Beyan Takip' },
      { to: '/admin/all-beyan', icon: BarChart3, label: 'Tüm Beyan Raporu' }
    ]
  },
  {
    id: 'yukle', icon: Upload, label: 'Yükleme',
    children: [
      { to: '/admin/toplu-beyan-yukle', icon: FileCheck, label: 'Beyan Yükle' },
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
      { to: '/admin/mesaj-merkezi', icon: MessageSquareText, label: 'Mesaj Merkezi' },
      { to: '/admin/borc-bildirim', icon: DollarSign, label: 'Borç Bildirim' }
    ]
  },
  {
    id: 'otomasyon', icon: Bot, label: 'Otomasyon',
    children: [
      { to: '/admin/otomasyon', icon: Rocket, label: 'Otomasyon Merkezi' },
      { to: '/admin/otomasyon-belgeler', icon: FileArchive, label: 'Gelen Belgeler' }
    ]
  },
  { to: '/admin/odeme-takip', icon: DollarSign, label: 'Ödeme Takip' },
  { to: '/admin/izin-takip', icon: UserCheck, label: 'Personel / İzin' },
  { to: '/admin/tax-calendar', icon: CalendarDays, label: 'Vergi Takvimi' },
  { to: '/admin/hesaplamalar', icon: Calculator, label: 'Hesaplamalar' },
  { to: '/admin/institutions', icon: Landmark, label: 'Kurumlar' },
  { to: '/admin/ayarlar', icon: Settings, label: 'Ayarlar' },
  { to: '/admin/ofisler', icon: Building2, label: 'Ofis Yönetimi', superAdminOnly: true }
]

export default function AdminSidebar() {
  const { user, logout, office } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [acik, setAcik] = useState(false)
  const [acikGrup, setAcikGrup] = useState(null)

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

  const aktifMi = (to) => to === '/admin' ? path === '/admin' : path.startsWith(to)

  const cikis = () => {
    logout()
    navigate('/')
  }

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
        className={`fixed lg:sticky top-0 left-0 z-50 lg:z-10 w-[268px] flex-shrink-0 h-screen bg-[#0a1730] border-r border-blue-800/40 flex flex-col transition-transform duration-300 ${
          acik ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Logo */}
        <div className="relative px-4 py-5 border-b border-blue-800/40">
          <Link to="/admin" className="block">
            <img
              src={office?.logo_url || '/logo-text.png'}
              alt={office?.name || 'MUBiS ERP'}
              className="w-full max-w-[210px] mx-auto object-contain drop-shadow-[0_6px_16px_rgba(0,0,0,0.4)]"
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
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {menu.map(item => {
            if (item.children) {
              const grupAcik = acikGrup === item.id
              const grupAktif = item.children.some(c => aktifMi(c.to))
              return (
                <div key={item.id}>
                  <button
                    onClick={() => setAcikGrup(grupAcik ? null : item.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      grupAktif
                        ? 'bg-blue-600/25 text-white'
                        : 'text-blue-200/80 hover:bg-blue-800/40 hover:text-white'
                    }`}
                  >
                    <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                    <span className="flex-1 text-left">{item.label}</span>
                    {grupAcik
                      ? <ChevronDown className="w-4 h-4 text-gray-400" />
                      : <ChevronRight className="w-4 h-4 text-gray-500" />}
                  </button>
                  {grupAcik && (
                    <div className="mt-1 ml-3 pl-3 border-l border-blue-800/50 space-y-0.5">
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
                          <span>{c.label}</span>
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
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  aktifMi(item.to)
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                    : 'text-blue-200/80 hover:bg-blue-800/40 hover:text-white'
                }`}
              >
                <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Kullanici + cikis */}
        <div className="p-3 border-t border-blue-800/40 space-y-2">
          <Link
            to="/admin/ayarlar"
            className="flex items-center gap-3 bg-blue-900/40 border border-blue-700/30 rounded-xl p-3 hover:border-blue-600/50 transition-colors"
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-blue-950 font-bold text-xs">
              {(user?.name || user?.username || 'A').slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-medium truncate">{user?.name || user?.username || 'Admin'}</div>
              <div className="text-green-400 text-[11px] flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                {superAdmin ? 'Sistem Yöneticisi' : user?.role === 'admin' ? 'Administrator' : 'Personel'}
              </div>
              {office?.name && (
                <div className="text-blue-300/70 text-[11px] truncate mt-0.5">{office.name}</div>
              )}
            </div>
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </Link>
          <button
            onClick={cikis}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-[18px] h-[18px]" />
            <span>Çıkış Yap</span>
          </button>
        </div>
      </aside>
    </>
  )
}
