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

export function getDriveFileId(urlOrPath) {
  const source = String(urlOrPath || '').trim()
  if (source.startsWith('drive:')) return /^[\w-]+$/.test(source.slice(6)) ? source.slice(6) : null
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
    const url = new URL(source, origin)
    if (url.origin !== origin || url.pathname !== '/api/drive-dosya') return null
    const id = url.searchParams.get('id') || ''
    return /^[\w-]+$/.test(id) ? id : null
  } catch {
    return null
  }
}

async function getDriveViewUrl(fileId, seconds) {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) return null
  const response = await fetch('/api/drive-dosya', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fileId, seconds }),
  })
  const result = await response.json().catch(() => ({}))
  return response.ok && result.ok ? result.url : null
}

/**
 * Public URL veya karisik girdiden storage yolunu cikarir.
 * Cikaramazsa null doner.
 */
export function toStoragePath(urlOrPath) {
  if (!urlOrPath || getDriveFileId(urlOrPath)) return null
  const s = String(urlOrPath).trim()
  if (!s) return null

  // Zaten yol ise
  if (!s.startsWith('http')) {
    return s.replace(/^\/+/, '').split('?')[0]
  }

  // .../object/public/<bucket>/<yol>  veya  .../object/sign/<bucket>/<yol>
  const m = s.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/)
  if (!m || m[1] !== BUCKET) return null

  const yol = m[2].split('?')[0]
  try {
    return decodeURIComponent(yol)
  } catch {
    return yol
  }
}

/** Verilen deger bizim bucket'imiza mi ait? */
export function isOwnStorageUrl(urlOrPath) {
  if (!urlOrPath || getDriveFileId(urlOrPath)) return false
  const s = String(urlOrPath).trim()
  if (!s || s.startsWith('//')) return false
  if (!/^[a-z][a-z\d+.-]*:/i.test(s)) return true
  try {
    const url = new URL(s)
    const origin = new URL(supabase.supabaseUrl).origin
    return url.origin === origin && !!url.pathname.match(new RegExp(`^/storage/v1/object/(?:public|sign|authenticated)/${BUCKET}/.+`))
  } catch {
    return false
  }
}

/**
 * Acilabilir (imzali) baglanti uretir.
 * Disaridaki bir adres verilirse aynen dondurur.
 */
export async function getViewUrl(urlOrPath, sure = VARSAYILAN_SURE) {
  if (!urlOrPath) return null
  const fileId = getDriveFileId(urlOrPath)
  if (fileId) return getDriveViewUrl(fileId, sure)

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

export async function fetchDocument(urlOrPath) {
  const source = String(urlOrPath || '')
  if (!source) throw new Error('Belge adresi bulunamadı')
  const fileId = getDriveFileId(source)
  const target = fileId ? await getDriveViewUrl(fileId, VARSAYILAN_SURE) : source
  if (!target) throw new Error('Belge bağlantısı oluşturulamadı; oturumunuzu ve erişim yetkinizi kontrol edin')
  let response = await fetch(target)
  if (!response.ok && [401, 403, 404].includes(response.status) && isOwnStorageUrl(source)) {
    const signedUrl = await getViewUrl(source)
    if (signedUrl) response = await fetch(signedUrl)
  }
  if (!response.ok) throw new Error(`Belgeye erişilemedi (HTTP ${response.status})`)
  return response
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

  const driveUrls = new Map(await Promise.all([...new Set(urlList.filter(u => getDriveFileId(u)))].map(async u => [u, await getViewUrl(u, sure)])))
  if (paths.length === 0) {
    return urlList.map(u => driveUrls.has(u) ? driveUrls.get(u) : u || null)
  }

  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, sure)
  const yolaGoreImza = new Map()
  ;(data || []).forEach(d => {
    if (d?.path && d?.signedUrl) yolaGoreImza.set(d.path, d.signedUrl)
  })

  return urlList.map(u => {
    if (!u) return null
    if (driveUrls.has(u)) return driveUrls.get(u)
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
  if (!urlOrPath) return false

  try {
    let data
    if (getDriveFileId(urlOrPath)) {
      data = await (await fetchDocument(urlOrPath)).blob()
    } else {
      if (!path) return false
      const result = await supabase.storage.from(BUCKET).download(path)
      if (result.error || !result.data) throw result.error || new Error('Dosya bulunamadi')
      data = result.data
    }

    const blobUrl = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = dosyaAdi || path?.split('/').pop() || 'belge.pdf'
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
