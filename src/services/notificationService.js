import { supabase } from '../lib/supabase'

const normalizeNotification = (notification) => ({
  ...notification,
  read: Boolean(notification.read ?? notification.is_read ?? notification.okundu),
  title: notification.title || notification.baslik || notification.type || 'Yeni bildirim',
  message: notification.message || notification.mesaj || notification.body || '',
  route: notification.route || notification.link || notification.href || null
})

const READ_STORAGE_PREFIX = 'mubis_notification_reads_v1_'

function localReadIds(userId) {
  if (!userId) return new Set()
  try {
    return new Set(JSON.parse(localStorage.getItem(READ_STORAGE_PREFIX + userId) || '[]').map(String))
  } catch {
    return new Set()
  }
}

function saveLocalReadId(userId, notificationId) {
  if (!userId) return
  const ids = localReadIds(userId)
  ids.add(String(notificationId))
  try { localStorage.setItem(READ_STORAGE_PREFIX + userId, JSON.stringify([...ids])) } catch { /* local cache unavailable */ }
}

async function adminOfficeContext() {
  try {
    const { data: userData } = await supabase.auth.getUser()
    const userId = userData?.user?.id
    if (!userId) return null
    const { data: profile } = await supabase.from('profiles').select('office_id, role').eq('id', userId).maybeSingle()
    return profile || null
  } catch {
    return null
  }
}

async function canAdminReadOfficeNotification(notification) {
  if (notification?.type !== 'work_permit_expiry') return true
  const profile = await adminOfficeContext()
  if (profile?.role === 'super_admin') return true
  return profile?.office_id != null && Number(profile.office_id) === Number(notification.metadata?.office_id)
}

async function userReadIds(notifications) {
  const alertIds = notifications
    .filter(n => n.audience === 'admin' && n.type === 'etebligat')
    .map(n => String(n.id))
  if (!alertIds.length) return new Set()

  let userId = null
  try { userId = (await supabase.auth.getUser()).data?.user?.id || null } catch { /* session unavailable */ }
  const readIds = localReadIds(userId)
  if (!userId) return readIds

  try {
    const { data, error } = await supabase.from('notification_reads')
      .select('notification_id')
      .eq('user_id', userId)
      .in('notification_id', alertIds)
    if (!error) (data || []).forEach(row => readIds.add(String(row.notification_id)))
  } catch { /* local cache remains available */ }
  return readIds
}

export async function createNotification(notification) {
  const isClientTarget = !!(notification.clientId ?? notification.client_id)
  const payload = {
    client_id: notification.clientId ?? notification.client_id ?? null,
    user_id: notification.userId ?? notification.user_id ?? null,
    audience: notification.audience || (isClientTarget ? 'client' : 'admin'),
    type: notification.type || 'general',
    title: notification.title || notification.baslik || 'Yeni bildirim',
    message: notification.message || notification.mesaj || notification.body || '',
    route: notification.route || notification.link || notification.href || null,
    metadata: notification.metadata || {}
  }

  const { data, error } = await supabase
    .from('notifications')
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return normalizeNotification(data)
}

export async function getNotifications({ limit = 50, unreadOnly = false, audience = 'admin' } = {}) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('audience', audience)
    .order('created_at', { ascending: false })
    .limit(limit)

  let notifications = data
  if (error) {
    const fallback = await supabase
      .from('notifications')
      .select('*')
      .eq('audience', audience)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (fallback.error) throw error
    notifications = fallback.data || []
  }

  let rows = notifications || []
  if (audience === 'admin' && rows.some(notification => notification.type === 'work_permit_expiry')) {
    const profile = await adminOfficeContext()
    if (profile?.role !== 'super_admin') {
      rows = rows.filter(notification => notification.type !== 'work_permit_expiry' || (
        profile?.office_id != null && Number(profile.office_id) === Number(notification.metadata?.office_id)
      ))
    }
  }
  const readIds = audience === 'admin' ? await userReadIds(rows) : new Set()
  const normalized = rows.map(notification => {
    const item = normalizeNotification(notification)
    if (audience === 'admin' && item.type === 'etebligat') {
      item.read = readIds.has(String(item.id))
    }
    return item
  })
  return unreadOnly ? normalized.filter(notification => !notification.read) : normalized
}

export async function markNotificationRead(id) {
  const { data: existing, error: lookupError } = await supabase
    .from('notifications')
    .select('id,type')
    .eq('id', id)
    .maybeSingle()

  if (!lookupError && existing?.type === 'etebligat') {
    let userId = null
    try { userId = (await supabase.auth.getUser()).data?.user?.id || null } catch { /* local fallback below */ }
    if (userId) {
      saveLocalReadId(userId, id)
      const { error } = await supabase.from('notification_reads')
        .upsert({ user_id: userId, notification_id: String(id) }, { onConflict: 'user_id,notification_id' })
      if (error) console.warn('[notifications] per-user e-Tebligat read state not synced:', error.message)
    }
    return { ...normalizeNotification(existing), read: true }
  }

  let { data, error } = await supabase
    .from('notifications')
    .update({ is_read: true, okundu: true })
    .eq('id', id)
    .select()
    .maybeSingle()

  if (error) {
    const fallback = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .select()
      .maybeSingle()
    data = fallback.data
    error = fallback.error
  }
  if (error) throw error
  return data ? normalizeNotification(data) : null
}

export async function getClientNotifications(clientId, limit = 50) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('client_id', clientId)
    .eq('audience', 'client')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data || []).map(normalizeNotification)
}

export async function markClientNotificationRead(id) {
  return markNotificationRead(id)
}

export async function markAllClientNotificationsRead(clientId) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, okundu: true })
    .eq('client_id', clientId)
    .eq('is_read', false)

  if (error) {
    const fallback = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('client_id', clientId)
      .eq('is_read', false)
    if (fallback.error) throw fallback.error
  }
}

export async function getUnreadClientNotificationCount(clientId) {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('is_read', false)

  if (error) throw error
  return count || 0
}

export async function markAllNotificationsRead() {
  let { error } = await supabase
    .from('notifications')
    .update({ is_read: true, okundu: true })
    .eq('is_read', false)

  if (error) {
    const fallback = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('is_read', false)
    error = fallback.error
  }
  if (error) throw error
}

export function subscribeToNotifications(callback, { audience = 'admin' } = {}) {
  // Benzersiz kanal adi: ayni isimli ikinci kanalda .on() cagrisi
  // "cannot add postgres_changes callbacks after subscribe()" hatasi
  // firlatip tum uygulamayi beyaz ekrana dusuruyordu (dashboard +
  // NotificationCenter ayni anda abone oluyor).
  const kanalAdi = `mubis-notifications-${audience}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const channel = supabase
    .channel(kanalAdi)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications' },
      (payload) => {
        const n = normalizeNotification(payload.new)
        if (audience && n.audience !== audience) return
        if (audience === 'admin' && n.type === 'work_permit_expiry') {
          void canAdminReadOfficeNotification(n).then(allowed => {
            if (allowed) callback(n)
          })
          return
        }
        callback(n)
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}