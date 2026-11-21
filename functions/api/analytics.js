// MUBiS - Yonetici paneli GA4 rapor ucu
//
// Yetki iki yoldan biriyle saglanir (hangisi varsa):
//   1) OAuth (onerilen, tek tik): /api/drive-auth?action=analytics-start ile
//      analytics.readonly izni alinir; refresh token app_settings
//      'ga4_refresh_token', mulk numarasi 'ga4_property_id' anahtarinda tutulur.
//   2) Servis hesabi (opsiyonel): GA4_SERVICE_ACCOUNT_JSON ortam degiskeni.
//
// Mulk numarasi: env.GA4_PROPERTY_ID > app_settings.ga4_property_id
import { supabaseAdmin } from './_lib'

const TOKEN_UCLARI = 'https://oauth2.googleapis.com/token'
const RAPOR_UCU = 'https://analyticsdata.googleapis.com/v1beta'

const json = (govde, durum = 200) => new Response(JSON.stringify(govde), {
  status: durum,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
})

async function ayarOku(admin, anahtar) {
  try {
    const { data } = await admin.from('app_settings').select('value').eq('office_id', 1).eq('key', anahtar).maybeSingle()
    return data?.value || ''
  } catch {
    return ''
  }
}

async function oauthTokeni(env, admin) {
  const clientId = env?.GOOGLE_CLIENT_ID
  const clientSecret = env?.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return { ok: false, hata: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET tanimli degil' }
  const refresh = env?.GA4_REFRESH_TOKEN || await ayarOku(admin, 'ga4_refresh_token')
  if (!refresh) return { ok: false, hata: 'Analytics baglantisi kurulmamis' }
  const yanit = await fetch(TOKEN_UCLARI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refresh,
      grant_type: 'refresh_token'
    }).toString()
  })
  const j = await yanit.json().catch(() => ({}))
  if (!yanit.ok || !j.access_token) {
    return { ok: false, hata: 'Google token yenilenemedi: ' + (j.error_description || j.error || `HTTP ${yanit.status}`) }
  }
  return { ok: true, token: j.access_token }
}

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

export async function onRequestPost({ request, env }) {
  let istek = {}
  try { istek = await request.json() } catch { /* yoksay */ }

  let admin = null
  try { admin = supabaseAdmin(env) } catch { admin = null }

  const mulk = String(env.GA4_PROPERTY_ID || '').trim() ||
    (admin ? String(await ayarOku(admin, 'ga4_property_id')).trim() : '')
  if (!mulk) {
    return json({
      ok: false,
      reason: 'yapilandirilmadi',
      error: 'Analytics bağlantısı kurulmamış. Yönetici panelinden "Analytics Bağla" düğmesine basın.'
    }, 200)
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
    // 1) OAuth (tek tikla baglanti) — 2) servis hesabi yedegi
    let token = ''
    let oauthHata = ''
    if (admin) {
      const o = await oauthTokeni(env, admin)
      if (o.ok) token = o.token
      else oauthHata = o.hata || ''
    }
    if (!token) {
      const hesapHam = String(env.GA4_SERVICE_ACCOUNT_JSON || '').trim()
      if (hesapHam) {
        try { token = await servisHesabiTokeni(JSON.parse(hesapHam)) } catch (e) { oauthHata = e?.message || oauthHata }
      }
    }
    if (!token) {
      return json({
        ok: false,
        reason: 'yetki-yok',
        error: oauthHata || 'Analytics yetkisi yok. Yönetici panelinden "Analytics Bağla" düğmesine basın.'
      }, 200)
    }
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
      const ham = String(veri?.error?.message || `HTTP ${yanit.status}`)
      // 2.8.357: API etkinlestirilmemis hatasini anlasilir Turkce mesaja cevir.
      const apiKapali = /has not been used in project|it is disabled|accessNotConfigured|SERVICE_DISABLED/i.test(ham)
      if (apiKapali) {
        const proje = /project\s+(\d+)/i.exec(ham)?.[1] || ''
        const apiAdi = /(analyticsdata|analyticsadmin)\.googleapis\.com/i.exec(ham)?.[0] || 'analyticsdata.googleapis.com'
        return json({
          ok: false,
          reason: 'api-kapali',
          api: apiAdi,
          proje,
          link: `https://console.developers.google.com/apis/api/${apiAdi}/overview${proje ? `?project=${proje}` : ''}`,
          error: `Google Cloud projesinde ${apiAdi} kapalı. Aşağıdaki bağlantıdan "Etkinleştir" deyip 1-2 dakika sonra Yenile'ye basın.`
        }, 200)
      }
      return json({ ok: false, reason: 'ga4-hatasi', error: ham }, 200)
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
    // 2.8.358: GA4, boyut (orn. date) verildiginde `totals` DONDURMEZ. Bu
    // yuzden kartta hep 0 gorunuyordu. Toplam yoksa satirlardan hesaplanir.
    // Not: activeUsers gunluk toplandiginda tekilleşmez (ust sinir) — bu
    // yuzden "Aktif kullanıcı" icin max gunluk deger kullanilir.
    if (!veri.totals?.length) {
      for (const ad of metrikAdlari) {
        const degerler = satirlar.map((s) => Number(s[ad]) || 0)
        toplamlar[ad] = ad === 'activeUsers' && degerler.length
          ? Math.max(...degerler)
          : degerler.reduce((t, x) => t + x, 0)
      }
    }
    return json({ ok: true, boyutlar: boyutAdlari, metrikler: metrikAdlari, satirlar, toplamlar })
  } catch (e) {
    return json({ ok: false, reason: 'sunucu-hatasi', error: e?.message || String(e) }, 200)
  }
}

export async function onRequestGet() {
  return json({ ok: false, reason: 'yontem', error: 'Yalnızca POST desteklenir.' }, 405)
}
