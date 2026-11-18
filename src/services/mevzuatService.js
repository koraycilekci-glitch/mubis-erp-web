// MUBiS Mevzuat & AI Asistan — Frontend Servis
// /api/mevzuat endpoint'i ile iletisim kurar.

import { supabase } from '../lib/supabase'

const API = '/api/mevzuat'

async function authHeader() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function apiGet(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString()
  const r = await fetch(`${API}?${qs}`, { headers: await authHeader() })
  return r.json()
}

async function apiPost(body) {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeader()) }, body: JSON.stringify(body) })
  return r.json()
}

async function apiDelete(tablo, id) {
  const r = await fetch(`${API}?tablo=${tablo}&id=${id}`, { method: 'DELETE', headers: await authHeader() })
  return r.json()
}

// ---------- Kaynaklar ----------
export const mevzuatKaynaklarGetir = () => apiGet('kaynaklar')
export const mevzuatKaynakEkle = (veri) => apiPost({ action: 'kaynak-ekle', ...veri })
export const mevzuatKaynakGuncelle = (veri) => apiPost({ action: 'kaynak-guncelle', ...veri })
export const mevzuatKaynakSil = (id) => apiDelete('kaynaklar', id)

// ---------- Kayitlar ----------
export const mevzuatKayitlarGetir = (filtreler = {}) => apiGet('kayitlar', filtreler)
export const mevzuatKayitDetayGetir = (id) => apiGet('kayit-detay', { id })
export const mevzuatIncelemeKarar = (kayitId, karar, yorum = '') => apiPost({ action: 'inceleme-karar', kayit_id: kayitId, karar, yorum })

// ---------- Kurallar ----------
export const mevzuatKurallarGetir = () => apiGet('kurallar')
export const mevzuatKuralEkle = (veri) => apiPost({ action: 'kural-ekle', ...veri })
export const mevzuatKuralGuncelle = (veri) => apiPost({ action: 'kural-guncelle', ...veri })

// ---------- Gorevler ----------
export const mevzuatGorevlerGetir = (filtreler = {}) => apiGet('gorevler', filtreler)
export const mevzuatGorevEkle = (veri) => apiPost({ action: 'gorev-ekle', ...veri })
export const mevzuatGorevDurumGuncelle = (id, durum) => apiPost({ action: 'gorev-durum', id, durum })

// ---------- Eslesmeler ----------
export const mevzuatEslesmelerGetir = (kuralId = null) => apiGet('eslesmeler', kuralId ? { kural_id: kuralId } : {})

// ---------- Tarama ----------
export const mevzuatTara = (kaynakId = null) => apiPost({ action: 'tara', ...(kaynakId ? { kaynak_id: kaynakId } : { tumu: true }) })
export const mevzuatTaramaLoglariGetir = () => apiGet('tarama-loglari')

// ---------- Panel ----------
export const mevzuatPanelGetir = () => apiGet('panel')

// ============================================================
// Faz 3: Vergi Takvimi Entegrasyonu
// ============================================================

/**
 * Onaylanmis mevzuat kurallarindan tarih icerenleri getirir.
 * Vergi takviminde gosterilecek "mevzuat kaynakli" tarihler.
 */
export const mevzuatTakvimTarihleriGetir = async () => {
  const r = await mevzuatKurallarGetir()
  if (!r.ok) return []
  return (r.kurallar || [])
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
    }))
}

/**
 * Mevzuat tarihleri ile mevcut beyan deadline'larini karsilastirir.
 * Celiski varsa uyari doner.
 */
export const mevzuatTakvimCeliskiKontrol = (mevzuatTarihler, mevcutDeadlinelar) => {
  const celiskiler = []
  for (const mt of mevzuatTarihler) {
    const mtDate = new Date(mt.tarih)
    const mtAy = mtDate.getMonth()
    const mtYil = mtDate.getFullYear()
    // Ayni ay/yil icin mevcut deadline var mi?
    const mevcut = mevcutDeadlinelar.find(d => {
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

// ============================================================
// Faz 5: Mükellef Etki Analizi
// ============================================================

/**
 * Onaylanmis bir mevzuat kuralini mevcut musterilerle karsilastirir.
 * Aday eslesmeler doner (kesin uygunluk degil).
 */
export const mukellefEtkiAnalizi = (kural, musteriler) => {
  const adaylar = []
  const eksikBilgi = []
  for (const m of musteriler) {
    let skor = 0
    const gerekce = []
    const eksik = []

    // 1) Musteri türü kontrolu
    if (kural.konu) {
      const konuLower = kural.konu.toLowerCase()
      const musteriTipi = (m.type || '').toLowerCase()
      if (konuLower.includes('sirket') || konuLower.includes('şirket') || konuLower.includes('limited') || konuLower.includes('anonim')) {
        if (musteriTipi === 'company') { skor += 30; gerekce.push('Şirket türü eşleşti') }
      }
      if (konuLower.includes('sahis') || konuLower.includes('şahıs') || konuLower.includes('bireysel')) {
        if (musteriTipi === 'individual') { skor += 30; gerekce.push('Şahıs türü eşleşti') }
      }
    }

    // 2) Faaliyet kodu kontrolu
    if (kural.konu && m.naceCode) {
      const nace = String(m.naceCode).toLowerCase()
      const konuLower = kural.konu.toLowerCase()
      // Basit anahtar kelime eslesmesi
      const anahtarlar = ['inşaat', 'ticaret', 'sanayi', 'hizmet', 'turizm', 'gida', 'tekstil', 'metal', 'elektrik', 'yazılım', 'yazilim', 'danışmanlık', 'danismanlik']
      for (const a of anahtarlar) {
        if (konuLower.includes(a) && nace.includes(a.slice(0, 4))) {
          skor += 20; gerekce.push(`Faaliyet kodu (${a}) eşleşti`); break
        }
      }
    } else if (!m.naceCode) {
      eksik.push('Faaliyet kodu (NACE) eksik')
    }

    // 3) Beyan profili kontrolu
    const bp = m.beyanProfile || m.beyan_profile || {}
    if (Object.keys(bp).length > 0) {
      skor += 10; gerekce.push('Beyan profili mevcut')
    } else {
      eksik.push('Beyan profili eksik')
    }

    // 4) SGK bilgileri kontrolu
    if (m.sgkUser || m.sgkIsyeriKodu) {
      skor += 10; gerekce.push('SGK bilgileri mevcut')
    } else {
      eksik.push('SGK bilgileri eksik')
    }

    // 5) Eski bilgi kontrolu
    if (m.closeDate) {
      eksik.push('Mükellef kapalı (close_date mevcut)')
      skor = Math.max(0, skor - 20)
    }

    // Esik: skor >= 20 ise aday
    if (skor >= 20) {
      adaylar.push({
        client_id: m.id,
        client_name: m.name || m.company || m.shortName,
        skor,
        gerekce,
        kontrol_gerekli: eksik.length > 0,
        eksik_bilgiler: eksik.length > 0 ? eksik : null,
        eslesme_tipi: eksik.length > 0 ? 'kontrol_gerekli' : 'aday',
      })
    }
  }
  // Skora gore sirala
  adaylar.sort((a, b) => b.skor - a.skor)
  return adaylar
}

/**
 * Eslesmeleri Supabase'e kaydeder (tekrar onleme ile).
 */
export const mukellefEslesmeKaydet = async (kuralId, adaylar) => {
  const { data: session } = await supabase.auth.getSession()
  const token = session?.session?.access_token
  const r = await fetch('/api/mevzuat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ action: 'eslesme-kaydet', kural_id: kuralId, adaylar })
  })
  return r.json()
}

/**
 * Eslesen musteriler icin otomatik gorev olusturur (tekrar onleme).
 */
export const otomatikGorevOlustur = async (kuralId, adaylar, baslik, sonTarih) => {
  const sonuclar = []
  for (const a of adaylar) {
    const r = await mevzuatGorevEkle({
      baslik: `${baslik} — ${a.client_name}`,
      aciklama: `Mevzuat kuralı #${kuralId} kapsamında aday eşleşme (skor: ${a.skor}). ${a.gerekce.join(', ')}.`,
      client_id: a.client_id,
      mevzuat_kural_id: kuralId,
      son_tarih: sonTarih || null,
      oncelik: a.kontrol_gerekli ? 'yuksek' : 'normal',
    })
    sonuclar.push({ client: a.client_name, ok: r.ok, error: r.error })
  }
  return sonuclar
}

// ============================================================
// Faz 4: AI Mevzuat Sohbet Baglami
// ============================================================

/**
 * Mevzuat ile ilgili soru icin bağlam hazırlar.
 * MUBİS Asistan'a gonderilecek mevzuat baglamini olusturur.
 */
export const mevzuatSohbetBaglami = async (soru) => {
  const r = await mevzuatKayitlarGetir({ limit: 20 })
  if (!r.ok || !r.kayitlar?.length) return null
  const soruLower = (soru || '').toLowerCase()
  // Anahtar kelime eslesmesi
  const anahtarlar = ['beyan', 'vergi', 'sgk', 'teblig', 'mevzuat', 'takvim', 'son gun', 'son gün', 'basvuru', 'başvuru', 'teşvik', 'tesvik', 'tarih', 'süre', 'sure']
  const ilgili = r.kayitlar.filter(k => {
    const metin = `${k.baslik} ${k.kurum} ${k.ozet || ''}`.toLowerCase()
    return anahtarlar.some(a => soruLower.includes(a) && metin.includes(a))
  })
  const kaynaklar = ilgili.length > 0 ? ilgili : r.kayitlar.slice(0, 5)
  return kaynaklar.map(k => ({
    baslik: k.baslik,
    kurum: k.kurum,
    ozet: (k.ozet || '').substring(0, 500),
    kaynak_url: k.kaynak_url,
    tarih_adaylari: k.tarih_adaylari,
    inceleme_durumu: k.inceleme_durumu,
  }))
}