export const createTahakkukDocumentMetadata = ({
  documentType = 'tahakkuk',
  name,
  fileName,
  url,
  storagePath,
  uploadedAt = new Date().toISOString(),
  ...metadata
} = {}) => ({
  ...metadata,
  documentType,
  label: documentType,
  name: name || fileName || getDocumentTypeLabel(documentType),
  fileName: fileName || name || '',
  url: url || '',
  storagePath: storagePath || '',
  uploadedAt,
})

export const normalizeClientDocument = (document, fallbackType = 'tahakkuk') =>
  typeof document === 'string'
    ? { url: document, documentType: fallbackType, label: fallbackType }
    : { ...document, documentType: document.documentType || document.type || fallbackType }

export const getClientDocumentTypeLabel = (documentType) => documentType || 'Evrak'

import { supabase } from '../lib/supabase'
import { officePrefix, getMyOfficeId } from './officeService'

const BUCKET_NAME = 'client-documents'

/**
 * Ofis klasor onegi.
 * Ana ofis (id=1) mevcut dosya yollarini bozmamak icin onek KULLANMAZ.
 * Diger ofisler 'ofis_<id>/' onegi alir.
 *
 * Musteri kaydinda office_id varsa oradan, yoksa oturumdan okunur.
 */
async function getPrefix(client) {
  const id = client?.office_id || client?.officeId
  if (id) return officePrefix(id)
  try {
    return officePrefix(await getMyOfficeId())
  } catch {
    return ''
  }
}

function slugify(text) {
  if (!text) return ''
  const map = {
    'ç': 'c', 'ğ': 'g', 'ı': 'i', 'i': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
    'Ç': 'C', 'Ğ': 'G', 'I': 'I', 'İ': 'I', 'Ö': 'O', 'Ş': 'S', 'Ü': 'U'
  }
  return String(text)
    .split('')
    .map(c => map[c] || c)
    .join('')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function getClientFolderName(client) {
  const identifier = client?.vkn || client?.tc || client?.taxNo || 'bilinmeyen'
  const name = slugify(client?.name || client?.company || 'musteri')
  return `${identifier}_${name}`
}

function getDocumentPath({ client, year, beyanType, month, documentType, prefix = '' }) {
  const folder = getClientFolderName(client)
  const typeFolder = documentType === 'tahakkuk' ? 'tahakkuklar' : 'beyannameler'
  const monthName = slugify(getMonthName(month))
  const safeBeyanType = slugify(beyanType)
  const fileName = `${monthName}_${safeBeyanType}.pdf`
  return `${prefix}${folder}/${typeFolder}/${year}/${safeBeyanType}/${fileName}`
}

function getMonthName(monthIndex) {
  const months = ['Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran', 'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik']
  return months[monthIndex] || 'Bilinmeyen'
}

/**
 * Müşteriye ait beyanname/tahakkuk dosyasını Storage'a yükler.
 * Gecici hatalara (token yenileme, ag sorunu) karsi otomatik tekrar dener.
 */
export async function uploadClientDocument({
  client,
  year,
  month,
  beyanType,
  documentType,
  file
}) {
  const prefix = await getPrefix(client)
  const path = getDocumentPath({ client, year, beyanType, month, documentType, prefix })

  let lastError = null

  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await supabase
      .storage
      .from(BUCKET_NAME)
      .upload(path, file, { upsert: true, contentType: file.type || 'application/pdf' })

    if (!error) {
      const { data: publicUrlData } = supabase
        .storage
        .from(BUCKET_NAME)
        .getPublicUrl(path)

      return {
        path,
        url: publicUrlData?.publicUrl || ''
      }
    }

    lastError = error
    console.warn(`Storage upload denemesi ${attempt + 1} basarisiz:`, error.message || error)

    if (attempt === 0) {
      await new Promise(r => setTimeout(r, 800))
    }
  }

  throw lastError
}

/**
 * Müşteriye ait belirli bir belge URL'sini döndürür.
 */
export async function getClientDocumentUrl({ client, year, month, beyanType, documentType }) {
  const prefix = await getPrefix(client)
  const path = getDocumentPath({ client, year, beyanType, month, documentType, prefix })
  const { data, error } = await supabase.storage.from(BUCKET_NAME).createSignedUrl(path, 60 * 60 * 24 * 7)
  if (error) return null
  return data?.signedUrl || null
}

/**
 * Müşterinin tüm beyanname/tahakkuk dosyalarını listeler.
 */
export async function listClientDocuments(client) {
  const prefix = await getPrefix(client)
  const folder = prefix + getClientFolderName(client)
  const { data, error } = await supabase
    .storage
    .from(BUCKET_NAME)
    .list(folder, { limit: 1000 })

  if (error) throw error
  return data || []
}

/**
 * SGK gibi toplu evrak yuklemeleri icin kullanilir.
 */
export async function uploadClientBulkDocument({
  client,
  year,
  month,
  beyanType,
  category,
  file,
  name
}) {
  const folder = (await getPrefix(client)) + getClientFolderName(client)
  const safeBeyanType = slugify(beyanType)
  const safeCategory = slugify(category)
  const safeName = slugify(name || file.name.replace(/\.(pdf|xlsx|xls)$/i, ''))
  const ext = file.name.match(/\.(xlsx|xls)$/i) ? '.xlsx' : '.pdf'
  // Benzersiz dosya adi: ayni isimli birden fazla tahakkuk yuklendiginde
  // birbirini ezmesin (or. tahakkukfis.pdf, tahakkukfis(1).pdf)
  const fileName = `${safeCategory}_${safeName}_${Date.now()}${ext}`
  const path = `${folder}/evraklar/${year}/${safeBeyanType}/${fileName}`

  const { data, error } = await supabase
    .storage
    .from(BUCKET_NAME)
    .upload(path, file, { upsert: true, contentType: file.type || 'application/pdf' })

  if (error) throw error

  const { data: publicUrlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path)

  return {
    path,
    url: publicUrlData?.publicUrl || '',
    name: name || file.name,
    category,
    size: formatFileSize(file.size),
    uploaded_at: new Date().toISOString(),
    fileType: ext === '.xlsx' ? 'excel' : 'pdf'
  }
}

function formatFileSize(bytes) {
  if (!bytes) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

async function uploadGenericDocument(client, path, file) {
  const { data, error } = await supabase
    .storage
    .from(BUCKET_NAME)
    .upload(path, file, { upsert: true, contentType: file.type || 'application/pdf' })

  if (error) throw error

  const { data: publicUrlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path)

  return {
    path,
    url: publicUrlData?.publicUrl || '',
    name: file.name,
    size: formatFileSize(file.size),
    uploaded_at: new Date().toISOString()
  }
}

/**
 * Gelir/Kurumlar vergisi beyanname/tahakkuk/mizan yukleme
 */
export async function uploadGelirBeyanDocument({ client, year, documentType, file }) {
  const folder = (await getPrefix(client)) + getClientFolderName(client)
  const safeDocType = slugify(documentType)
  const ext = file.name.match(/\.(xlsx|xls)$/i) ? '.xlsx' : '.pdf'
  const path = `${folder}/mali_veriler/gelir_beyani/${year}/${safeDocType}${ext}`
  return uploadGenericDocument(client, path, file)
}

/**
 * Gecici vergi donem belgesi yukleme
 */
export async function uploadGeciciVergiDocument({ client, year, period, documentType, file }) {
  const folder = (await getPrefix(client)) + getClientFolderName(client)
  const safeDocType = slugify(documentType)
  const ext = file.name.match(/\.(xlsx|xls)$/i) ? '.xlsx' : '.pdf'
  const path = `${folder}/mali_veriler/gecici_vergi/${year}/${period}/${safeDocType}${ext}`
  return uploadGenericDocument(client, path, file)
}

/**
 * Vergi levhasi yukleme
 */
export async function uploadVergiLevhasi({ client, file }) {
  const folder = (await getPrefix(client)) + getClientFolderName(client)
  const path = `${folder}/mali_veriler/vergi_levhasi/vergi_levhasi.pdf`
  return uploadGenericDocument(client, path, file)
}

/**
 * Mali evrak (imza beyani, gazete vb.) yukleme
 */
export async function uploadMaliEvrak({ client, category, name, file }) {
  const folder = (await getPrefix(client)) + getClientFolderName(client)
  const safeCategory = slugify(category)
  const safeName = slugify(name || file.name.replace(/\.pdf$/i, ''))
  const path = `${folder}/mali_evraklar/${safeCategory}/${safeName}.pdf`
  return uploadGenericDocument(client, path, file)
}

/**
 * Genel dosya yukleme (admin icin)
 */
export async function uploadAdminDocument({ client, folderPath, file }) {
  const folder = (await getPrefix(client)) + getClientFolderName(client)
  const safePath = folderPath.split('/').map(slugify).join('/')
  const safeName = slugify(file.name.replace(/\.pdf$/i, ''))
  const path = `${folder}/${safePath}/${safeName}.pdf`
  return uploadGenericDocument(client, path, file)
}

/**
 * Serbest meslek makbuzu yukleme (musteri "Faturalarim" bolumunde gorur)
 */
export async function uploadMakbuz({ client, name, file }) {
  const folder = (await getPrefix(client)) + getClientFolderName(client)
  const safeName = slugify(name || file.name.replace(/\.pdf$/i, ''))
  const path = `${folder}/makbuzlar/${safeName}_${Date.now()}.pdf`
  return uploadGenericDocument(client, path, file)
}

/**
 * Beyan durum JSONB'sinde dosya URL'lerini saklamak icin key olusturur.
 */
export function getBeyanDocumentKeys(year, month, beyanType) {
  const key = `${year}_${month}_${beyanType}`
  return {
    statusKey: key,
    beyanUrlKey: `${key}_beyan_url`,
    tahakkukUrlKey: `${key}_tahakkuk_url`
  }
}

/**
 * Toplu beyanname/tahakkuk yukleme. Her dosya icin Storage'a yukler ve
 * clients.beyan_durumlari JSONB'sine URL kaydi yapar.
 */
export async function uploadBulkBeyanDocuments(items) {
  const results = []

  for (const item of items) {
    const { client, year, month, beyanType, documentType, file } = item
    if (!client || !client.id) throw new Error('Musteri secilmemis')
    if (!year || month === undefined || !beyanType || !documentType) {
      throw new Error('Yil, ay, beyan turu ve dokuman turu zorunlu')
    }

    // 1. Storage'a yukle
    const { path, url } = await uploadClientDocument({
      client,
      year,
      month,
      beyanType,
      documentType,
      file
    })

    // 2. Mevcut beyan_durumlari verisini cek
    const { data: clientData, error: fetchError } = await supabase
      .from('clients')
      .select('beyan_durumlari')
      .eq('id', client.id)
      .single()

    if (fetchError) throw fetchError

    const durumlar = clientData?.beyan_durumlari || {}
    const { beyanUrlKey, tahakkukUrlKey } = getBeyanDocumentKeys(year, month, beyanType)

    const updatedMap = { ...durumlar }
    if (documentType === 'beyanname') {
      updatedMap[beyanUrlKey] = url
    } else if (documentType === 'tahakkuk') {
      updatedMap[tahakkukUrlKey] = url
    }

    // 3. clients tablosunu guncelle
    const { error: updateError } = await supabase
      .from('clients')
      .update({ beyan_durumlari: updatedMap })
      .eq('id', client.id)

    if (updateError) throw updateError

    results.push({
      clientId: client.id,
      clientName: client.name || client.company || 'Musteri',
      year,
      month,
      beyanType,
      documentType,
      path,
      url
    })
  }

  return results
}

/**
 * Ise Giris / Isten Cikis Bildirgesi belgesini AI ile okutur.
 * fileUrl: Supabase Storage'a yuklenmis belgenin herkese acik URL'i
 * bildirgeTipi: 'ise_giris' | 'isten_cikis'
 * Donen JSON: { success, tc_kimlik, ad_soyad, dogum_tarihi, ise_giris_tarihi|isten_cikis_tarihi }
 */
export async function analyzePersonnelDocument({ fileUrl, bildirgeTipi }) {
  const response = await fetch('/api/analyze-personnel-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileUrl, bildirgeTipi })
  })
  const result = await response.json()
  if (!result.success) {
    throw new Error(result.error || 'Belge okunamadı.')
  }
  return result
}

