import { supabase } from '../lib/supabase'
import { uploadClientDocument } from './documentService'
import { getTahakkukList, getBeyanList, sumTahakkukTutar } from '../utils/tahakkukUtils'

/**
 * Ortak beyanname / tahakkuk evrakı servisi.
 * Tüm ekranlar (Aylık Beyan Takip, Müşteri Beyan Takip, Müşteri Portalı,
 * Toplu Yükleme vb.) `clients.beyan_durumlari` JSONB'sini tutarlı şekilde
 * okuyup yazar. Tekil `_url` alanları geriye uyumluluk için tutulur;
 * asıl kaynak `_beyanlar` / `_tahakkuklar` dizileridir.
 */

const DOCUMENT_KEYS = {
  beyanname: { single: '_beyan_url', list: '_beyanlar' },
  tahakkuk: { single: '_tahakkuk_url', list: '_tahakkuklar' },
  bordro: { single: '_bordro_url', list: '_bordrolar' },
}

export function getBaseKey(year, month, type) {
  return `${year}_${month}_${type}`
}

export function getBeyanDocumentKeys(year, month, type) {
  const base = getBaseKey(year, month, type)
  return {
    baseKey: base,
    statusKey: base,
    beyanUrlKey: `${base}_beyan_url`,
    tahakkukUrlKey: `${base}_tahakkuk_url`,
    bordroUrlKey: `${base}_bordro_url`,
    beyanlarKey: `${base}_beyanlar`,
    tahakkuklarKey: `${base}_tahakkuklar`,
    bordrolarKey: `${base}_bordrolar`,
  }
}

function versionedUrl(url) {
  if (!url) return url
  const base = url.split('?')[0]
  return `${base}?v=${Date.now()}`
}

/**
 * En güncel beyan_durumlari kaydını DB'den çeker.
 */
export async function fetchBeyanDurumlari(clientId) {
  const { data, error } = await supabase
    .from('clients')
    .select('beyan_durumlari')
    .eq('id', clientId)
    .single()
  if (error) throw error
  return data?.beyan_durumlari || {}
}

/**
 * Verilen dönem/tür için normalize edilmiş beyanname ve tahakkuk listesini döner.
 */
export function getBeyanDocuments(beyanDurumlari, year, month, type) {
  const baseKey = getBaseKey(year, month, type)
  return {
    beyannameList: getBeyanList(beyanDurumlari, baseKey),
    tahakkukList: getTahakkukList(beyanDurumlari, baseKey),
  }
}

/**
 * Tek bir evrak dosyası yükler ve hem tekli URL hem de çoklu liste alanlarına
 * tutarlı şekilde kaydeder.
 *
 * @param {Object} params
 * @param {Object} params.client - Müşteri nesnesi
 * @param {number} params.year - Ait olduğu yıl
 * @param {number} params.month - Ait olduğu ay (0-tabanlı)
 * @param {string} params.type - Beyan türü (kdv, kdv2, muhtasar, sgk ...)
 * @param {'beyanname'|'tahakkuk'|'bordro'} params.docType - Doküman türü
 * @param {File} params.file - Yüklenecek dosya
 * @param {string} [params.name] - Görünen isim (varsayılan file.name)
 * @returns {Promise<{url:string, name:string, list:Array, map:Object}>}
 */
export async function addBeyanDocument({ client, year, month, type, docType, file, name }) {
  if (!client || !client.id) throw new Error('Müşteri seçilmemiş')
  if (!['beyanname', 'tahakkuk', 'bordro'].includes(docType)) {
    throw new Error('Geçersiz doküman türü: ' + docType)
  }

  const { url } = await uploadClientDocument({
    client,
    year,
    month,
    beyanType: type,
    documentType: docType,
    file,
  })

  const vUrl = versionedUrl(url)
  const displayName = name || file.name || `${docType}.pdf`

  const keys = getBeyanDocumentKeys(year, month, type)
  const currentMap = await fetchBeyanDurumlari(client.id)
  const updatedMap = { ...currentMap }

  const { single, list } = DOCUMENT_KEYS[docType]
  const listKey = keys[list]
  const singleKey = keys[single]

  // Mevcut listeyi koru; çift kayıt oluşmasın
  const currentList = docType === 'beyanname'
    ? getBeyanList(currentMap, keys.baseKey)
    : docType === 'tahakkuk'
      ? getTahakkukList(currentMap, keys.baseKey)
      : (currentMap[listKey] || [])

  const newItem = {
    url: vUrl,
    name: displayName,
    uploadedAt: new Date().toISOString(),
  }

  if (docType === 'tahakkuk') {
    newItem.tutar = 0
    newItem.analiz_durumu = 'analiz_ediliyor'
  }

  updatedMap[listKey] = [...currentList, newItem]
  updatedMap[singleKey] = vUrl

  // Tahakkuk için toplam tutar alanını da güncelle (analiz sonrası yeniden hesaplanır)
  if (docType === 'tahakkuk') {
    updatedMap[`${keys.baseKey}_tutar`] = sumTahakkukTutar(updatedMap[listKey])
    updatedMap[`${keys.baseKey}_analiz_durumu`] = 'analiz_ediliyor'
  }

  const { error } = await supabase
    .from('clients')
    .update({ beyan_durumlari: updatedMap })
    .eq('id', client.id)
  if (error) throw error

  return { url: vUrl, name: displayName, list: updatedMap[listKey], map: updatedMap }
}

/**
 * Bir evrakı hem listeden hem tekil URL alanından siler.
 */
export async function removeBeyanDocument({ clientId, year, month, type, docType, url }) {
  if (!clientId) throw new Error('Müşteri seçilmemiş')
  if (!['beyanname', 'tahakkuk', 'bordro'].includes(docType)) {
    throw new Error('Geçersiz doküman türü: ' + docType)
  }

  const keys = getBeyanDocumentKeys(year, month, type)
  const currentMap = await fetchBeyanDurumlari(clientId)
  const updatedMap = { ...currentMap }

  const { single, list } = DOCUMENT_KEYS[docType]
  const listKey = keys[list]
  const singleKey = keys[single]

  const currentList = docType === 'beyanname'
    ? getBeyanList(currentMap, keys.baseKey)
    : docType === 'tahakkuk'
      ? getTahakkukList(currentMap, keys.baseKey)
      : (currentMap[listKey] || [])

  const filtered = currentList.filter(item => item.url !== url)
  updatedMap[listKey] = filtered

  if (filtered.length > 0) {
    updatedMap[singleKey] = filtered[filtered.length - 1].url
  } else {
    delete updatedMap[singleKey]
  }

  if (docType === 'tahakkuk') {
    updatedMap[`${keys.baseKey}_tutar`] = sumTahakkukTutar(filtered)
    if (filtered.length === 0) {
      delete updatedMap[`${keys.baseKey}_tutar`]
      delete updatedMap[`${keys.baseKey}_analiz_durumu`]
      delete updatedMap[`${keys.baseKey}_analiz_hata`]
      delete updatedMap[`${keys.baseKey}_analiz_url`]
      delete updatedMap[`${keys.baseKey}_vergi_turu`]
      delete updatedMap[`${keys.baseKey}_son_odeme`]
    }
  }

  const { error } = await supabase
    .from('clients')
    .update({ beyan_durumlari: updatedMap })
    .eq('id', clientId)
  if (error) throw error

  return updatedMap
}

/**
 * Çoklu evrak yüklemesi (toplu beyan yükleme) için de dizi + tekli URL
 * kaydı yapar.
 */
export async function addBeyanDocuments(items) {
  const results = []
  for (const item of items) {
    const res = await addBeyanDocument(item)
    results.push({ ...item, ...res })
  }
  return results
}

/**
 * Belirli bir dönem/türdeki evrak sayısını döner (UI rozetleri için).
 */
export function countBeyanDocuments(beyanDurumlari, year, month, type) {
  const { beyannameList, tahakkukList } = getBeyanDocuments(beyanDurumlari, year, month, type)
  return {
    beyanname: beyannameList.length,
    tahakkuk: tahakkukList.length,
  }
}
