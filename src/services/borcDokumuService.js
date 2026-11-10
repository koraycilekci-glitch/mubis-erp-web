// Müşteri Borç Dökümü — SGK ve Vergi Dairesi borç sorgu sonuçları.
// Veri kaynağı: borc_sonuclari tablosu (yardımcı programın canlı sorgu
// sonuçları). Her kayıt bir müşteri + bir tip (sgk/vergi) için bir dönem
// sonucunu taşır: toplam, detay (SGK: gz/sadeceBorclar; vergi: vadesiGecmis/
// vadesiGelmemis) ve mesaj.
import { supabase } from '../lib/supabase'

const sayi = (v) => {
  const n = Number(v)
  return isFinite(n) ? n : 0
}

// Dönem aralığı (sorgu_ts tarihine göre)
const donemSinirlari = (yil, ay) => {
  const baslangic = `${yil}-${String(ay).padStart(2, '0')}-01`
  const sonraki = ay === 12 ? yil + 1 : yil
  const sonrakiAy = ay === 12 ? 1 : ay + 1
  const bitis = `${sonraki}-${String(sonrakiAy).padStart(2, '0')}-01`
  return { baslangic, bitis }
}

export async function borcDokumuGetir({ clientId, yil, ay, tip }) {
  const { baslangic, bitis } = donemSinirlari(yil, ay)
  let q = supabase.from('borc_sonuclari')
    .select('id, client_id, tip, toplam, detay, mesaj, sorgu_ts')
    .eq('client_id', clientId)
    .gte('sorgu_ts', baslangic)
    .lt('sorgu_ts', bitis)
    .order('sorgu_ts', { ascending: false })
  if (tip && tip !== 'hepsi') q = q.eq('tip', tip)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

// Birden çok müşteri için toplu okuma (tüm seçili müşteriler).
export async function borcDokumuToplu({ clientIds, yil, ay, tip }) {
  if (!clientIds?.length) return []
  let q = supabase.from('borc_sonuclari')
    .select('id, client_id, tip, toplam, detay, mesaj, sorgu_ts')
    .in('client_id', clientIds)
    .order('sorgu_ts', { ascending: false })
  if (yil && ay) {
    const { baslangic, bitis } = donemSinirlari(yil, ay)
    q = q.gte('sorgu_ts', baslangic).lt('sorgu_ts', bitis)
  }
  const { data, error } = await q
  if (error) throw error
  let sonuc = data || []
  if (tip && tip !== 'hepsi') sonuc = sonuc.filter(r => r.tip === tip)
  return sonuc
}

// Müşteri başına en güncel kaydı (aynı tip için birden fazla varsa en yeni).
export function borcOzetle(kayitlar) {
  // Aynı müşteri + aynı tip için birden fazla kayıt varsa en güncelini al.
  // Ama detayı 0 olup toplamı dolu olan (veri tutarsızlığı) kayıt yerine
  // detayı toplamla tutarlı olan kayıt tercih edilir.
  const harita = new Map()
  for (const k of kayitlar || []) {
    const anahtar = `${k.client_id}|${k.tip}`
    const mevcut = harita.get(anahtar)
    const detayToplam = k.tip === 'sgk'
      ? sayi(k?.detay?.sadeceBorclar) + sayi(k?.detay?.gz)
      : sayi(k?.detay?.vadesiGecmis) + sayi(k?.detay?.vadesiGelmemis)
    const tutarli = Math.abs(detayToplam - sayi(k?.toplam)) < 0.02
    if (!mevcut) { harita.set(anahtar, k); continue }
    const mevcutDetayToplam = mevcut.tip === 'sgk'
      ? sayi(mevcut?.detay?.sadeceBorclar) + sayi(mevcut?.detay?.gz)
      : sayi(mevcut?.detay?.vadesiGecmis) + sayi(mevcut?.detay?.vadesiGelmemis)
    const mevcutTutarli = Math.abs(mevcutDetayToplam - sayi(mevcut?.toplam)) < 0.02
    // Tutarlı kayıt her zaman kazanır; ikisi de aynıysa en yeni
    if (tutarli && !mevcutTutarli) { harita.set(anahtar, k); continue }
    if (tutarli === mevcutTutarli && new Date(k.sorgu_ts) > new Date(mevcut.sorgu_ts)) {
      harita.set(anahtar, k)
    }
  }
  return [...harita.values()]
}

// 2.8.39: Belirtilen günden eski borç sonuçlarını SİLER. Borç anlık bir
// durumdur; ödenmiş eski bir borcun aylar sonra "borç" gibi görünmesi
// yanıltıcıydı. Varsayılan 10 gün.
// Donus: silinen kayıt sayısı (bilinmiyorsa 0).
export async function eskiBorclariSil(gun = 10) {
  const sinir = new Date(Date.now() - Math.max(1, Number(gun) || 10) * 86400000).toISOString()
  const { data, error } = await supabase
    .from('borc_sonuclari')
    .delete()
    .lt('sorgu_ts', sinir)
    .select('id')
  if (error) throw error
  return (data || []).length
}

export function borcToplam(kayitlar) {
  const t = (kayitlar || []).reduce((acc, k) => acc + sayi(k.toplam), 0)
  return Math.round(t * 100) / 100
}

export function borcEtiket(tip) {
  if (tip === 'sgk') return 'SGK'
  if (tip === 'vergi') return 'Vergi Dairesi'
  return tip
}

export function borcDetaySatirlari(kayit) {
  const d = kayit?.detay || {}
  if (kayit?.tip === 'sgk') {
    let sadece = sayi(d.sadeceBorclar ?? d.sadece_borclar ?? 0)
    let gz = sayi(d.gz ?? d.gecikmeZammi ?? d.gecikme_zammi ?? 0)
    // Veri tutarsizligi: detay 0 ama toplam varsa mesajdan cek
    if (sadece === 0 && gz === 0 && (kayit?.toplam || 0) > 0 && kayit?.mesaj) {
      const m = String(kayit.mesaj)
      const s = m.match(/Sadece Bor[a-zçğıöşü]* Toplami:\s*([\d.,]+)/i)
      const g = m.match(/GZ:\s*([\d.,]+)/i)
      if (s) sadece = sayi(s[1].replace(/\./g, '').replace(',', '.'))
      if (g) gz = sayi(g[1].replace(/\./g, '').replace(',', '.'))
    }
    return [
      { etiket: 'Sadece Borçlar', deger: sadece },
      { etiket: 'Gecikme Zammı', deger: gz }
    ]
  }
  let vadesiGecmis = sayi(d.vadesiGecmis ?? d.vadesi_gecmis ?? 0)
  let vadesiGelmemis = sayi(d.vadesiGelmemis ?? d.vadesi_gelmemis ?? 0)
  if (vadesiGecmis === 0 && vadesiGelmemis === 0 && (kayit?.toplam || 0) > 0 && kayit?.mesaj) {
    const m = String(kayit.mesaj)
    const g = m.match(/Vadesi gecmis:\s*([\d.,]+)/i)
    const g2 = m.match(/Vadesi gelmemis:\s*([\d.,]+)/i)
    if (g) vadesiGecmis = sayi(g[1].replace(/\./g, '').replace(',', '.'))
    if (g2) vadesiGelmemis = sayi(g2[1].replace(/\./g, '').replace(',', '.'))
  }
  return [
    { etiket: 'Vadesi Geçmiş', deger: vadesiGecmis },
    { etiket: 'Vadesi Gelmemiş', deger: vadesiGelmemis }
  ]
}