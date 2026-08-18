/**
 * Tahakkuk PDF'lerinden tutar okuma servisi
 * 
 * Bu servis:
 * 1. Tahakkuk PDF'lerini indir
 * 2. PDF'ten toplam tutari OCR veya parsing ile oku
 * 3. Okunan tutari beyanname durumuna kaydet
 */

import { supabase } from '../lib/supabase'
import Tesseract from 'tesseract.js'

import { analyzeDocument } from './documentIntelligenceEngine'

/**
 * Tahakkuk PDF'inden tutar oku
 * @param {string} pdfUrl - PDF dosya URL'i
 * @returns {Promise<number>} - Okunan toplam tutar
 */
export async function extractAmountFromTahakkukPDF(pdfUrl) {
  try {
    // Sunucu tarafinda AI ile analiz dene
    console.log('Tahakkuk AI analiz basladi...')
    const aiResult = await analyzeDocument(pdfUrl)
    
    if (aiResult && aiResult.success && aiResult.amount > 0) {
      console.log('AI tahakkuk tutari bulundu:', aiResult.amount)
      return aiResult.amount
    }
    
    // AI basarisiz olursa, PDF'ten text cikarmayi dene
    const response = await fetch(pdfUrl)
    const blob = await response.blob()
    const text = await extractTextFromPDF(blob)
    const amount = parseAmountFromText(text)
    
    if (amount > 0) {
      return amount
    }
    
    // Text cikaramadiysa, OCR dene
    console.log('PDF text okunamadi, OCR deneniyor...')
    const ocrAmount = await extractAmountWithOCR(blob)
    return ocrAmount
    
  } catch (error) {
    console.error('Tahakkuk PDF okuma hatasi:', error)
    return 0
  }
}

/**
 * OCR ile tutar oku
 * @param {Blob} blob - PDF blob
 * @returns {Promise<number>} - Okunan tutar
 */
async function extractAmountWithOCR(blob) {
  try {
    // Blob'u File'a cevir
    const file = new File([blob], 'tahakkuk.pdf', { type: 'application/pdf' })
    
    // OCR ile text oku
    const result = await Tesseract.recognize(
      file,
      'tur',
      {
        logger: m => console.log(m)
      }
    )
    
    const text = result.data.text
    console.log('OCR Text:', text)
    
    // Text'ten tutar parse et
    const amount = parseAmountFromText(text)
    return amount
    
  } catch (error) {
    console.error('OCR hatasi:', error)
    return 0
  }
}

/**
 * PDF'ten text cikar (basit implementasyon)
 * Gercek uygulamada pdf-lib veya pdf-parse kullanilabilir
 */
async function extractTextFromPDF(blob) {
  try {
    const arrayBuffer = await blob.arrayBuffer()
    
    // PDF text cikarma (gelistirilmis)
    const text = new TextDecoder('utf-8').decode(arrayBuffer)
    const cleanText = text.replace(/[^\x20-\x7E\xC0-\xFF\s]/g, ' ')
    
    // Eger text bos veya cok kisa ise, PDF binary formatindadir
    if (cleanText.length < 100) {
      const binaryText = new TextDecoder('latin1').decode(arrayBuffer)
      return binaryText.replace(/[^\x20-\x7E\xC0-\xFF\s]/g, ' ')
    }
    
    return cleanText
  } catch (error) {
    console.error('PDF text cikarma hatasi:', error)
    return ''
  }
}

/**
 * Text'ten tutar parse et
 * @param {string} text - PDF'ten cikarilan text
 * @returns {number} - Toplam tutar
 */
function parseAmountFromText(text) {
  if (!text || text.length < 10) return 0
  
  // Tahakkuk PDF'lerinde yaygin tutar formatlari:
  const patterns = [
    // Vergi tahakkuk fişi formatları
    /TOPLAM\s*TUTAR[\s:]*([\d.]+,\d{2})/i,
    /YATIRILMASI\s*GEREKEN\s*TUTAR[\s:]*([\d.]+,\d{2})/i,
    /ODENECEK\s*TUTAR[\s:]*([\d.]+,\d{2})/i,
    /TAHAKKUK\s*TUTARI[\s:]*([\d.]+,\d{2})/i,
    /VERGI\s*TUTARI[\s:]*([\d.]+,\d{2})/i,
    /TUTAR[\s:]*([\d.]+,\d{2})/i,
    /TOPLAM[\s:]*([\d.]+,\d{2})/i,
    
    // İngilizce formatlar
    /TOTAL\s*AMOUNT[\s:]*([\d,]+\.\d{2})/i,
    /AMOUNT[\s:]*([\d,]+\.\d{2})/i,
    
    // Genel tutar arama - TL ile biten
    /(\d{1,3}(?:\.\d{3})+,\d{2})\s*TL/i,
    /(\d{1,3}(?:,\d{3})+\.\d{2})\s*TL/i,
    
    // Sadece sayı formatları
    /(\d{1,3}(?:\.\d{3})+,\d{2})/,
    /(\d+,\d{2})/
  ]
  
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const amountStr = match[1]
      const amount = parseTurkishAmount(amountStr)
      if (amount > 0) return amount
    }
  }
  
  // Son çare: En büyük tutarı bul
  const allAmounts = text.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) || []
  let maxAmount = 0
  for (const amountStr of allAmounts) {
    const amount = parseTurkishAmount(amountStr)
    if (amount > maxAmount) maxAmount = amount
  }
  
  return maxAmount
}

/**
 * Turkce tutar formatini parse et
 * @param {string} amountStr - Tutar string'i (ornek: "1.234,56" veya "1234,56")
 * @returns {number} - Parse edilmis tutar
 */
function parseTurkishAmount(amountStr) {
  if (!amountStr) return 0
  
  let cleaned = amountStr.trim()
  
  // Binlik ayiraci nokta, ondalik ayiraci virgul
  // Ornek: 1.234,56 -> 1234.56
  if (cleaned.includes('.') && cleaned.includes(',')) {
    const lastDot = cleaned.lastIndexOf('.')
    const lastComma = cleaned.lastIndexOf(',')
    
    if (lastComma > lastDot) {
      // Turkce format: 1.234,56
      cleaned = cleaned.replace(/\./g, '').replace(',', '.')
    } else {
      // Ingilizce format: 1,234.56
      cleaned = cleaned.replace(/,/g, '')
    }
  } else if (cleaned.includes(',')) {
    // Sadece virgul varsa
    const parts = cleaned.split(',')
    if (parts.length === 2 && parts[1].length <= 2) {
      // Ondalik ayiraci: 1234,56
      cleaned = cleaned.replace(',', '.')
    } else {
      // Binlik ayiraci: 1,234,567
      cleaned = cleaned.replace(/,/g, '')
    }
  }
  
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

/**
 * Tahakkuk tutarini beyanname durumuna kaydet
 * @param {number} clientId - Musteri ID
 * @param {string} year - Yil
 * @param {string} month - Ay
 * @param {string} beyanType - Beyanname turu
 * @param {number} amount - Tahakkuk tutari
 */
export async function saveTahakkukAmount(clientId, year, month, beyanType, amount) {
  try {
    const { data: client, error: fetchError } = await supabase
      .from('clients')
      .select('beyan_durumlari')
      .eq('id', clientId)
      .single()
    
    if (fetchError) throw fetchError
    
    const durumlari = client.beyan_durumlari || {}
    const statusKey = `${year}_${month}_${beyanType}`
    
    // Tahakkuk tutarini kaydet
    durumlari[`${statusKey}_tutar`] = amount
    durumlari[`${statusKey}_tutar_tarih`] = new Date().toISOString()
    
    // Eger tahakkuk gonderildiyse durumu guncelle
    if (amount > 0 && durumlari[statusKey] === 'onaylandi') {
      durumlari[statusKey] = 'tahakkuk_gonderildi'
    }
    
    const { error: updateError } = await supabase
      .from('clients')
      .update({ beyan_durumlari: durumlari })
      .eq('id', clientId)
    
    if (updateError) throw updateError
    
    return true
  } catch (error) {
    console.error('Tahakkuk tutari kaydetme hatasi:', error)
    throw error
  }
}

/**
 * Tahakkuk tutarini getir
 * @param {number} clientId - Musteri ID
 * @param {string} year - Yil
 * @param {string} month - Ay
 * @param {string} beyanType - Beyanname turu
 * @returns {Promise<number>} - Tahakkuk tutari
 */
export async function getTahakkukAmount(clientId, year, month, beyanType) {
  try {
    const { data: client, error } = await supabase
      .from('clients')
      .select('beyan_durumlari')
      .eq('id', clientId)
      .single()
    
    if (error) throw error
    
    const durumlari = client.beyan_durumlari || {}
    const statusKey = `${year}_${month}_${beyanType}`
    
    return durumlari[`${statusKey}_tutar`] || 0
  } catch (error) {
    console.error('Tahakkuk tutari getirme hatasi:', error)
    return 0
  }
}

/**
 * Tahakkuk PDF'ni yukle ve tutari oku
 * @param {number} clientId - Musteri ID
 * @param {string} year - Yil
 * @param {string} month - Ay
 * @param {string} beyanType - Beyanname turu
 * @param {File} pdfFile - Yuklenen PDF dosyasi
 */
export async function uploadAndExtractTahakkuk(clientId, year, month, beyanType, pdfFile) {
  try {
    // PDF'i Storage'a yukle
    const fileName = `tahakkuk_${year}_${month}_${beyanType}_${Date.now()}.pdf`
    const filePath = `${clientId}/tahakkuklar/${year}/${fileName}`
    
    const { error: uploadError } = await supabase.storage
      .from('client-documents')
      .upload(filePath, pdfFile, {
        contentType: 'application/pdf',
        upsert: true
      })
    
    if (uploadError) throw uploadError
    
    // Public URL al
    const { data: urlData } = supabase.storage
      .from('client-documents')
      .getPublicUrl(filePath)
    
    // PDF'ten tutari oku
    const amount = await extractAmountFromTahakkukPDF(urlData.publicUrl)
    
    // Tutari kaydet
    await saveTahakkukAmount(clientId, year, month, beyanType, amount)
    
    // Tahakkuk belgesini veritabanina kaydet
    await supabase
      .from('client_documents')
      .insert({
        client_id: clientId,
        document_type: 'tahakkuk',
        file_name: fileName,
        file_path: filePath,
        public_url: urlData.publicUrl,
        year: parseInt(year),
        month: parseInt(month),
        period: `${year}-${String(parseInt(month) + 1).padStart(2, '0')}`,
        amount: amount,
        status: 'active',
        metadata: {
          beyan_type: beyanType,
          source: 'manual_upload'
        }
      })
    
    return {
      success: true,
      amount,
      fileUrl: urlData.publicUrl
    }
  } catch (error) {
    console.error('Tahakkuk yukleme hatasi:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Toplu tahakkuk yukleme
 * @param {number} clientId - Musteri ID
 * @param {Array} files - Yuklenecek dosyalar listesi
 */
export async function bulkUploadTahakkuklar(clientId, files) {
  const results = []
  
  for (const file of files) {
    try {
      // Dosya adindan yil, ay ve beyanname turunu cikar
      // Ornek: "2025_01_kdv_tahakkuk.pdf"
      const fileName = file.name.toLowerCase()
      const match = fileName.match(/(\d{4})_(\d{2})_(\w+)/)
      
      if (match) {
        const year = match[1]
        const month = parseInt(match[2]) - 1 // 0-based
        const beyanType = match[3]
        
        const result = await uploadAndExtractTahakkuk(clientId, year, month, beyanType, file)
        results.push({
          file: file.name,
          ...result
        })
      } else {
        results.push({
          file: file.name,
          success: false,
          error: 'Dosya adi formati uygun degil. Ornek: 2025_01_kdv_tahakkuk.pdf'
        })
      }
    } catch (error) {
      results.push({
        file: file.name,
        success: false,
        error: error.message
      })
    }
  }
  
  return results
}

/**
 * Tahakkuk tutarlarini manuel guncelle
 * @param {number} clientId - Musteri ID
 * @param {string} year - Yil
 * @param {string} month - Ay
 * @param {string} beyanType - Beyanname turu
 * @param {number} amount - Yeni tutar
 */
export async function updateTahakkukAmountManual(clientId, year, month, beyanType, amount) {
  try {
    await saveTahakkukAmount(clientId, year, month, beyanType, amount)
    
    // Log kaydet
    await supabase
      .from('tahakkuk_logs')
      .insert({
        client_id: clientId,
        year: parseInt(year),
        month: parseInt(month),
        beyan_type: beyanType,
        amount: amount,
        action: 'manual_update',
        created_at: new Date().toISOString()
      })
    
    return true
  } catch (error) {
    console.error('Tahakkuk tutari guncelleme hatasi:', error)
    throw error
  }
}
