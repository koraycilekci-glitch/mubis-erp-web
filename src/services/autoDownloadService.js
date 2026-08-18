/**
 * Otomatik Beyanname ve Belge Indirme Servisi
 * 
 * Bu servis:
 * 1. GİB (Gelir İdaresi Baskanligi) - Beyanname ve tahakkuklari indir
 * 2. e-SGK - Sigorta hizmet listesi ve tahakkuklari indir
 * 3. Indirilen belgeleri musteri hesabina otomatik yukle
 * 
 * NOT: Bu servis bir proxy/sunucu uygulamasi ile calisir.
 * Proxy, tarayici otomasyonu (Puppeteer/Playwright) kullanarak
 * portallara giris yapar ve belgeleri indirir.
 */

import { supabase } from '../lib/supabase'

const PROXY_URL = 'http://localhost:4789'

/**
 * Indirme gorevi olustur
 */
export async function createDownloadTask(clientId, taskType, params = {}) {
  const { data, error } = await supabase
    .from('download_tasks')
    .insert({
      client_id: clientId,
      task_type: taskType,
      status: 'pending',
      params,
      created_at: new Date().toISOString()
    })
    .select()
    .single()
  
  if (error) throw error
  return data
}

/**
 * Indirme gorevlerini listele
 */
export async function getDownloadTasks(clientId, limit = 50) {
  const { data, error } = await supabase
    .from('download_tasks')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit)
  
  if (error) throw error
  return data || []
}

/**
 * GİB'den beyanname indir
 * 
 * @param {Object} credentials - GİB giris bilgileri
 * @param {string} credentials.username - Kullanici adi (VKN/TCKN)
 * @param {string} credentials.password - Sifre
 * @param {string} beyanType - Beyanname turu (kdv, muhtasar, gecici_vergi, vb.)
 * @param {string} period - Donem (YYYY-AA)
 */
export async function downloadGIBBeyanname(credentials, beyanType, period) {
  try {
    const response = await fetch(`${PROXY_URL}/api/gib/download-beyanname`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credentials,
        beyanType,
        period
      })
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const result = await response.json()
    return result
  } catch (error) {
    console.error('GİB beyanname indirme hatasi:', error)
    throw error
  }
}

/**
 * GİB'den tahakkuk indir
 * 
 * @param {Object} credentials - GİB giris bilgileri
 * @param {string} credentials.username - Kullanici adi (VKN/TCKN)
 * @param {string} credentials.password - Sifre
 * @param {string} tahakkukType - Tahakkuk turu
 * @param {string} period - Donem (YYYY-AA)
 */
export async function downloadGIBTahakkuk(credentials, tahakkukType, period) {
  try {
    const response = await fetch(`${PROXY_URL}/api/gib/download-tahakkuk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credentials,
        tahakkukType,
        period
      })
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const result = await response.json()
    return result
  } catch (error) {
    console.error('GİB tahakkuk indirme hatasi:', error)
    throw error
  }
}

/**
 * e-SGK'dan sigorta hizmet listesi indir
 * 
 * @param {Object} credentials - SGK giris bilgileri
 * @param {string} credentials.username - Kullanici adi
 * @param {string} credentials.isyeriKodu - Isyeri kodu
 * @param {string} credentials.sistemSifre - Sistem sifresi
 * @param {string} credentials.isyeriSifre - Isyeri sifresi
 * @param {string} period - Donem (YYYY-AA)
 */
export async function downloadSGKHizmetListesi(credentials, period) {
  try {
    const response = await fetch(`${PROXY_URL}/api/sgk/download-hizmet-listesi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credentials,
        period
      })
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const result = await response.json()
    return result
  } catch (error) {
    console.error('SGK hizmet listesi indirme hatasi:', error)
    throw error
  }
}

/**
 * e-SGK'dan sigorta tahakkuku indir
 * 
 * @param {Object} credentials - SGK giris bilgileri
 * @param {string} period - Donem (YYYY-AA)
 */
export async function downloadSGKTahakkuk(credentials, period) {
  try {
    const response = await fetch(`${PROXY_URL}/api/sgk/download-tahakkuk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credentials,
        period
      })
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const result = await response.json()
    return result
  } catch (error) {
    console.error('SGK tahakkuk indirme hatasi:', error)
    throw error
  }
}

/**
 * Indirilen belgeyi musteri hesabina yukle
 * 
 * @param {number} clientId - Musteri ID
 * @param {string} docType - Belge turu (beyanname, tahakkuk, hizmet_listesi, sigorta_tahakkuk)
 * @param {string} fileUrl - Indirilen dosya URL'i
 * @param {Object} metadata - Belge metadata'si
 */
export async function uploadDocumentToClient(clientId, docType, fileUrl, metadata = {}) {
  try {
    // Dosyayi indir
    const response = await fetch(fileUrl)
    const blob = await response.blob()
    
    // Dosya adini olustur
    const fileName = `${docType}_${metadata.period || new Date().toISOString().split('T')[0]}.pdf`
    const filePath = `${clientId}/${docType}/${metadata.year || new Date().getFullYear()}/${fileName}`
    
    // Supabase Storage'a yukle
    const { error: uploadError } = await supabase.storage
      .from('client-documents')
      .upload(filePath, blob, {
        contentType: 'application/pdf',
        upsert: true
      })
    
    if (uploadError) throw uploadError
    
    // Public URL al
    const { data: urlData } = supabase.storage
      .from('client-documents')
      .getPublicUrl(filePath)
    
    // Veritabanina kaydet
    const { data: doc, error: dbError } = await supabase
      .from('client_documents')
      .insert({
        client_id: clientId,
        document_type: docType,
        file_name: fileName,
        file_path: filePath,
        public_url: urlData.publicUrl,
        year: metadata.year || new Date().getFullYear(),
        month: metadata.month || new Date().getMonth(),
        period: metadata.period,
        status: 'active',
        metadata
      })
      .select()
      .single()
    
    if (dbError) throw dbError
    
    return doc
  } catch (error) {
    console.error('Belge yukleme hatasi:', error)
    throw error
  }
}

/**
 * Toplu indirme gorevi baslat
 * 
 * @param {number} clientId - Musteri ID
 * @param {Array} tasks - Indirme gorevleri listesi
 */
export async function startBulkDownload(clientId, tasks) {
  const results = []
  
  for (const task of tasks) {
    try {
      let downloadResult
      
      switch (task.source) {
        case 'gib':
          if (task.docType === 'beyanname') {
            downloadResult = await downloadGIBBeyanname(task.credentials, task.beyanType, task.period)
          } else if (task.docType === 'tahakkuk') {
            downloadResult = await downloadGIBTahakkuk(task.credentials, task.tahakkukType, task.period)
          }
          break
        case 'sgk':
          if (task.docType === 'hizmet_listesi') {
            downloadResult = await downloadSGKHizmetListesi(task.credentials, task.period)
          } else if (task.docType === 'tahakkuk') {
            downloadResult = await downloadSGKTahakkuk(task.credentials, task.period)
          }
          break
        default:
          throw new Error(`Bilinmeyen kaynak: ${task.source}`)
      }
      
      if (downloadResult.success && downloadResult.fileUrl) {
        // Belgeyi musteri hesabina yukle
        const uploadedDoc = await uploadDocumentToClient(clientId, task.docType, downloadResult.fileUrl, {
          year: task.year,
          month: task.month,
          period: task.period,
          source: task.source,
          originalFileName: downloadResult.fileName
        })
        
        results.push({
          task,
          success: true,
          document: uploadedDoc
        })
      } else {
        results.push({
          task,
          success: false,
          error: downloadResult.error || 'Indirme basarisiz'
        })
      }
    } catch (error) {
      results.push({
        task,
        success: false,
        error: error.message
      })
    }
  }
  
  return results
}

/**
 * Musterinin tum aktif beyannamelerini otomatik indir
 * 
 * @param {Object} client - Musteri bilgileri
 * @param {number} year - Yil
 * @param {number} month - Ay
 */
export async function autoDownloadClientDocuments(client, year, month) {
  const tasks = []
  const period = `${year}-${String(month + 1).padStart(2, '0')}`
  
  // GİB beyannameleri
  if (client.dvsUsername && client.dvsPassword) {
    const gibCredentials = {
      username: client.dvsUsername,
      password: client.dvsPassword
    }
    
    // KDV Beyannamesi
    tasks.push({
      source: 'gib',
      docType: 'beyanname',
      beyanType: 'kdv',
      credentials: gibCredentials,
      period,
      year,
      month
    })
    
    // Muhtasar Beyannamesi
    tasks.push({
      source: 'gib',
      docType: 'beyanname',
      beyanType: 'muhtasar',
      credentials: gibCredentials,
      period,
      year,
      month
    })
    
    // Geçici Vergi Beyannamesi (3 aylık)
    if ([2, 5, 8, 11].includes(month)) {
      tasks.push({
        source: 'gib',
        docType: 'beyanname',
        beyanType: 'gecici_vergi',
        credentials: gibCredentials,
        period,
        year,
        month
      })
    }
  }
  
  // SGK belgeleri
  if (client.sgkUser && client.sgkSistemSifre) {
    const sgkCredentials = {
      username: client.sgkUser,
      isyeriKodu: client.sgkIsyeriKodu,
      sistemSifre: client.sgkSistemSifre,
      isyeriSifre: client.sgkIsyeriSifre
    }
    
    // Sigorta Hizmet Listesi
    tasks.push({
      source: 'sgk',
      docType: 'hizmet_listesi',
      credentials: sgkCredentials,
      period,
      year,
      month
    })
    
    // Sigorta Tahakkuku
    tasks.push({
      source: 'sgk',
      docType: 'tahakkuk',
      credentials: sgkCredentials,
      period,
      year,
      month
    })
  }
  
  // Toplu indirme baslat
  if (tasks.length > 0) {
    return await startBulkDownload(client.id, tasks)
  }
  
  return []
}

/**
 * Indirme gorevinin durumunu kontrol et
 */
export async function checkDownloadStatus(taskId) {
  const { data, error } = await supabase
    .from('download_tasks')
    .select('*')
    .eq('id', taskId)
    .single()
  
  if (error) throw error
  return data
}

/**
 * Indirme gorevini iptal et
 */
export async function cancelDownloadTask(taskId) {
  const { error } = await supabase
    .from('download_tasks')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', taskId)
  
  if (error) throw error
  return true
}
