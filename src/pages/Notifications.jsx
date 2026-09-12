import { useEffect, useState } from 'react'
import { Bell, CheckCircle, AlertTriangle, Info, X, Clock, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from '../services/notificationService'
import { formatDateTimeTR } from '../utils/dateUtils'
import { kiraArtisBildirimleriniOlustur } from '../services/kiraService'
import { useClients } from '../hooks/useClients'

export default function Notifications() {
  const navigate = useNavigate()
  const { clients } = useClients()
  const [notifications, setNotifications] = useState([])

  useEffect(() => {
    getNotifications().then(setNotifications).catch(() => setNotifications([]))
  }, [])

  useEffect(() => {
    if (!clients?.length) return
    kiraArtisBildirimleriniOlustur(clients)
      .then((created) => {
        if (created?.length) {
          setNotifications((current) => [...created, ...current])
        }
      })
      .catch(() => {})
  }, [clients])

  const getIcon = (type) => {
    switch(type) {
      case 'warning': return <AlertTriangle className="w-5 h-5 text-yellow-400" />
      case 'success': return <CheckCircle className="w-5 h-5 text-green-400" />
      case 'info': return <Info className="w-5 h-5 text-blue-400" />
      default: return <Bell className="w-5 h-5 text-gray-400" />
    }
  }

  const getBgColor = (type) => {
    switch(type) {
      case 'warning': return 'bg-yellow-500/10 border-yellow-500/30'
      case 'success': return 'bg-green-500/10 border-green-500/30'
      case 'info': return 'bg-blue-500/10 border-blue-500/30'
      default: return 'bg-blue-800/20 border-blue-700/30'
    }
  }

  const markAsRead = async (id) => {
    await markNotificationRead(id)
    setNotifications(current => current.map(n =>
      n.id === id ? { ...n, read: true } : n
    ))
  }

  const deleteNotification = (id) => {
    setNotifications(current => current.filter(n => n.id !== id))
  }

  const markAllAsRead = async () => {
    await markAllNotificationsRead()
    setNotifications(current => current.map(n => ({ ...n, read: true })))
  }

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center space-x-3">
            <Bell className="w-8 h-8 text-yellow-400" />
            <span>Bildirimler</span>
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-sm px-3 py-1 rounded-full">
                {unreadCount} Yeni
              </span>
            )}
          </h1>
          <p className="text-gray-400 mt-1">Tüm bildirimlerinizi tek bir yerden yönetin</p>
        </div>
        {unreadCount > 0 && (
          <button 
            onClick={markAllAsRead}
            className="bg-blue-800/30 hover:bg-blue-700/30 text-white px-4 py-2 rounded-lg text-sm transition-colors mt-4 md:mt-0"
          >
            Tümünü Okundu İşaretle
          </button>
        )}
      </div>

      {/* Bildirim Listesi */}
      <div className="space-y-4">
        {notifications.length === 0 ? (
          <div className="text-center py-12 bg-blue-800/20 rounded-2xl border border-blue-700/30">
            <Bell className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">Henüz bildiriminiz yok</p>
            <p className="text-gray-500 text-sm">Yeni bildirimler geldiğinde burada görünecek</p>
          </div>
        ) : (
          notifications.map((notif) => (
            <div 
              key={notif.id}
              className={`p-5 rounded-2xl border transition-all ${
                !notif.read ? 'bg-blue-800/30 border-blue-600/50' : getBgColor(notif.type)
              }`}
            >
              <div className="flex items-start space-x-4">
                <div className="mt-1">
                  {getIcon(notif.type)}
                </div>
                <div className="flex-1">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                    <h4 className={`text-white font-semibold ${!notif.read ? 'text-yellow-400' : ''}`}>
                      {notif.title}
                      {!notif.read && (
                        <span className="ml-2 text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">
                          Yeni
                        </span>
                      )}
                    </h4>
                    <div className="flex items-center space-x-3 mt-2 md:mt-0">
                      <span className="text-gray-500 text-xs flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                          {notif.created_at ? formatDateTimeTR(notif.created_at) : notif.date}
                      </span>
                      <button 
                        onClick={() => markAsRead(notif.id)}
                        className={`text-xs ${notif.read ? 'text-gray-500' : 'text-blue-400 hover:text-blue-300'}`}
                        disabled={notif.read}
                      >
                        {notif.read ? 'Okundu' : 'Okundu İşaretle'}
                      </button>
                      {(notif.route || notif.client_id) && (
                        <button
                          type="button"
                          onClick={() => {
                            markAsRead(notif.id)
                            navigate(notif.route || `/admin/client/${notif.client_id}?tab=kira`)
                          }}
                          className="text-blue-400 hover:text-blue-300"
                          title="İlgili sayfayı aç"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      )}
                      <button 
                        onClick={() => deleteNotification(notif.id)}
                        className="text-gray-500 hover:text-red-400 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      markAsRead(notif.id)
                      if (notif.route) navigate(notif.route)
                      else if (notif.client_id) navigate(`/admin/client/${notif.client_id}?tab=kira`)
                    }}
                    className="block w-full text-left"
                  >
                    <p className="text-gray-300 text-sm mt-2">{notif.message}</p>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}