import { supabase } from '../lib/supabase'

// Supabase/PostgREST istek basina EN FAZLA 999 satir dondurur (proje ayari
// max_rows = 999). Tek istekte okundugu icin cari kart listesi 6874 kartin
// yalnizca 999 tanesini gosteriyordu. Sayfa sayfa 50.000'e kadar okunur.
const SAYFA_BOYU = 1000
const SAYFA_TAVANI = 50000

// Sayfalama: dongu YALNIZCA BOS sayfada durur ve offset DONEN SATIR SAYISI
// kadar ilerler. Sabit adimla ilerlemek, sunucu 999 donerken her sayfada bir
// kayit atlatir.
async function sayfalayarakGetir(kurSorgu) {
  let hepsi = []
  for (let bas = 0; bas < SAYFA_TAVANI; ) {
    const { data, error } = await kurSorgu().range(bas, bas + SAYFA_BOYU - 1)
    if (error) throw error
    const satirlar = data || []
    hepsi = hepsi.concat(satirlar)
    if (satirlar.length === 0) break
    bas += satirlar.length
  }
  // Sayfa sinirinda kararsiz siralama ayni kaydi iki sayfada da dondurebilir;
  // id bazli tekillestirme.
  const gorulen = new Set()
  return hepsi.filter(r => (gorulen.has(r.id) ? false : (gorulen.add(r.id), true)))
}

// ==================== CARI KARTLAR ====================

export async function cariKartlariGetir(clientId) {
  return sayfalayarakGetir(() => supabase
    .from('cari_kartlar')
    .select('*')
    .eq('client_id', clientId)
    .order('unvan')
    .order('id'))
}

export async function cariKartEkle(clientId, kart) {
  const { data, error } = await supabase.from('cari_kartlar').insert(kartKaydi(clientId, kart)).select().single()
  if (error) throw error
  return data
}

function kartKaydi(clientId, kart) {
  return {
    client_id: clientId,
    kod: kart.kod || '',
    unvan: kart.unvan,
    tur: kart.tur || 'musteri',
    vkn: kart.vkn || '',
    telefon: kart.telefon || '',
    email: kart.email || '',
    sehir: kart.sehir || '',
    adres: kart.adres || '',
    vergi_dairesi: kart.vergiDairesi || '',
    para_birimi: kart.paraBirimi || 'TL',
    acik_hesap: kart.acikHesap !== false,
    vade_gunu: Number(kart.vadeGunu) || 30,
    parasal_limit: Number(kart.parasalLimit) || 0,
    notlar: kart.notlar || '',
    durum: kart.durum || 'aktif'
  }
}

// Toplu ekleme: 120/320 aktariminda binlerce kart tek tek eklenince her kart
// icin bir gidis-donus yapiliyor ve islem dakikalarca suruyordu. 500'luk
// paketler halinde eklenir; bir paket hata verirse o paket tek tek denenir,
// boylece saglam kayitlar kaybolmaz ve sayilar dogru raporlanir.
export async function cariKartlariTopluEkle(clientId, kartlar) {
  const satirlar = kartlar.map(k => kartKaydi(clientId, k))
  let sayi = 0
  let hataSayi = 0
  const PAKET = 500
  for (let i = 0; i < satirlar.length; i += PAKET) {
    const paket = satirlar.slice(i, i + PAKET)
    const { data, error } = await supabase.from('cari_kartlar').insert(paket).select('id')
    if (!error) {
      sayi += (data || []).length
      continue
    }
    for (const tek of paket) {
      const { error: e2 } = await supabase.from('cari_kartlar').insert(tek)
      if (e2) hataSayi++
      else sayi++
    }
  }
  return { sayi, hataSayi }
}

export async function cariKartGuncelle(id, kart) {
  const kayit = {
    kod: kart.kod || '',
    unvan: kart.unvan,
    tur: kart.tur || 'musteri',
    vkn: kart.vkn || '',
    telefon: kart.telefon || '',
    email: kart.email || '',
    sehir: kart.sehir || '',
    adres: kart.adres || '',
    vergi_dairesi: kart.vergiDairesi || '',
    para_birimi: kart.paraBirimi || 'TL',
    acik_hesap: kart.acikHesap !== false,
    vade_gunu: Number(kart.vadeGunu) || 30,
    parasal_limit: Number(kart.parasalLimit) || 0,
    notlar: kart.notlar || '',
    durum: kart.durum || 'aktif'
  }
  const { data, error } = await supabase.from('cari_kartlar').update(kayit).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function cariKartSil(id) {
  const { error } = await supabase.from('cari_kartlar').delete().eq('id', id)
  if (error) throw error
}

// Toplu silme: id listesindeki cari kartlari tek komutta siler
export async function cariKartlarSil(ids) {
  if (!Array.isArray(ids) || !ids.length) return
  const { error } = await supabase.from('cari_kartlar').delete().in('id', ids)
  if (error) throw error
}

// ==================== CARI HAREKETLER ====================

export async function cariHareketleriGetir(clientId, kartId = null) {
  return sayfalayarakGetir(() => {
    let q = supabase.from('cari_hareketler').select('*').eq('client_id', clientId).order('tarih').order('id')
    if (kartId) q = q.eq('kart_id', kartId)
    return q
  })
}

export async function cariHareketEkle(clientId, hareket) {
  const kayit = {
    client_id: clientId,
    kart_id: hareket.kartId,
    tarih: hareket.tarih,
    vade_tarihi: hareket.vadeTarihi || null,
    islem_turu: hareket.islemTuru,
    belge_no: hareket.belgeNo || '',
    aciklama: hareket.aciklama || '',
    para_birimi: hareket.paraBirimi || 'TL',
    doviz_tutar: hareket.paraBirimi && hareket.paraBirimi !== 'TL' ? (Number(hareket.dovizTutar) || null) : null,
    doviz_kur: hareket.paraBirimi && hareket.paraBirimi !== 'TL' ? (Number(hareket.dovizKur) || 1) : 1,
    odeme_yontemi: hareket.odemeYontemi || null,
    borc: Number(hareket.borc) || 0,
    alacak: Number(hareket.alacak) || 0
  }
  const { data, error } = await supabase.from('cari_hareketler').insert(kayit).select().single()
  if (error) throw error
  return data
}

export async function cariHareketGuncelle(id, hareket) {
  const kayit = {
    tarih: hareket.tarih,
    vade_tarihi: hareket.vadeTarihi || null,
    islem_turu: hareket.islemTuru,
    belge_no: hareket.belgeNo || '',
    aciklama: hareket.aciklama || '',
    para_birimi: hareket.paraBirimi || 'TL',
    doviz_tutar: hareket.paraBirimi && hareket.paraBirimi !== 'TL' ? (Number(hareket.dovizTutar) || null) : null,
    doviz_kur: hareket.paraBirimi && hareket.paraBirimi !== 'TL' ? (Number(hareket.dovizKur) || 1) : 1,
    odeme_yontemi: hareket.odemeYontemi || null,
    borc: Number(hareket.borc) || 0,
    alacak: Number(hareket.alacak) || 0
  }
  const { data, error } = await supabase.from('cari_hareketler').update(kayit).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function cariHareketSil(id) {
  const { error } = await supabase.from('cari_hareketler').delete().eq('id', id)
  if (error) throw error
}

// Cari virmani: kaynak cariden cikis (alacak, borcu azalir) + hedef cariye giris (borc, artar)
export async function cariVirmanYap(clientId, v) {
  const tutar = Number(v.tutar) || 0
  if (tutar <= 0) throw new Error('Tutar sıfırdan büyük olmalı')
  const kaynak = Number(v.kaynakKartId)
  const hedef = Number(v.hedefKartId)
  if (!kaynak || !hedef || kaynak === hedef) throw new Error('Kaynak ve hedef cari farklı olmalı')
  const tarih = v.tarih || new Date().toISOString().slice(0, 10)
  const aciklama = (v.aciklama || 'Cari virmanı').trim()
  await cariHareketEkle(clientId, {
    kartId: kaynak, tarih, islemTuru: 'virman', borc: 0, alacak: tutar,
    aciklama: v.hedefAd ? `${aciklama} → ${v.hedefAd}` : aciklama
  })
  await cariHareketEkle(clientId, {
    kartId: hedef, tarih, islemTuru: 'virman', borc: tutar, alacak: 0,
    aciklama: v.kaynakAd ? `${aciklama} ← ${v.kaynakAd}` : aciklama
  })
}

// ==================== HESAPLAMALAR ====================

export const CARI_ISLEM_TURLERI = [
  { id: 'acilis', label: 'Açılış Fişi', borcMu: null },
  { id: 'satis-fatura', label: 'Satış Faturası', borcMu: true },
  { id: 'alis-fatura', label: 'Alış Faturası', borcMu: false },
  { id: 'tahsilat', label: 'Tahsilat', borcMu: false },
  { id: 'odeme', label: 'Ödeme', borcMu: true },
  { id: 'manuel-borc', label: 'Manuel Borç', borcMu: true },
  { id: 'manuel-alacak', label: 'Manuel Alacak', borcMu: false },
  { id: 'muzahat', label: 'Mahsup / Mutabakat', borcMu: null },
  { id: 'virman', label: 'Cari Virmanı', borcMu: null }
]

export const CARI_DOVIZLER = ['TL', 'USD', 'EUR', 'GBP']

export const CARI_ODEME_YONTEMLERI = [
  { id: 'nakit', label: 'Nakit' },
  { id: 'havale-eft', label: 'Havale / EFT' },
  { id: 'cek', label: 'Çek' },
  { id: 'senet', label: 'Senet' },
  { id: 'kredi-karti', label: 'Kredi Kartı' },
  { id: 'diger', label: 'Diğer' }
]

export const CARI_CEK_SENET_DURUMLARI = [
  { id: 'portfoyde', label: 'Portföyde', renk: 'bg-blue-500/20 text-blue-300' },
  { id: 'tahsil-edildi', label: 'Tahsil Edildi', renk: 'bg-emerald-500/20 text-emerald-300' },
  { id: 'odendi', label: 'Ödendi', renk: 'bg-emerald-500/20 text-emerald-300' },
  { id: 'ciro-edildi', label: 'Ciro Edildi', renk: 'bg-purple-500/20 text-purple-300' },
  { id: 'karsiliksiz', label: 'Karşılıksız', renk: 'bg-rose-500/20 text-rose-300' },
  { id: 'iade-edildi', label: 'İade Edildi', renk: 'bg-gray-500/20 text-gray-300' }
]

export async function cariCekSenetDurumGuncelle(id, durum) {
  const { error } = await supabase.from('cari_hareketler').update({ cek_senet_durum: durum }).eq('id', id)
  if (error) throw error
}

// Ekstre PDF'ini storage'a yukleyip paylasilabilir public URL dondurur
export async function ekstrePdfYukle(clientId, kartId, donem, blob) {
  const yol = `${clientId}/ekstre/ekstre_${kartId}_${donem}.pdf`
  const { error } = await supabase.storage.from('client-documents').upload(yol, blob, { upsert: true, contentType: 'application/pdf' })
  if (error) throw error
  const { data } = supabase.storage.from('client-documents').getPublicUrl(yol)
  return data.publicUrl
}

// Tum hareketleri kartlara ozetleyen hesaplama
export function cariOzetHesapla(kartlar, hareketler, bugun = new Date()) {
  const bugunStr = bugun.toISOString().slice(0, 10)
  const kartOzetleri = kartlar.map(k => {
    const hr = hareketler.filter(h => h.kart_id === k.id)
    let borc = 0, alacak = 0
    let vadesiGecenAlacak = 0, vadesiGelmisAlacak = 0
    for (const h of hr) {
      borc += Number(h.borc) || 0
      alacak += Number(h.alacak) || 0
      const vade = h.vade_tarihi || h.tarih
      if ((Number(h.borc) || 0) > 0) {
        if (vade && vade < bugunStr) vadesiGecenAlacak += Number(h.borc)
        else vadesiGelmisAlacak += Number(h.borc)
      }
    }
    const bakiye = borc - alacak // +: musteri bize borclu, -: biz borcluyuz
    return {
      ...k,
      toplamBorc: borc,
      toplamAlacak: alacak,
      bakiye,
      vadesiGecenAlacak,
      vadesiGelmisAlacak,
      sonHareket: hr.length ? hr[hr.length - 1].tarih : null
    }
  })
  const toplamBorc = kartOzetleri.reduce((s, k) => s + k.toplamBorc, 0)
  const toplamAlacak = kartOzetleri.reduce((s, k) => s + k.toplamAlacak, 0)
  const vadesiGecen = kartOzetleri.reduce((s, k) => s + k.vadesiGecenAlacak, 0)
  const alacakliKartSayisi = kartOzetleri.filter(k => k.bakiye > 0.005).length
  const borcluKartSayisi = kartOzetleri.filter(k => k.bakiye < -0.005).length
  return { kartOzetleri, toplamBorc, toplamAlacak, netBakiye: toplamBorc - toplamAlacak, vadesiGecen, alacakliKartSayisi, borcluKartSayisi }
}

// Vade dagilimi: acik alacaklari (borc-alacak FIFO kapama) vade tarihinden
// bugune gecen gune gore kovalara ayirir (0-30 / 31-60 / 61-90 / 90+ gun).
export function yasantdirmaHesapla(kartlar, hareketler, bugun = new Date()) {
  const bugunMs = bugun.getTime()
  const kovlar = { '0-30 gün': 0, '31-60 gün': 0, '61-90 gün': 0, '90+ gün': 0 }
  for (const kart of kartlar) {
    const hr = hareketler
      .filter(h => h.kart_id === kart.id)
      .sort((a, b) => (a.tarih + a.id).localeCompare(b.tarih + b.id))
    // FIFO acik borc kuyrugu
    let kuyruk = [] // { kalan, vade }
    for (const h of hr) {
      let b = Number(h.borc) || 0
      let a = Number(h.alacak) || 0
      while (a > 0.005 && kuyruk.length) {
        const odenecek = Math.min(a, kuyruk[0].kalan)
        kuyruk[0].kalan -= odenecek
        a -= odenecek
        if (kuyruk[0].kalan < 0.005) kuyruk.shift()
      }
      if (b > 0.005) kuyruk.push({ kalan: b, vade: h.vade_tarihi || h.tarih })
      if (a > 0.005) kuyruk = [] // artan alacak: borcu kapatti say (sadelestirme)
    }
    for (const item of kuyruk) {
      const gun = Math.floor((bugunMs - new Date(item.vade).getTime()) / 86400000)
      if (gun <= 30) kovlar['0-30 gün'] += item.kalan
      else if (gun <= 60) kovlar['31-60 gün'] += item.kalan
      else if (gun <= 90) kovlar['61-90 gün'] += item.kalan
      else kovlar['90+ gün'] += item.kalan
    }
  }
  return Object.entries(kovlar).map(([ad, tutar]) => ({ ad, tutar: Math.max(0, tutar) }))
}

// Son 6 ayin borc/alacak toplamlari (grafik icin)
export function aylikHareketOzeti(hareketler, adet = 6) {
  const aylar = []
  const bugun = new Date()
  for (let i = adet - 1; i >= 0; i--) {
    const d = new Date(bugun.getFullYear(), bugun.getMonth() - i, 1)
    const y = d.getFullYear(), m = d.getMonth() + 1
    const onEk = `${y}-${String(m).padStart(2, '0')}`
    const hr = hareketler.filter(h => (h.tarih || '').startsWith(onEk))
    aylar.push({
      ay: onEk,
      etiket: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'][m - 1],
      borc: hr.reduce((s, h) => s + (Number(h.borc) || 0), 0),
      alacak: hr.reduce((s, h) => s + (Number(h.alacak) || 0), 0)
    })
  }
  return aylar
}

// Ekstre: baslangic bakiyesi + sirali hareketler + yuruyen bakiye
export function ekstreHesapla(hareketler, baslangicTarihi, bitisTarihi) {
  const donemOncesi = hareketler.filter(h => h.tarih < baslangicTarihi)
  const donemIci = hareketler.filter(h => h.tarih >= baslangicTarihi && h.tarih <= bitisTarihi)
  const baslangicBakiyesi = donemOncesi.reduce((s, h) => s + (Number(h.borc) || 0) - (Number(h.alacak) || 0), 0)
  let yuruyen = baslangicBakiyesi
  const satirlar = donemIci.map(h => {
    yuruyen += (Number(h.borc) || 0) - (Number(h.alacak) || 0)
    return { ...h, bakiye: yuruyen }
  })
  const donemBorc = donemIci.reduce((s, h) => s + (Number(h.borc) || 0), 0)
  const donemAlacak = donemIci.reduce((s, h) => s + (Number(h.alacak) || 0), 0)
  return { baslangicBakiyesi, satirlar, donemBorc, donemAlacak, bitisBakiyesi: yuruyen }
}
