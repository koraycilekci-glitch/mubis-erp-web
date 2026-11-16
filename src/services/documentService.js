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
import { uploadFileToDrive, driveHazirMi } from './googleDriveService'

const BUCKET_NAME = 'client-documents'

/**
 * Belgeyi ONCE Google Drive'a yuklemeyi dener.
 * Drive bagli degilse (ya da yukleme basarisizsa) null doner ve cagiran
 * fonksiyon eskisi gibi Supabase Storage'a yukler.
 *
 * Gecis stratejisi: Supabase Storage dosyalari SILINMEZ; Drive basarisiz
 * oldugunda sistem calismaya devam eder.
 */
async function driveYukleDene({ client, file, ad, belgeTuru = 'genel', yil = null, ay = null, yon = null }) {
  try {
    if (!(await driveHazirMi())) return null
    const musteriAdi = client?.shortName || client?.name || client?.company || `Musteri_${client?.id || ''}`
    const sonuc = await uploadFileToDrive(file, ad, {
      clientId: client?.id ?? null,
      belgeTuru,
      mimeType: file?.type || icerikTipiTahmin(ad),
      yil,
      ay,
      yon,
      musteriAdi,
    })
    if (!sonuc?.success && sonuc?.uploaded) {
      const error = new Error(sonuc.error || 'Drive dosyasinin kaydi tamamlanamadi')
      error.driveUploaded = true
      error.driveFileId = sonuc.drive_file_id
      throw error
    }
    return sonuc?.success ? sonuc : null
  } catch (e) {
    if (e.driveUploaded) throw e
    console.warn('Drive yukleme atlandi (Storage kullanilacak):', e?.message || e)
    return null
  }
}

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

  // 1) Google Drive (bagliysa) — belge Drive'da, referans Supabase'de
  const drive = await driveYukleDene({
    client,
    file,
    ad: path.split('/').pop(),
    belgeTuru: documentType === 'tahakkuk' ? 'tahakkuk' : 'beyanname',
    yil: year,
    ay: typeof month === 'number' ? month + 1 : null,
  })
  if (drive) {
    return {
      path: `drive:${drive.drive_file_id}`,
      url: `/api/drive-dosya?id=${drive.drive_file_id}`,
      drive_file_id: drive.drive_file_id,
      kaynak: 'drive',
    }
  }

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
  const path = getDocumentPath({ client, year, month, beyanType, documentType, prefix })
  const { data, error } = await supabase.storage.from(BUCKET_NAME).createSignedUrl(path, 60 * 60 * 24 * 7)
  if (error) return null
  return data?.signedUrl || null
}

/**
 * Müşteri klasörüne serbest yol ile dosya yükler (e-Fatura PDF/XML vb).
 * relPath ornek: 'faturalar/2026/giden_<uuid>.xml'
 */
// Uzantidan icerik tipi tahmini — file.type boşsa (JSZip'ten gelen dosyalar
// gibi) tarayici "octet-stream" dosyasini goruntulemek yerine INDIRIR ve bos
// koyu sekme acar. Dogru contentType ile yuklemek preview'in calismasini saglar.
const icerikTipiTahmin = (ad) => {
  const e = (/\.([a-z0-9]+)$/i.exec(String(ad || '')) || [])[1]?.toLowerCase()
  return ({
    html: 'text/html', htm: 'text/html',
    xml: 'application/xml',
    pdf: 'application/pdf',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    csv: 'text/csv',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp'
  })[e] || 'application/octet-stream'
}

export async function uploadClientFile({ client, relPath, file }) {
  const prefix = await getPrefix(client)
  const path = `${prefix}${getClientFolderName(client)}/${relPath}`

  // 1) Google Drive (bagliysa)
  const yilEslesme = /(20\d\d)/.exec(String(relPath || ''))
  const yonEslesme = /(gelen|giden|alis|satis)/i.exec(String(relPath || ''))
  const drive = await driveYukleDene({
    client,
    file,
    ad: String(file?.name || relPath).split('/').pop(),
    belgeTuru: 'fatura',
    yil: yilEslesme ? Number(yilEslesme[1]) : null,
    yon: yonEslesme ? yonEslesme[1].toLocaleLowerCase('tr') : null,
  })
  if (drive) {
    return {
      path: `drive:${drive.drive_file_id}`,
      url: `/api/drive-dosya?id=${drive.drive_file_id}`,
      drive_file_id: drive.drive_file_id,
      kaynak: 'drive',
    }
  }

  let lastError = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await supabase
      .storage
      .from(BUCKET_NAME)
      .upload(path, file, { upsert: true, contentType: file.type || icerikTipiTahmin(file.name || relPath) })

    if (!error) {
      const { data: publicUrlData } = supabase
        .storage
        .from(BUCKET_NAME)
        .getPublicUrl(path)
      return { path, url: publicUrlData?.publicUrl || '' }
    }

    lastError = error
    console.warn(`Storage upload denemesi ${attempt + 1} basarisiz:`, error.message || error)
    if (attempt === 0) await new Promise(r => setTimeout(r, 800))
  }
  throw lastError
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
 * Tahakkuk dosya adindan donem cikarir: { yil, ay } | null.
 * Ay adi (agustos_kdv.pdf, temmuz-beyanname.pdf), tarih (24082026),
 * yil-ay (2026-08) veya ay-yil (08.2026) kaliplari desteklenir.
 * Donem tespit edilemezse null doner (kesifte bu dosyalar atlanir —
 * yanlis aya yazilmasin).
 */
export function tahakkukDonemi(dosyaAdi) {
  const s = String(dosyaAdi || '')
    .toLocaleLowerCase('tr')
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
  // NOT: aylar 0-tabanlıdır (Ocak=0). Çağıranlar JS Date/month ile karşılaştırır.
  const aylar = { ocak: 0, subat: 1, mart: 2, nisan: 3, mayis: 4, haziran: 5, temmuz: 6, agustos: 7, eylul: 8, ekim: 9, kasim: 10, aralik: 11 }
  // Ay adı araması için alt çizgi/tire ayırıcıyı boşluğa çevir — aksi halde
  // \btemmuz\b, 'temmuz_sgk.pdf'te eşleşmez (_ kelime karakteridir)
  const ayAdiMetni = s.replace(/[_-]+/g, ' ')
  // 1) Türkçe ay adı
  for (const [ad, no] of Object.entries(aylar)) {
    if (new RegExp(`\\b${ad}\\b`).test(ayAdiMetni)) return { yil: null, ay: no }
  }
  // 2) İngilizce ay adı
  const en = { january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7, september: 8, sep: 8, october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11 }
  for (const [ad, no] of Object.entries(en)) {
    if (new RegExp(`\\b${ad}\\b`).test(ayAdiMetni)) return { yil: null, ay: no }
  }
  // 3) gün/ay/yıl → 24082026 veya 24.08.2026 (alt çizgi/tire de ayırıcı olabilir)
  let m = ayAdiMetni.match(/\b(\d{2})[._\s-]?(\d{2})[._\s-]?(20\d\d)\b/)
  if (m) {
    const gun = parseInt(m[1], 10), ay = parseInt(m[2], 10)
    if (gun >= 1 && gun <= 31 && ay >= 1 && ay <= 12) return { yil: parseInt(m[3], 10), ay: ay - 1 }
  }
  // 4) yıl-ay → 2026-08 / 2026_8 / 202608
  m = ayAdiMetni.match(/\b(20\d\d)[._\s-]?(\d{2})\b/)
  if (m) {
    const ay = parseInt(m[2], 10)
    if (ay >= 1 && ay <= 12) return { yil: parseInt(m[1], 10), ay: ay - 1 }
  }
  // 5) ay-yıl → 08.2026 / 8-2026
  m = ayAdiMetni.match(/\b(\d{1,2})[._\s-](20\d\d)\b/)
  if (m) {
    const ay = parseInt(m[1], 10)
    if (ay >= 1 && ay <= 12) return { yil: parseInt(m[2], 10), ay: ay - 1 }
  }
  return null
}

/**
 * Verilen yıl/ay/tür için müşteri klasöründeki TÜM tahakkuk PDF'lerini
 * tarar (birden fazla sicil/sigorta tahakkuku olabilir). Üç klasör
 * şablonu taranır:
 *   tahakkuklar/<yil>/<tur>/          (yardimci sorgu akisi)
 *   evraklar/<yil>/<tur>/             (admin/otomasyon toplu yukleme)
 *   mali_veriler/<tur>/<yil>/<ay>/    (admin dönemsel yukleme)
 * Dosya adindan donemi cikarilabilen ve sorgulanan donemle UYUSAN
 * dosyalar dondurulur — aksi halde agustos tahakkuku tum eski aylara
 * yazilirdi (yanlis donem goruntuleme + silince geri gelme).
 * Dönen her og: { path, url, name }
 */
export async function tahakkuklariKesfet(client, year, turSlug, month = null) {
  const prefix = await getPrefix(client)
  const folder = prefix + getClientFolderName(client)
  // Gecici vergi yalnizca admin panelinin dönem klasorunden (mali_veriler/.../period)
  // yuklenir; genel tahakkuklar/evraklar klasorleri taranmaz (429 onleme).
  const klasorler = turSlug === 'gecici_vergi'
    ? []
    : [
        `${folder}/tahakkuklar/${year}/${turSlug}/`,
        `${folder}/evraklar/${year}/${turSlug}/`
      ]
  // Dönem-bağımlı (month/period) klasörler: buradaki dosyaların dönemi
  // klasörden bellidir; dosya adı dönem içermese bile dahil edilir.
  const periodKlasorler = new Set()
  if (month != null) {
    if (turSlug !== 'gecici_vergi') {
      const mKlasor = `${folder}/mali_veriler/${turSlug}/${year}/${month}/`
      klasorler.push(mKlasor)
      periodKlasorler.add(mKlasor)
    }
    // Gecici vergi admin panelinde 1-4 donem olarak yuklenir; portal tarafinda
    // filingMonth 1/4/7/10'dur. Her iki klasor adini da tara.
    if (turSlug === 'gecici_vergi') {
      const periodMap = { 4: 1, 7: 2, 10: 3, 1: 4 }
      const period = periodMap[month]
      if (period != null) {
        const pKlasor = `${folder}/mali_veriler/${turSlug}/${year}/${period}/`
        klasorler.push(pKlasor)
        periodKlasorler.add(pKlasor)
      }
      // Yedek: portal ayi ile de dene (bazi eski yuklemeler ay klasorune yapilmis olabilir)
      const mKlasor = `${folder}/mali_veriler/${turSlug}/${year}/${month}/`
      klasorler.push(mKlasor)
      periodKlasorler.add(mKlasor)
    }
  }
  const sonuc = []
  let anyListSucceeded = false
  for (const k of klasorler) {
    const { data, error } = await supabase
      .storage
      .from(BUCKET_NAME)
      .list(k, { limit: 100 })
    if (error || !data) continue
    anyListSucceeded = true
    const periodSpecific = periodKlasorler.has(k)
    for (const o of data) {
      if (!o.id || !/\.pdf$/i.test(o.name)) continue
    // Beyanname/mizan dosyalarini tahakkuk olarak ekleme
    if (/beyan|mizan/i.test(o.name)) continue
      const donem = tahakkukDonemi(o.name)
      // Genel klasorlerde donem tespit edilemeyen dosyalar atlanir (yanlis aya yazilmasin).
      if (!donem && !periodSpecific) continue
      // Dönem tespit edildiyse sorgulanan dönemle uyuşmalı.
      if (donem) {
        if (month != null && donem.ay !== month) continue
        if (donem.yil && donem.yil !== year) continue
      }
      const path = k + o.name
      if (sonuc.some(s => s.path === path)) continue
      const { data: pub } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path)
      sonuc.push({ path, url: pub?.publicUrl || '', name: o.name, uploadedAt: o.created_at || '' })
    }
    await new Promise(r => setTimeout(r, 150))
  }
  return { files: sonuc, hadError: !anyListSucceeded }
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

  // 1) Google Drive (bagliysa)
  const drive = await driveYukleDene({
    client,
    file,
    ad: fileName,
    belgeTuru: category === 'tahakkuk' ? 'tahakkuk' : 'beyanname',
    yil: year || null,
    ay: typeof month === 'number' ? month + 1 : null,
  })
  if (drive) {
    return {
      path: `drive:${drive.drive_file_id}`,
      url: `/api/drive-dosya?id=${drive.drive_file_id}`,
      drive_file_id: drive.drive_file_id,
      kaynak: 'drive',
      name: name || file.name,
      category,
      size: formatFileSize(file.size),
      uploaded_at: new Date().toISOString(),
      fileType: ext === '.xlsx' ? 'excel' : 'pdf',
    }
  }

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
  // 1) Google Drive (bagliysa)
  const yilEslesme = /(20\d\d)/.exec(String(path || ''))
  const drive = await driveYukleDene({
    client,
    file,
    ad: String(file?.name || path.split('/').pop()),
    belgeTuru: 'genel',
    yil: yilEslesme ? Number(yilEslesme[1]) : null,
  })
  if (drive) {
    return {
      path: `drive:${drive.drive_file_id}`,
      url: `/api/drive-dosya?id=${drive.drive_file_id}`,
      drive_file_id: drive.drive_file_id,
      kaynak: 'drive',
      name: file.name,
      size: formatFileSize(file.size),
      uploaded_at: new Date().toISOString(),
    }
  }

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

// Odemeye ozel makbuz yukleme (odeme satirindan eklenir/guncellenir)
export async function uploadPaymentMakbuz({ client, paymentId, file }) {
  const folder = (await getPrefix(client)) + getClientFolderName(client)
  const path = `${folder}/makbuzlar/odeme_${paymentId}_${Date.now()}.pdf`
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

