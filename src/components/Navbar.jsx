import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Menu, X, LogOut, LayoutDashboard } from 'lucide-react'

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
    setIsOpen(false)
  }

  return (
    <nav className="bg-blue-950/95 backdrop-blur-sm border-b border-blue-800/50 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-yellow-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">M</span>
            </div>
            <div>
              <span className="text-lg sm:text-xl font-bold text-white">MUBIS</span>
              <span className="text-yellow-500 text-sm block -mt-1">ERP</span>
            </div>
          </Link>

          <div className="hidden md:flex items-center space-x-8">
            <Link to="/" className="text-gray-300 hover:text-white transition-colors">Ana Sayfa</Link>
            <Link to="/ozellikler" className="text-gray-300 hover:text-white transition-colors">Ozellikler</Link>
            <Link to="/iletisim" className="text-gray-300 hover:text-white transition-colors">Iletisim</Link>
            
            {user && (
              <Link to={user.role === 'admin' ? '/admin/institutions' : '/portal/institutions'} className="text-gray-300 hover:text-white transition-colors">
                🌐 Kurumlar
              </Link>
            )}
            
            {user ? (
              <div className="flex items-center space-x-4">
                <Link to={user.role === 'admin' ? '/admin' : '/portal'} className="btn-gold text-sm px-4 py-2">
                  <LayoutDashboard className="w-4 h-4 inline mr-2" />Dashboard
                </Link>
                <button onClick={handleLogout} className="text-gray-300 hover:text-red-400 transition-colors">
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <Link to="/giris" className="btn-primary text-sm px-6 py-2">Giris Yap</Link>
            )}
          </div>

          <button onClick={() => setIsOpen(!isOpen)} className="md:hidden text-white">
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {isOpen && (
          <div className="md:hidden pb-4">
            <div className="flex flex-col space-y-3">
              <Link to="/" onClick={() => setIsOpen(false)} className="text-gray-300 hover:text-white py-2">Ana Sayfa</Link>
              <Link to="/ozellikler" onClick={() => setIsOpen(false)} className="text-gray-300 hover:text-white py-2">Ozellikler</Link>
              <Link to="/iletisim" onClick={() => setIsOpen(false)} className="text-gray-300 hover:text-white py-2">Iletisim</Link>
              {user && (
                <Link to={user.role === 'admin' ? '/admin/institutions' : '/portal/institutions'} onClick={() => setIsOpen(false)} className="text-gray-300 hover:text-white py-2">🌐 Kurumlar</Link>
              )}
              {user ? (
                <>
                  <Link to={user.role === 'admin' ? '/admin' : '/portal'} onClick={() => setIsOpen(false)} className="btn-gold text-center">Dashboard</Link>
                  <button onClick={handleLogout} className="text-red-400 hover:text-red-300 py-2">Cikis Yap</button>
                </>
              ) : (
                <Link to="/giris" onClick={() => setIsOpen(false)} className="btn-primary text-center">Giris Yap</Link>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}