// MUBiS - Yonetici paneli GA4 rapor ucu (hazir altyapi)
//
// GA4 Data API yalnizca sunucu tarafinda cagrilabilir (OAuth2 servis hesabi).
// Bu uç, ortam degiskenleri tanimliysa gercek raporu doner; tanimli degilse
// panelde "yapilandirilmadi" bilgisinin gosterilmesi icin 501 benzeri yanit verir.
//
// Cloudflare Pages > Settings > Environment variables:
//   GA4_PROPERTY_ID           = 123456789
//   GA4_SERVICE_ACCOUNT_JSON  = { "client_email": "...", "private_key": "...", ... }
//
// Not: Servis hesabinin GA4 mulkunde "Viewer" yetkisi olmalidir.

const TOKEN_UCLARI = 'https://oauth2.googleapis.com/token'
const RAPOR_UCU = 'https://analyticsdata.googleapis.com/v1beta'

function b64url(input) {
  const buf = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : new Uint8Array(input)
  let s = ''
  for (const b of buf) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pemToArrayBuffer(pem) {
  const temiz = String(pem).replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '').replace(/\s+/g, '')
  const ikili = atob(temiz)
  const bytes = new Uint8Array(ikili.length)
  for (let i = 0; i < ikili.length; i++) bytes[i] = ikili.charCodeAt(i)
  return bytes.buffer
}

async function servisHesabiTokeni(hesap) {
  const simdi = Math.floor(Date.now() / 1000)
  const baslik = { alg: 'RS256', typ: 'JWT' }
  const govde = {
    iss: hesap.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: TOKEN_UCLARI,
    iat: simdi,
    exp: simdi + 3600
  }
  const imzasiz = b64url(JSON.stringify(baslik)) + '.' + b64url(JSON.stringify(govde))
  const anahtar = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(hesap.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const imza = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', anahtar, new TextEncoder().encode(imzasiz))
  const jwt = imzasiz + '.' + b64url(imza)

  const yanit = await fetch(TOKEN_UCLARI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  })
  const veri = await yanit.json()
  if (!yanit.ok || !veri.access_token) {
    throw new Error(veri.error_description || veri.error || 'GA4 token alinamadi')
  }
  return veri.access_token
}

const json = (govde, durum = 200) => new Response(JSON.stringify(govde), {
  status: durum,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
})

export async function onRequestPost({ request, env }) {
  let istek = {}
  try { istek = await request.json() } catch { /* yoksay */ }

  const mulk = String(env.GA4_PROPERTY_ID || '').trim()
  const hesapHam = String(env.GA4_SERVICE_ACCOUNT_JSON || '').trim()
  if (!mulk || !hesapHam) {
    return json({
      ok: false,
      reason: 'yapilandirilmadi',
      error: 'GA4 rapor ucu hazır; GA4_PROPERTY_ID ve GA4_SERVICE_ACCOUNT_JSON ortam değişkenlerini tanımlayın.'
    }, 200)
  }

  let hesap
  try { hesap = JSON.parse(hesapHam) } catch {
    return json({ ok: false, reason: 'yapilandirma-hatasi', error: 'GA4_SERVICE_ACCOUNT_JSON geçerli JSON değil.' }, 200)
  }

  const metrikler = (Array.isArray(istek.metrikler) ? istek.metrikler : ['activeUsers', 'sessions', 'screenPageViews'])
    .filter((m) => /^[a-zA-Z][a-zA-Z0-9]{0,60}$/.test(String(m)))
    .slice(0, 10)
  const boyutlar = (Array.isArray(istek.boyutlar) ? istek.boyutlar : ['date'])
    .filter((b) => /^[a-zA-Z][a-zA-Z0-9]{0,60}$/.test(String(b)))
    .slice(0, 9)

  const gun = /^\d{4}-\d{2}-\d{2}$/
  const baslangic = gun.test(String(istek.baslangic || '')) ? istek.baslangic : '30daysAgo'
  const bitis = gun.test(String(istek.bitis || '')) ? istek.bitis : 'today'
  const limit = Math.min(Math.max(Number(istek.limit) || 100, 1), 1000)

  try {
    const token = await servisHesabiTokeni(hesap)
    const yanit = await fetch(`${RAPOR_UCU}/properties/${encodeURIComponent(mulk)}:runReport`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateRanges: [{ startDate: baslangic, endDate: bitis }],
        metrics: metrikler.map((m) => ({ name: m })),
        dimensions: boyutlar.map((b) => ({ name: b })),
        limit,
        keepEmptyRows: false
      })
    })
    const veri = await yanit.json()
    if (!yanit.ok) {
      return json({ ok: false, reason: 'ga4-hatasi', error: veri?.error?.message || `HTTP ${yanit.status}` }, 200)
    }

    const boyutAdlari = (veri.dimensionHeaders || []).map((h) => h.name)
    const metrikAdlari = (veri.metricHeaders || []).map((h) => h.name)
    const satirlar = (veri.rows || []).map((satir) => {
      const kayit = {}
      boyutAdlari.forEach((ad, i) => { kayit[ad] = satir.dimensionValues?.[i]?.value ?? '' })
      metrikAdlari.forEach((ad, i) => { kayit[ad] = Number(satir.metricValues?.[i]?.value ?? 0) })
      return kayit
    })
    const toplamlar = {}
    metrikAdlari.forEach((ad, i) => { toplamlar[ad] = Number(veri.totals?.[0]?.metricValues?.[i]?.value ?? 0) })

    return json({ ok: true, boyutlar: boyutAdlari, metrikler: metrikAdlari, satirlar, toplamlar })
  } catch (e) {
    return json({ ok: false, reason: 'sunucu-hatasi', error: e?.message || String(e) }, 200)
  }
}

export async function onRequestGet() {
  return json({ ok: false, reason: 'yontem', error: 'Yalnızca POST desteklenir.' }, 405)
}
