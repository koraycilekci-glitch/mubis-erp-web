// MUBiS - Z Raporu / Mali Hafiza Okuyucu
// Yuklenen gunluk Z raporu veya aylik Mali Hafiza ciktisini (OPOS/OnKayit
// yazici PDF'i) okur, kalemlerini hesap planina siniflandirir ve kaydeder.
import { supabase } from '../lib/supabase'

// Tr sayi: "1.234,56" -> 1234.56 ; "1234.56" -> 1234.56
const sayi = (s) => {
  const t = String(s || '').replace(/[^\d.,-]/g, '').trim()
  if (!t) return null
  if (t.includes(',')) return parseFloat(t.replace(/\./g, '').replace(',', '.'))
  return parseFloat(t)
}

export const HESAP_ESLEME = {
  satis: { kod: '600.01', ad: 'Yurt Ici Satislar' },
  iade: { kod: '601.01', ad: 'Satis Iptal/Iade' },
  nakit: { kod: '100.01', ad: 'Kasa - Nakit Tahsilat' },
  kart: { kod: '102.01', ad: 'Bankalar - Kredi Karti' },
  yemek: { kod: '213.02', ad: 'Yemek Karti Sirketleri' },
  cek: { kod: '101.02', ad: 'Verilen Cekler / OdeHiz Tahsilati' }
}

// File/Blob -> PDF metni
export async function zRaporPdfOku(file) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
    pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default
  }
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  let metin = ''
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    metin += tc.items.map(it => it.str).join(' ') + '\n'
  }
  return metin
}

// Metni satirlara ayirip numarali satiri bulur: "NAKIT ... 1.234,56"
const satirBul = (metin, desen) => {
  const satirlar = String(metin || '').split('\n')
  for (const s of satirlar) {
    const m = s.match(desen)
    if (m) return m
  }
  return null
}

// Z raporu / Mali Hafiza metnini ayristirir + hesap satirlarini uretir
export function zRaporMetindenAyrisat(metin, mevcutGunler = []) {
  const sonuc = {
    raporTipi: /MAL[Iİ] HAF[Iİ]ZA|HAFIZA RAPORU/i.test(metin) ? 'mali_hafiza' : 'z',
    tarih: null, zNo: null, kasaNo: null,
    brutSatis: null, netSatis: null, toplamKdv: null,
    odemeler: [], kdvSatirlari: [], gunler: [], hesapSatirlari: []
  }

  const dM = satirBul(metin, /(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/)
  if (dM) sonuc.tarih = dM[1].replace(/-/g, '.')
  const zM = satirBul(metin, /Z\s*(?:NO|NO:|NO\s|NUMARASI)?\s*[:#-]?\s*(\d{1,5})\b/i)
  if (zM) sonuc.zNo = zM[1]
  const kM = satirBul(metin, /KASA\s*(?:NO|NUMARASI)?\s*[:#-]?\s*(\d{1,5})\b/i)
  if (kM) sonuc.kasaNo = kM[1]

  const cekilis = (anahtar, hedef, jsonAnahtar) => {
    const m = satirBul(metin, new RegExp(anahtar + '[^\\d-]{0,40}?(-?[\\d.,]+\\d)', 'i'))
    if (m) { hedef[jsonAnahtar] = sayi(m[1]); return true }
    return false
  }

  cekilis('BR[UÜÜ]?T\\s*(?:SAT[Iİ][SŞ]|TOPLAM)', sonuc, 'brutSatis')
  cekilis('NET\\s*(?:SAT[Iİ][SŞ]|TOPLAM)', sonuc, 'netSatis')
  cekilis('TOPLAM\\s*(?:KDV|K.D.V)', sonuc, 'toplamKdv')
  if (!sonuc.netSatis) cekilis('TOPLAM\\s*(?:SAT[Iİ][SŞ]|TUTAR)', sonuc, 'netSatis')

  // Odeme turleri
  for (const [anahtar, tur] of [
    ['NAK[Iİ]T', 'nakit'],
    ['KRED[Iİ]\\s*KART|K\\.?\\s*KART|BANKA\\s*KART', 'kart'],
    ['YEMEK\\s*KART|MULTINET|SODEXO|METRO\\s*KART|SETCARD|EDENRED', 'yemek'],
    ['CEK|ÇEK', 'cek']
  ]) {
    const m = satirBul(metin, new RegExp(anahtar + '[^\\d-]{0,40}?(-?[\\d.,]+\\d)', 'i'))
    if (m) {
      const tutar = sayi(m[1])
      if (tutar !== null) sonuc.odemeler.push({ tur, tutar })
    }
  }

  // KDV oranlari: "%10 ... matrah ... kdv" satirlari
  const kdvDesen = /%?\s*(1|8|10|20)\s*%?[^%]{0,60}?([\d.,]+\d)[^\d%]{0,30}?([\d.,]+\d)?/g
  let km
  while ((km = kdvDesen.exec(metin)) !== null) {
    const oran = parseInt(km[1], 10)
    const matrah = sayi(km[2])
    const kdv = sayi(km[3]) ?? (matrah !== null ? Math.round(matrah * oran) / 100 : null)
    if (matrah === null && kdv === null) continue
    if (sonuc.kdvSatirlari.some(k => k.oran === oran)) continue
    sonuc.kdvSatirlari.push({ oran, matrah, kdv })
  }

  // Mali Hafiza: gun bazli satirlar (gunluk toplamlar)
  const gunDesen = /(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})[^\d-]{0,80}?(-?[\d.,]+\d)/g
  let gm
  const gunSet = new Set(mevcutGunler)
  while ((gm = gunDesen.exec(metin)) !== null) {
    const gun = gm[1].replace(/-/g, '.')
    if (gunSet.has(gun)) continue
    const tutar = sayi(gm[2])
    if (tutar === null || tutar === 0) continue
    gunSet.add(gun)
    sonuc.gunler.push({ tarih: gun, tutar, zNo: null })
  }

  // ---- Hesap satirlarini uret ----
  const satisEsas = sonuc.netSatis ?? null
  if (satisEsas !== null && satisEsas !== 0) {
    sonuc.hesapSatirlari.push({ ...HESAP_ESLEME.satis, borc: '', alacak: Math.abs(satisEsas) })
  }
  for (const o of sonuc.odemeler) {
    const es = HESAP_ESLEME[o.tur] || HESAP_ESLEME.nakit
    sonuc.hesapSatirlari.push({ ...es, borc: Math.abs(o.tutar), alacak: '' })
  }
  for (const k of sonuc.kdvSatirlari) {
    if (k.kdv) sonuc.hesapSatirlari.push({ kod: `391.${String(k.oran).padStart(2, '0')}`, ad: `Hesaplanan KDV %${k.oran}`, borc: '', alacak: Math.abs(k.kdv) })
  }
  // Mali Hafiza gunleri: her gun icin satishesabi + nakit varsayimi (ayrinti yoksa)
  for (const g of sonuc.gunler) {
    sonuc.hesapSatirlari.push({ ...HESAP_ESLEME.satis, ad: `${HESAP_ESLEME.satis.ad} (${g.tarih})`, borc: '', alacak: Math.abs(g.tutar) })
    sonuc.hesapSatirlari.push({ ...HESAP_ESLEME.nakit, ad: `${HESAP_ESLEME.nakit.ad} (${g.tarih})`, borc: Math.abs(g.tutar), alacak: '' })
  }
  return sonuc
}

// Kaydet: z_raporlar tablosuna yaz (tablo: supabase/z_raporlar.sql)
export async function zRaporKaydet(clientId, rapor) {
  const { data, error } = await supabase
    .from('z_raporlar')
    .insert({ client_id: clientId, ...rapor })
    .select()
  if (error) throw new Error('Z raporu kaydedilemedi: ' + error.message)
  return data && data[0]
}

// Musterinin z raporlarini listeler
export async function zRaporlariGetir(clientId) {
  if (!clientId) return []
  const { data, error } = await supabase
    .from('z_raporlar')
    .select('*')
    .eq('client_id', clientId)
    .order('tarih', { ascending: false })
  if (error) return []
  return data || []
}

export async function zRaporSil(id) {
  const { error } = await supabase.from('z_raporlar').delete().eq('id', id)
  if (error) throw new Error('Silinemedi: ' + error.message)
}
