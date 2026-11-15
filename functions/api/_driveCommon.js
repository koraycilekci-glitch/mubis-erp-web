// MUBIS - Google Drive ortak yardimcilari (Cloudflare Pages Functions)
// functions/api/_driveCommon.js  -> "_" onekli dosyalar route olarak servis edilmez.
//
// Kimlik: OAuth2 refresh token (Cloudflare env: GOOGLE_REFRESH_TOKEN) veya
// Supabase app_settings tablosundaki 'google_drive_refresh_token' kaydi.

import { createClient } from '@supabase/supabase-js'

export const DRIVE_API = 'https://www.googleapis.com/drive/v3'
export const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SB_URL = 'https://gxuqrxmpgoeyykoolmwv.supabase.co'

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json', ...extra } })

export function supabaseAdmin(env) {
  const key = env?.SUPABASE_SERVICE_ROLE_KEY || env?.SUPABASE_SERVICE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY tanimli degil')
  return createClient(SB_URL, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Cagiranin oturumunu dogrular; profilini dondurur.
export async function dogrulaKullanici(request, env) {
  const auth = request.headers.get('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return { ok: false, kod: 401, hata: 'Oturum bilgisi bulunamadi' }
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: {
        apikey: env?.SUPABASE_SERVICE_ROLE_KEY || env?.SUPABASE_SERVICE_KEY || '',
        Authorization: `Bearer ${token}`,
      },
    })
    if (!r.ok) return { ok: false, kod: 401, hata: 'Oturum dogrulanamadi' }
    const u = await r.json()
    const admin = supabaseAdmin(env)
    const { data: profil } = await admin
      .from('profiles')
      .select('id, role, office_id, name')
      .eq('id', u?.id || '')
      .maybeSingle()
    return { ok: true, kullanici: u, profil: profil || null, admin }
  } catch (e) {
    return { ok: false, kod: 500, hata: e?.message || 'Oturum kontrol hatasi' }
  }
}

// Refresh token'i env'den ya da app_settings'ten okur.
export async function refreshTokenGetir(admin, env) {
  if (env?.GOOGLE_REFRESH_TOKEN) return env.GOOGLE_REFRESH_TOKEN
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

// Access token uretir: { ok, token } | { ok:false, hata }
export async function accessTokenAl(admin, env) {
  const clientId = env?.GOOGLE_CLIENT_ID
  const clientSecret = env?.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return { ok: false, hata: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET tanimli degil' }
  }
  const refreshToken = await refreshTokenGetir(admin, env)
  if (!refreshToken) {
    return { ok: false, hata: 'Google Drive yetkilendirilmedi. /api/drive-auth?action=start ile baglanti kurun.' }
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
  const j = await yanit.json().catch(() => ({}))
  if (!yanit.ok || !j.access_token) {
    const mesaj = j?.error_description || j?.error || `HTTP ${yanit.status}`
    return { ok: false, hata: 'Google token yenilenemedi: ' + mesaj }
  }
  return { ok: true, token: j.access_token }
}

export const driveHeaders = (token) => ({ Authorization: 'Bearer ' + token })

// Klasoru bulur, yoksa olusturur. parentId bos ise 'root'.
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
  const oj = await olustur.json().catch(() => ({}))
  if (!olustur.ok || !oj.id) {
    throw new Error('Klasor olusturulamadi: ' + (oj?.error?.message || `HTTP ${olustur.status}`))
  }
  return oj.id
}

// Yol parcalarini sirayla olusturup son klasor id'sini dondurur.
export async function klasorYoluHazirla(token, kokId, parcalar) {
  let parent = kokId || 'root'
  for (const p of parcalar) {
    if (!p) continue
    parent = await klasorBulVeyaOlustur(token, p, parent)
  }
  return parent
}
