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
  // Formatlar: 04.08.2026, 04/08/2026, 04-08-2026, 4.8.2026
  const datePatterns = [
    /(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{4})/,
    /(\d{4})[\.\/\-](\d{1,2})[\.\/\-](\d{1,2})/,
    /(\d{2})(\d{2})(\d{4})/, // 04082026
    /(\d{2})\.(\d{2})\.(\d{2})/ // 04.08.26
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

  // ========== SATIŞ DEĞERLERİ ==========
  // Her satırı tek tek incele
  lines.forEach(line => {
    const upperLine = line.toUpperCase()
    
    // Satış 0%
    if (/SATIŞ.*0\s*%|SATIŞ.*0\s*KDV|0\s*%.*SATIŞ/.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > result.satis0) result.satis0 = num
    }
    // Satış 1%
    else if (/SATIŞ.*1\s*%|SATIŞ.*1\s*KDV|1\s*%.*SATIŞ/.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > result.satis1) result.satis1 = num
    }
    // Satış 10%
    else if (/SATIŞ.*10\s*%|SATIŞ.*10\s*KDV|10\s*%.*SATIŞ/.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > result.satis10) result.satis10 = num
    }
    // Satış 20%
    else if (/SATIŞ.*20\s*%|SATIŞ.*20\s*KDV|20\s*%.*SATIŞ/.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > result.satis20) result.satis20 = num
    }
    
    // Toplam satış
    else if (/TOPLAM\s*SATIŞ|GENEL\s*TOPLAM|TOPLAM/.test(upperLine) && !result.toplamSatis) {
      const num = extractNumberFromLine(line)
      if (num > 0) result.toplamSatis = num
    }
    
    // Nakit
    else if (/NAK[İI]T|PEŞ[İI]N/.test(upperLine) && !line.includes('KARŞILIĞI')) {
      const num = extractNumberFromLine(line)
      if (num > result.nakit) result.nakit = num
    }
    
    // Kredi Kartı
    else if (/KRED[İI].*KART|K\..*KART|KART/.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > result.krediKarti) result.krediKarti = num
    }
    
    // Havale / EFT
    else if (/HAVALE|EFT|BANKA/.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > result.havale) result.havale = num
    }
    
    // Matrah
    else if (/MATRAH/.test(upperLine)) {
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
    
    // KDV
    else if (/KDV|VERG[İI]/.test(upperLine) && !upperLine.includes('MATRAH')) {
      if (/1\s*%/.test(upperLine) || /\b1\b/.test(upperLine)) {
        const num = extractNumberFromLine(line)
        if (num > result.kdv1) result.kdv1 = num
      } else if (/10\s*%/.test(upperLine) || /\b10\b/.test(upperLine)) {
        const num = extractNumberFromLine(line)
        if (num > result.kdv10) result.kdv10 = num
      } else if (/20\s*%/.test(upperLine) || /\b20\b/.test(upperLine)) {
        const num = extractNumberFromLine(line)
        if (num > result.kdv20) result.kdv20 = num
      }
    }
    
    // İade
    else if (/[İI]ADE/.test(upperLine)) {
      const num = extractNumberFromLine(line)
      if (num > result.iade) result.iade = num
    }
  })

  // Eğer toplam satış bulunamadıysa, KDV'li satışları topla
  if (result.toplamSatis === 0) {
    result.toplamSatis = result.satis1 + result.satis10 + result.satis20 + result.satis0
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

  if (clientType === 'company') {
    // Sirket - 1. Sinif Defter
    
    // 1. Nakit satislar
    if (zData.nakit > 0) {
      entries.push({
        tarih: zData.tarih,
        evrakNo: zData.evrakNo,
        aciklama: `Nakit satis - Z No: ${zData.evrakNo}`,
        borcHesap: '100',
        borcHesapAdi: 'Kasa',
        alacakHesap: '600',
        alacakHesapAdi: 'Yurtici Satislar',
        tutar: zData.nakit - (zData.nakit / toplamSatis * toplamKdv),
        kdvOrani: null
      })
      
      if (toplamKdv > 0) {
        entries.push({
          tarih: zData.tarih,
          evrakNo: zData.evrakNo,
          aciklama: `KDV - Z No: ${zData.evrakNo}`,
          borcHesap: '100',
          borcHesapAdi: 'Kasa',
          alacakHesap: '391',
          alacakHesapAdi: 'Hesaplanan KDV',
          tutar: zData.nakit / toplamSatis * toplamKdv,
          kdvOrani: null
        })
      }
    }

    // 2. Kredi karti satislar
    if (zData.krediKarti > 0) {
      entries.push({
        tarih: zData.tarih,
        evrakNo: zData.evrakNo,
        aciklama: `Kredi karti satis - Z No: ${zData.evrakNo}`,
        borcHesap: '101',
        borcHesapAdi: 'Alinan Cekler',
        alacakHesap: '600',
        alacakHesapAdi: 'Yurtici Satislar',
        tutar: zData.krediKarti - (zData.krediKarti / toplamSatis * toplamKdv),
        kdvOrani: null
      })
      
      if (toplamKdv > 0) {
        entries.push({
          tarih: zData.tarih,
          evrakNo: zData.evrakNo,
          aciklama: `KDV (KK) - Z No: ${zData.evrakNo}`,
          borcHesap: '101',
          borcHesapAdi: 'Alinan Cekler',
          alacakHesap: '391',
          alacakHesapAdi: 'Hesaplanan KDV',
          tutar: zData.krediKarti / toplamSatis * toplamKdv,
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
