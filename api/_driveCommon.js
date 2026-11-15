// api/_driveCommon.js
// Google Drive ortak yardımcıları — Vercel serverless (Node runtime).
// `_` öneki sayesinde Vercel bu dosyayı route olarak yayınlamaz.
//
// Amaç: googleapis paketi olmadan, sadece fetch ile Drive REST v3 kullanmak.
// Kimlik: OAuth2 refresh token (Vercel env: GOOGLE_REFRESH_TOKEN) veya
// app_settings tablosundaki 'google_drive_refresh_token' kaydı.

import { createClient } from '@supabase/supabase-js'

export const DRIVE_API = 'https://www.googleapis.com/drive/v3'
export const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

export function supabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://gxuqrxmpgoeyykoolmwv.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY tanimli degil')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Çağıranın oturumunu doğrular; profilini döndürür.
export async function dogrulaKullanici(req) {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return { ok: false, kod: 401, hata: 'Oturum bilgisi bulunamadi' }
  const admin = supabaseAdmin()
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) return { ok: false, kod: 401, hata: 'Oturum dogrulanamadi' }
  const { data: profil } = await admin
    .from('profiles')
    .select('id, role, office_id, name')
    .eq('id', data.user.id)
    .maybeSingle()
  return { ok: true, kullanici: data.user, profil: profil || null, admin }
}

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

// Refresh token'ı env'den ya da app_settings'ten okur.
export async function refreshTokenGetir(admin) {
  if (process.env.GOOGLE_REFRESH_TOKEN) return process.env.GOOGLE_REFRESH_TOKEN
  try {
    const { data } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', 'google_drive_refresh_token')
      .maybeSingle()
    return data?.value || ''
  } catch {
    return ''
  }
}

// Access token üretir: { ok, token } | { ok:false, hata }
export async function accessTokenAl(admin) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return { ok: false, hata: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET tanimli degil' }
  }
  const refreshToken = await refreshTokenGetir(admin)
  if (!refreshToken) {
    return { ok: false, hata: 'Google Drive yetkilendirilmedi. /api/drive-auth adresinden baglanti kurun.' }
  }

  const govde = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })
  const yanit = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: govde.toString(),
  })
  const json = await yanit.json().catch(() => ({}))
  if (!yanit.ok || !json.access_token) {
    const mesaj = json?.error_description || json?.error || `HTTP ${yanit.status}`
    return { ok: false, hata: 'Google token yenilenemedi: ' + mesaj }
  }
  return { ok: true, token: json.access_token }
}

export function driveHeaders(token) {
  return { Authorization: 'Bearer ' + token }
}

// Klasörü bulur, yoksa oluşturur. parentId boşsa 'root'.
export async function klasorBulVeyaOlustur(token, ad, parentId) {
  const guvenliAd = String(ad || '').replace(/'/g, "\\'")
  const q = [
    `name = '${guvenliAd}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(' and ')

  const ara = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`,
    { headers: driveHeaders(token) }
  )
  const araJson = await ara.json().catch(() => ({}))
  if (ara.ok && araJson?.files?.[0]?.id) return araJson.files[0].id

  const olustur = await fetch(`${DRIVE_API}/files?fields=id`, {
    method: 'POST',
    headers: { ...driveHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: String(ad || 'klasor'),
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    }),
  })
  const olusturJson = await olustur.json().catch(() => ({}))
  if (!olustur.ok || !olusturJson.id) {
    throw new Error('Klasor olusturulamadi: ' + (olusturJson?.error?.message || `HTTP ${olustur.status}`))
  }
  return olusturJson.id
}

// Yol parçalarını sırayla oluşturup son klasör id'sini döndürür.
// ornek: ['MUBIS', 'MUSTERI A', '2026', 'OCAK', 'GELEN']
export async function klasorYoluHazirla(token, kokId, parcalar) {
  let parent = kokId || 'root'
  for (const parca of parcalar) {
    if (!parca) continue
    parent = await klasorBulVeyaOlustur(token, parca, parent)
  }
  return parent
}

// multipart/related gövdesi kurar (Drive v3 beklediği biçim).
export function multipartGovde(metadata, buffer, mimeType) {
  const sinir = 'mubis_' + Math.random().toString(36).slice(2)
  const basliklar =
    `--${sinir}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    `\r\n--${sinir}\r\n` +
    `Content-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`
  const son =
    `\r\n--${sinir}--`
  return {
    sinir,
    govde: Buffer.concat([Buffer.from(basliklar, 'utf8'), buffer, Buffer.from(son, 'utf8')]),
  }
}

// Drive dosyasını indirir; Buffer döndürür.
export async function driveDosyaIndir(token, fileId) {
  const yanit = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: driveHeaders(token),
  })
  if (!yanit.ok) {
    const hata = await yanit.text().catch(() => '')
    throw new Error('Drive indirme hatasi: HTTP ' + yanit.status + ' ' + hata.slice(0, 200))
  }
  return Buffer.from(await yanit.arrayBuffer())
}
