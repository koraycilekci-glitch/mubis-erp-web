// Mevzuat & AI Asistan — Vergi Takvimi Entegrasyonu (Faz 3)
// Onaylanmis mevzuat kurallarindan gelen tarihleri mevcut vergi takvimine baglar.
// Cift bildirim onleme ve celiski tespiti icerir.

import { supabase } from '../lib/supabase'

const API = '/api/mevzuat'

async function authHeader() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// ---------- Onayli mevzuat kurallarindan tarihleri getir ----------
export async function mevzuatTakvimTarihleriGetir() {
  const r = await fetch(`${API}?action=kurallar`, { headers: await authHeader() })
  const j = await r.json()
  if (!j.ok) return []
  return (j.kurallar || [])
    .filter(k => k.durum === 'aktif' && k.tarih)
    .map(k => ({
      id: k.id,
      baslik: k.baslik,
      tarih: k.tarih,
      konu: k.konu,
      ilgiliKurum: k.ilgili_kurum,
      dayanakUrl: k.dayanak_url,
      dayanakBolum: k.dayanak_bolum,
      kuralTipi: k.kural_tipi,
      sonBasvuruTarihi: k.son_basvuru_tarihi,
      kaynak: 'mevzuat', // mevcut takvim tarihlerinden ayirt etmek icin
    }))
}

// ---------- Celiski tespiti ----------
// Mevzuat tarihleri ile mevcut takvim tarihlerini karsilastirir.
// Ayni donem icin farkli tarih varsa celiski olarak isaretler.
export function mevzuatTakvimCeliskiKontrol(mevzuatTarihler, mevcutTarihler) {
  const celiskiler = []
  for (const mt of mevzuatTarihler) {
    const mtDate = new Date(mt.tarih)
    const mtAy = mtDate.getMonth()
    const mtYil = mtDate.getFullYear()
    const mevcut = mevcutTarihler.find(d => {
      const dd = new Date(d.tarih)
      return dd.getMonth() === mtAy && dd.getFullYear() === mtYil
    })
    if (mevcut && mevcut.tarih !== mt.tarih) {
      celiskiler.push({
        mevzuat: mt,
        mevcut,
        mesaj: `"${mt.baslik}" için mevzuat tarihi (${mt.tarih}) mevcut takvim tarihi (${mevcut.tarih}) ile çelişiyor.`
      })
    }
  }
  return celiskiler
}

// ---------- Cift bildirim onleme ----------
// Bildirim olusturmadan once ayni kural + tarih icin bildirim var mi kontrol eder.
export async function mevzuatBildirimVarMi(kuralId, tarih) {
  const { data } = await supabase
    .from('notifications')
    .select('id')
    .eq('type', 'mevzuat_takvim')
    .contains('metadata', { kural_id: kuralId, tarih })
    .limit(1)
  return (data || []).length > 0
}

// ---------- Mevzuat bildirimi olustur (tek seferlik) ----------
export async function mevzuatBildirimOlustur(kuralId, baslik, tarih, mesaj, officeId = 1) {
  const varMi = await mevzuatBildirimVarMi(kuralId, tarih)
  if (varMi) return { ok: false, not: 'bildirim zaten mevcut' }
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  const r = await fetch('/api/mevzuat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ action: 'mevzuat-bildirim', kural_id: kuralId, baslik, tarih, mesaj, office_id: officeId })
  })
  return r.json()
}

// ---------- Mevzuat takvim ozeti (panel icin) ----------
export async function mevzuatTakvimOzetiGetir() {
  const tarihler = await mevzuatTakvimTarihleriGetir()
  const bugun = new Date()
  const yaklasanlar = tarihler.filter(t => {
    const diff = (new Date(t.tarih) - bugun) / 86400000
    return diff >= 0 && diff <= 30
  }).sort((a, b) => new Date(a.tarih) - new Date(b.tarih))
  const gecenler = tarihler.filter(t => new Date(t.tarih) < bugun)
  return { toplam: tarihler.length, yaklasanlar, gecenler, tumu: tarihler }
}