import { supabase } from '../lib/supabase'

const TABLE_EXISTS = false // Tablo olusana kadar false

export async function createNotification({ clientId, title, message, type = 'info' }) {
  if (!clientId || !TABLE_EXISTS) return { error: new Error('clientId gerekli') }
  try {
    const { data, error } = await supabase.from('notifications').insert({
      client_id: clientId,
      title,
      message,
      type,
      is_read: false
    }).select().single()
    if (error) {
      console.warn('Bildirim kaydedilemedi:', error.message)
      return null
    }
    return data
  } catch (e) {
    console.warn('Bildirim kaydedilemedi:', e.message)
    return null
  }
}

export async function getNotifications(clientId) {
  if (!TABLE_EXISTS) return []
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    if (error) {
      console.warn('Bildirimler yuklenemedi:', error.message)
      return []
    }
    return data || []
  } catch (e) {
    console.warn('Bildirimler yuklenemedi:', e.message)
    return []
  }
}

export async function markNotificationAsRead(notificationId) {
  if (!TABLE_EXISTS) return
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
    if (error) console.warn('Bildirim guncellenemedi:', error.message)
  } catch (e) {
    console.warn('Bildirim guncellenemedi:', e.message)
  }
}

export async function markAllNotificationsAsRead(clientId) {
  if (!TABLE_EXISTS) return
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('client_id', clientId)
      .eq('is_read', false)
    if (error) console.warn('Bildirimler guncellenemedi:', error.message)
  } catch (e) {
    console.warn('Bildirimler guncellenemedi:', e.message)
  }
}

export async function getUnreadCount(clientId) {
  if (!TABLE_EXISTS) return 0
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('is_read', false)
    if (error) {
      console.warn('Okunmamis sayisi alinamadi:', error.message)
      return 0
    }
    return count || 0
  } catch (e) {
    console.warn('Okunmamis sayisi alinamadi:', e.message)
    return 0
  }
}
