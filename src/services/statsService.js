// Musteri giris takibi ve site ziyaretci sayaci icin servis.
// Veriler Supabase'de tutulur: clients.last_login_at/login_count ve site_visits tablosu.
import { supabase } from '../lib/supabase'

// Musterinin sifre ile girisini kaydet: son giris tarihi + toplam giris sayisi.
// RPC yoksa (fonksiyon henuz kurulmadiysa) dogrudan tarih guncellemeye duser.
export async function recordClientLogin(clientId) {
  if (!clientId) return
  try {
    await supabase.rpc('record_client_login', { p_client_id: clientId })
  } catch {
    try {
      await supabase
        .from('clients')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', clientId)
    } catch { /* sessiz gec */ }
  }
}

// Site ziyaretini kaydet. Ayni tarayici oturumunda yalnizca bir kez yazar
// (sayfa yenilemeleri ziyaretci sayisini sisirmesin diye).
export async function recordSiteVisit(path = '/') {
  try {
    if (sessionStorage.getItem('mubis_visit_recorded')) return
    sessionStorage.setItem('mubis_visit_recorded', '1')
    await supabase.from('site_visits').insert({
      path,
      user_agent: (navigator.userAgent || '').slice(0, 200)
    })
  } catch { /* ziyaretci sayaci kritik degil, sessiz gec */ }
}

// Ziyaretci istatistikleri: toplam ve bugunku tekil oturum sayisi.
export async function getSiteVisitStats() {
  try {
    const { count: total } = await supabase
      .from('site_visits')
      .select('*', { count: 'exact', head: true })
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { count: today } = await supabase
      .from('site_visits')
      .select('*', { count: 'exact', head: true })
      .gte('visited_at', todayStart.toISOString())
    return { total: total || 0, today: today || 0 }
  } catch {
    return { total: 0, today: 0 }
  }
}

// Musteri giris listesi: son giris tarihi ve giris sayisi ile birlikte.
export async function getClientLoginList() {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, company, username, status, last_login_at, login_count')
    .order('name')
  if (error) throw error
  return data || []
}
