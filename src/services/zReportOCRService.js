import { createWorker } from 'tesseract.js'

/**
 * Z Raporu resmini OCR ile okur ve yapilandirilmis veriye donusturur
 * Gelistirilmis versiyon - daha dogru okuma
 */
export async function processZReportImage(imageUrl) {
  const worker = await createWorker('tur')
  
  try {
    // Resmi OCR ile oku
    const { data: { text } } = await worker.recognize(imageUrl)
    
    // OCR metnini parse et
    const parsed = parseZReportOCRText(text)
    
    return {
      rawText: text,
      parsed,
      confidence: parsed.confidence || 0
    }
  } finally {
    await worker.terminate()
  }
}

/**
 * Toplu Z raporu resimlerini tek worker ile sirayla okur.
 */
export async function processZReportImagesBatch(imageUrls) {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) return []
  const worker = await createWorker('tur')
  try {
    const results = []
    for (const url of imageUrls) {
      const { data: { text } } = await worker.recognize(url)
      const parsed = parseZReportOCRText(text)
      results.push({ rawText: text, parsed, confidence: parsed.confidence || 0 })
    }
    return results
  } finally {
    await worker.terminate()
  }
}

/**
 * OCR metnini Z raporu yapisina parse eder - GELISTIRILMIS
 */
function parseZReportOCRText(text) {
  if (!text) return null

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const fullText = text.toUpperCase()

  const result = {
    tarih: null,
    evrakNo: null,
    aciklama: null,
    satis0: 0,
    satis1: 0,
    satis10: 0,
    satis20: 0,
    nakit: 0,
    krediKarti: 0,
    havale: 0,
    matrah1: 0,
    matrah10: 0,
    matrah20: 0,
    kdv1: 0,
    kdv10: 0,
    kdv20: 0,
    toplamSatis: 0,
    iade: 0,
    confidence: 0
  }

  // ========== TARIH BULMA ==========
  const datePatterns = [
    /(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{4})/,
    /(\d{4})[\.\/\-](\d{1,2})[\.\/\-](\d{1,2})/,
    /(\d{2})(\d{2})(\d{4})/,
    /(\d{2})[\.\-\/](\d{2})[\.\-\/](\d{2})/
  ]

  for (const pattern of datePatterns) {
    const match = text.match(pattern)
    if (match) {
      if (match[3].length === 4) {
        result.tarih = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
      } else {
        result.tarih = `20${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
      }
      break
    }
  }

  // ========== EVRAK / Z NO ==========
  const evrakPatterns = [
    /Z\s*[-–—]\s*(\d{3,})/i,
    /Z\s*RAPORU.*Z\s*[-–—]\s*(\d+)/i,
    /(?:EVRAK\s*NO|Z\s*NO|F[İI]Ş\s*NO|BELGE\s*NO)[\.:\s]*([0-9]+)/i,
    /(?:Z\s*RAPORU|RAPOR)[\.:\s]*([0-9]+)/i,
    /(?:SIRA\s*NO|NO)[\.:\s]*([0-9]{3,})/i,
    /Z\s*NO\s*[:\.\s]+(\d+)/i
  ]

  for (const pattern of evrakPatterns) {
    const match = text.match(pattern)
    if (match) {
      result.evrakNo = match[1]
      break
    }
  }

  // ========== ODEME TOPLAMLARI (banka / kredi / nakit) ==========
  let bankaToplami = 0
  let kasaKrediToplami = 0

  lines.forEach(line => {
    const upperLine = line.toUpperCase()

    // Nakit tahsilat (kasa nakit dahil)
    if (/NAK[İI]T\s*TAHS[İI]LAT|KASA\s*NAK[İI]T/.test(upperLine) && !/[K]AR[SŞ]IL[Iİ]G/.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > result.nakit) result.nakit = num
    }

    // Kredi karti - kasa kredi satirlari
    if (/KASA\s*KRED[İI]/.test(upperLine)) {
      const num = extractNumberFromLine(line)
      kasaKrediToplami += num
    }

    // Banka satirlari (T.VAKIFLAR, HALK, DENIZ, vb.)
    if (/(?:T\.VAKIFLAR|VAKIFLAR|HALK|DEN[İI]Z|[İI]Ş|İŞ|GARANT[İI]|AKBANK|YAPI\s*KRED[İI]|ZIRAAT|F[İI]NANS)\s*BANK/i.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > 0) bankaToplami += num
    }

    // Havale / EFT
    if (/HAVALE|EFT|BANKA\s*HAVA/i.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > result.havale) result.havale = num
    }
  })

  result.krediKarti = kasaKrediToplami + bankaToplami

  // ========== SATIŞ DEĞERLERİ ==========
  let brutSatis = 0
  let netSatis = 0
  let topSatis = 0
  let topkdv = 0

  lines.forEach(line => {
    const upperLine = line.toUpperCase()

    // Net satis (KDV dahil toplam)
    if (/NET\s*SATIŞ/.test(upperLine) || /NET\s*SATIS/.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > netSatis) netSatis = num
    }
    // Brut satis
    else if (/BR[ÜU]T\s*SATIŞ/.test(upperLine) || /BRUT\s*SATIS/.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > brutSatis) brutSatis = num
    }
    // TOPKDV
    else if (/TOPKDV|KDV\s*TOPLAM/.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > topkdv) topkdv = num
    }
    // TOP / TOPLAM (genel toplam) - FIS SAYILARI disinda
    else if (/\bTOP\b|\bTOPLAM\b/.test(upperLine) && !/F[İI]Ş\s*SAY|İPTAL|RAPOR/i.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > topSatis) topSatis = num
    }

    // KDV oranli satislar (X10/X20/Z10/Z20/220 SATIS OCR varyantlari dahil)
    if (/SATIŞ.*0\s*%|SATIŞ.*0\s*KDV|0\s*%.*SATIŞ/.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > result.satis0) result.satis0 = num
    }
    else if (/SATIŞ.*1\s*%|SATIŞ.*1\s*KDV|1\s*%.*SATIŞ/.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > result.satis1) result.satis1 = num
    }
    else if (/SATIŞ.*10\s*%|SATIŞ.*10\s*KDV|10\s*%.*SATIŞ|\b(?:X|Z)\s?10\s*SATIŞ|\b10\s*SATIŞ/.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > result.satis10) result.satis10 = num
    }
    else if (/SATIŞ.*20\s*%|SATIŞ.*20\s*KDV|20\s*%.*SATIŞ|\b(?:X|Z)\s?20\s*SATIŞ|\b20\s*SATIŞ|\b220\s*SATIŞ/.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > result.satis20) result.satis20 = num
    }

    // Matrah
    if (/MATRAH/.test(upperLine)) {
      if (/1\s*%/.test(upperLine)) {
        const num = extractNumberFromLine(line)
        if (num > result.matrah1) result.matrah1 = num
      } else if (/10\s*%/.test(upperLine)) {
        const num = extractNumberFromLine(line)
        if (num > result.matrah10) result.matrah10 = num
      } else if (/20\s*%/.test(upperLine)) {
        const num = extractNumberFromLine(line)
        if (num > result.matrah20) result.matrah20 = num
      }
    }

    // KDV (X10/X20/220 KDV OCR varyantlari dahil)
    if (/KDV|VERG[İI]/.test(upperLine) && !upperLine.includes('MATRAH') && !/TOPKDV|KDV\s*TOPLAM|KIMKDV/i.test(upperLine)) {
      if (/\b(?:X|Z)\s?10\s*KDV|\b10\s*KDV|10\s*%/.test(upperLine)) {
        const num = extractNumberFromLine(line)
        if (num > result.kdv10) result.kdv10 = num
      } else if (/\b(?:X|Z)\s?20\s*KDV|\b20\s*KDV|\b220\s*KDV|20\s*%/.test(upperLine)) {
        const num = extractNumberFromLine(line)
        if (num > result.kdv20) result.kdv20 = num
      } else if (/1\s*%/.test(upperLine) || /\b1\b/.test(upperLine)) {
        const num = extractNumberFromLine(line)
        if (num > result.kdv1) result.kdv1 = num
      } else if (/\b10\b/.test(upperLine)) {
        const num = extractNumberFromLine(line)
        if (num > result.kdv10) result.kdv10 = num
      } else if (/\b20\b/.test(upperLine)) {
        const num = extractNumberFromLine(line)
        if (num > result.kdv20) result.kdv20 = num
      }
    }

    // İade
    if (/[İI]ADE/.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > result.iade) result.iade = num
    }
  })

  // Toplam satis belirleme sirasi: net satis > top > brut satis > kdvli satislar toplami
  result.toplamSatis = netSatis || topSatis || brutSatis || (result.satis1 + result.satis10 + result.satis20 + result.satis0)

  // KDV toplami belirleme
  const kdvToplam = result.kdv1 + result.kdv10 + result.kdv20
  if (topkdv > 0 && kdvToplam === 0) {
    // Tek KDV orani varsa topkdv'yi ona ata
    if (result.satis20 > 0) result.kdv20 = topkdv
    else if (result.satis10 > 0) result.kdv10 = topkdv
    else if (result.satis1 > 0) result.kdv1 = topkdv
    else result.kdv20 = topkdv
  }

  // KDV'li satis kategorileri bos ama toplam satis varsa %20 varsayimiyla dagit
  if (result.toplamSatis > 0 && result.satis0 + result.satis1 + result.satis10 + result.satis20 === 0) {
    result.satis20 = result.toplamSatis
  }

  // Güven skoru hesapla
  const filledFields = [
    result.tarih, result.evrakNo,
    result.satis0, result.satis1, result.satis10, result.satis20,
    result.nakit, result.krediKarti,
    result.matrah1, result.matrah10, result.matrah20,
    result.kdv1, result.kdv10, result.kdv20
  ].filter(v => v !== null && v !== 0 && v !== '').length

  result.confidence = Math.min(100, (filledFields / 14) * 100)

  return result
}

/**
 * Bir satırdan sayı değeri çıkarır
 */
function extractNumberFromLine(line) {
  // Satırdaki son sayıyı bul (genellikle tutar satırın sonunda olur)
  const matches = line.match(/(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})/g)
  if (matches && matches.length > 0) {
    // Son eşleşmeyi al (genellikle toplam tutar)
    return parseTurkishNumber(matches[matches.length - 1])
  }
  
  // Alternatif: herhangi bir sayı
  const singleMatch = line.match(/(\d+[.,]?\d*)/)
  if (singleMatch) {
    return parseTurkishNumber(singleMatch[1])
  }
  
  return 0
}

/**
 * Türkçe formattaki sayiyi parse eder
 */
function parseTurkishNumber(str) {
  if (!str) return 0
  
  let cleaned = str.trim()
  
  // Hem nokta hem virgul varsa
  if (cleaned.includes('.') && cleaned.includes(',')) {
    const lastDot = cleaned.lastIndexOf('.')
    const lastComma = cleaned.lastIndexOf(',')
    
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.')
    } else {
      cleaned = cleaned.replace(/,/g, '')
    }
  } else if (cleaned.includes(',')) {
    const parts = cleaned.split(',')
    if (parts.length === 2 && parts[1].length <= 2) {
      cleaned = cleaned.replace(',', '.')
    } else {
      cleaned = cleaned.replace(/,/g, '')
    }
  }
  
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

/**
 * Z raporu verilerini muhasebe kaydina donusturur
 */
export function convertToAccountingEntry(clientType, zData, hesapPlani) {
  const entries = []
  const toplamSatis = zData.satis0 + zData.satis1 + zData.satis10 + zData.satis20
  const toplamKdv = zData.kdv1 + zData.kdv10 + zData.kdv20
  const toplamMatrah = zData.matrah1 + zData.matrah10 + zData.matrah20

  // 0 bolme hatasini onle
  const kdvOrani = toplamSatis > 0 ? toplamKdv / toplamSatis : 0

  if (clientType === 'company') {
    // Sirket - 1. Sinif Defter

    // 1. Nakit satislar
    if (zData.nakit > 0) {
      const nakitKdv = toplamKdv > 0 ? zData.nakit * kdvOrani : 0
      entries.push({
        tarih: zData.tarih,
        evrakNo: zData.evrakNo,
        aciklama: `Nakit satis - Z No: ${zData.evrakNo}`,
        borcHesap: '100',
        borcHesapAdi: 'Kasa',
        alacakHesap: '600',
        alacakHesapAdi: 'Yurtici Satislar',
        tutar: zData.nakit - nakitKdv,
        kdvOrani: null
      })

      if (nakitKdv > 0) {
        entries.push({
          tarih: zData.tarih,
          evrakNo: zData.evrakNo,
          aciklama: `KDV - Z No: ${zData.evrakNo}`,
          borcHesap: '100',
          borcHesapAdi: 'Kasa',
          alacakHesap: '391',
          alacakHesapAdi: 'Hesaplanan KDV',
          tutar: nakitKdv,
          kdvOrani: null
        })
      }
    }

    // 2. Kredi karti satislar
    if (zData.krediKarti > 0) {
      const kkKdv = toplamKdv > 0 ? zData.krediKarti * kdvOrani : 0
      entries.push({
        tarih: zData.tarih,
        evrakNo: zData.evrakNo,
        aciklama: `Kredi karti satis - Z No: ${zData.evrakNo}`,
        borcHesap: '101',
        borcHesapAdi: 'Alinan Cekler',
        alacakHesap: '600',
        alacakHesapAdi: 'Yurtici Satislar',
        tutar: zData.krediKarti - kkKdv,
        kdvOrani: null
      })

      if (kkKdv > 0) {
        entries.push({
          tarih: zData.tarih,
          evrakNo: zData.evrakNo,
          aciklama: `KDV (KK) - Z No: ${zData.evrakNo}`,
          borcHesap: '101',
          borcHesapAdi: 'Alinan Cekler',
          alacakHesap: '391',
          alacakHesapAdi: 'Hesaplanan KDV',
          tutar: kkKdv,
          kdvOrani: null
        })
      }
    }
  } else {
    // 1. Sinif Isletme - Basit usul

    entries.push({
      tarih: zData.tarih,
      evrakNo: zData.evrakNo,
      aciklama: `Gunluk satis - Z No: ${zData.evrakNo}`,
      borcHesap: '100',
      borcHesapAdi: 'Kasa',
      alacakHesap: '600',
      alacakHesapAdi: 'Satis Hasilati',
      tutar: toplamSatis,
      kdvOrani: null
    })
  }

  // KDV detaylari (ayri satirlar)
  if (zData.kdv1 > 0) {
    entries.push({
      tarih: zData.tarih,
      evrakNo: zData.evrakNo,
      aciklama: `KDV %1 - Z No: ${zData.evrakNo}`,
      borcHesap: '391',
      borcHesapAdi: 'Hesaplanan KDV',
      alacakHesap: '600',
      alacakHesapAdi: 'Yurtici Satislar',
      tutar: zData.kdv1,
      kdvOrani: 1
    })
  }

  if (zData.kdv10 > 0) {
    entries.push({
      tarih: zData.tarih,
      evrakNo: zData.evrakNo,
      aciklama: `KDV %10 - Z No: ${zData.evrakNo}`,
      borcHesap: '391',
      borcHesapAdi: 'Hesaplanan KDV',
      alacakHesap: '600',
      alacakHesapAdi: 'Yurtici Satislar',
      tutar: zData.kdv10,
      kdvOrani: 10
    })
  }

  if (zData.kdv20 > 0) {
    entries.push({
      tarih: zData.tarih,
      evrakNo: zData.evrakNo,
      aciklama: `KDV %20 - Z No: ${zData.evrakNo}`,
      borcHesap: '391',
      borcHesapAdi: 'Hesaplanan KDV',
      alacakHesap: '600',
      alacakHesapAdi: 'Yurtici Satislar',
      tutar: zData.kdv20,
      kdvOrani: 20
    })
  }

  return entries
}
