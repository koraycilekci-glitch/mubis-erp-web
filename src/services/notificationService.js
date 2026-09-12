import { supabase } from '../lib/supabase'

const normalizeNotification = (notification) => ({
  ...notification,
  read: Boolean(notification.read ?? notification.is_read ?? notification.okundu),
  title: notification.title || notification.baslik || notification.type || 'Yeni bildirim',
  message: notification.message || notification.mesaj || notification.body || '',
  route: notification.route || notification.link || notification.href || null
})

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
  let query = supabase
    .from('notifications')
    .select('*')
    .eq('audience', audience)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (unreadOnly) query = query.eq('is_read', false)

  const { data, error } = await query
  if (!error) return (data || []).map(normalizeNotification)

  const fallback = await supabase
    .from('notifications')
    .select('*')
    .eq('audience', audience)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (fallback.error) throw error
  return (fallback.data || []).map(normalizeNotification)
}

export async function markNotificationRead(id) {
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
  const channel = supabase
    .channel('mubis-notifications')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications' },
      (payload) => {
        const n = normalizeNotification(payload.new)
        if (audience && n.audience !== audience) return
        callback(n)
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}