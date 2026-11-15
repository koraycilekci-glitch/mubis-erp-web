// src/services/googleDriveService.js
// Google Drive istemci servisi (tarayıcı tarafı).
//
// Akis:
//   1) /api/drive -> kisa omurlu access token (oturum dogrulanir)
//   2) Yukleme/indirme dogrudan tarayicidan Google Drive REST v3'e gider
//      (Vercel 4.5MB govde limiti boylece asilmaz)
//   3) Dosya referanslari Supabase "drive_belgeler" tablosunda tutulur.
//
// Onemli: googleapis Node paketi KULLANILMAZ — tarayici build'inde yer almaz.

import { supabase } from '../lib/supabase'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
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
    return { ok: false, error: json?.error || `HTTP ${yanit.status}` }
  }
  return json
}

// Access token onbellegi (sunucudan ~55 dk gecerli gelir)
let tokenOnbellek = { token: '', kokKlasorId: '', bitis: 0 }

export async function driveTokenAl(zorla = false) {
  const simdi = Date.now()
  if (!zorla && tokenOnbellek.token && tokenOnbellek.bitis > simdi) return tokenOnbellek

  const sonuc = await driveApi({ action: 'token' })
  if (!sonuc.ok) return { token: '', kokKlasorId: '', bitis: 0, error: sonuc.error }

  tokenOnbellek = {
    token: sonuc.token,
    kokKlasorId: sonuc.kokKlasorId || '',
    bitis: simdi + Math.max(60, (sonuc.expires_in || 3300) - 120) * 1000,
  }
  return tokenOnbellek
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` }
}

// ---------------------------------------------------------------
// Klasor yardimcilari
// ---------------------------------------------------------------
export async function driveKlasorHazirla(yol = []) {
  const sonuc = await driveApi({ action: 'folder', yol })
  return sonuc.ok ? { ok: true, klasorId: sonuc.klasorId, kokKlasorId: sonuc.kokKlasorId } : sonuc
}

async function klasorBulVeyaOlustur(token, ad, parentId) {
  const guvenli = String(ad || '').replace(/'/g, "\\'")
  const q = [
    `name = '${guvenli}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(' and ')

  const ara = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`,
    { headers: authHeaders(token) }
  )
  const araJson = await ara.json().catch(() => ({}))
  if (ara.ok && araJson?.files?.[0]?.id) return araJson.files[0].id

  const olustur = await fetch(`${DRIVE_API}/files?fields=id`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: String(ad || 'klasor'),
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    }),
  })
  const json = await olustur.json().catch(() => ({}))
  if (!olustur.ok || !json.id) {
    throw new Error('Klasor olusturulamadi: ' + (json?.error?.message || `HTTP ${olustur.status}`))
  }
  return json.id
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
  try {
    const bilgi = await driveTokenAl()
    if (!bilgi.token) return { success: false, error: bilgi.error || 'Drive token alinamadi' }

    const mimeType = secenekler.mimeType || dosya?.type || 'application/octet-stream'
    const yol = Array.isArray(secenekler.yol) && secenekler.yol.length
      ? secenekler.yol
      : driveYolOlustur(secenekler)

    // Hedef klasoru hazirla (kok altinda)
    let parentId = bilgi.kokKlasorId
    for (const parca of yol) {
      if (!parca) continue
      parentId = await klasorBulVeyaOlustur(bilgi.token, parca, parentId)
    }

    const metadata = { name: String(ad || 'belge'), parents: parentId ? [parentId] : undefined }
    const sinir = 'mubis_' + Math.random().toString(36).slice(2)
    const govde = new Blob(
      [
        `--${sinir}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
        JSON.stringify(metadata),
        `\r\n--${sinir}\r\nContent-Type: ${mimeType}\r\n\r\n`,
        dosya,
        `\r\n--${sinir}--`,
      ],
      { type: `multipart/related; boundary=${sinir}` }
    )

    const yanit = await fetch(
      `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,webContentLink,sha1,createdTime`,
      { method: 'POST', headers: authHeaders(bilgi.token), body: govde }
    )
    const json = await yanit.json().catch(() => ({}))
    if (!yanit.ok || !json.id) {
      return { success: false, error: 'Drive yukleme basarisiz: ' + (json?.error?.message || `HTTP ${yanit.status}`) }
    }

    // Supabase referansi (dosya adi + Drive kimligi)
    try {
      await supabase.from(BELGE_TABLO).upsert(
        {
          drive_file_id: json.id,
          dosya_adi: json.name || ad,
          mime_type: json.mimeType || mimeType,
          boyut: Number(json.size || dosya?.size || 0),
          client_id: secenekler.clientId ?? null,
          belge_turu: secenekler.belgeTuru || 'genel',
          yol: yol.join('/'),
          drive_link: json.webViewLink || '',
          sha1: json.sha1 || '',
          durum: 'aktif',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'drive_file_id' }
      )
    } catch (e) {
      console.warn('Drive referansi Supabase yazilamadi:', e?.message || e)
    }

    return {
      success: true,
      drive_file_id: json.id,
      dosya_adi: json.name || ad,
      web_view_link: json.webViewLink || '',
      indirme_link: json.webContentLink || '',
      sha1: json.sha1 || '',
      boyut: Number(json.size || 0),
    }
  } catch (e) {
    console.error('uploadFileToDrive hatasi:', e?.message || e)
    return { success: false, error: e?.message || 'Drive yukleme hatasi' }
  }
}

// ---------------------------------------------------------------
// 2) Indirme — dogrudan tarayicidan
// ---------------------------------------------------------------
export async function downloadFileFromDrive(fileId) {
  try {
    const bilgi = await driveTokenAl()
    if (!bilgi.token) return { success: false, error: bilgi.error || 'Drive token alinamadi' }

    const yanit = await fetch(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`,
      { headers: authHeaders(bilgi.token) }
    )
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
  const sonuc = await driveApi({ action: 'archive', fileId })
  if (sonuc.ok) {
    try {
      await supabase.from(BELGE_TABLO).update({ durum: 'arsiv' }).eq('drive_file_id', fileId)
    } catch { /* yoksay */ }
  }
  return sonuc
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
  if (tokenOnbellek.token && tokenOnbellek.bitis > Date.now()) return true
  const bilgi = await driveTokenAl()
  return !!bilgi.token
}

// ---------------------------------------------------------------
// 6) OAuth baglanti adresi (admin ayarlari icin)
// ---------------------------------------------------------------
export function driveBaglantiAdresi() {
  return '/api/drive-auth?action=start'
}
