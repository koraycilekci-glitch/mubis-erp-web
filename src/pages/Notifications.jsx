import { useState } from 'react'
import { Bell, AlertTriangle, CheckCircle, Info, Calendar, Shield, X } from 'lucide-react'

export default function Notifications() {
  const [activeTab, setActiveTab] = useState('all')

  const [notifications, setNotifications] = useState([
    { id: 1, type: 'warning', title: 'e-İmza Süresi Doluyor', message: 'XYZ Ticaret A.Ş. e-İmza sertifikası 15 gün içinde sona erecek.', date: '2026-07-12', time: '14:30', read: false, category: 'signature' },
    { id: 2, type: 'info', title: 'Yeni e-Tebligat', message: 'ABC Ltd. Şti. için yeni bir e-Tebligat geldi.', date: '2026-07-12', time: '11:15', read: false, category: 'tebligat' },
    { id: 3, type: 'success', title: 'Beyanname Onaylandı', message: '123 Danışmanlık SGK Bildirgesi başarıyla onaylandı.', date: '2026-07-11', time: '16:45', read: true, category: 'beyan' },
    { id: 4, type: 'warning', title: 'Mali Mühür Yenileme', message: 'Demo İnşaat Mali Mühür sertifikası 25 gün içinde yenilenmeli.', date: '2026-07-10', time: '09:20', read: false, category: 'signature' },
    { id: 5, type: 'info', title: 'Evrak Yüklendi', message: 'Mavi Teknoloji 3 adet fatura yükledi.', date: '2026-07-10', time: '08:00', read: true, category: 'document' },
    { id: 6, type: 'warning', title: 'Beyan Süresi Yaklaşıyor', message: 'Yeşil Enerji A.Ş. KDV beyannamesi için son 3 gün!', date: '2026-07-09', time: '10:00', read: false, category: 'beyan' },
    { id: 7, type: 'success', title: 'e-Defter Yüklendi', message: 'ABC Ltd. Şti. Haziran ayı e-Defter beratı başarıyla yüklendi.', date: '2026-07-08', time: '15:30', read: true, category: 'edefter' },
    { id: 8, type: 'info', title: 'Sistem Güncellemesi', message: 'MUBİS ERP v1.1 güncellemesi yayınlandı. Yeni özellikleri keşfedin!', date: '2026-07-07', time: '09:00', read: true, category: 'system' },
  ])

  const tabs = [
    { id: 'all', label: 'Tümü', count: notifications.length },
    { id: 'unread', label: 'Okunmamış', count: notifications.filter(n => !n.read).length },
    { id: 'warning', label: 'Uyarılar', count: notifications.filter(n => n.type === 'warning').length },
    { id: 'signature', label: 'E-İmza/Mühür', count: notifications.filter(n => n.category === 'signature').length },
  ]

  const filteredNotifications = activeTab === 'all' 
    ? notifications 
    : activeTab === 'unread' 
      ? notifications.filter(n => !n.read)
      : activeTab === 'warning'
        ? notifications.filter(n => n.type === 'warning')
        : notifications.filter(n => n.category === activeTab)

  const markAsRead = (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const deleteNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  const getTypeStyles = (type) => {
    switch(type) {
      case 'warning': return { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', icon: AlertTriangle, iconColor: 'text-yellow-400' }
      case 'success': return { bg: 'bg-green-500/10', border: 'border-green-500/30', icon: CheckCircle, iconColor: 'text-green-400' }
      case 'error': return { bg: 'bg-red-500/10', border: 'border-red-500/30', icon: X, iconColor: 'text-red-400' }
      default: return { bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: Info, iconColor: 'text-blue-400' }
    }
  }

  const getCategoryLabel = (cat) => {
    switch(cat) {
      case 'signature': return 'E-İmza/Mühür'
      case 'tebligat': return 'e-Tebligat'
      case 'beyan': return 'Beyanname'
      case 'document': return 'Evrak'
      case 'edefter': return 'e-Defter'
      case 'system': return 'Sistem'
      default: return cat
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">🔔 Bildirim Merkezi</h1>
          <p className="text-gray-400 mt-1">
            {notifications.filter(n => !n.read).length} okunmamış bildirim
          </p>
        </div>
        <button onClick={markAllAsRead} className="btn-primary text-sm px-4 py-2">
          Tümünü Okundu İşaretle
        </button>
      </div>

      <div className="flex space-x-1 bg-blue-950/40 rounded-xl p-1 mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
            }`}>
            <span>{tab.label}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs ${
              activeTab === tab.id ? 'bg-white/20' : 'bg-blue-800/50'
            }`}>{tab.count}</span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filteredNotifications.length === 0 ? (
          <div className="text-center py-16 bg-blue-950/30 rounded-2xl">
            <Bell className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">Bildirim yok</p>
            <p className="text-gray-500 text-sm">Her şey yolunda! 🎉</p>
          </div>
        ) : (
          filteredNotifications.map((notif) => {
            const styles = getTypeStyles(notif.type)
            const Icon = styles.icon
            return (
              <div key={notif.id} 
                className={`${styles.bg} ${styles.border} border rounded-2xl p-5 transition-all hover:scale-[1.01] cursor-pointer ${
                  !notif.read ? 'ring-1 ring-yellow-500/30' : ''
                }`}
                onClick={() => markAsRead(notif.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4">
                    <div className={`p-2 rounded-xl ${styles.bg}`}>
                      <Icon className={`w-5 h-5 ${styles.iconColor}`} />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2 mb-1">
                        <h3 className="text-white font-semibold">{notif.title}</h3>
                        {!notif.read && (
                          <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                        )}
                        <span className="text-xs px-2 py-0.5 bg-blue-800/50 rounded-full text-gray-400">
                          {getCategoryLabel(notif.category)}
                        </span>
                      </div>
                      <p className="text-gray-300 text-sm">{notif.message}</p>
                      <div className="flex items-center space-x-3 mt-2 text-xs text-gray-500">
                        <span className="flex items-center"><Calendar className="w-3 h-3 mr-1" />{notif.date}</span>
                        <span>🕐 {notif.time}</span>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); deleteNotification(notif.id); }}
                    className="text-gray-600 hover:text-red-400 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-8">
        {[
          { icon: Shield, title: 'E-İmza/Mühür', desc: '2 sertifika yenilenecek', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
          { icon: Bell, title: 'Beyan Süreleri', desc: '3 beyan için son hafta', color: 'text-red-400', bg: 'bg-red-500/10' },
          { icon: Bell, title: 'e-Tebligat', desc: '1 yeni tebligat', color: 'text-blue-400', bg: 'bg-blue-500/10' },
        ].map((card, i) => (
          <div key={i} className="bg-blue-950/40 rounded-2xl p-5 border border-blue-800/30">
            <div className={`${card.bg} p-3 rounded-xl inline-block mb-3`}>
              <card.icon className={`w-6 h-6 ${card.color}`} />
            </div>
            <h4 className="text-white font-semibold">{card.title}</h4>
            <p className="text-gray-400 text-sm">{card.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}