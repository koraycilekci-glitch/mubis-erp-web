// MUBIS - e-Fatura mukellef sorgulama (Cloudflare Pages Function)
// POST /api/efatura-mukellef  Body: { vkn }  (10 hane VKN / 11 hane TCKN)
//
// GIB "e-Fatura kayitli kullanicilar" sorgulamasi (sorgu.efatura.gov.tr/kullanicilar/)
// guvenlik kodu ister; kod 2captcha ile cozulur. Sorgulanan numara listede varsa
// mukellef e-Fatura kayitli demektir.
//
// Yanit: { success: true, efaturaMukellefi: true/false, unvan?: '...' }
import { json, supabaseAdmin } from './_lib.js'

const BASE = 'https://sorgu.efatura.gov.tr/kullanicilar'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const decodeEntities = (s) => String(s || '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')

const cookieJarToHeader = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')

const collectCookies = (jar, res) => {
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || ''].filter(Boolean)
  for (const sc of setCookies) {
    const [pair] = sc.split(';')
    const eq = pair.indexOf('=')
    if (eq > 0) jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim()
  }
}

async function captchaCoz(apiKey, imageB64) {
  const gonder = await fetch('https://2captcha.com/in.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ key: apiKey, method: 'base64', body: imageB64, json: '1' }).toString()
  })
  const g = await gonder.json()
  if (g.status !== 1) throw new Error('2captcha gonderim hatasi: ' + (g.request || '?'))
  const id = g.request
  const son = Date.now() + 75000
  while (Date.now() < son) {
    await new Promise(r => setTimeout(r, 4000))
    const r = await (await fetch(`https://2captcha.com/res.php?json=1&action=get&key=${encodeURIComponent(apiKey)}&id=${id}`)).json()
    if (r.status === 1) return String(r.request)
    if (r.request !== 'CAPCHA_NOT_READY') throw new Error('2captcha cozelemedi: ' + r.request)
  }
  throw new Error('2captcha zaman asimi')
}

async function gibYardimciIstegi(env, adim, jar, vkn, kod) {
  const target = new URL(String(env.YARDIMCI_URL || ''))
  if (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash || !env.MUBIS_SUNUCU_ANAHTARI) throw new Error('Yardımcı sunucu yapılandırılmamış')
  const response = await fetch(target.href.replace(/\/+$/, '') + '/gib-mukellef-baglanti', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-mubis-key': env.MUBIS_SUNUCU_ANAHTARI },
    body: JSON.stringify({ adim, cookie: cookieJarToHeader(jar), vkn, kod }),
    redirect: 'manual',
    signal: AbortSignal.timeout(25000)
  })
  if (!response.ok) throw new Error('Yardımcı sunucu GİB bağlantısı başarısız (HTTP ' + response.status + ')')
  const data = await response.json()
  if (!Number.isInteger(data.status) || data.status < 200 || data.status > 599 || !Array.isArray(data.cookies) || typeof data.body !== 'string' || data.body.length > 700000) throw new Error('Yardımcı sunucudan geçersiz yanıt alındı')
  for (const cookie of data.cookies) {
    if (typeof cookie !== 'string') throw new Error('Yardımcı sunucudan geçersiz oturum yanıtı alındı')
    const pair = cookie.split(';')[0]
    const eq = pair.indexOf('=')
    if (eq > 0) jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim()
  }
  const content = Buffer.from(data.body, 'base64')
  return new Response([204, 205, 304].includes(data.status) ? null : content, { status: data.status })
}

async function sorgulaBirDeneme(apiKey, vkn, env) {
  const jar = {}
  console.info('e-Fatura mükellef sorgusu: GİB sayfası alınıyor')
  let yardimci = true
  let ana
  try {
    ana = await gibYardimciIstegi(env, 'sayfa', jar)
    if (!ana.ok) throw new Error('GİB yardımcı sunucudan erişilemedi')
  } catch {
    yardimci = false
    ana = await fetch(`${BASE}/xliste.php`, { headers: { 'User-Agent': UA, Cookie: cookieJarToHeader(jar) } })
  }
  if (!ana.ok) throw new Error('GİB sorgu sayfası alınamadı (HTTP ' + ana.status + ')')
  collectCookies(jar, ana)
  await ana.text()

  const img = yardimci
    ? await gibYardimciIstegi(env, 'resim', jar)
    : await fetch(`${BASE}/img.php`, { headers: { 'User-Agent': UA, Cookie: cookieJarToHeader(jar) } })
  collectCookies(jar, img)
  if (!img.ok) throw new Error('GIB guvenlik kodu goruntusu alinamadi (HTTP ' + img.status + ')')
  const buf = Buffer.from(await img.arrayBuffer())
  const b64 = buf.toString('base64')
  console.info('e-Fatura mükellef sorgusu: güvenlik kodu çözülüyor')
  const kod = await captchaCoz(apiKey, b64)

  console.info('e-Fatura mükellef sorgusu: GİB araması gönderiliyor')
  const ara = yardimci ? await gibYardimciIstegi(env, 'arama', jar, vkn, kod) : await fetch(`${BASE}/xliste.php`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: `${BASE}/xliste.php`,
      Cookie: cookieJarToHeader(jar)
    },
    body: new URLSearchParams({ search_string: vkn, captcha_code: kod, submit: 'Ara' }).toString()
  })
  if (!ara.ok) throw new Error('GİB sorgusu başarısız (HTTP ' + ara.status + ')')
  collectCookies(jar, ara)
  const html = await ara.text()
  const metin = decodeEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '))

  // GIB yanitlari:
  //  - "Mükellef kayıtlıdır."  -> e-Fatura mukellefi
  //  - "Arama işlemi sonucunda kayıt bulunamadı!" -> kayitli degil
  //  - ikisi de yoksa form tekrar basilmistir -> captcha hatasi (tekrar dene)
  if (/kayıt\s*bulunamad|kayit\s*bulunamad/i.test(metin)) return { efaturaMukellefi: false }
  if (/kayıtlıdır|kayitlidir/i.test(metin)) {
    let unvan = ''
    const tabloM = html.match(/<table[^>]*class="kurumlar"[\s\S]*?<\/table>/i)
    if (tabloM) {
      const satirlar = tabloM[0].match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || []
      for (const tr of satirlar) {
        const hucreler = (tr.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || []).map(td => decodeEntities(td.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim())
        if (hucreler.some(h => h.replace(/\D/g, '') === vkn)) {
          unvan = hucreler.find(h => h.length > 3 && h.replace(/\D/g, '') !== vkn) || ''
          break
        }
      }
    }
    return { efaturaMukellefi: true, unvan }
  }
  return { captchaHata: true }
}

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
}

export async function onRequestPost({ request, env }) {
  const sb = supabaseAdmin(env)
  if (!sb) return json({ success: false, error: 'Sunucu yapilandirmasi eksik (service key)' }, 500)

  const authHeader = request.headers.get('authorization') || ''
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!bearer) return json({ success: false, error: 'Oturum bilgisi bulunamadi' }, 401)
  try {
    const { data: userData, error: userErr } = await sb.auth.getUser(bearer)
    if (userErr || !userData?.user) return json({ success: false, error: 'Oturum dogrulanamadi' }, 401)
  } catch (err) {
    console.error('e-Fatura mukellef sorgusu: oturum dogrulama servisine erisilemedi', err?.name)
    return json({ success: false, error: 'Oturum doğrulama servisine ulaşılamadı; daha sonra tekrar deneyin.' }, 502)
  }

  let body = {}
  try { body = await request.json() } catch { return json({ success: false, error: 'Gecersiz istek' }, 400) }
  const vkn = String(body.vkn || '').replace(/\D/g, '')
  if (vkn.length !== 10 && vkn.length !== 11) {
    return json({ success: false, error: 'VKN (10 hane) veya TCKN (11 hane) girilmelidir' }, 400)
  }

  const apiKey = env.TWO_CAPTCHA_API_KEY
  if (!apiKey) return json({ success: false, error: 'Captcha cozucu yapilandirilmamis (TWO_CAPTCHA_API_KEY)' }, 500)

  // Captcha hatali donerse bir kez tekrar dener
  let sonuc = null
  for (let deneme = 0; deneme < 2; deneme++) {
    try {
      sonuc = await sorgulaBirDeneme(apiKey, vkn, env)
      if (!sonuc?.captchaHata) break
    } catch (err) {
      return json({ success: false, error: err?.message || 'Sorgu basarisiz' }, 502)
    }
  }
  if (sonuc?.captchaHata) return json({ success: false, error: 'Guvenlik kodu cozulemedi (2 deneme)' }, 502)
  return json({ success: true, efaturaMukellefi: !!sonuc.efaturaMukellefi, unvan: sonuc.unvan || '' })
}
