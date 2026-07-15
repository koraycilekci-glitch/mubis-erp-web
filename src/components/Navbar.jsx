import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { 
  LogOut, LayoutDashboard, Menu, X, 
  Brain, Home,
  FileText, Bell,
  FileArchive, FileCheck, Calendar
} from 'lucide-react'
import { useState } from 'react'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/')
    setIsMenuOpen(false)
  }

  const getInitials = (name) => {
    if (!name) return '?'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <nav className="bg-blue-950/95 backdrop-blur-sm border-b border-blue-800/50 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
        <div className="flex justify-between items-center h-14">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2 flex-shrink-0">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-yellow-400 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
              <span className="text-white font-bold text-sm">M</span>
            </div>
            <div className="hidden sm:block">
              <span className="text-lg font-bold text-white">MUBİS</span>
              <span className="text-yellow-400 text-[10px] block -mt-0.5">ERP</span>
            </div>
          </Link>

          {/* Desktop Menü */}
          <div className="hidden md:flex items-center space-x-1">
            <Link to="/" className="text-gray-300 hover:text-white transition-colors text-xs font-medium px-2 py-1 rounded-lg hover:bg-blue-800/30">
              Ana Sayfa
            </Link>
            <Link to="/ozellikler" className="text-gray-300 hover:text-white transition-colors text-xs font-medium px-2 py-1 rounded-lg hover:bg-blue-800/30">
              Özellikler
            </Link>
            <Link to="/iletisim" className="text-gray-300 hover:text-white transition-colors text-xs font-medium px-2 py-1 rounded-lg hover:bg-blue-800/30">
              İletişim
            </Link>

            {user ? (
              <>
                {user.role === 'admin' && (
                  <div className="flex items-center space-x-1 ml-2 pl-2 border-l border-blue-700/50">
                    <Link 
                      to="/admin"
                      className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-2.5 py-1 rounded-lg font-semibold hover:shadow-lg hover:shadow-yellow-500/30 transition-all duration-300 text-xs flex items-center space-x-1"
                    >
                      <LayoutDashboard className="w-3.5 h-3.5" />
                      <span>Dashboard</span>
                    </Link>
                    <Link 
                      to="/admin/musteriler"
                      className="bg-gradient-to-r from-blue-500 to-blue-700 text-white px-2.5 py-1 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-300 text-xs flex items-center space-x-1"
                    >
                      <Home className="w-3.5 h-3.5" />
                      <span>Musteriler</span>
                    </Link>
                    <Link 
                      to="/admin/aylik-beyan-takip"
                      className="bg-gradient-to-r from-emerald-500 to-emerald-700 text-white px-2.5 py-1 rounded-lg font-semibold hover:shadow-lg hover:shadow-emerald-500/30 transition-all duration-300 text-xs flex items-center space-x-1"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Beyanlar</span>
                    </Link>
                    <Link 
                      to="/admin/smart-import"
                      className="bg-gradient-to-r from-purple-500 to-purple-700 text-white px-2.5 py-1 rounded-lg font-semibold hover:shadow-lg hover:shadow-purple-500/30 transition-all duration-300 text-xs flex items-center space-x-1"
                    >
                      <Brain className="w-3.5 h-3.5" />
                      <span>AI</span>
                    </Link>
                    <Link 
                      to="/admin/e-invoice"
                      className="bg-gradient-to-r from-indigo-500 to-indigo-700 text-white px-2.5 py-1 rounded-lg font-semibold hover:shadow-lg hover:shadow-indigo-500/30 transition-all duration-300 text-xs flex items-center space-x-1"
                    >
                      <FileArchive className="w-3.5 h-3.5" />
                      <span>e-Fatura</span>
                    </Link>
                  </div>
                )}

                <div className="flex items-center space-x-2 ml-2 pl-2 border-l border-blue-700/50">
                  <div className="flex items-center space-x-2">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                      user.role === 'admin' 
                        ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-blue-950' 
                        : 'bg-gradient-to-br from-blue-400 to-blue-600 text-white'
                    }`}>
                      {getInitials(user.name || user.username)}
                    </div>
                    <div className="hidden xl:block">
                      <div className="text-white text-xs font-medium">{user.name || user.username}</div>
                      <div className="text-gray-400 text-[10px]">
                        {user.role === 'admin' ? 'Admin' : user.company || 'Müşteri'}
                      </div>
                    </div>
                  </div>
                  
                  <button 
                    onClick={handleLogout}
                    className="text-gray-400 hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-red-500/10"
                    title="Çıkış Yap"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              <Link 
                to="/giris" 
                className="bg-gradient-to-r from-blue-600 to-blue-800 text-white px-4 py-1.5 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-300 text-xs"
              >
                Giriş Yap
              </Link>
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
              <Link to="/" onClick={() => setIsMenuOpen(false)} className="text-gray-300 hover:text-white py-2 px-3 rounded-lg hover:bg-blue-800/30 transition-colors flex items-center space-x-2 text-sm">
                <Home className="w-4 h-4" />
                <span>Ana Sayfa</span>
              </Link>
              <Link to="/ozellikler" onClick={() => setIsMenuOpen(false)} className="text-gray-300 hover:text-white py-2 px-3 rounded-lg hover:bg-blue-800/30 transition-colors flex items-center space-x-2 text-sm">
                <FileText className="w-4 h-4" />
                <span>Özellikler</span>
              </Link>
              <Link to="/iletisim" onClick={() => setIsMenuOpen(false)} className="text-gray-300 hover:text-white py-2 px-3 rounded-lg hover:bg-blue-800/30 transition-colors flex items-center space-x-2 text-sm">
                <Bell className="w-4 h-4" />
                <span>İletişim</span>
              </Link>

              {user ? (
                <>
                  <div className="flex items-center space-x-3 px-3 py-2 bg-blue-800/30 rounded-lg mt-1">
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
                <Link 
                  to="/giris" 
                  onClick={() => setIsMenuOpen(false)}
                  className="bg-gradient-to-r from-blue-600 to-blue-800 text-white px-4 py-2.5 rounded-lg font-semibold text-center text-sm"
                >
                  Giriş Yap
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}