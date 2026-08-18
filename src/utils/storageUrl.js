import { supabase } from '../lib/supabase'

/**
 * Storage baglanti yardimcilari.
 *
 * client-documents bucket'i artik PRIVATE'tir. Veritabaninda saklanan
 * eski public URL'ler dogrudan acilmaz; acilmadan once imzali (signed)
 * baglantiya cevrilmeleri gerekir.
 *
 * Bu modul her iki bicimi de kabul eder:
 *   - https://xxx.supabase.co/storage/v1/object/public/client-documents/<yol>
 *   - <yol>  (dogrudan storage yolu)
 */

const BUCKET = 'client-documents'

// Varsayilan gecerlilik: 1 saat
const VARSAYILAN_SURE = 60 * 60
// Disari gonderilen (WhatsApp / e-posta) baglantilar icin: 30 gun
export const PAYLASIM_SURESI = 60 * 60 * 24 * 30

/**
 * Public URL veya karisik girdiden storage yolunu cikarir.
 * Cikaramazsa null doner.
 */
export function toStoragePath(urlOrPath) {
  if (!urlOrPath) return null
  const s = String(urlOrPath).trim()
  if (!s) return null

  // Zaten yol ise
  if (!s.startsWith('http')) {
    return s.replace(/^\/+/, '').split('?')[0]
  }

  // .../object/public/<bucket>/<yol>  veya  .../object/sign/<bucket>/<yol>
  const m = s.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/)
  if (!m) return null

  const yol = m[2].split('?')[0]
  try {
    return decodeURIComponent(yol)
  } catch {
    return yol
  }
}

/** Verilen deger bizim bucket'imiza mi ait? */
export function isOwnStorageUrl(urlOrPath) {
  if (!urlOrPath) return false
  const s = String(urlOrPath)
  if (!s.startsWith('http')) return true
  return s.includes(`/storage/v1/object/`) && s.includes(`/${BUCKET}/`)
}

/**
 * Acilabilir (imzali) baglanti uretir.
 * Disaridaki bir adres verilirse aynen dondurur.
 */
export async function getViewUrl(urlOrPath, sure = VARSAYILAN_SURE) {
  if (!urlOrPath) return null

  // Bizim bucket'imiza ait degilse dokunma
  if (!isOwnStorageUrl(urlOrPath)) return String(urlOrPath)

  const path = toStoragePath(urlOrPath)
  if (!path) return String(urlOrPath)

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, sure)
  if (error || !data?.signedUrl) {
    console.warn('Imzali baglanti uretilemedi:', path, error?.message || '')
    return null
  }
  return data.signedUrl
}

/** Birden fazla baglantiyi tek seferde imzalar */
export async function getViewUrls(urlList, sure = VARSAYILAN_SURE) {
  const paths = []
  const eslesme = new Map()

  urlList.forEach(u => {
    if (!u || !isOwnStorageUrl(u)) return
    const p = toStoragePath(u)
    if (p) { paths.push(p); eslesme.set(u, p) }
  })

  if (paths.length === 0) {
    return urlList.map(u => u || null)
  }

  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, sure)
  const yolaGoreImza = new Map()
  ;(data || []).forEach(d => {
    if (d?.path && d?.signedUrl) yolaGoreImza.set(d.path, d.signedUrl)
  })

  return urlList.map(u => {
    if (!u) return null
    if (!isOwnStorageUrl(u)) return String(u)
    const p = eslesme.get(u)
    return (p && yolaGoreImza.get(p)) || null
  })
}

/**
 * Belgeyi yeni sekmede acar.
 * Popup engellemesini asmak icin once sekme acilir, sonra adres yazilir.
 */
export async function openDocument(urlOrPath, sure = VARSAYILAN_SURE) {
  const sekme = window.open('', '_blank')
  try {
    const url = await getViewUrl(urlOrPath, sure)
    if (!url) {
      if (sekme) sekme.close()
      alert('Belge acilamadi. Dosya silinmis veya erisim yetkiniz yok olabilir.')
      return false
    }
    if (sekme) sekme.location.href = url
    else window.open(url, '_blank')
    return true
  } catch (e) {
    if (sekme) sekme.close()
    console.error('Belge acma hatasi:', e)
    return false
  }
}

/** Belgeyi indirir (dosya adi verilebilir) */
export async function downloadDocument(urlOrPath, dosyaAdi) {
  const path = toStoragePath(urlOrPath)
  if (!path) return false

  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(path)
    if (error || !data) throw error || new Error('Dosya bulunamadi')

    const blobUrl = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = dosyaAdi || path.split('/').pop() || 'belge.pdf'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2000)
    return true
  } catch (e) {
    console.error('Belge indirme hatasi:', e)
    // Son care: imzali baglanti ile ac
    return openDocument(urlOrPath)
  }
}

/**
 * WhatsApp / e-posta ile paylasilacak uzun omurlu baglanti.
 */
export async function getShareUrl(urlOrPath) {
  return getViewUrl(urlOrPath, PAYLASIM_SURESI)
}
