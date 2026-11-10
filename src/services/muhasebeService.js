// MUBIS - Fatura muhasebelesme servisi
// efatura_faturalar kayitlarina hesap kodu atar, kural motoruyla oneri uretir,
// Luca "Excel Veri Aktarimi" sablonuna birebir uyan fiş dosyasi uretir.
// Luca sablon kolonlari: Fiş No | Fiş Tarihi | Fiş Açıklama | Hesap Kodu |
//   Evrak No | Evrak Tarihi | Detay Açıklama | Borç | Alacak | Miktar |
//   Belge Türü | Para Birimi | Kur | Döviz Tutar | TC/Vergi No
import { supabase } from '../lib/supabase'
import { getAccountPlans, addAccountPlan } from './clientService'
import * as XLSX from 'xlsx'

// ─────────────────────────── Hesap planı ───────────────────────────

export async function hesapPlaniGetir(clientId) {
  const plans = await getAccountPlans(clientId)
  return plans.map(p => ({ kod: p.code, ad: p.name }))
}

export async function hesapEkle(clientId, kod, ad) {
  await addAccountPlan(clientId, kod, ad, true)
}

// Excel/CSV'den toplu hesap plani aktarimi. addAccountPlan upsert oldugu icin
// mevcut kodlarin adi guncellenir, yeni kodlar acilir.
export async function hesaplarTopluEkle(clientId, hesaplar) {
  const mevcut = new Set((await getAccountPlans(clientId)).map(p => p.code))
  let eklenen = 0
  let guncellenen = 0
  for (const h of hesaplar) {
    await addAccountPlan(clientId, h.kod, h.ad, true)
    if (mevcut.has(h.kod)) guncellenen++
    else eklenen++
    mevcut.add(h.kod)
  }
  return { eklenen, guncellenen }
}

// Luca "Hesap Kodları > Excel Aktarım" sablonu birebir (noktalı virgullu CSV,
// UTF-8 BOM'lu — Excel Turkce karakterleri dogru acar).
export function hesapPlaniCsvIndir(hesaplar, dosyaAdi) {
  const baslik = 'Hesap Kodu*;Hesap Adı*;Vergi No;Vergi Dairesi;T.C. Kimlik No;Adres;Döviz;E-Posta;Kdv Oran;Kdv Hesap Kodu'
  const satirlar = (hesaplar || []).map(h =>
    `${h.kod};${String(h.ad || '').replace(/[;\r\n]/g, ' ')};;;;;;;;`
  )
  const icerik = '\uFEFF' + [baslik, ...satirlar].join('\r\n')
  const blob = new Blob([icerik], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = dosyaAdi || `Hesap_Plani_Aktarim_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

// Hesap planı dosyasını okur: .xlsx/.xls veya .csv (Luca şablonu; cp1254 veya
// UTF-8, ayırıcı noktalı virgül/virgül otomatik). Dönüş: [{kod, ad}]
export async function hesapPlaniDosyadanOku(dosya) {
  const ad = (dosya.name || '').toLocaleLowerCase('tr')
  let grid = [] // satır -> hücre dizisi
  if (ad.endsWith('.csv') || ad.endsWith('.txt')) {
    const buf = new Uint8Array(await dosya.arrayBuffer())
    const bomlu = buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF
    let metin = new TextDecoder('utf-8').decode(bomlu ? buf.slice(3) : buf)
    // UTF-8 çözerken bozuk karakter kaldıysa Windows-1254 dene (Luca CSV'si)
    if (!bomlu && /\uFFFD/.test(metin)) {
      try { metin = new TextDecoder('windows-1254').decode(buf) } catch { /* utf-8 kalsın */ }
    }
    const ayir = (metin.split(/\r?\n/).find(l => l.trim()) || '').includes(';') ? ';' : ','
    grid = metin.split(/\r?\n/)
      .filter(l => l.trim())
      .map(l => l.split(ayir).map(h => h.trim().replace(/^"|"$/g, '')))
  } else {
    const wb = XLSX.read(await dosya.arrayBuffer(), { type: 'array', codepage: 1254 })
    const ws = wb.Sheets[wb.SheetNames[0]]
    grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }).map(r => (r || []).map(h => String(h ?? '').trim()))
  }
  const norm = (s) => String(s || '').toLocaleLowerCase('tr').replace(/\*/g, '').trim()
  const hi = grid.findIndex(r => r.some(h => norm(h).startsWith('hesap kodu')))
  if (hi === -1) throw new Error('Başlık satırı bulunamadı — dosyada "Hesap Kodu" kolonu olmalı.')
  const baslik = grid[hi].map(norm)
  const kodIdx = baslik.findIndex(h => h.startsWith('hesap kodu'))
  const adIdx = baslik.findIndex(h => h.startsWith('hesap ad') || h === 'ad')
  if (kodIdx === -1 || adIdx === -1) throw new Error('Kolonlar okunamadı — "Hesap Kodu*" ve "Hesap Adı*" kolonları gerekli.')
  const cikti = []
  for (const r of grid.slice(hi + 1)) {
    const kod = String(r[kodIdx] || '').trim()
    const adi = String(r[adIdx] || '').trim()
    if (kod && adi) cikti.push({ kod, ad: adi })
  }
  if (!cikti.length) throw new Error('Dosyada hesap satırı bulunamadı.')
  return cikti
}

// ─────────────────────────── Kurallar ───────────────────────────

export async function kurallariGetir(clientId) {
  const { data, error } = await supabase
    .from('fatura_hesap_kurallari')
    .select('*')
    .eq('client_id', clientId)
  if (error) throw error
  return data || []
}

// vkn veya kelime ile kural kaydeder (ayni vkn+kelime guncellenir)
export async function kuralKaydet(clientId, { vkn = null, kelime = null, hesapKodu }) {
  const q = supabase.from('fatura_hesap_kurallari')
  const satir = { client_id: clientId, vkn: vkn || null, kelime: kelime || null, hesap_kodu: hesapKodu }
  if (vkn) {
    await q.delete().eq('client_id', clientId).eq('vkn', vkn)
  } else if (kelime) {
    await q.delete().eq('client_id', clientId).eq('kelime', kelime)
  }
  const { error } = await supabase.from('fatura_hesap_kurallari').insert(satir)
  if (error) throw error
}

// ─────────────────────────── Öneri motoru ───────────────────────────
// Oncelik: VKN kurali > kelime kurali > onceki ayni VKN faturasi > varsayilan

const VARSAYILAN_GIDER = '770' // Genel Yonetim Giderleri (kullanici degistirebilir)
const VARSAYILAN_GELIR = '600'

export function hesapOner(fatura, hesapPlani, kurallar) {
  const vkn = String(fatura.karsi_vkn || '').replace(/\D/g, '')
  const unvan = String(fatura.karsi_unvan || '').toLocaleLowerCase('tr')
  const yon = fatura.yon || 'alış'

  // 1) VKN kurali
  if (vkn) {
    const k = kurallar.find(x => x.vkn === vkn)
    if (k) return { kod: k.hesap_kodu, kaynak: 'kural (satıcı)' }
  }
  // 2) Kelime kurali (unvan icinde gecen)
  if (unvan) {
    const k = kurallar.find(x => x.kelime && unvan.includes(String(x.kelime).toLocaleLowerCase('tr')))
    if (k) return { kod: k.hesap_kodu, kaynak: 'kural (kelime)' }
  }
  // 3) Ayni VKN'den onceki faturalarda kullanilan hesap
  if (vkn && fatura.onceki_hesap) {
    return { kod: fatura.onceki_hesap, kaynak: 'geçmiş' }
  }
  // 4) Varsayilan: gelen (alis) -> gider, giden (satis) -> gelir
  const varsayilan = yon === 'giden' ? VARSAYILAN_GELIR : VARSAYILAN_GIDER
  const plan = hesapPlani.find(h => h.kod === varsayilan)
    || hesapPlani.find(h => h.kod.startsWith(varsayilan + '.'))
  return { kod: plan ? plan.kod : varsayilan, kaynak: 'varsayılan' }
}

// ─────────────────────────── Faturalar ───────────────────────────

export async function faturalariGetir(clientId, { yil, ay, yon } = {}) {
  let q = supabase
    .from('efatura_faturalar')
    .select('id,fatura_no,fatura_uuid,tarih,yon,tur,fatura_turu,karsi_vkn,karsi_unvan,matrah,kdv,tutar,para_birimi,pdf_url,hesap_kodu,cari_hesabi,durum,luca_fis_no')
    .eq('client_id', clientId)
  if (yil) q = q.gte('tarih', `${yil}-01-01`).lte('tarih', `${yil}-12-31`)
  if (ay) {
    const son = new Date(yil, ay, 0).getDate()
    q = q.gte('tarih', `${yil}-${String(ay).padStart(2, '0')}-01`).lte('tarih', `${yil}-${String(ay).padStart(2, '0')}-${son}`)
  }
  if (yon) q = q.eq('yon', yon)
  const { data, error } = await q.order('tarih', { ascending: false })
  if (error) throw error
  // Ayni VKN'den onceki faturalarin hesaplarini ogrenmek icin gecmis atamalar
  const { data: gecmis } = await supabase
    .from('efatura_faturalar')
    .select('karsi_vkn,hesap_kodu')
    .eq('client_id', clientId)
    .not('hesap_kodu', 'is', null)
  const gecmisMap = {}
  for (const g of gecmis || []) {
    if (g.karsi_vkn && g.hesap_kodu) gecmisMap[g.karsi_vkn] = gecmisMap[g.karsi_vkn] || g.hesap_kodu
  }
  return (data || []).map(f => ({ ...f, onceki_hesap: gecmisMap[f.karsi_vkn] || null }))
}

export async function faturaHesapKaydet(faturaId, hesapKodu, cariHesabi) {
  const { error } = await supabase
    .from('efatura_faturalar')
    .update({ hesap_kodu: hesapKodu, cari_hesabi: cariHesabi || null, durum: 'onayli' })
    .eq('id', faturaId)
  if (error) throw error
}

// 2.7.464: Onayi geri al — fatura tekrar duzenlenebilir (bekliyor) duruma
// doner; hesap/cari kodlari temizlenir. Luca'ya aktarilan faturada KULLANILMAZ.
export async function faturaOnayKaldir(faturaId) {
  const { error } = await supabase
    .from('efatura_faturalar')
    .update({ hesap_kodu: null, cari_hesabi: null, durum: 'bekliyor', luca_fis_no: null })
    .eq('id', faturaId)
  if (error) throw error
}

export async function faturaDurumGuncelle(faturaId, durum, lucaFisNo = null) {
  const guncel = { durum }
  if (lucaFisNo) guncel.luca_fis_no = lucaFisNo
  if (durum === 'luca') guncel.luca_tarihi = new Date().toISOString()
  const { error } = await supabase.from('efatura_faturalar').update(guncel).eq('id', faturaId)
  if (error) throw error
}

// ─────────────────── KDV oranı → hesap kodu eşleme (2.7.463 akışı) ───────────────────
// Kullanıcı akışı: ana hesap seçilir (örn. 153.01), alt numara KDV oranına göre
// plandaki alt hesaplardan bulunur (153.01.1 = %10 gibi — adında %XX geçen
// çocuk kodlar). 191/391 için de aynı eşleme otomatik yapılır.
// Kapanış carisi (320/120) ünvan eşleşmesiyle bulunur, yoksa +1 açılır.

// Faturanın KDV oranını matrah/KDV oranıyla tespit eder.
// Dönüş: 0 (KDV yok), 1 | 5 | 10 | 20 (yüzde olarak), -1 (karışık/bilinmeyen)
export function kdvOraniTespit(f) {
  const m = Number(f.matrah) || 0
  const k = Number(f.kdv) || 0
  if (!m || !k) return 0
  const r = k / m
  for (const oran of [0.01, 0.05, 0.10, 0.20]) {
    if (Math.abs(r - oran) < 0.004) return Math.round(oran * 100)
  }
  return -1
}

// Planda kok altındaki (kok.x, kok.x.y) hesaplardan KDV oranını belirtenleri
// oran anahtarıyla haritalar: { 10: '153.01.1', 20: '153.01.5', ... }
// 2.7.464: plan adlari iki bicimde gelir — "%20 KDV'li" VEYA sonunda düz
// oranla biten "Ticari Mallar 20" / "İNDİRİLECEK KDV 20" (ELEKTRO-AK planı).
// Her iki bicim de eslesir; en uzun (en derin) kod kazanir.
export function oranHesaplari(hesapPlani, kok) {
  const harita = {}
  const oranBul = (ad) => {
    const s = String(ad || '')
    const yuzde = s.match(/%\s?(\d{1,2})/)
    if (yuzde) return parseInt(yuzde[1], 10)
    const son = s.match(/(\d{1,2})\s*$/) // "Ticari Mallar 20", "KDV 18"
    if (son) return parseInt(son[1], 10)
    return null
  }
  for (const h of hesapPlani || []) {
    if (!h.kod || h.kod === kok || !h.kod.startsWith(kok + '.')) continue
    const oran = oranBul(h.ad)
    if (oran != null && oran <= 99) {
      if (!(oran in harita) || h.kod.length < harita[oran].length) harita[oran] = h.kod
    }
  }
  return harita
}

// Ana hesap + fatura -> KDV oranına göre gerçek hesap kodu.
// Seçilen kodun çocuklarında oran hesabı yoksa seçilen kod aynen kullanılır
// (kullanıcı doğrudan yaprak kod seçtiyse ezilmez).
export function faturaHesapKodu(secilenKod, hesapPlani, f) {
  const oran = kdvOraniTespit(f)
  const harita = oranHesaplari(hesapPlani, secilenKod)
  if (oran > 0 && harita[oran]) return { kod: harita[oran], oran }
  return { kod: secilenKod, oran }
}

// Faturanın KDV satırı hesabı: kullanıcı seçimi varsa onun çocuklarından
// oran eşleşmesi (örn. 191.01 seçiliyse %20 -> 191.01.4); yoksa 191/391 kökü.
export function kdvHesapKodu(f, hesapPlani, kdvKok = null) {
  const kok = kdvKok || (f.yon === 'giden' ? '391' : '191')
  const oran = kdvOraniTespit(f)
  if (oran <= 0) return kok
  const harita = oranHesaplari(hesapPlani, kok)
  return harita[oran] || kok
}

// ─────────────────────────── Cari hesap motoru (120/320) ───────────────────────────
// Kural: karsi tarafin cari hesabi hesap planinda VARSA kullanilir; yoksa son
// hesap kodu +1 artirilarak YENI hesap acilir (hem MUBiS hesap planina yazilir
// hem Luca'ya yuklenecek ek hesap listesine dusar) — iki taraf uyumlu kalir.
function kodParcalari(kod) {
  return String(kod || '').split('.').map(p => /^\d+$/.test(p) ? parseInt(p, 10) : p)
}

function sonKodArtir(sonKod, kok) {
  if (!sonKod) {
    // Plan altinda hic cari yok: ilk alt kodu uret
    return `${kok}.01`
  }
  const parcalar = sonKod.split('.')
  const son = parcalar[parcalar.length - 1]
  if (/^\d+$/.test(son)) {
    const genislik = son.length >= 2 && son.startsWith('0') ? son.length : 0
    const yeni = String(parseInt(son, 10) + 1)
    parcalar[parcalar.length - 1] = genislik ? yeni.padStart(genislik, '0') : yeni
  } else {
    parcalar[parcalar.length - 1] = (son + '1')
  }
  return parcalar.join('.')
}

// Faturanin karsi tarafi icin cari hesabi bulur/yaratir.
// kokOverride: kapanis hesabi kökü (örn. '320' ya da '320.01') — verilmezse
// yonden türetilir (gelen->320, giden->120).
// Donus: { kod, yeni, ad }
export async function ensureCariHesabi(clientId, fatura, hesapPlani, kokOverride = null) {
  const kok = kokOverride || (fatura.yon === 'giden' ? '120' : '320')
  const vkn = String(fatura.karsi_vkn || '').replace(/\D/g, '')
  const unvan = fatura.karsi_unvan || `Cari ${vkn || f.id}`

  // 0) 2.7.465: kullanici alt hesabi olmayan bir YAPRAK kod sectiyse (örn.
  // 102.01 Garanti Bankası, 331.01.1) dogrudan o yazilir — ünvan eslestirme
  // ve +1 acma yapilmaz. Kök kodlar (120/320 vb.) eski akisa devam eder.
  const altKodVar = hesapPlani.some(h => h.kod && h.kod.startsWith(kok + '.'))
  if (kokOverride && kokOverride.includes('.') && !altKodVar) {
    return { kod: kok, yeni: false, ad: unvan }
  }

  // 1) Ayni VKN daha once bir cari hesaba baglanmis mi (onceki faturalardan)
  // — yalniz AYNI kok altindaki cariler (farkli kok sectiyseniz onunkiler
  // ezilmesin)
  if (vkn) {
    const { data: onceki } = await supabase
      .from('efatura_faturalar')
      .select('cari_hesabi')
      .eq('client_id', clientId)
      .eq('karsi_vkn', fatura.karsi_vkn)
      .not('cari_hesabi', 'is', null)
      .like('cari_hesabi', kok + '%')
      .limit(1)
    if (onceki?.length && onceki[0].cari_hesabi) return { kod: onceki[0].cari_hesabi, yeni: false, ad: unvan }
  }

  // 2) Hesap planinda bu unvanla acilmis ayni koklu cari var mi
  const norm = unvan.toLocaleLowerCase('tr').trim()
  const eslesen = hesapPlani.find(h => h.kod && h.kod.startsWith(kok + '.') && h.ad && h.ad.toLocaleLowerCase('tr').trim() === norm)
  if (eslesen) return { kod: eslesen.kod, yeni: false, ad: unvan }

  // 3) Kok hesap (320/120) planda yoksa once kok acilir
  const kokVar = hesapPlani.some(h => h.kod === kok)
  if (!kokVar) {
    await addAccountPlan(clientId, kok, kok === '120' ? 'Alıcılar' : (kok === '320' ? 'Satıcılar' : unvan), true)
  }

  // 4) Yeni kod = ayni koklu son hesap kodu + 1 (ayni desen korunur)
  const altKodlar = hesapPlani
    .filter(h => h.kod && h.kod.startsWith(kok + '.'))
    .map(h => h.kod)
    .sort((a, b) => {
      const pa = kodParcalari(a), pb = kodParcalari(b)
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const x = pa[i] ?? 0, y = pb[i] ?? 0
        if (x !== y) return (typeof x === 'number' && typeof y === 'number') ? x - y : String(x).localeCompare(String(y))
      }
      return 0
    })
  const yeniKod = sonKodArtir(altKodlar[altKodlar.length - 1], kok)
  await addAccountPlan(clientId, yeniKod, unvan, true)
  return { kod: yeniKod, yeni: true, ad: unvan }
}

// ─────────────────────────── Luca Excel üretimi ───────────────────────────
// Kural: her fatura = 1 fis (ayni Fis No + tarih ayni fise birlesir).
// Gelen (alis) faturasi:  Borç gider hesabi (matrah) + Borç 191 (kdv) / Alacak 320 (tutar)
// Giden (satis) faturasi: Borç 120 (tutar) / Alacak gelir hesabi (matrah) + Alacak 391 (kdv)
// efatura_faturalar.yon degerleri: 'gelen' | 'giden'

const SABLON_BASLIK = ['Fiş No', 'Fiş Tarihi', 'Fiş Açıklama', 'Hesap Kodu', 'Evrak No', 'Evrak Tarihi', 'Detay Açıklama', 'Borç', 'Alacak', 'Miktar', 'Belge Türü', 'Para Birimi', 'Kur', 'Döviz Tutar', 'TC/Vergi No']

const tlFormatla = (n) => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function lucaFisNoUret(fatura, sira) {
  const t = String(fatura.tarih || '').slice(0, 10).replace(/-/g, '')
  return `F${t}${String(sira).padStart(3, '0')}`
}

export function lucaExcelUret(faturalar, hesapPlani = null, kdvSecim = null) {
  // kdvSecim: { alis: '191.01', satis: '391.01' } — kullanıcı seçimi; sonu
  // faturadaki KDV oranına göre çocuklardan otomatik eklenir (191.01 + %20
  // -> 191.01.4). Verilmezse 191/391 kökü kullanılır.
  // Sadece hesap kodu atanmis (onayli) faturalar
  // 2.7.463: hesapPlani verilirse KDV oranina gore alt kodlar otomatik
  // genislenir (153.01 + %20 fatura -> matrah 153.01.5, KDV 191.01.4 gibi);
  // verilmezse eski sabit davranis (hesap_kodu + '191'/'391').
  const hazir = faturalar.filter(f => f.hesap_kodu)
  const satirlar = []
  const fisBilgi = []
  const karmaKdvler = []
  hazir.forEach((f, i) => {
    const fisNo = f.luca_fis_no || lucaFisNoUret(f, i + 1)
    const tarih = String(f.tarih || '').slice(0, 10) // YYYY-MM-DD
    const parcalar = tarih.split('-')
    const trTarih = parcalar.length === 3 ? `${parcalar[2]}.${parcalar[1]}.${parcalar[0]}` : tarih
    const fisAciklama = `${f.yon === 'giden' ? 'Satış' : 'Alış'} Faturası - ${f.karsi_unvan || ''}`.slice(0, 100)
    const detay = `Fatura No: ${f.fatura_no || '-'} ${f.karsi_unvan || ''}`.slice(0, 150)
    // 2.8.6: Yabanci para (USD/EUR) faturalari TL olarak islenir — fatura
    // uzerindeki doviz kuru (UBL CalculationRate -> efatura_faturalar.doviz_kur)
    // ile matrah/KDV/tutar TL'ye cevrilir; fis satirlarinda YALNIZ TL tutarlar
    // yazilir (pb=TRY, doviz sutunlari bos). Kuru bilinmiyorsa eski davranis.
    const pbHam = f.para_birimi || 'TRY'
    const kurTL = pbHam !== 'TRY' ? (Number(f.doviz_kur) || 0) : 0
    const pb = kurTL > 0 ? 'TRY' : pbHam
    const carpan = kurTL > 0 ? kurTL : 1
    const dusKdv = /ISTISNA|OTELECEK/i.test(f.fatura_turu || '') || (Number(f.kdv) || 0) === 0
    const matrah = Math.round((Number(f.matrah) || 0) * carpan * 100) / 100
    const kdv = Math.round((Number(f.kdv) || 0) * carpan * 100) / 100
    const tutar = Math.round((Number(f.tutar) || 0) * carpan * 100) / 100
    const cari = f.cari_hesabi || (f.yon === 'giden' ? '120' : '320')
    // Oran duyarli kodlar
    const oran = hesapPlani ? kdvOraniTespit(f) : 0
    if (hesapPlani && oran === -1 && kdv > 0) karmaKdvler.push(f.fatura_no || f.karsi_unvan || f.id)
    const anaHesap = hesapPlani ? faturaHesapKodu(f.hesap_kodu, hesapPlani, f).kod : f.hesap_kodu
    const kdvKod = hesapPlani
      ? kdvHesapKodu(f, hesapPlani, kdvSecim ? (f.yon === 'giden' ? kdvSecim.satis : kdvSecim.alis) : null)
      : (f.yon === 'giden' ? '391' : '191')

    const ortak = { fisNo, tarih: trTarih, fisAciklama, evrakNo: f.fatura_no || '', evrakTarih: trTarih, detay, miktar: '', belgeTuru: 'Fatura', pb, kur: '', doviz: '' }
    // 2.8.6b: Coklu KDV'li faturalar — efatura_kdv_detay'daki kdvParcaa
    // gore HER ORAN AYRI SATIR olarak yazilir (ayri matrah + ayri KDV,
    // ayri detay aciklamasi "%20 KDV'li kısım" gibi). Her parca kendi
    // oran hesabina gider (153.01 + %20 -> 153.01.x; 191 + %10 -> 191.x.y).
    const kdvParca = Array.isArray(f.kdvParcalari)
      ? f.kdvParcalari.filter(p => p && ((Number(p.matrah) || 0) !== 0 || (Number(p.kdv) || 0) !== 0))
      : []
    const cokluKdv = kdvParca.length > 1
    const vknHane = f.karsi_vkn || ''
    const detayIle = (oran) => `${detay} — %${oran} KDV'li kısım`.slice(0, 150)
    const oranHesap = (harita, oran, varsayilan) => (hesapPlani && oran > 0 && harita?.[oran]) || varsayilan
    if (f.yon === 'giden') {
      if (cokluKdv) {
        const anaHarita = hesapPlani ? oranHesaplari(hesapPlani, f.hesap_kodu) : null
        const kdvHarita = hesapPlani ? oranHesaplari(hesapPlani, kdvKod) : null
        satirlar.push([fisNo, ortak.tarih, fisAciklama, cari, ortak.evrakNo, ortak.evrakTarih, detay, tutar, '', '', ortak.belgeTuru, ortak.pb, ortak.kur, ortak.doviz, vknHane])
        for (const p of kdvParca) {
          const pMatrah = Math.round((Number(p.matrah) || 0) * carpan * 100) / 100
          const pKdv = Math.round((Number(p.kdv) || 0) * carpan * 100) / 100
          if (!pMatrah && !pKdv) continue
          const pAna = oranHesap(anaHarita, p.oran, anaHesap)
          const pKdvKod = oranHesap(kdvHarita, p.oran, kdvKod)
          const pDetay = detayIle(p.oran)
          satirlar.push([fisNo, ortak.tarih, fisAciklama, pAna, ortak.evrakNo, ortak.evrakTarih, pDetay, '', pMatrah, '', ortak.belgeTuru, ortak.pb, ortak.kur, '', vknHane])
          if (!dusKdv && pKdv) satirlar.push([fisNo, ortak.tarih, fisAciklama, pKdvKod, ortak.evrakNo, ortak.evrakTarih, pDetay, '', pKdv, '', ortak.belgeTuru, ortak.pb, ortak.kur, '', ''])
        }
      } else {
        satirlar.push([fisNo, ortak.tarih, fisAciklama, cari, ortak.evrakNo, ortak.evrakTarih, detay, tutar, '', '', ortak.belgeTuru, ortak.pb, ortak.kur, ortak.doviz, vknHane])
        satirlar.push([fisNo, ortak.tarih, fisAciklama, anaHesap, ortak.evrakNo, ortak.evrakTarih, detay, '', matrah, '', ortak.belgeTuru, ortak.pb, ortak.kur, '', vknHane])
        if (!dusKdv) satirlar.push([fisNo, ortak.tarih, fisAciklama, kdvKod, ortak.evrakNo, ortak.evrakTarih, detay, '', kdv, '', ortak.belgeTuru, ortak.pb, ortak.kur, '', ''])
      }
    } else if (cokluKdv) {
      const anaHarita = hesapPlani ? oranHesaplari(hesapPlani, f.hesap_kodu) : null
      const kdvHarita = hesapPlani ? oranHesaplari(hesapPlani, kdvKod) : null
      for (const p of kdvParca) {
        const pMatrah = Math.round((Number(p.matrah) || 0) * carpan * 100) / 100
        const pKdv = Math.round((Number(p.kdv) || 0) * carpan * 100) / 100
        if (!pMatrah && !pKdv) continue
        const pAna = oranHesap(anaHarita, p.oran, anaHesap)
        const pKdvKod = oranHesap(kdvHarita, p.oran, kdvKod)
        const pDetay = detayIle(p.oran)
        satirlar.push([fisNo, ortak.tarih, fisAciklama, pAna, ortak.evrakNo, ortak.evrakTarih, pDetay, pMatrah, '', '', ortak.belgeTuru, ortak.pb, ortak.kur, '', vknHane])
        if (!dusKdv && pKdv) satirlar.push([fisNo, ortak.tarih, fisAciklama, pKdvKod, ortak.evrakNo, ortak.evrakTarih, pDetay, pKdv, '', '', ortak.belgeTuru, ortak.pb, ortak.kur, '', ''])
      }
      satirlar.push([fisNo, ortak.tarih, fisAciklama, cari, ortak.evrakNo, ortak.evrakTarih, detay, '', tutar, '', ortak.belgeTuru, ortak.pb, ortak.kur, '', vknHane])
    } else {
      satirlar.push([fisNo, ortak.tarih, fisAciklama, anaHesap, ortak.evrakNo, ortak.evrakTarih, detay, matrah, '', '', ortak.belgeTuru, ortak.pb, ortak.kur, '', vknHane])
      if (!dusKdv) satirlar.push([fisNo, ortak.tarih, fisAciklama, kdvKod, ortak.evrakNo, ortak.evrakTarih, detay, kdv, '', '', ortak.belgeTuru, ortak.pb, ortak.kur, '', ''])
      satirlar.push([fisNo, ortak.tarih, fisAciklama, cari, ortak.evrakNo, ortak.evrakTarih, detay, '', tutar, '', ortak.belgeTuru, ortak.pb, ortak.kur, '', vknHane])
    }
    fisBilgi.push({ faturaId: f.id, fisNo, tarih, unvan: f.karsi_unvan, tutar: tlFormatla(tutar) })
  })

  const ws = XLSX.utils.aoa_to_sheet([SABLON_BASLIK, ...satirlar.map(s => s.map(v => (v === 0 ? 0 : v)))])
  ws['!cols'] = SABLON_BASLIK.map((b, i) => ({ wch: i === 6 ? 40 : i === 2 ? 34 : 14 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Fiş Aktarım Şablon')
  return { wb, fisBilgi, hazirSayisi: hazir.length, eksikSayisi: faturalar.length - hazir.length, karmaKdvler }
}

export function lucaExcelIndir(faturalar, dosyaAdi, hesapPlani = null, kdvSecim = null) {
  const { wb, fisBilgi, hazirSayisi, eksikSayisi, karmaKdvler } = lucaExcelUret(faturalar, hesapPlani, kdvSecim)
  if (!fisBilgi.length) return { ok: false, eksikSayisi }
  XLSX.writeFile(wb, dosyaAdi || `Luca_Fis_${new Date().toISOString().slice(0, 10)}.xlsx`)
  return { ok: true, fisSayisi: fisBilgi.length, hazirSayisi, eksikSayisi, fisBilgi, karmaKdvler }
}

// Luca'ya yuklenecek EK hesap plani dosyasi (otomatik acilan yeni cariler).
// Luca -> Hesap Kodlari ekranindaki Excel aktariminda kullanilir:
// yeni hesaplar once bu dosyayla actirilir, boylece fis yuklemede
// "hesap kodu bulunamadi" hatasi olmaz. Cikti Luca'nin kendi Excel aktarim
// sablonuyla birebir ayni CSV formatindadir (dosya dogrudan Luca'ya yuklenebilir).
export function lucaHesapPlaniEkIndir(yeniHesaplar, dosyaAdi) {
  if (!yeniHesaplar?.length) return false
  hesapPlaniCsvIndir(yeniHesaplar, dosyaAdi || `Luca_Hesap_Plani_Ek_${new Date().toISOString().slice(0, 10)}.csv`)
  return true
}
