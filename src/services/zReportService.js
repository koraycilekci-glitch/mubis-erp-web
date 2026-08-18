import { supabase } from '../lib/supabase'

/**
 * Z Raporu resmini OCR ile okur ve ham metni dondurur
 * Su an mock implementasyon - gercek OCR entegrasyonu sonrasi eklenecek
 */
export async function performOCR(imageUrl) {
  // TODO: Google Vision API veya Tesseract.js entegrasyonu
  // Su anlik mock veri donduruyoruz
  
  // Gercek implementasyonda:
  // 1. Resmi base64'e cevir
  // 2. Google Vision API'ye gonder
  // 3. Metni dondur
  
  return {
    text: '',
    status: 'pending'
  }
}

/**
 * OCR metninden Z raporu verilerini parse eder
 */
export function parseZReportText(ocrText) {
  if (!ocrText) return null

  const lines = ocrText.split('\n').map(l => l.trim()).filter(Boolean)
  
  const result = {
    zNo: null,
    date: null,
    time: null,
    totalAmount: 0,
    totalKdv: 0,
    kdvMatrah: 0,
    cashAmount: 0,
    creditCardAmount: 0,
    otherAmount: 0,
    lines: []
  }

  // Z No bulma (ornek: Z0081, Z-1234, Z No: 1234)
  const zNoMatch = ocrText.match(/Z[-\s]?No[:\.]?\s*(\d+)/i) || 
                   ocrText.match(/Z\s*(\d{3,})/i)
  if (zNoMatch) result.zNo = zNoMatch[1]

  // Tarih bulma (ornek: 04.08.2026, 04/08/2026, 04-08-2026)
  const dateMatch = ocrText.match(/(\d{2})[\.\/\-](\d{2})[\.\/\-](\d{4})/)
  if (dateMatch) {
    result.date = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`
  }

  // Saat bulma (ornek: 14:30:15, 14:30)
  const timeMatch = ocrText.match(/(\d{2}):(\d{2}):(\d{2})/) || 
                    ocrText.match(/(\d{2}):(\d{2})/)
  if (timeMatch) {
    result.time = timeMatch[0]
  }

  // Tutar bulma - farkli formatlar
  // 1. Toplam / Genel Toplam / TOPLAM
  const totalPatterns = [
    /TOPLAM\s*[:\-]?\s*([\d.,]+)/i,
    /GENEL\s*TOPLAM\s*[:\-]?\s*([\d.,]+)/i,
    /Toplam\s*Tutar\s*[:\-]?\s*([\d.,]+)/i,
    /KDV\s*DAHIL\s*[:\-]?\s*([\d.,]+)/i,
  ]
  
  for (const pattern of totalPatterns) {
    const match = ocrText.match(pattern)
    if (match) {
      result.totalAmount = parseTurkishNumber(match[1])
      break
    }
  }

  // KDV Matrah
  const matrahPatterns = [
    /KDV\s*MATRAH[Iİ]\s*[:\-]?\s*([\d.,]+)/i,
    /Matrah\s*[:\-]?\s*([\d.,]+)/i,
    /KDV\s*HAR[Iİ][ÇC]\s*[:\-]?\s*([\d.,]+)/i,
  ]
  
  for (const pattern of matrahPatterns) {
    const match = ocrText.match(pattern)
    if (match) {
      result.kdvMatrah = parseTurkishNumber(match[1])
      break
    }
  }

  // KDV Tutari
  const kdvPatterns = [
    /KDV\s*[:\-]?\s*([\d.,]+)/i,
    /Toplam\s*KDV\s*[:\-]?\s*([\d.,]+)/i,
  ]
  
  for (const pattern of kdvPatterns) {
    const match = ocrText.match(pattern)
    if (match) {
      result.totalKdv = parseTurkishNumber(match[1])
      break
    }
  }

  // Eger KDV matrah bulunamadiysa toplamdan hesapla
  if (!result.kdvMatrah && result.totalAmount && result.totalKdv) {
    result.kdvMatrah = result.totalAmount - result.totalKdv
  }

  // Nakit
  const cashPatterns = [
    /NAK[Iİ]T\s*[:\-]?\s*([\d.,]+)/i,
    /Nakit\s*[:\-]?\s*([\d.,]+)/i,
    /Pe[sş]in\s*[:\-]?\s*([\d.,]+)/i,
  ]
  
  for (const pattern of cashPatterns) {
    const match = ocrText.match(pattern)
    if (match) {
      result.cashAmount = parseTurkishNumber(match[1])
      break
    }
  }

  // Kredi Karti
  const ccPatterns = [
    /KRED[Iİ]\s*KART[Iİ]\s*[:\-]?\s*([\d.,]+)/i,
    /Kredi\s*Kart[ıi]\s*[:\-]?\s*([\d.,]+)/i,
    /K\.\s*Kart\s*[:\-]?\s*([\d.,]+)/i,
  ]
  
  for (const pattern of ccPatterns) {
    const match = ocrText.match(pattern)
    if (match) {
      result.creditCardAmount = parseTurkishNumber(match[1])
      break
    }
  }

  // Diger odeme (verilen nakit, cek, senet vb.)
  const otherPatterns = [
    /VER[Iİ]LEN\s*NAK[Iİ]T\s*[:\-]?\s*([\d.,]+)/i,
    /[ÇC]EK\s*[:\-]?\s*([\d.,]+)/i,
    /SENET\s*[:\-]?\s*([\d.,]+)/i,
  ]
  
  for (const pattern of otherPatterns) {
    const match = ocrText.match(pattern)
    if (match) {
      result.otherAmount += parseTurkishNumber(match[1])
    }
  }

  // Satir bazli urunleri cikarma
  result.lines = parseZReportLines(lines)

  return result
}

/**
 * Z raporu satirlarini parse eder
 */
function parseZReportLines(lines) {
  const products = []
  
  // Urun satirlari icin pattern (ornek: "1 ADET URUN ADI 100,00 18% 18,00")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    
    // Miktar x Birim Fiyat = Toplam pattern
    const qtyPriceMatch = line.match(/(\d+)\s*[Xx]\s*([\d.,]+)\s*=\s*([\d.,]+)/)
    if (qtyPriceMatch) {
      products.push({
        quantity: parseTurkishNumber(qtyPriceMatch[1]),
        unitPrice: parseTurkishNumber(qtyPriceMatch[2]),
        totalPrice: parseTurkishNumber(qtyPriceMatch[3]),
        productName: lines[i - 1] || 'Urun'
      })
      continue
    }

    // Adet pattern
    const adetMatch = line.match(/(\d+)\s*[Aa]det\s+(.+?)\s+([\d.,]+)/)
    if (adetMatch) {
      products.push({
        quantity: parseTurkishNumber(adetMatch[1]),
        productName: adetMatch[2].trim(),
        totalPrice: parseTurkishNumber(adetMatch[3])
      })
    }
  }

  return products
}

/**
 * Turkce formattaki sayiyi parse eder
 * Ornek: "1.234,56" -> 1234.56
 *        "1234,56" -> 1234.56
 *        "1234.56" -> 1234.56
 */
function parseTurkishNumber(str) {
  if (!str) return 0
  
  // Once binlik ayiracini kaldir
  let cleaned = str.trim()
  
  // Eger hem nokta hem virgul varsa
  if (cleaned.includes('.') && cleaned.includes(',')) {
    // Son karakter virgulse ondalik ayiraci virguldur
    const lastDot = cleaned.lastIndexOf('.')
    const lastComma = cleaned.lastIndexOf(',')
    
    if (lastComma > lastDot) {
      // Virgul ondalik ayiraci
      cleaned = cleaned.replace(/\./g, '').replace(',', '.')
    } else {
      // Nokta ondalik ayiraci
      cleaned = cleaned.replace(/,/g, '')
    }
  } else if (cleaned.includes(',')) {
    // Sadece virgul var - muhtemelen ondalik ayiraci
    const parts = cleaned.split(',')
    if (parts.length === 2 && parts[1].length <= 2) {
      cleaned = cleaned.replace(',', '.')
    } else {
      // Binlik ayiraci
      cleaned = cleaned.replace(/,/g, '')
    }
  }
  
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

/**
 * Hesap planina gore muhasebe kaydi olusturur
 */
export function createAccountingEntry(clientType, zReportData, accountPlan) {
  const entries = []
  
  if (clientType === 'company') {
    // Sirket - 1. Sinif Defter
    // 100 Kasa / 120 Alıcılar / 600 Yurtici Satislar / 391 KDV
    
    if (zReportData.cashAmount > 0) {
      entries.push({
        debitAccount: '100',
        debitAccountName: 'Kasa',
        creditAccount: '600',
        creditAccountName: 'Yurtici Satislar',
        amount: zReportData.kdvMatrah || zReportData.cashAmount,
        description: `Nakit satis - Z No: ${zReportData.zNo}`
      })
      
      if (zReportData.totalKdv > 0) {
        entries.push({
          debitAccount: '100',
          debitAccountName: 'Kasa',
          creditAccount: '391',
          creditAccountName: 'Hesaplanan KDV',
          amount: zReportData.totalKdv,
          description: `KDV - Z No: ${zReportData.zNo}`
        })
      }
    }
    
    if (zReportData.creditCardAmount > 0) {
      entries.push({
        debitAccount: '101',
        debitAccountName: 'Alinan Cekler',
        creditAccount: '600',
        creditAccountName: 'Yurtici Satislar',
        amount: zReportData.kdvMatrah || zReportData.creditCardAmount,
        description: `Kredi karti satis - Z No: ${zReportData.zNo}`
      })
    }
  } else {
    // Isletme defteri - 1. Sinif Isletme
    // Basit usul / Gercek usul
    
    entries.push({
      debitAccount: '100',
      debitAccountName: 'Kasa',
      creditAccount: '600',
      creditAccountName: 'Satis Hasilati',
      amount: zReportData.totalAmount || 0,
      description: `Gunluk satis - Z No: ${zReportData.zNo}`
    })
  }
  
  return entries
}

/**
 * Z raporu kaydet ve OCR baslat
 */
export async function saveZReport(clientId, year, month, reportDate, imageUrl, fileName) {
  const { data, error } = await supabase
    .from('z_reports')
    .insert({
      client_id: clientId,
      year,
      month,
      report_date: reportDate,
      image_url: imageUrl,
      file_name: fileName,
      ocr_status: 'pending'
    })
    .select()
    .single()
  
  if (error) throw error
  return data
}

/**
 * Z raporu verilerini guncelle (OCR sonrasi)
 */
export async function updateZReportParsedData(reportId, parsedData) {
  const { error } = await supabase
    .from('z_reports')
    .update({
      ocr_text: parsedData.rawText,
      ocr_status: 'parsed',
      z_no: parsedData.zNo,
      total_amount: parsedData.totalAmount,
      total_kdv: parsedData.totalKdv,
      kdv_matrah: parsedData.kdvMatrah,
      cash_amount: parsedData.cashAmount,
      credit_card_amount: parsedData.creditCardAmount,
      other_amount: parsedData.otherAmount,
      parsed_data: parsedData
    })
    .eq('id', reportId)
  
  if (error) throw error
}

/**
 * Muhasebe kaydi olustur
 */
export async function createAccountingEntries(clientId, zReportId, entries) {
  const { error } = await supabase
    .from('accounting_entries')
    .insert(
      entries.map(e => ({
        client_id: clientId,
        z_report_id: zReportId,
        entry_date: new Date().toISOString().split('T')[0],
        description: e.description,
        debit_account: e.debitAccount,
        credit_account: e.creditAccount,
        amount: e.amount,
        source_type: 'z_report',
        status: 'draft'
      }))
    )
  
  if (error) throw error
}

/**
 * Z raporlarini getir
 */
export async function getZReports(clientId, year, month) {
  const { data, error } = await supabase
    .from('z_reports')
    .select(`
      *,
      z_report_lines(*),
      accounting_entries(*)
    `)
    .eq('client_id', clientId)
    .eq('year', year)
    .eq('month', month)
    .order('report_date', { ascending: false })
  
  if (error) throw error
  return data || []
}

/**
 * Z raporu sil
 */
export async function deleteZReport(reportId) {
  // Once iliskili kayitlari sil
  await supabase.from('z_report_lines').delete().eq('z_report_id', reportId)
  await supabase.from('accounting_entries').delete().eq('z_report_id', reportId)
  
  // Sonra raporu sil
  const { error } = await supabase
    .from('z_reports')
    .delete()
    .eq('id', reportId)
  
  if (error) throw error
}
