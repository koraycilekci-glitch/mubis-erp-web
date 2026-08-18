import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { 
  LogOut, LayoutDashboard, Menu, X, 
  Brain, Users,
  FileText, Bell,
  FileArchive, FileCheck, Calendar,
  Calculator, Settings, CalendarDays, DollarSign,
  Send, Upload, Megaphone,
  ChevronDown, FolderOpen, MessageSquare
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import PublicHeader from './PublicHeader'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [openDropdown, setOpenDropdown] = useState(null)
  const dropdownRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/')
    setIsMenuOpen(false)
  }

  const getInitials = (name) => {
    if (!name) return '?'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  const dashboardPath = user?.role === 'admin' ? '/admin' : user ? '/portal' : '/'

  // Misafir kullanicilar icin kurumsal ust menu
  if (!user) return <PublicHeader />

  const DropdownMenu = ({ id, icon: Icon, label, items }) => {
    const isOpen = openDropdown === id
    return (
      <div className="relative" ref={isOpen ? dropdownRef : null}>
        <button
          onClick={() => setOpenDropdown(isOpen ? null : id)}
          className="bg-blue-600/80 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium hover:shadow-md transition-all duration-200 text-sm flex items-center gap-1.5"
        >
          <Icon className="w-4 h-4" />
          <span>{label}</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && (
          <div className="absolute top-full left-0 mt-1 w-56 bg-blue-900 rounded-lg shadow-xl border border-blue-700/50 py-1 z-50">
            {items.map(item => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpenDropdown(null)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-300 hover:bg-blue-800 hover:text-white transition-colors"
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <nav className="bg-blue-950/95 backdrop-blur-sm border-b border-blue-800/50 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
        <div className="flex justify-between items-center h-20">
          {/* Logo - kullanici rolune gore yonlendir */}
          <Link to={dashboardPath} className="flex items-center space-x-2 flex-shrink-0">
            <img src="/logo-icon.png" alt="MUBiS ERP" className="w-12 h-12 rounded-xl object-contain" />
            <div className="hidden sm:block">
              <span className="text-2xl font-bold text-white">MUBiS</span>
              <span className="text-yellow-400 text-xs block -mt-1">ERP</span>
            </div>
          </Link>

          {/* Desktop Menü */}
          <div className="hidden md:flex items-center space-x-1.5">
            {user ? (
              <>
                {user.role === 'client' && (
                  <Link 
                    to="/portal"
                    className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-yellow-500/30 transition-all duration-300 text-sm flex items-center gap-1.5"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    <span>Panelim</span>
                  </Link>
                )}
                {user.role === 'admin' && (
                  <div className="flex items-center gap-1">
                    <Link 
                      to="/admin"
                      className="bg-blue-600/80 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium hover:shadow-md transition-all duration-200 text-sm flex items-center gap-1.5"
                    >
                      <LayoutDashboard className="w-4 h-4" />
                      <span>Dashboard</span>
                    </Link>
                    <Link 
                      to="/admin/musteriler"
                      className="bg-blue-600/80 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium hover:shadow-md transition-all duration-200 text-sm flex items-center gap-1.5"
                    >
                      <Users className="w-4 h-4" />
                      <span>Müşteriler</span>
                    </Link>
                    <Link 
                      to="/admin/aylik-beyan-takip"
                      className="bg-emerald-600/80 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium hover:shadow-md transition-all duration-200 text-sm flex items-center gap-1.5"
                    >
                      <Calendar className="w-4 h-4" />
                      <span>Beyanlar</span>
                    </Link>
                    
                    {/* Yükle Dropdown */}
                    <DropdownMenu
                      id="yukle"
                      icon={Upload}
                      label="Yukle"
                      items={[
                        { to: '/admin/toplu-beyan-yukle', icon: FileCheck, label: 'Beyan Yükle' },
                        { to: '/admin/smart-import', icon: Brain, label: 'AI Import' },
                        { to: '/admin/e-invoice', icon: FileArchive, label: 'e-Fatura' }
                      ]}
                    />
                    
                    <Link 
                      to="/admin/hesaplamalar"
                      className="bg-orange-600/80 hover:bg-orange-500 text-white px-4 py-2 rounded-lg font-medium hover:shadow-md transition-all duration-200 text-sm flex items-center gap-1.5"
                    >
                      <Calculator className="w-4 h-4" />
                      <span>Hesap</span>
                    </Link>
                    <Link 
                      to="/admin/izin-takip"
                      className="bg-teal-600/80 hover:bg-teal-500 text-white px-4 py-2 rounded-lg font-medium hover:shadow-md transition-all duration-200 text-sm flex items-center gap-1.5"
                    >
                      <CalendarDays className="w-4 h-4" />
                      <span>Izin</span>
                    </Link>
                    <Link 
                      to="/admin/odeme-takip"
                      className="bg-emerald-600/80 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium hover:shadow-md transition-all duration-200 text-sm flex items-center gap-1.5"
                    >
                      <DollarSign className="w-4 h-4" />
                      <span>Odeme</span>
                    </Link>
                    
                    {/* Gönderim Dropdown */}
                    <DropdownMenu
                      id="gonderim"
                      icon={Send}
                      label="Gonderim"
                      items={[
                        { to: '/admin/gonderim-merkezi', icon: FolderOpen, label: 'Gonderim Merkezi' },
                        { to: '/admin/duyuru-merkezi', icon: Megaphone, label: 'Duyuru Merkezi' },
                        { to: '/admin/mesaj-merkezi', icon: MessageSquare, label: 'Mesaj Merkezi' },
                        { to: '/admin/borc-bildirim', icon: DollarSign, label: 'Borc Bildirim' }
                      ]}
                    />
                    
                    <Link 
                      to="/admin/ayarlar"
                      className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-blue-800/30 transition-colors"
                      title="Ayarlar"
                    >
                      <Settings className="w-5 h-5" />
                    </Link>
                  </div>
                )}

                <div className="flex items-center gap-2.5 ml-1 pl-2.5 border-l border-blue-700/50">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                      user.role === 'admin' 
                        ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-blue-950' 
                        : 'bg-gradient-to-br from-blue-400 to-blue-600 text-white'
                    }`}>
                      {getInitials(user.name || user.username)}
                    </div>
                    <div className="hidden xl:block">
                      <div className="text-white text-sm font-medium">{user.name || user.username}</div>
                      <div className="text-gray-400 text-xs">
                        {user.role === 'admin' ? 'Admin' : user.company || 'Müşteri'}
                      </div>
                    </div>
                  </div>
                  
                  <button 
                    onClick={handleLogout}
                    className="text-gray-400 hover:text-red-400 transition-colors p-2 rounded-lg hover:bg-red-500/10"
                    title="Çıkış Yap"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <Link
                  to="/hesaplamalar"
                  className="bg-orange-600/80 hover:bg-orange-500 text-white px-4 py-2 rounded-lg font-semibold transition-all duration-300 text-sm flex items-center gap-1.5"
                >
                  <Calculator className="w-4 h-4" />
                  <span>Hesaplamalar</span>
                </Link>
                <Link
                  to="/giris"
                  className="bg-gradient-to-r from-blue-600 to-blue-800 text-white px-5 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-300 text-sm"
                >
                  Giriş Yap
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="md:hidden text-white p-1.5 hover:bg-blue-800/30 rounded-lg transition-colors"
          >
            {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Menü */}
        {isMenuOpen && (
          <div className="md:hidden py-3 border-t border-blue-800/50 mt-1">
            <div className="flex flex-col space-y-1.5">
              {user ? (
                <>
                  <div className="flex items-center space-x-3 px-3 py-2 bg-blue-800/30 rounded-lg mt-1 cursor-pointer" onClick={() => { navigate(dashboardPath); setIsMenuOpen(false) }}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                      user.role === 'admin' 
                        ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-blue-950' 
                        : 'bg-gradient-to-br from-blue-400 to-blue-600 text-white'
                    }`}>
                      {getInitials(user.name || user.username)}
                    </div>
                    <div>
                      <div className="text-white text-sm font-medium">{user.name || user.username}</div>
                      <div className="text-gray-400 text-xs">
                        {user.role === 'admin' ? 'Admin' : user.company || 'Müşteri'}
                      </div>
                    </div>
                  </div>
                  
                  {user.role === 'client' && (
                    <Link 
                      to="/portal"
                      onClick={() => setIsMenuOpen(false)}
                      className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-4 py-2.5 rounded-lg font-semibold text-center flex items-center justify-center space-x-2 text-sm"
                    >
                      <LayoutDashboard className="w-4 h-4" />
                      <span>Musteri Panelim</span>
                    </Link>
                  )}
                  
                  {user.role === 'admin' && (
                    <>
                      <Link 
                        to="/admin"
                        onClick={() => setIsMenuOpen(false)}
                        className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-4 py-2.5 rounded-lg font-semibold text-center flex items-center justify-center space-x-2 text-sm"
                      >
                        <LayoutDashboard className="w-4 h-4" />
                        <span>Dashboard</span>
                      </Link>
                      <Link 
                        to="/admin/musteriler"
                        onClick={() => setIsMenuOpen(false)}
                        className="bg-gradient-to-r from-blue-500 to-blue-700 text-white px-4 py-2.5 rounded-lg font-semibold text-center flex items-center justify-center space-x-2 text-sm"
                      >
                        <Home className="w-4 h-4" />
                        <span>Musteriler</span>
                      </Link>
                      <Link 
                        to="/admin/aylik-beyan-takip"
                        onClick={() => setIsMenuOpen(false)}
                        className="bg-gradient-to-r from-emerald-500 to-emerald-700 text-white px-4 py-2.5 rounded-lg font-semibold text-center flex items-center justify-center space-x-2 text-sm"
                      >
                        <Calendar className="w-4 h-4" />
                        <span>Beyanlar</span>
                      </Link>
                      <Link 
                        to="/admin/toplu-beyan-yukle"
                        onClick={() => setIsMenuOpen(false)}
                        className="bg-gradient-to-r from-cyan-500 to-cyan-700 text-white px-4 py-2.5 rounded-lg font-semibold text-center flex items-center justify-center space-x-2 text-sm"
                      >
                        <Upload className="w-4 h-4" />
                        <span>Toplu Yukle</span>
                      </Link>
                      <Link 
                        to="/admin/smart-import"
                        onClick={() => setIsMenuOpen(false)}
                        className="bg-gradient-to-r from-purple-500 to-purple-700 text-white px-4 py-2.5 rounded-lg font-semibold text-center flex items-center justify-center space-x-2 text-sm"
                      >
                        <Brain className="w-4 h-4" />
                        <span>AI Smart Import</span>
                      </Link>
                      <Link 
                        to="/admin/e-invoice"
                        onClick={() => setIsMenuOpen(false)}
                        className="bg-gradient-to-r from-indigo-500 to-indigo-700 text-white px-4 py-2.5 rounded-lg font-semibold text-center flex items-center justify-center space-x-2 text-sm"
                      >
                        <FileArchive className="w-4 h-4" />
                        <span>e-Fatura XML</span>
                      </Link>
                      <Link 
                        to="/admin/hesaplamalar"
                        onClick={() => setIsMenuOpen(false)}
                        className="bg-gradient-to-r from-orange-500 to-orange-700 text-white px-4 py-2.5 rounded-lg font-semibold text-center flex items-center justify-center space-x-2 text-sm"
                      >
                        <Calculator className="w-4 h-4" />
                        <span>Pratik Hesaplamalar</span>
                      </Link>
                      <Link 
                        to="/admin/izin-takip"
                        onClick={() => setIsMenuOpen(false)}
                        className="bg-gradient-to-r from-teal-500 to-teal-700 text-white px-4 py-2.5 rounded-lg font-semibold text-center flex items-center justify-center space-x-2 text-sm"
                      >
                        <CalendarDays className="w-4 h-4" />
                        <span>Izin Takip</span>
                      </Link>
                      <Link 
                        to="/admin/odeme-takip"
                        onClick={() => setIsMenuOpen(false)}
                        className="bg-gradient-to-r from-emerald-500 to-emerald-700 text-white px-4 py-2.5 rounded-lg font-semibold text-center flex items-center justify-center space-x-2 text-sm"
                      >
                        <DollarSign className="w-4 h-4" />
                        <span>Odeme Takip</span>
                      </Link>
                      <Link 
                        to="/admin/gonderim-merkezi"
                        onClick={() => setIsMenuOpen(false)}
                        className="bg-gradient-to-r from-pink-500 to-pink-700 text-white px-4 py-2.5 rounded-lg font-semibold text-center flex items-center justify-center space-x-2 text-sm"
                      >
                        <Send className="w-4 h-4" />
                        <span>Gonderim Merkezi</span>
                      </Link>
                      <Link 
                        to="/admin/duyuru-merkezi"
                        onClick={() => setIsMenuOpen(false)}
                        className="bg-gradient-to-r from-purple-500 to-purple-700 text-white px-4 py-2.5 rounded-lg font-semibold text-center flex items-center justify-center space-x-2 text-sm"
                      >
                        <Megaphone className="w-4 h-4" />
                        <span>Duyuru Merkezi</span>
                      </Link>
                      <Link 
                        to="/admin/mesaj-merkezi"
                        onClick={() => setIsMenuOpen(false)}
                        className="bg-gradient-to-r from-blue-500 to-indigo-700 text-white px-4 py-2.5 rounded-lg font-semibold text-center flex items-center justify-center space-x-2 text-sm"
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span>Mesaj Merkezi</span>
                      </Link>
                      <Link 
                        to="/admin/borc-bildirim"
                        onClick={() => setIsMenuOpen(false)}
                        className="bg-gradient-to-r from-red-500 to-red-700 text-white px-4 py-2.5 rounded-lg font-semibold text-center flex items-center justify-center space-x-2 text-sm"
                      >
                        <DollarSign className="w-4 h-4" />
                        <span>Borc Bildirim</span>
                      </Link>
                      <Link 
                        to="/admin/ayarlar"
                        onClick={() => setIsMenuOpen(false)}
                        className="bg-gradient-to-r from-gray-500 to-gray-700 text-white px-4 py-2.5 rounded-lg font-semibold text-center flex items-center justify-center space-x-2 text-sm"
                      >
                        <Settings className="w-4 h-4" />
                        <span>Ayarlar</span>
                      </Link>
                    </>
                  )}

                  {user.role === 'client' && (
                    <Link 
                      to="/portal"
                      onClick={() => setIsMenuOpen(false)}
                      className="bg-gradient-to-r from-blue-500 to-blue-700 text-white px-4 py-2.5 rounded-lg font-semibold text-center flex items-center justify-center space-x-2 text-sm"
                    >
                      <LayoutDashboard className="w-4 h-4" />
                      <span>Portal</span>
                    </Link>
                  )}
                  
                  <button 
                    onClick={handleLogout}
                    className="text-red-400 hover:text-red-300 py-2 px-3 rounded-lg hover:bg-red-500/10 transition-colors text-left flex items-center space-x-2 text-sm"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Çıkış Yap</span>
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/hesaplamalar"
                    onClick={() => setIsMenuOpen(false)}
                    className="bg-gradient-to-r from-orange-500 to-orange-700 text-white px-4 py-2.5 rounded-lg font-semibold text-center flex items-center justify-center space-x-2 text-sm"
                  >
                    <Calculator className="w-4 h-4" />
                    <span>Pratik Hesaplamalar</span>
                  </Link>
                  <Link
                    to="/giris"
                    onClick={() => setIsMenuOpen(false)}
                    className="bg-gradient-to-r from-blue-600 to-blue-800 text-white px-4 py-2.5 rounded-lg font-semibold text-center text-sm"
                  >
                    Giriş Yap
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}