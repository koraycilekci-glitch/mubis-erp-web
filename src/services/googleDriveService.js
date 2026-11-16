import { supabase } from '../lib/supabase'
import { fetchDocument } from '../utils/storageUrl'
export async function driveDokumIstegi(payload) {
  const { data, error } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (error || !token) throw new Error('Dökümleri okumak için oturum açın.')
  const response = await fetch('/api/drive-dokum', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90000)
  })
  if (!response.ok) {
    const result = await response.json().catch(() => null)
    throw new Error(result?.error || `Drive döküm okuma hatası (${response.status})`)
  }
  return payload.action === 'download' ? response.blob() : response.json()
}

const BELGE_TABLO = 'drive_belgeler'

// ---------------------------------------------------------------
// Dispatcher: /api/drive
// ---------------------------------------------------------------
async function driveApi(payload) {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) return { ok: false, error: 'Oturum bulunamadi' }

  const yanit = await fetch('/api/drive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload || {}),
  })
  const json = await yanit.json().catch(() => ({}))
  if (!yanit.ok || json?.ok === false) {
    return { ok: false, error: json?.error || `HTTP ${yanit.status}`, code: json?.code, status: yanit.status }
  }
  return json
}

// Ay / yon etiketleri: EDEFTER klasor duzeniyle ayni mantik
export const AYLAR_DRIVE = [
  'OCAK', 'SUBAT', 'MART', 'NISAN', 'MAYIS', 'HAZIRAN',
  'TEMMUZ', 'AGUSTOS', 'EYLUL', 'EKIM', 'KASIM', 'ARALIK',
]

// musteri / yil / ay / GELEN|GIDEN yolu uretir
export function driveYolOlustur({ musteriAdi, yil, ay, yon }) {
  const parcalar = []
  if (musteriAdi) parcalar.push(String(musteriAdi).replace(/[<>:"/\\|?*]/g, '_').trim())
  if (yil) parcalar.push(String(yil))
  const ayNo = Number(ay)
  if (ayNo >= 1 && ayNo <= 12) parcalar.push(AYLAR_DRIVE[ayNo - 1])
  if (yon) {
    const y = String(yon).toLocaleLowerCase('tr')
    if (y === 'alis' || y === 'gelen') parcalar.push('GELEN')
    else if (y === 'satis' || y === 'giden') parcalar.push('GIDEN')
  }
  return parcalar
}

// ---------------------------------------------------------------
// 1) Yukleme — dogrudan tarayicidan Google'a
// ---------------------------------------------------------------
/**
 * @param {Blob|File} dosya       Yuklenecek icerik
 * @param {string} ad             Dosya adi (uzanti dahil)
 * @param {object} secenekler     { clientId, belgeTuru, mimeType, yol, yil, ay, yon, musteriAdi }
 */
export async function uploadFileToDrive(dosya, ad, secenekler = {}) {
  let uploaded = false
  let fileId = ''
  try {
    const mimeType = String(secenekler.mimeType || dosya?.type || 'application/octet-stream').split(';')[0].trim().toLowerCase()
    const yol = Array.isArray(secenekler.yol) && secenekler.yol.length ? secenekler.yol : driveYolOlustur(secenekler)
    const session = await driveApi({ action: 'upload', name: ad || 'belge', size: dosya.size, mimeType, yol, clientId: secenekler.clientId ?? null, belgeTuru: secenekler.belgeTuru || 'genel' })
    if (!session.ok) return { success: false, error: session.error }
    uploaded = true
    const yanit = await fetch(session.uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: dosya })
    const metadata = await yanit.json().catch(() => ({}))
    if (!yanit.ok || !metadata.id) throw new Error('Drive yuklemesi dogrulanamadi; tekrar yuklemeden once baglantiyi kontrol edin')
    fileId = metadata.id
    let result
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        result = await driveApi({ action: 'register', fileId, ticket: session.ticket })
      } catch {
        result = { ok: false, error: 'Drive dosyasinin belge kaydi dogrulanamadi' }
      }
      if (result.ok || (result.status && result.status < 500)) break
    }
    if (!result?.ok) return { success: false, uploaded, drive_file_id: fileId, code: result?.code || 'DRIVE_REFERENCE_FAILED', error: result?.error || 'Drive belge kaydi yazilamadi' }
    return { success: true, drive_file_id: fileId, dosya_adi: result.fileName, boyut: result.size, web_view_link: result.url, indirme_link: result.url }
  } catch (error) {
    return { success: false, uploaded, drive_file_id: fileId, error: error?.message || 'Drive yukleme hatasi' }
  }
}

// ---------------------------------------------------------------
// 2) Indirme — dogrudan tarayicidan
// ---------------------------------------------------------------
export async function downloadFileFromDrive(fileId) {
  try {
    const yanit = await fetchDocument(`/api/drive-dosya?id=${encodeURIComponent(fileId)}`)
    if (!yanit.ok) {
      return { success: false, error: 'Drive indirme basarisiz: HTTP ' + yanit.status }
    }
    const blob = await yanit.blob()

    let kayit = null
    try {
      const { data } = await supabase
        .from(BELGE_TABLO)
        .select('*')
        .eq('drive_file_id', fileId)
        .maybeSingle()
      kayit = data || null
    } catch { /* yoksay */ }

    return {
      success: true,
      blob,
      dosya_adi: kayit?.dosya_adi || 'belge',
      mime_type: kayit?.mime_type || blob.type || 'application/octet-stream',
      drive_link: kayit?.drive_link || '',
      boyut: blob.size,
    }
  } catch (e) {
    console.error('downloadFileFromDrive hatasi:', e?.message || e)
    return { success: false, error: e?.message || 'Drive indirme hatasi' }
  }
}

// Tarayicida dosyayi indirir (kullanici bilgisayarina)
export async function driveDosyayiKaydet(fileId, varsayilanAd = 'belge') {
  const sonuc = await downloadFileFromDrive(fileId)
  if (!sonuc.success) return sonuc
  const url = URL.createObjectURL(sonuc.blob)
  const a = document.createElement('a')
  a.href = url
  a.download = sonuc.dosya_adi || varsayilanAd
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
  return sonuc
}

// ---------------------------------------------------------------
// 3) Arsivleme (soft delete) — sunucu uzerinden
// ---------------------------------------------------------------
export async function removeFileFromDrive(fileId) {
  return driveApi({ action: 'archive', fileId })
}

// ---------------------------------------------------------------
// 4) Listeleme
// ---------------------------------------------------------------
export async function listUserDocuments(secenekler = {}) {
  try {
    const { clientId, yil, ay, yon, belgeTuru, limit = 200 } = secenekler
    let q = supabase
      .from(BELGE_TABLO)
      .select('*')
      .eq('durum', 'aktif')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (clientId != null) q = q.eq('client_id', clientId)
    if (belgeTuru) q = q.eq('belge_turu', belgeTuru)
    if (yil || ay || yon) {
      const yol = driveYolOlustur({ yil, ay, yon })
      if (yol.length) q = q.like('yol', `%${yol.join('/')}%`)
    }

    const { data, error } = await q
    if (error) return { success: false, error: error.message, documents: [] }
    return { success: true, documents: data || [], total: (data || []).length }
  } catch (e) {
    return { success: false, error: e?.message || 'Listeleme hatasi', documents: [] }
  }
}

// ---------------------------------------------------------------
// 5) Baglanti testi
// ---------------------------------------------------------------
export async function testDriveConnection() {
  const sonuc = await driveApi({ action: 'test' })
  return sonuc.ok
    ? { success: true, ...sonuc, message: 'Google Drive baglantisi aktif' }
    : { success: false, error: sonuc.error }
}

// Drive kullanilabilir mi? Once onbellege bakar, yoksa tek API cagrisi yapar.
export async function driveHazirMi() {
  const result = await driveApi({ action: 'status' })
  return result.ok === true
}

// ---------------------------------------------------------------
// 7) Gider fisi yukleme — musteri/yil/ay/GIDER_FISLERI duzeni
// ---------------------------------------------------------------
export async function uploadExpenseToDrive(file, { clientId, yil, ay, musteriAdi } = {}) {
  // Musteri adi verilmediyse id ile klasorle
  const klasorAdi = musteriAdi || (clientId != null ? `Musteri_${clientId}` : 'Genel')
  const yol = [klasorAdi]
  if (yil) yol.push(String(yil))
  const ayNo = Number(ay)
  if (ayNo >= 1 && ayNo <= 12) yol.push(AYLAR_DRIVE[ayNo - 1])
  yol.push('GIDER_FISLERI')

  const ad = file?.name || `gider_${Date.now()}.jpg`
  return uploadFileToDrive(file, ad, {
    clientId: clientId ?? null,
    belgeTuru: 'gider_fisi',
    mimeType: file?.type || undefined,
    yol,
    yil,
    ay,
    musteriAdi,
  })
}

// ---------------------------------------------------------------
// 6) OAuth baglanti adresi (admin ayarlari icin)
// ---------------------------------------------------------------
export function driveBaglantiAdresi() {
  return '/api/drive-auth?action=start'
}
