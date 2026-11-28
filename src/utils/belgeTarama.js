const para = (value) => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value)
const kurus = (value) => Math.round(value * 100) / 100
const oranlar = [0, 1, 10, 20]
export const belgeBasliklari = ['Tarih', 'Evrak No', 'Açıklama', 'KDV Oranı', 'Matrah', 'KDV', 'Kredi Kartı', 'Nakit']

export function giderVergiVeOdemeOku(lines, sayiOku) {
  const oranlar = new Map()
  let toplamKdv = null
  let nakit = null
  let krediKarti = null
  const paraDeseni = /\d[\d.,]*[,.]\d{2}(?!\d)/g
  for (const line of lines) {
    const metin = line.toLocaleUpperCase('tr-TR').normalize('NFD').replace(/\p{M}/gu, '')
    const oranEslesmesi = metin.match(/%\s*(\d{1,2})(?=\s|[:*]|$)|\b(\d{1,2})\s*%/)
    const tutarlar = [...(oranEslesmesi ? metin.replace(oranEslesmesi[0], '') : metin).matchAll(paraDeseni)].map(match => sayiOku(match[0]))
    if (!tutarlar.length) continue
    const sonTutar = tutarlar.at(-1)
    if (/^(?:TOPLAM\s*(?:KDV|VERGI)|(?:KDV|VERGI)\s*TOPLAMI)/.test(metin)) toplamKdv = sonTutar
    if (/^(?:KASA\s+)?NAKIT\b/.test(metin) && !/USTU|IADE|PARA UST/.test(metin)) nakit = sonTutar
    if (/^(?:KREDI\s*KARTI|BANKA\s*KARTI|KARTLI\s*ODEME)\b/.test(metin)) krediKarti = sonTutar
    if (!oranEslesmesi || !/KDV|MATRAH|VERGI/.test(metin) || tutarlar.length !== 2) continue
    const oran = Number(oranEslesmesi[1] ?? oranEslesmesi[2])
    const [matrah, kdv] = tutarlar
    if (Math.abs(kurus(matrah * oran / 100) - kdv) <= 0.02) oranlar.set(oran, { oran, matrah, kdv })
  }
  return { toplamKdv, nakit, krediKarti, kdvDetaylari: [...oranlar.values()].sort((ilk, ikinci) => ilk.oran - ikinci.oran) }
}

export function belgeSatirlari(belge, zRaporu = false) {
  const veri = (zRaporu ? belge.parsed_data : belge.ocr_data) || {}
  const toplam = para(zRaporu ? veri.toplamSatis ?? veri.totalAmount ?? belge.total_amount : veri.toplam ?? belge.total_amount)
  const vergi = para(zRaporu ? veri.toplamKDV ?? veri.toplamKdv ?? veri.totalKdv ?? belge.total_kdv : veri.kdv ?? belge.kdv_amount)
  let oranSatirlari = zRaporu ? oranlar.flatMap(oran => {
    if (oran === 20 && veri.kdvOraniVarsayildi) return []
    const brut = para(veri[`satis${oran}`])
    const kdv = oran === 0 ? 0 : para(veri[`kdv${oran}`])
    const matrah = para(veri[`matrah${oran}`]) || (brut != null && kdv != null ? kurus(brut - kdv) : null)
    if (!(kdv || matrah || brut)) return []
    return [{ oran, matrah, kdv }]
  }) : (veri.kdvDetaylari || []).filter(({ oran }) => Number.isFinite(oran))
  const bilinen = oranSatirlari.reduce((sum, row) => sum + (row.matrah ?? 0) + (row.kdv ?? 0), 0)
  const bilinenKdv = oranSatirlari.reduce((sum, row) => sum + (row.kdv ?? 0), 0)
  const fark = toplam == null ? null : kurus(toplam - bilinen)
  const vergiFarki = vergi == null ? null : kurus(vergi - bilinenKdv)
  if ((fark != null && fark < -0.02) || (vergiFarki != null && vergiFarki < -0.02)) oranSatirlari = []
  if (!oranSatirlari.length || fark > 0.02 || vergiFarki > 0.02) {
    const kalan = oranSatirlari.length ? fark : toplam
    const kdv = oranSatirlari.length ? vergiFarki : vergi
    oranSatirlari = [...oranSatirlari, { oran: null, matrah: kalan != null && kdv != null && kalan >= kdv ? kurus(kalan - kdv) : null, kdv }]
  }
  const tarih = (zRaporu ? belge.report_date : belge.document_date) || veri.tarih || ''
  const evrak = (zRaporu ? belge.z_no : belge.document_no) || veri.evrakNo || veri.fisNo || ''
  const aciklama = zRaporu ? 'Z Raporu' : veri.satici || veri.aciklama || 'Gider Fişi'
  return oranSatirlari.map(({ oran, matrah, kdv }, index) => [
    tarih, evrak, aciklama, oran == null || matrah == null || kdv == null || Math.abs(kurus(matrah * oran / 100) - kdv) > 0.02 ? 'Kontrol gerekli' : `%${oran}`,
    matrah, kdv, index === 0 ? para(veri.krediKarti ?? veri.creditCardAmount ?? belge.credit_card_amount) : null,
    index === 0 ? para(veri.nakit ?? veri.cashAmount ?? belge.cash_amount) : null
  ])
}

export async function belgeExcelIndir(belgeler, donem, zRaporu = false) {
  const XLSX = await import('xlsx')
  const kitap = XLSX.utils.book_new()
  const tablo = XLSX.utils.aoa_to_sheet([belgeBasliklari, ...belgeler.flatMap(belge => belgeSatirlari(belge, zRaporu))])
  tablo['!cols'] = [14, 18, 32, 19, 14, 14, 16, 14].map(wch => ({ wch }))
  tablo['!autofilter'] = { ref: tablo['!ref'] }
  XLSX.utils.book_append_sheet(kitap, tablo, zRaporu ? 'Z Raporları' : 'Gider Fişleri')
  XLSX.writeFile(kitap, `${zRaporu ? 'z-raporlari' : 'gider-fisleri'}-${donem}.xlsx`)
}

export function netlikPuani(pikseller, genislik, yukseklik) {
  let toplam = 0
  let kare = 0
  let adet = 0
  const parlaklik = (index) => 0.299 * pikseller[index] + 0.587 * pikseller[index + 1] + 0.114 * pikseller[index + 2]
  const stride = genislik * 4
  for (let row = Math.max(1, Math.floor(yukseklik / 5)); row < Math.ceil(yukseklik * 0.8) && row < yukseklik - 1; row++) {
    for (let col = Math.max(1, Math.floor(genislik / 5)); col < Math.ceil(genislik * 0.8) && col < genislik - 1; col++) {
      const index = row * stride + col * 4
      const fark = parlaklik(index - 4) + parlaklik(index + 4) + parlaklik(index - stride) + parlaklik(index + stride) - 4 * parlaklik(index)
      toplam += fark
      kare += fark * fark
      adet++
    }
  }
  return adet ? kare / adet - (toplam / adet) ** 2 : 0
}
