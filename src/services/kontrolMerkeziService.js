import { supabase } from '../lib/supabase'
import { listAppSettings } from './settingsService'

// 2.7.542: Kontrol Merkezi — lisansli Masaustu Otomasyon'daki "Kontrol Merkezi"
// bolumunun MUBiS uyarlamasi. Secili donemde tum musteri/firma satirlarini
// DB'deki (efatura_faturalar) kayitli belgelerden ozetler:
//   satis/alis matrah + KDV, odenecek/devreden KDV, PDF sayisi,
//   KDV tutarlilik kontrolu (matrah+kdv = tutar), e-Arsiv alis durumu.
// 2.8.60: KDV2 (tevkifatli alis) ve e-SMM Alis listeleri + coklu oranli
// fatura Excel'i eklendi. Tum fatura okumalari sayfalanir (Supabase 1000
// satir siniri donem toplamlarini eksik gostermesin).

const TOLERANS = 1.0 // 1 TL'ye kadarki yuvarlama farki sorun sayilmaz
const SAYFA_BOYU = 1000
const BILINEN_ORANLAR = [0, 1, 5, 8, 10, 18, 20]
const VARSAYILAN_ORANLAR = [1, 8, 10, 18, 20]

function n(v) {
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

function kurus(x) {
  return Math.round((Number(x) || 0) * 100) / 100
}

// Turkce harf toleransli normalizasyon (TEVKİFAT / TEVKIFAT / tevkifat)
function norm(s) {
  return String(s || '')
    .toLocaleUpperCase('tr')
    .replace(/[İIı]/g, 'I')
    .replace(/Ç/g, 'C').replace(/Ğ/g, 'G')
    .replace(/Ö/g, 'O').replace(/Ş/g, 'S').replace(/Ü/g, 'U')
}

const tevkifatMi = (faturaTuru) => norm(faturaTuru).includes('TEVKIFAT')
const iadeMi = (faturaTuru) => norm(faturaTuru).includes('IADE')
const alisYon = (f) => f?.yon === 'alis' || f?.yon === 'gelen'
const satisYon = (f) => f?.yon === 'satis' || f?.yon === 'giden'

function trTarih(t) {
  if (!t) return ''
  const m = String(t).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(t).slice(0, 10)
}

// Supabase tek istekte en fazla 1000 satir dondurur. Donem toplamlari ve
// listeler eksik kalmasin diye range() ile sayfa sayfa okunur.
async function sayfaliGetir(kur) {
  const hepsi = []
  for (let bas = 0; ; bas += SAYFA_BOYU) {
    const { data, error } = await kur().range(bas, bas + SAYFA_BOYU - 1)
    if (error) throw error
    const parti = data || []
    hepsi.push(...parti)
    if (parti.length < SAYFA_BOYU) break
  }
  return hepsi
}

function tarihAraligi(q, yil, ay) {
  if (yil) q = q.gte('tarih', `${yil}-01-01`).lte('tarih', `${yil}-12-31`)
  if (ay) {
    const son = new Date(yil, ay, 0).getDate()
    const ayStr = String(ay).padStart(2, '0')
    q = q.gte('tarih', `${yil}-${ayStr}-01`).lte('tarih', `${yil}-${ayStr}-${son}`)
  }
  return q
}

async function musterileriGetir() {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, company, vkn, tc')
    .order('name', { ascending: true })
  if (error) throw error
  return data || []
}

// Faturalarin coklu KDV kirilimlari (efatura_kdv_detay) toplu okunur.
// PostgREST `in` filtresi uzun listelerde URL sinirina takilmasin diye
// 150'lik parcalar halinde istenir.
async function kdvDetaylariToplu(idler) {
  const harita = {}
  const temiz = [...new Set((idler || []).filter(x => x != null))]
  for (let i = 0; i < temiz.length; i += 150) {
    const parca = temiz.slice(i, i + 150)
    const { data, error } = await supabase
      .from('efatura_kdv_detay')
      .select('fatura_id, oran, matrah, kdv')
      .in('fatura_id', parca)
    if (error) { console.warn('[kontrol-merkezi] KDV detayi alinamadi:', error.message); continue }
    for (const d of (data || [])) {
      if (!harita[d.fatura_id]) harita[d.fatura_id] = []
      harita[d.fatura_id].push({
        oran: n(d.oran),
        matrah: n(d.matrah),
        kdv: n(d.kdv)
      })
    }
  }
  return harita
}

// Tevkifatli faturada XML/detay KDV'si tevkif edilmis tutardir. Hesaplanan
// (tevkifat oncesi) KDV'yi matrah x oran ile parca parca hesapla.
function hesaplananKdv(detaylar) {
  if (!Array.isArray(detaylar) || !detaylar.length) return null
  let toplam = 0
  let gecerli = false
  for (const d of detaylar) {
    const oran = n(d?.oran)
    const matrah = n(d?.matrah)
    if (oran != null && oran > 0 && matrah != null && matrah > 0) {
      toplam += matrah * oran / 100
      gecerli = true
    } else {
      toplam += n(d?.kdv) || 0
    }
  }
  return gecerli ? kurus(toplam) : null
}

function gecerliOranlar(detaylar) {
  return [...new Set((detaylar || [])
    .map(d => n(d?.oran))
    .filter(o => o != null && o > 0 && o <= 100))]
}

export async function kontrolMerkeziOzeti({ yil, ay } = {}) {
  // 1) Tum aktif musteriler (alfabetik, tam unvan oncelikli)
  const musteriler = await musterileriGetir()

  // 2) Donemin tum fatura kayitlari (musteriden bagimsiz, sayfalanmis)
  const faturalar = await sayfaliGetir(() => {
    let q = supabase
      .from('efatura_faturalar')
      .select('client_id,yon,tur,fatura_no,tarih,matrah,kdv,tutar,pdf_url,xml_url,html_url,hesap_kodu')
    q = tarihAraligi(q, yil, ay)
    return q.order('id', { ascending: true })
  })

  const gruplar = new Map()
  for (const f of faturalar || []) {
    const g = gruplar.get(f.client_id) || []
    g.push(f)
    gruplar.set(f.client_id, g)
  }

  const rows = (musteriler || []).map(m => {
    const liste = gruplar.get(m.id) || []
    const sat = liste.filter(satisYon)
    const ali = liste.filter(alisYon)

    const toplam = (arr, alan) => arr.reduce((t, f) => t + (n(f[alan]) || 0), 0)
    // okunamayan tutar var mi (lisansli programdaki "fatura okumasi tamamlanmamis")
    const okunmayan = arr => arr.filter(f => n(f.tutar) == null || n(f.matrah) == null || n(f.kdv) == null).length

    const satisMatrah = toplam(sat, 'matrah'), satisKdv = toplam(sat, 'kdv'), satisToplam = toplam(sat, 'tutar')
    const alisMatrah = toplam(ali, 'matrah'), alisKdv = toplam(ali, 'kdv'), alisToplam = toplam(ali, 'tutar')

    // KDV tutarlilik kontrolu: her belgede matrah + kdv ~= tutar
    const farklilar = liste.filter(f => {
      const a = n(f.matrah), b = n(f.kdv), t = n(f.tutar)
      if (a == null || b == null || t == null) return false
      return Math.abs(a + b - t) > TOLERANS
    }).length
    const veriEksik = okunmayan(sat) + okunmayan(ali)

    let kdvKontrol
    if (farklilar > 0) kdvKontrol = { durum: 'fark', metin: `Fark var (${farklilar} belge)` }
    else if (veriEksik > 0) kdvKontrol = { durum: 'eksik', metin: `Eksik / bekliyor (${veriEksik})` }
    else if (liste.length === 0) kdvKontrol = { durum: 'bos', metin: 'Kayıt yok' }
    else kdvKontrol = { durum: 'tamam', metin: 'Tamamlandı' }

    // e-Arsiv alis: pdf'siz kalan belgeler
    const earsivAlis = ali.filter(f => f.tur === 'earsiv')
    const earsivAlisPdf = earsivAlis.filter(f => f.pdf_url).length
    let earsivDurum
    if (earsivAlis.length === 0) earsivDurum = { durum: 'bos', metin: 'E-Arşiv alış kaydı yok' }
    else if (earsivAlisPdf < earsivAlis.length) earsivDurum = { durum: 'eksik', metin: `E-Arşiv alış listesi okunmadı (${earsivAlisPdf}/${earsivAlis.length})` }
    else earsivDurum = { durum: 'tamam', metin: `Eşleşme tamam (${earsivAlis.length})` }

    // Muhasebelesme ilerlemesi: hesap kodu atanan belgeler
    const atanan = liste.filter(f => f.hesap_kodu).length

    return {
      id: m.id,
      ad: (m.company || m.name || '').trim(),
      vkn: m.vkn || m.tc || '',
      belgeSayisi: liste.length,
      satisMatrah, satisKdv, satisToplam, satisSayi: sat.length, satisOkunmayan: okunmayan(sat),
      alisMatrah, alisKdv, alisToplam, alisSayi: ali.length, alisOkunmayan: okunmayan(ali),
      pdfSayi: liste.filter(f => f.pdf_url).length,
      atanan,
      kdvKontrol,
      earsivDurum,
      liste,
    }
  })

  // Toplam satiri icin ozet
  const ozet = {
    satisMatrah: rows.reduce((t, r) => t + r.satisMatrah, 0),
    satisKdv: rows.reduce((t, r) => t + r.satisKdv, 0),
    alisMatrah: rows.reduce((t, r) => t + r.alisMatrah, 0),
    alisKdv: rows.reduce((t, r) => t + r.alisKdv, 0),
    belge: rows.reduce((t, r) => t + r.belgeSayisi, 0),
  }
  return { rows, ozet }
}

// KDV2 Listesi — tevkifatli ALIS faturalari (iade haric).
// Lisansli programdaki "KDV2 Listesi" bolumunun MUBiS karsiligi: firma
// bazinda tevkifatli alis faturalarini, faturada yazan KDV ile sorumlu
// sifatiyla odenecek tevkifat KDV'sini ayri gosterir.
export async function kdv2Listesi({ yil, ay } = {}) {
  const musteriler = await musterileriGetir()
  const adHaritasi = new Map((musteriler || []).map(m => [m.id, m]))
  const faturalar = await sayfaliGetir(() => {
    let q = supabase
      .from('efatura_faturalar')
      .select('id,client_id,yon,tur,fatura_no,tarih,karsi_vkn,karsi_unvan,matrah,kdv,tutar,fatura_turu,para_birimi')
    q = tarihAraligi(q, yil, ay)
    return q.in('yon', ['gelen', 'alis']).order('id', { ascending: true })
  })

  const secilen = faturalar.filter(f => tevkifatMi(f.fatura_turu) && !iadeMi(f.fatura_turu))
  const detaylar = await kdvDetaylariToplu(secilen.map(f => f.id))

  const firmalar = new Map()
  for (const f of secilen) {
    const detay = detaylar[f.id] || []
    const oranlar = gecerliOranlar(detay)
    const hesaplanan = hesaplananKdv(detay)
    const faturaKdv = n(f.kdv) || 0
    const tevkifatKdv = hesaplanan != null
      ? Math.max(0, kurus(hesaplanan - faturaKdv))
      : 0
    // Tek oranli (dokumu olmayan) faturada tevkifat tutari matrah+KDV'den
    // tahmin edilemez; eksik olarak isaretlenir.
    const eksik = hesaplanan == null && faturaKdv > 0
    const kayit = {
      id: f.id,
      tarih: f.tarih,
      faturaNo: f.fatura_no || '',
      karsiUnvan: f.karsi_unvan || '',
      karsiVkn: f.karsi_vkn || '',
      matrah: n(f.matrah) || 0,
      kdv: faturaKdv,
      tevkifatKdv,
      tutar: n(f.tutar) || 0,
      oranlar,
      eksik,
    }
    const g = firmalar.get(f.client_id) || {
      id: f.client_id,
      ad: (adHaritasi.get(f.client_id)?.company || adHaritasi.get(f.client_id)?.name || `Müşteri #${f.client_id}`).trim(),
      vkn: adHaritasi.get(f.client_id)?.vkn || adHaritasi.get(f.client_id)?.tc || '',
      invoices: [], matrah: 0, kdv: 0, tevkifatKdv: 0, eksik: false,
    }
    g.invoices.push(kayit)
    g.matrah = kurus(g.matrah + kayit.matrah)
    g.kdv = kurus(g.kdv + kayit.kdv)
    g.tevkifatKdv = kurus(g.tevkifatKdv + kayit.tevkifatKdv)
    if (kayit.eksik) g.eksik = true
    firmalar.set(f.client_id, g)
  }

  const companies = [...firmalar.values()]
    .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))
    .map(g => ({
      ...g,
      invoices: g.invoices.sort((a, b) => String(a.tarih || '').localeCompare(String(b.tarih || '')) || String(a.faturaNo).localeCompare(String(b.faturaNo))),
      sayi: g.invoices.length,
    }))

  const toplam = companies.reduce((t, g) => ({
    firmaSayisi: t.firmaSayisi + 1,
    belgeSayisi: t.belgeSayisi + g.sayi,
    matrah: kurus(t.matrah + g.matrah),
    kdv: kurus(t.kdv + g.kdv),
    tevkifatKdv: kurus(t.tevkifatKdv + g.tevkifatKdv),
    eksikFirma: t.eksikFirma + (g.eksik ? 1 : 0),
  }), { firmaSayisi: 0, belgeSayisi: 0, matrah: 0, kdv: 0, tevkifatKdv: 0, eksikFirma: 0 })

  return { yil, ay, companies, toplam }
}

// e-SMM Alis Listesi — tur='esmm' + alis yonu. Stopaj ve KDV tevkifati
// fatura tablosunda kolon olmadigi icin app_settings esmm_ek_<client>_<uuid>
// kayitlarindan okunur.
export async function esmmAlisListesi({ yil, ay } = {}) {
  const musteriler = await musterileriGetir()
  const adHaritasi = new Map((musteriler || []).map(m => [m.id, m]))

  const faturalar = await sayfaliGetir(() => {
    let q = supabase
      .from('efatura_faturalar')
      .select('id,client_id,yon,tur,fatura_no,tarih,karsi_vkn,karsi_unvan,matrah,kdv,tutar,fatura_turu,para_birimi,fatura_uuid')
    q = tarihAraligi(q, yil, ay)
    return q.in('yon', ['gelen', 'alis']).order('id', { ascending: true })
  })
  const secilen = faturalar.filter(f => f.tur === 'esmm' || norm(f.fatura_turu) === 'E-SMM')

  let ekKayitlar = []
  try { ekKayitlar = await listAppSettings('esmm_ek_') } catch { /* ek bilgi yoksa 0 kabul edilir */ }
  const ekHaritasi = new Map()
  for (const k of ekKayitlar || []) {
    try {
      const deger = JSON.parse(k.value || '{}')
      ekHaritasi.set(k.key, {
        stopaj: n(deger.stopaj) || 0,
        tevkifat: n(deger.tevkifat) || 0,
      })
    } catch { /* bozuk kayit yoksay */ }
  }

  const firmalar = new Map()
  for (const f of secilen) {
    const ek = ekHaritasi.get(`esmm_ek_${f.client_id}_${f.fatura_uuid}`) || null
    const kayit = {
      id: f.id,
      tarih: f.tarih,
      faturaNo: f.fatura_no || '',
      duzenleyen: f.karsi_unvan || '',
      karsiVkn: f.karsi_vkn || '',
      matrah: n(f.matrah) || 0,
      kdv: n(f.kdv) || 0,
      stopaj: ek?.stopaj ?? 0,
      tevkifat: ek?.tevkifat ?? 0,
      tutar: n(f.tutar) || 0,
      eksik: !ek,
    }
    const g = firmalar.get(f.client_id) || {
      id: f.client_id,
      ad: (adHaritasi.get(f.client_id)?.company || adHaritasi.get(f.client_id)?.name || `Müşteri #${f.client_id}`).trim(),
      vkn: adHaritasi.get(f.client_id)?.vkn || adHaritasi.get(f.client_id)?.tc || '',
      invoices: [], matrah: 0, kdv: 0, stopaj: 0, tevkifat: 0, tutar: 0, eksik: false,
    }
    g.invoices.push(kayit)
    g.matrah = kurus(g.matrah + kayit.matrah)
    g.kdv = kurus(g.kdv + kayit.kdv)
    g.stopaj = kurus(g.stopaj + kayit.stopaj)
    g.tevkifat = kurus(g.tevkifat + kayit.tevkifat)
    g.tutar = kurus(g.tutar + kayit.tutar)
    if (kayit.eksik) g.eksik = true
    firmalar.set(f.client_id, g)
  }

  const companies = [...firmalar.values()]
    .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))
    .map(g => ({
      ...g,
      invoices: g.invoices.sort((a, b) => String(a.tarih || '').localeCompare(String(b.tarih || '')) || String(a.faturaNo).localeCompare(String(b.faturaNo))),
      sayi: g.invoices.length,
    }))

  const toplam = companies.reduce((t, g) => ({
    firmaSayisi: t.firmaSayisi + 1,
    belgeSayisi: t.belgeSayisi + g.sayi,
    matrah: kurus(t.matrah + g.matrah),
    kdv: kurus(t.kdv + g.kdv),
    stopaj: kurus(t.stopaj + g.stopaj),
    tevkifat: kurus(t.tevkifat + g.tevkifat),
    tutar: kurus(t.tutar + g.tutar),
    eksikFirma: t.eksikFirma + (g.eksik ? 1 : 0),
  }), { firmaSayisi: 0, belgeSayisi: 0, matrah: 0, kdv: 0, stopaj: 0, tevkifat: 0, tutar: 0, eksikFirma: 0 })

  return { yil, ay, companies, toplam }
}

// Alis/Satis Excel: lisansli programdaki "Alis/Satis Fatura Listesi" formatinda
// (baslik satirlari + KDV oran kolonlari bazinda döküm) uretilir.
// 2.8.60: Coklu oranli faturalarda efatura_kdv_detay satirlari kullanilir;
// oran kirilimi okunamayan fatura "Okuma Durumu" kolonunda isaretlenir.
export async function faturaListesiExcel(clientId, clientAd, { yil, ay, yon }) {
  const XLSX = await import('xlsx')
  const data = await sayfaliGetir(() => {
    let q = supabase
      .from('efatura_faturalar')
      .select('id,fatura_no,tarih,tur,fatura_turu,karsi_vkn,karsi_unvan,matrah,kdv,tutar,para_birimi,tevkifat,durum')
      .eq('client_id', clientId)
    q = tarihAraligi(q, yil, ay)
    if (yon === 'satis') q = q.in('yon', ['satis', 'giden'])
    else if (yon === 'alis') q = q.in('yon', ['alis', 'gelen'])
    return q.order('id', { ascending: true })
  })
  const detaylar = await kdvDetaylariToplu((data || []).map(f => f.id))

  const ekOranlar = new Set()
  for (const f of data || []) {
    for (const d of detaylar[f.id] || []) {
      const o = n(d.oran)
      if (o != null && o > 0 && o <= 100) ekOranlar.add(kurus(o))
    }
  }
  const ORANLAR = [...new Set([...VARSAYILAN_ORANLAR, ...ekOranlar])].sort((a, b) => a - b)

  const oranBul = (kdv, matrah) => {
    if (!kdv || !matrah || matrah <= 0) return null
    const ham = (kdv / matrah) * 100
    let enIyi = null
    for (const o of BILINEN_ORANLAR) {
      const fark = Math.abs(ham - o)
      if (fark < 0.6 && (enIyi === null || fark < enIyi.fark)) enIyi = { o, fark }
    }
    return enIyi ? enIyi.o : null
  }

  const satirlar = (data || []).map(f => {
    const detay = detaylar[f.id] || []
    const oranMap = new Map()
    let belirsiz = false
    if (detay.length) {
      for (const d of detay) {
        const oran = n(d.oran)
        if (oran == null || oran <= 0) { belirsiz = true; continue }
        const anahtar = kurus(oran)
        const mevcut = oranMap.get(anahtar) || { matrah: 0, kdv: 0 }
        mevcut.matrah = kurus(mevcut.matrah + (n(d.matrah) || 0))
        mevcut.kdv = kurus(mevcut.kdv + (n(d.kdv) || 0))
        oranMap.set(anahtar, mevcut)
      }
    } else {
      const oran = oranBul(n(f.kdv), n(f.matrah))
      if (oran != null) oranMap.set(kurus(oran), { matrah: n(f.matrah) || 0, kdv: n(f.kdv) || 0 })
      else if ((n(f.matrah) || 0) !== 0 || (n(f.kdv) || 0) !== 0) belirsiz = true
    }

    const satir = {
      'Fatura Tarihi': trTarih(f.tarih),
      'Fatura Numarası': f.fatura_no || '',
      'Fatura Türü': f.fatura_turu || f.tur || '',
      'VKN / TCKN': f.karsi_vkn || '',
      'Açıklama': f.karsi_unvan || '',
      'Tevkifat Tutarı': n(f.tevkifat) > 0 ? n(f.tevkifat) : '',
      'Özel Matrah': '',
    }
    for (const o of ORANLAR) satir[`%${o} KDV`] = oranMap.has(kurus(o)) ? oranMap.get(kurus(o)).kdv : ''
    for (const o of ORANLAR) satir[`%${o} Matrah`] = oranMap.has(kurus(o)) ? oranMap.get(kurus(o)).matrah : ''
    satir['Toplam'] = n(f.tutar) ?? ''
    satir['Toplam Matrah'] = n(f.matrah) ?? ''
    satir['Toplam KDV'] = n(f.kdv) ?? ''
    const notlar = []
    if (belirsiz) notlar.push('Oran kırılımı okunamadı')
    if (detay.length && oranMap.size === 0) notlar.push('KDV dökümü geçersiz')
    if (!detay.length) notlar.push('KDV dökümü yok — oran matrah+KDV\'den hesaplandı')
    satir['Okuma Durumu'] = notlar.length ? notlar.join('; ') : (f.durum || 'Okundu')
    return satir
  })

  const bas = ay ? `01/${String(ay).padStart(2, '0')}/${yil}` : `01/01/${yil}`
  const son = ay ? `${new Date(yil, ay, 0).getDate()}/${String(ay).padStart(2, '0')}/${yil}` : `31/12/${yil}`
  const kolonlar = ['Fatura Tarihi', 'Fatura Numarası', 'Fatura Türü', 'VKN / TCKN', 'Açıklama', 'Tevkifat Tutarı', 'Özel Matrah', ...ORANLAR.map(o => `%${o} KDV`), ...ORANLAR.map(o => `%${o} Matrah`), 'Toplam', 'Toplam Matrah', 'Toplam KDV', 'Okuma Durumu']
  const aoa = [
    [`${clientAd || 'Firma'} — ${yon === 'satis' ? 'Satış' : 'Alış'} Faturaları`],
    [`${bas} – ${son} · TL · Kayıtlı belgeler`],
    kolonlar,
    ...satirlar.map(s => kolonlar.map(k => s[k] ?? '')),
  ]
  if (satirlar.length === 0) aoa.push(['Henüz okunmuş fatura yok; boş liste doğrulanmadı.'])
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = kolonlar.map((k, i) => ({ wch: i === 0 ? 13 : i === 1 ? 22 : i === 4 ? 32 : k === 'Okuma Durumu' ? 48 : i >= 7 && i <= 6 + ORANLAR.length * 2 ? 13 : 15 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'FATURALAR')
  const dosyaAd = `${yon === 'satis' ? 'Satis' : 'Alis'}_Fatura_Listesi_${String(clientId || 0)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.xlsx`
  XLSX.writeFile(wb, dosyaAd)
  return satirlar.length
}

// KDV2 / e-SMM gibi gruplanmis raporlari tek sayfalik Excel'e yazar.
export async function tabloExcel({ sayfaAdi, baslik, altBaslik, kolonlar, satirlar, dosyaAdi }) {
  const XLSX = await import('xlsx')
  const temizKolonlar = Array.isArray(kolonlar) ? kolonlar : []
  const aoa = [
    [baslik || 'Rapor'],
    [altBaslik || ''],
    temizKolonlar,
    ...(satirlar || []).map(s => temizKolonlar.map(k => s[k] ?? '')),
  ]
  if (!(satirlar || []).length) aoa.push(['Seçili dönemde kayıt bulunamadı.'])
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = temizKolonlar.map(k => ({ wch: Math.min(64, Math.max(12, String(k).length + 6)) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, String(sayfaAdi || 'RAPOR').slice(0, 31))
  XLSX.writeFile(wb, dosyaAdi || `Rapor_${Date.now()}.xlsx`)
  return (satirlar || []).length
}
