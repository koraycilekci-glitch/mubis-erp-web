import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { 
  LayoutDashboard, CheckCircle, Users, Bell, 
  FileText, Menu, Home
} from 'lucide-react'

export default function MobileNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()

  if (!user) return null

  const isAdmin = user.role === 'admin'
  const currentPath = location.pathname

  const adminLinks = [
    { path: '/admin', icon: LayoutDashboard, label: 'Panel' },
    { path: '/admin', icon: CheckCircle, label: 'Görevler', hash: 'tasks' },
    { path: '/admin', icon: Users, label: 'Müşteriler', hash: 'clients' },
    { path: '/admin/notifications', icon: Bell, label: 'Bildirim' },
    { path: '/admin', icon: FileText, label: 'Raporlar', hash: 'reports' },
  ]

  const clientLinks = [
    { path: '/portal', icon: Home, label: 'Panel' },
    { path: '/portal', icon: FileText, label: 'Evraklar', hash: 'documents' },
    { path: '/portal', icon: Bell, label: 'Bildirim' },
    { path: '/portal', icon: FileText, label: 'Yükle', hash: 'upload' },
  ]

  const links = isAdmin ? adminLinks : clientLinks

  const isActive = (link) => {
    if (link.hash) return currentPath === link.path
    return currentPath.startsWith(link.path)
  }

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-blue-950/95 backdrop-blur-md border-t border-blue-800/50 z-50 safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {links.map((link, index) => (
          <button
            key={index}
            onClick={() => navigate(link.path + (link.hash ? `#${link.hash}` : ''))}
            className={`flex flex-col items-center justify-center space-y-1 px-3 py-1 rounded-xl transition-all min-w-[60px] ${
              isActive(link) 
                ? 'text-yellow-500 bg-yellow-500/10' 
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <link.icon className={`w-5 h-5 ${isActive(link) ? 'text-yellow-500' : ''}`} />
            <span className="text-[10px] font-medium">{link.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}