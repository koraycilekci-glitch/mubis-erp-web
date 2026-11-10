// KDV Dökümleri — özel kalem bölümleri.
//
// Fatura KDV dökümleri (KDV Oranları) tüm alınan/kesilen faturaları kapsar.
// Ancak aşağıdaki kalemler KDV beyanında AYRI satırlarda izlenir ve karıştırılır:
//
//   Tevkifat Alış   (gelen, fatura_turu=TEVKIFAT) -> sorumlu sıfatıyla ödenen
//                    KDV. Tutar = hesaplanan KDV − faturada yazan KDV.
//                    İndirilecek KDV tarafında ayrıca gösterilir.
//   Tevkifat Satış  (giden, fatura_turu=TEVKIFAT) -> tevkif edilen KDV.
//                    Hesaplanan KDV'den düşülür; tahsil edilen tarafta izlenir.
//   Alıştan İade    (gelen, fatura_turu=IADE)     -> indirilecek KDV'den düşer.
//   Satıştan İade   (giden, fatura_turu=IADE)     -> hesaplanan KDV'den düşer.
//
// Her bölüm AY AY gruplanır (Ocak..Aralık); satırlar tıklanınca açılır.
import { supabase } from '../lib/supabase'
import { getAppSetting, setAppSetting } from './settingsService'

const sayi = (v) => {
  const n = Number(v)
  return isFinite(n) ? n : 0
}
const kurus = (n) => Math.round(n * 100) / 100

// Türkçe harf toleranslı normalizasyon (TEVKİFAT / TEVKIFAT / tevkifat)
const norm = (s) => String(s || '')
  .toLocaleUpperCase('tr')
  .replace(/[İIı]/g, 'I')
  .replace(/Ç/g, 'C').replace(/Ğ/g, 'G')
  .replace(/Ö/g, 'O').replace(/Ş/g, 'S')
  .replace(/Ü/g, 'U')

export const tevkifatMi = (faturaTuru) => norm(faturaTuru).includes('TEVKIFAT')
export const iadeMi = (faturaTuru) => norm(faturaTuru).includes('IADE')

export const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

// Faturanın KDV dökümünden hesaplanan (tevkifat öncesi) tam KDV.
//
// ÖNEMLİ: Tevkifatlı faturalarda XML'in TaxSubtotal KDV tutarı TEVKİF
// EDİLMİŞ tutardır (ör. 95.480 × %20 = 19.096 hesaplanan; faturada 5.728,80).
// Bu yüzden "hesaplanan" değer, parça KDV'sinin toplamı DEĞİL,
// matrah × oran olarak her parça için ayrı hesaplanır.
const hesaplananKdv = (detaylar, faturaKdv = 0) => {
  if (!Array.isArray(detaylar) || !detaylar.length) return null
  let toplam = 0
  let gecerli = false
  for (const d of detaylar) {
    const oran = Number(d?.oran)
    const matrah = sayi(d?.matrah)
    if (isFinite(oran) && oran > 0 && matrah > 0) {
      toplam += matrah * oran / 100
      gecerli = true
    } else {
      toplam += sayi(d?.kdv)
    }
  }
  if (!gecerli) return null
  // Hesaplanan, faturadaki (tevkif edilmiş) KDV'den küçük olamaz.
  return kurus(Math.max(toplam, faturaKdv))
}

const baskinOran = (detaylar) => {
  if (!Array.isArray(detaylar) || !detaylar.length) return null
  // Parçaların oranı zaten KDV oranıdır (matrah × oran = hesaplanan KDV).
  // Matrah ağırlıklı tek oran varsa onu, yoksa ilk geçerli oranı döndür.
  const gecerli = detaylar.filter(d => isFinite(Number(d?.oran)) && Number(d.oran) > 0)
  if (!gecerli.length) return null
  const oranlar = [...new Set(gecerli.map(d => Number(d.oran)))]
  if (oranlar.length === 1) return oranlar[0]
  const matrahToplam = gecerli.reduce((s, d) => s + sayi(d.matrah), 0)
  if (matrahToplam <= 0) return oranlar[0]
  const oran = gecerli.reduce((s, d) => s + sayi(d.matrah) * Number(d.oran), 0) / matrahToplam
  return Math.round(oran * 10) / 10
}

// Bir yılın tamamını (veya tek ayını) tek seferde okur.
async function yilFaturalari(clientId, yil, ay = null) {
  const baslangic = ay ? `${yil}-${String(ay).padStart(2, '0')}-01` : `${yil}-01-01`
  const bitis = ay
    ? `${ay === 12 ? yil + 1 : yil}-${String(ay === 12 ? 1 : ay + 1).padStart(2, '0')}-01`
    : `${yil + 1}-01-01`
  const hepsi = []
  for (let from = 0; ; ) {
    const { data, error } = await supabase.from('efatura_faturalar')
      .select('id, yon, tur, fatura_turu, fatura_no, tarih, matrah, kdv, tutar, karsi_unvan')
      .eq('client_id', clientId)
      .gte('tarih', baslangic).lt('tarih', bitis)
      .order('tarih', { ascending: true })
      .range(from, from + 999)
    if (error) throw error
    if (!data?.length) break
    hepsi.push(...data)
    from += data.length
  }
  return hepsi
}

async function detaylariOku(idler) {
  const detaylar = {}
  for (let offset = 0; offset < idler.length; offset += 150) {
    const parca = idler.slice(offset, offset + 150)
    const { data, error } = await supabase.from('efatura_kdv_detay')
      .select('fatura_id, oran, matrah, kdv')
      .in('fatura_id', parca)
      .order('fatura_id', { ascending: true })
    if (error) { console.warn('[kdv-ozel] KDV detayı alınamadı:', error.message); continue }
    for (const d of (data || [])) (detaylar[d.fatura_id] ||= []).push(d)
  }
  return detaylar
}

const KATEGORILER = [
  { anahtar: 'tevkifatAlis',  baslik: 'Tevkifat Alış',  yon: 'gelen', test: tevkifatMi, taraf: 'indirilecek' },
  { anahtar: 'tevkifatSatis', baslik: 'Tevkifat Satış', yon: 'giden', test: tevkifatMi, taraf: 'hesaplanan' },
  // İADE YÖNÜ:
  //   Alıştan İade  = ALDIĞIMIZ malı firmaya iade ediyoruz -> BİZ iade
  //                   faturası KESERİZ  -> yon 'giden' (kesilen)
  //   Satıştan İade = müşteri bizden aldığı malı iade ediyor -> karşı firma
  //                   BİZE iade faturası keser -> yon 'gelen' (alınan)
  { anahtar: 'alistanIade',   baslik: 'Alıştan İade',   yon: 'giden', test: iadeMi,     taraf: 'hesaplanan' },
  { anahtar: 'satistanIade',  baslik: 'Satıştan İade',  yon: 'gelen', test: iadeMi,     taraf: 'indirilecek' }
]

// Aynı fatura birden çok kez kaydedilmiş olabilir (Luca sorgusu + manuel
// yükleme, tekrar indirme vb.). Aynı fatura_no + tarih + matrah + KDV olan
// kayıtlar TEK satıra indirilir. Hangi kayıt tutulur:
//   1. KDV dökümü (efatura_kdv_detay) olan  -> oran/tevkifat doğru hesaplanır
//   2. Ünvanı dolu olan
// Bu sıralama olmadan ünvansız/dökümsüz kopya önce gelip tevkifat 0 çıkıyordu.
function mukerrerTemizle(liste, detaylar) {
  const gruplar = new Map()
  for (const f of liste) {
    const anahtar = [
      String(f.fatura_no || '').trim().toLocaleUpperCase('tr'),
      String(f.tarih || '').slice(0, 10),
      kurus(sayi(f.matrah)),
      kurus(sayi(f.kdv)),
      f.yon,
      norm(f.fatura_turu)
    ].join('|')
    if (!gruplar.has(anahtar)) gruplar.set(anahtar, [])
    gruplar.get(anahtar).push(f)
  }
  const sonuc = []
  for (const grup of gruplar.values()) {
    if (grup.length === 1) { sonuc.push(grup[0]); continue }
    const puan = (f) => {
      const dokumVar = (detaylar[f.id] || []).length > 0 ? 2 : 0
      const unvanVar = String(f.karsi_unvan || '').trim() ? 1 : 0
      return dokumVar + unvanVar
    }
    sonuc.push(grup.slice().sort((a, b) => puan(b) - puan(a) || Number(a.id) - Number(b.id))[0])
  }
  return sonuc
}

// Yıl + ay bazlı döküm. ay verilirse YALNIZCA o ayın faturaları listelenir;
// ay verilmezse 12 ayın tamamı gruplanır.
export async function kdvOzelDokumler({ clientId, yil, ay = null }) {
  const faturalar = await yilFaturalari(clientId, yil, ay)
  const secilenler = []
  for (const k of KATEGORILER) {
    secilenler.push(...faturalar.filter(f => f.yon === k.yon && k.test(f.fatura_turu)))
  }
  const detaylar = await detaylariOku([...new Set(secilenler.map(f => f.id))])
  // Mükerrer kayıtları tekilleştir (KDV dökümü olan kayıt tercih edilir)
  const tekil = mukerrerTemizle(secilenler, detaylar)

  const sonuc = {}
  for (const k of KATEGORILER) {
    const aylar = AY_ADLARI.map((ad, i) => ({
      ay: i + 1, ayAd: ad, satirlar: [],
      matrah: 0, kdv: 0, tevkifatKdv: 0, sayisi: 0
    }))
    for (const f of tekil.filter(x => x.yon === k.yon && k.test(x.fatura_turu))) {
      const m = parseInt(String(f.tarih).slice(5, 7), 10)
      if (!(m >= 1 && m <= 12)) continue
      const detay = detaylar[f.id] || []
      const faturaKdv = kurus(sayi(f.kdv))
      const hesap = kdvOzelHesapla({ k, f, detay, faturaKdv })
      if (!hesap) continue
      const ayGrubu = aylar[m - 1]
      ayGrubu.satirlar.push(hesap)
      ayGrubu.matrah = kurus(ayGrubu.matrah + hesap.matrah)
      ayGrubu.kdv = kurus(ayGrubu.kdv + hesap.kdv)
      ayGrubu.tevkifatKdv = kurus(ayGrubu.tevkifatKdv + hesap.tevkifatKdv)
      ayGrubu.sayisi++
    }
    const toplam = aylar.reduce((t, a) => ({
      matrah: kurus(t.matrah + a.matrah),
      kdv: kurus(t.kdv + a.kdv),
      tevkifatKdv: kurus(t.tevkifatKdv + a.tevkifatKdv),
      sayisi: t.sayisi + a.sayisi
    }), { matrah: 0, kdv: 0, tevkifatKdv: 0, sayisi: 0 })
    sonuc[k.anahtar] = {
      ...k,
      aylar: aylar.filter(a => a.sayisi > 0),
      toplam
    }
  }
  return sonuc
}

// Tek fatura satırı. Tevkifat türünde KDV iki parçaya ayrılır:
//   hesaplanan (tevkifat öncesi) − faturada yazan = tevkifat KDV
// İade türünde KDV doğrudan iade tutarıdır (negatif etki panelde uygulanır).
function kdvOzelHesapla({ k, f, detay, faturaKdv }) {
  const matrah = kurus(sayi(f.matrah))
  const temel = {
    id: f.id,
    tarih: f.tarih,
    fatura_no: f.fatura_no || '',
    unvan: f.karsi_unvan || '',
    tur: f.tur,
    matrah,
    oran: baskinOran(detay)
  }
  if (k.test === tevkifatMi) {
    const hesap = hesaplananKdv(detay, faturaKdv)
    // KDV dökümü yoksa faturadaki KDV "hesaplanan" kabul edilir; tevkifat çıkmaz.
    const hesaplanan = hesap ?? faturaKdv
    const tevkifat = kurus(Math.max(0, hesaplanan - faturaKdv))
    return {
      ...temel,
      kdv: faturaKdv,
      hesaplananKdv: hesaplanan,
      tevkifatKdv: tevkifat,
      detayYok: hesap === null
    }
  }
  return { ...temel, kdv: faturaKdv, hesaplananKdv: faturaKdv, tevkifatKdv: 0, detayYok: false }
}

// ---- Ödendi / Ödenmedi (yalnızca Tevkifat Alış = sorumlu sıfatıyla ödenen) ----
const durumAnahtari = (clientId, yil, ay) => `tevkifat_odendi_${clientId}_${yil}_${ay}`

export async function tevkifatOdendiOku({ clientId, yil, ay }) {
  try {
    return String(await getAppSetting(durumAnahtari(clientId, yil, ay)) || '') === '1'
  } catch {
    return false
  }
}

// Ham durum: true/false (kullanıcı seçti) veya null (hiç seçilmedi).
// GİB 109 doluysa "otomatik ödendi" yalnızca null iken uygulanır;
// kullanıcı bilerek "Ödenmedi" dediyse üzerine yazılmaz.
export async function tevkifatDurumOku({ clientId, yil, ay }) {
  try {
    const deger = await getAppSetting(durumAnahtari(clientId, yil, ay))
    if (deger === null || deger === undefined || deger === '') return null
    return String(deger) === '1'
  } catch {
    return null
  }
}

export async function tevkifatOdendiYaz({ clientId, yil, ay, odendi }) {
  return setAppSetting(durumAnahtari(clientId, yil, ay), odendi ? '1' : '0')
}

// Tek dönemlik tevkifat alış dökümü (aylık panel / KDV hesabı için).
export async function tevkifatKdvDokumu({ clientId, yil, ay }) {
  const tumu = await kdvOzelDokumler({ clientId, yil, ay })
  const g = tumu.tevkifatAlis
  const ayGrubu = g.aylar.find(a => a.ay === ay)
  const satirlar = ayGrubu?.satirlar || []
  return {
    satirlar,
    sayisi: ayGrubu?.sayisi || 0,
    toplam: {
      matrah: ayGrubu?.matrah || 0,
      kdv: ayGrubu?.kdv || 0,
      hesaplananKdv: kurus(satirlar.reduce((s, r) => s + sayi(r.hesaplananKdv), 0)),
      faturaKdv: ayGrubu?.kdv || 0,
      tevkifatKdv: ayGrubu?.tevkifatKdv || 0
    },
    hesaplanamayanlar: satirlar.filter(r => r.detayYok),
    hesaplanamayanSayisi: satirlar.filter(r => r.detayYok).length
  }
}
