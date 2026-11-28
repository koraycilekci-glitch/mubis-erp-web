import Tesseract from 'tesseract.js'
import { giderVergiVeOdemeOku } from '../utils/belgeTarama.js'

/**
 * Gider fisi resminden OCR ile veri cikarma
 */
export async function processExpenseImage(imageUrl) {
  try {
    const result = await Tesseract.recognize(
      imageUrl,
      'tur',
      {
        logger: m => {
          if (m.status === 'recognizing text') {
            console.log(`OCR Progress: ${(m.progress * 100).toFixed(1)}%`)
          }
        }
      }
    )

    const rawText = result.data.text
    const parsed = parseExpenseText(rawText)

    return {
      rawText,
      parsed,
      confidence: result.data.confidence
    }
  } catch (error) {
    console.error('OCR hatasi:', error)
    throw new Error('Gider fisi okunamadi: ' + error.message)
  }
}

/**
 * OCR metninden gider fisi verilerini parse etme
 */
function parseExpenseText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l)
  
  const okunan = giderVergiVeOdemeOku(lines, parseTurkishNumber)
  const parsed = {
    tarih: extractDate(text),
    fisNo: extractFisNo(text),
    toplam: extractTotal(text),
    kdv: okunan.toplamKdv ?? (okunan.kdvDetaylari.length > 0 ? okunan.kdvDetaylari.reduce((sum, row) => sum + row.kdv, 0) : extractKDV(text)),
    kdvOran: okunan.kdvDetaylari.length === 1 ? okunan.kdvDetaylari[0].oran : null,
    kdvDetaylari: okunan.kdvDetaylari,
    nakit: okunan.nakit,
    krediKarti: okunan.krediKarti,
    kategori: detectCategory(text),
    satici: extractSeller(text),
    aciklama: lines.slice(0, 3).join(' ')
  }

  return parsed
}

function extractDate(text) {
  // Tarih formatlari: 01.01.2024, 01/01/2024, 01-01-2024
  const patterns = [
    /(\d{2})[./-](\d{2})[./-](\d{4})/,
    /(\d{2})[./-](\d{2})[./-](\d{2})/,
    /(\d{4})[./-](\d{2})[./-](\d{2})/
  ]
  
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const [_, d, m, y] = match
      if (y.length === 4) {
        return `${y}-${m}-${d}`
      } else {
        const year = parseInt(y) > 50 ? `19${y}` : `20${y}`
        return `${year}-${m}-${d}`
      }
    }
  }
  return new Date().toISOString().split('T')[0]
}

function extractFisNo(text) {
  const patterns = [
    /fi[sş]\s*no[.:\s]*(\w+)/i,
    /belge\s*no[.:\s]*(\w+)/i,
    /no[.:\s]*(\d{4,})/i,
    /(\d{4,})/
  ]
  
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match[1]
  }
  return ''
}

function extractTotal(text) {
  const patterns = [
    /toplam[.:\s]*([\d.,]+)/i,
    /toplam\s*tutar[.:\s]*([\d.,]+)/i,
    /genel\s*toplam[.:\s]*([\d.,]+)/i,
    /tutar[.:\s]*([\d.,]+)/i,
    /([\d.,]+)\s*TL/i,
    /([\d.,]+)\s*TRY/i
  ]
  
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      return parseTurkishNumber(match[1])
    }
  }
  return 0
}

function extractKDV(text) {
  const patterns = [
    /kdv[.:\s]*([\d.,]+)/i,
    /kdv\s*tutar[.:\s]*([\d.,]+)/i,
    /vergi[.:\s]*([\d.,]+)/i
  ]
  
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      return parseTurkishNumber(match[1])
    }
  }
  return 0
}

function detectCategory(text) {
  const lowerText = text.toLowerCase()
  
  const categories = {
    yakit: ['yakit', 'benzin', 'mazot', 'dizel', 'lpg', 'akaryakit', 'petrol'],
    yemek: ['yemek', 'restoran', 'lokanta', 'cafe', 'kafe', 'fast food', 'gida'],
    kirtasiye: ['kirtasiye', 'kitap', 'defter', 'kalem', 'ofis', 'yazici', 'toner'],
    elektrik: ['elektrik', 'enerji', 'aydinlatma'],
    su: ['su', 'iski', 'sular'],
    dogalgaz: ['dogalgaz', 'gaz', 'isitma'],
    kira: ['kira', 'kiralama', 'emlak', 'gayrimenkul'],
    telefon: ['telefon', 'iletisim', 'turkcell', 'vodafone', 'ttnet'],
    internet: ['internet', 'adsl', 'fiber', 'wifi', 'broadband'],
    ulasim: ['ulasim', 'taksi', 'otobus', 'metro', 'arac', 'otopark', 'yol'],
    bakim: ['bakim', 'onarim', 'tamir', 'servis', 'teknik'],
    reklam: ['reklam', 'tanitim', 'marketing', 'pazarlama', 'sponsorluk'],
    sigorta: ['sigorta', 'police', 'prim'],
    vergi: ['vergi', 'resim', 'harç', 'harç'],
    diger: []
  }
  
  for (const [category, keywords] of Object.entries(categories)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        return category
      }
    }
  }
  
  return 'diger'
}

function extractSeller(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l)
  
  // Genellikle ilk satir satici adi olur
  if (lines.length > 0) {
    const firstLine = lines[0]
    if (firstLine.length > 3 && !firstLine.match(/^\d+$/)) {
      return firstLine
    }
  }
  
  return ''
}

function parseTurkishNumber(str) {
  if (!str) return 0
  
  // Turkce format: 1.234,56 veya 1234,56 veya 1,234.56
  let cleaned = str.trim()
  
  // Eger hem nokta hem virgul varsa
  if (cleaned.includes('.') && cleaned.includes(',')) {
    // Son karakter virgul ise Turkce format
    const lastDot = cleaned.lastIndexOf('.')
    const lastComma = cleaned.lastIndexOf(',')
    
    if (lastComma > lastDot) {
      // 1.234,56 formati
      cleaned = cleaned.replace(/\./g, '').replace(',', '.')
    } else {
      // 1,234.56 formati
      cleaned = cleaned.replace(/,/g, '')
    }
  } else if (cleaned.includes(',')) {
    // Sadece virgul varsa, bu ondalik ayraci olabilir
    const parts = cleaned.split(',')
    if (parts.length === 2 && parts[1].length <= 2) {
      // 1234,56 veya 12,34
      cleaned = cleaned.replace(',', '.')
    } else {
      // 1,234,567
      cleaned = cleaned.replace(/,/g, '')
    }
  }
  
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

/**
 * Gider fisi verisini muhasebe kaydina donusturme
 */
export function convertToAccountingEntry(clientType, parsedData) {
  const entries = []
  
  if (clientType === 'company') {
    // Sirketler icin 1. sinif defter kaydi
    entries.push({
      hesap_kodu: getAccountCode(parsedData.kategori),
      borc: parsedData.toplam - parsedData.kdv,
      alacak: 0,
      aciklama: `${parsedData.satici} - ${parsedData.aciklama}`
    })
    
    if (parsedData.kdv > 0) {
      entries.push({
        hesap_kodu: '191',
        borc: parsedData.kdv,
        alacak: 0,
        aciklama: 'Indirilecek KDV'
      })
    }
    
    entries.push({
      hesap_kodu: '100',
      borc: 0,
      alacak: parsedData.toplam,
      aciklama: 'Nakit odeme'
    })
  } else {
    // Isletmeler icin basit kayit
    entries.push({
      hesap_kodu: getAccountCode(parsedData.kategori),
      borc: parsedData.toplam,
      alacak: 0,
      aciklama: `${parsedData.satici} - ${parsedData.aciklama}`
    })
    
    entries.push({
      hesap_kodu: '100',
      borc: 0,
      alacak: parsedData.toplam,
      aciklama: 'Nakit odeme'
    })
  }
  
  return entries
}

function getAccountCode(category) {
  const codes = {
    yakit: '770',
    yemek: '769',
    kirtasiye: '760',
    elektrik: '770',
    su: '770',
    dogalgaz: '770',
    kira: '770',
    telefon: '760',
    internet: '760',
    ulasim: '770',
    bakim: '770',
    reklam: '780',
    sigorta: '780',
    vergi: '360',
    diger: '770'
  }
  
  return codes[category] || '770'
}
