import { useCallback, useEffect, useState } from 'react'
import { Bell, CheckCheck, ExternalLink, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotifications
} from '../services/notificationService'

const notificationRoute = (notification) => {
  if (notification.route) return notification.route
  if (notification.type === 'kira_artisi' || notification.type === 'kira_yenileme') {
    return notification.client_id
      ? `/admin/client/${notification.client_id}?tab=kira`
      : '/admin/kira-stopaj'
  }
  return '/admin/notifications'
}

export default function NotificationCenter() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [yeniBildirim, setYeniBildirim] = useState(null) // gercek zamanli uyari karti
  const unreadCount = notifications.filter((item) => !item.read).length

  const loadNotifications = useCallback(async () => {
    try {
      // Yalnizca admin hedefli okunmamis bildirimler listelenir
      setNotifications(await getNotifications({ unreadOnly: true, audience: 'admin' }))
    } catch {
      setNotifications([])
    }
  }, [])

  useEffect(() => {
    loadNotifications()
    return subscribeToNotifications((notification) => {
      setNotifications((current) => [
        notification,
        ...current.filter((item) => item.id !== notification.id)
      ])
      // Yeni bildirim uyari karti olarak goster
      setYeniBildirim(notification)
    }, { audience: 'admin' })
  }, [loadNotifications])

  // Uyari karti 15 sn sonra kendiliginden kapansin
  useEffect(() => {
    if (!yeniBildirim) return
    const t = setTimeout(() => setYeniBildirim(null), 15000)
    return () => clearTimeout(t)
  }, [yeniBildirim])

  const openNotification = async (notification) => {
    if (!notification.read) {
      try {
        await markNotificationRead(notification.id)
      } catch {
        // okundu isaretleme basarisiz olsa da listeden kaldir
      }
      // Okunan bildirim listeden kaybolur
      setNotifications((current) => current.filter((item) => item.id !== notification.id))
    }
    setOpen(false)
    navigate(notificationRoute(notification))
  }

  const readAll = async () => {
    try {
      await markAllNotificationsRead()
    } catch {
      // yoksay
    }
    setNotifications([])
  }

  return (
    <div className="fixed right-4 top-4 z-[60]">
      {/* Gercek zamanli yeni bildirim uyari karti */}
      {yeniBildirim && !open && (
        <div className="fixed bottom-6 right-6 z-[70] w-[min(92vw,340px)] overflow-hidden rounded-2xl border border-cyan-500/40 bg-slate-900 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 bg-gradient-to-r from-cyan-700 to-blue-800 px-4 py-2.5">
            <span className="flex items-center gap-2 text-sm font-bold text-white">
              <Bell size={15} /> Yeni Bildirim
            </span>
            <button type="button" onClick={() => setYeniBildirim(null)} className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white">
              <X size={14} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => { const n = yeniBildirim; setYeniBildirim(null); openNotification(n) }}
            className="block w-full px-4 py-3 text-left hover:bg-slate-800"
          >
            <span className="block font-medium text-white">{yeniBildirim.title}</span>
            <span className="mt-1 block text-sm text-slate-300">{yeniBildirim.message}</span>
            <span className="mt-2 block text-xs text-cyan-300">Açmak için tıklayın <ExternalLink size={12} className="ml-1 inline" /></span>
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-xl p-2 text-slate-300 transition hover:bg-slate-800 hover:text-white"
        aria-label="Bildirimler"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <div>
              <h3 className="font-semibold text-white">Bildirimler</h3>
              <p className="text-xs text-slate-400">
                {unreadCount ? `${unreadCount} okunmamış bildirim` : 'Yeni bildirim yok'}
              </p>
            </div>
            {unreadCount > 0 && (
              <button type="button" onClick={readAll} className="text-xs text-cyan-300 hover:text-cyan-200">
                <CheckCheck size={14} className="mr-1 inline" />
                Tümünü oku
              </button>
            )}
          </div>

          <div className="max-h-[min(70vh,480px)] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">Henüz bildiriminiz yok.</div>
            ) : notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => openNotification(notification)}
                className={`flex w-full items-start gap-3 border-b border-slate-800 px-4 py-3 text-left transition hover:bg-slate-800 ${notification.read ? '' : 'bg-cyan-950/30'}`}
              >
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${notification.read ? 'bg-slate-600' : 'bg-cyan-400'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-white">{notification.title}</span>
                  <span className="mt-1 block text-sm text-slate-300">{notification.message}</span>
                  <span className="mt-2 block text-xs text-cyan-300">
                    Açmak için tıklayın <ExternalLink size={12} className="ml-1 inline" />
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}