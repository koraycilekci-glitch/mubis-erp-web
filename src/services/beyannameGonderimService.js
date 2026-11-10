import { supabase } from '../lib/supabase'
import { gibYardimciIs } from '../utils/gibOdemeHelper'

// ------------------------------------------------------------
// GiB e-Beyan REST API entegrasyonu (2.7.543)
// Token Dijital VD > e-Beyan > Profil > Entegrasyon Yonetimi > Olustur
// adresinden alinir; yerel yardimci programda diskte saklanir, tarayiciya
// geri donmez. Tum API istekleri yardimci program uzerinden gider.
// ------------------------------------------------------------
export async function ebeyanTokenDurum() {
  try {
    return await gibYardimciIs('ebeyan-token-durum', {}, 15000)
  } catch (e) {
    return { ok: true, kayitli: false, yardimciYok: String(e?.message || e || '').includes('bağlan') || /yardimci|helper|connect|ECONN/i.test(String(e?.message || e || '')), hata: String(e?.message || e || '') }
  }
}
export async function ebeyanTokenKaydet({ token, ortam, entegratorVkn, entegratorUnvan }) {
  return gibYardimciIs('ebeyan-token-kaydet', { token, ortam, entegratorVkn, entegratorUnvan }, 20000)
}
export async function ebeyanTokenSil() {
  return gibYardimciIs('ebeyan-token-sil', {}, 15000)
}
export async function ebeyanBaglantiTesti(mukellefVkn) {
  return gibYardimciIs('ebeyan-baglanti-testi', { mukellefVkn }, 90000)
}
export async function ebeyanApiGonder({ tur, mukellefVkn, payload }) {
  return gibYardimciIs('ebeyan-gonder', { tur, mukellefVkn, payload }, 5 * 60 * 1000)
}

// Beyanname turu -> e-Beyan API tur kodu
export const API_TUR_KODU = {
  kdv1: 'kdv1', kdv2: 'kdv2', damga: 'damga', muhtasar: 'muhsgk',
}

// Secili musteri + donemin efatura/earsiv faturalarindan KDV1 matrisini
// doldurur: satis faturalari "Hesaplanan KDV" (matrah+KDV oran bazli),
// alis faturalari "Indirilecek KDV" satirlarini verir.
// KDV orani kolonu tabloda olmadigindan fatura basina kdv/matrah
// oranindan bilinen oranlara yuvarlanarak turetilir.
export async function kdvMatrisGetir(clientId, yil, ay) {
  const bas = `${yil}-${String(ay).padStart(2, '0')}-01`
  const son = new Date(Date.UTC(yil, ay, 0)).toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('efatura_faturalar')
    .select('yon,tur,matrah,kdv,tutar,para_birimi')
    .eq('client_id', clientId)
    .gte('tarih', bas).lte('tarih', son)
  if (error) throw error
  const ORANLAR = [0, 1, 5, 8, 10, 20]
  const n = v => (v == null ? 0 : Number(v) || 0)
  const oranBul = f => {
    const m = n(f.matrah)
    if (!m) return 0
    const o = (n(f.kdv) / m) * 100
    return ORANLAR.reduce((en, x) => (Math.abs(x - o) < Math.abs(en - o) ? x : en), 0)
  }
  const grupla = liste => {
    const harita = new Map()
    for (const f of liste) {
      const oran = oranBul(f)
      const g = harita.get(oran) || { oran, matrah: 0, kdv: 0, adet: 0 }
      g.matrah += n(f.matrah); g.kdv += n(f.kdv); g.adet++
      harita.set(oran, g)
    }
    return [...harita.values()].map(g => ({
      oran: g.oran, matrah: Math.round(g.matrah * 100) / 100,
      kdv: Math.round(g.kdv * 100) / 100, adet: g.adet,
    })).sort((a, b) => b.oran - a.oran)
  }
  const paras = [...new Set((data || []).map(f => f.para_birimi || 'TRY'))]
  const tuz = (data || []).filter(f => (f.para_birimi || 'TRY') !== 'TRY').length
  return {
    satis: grupla((data || []).filter(f => f.yon === 'satis' || f.yon === 'giden')),
    alis: grupla((data || []).filter(f => f.yon === 'alis' || f.yon === 'gelen')),
    paraBirimi: paras.length === 1 ? paras[0] : 'TRY',
    dövizKarışık: paras.length > 1, dövizAdet: tuz,
  }
}


// 2.7.543: e-Beyanname Gonderim Merkezi servisi.
// GERCEK GiB e-Beyanname entegrasyonu (API anahtari, IP beyani, yetkilendirme)
// tamamlanana kadar gonderimler TEST modunda calisir: kayit "gonderildi (test)"
// olarak isaretlenir, GiB'e hicbir istek atilmaz.

export const BEYANNAME_TURLERI = [
  { id: 'kdv1', ad: 'KDV 1' },
  { id: 'kdv2', ad: 'KDV 2' },
  { id: 'muhtasar', ad: 'Muhtasar ve Prim Hizmet Beyannamesi' },
  { id: 'damga', ad: 'Damga Vergisi' },
  { id: 'gelir-gecici', ad: 'Gelir Geçici Vergi' },
  { id: 'kurum-gecici', ad: 'Kurum Geçici Vergi' },
  { id: 'yillik-gelir', ad: 'Yıllık Gelir Vergisi' },
  { id: 'kurumlar', ad: 'Kurumlar Vergisi' },
]

export const DURUMLAR = {
  hazir: { ad: 'Hazır', renk: 'text-emerald-400' },
  kontrol: { ad: 'Kontrol bekliyor', renk: 'text-amber-400' },
  gonderim: { ad: 'Gönderim bekliyor', renk: 'text-sky-400' },
  gonderildi_test: { ad: 'Gönderildi (TEST)', renk: 'text-violet-400' },
  gonderildi: { ad: 'Gönderildi', renk: 'text-emerald-400' },
  hata: { ad: 'Hata', renk: 'text-red-400' },
}

export async function musterileriGetir() {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, company, vkn, tc, type, email, phone, tax_office')
    .order('name', { ascending: true })
  if (error) throw error
  return (data || []).map(m => ({ ...m, ad: (m.company || m.name || '').trim(), kimlikNo: m.vkn || m.tc || '' }))
    .filter(m => m.ad)
}

export async function kayitlariGetir(yil, ay, turId) {
  let q = supabase
    .from('beyanname_gonderimleri')
    .select('id, client_id, beyanname_tur, yil, ay, durum, test_modu, gib_referans, mesaj, created_at, guncelleme_at, clients(name, company, vkn, tc)')
    .eq('yil', yil).eq('ay', ay)
  // 0032 GGECICI: gelir + kurum gecici birlikte (yeni e-Beyan tek tur)
  if (turId === 'gecici') q = q.in('beyanname_tur', ['gelir-gecici', 'kurum-gecici'])
  else if (turId) q = q.eq('beyanname_tur', turId)
  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(k => ({
    ...k,
    ad: ((k.clients?.company || k.clients?.name) || '').trim(),
    kimlikNo: k.clients?.vkn || k.clients?.tc || '',
  }))
}

// Mükellefleri Getir: secili tur + donem icin musteri kayitlarindan "hazir"
// satirlari olusturur (mevcut kayit korunur).
export async function hazirKayitlariOlustur({ musteriler, yil, ay, turId, seciliIdler }) {
  const secim = seciliIdler && seciliIdler.length ? new Set(seciliIdler) : null
  const hedefler = musteriler.filter(m => !secim || secim.has(m.id))
  if (!hedefler.length) return 0
  // 0032 GGECICI: sirket (kurumlar vergisi mukellefi) → kurum-gecici, digerleri → gelir-gecici
  const turSec = m => (turId === 'gecici' ? (m.type === 'company' ? 'kurum-gecici' : 'gelir-gecici') : turId)
  const satirlar = hedefler.map(m => ({
    client_id: m.id,
    beyanname_tur: turSec(m),
    yil,
    ay,
    durum: 'hazir',
    test_modu: true,
    mesaj: 'Mükellefleri Getir ile oluşturuldu',
  }))
  const { error } = await supabase
    .from('beyanname_gonderimleri')
    .upsert(satirlar, { onConflict: 'client_id,beyanname_tur,yil,ay', ignoreDuplicates: true })
  if (error) throw error
  return satirlar.length
}

export async function durumuGuncelle(id, { durum, mesaj, gibReferans, testModu }) {
  const yama = { durum, guncelleme_at: new Date().toISOString() }
  if (mesaj != null) yama.mesaj = mesaj
  if (gibReferans != null) yama.gib_referans = gibReferans
  if (testModu != null) yama.test_modu = testModu
  const { error } = await supabase.from('beyanname_gonderimleri').update(yama).eq('id', id)
  if (error) throw error
}

// Gonderim oncesi kontrol: kimlik no ve musteri baglantisi var mi.
// GiB entegrasyonu geldiginde buraya sema/XML dogrulamasi eklenecek.
export function kontrolSonucu(kayit) {
  const eksikler = []
  if (!kayit.kimlikNo) eksikler.push('VKN/TCKN eksik')
  if (!kayit.ad) eksikler.push('Mükellef adı eksik')
  if (!kayit.beyanname_tur) eksikler.push('Beyanname türü seçilmemiş')
  return { ok: eksikler.length === 0, eksikler }
}

// TEST gonderimi: gercek GiB istegi ATILMAZ.
export async function testGonder(kayit) {
  const kontrol = kontrolSonucu(kayit)
  if (!kontrol.ok) {
    await durumuGuncelle(kayit.id, { durum: 'kontrol', mesaj: 'Kontrol başarısız: ' + kontrol.eksikler.join(', ') })
    return { ok: false, mesaj: kontrol.eksikler.join(', ') }
  }
  const referans = `TEST-${Date.now()}`
  await durumuGuncelle(kayit.id, {
    durum: 'gonderildi_test',
    gibReferans: referans,
    testModu: true,
    mesaj: 'TEST gönderimi — gerçek GİB gönderiminin yerine geçmez.',
  })
  return { ok: true, referans }
}
