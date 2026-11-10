// MUBIS - VKN/TCKN sorgulama (Cloudflare Pages Function)
// POST /api/vkn-sorgula  Body: { clientId, vkn }
//
// GIB e-Arsiv portalinin "SICIL_VEYA_MERNISTEN_BILGILERI_GETIR" servisidir
// (fatura keserken alici VKN/TCKN yazilinca unvan / ad-soyad / vergi dairesi
// otomatik dolan servis). Musterinin (gondericinin) GIB sifresi clients
// tablosundaki dvs_username / dvs_password ile giris yapilir; sorgulanan
// numara alici olur. VKN -> unvan + vergi dairesi, TCKN -> ad/soyad + vergi dairesi.
import { json, supabaseAdmin } from './_lib.js'

const EARSIV_BASE = 'https://earsivportal.efatura.gov.tr'

const formPost = async (url, params, env = null, token = '') => {
  const govde = new URLSearchParams(params).toString()
  // 2.8.42: ONCE VPS PROXY. Cloudflare Workers e-Arsiv portalina erisemiyor
  // (502 / HTML hata sayfasi). VPS Istanbul IP'sinden oldugu icin portal
  // erisimi orada calisiyor. Proxy tanimli degilse dogrudan denenir.
  const yardimci = String(env?.YARDIMCI_URL || '').replace(/\/+$/, '')
  const anahtar = String(env?.MUBIS_SUNUCU_ANAHTARI || '')
  if (yardimci && anahtar) {
    try {
      const yol = new URL(url).pathname
      const r = await fetch(yardimci + '/earsiv-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-mubis-key': anahtar },
        body: JSON.stringify({ yol, govde, token }),
        signal: AbortSignal.timeout(30000)
      })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j || typeof j.body !== 'string') {
        throw new Error(j?.error || `e-Arsiv proxy hatasi (HTTP ${r.status})`)
      }
      if (j.status < 200 || j.status > 299) throw new Error(`GIB portal HTTP ${j.status}`)
      try { return JSON.parse(j.body) } catch { throw new Error('GIB portal yaniti okunamadi') }
    } catch (err) {
      // Proxy yoksa/bozuksa dogrudan denemeye dus
      if (!/proxy/i.test(String(err?.message || ''))) throw err
    }
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
    },
    body: govde
  })
  if (!res.ok) throw new Error(`GIB portal HTTP ${res.status}`)
  return res.json()
}

const rndCallId = () => {
  const p = () => Math.random().toString(16).substring(2, 8)
  return `${p()}${p()}-${p()}`
}

const msgText = (m) => (typeof m === 'string' ? m : m?.text) || ''

async function portalGirisYap(kullaniciAdi, sifre, env) {
  const data = await formPost(`${EARSIV_BASE}/earsiv-services/assos-login`, {
    assoscmd: 'anologin',
    rtype: 'json',
    userid: kullaniciAdi,
    sifre,
    sifre2: sifre,
    parola: '1'
  }, env)
  if (!data?.token) {
    const msg = (data?.messages || []).map(msgText).filter(Boolean).join('; ') || 'GIB portal girisi basarisiz'
    throw new Error(msg)
  }
  return data.token
}

async function portalCikis(token, env) {
  if (!token) return
  try {
    await formPost(`${EARSIV_BASE}/earsiv-services/assos-login`, { assoscmd: 'logout', rtype: 'json', token }, env, token)
  } catch { /* yoksay */ }
}

const unwrapData = (d) => {
  if (d == null) return null
  let v = d
  if (typeof v === 'string') {
    try { v = JSON.parse(v) } catch { return null }
  }
  if (Array.isArray(v)) v = v[0] ?? null
  if (typeof v === 'string') {
    try { v = JSON.parse(v) } catch { return null }
  }
  return v && typeof v === 'object' ? v : null
}

async function sicilSorgula(token, vknTckn, env) {
  const resp = await formPost(`${EARSIV_BASE}/earsiv-services/dispatch`, {
    cmd: 'SICIL_VEYA_MERNISTEN_BILGILERI_GETIR',
    callid: rndCallId(),
    pageName: 'RG_BASITFATURA',
    token,
    jp: JSON.stringify({ vknTcknn: vknTckn })
  }, env, token)
  if (resp?.error) {
    const msg = (resp.messages || []).map(msgText).filter(Boolean).join('; ') || 'GIB sorgusu hata dondu'
    throw new Error(msg)
  }
  return unwrapData(resp?.data)
}

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
}

export async function onRequestPost({ request, env }) {
  const sb = supabaseAdmin(env)
  if (!sb) return json({ success: false, error: 'Sunucu yapilandirmasi eksik (service key)' }, 500)

  // Oturum dogrulama (her giris yapmis kullanici: admin veya musteri)
  const authHeader = request.headers.get('authorization') || ''
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!bearer) return json({ success: false, error: 'Oturum bilgisi bulunamadi' }, 401)
  let userData, userErr
  try { ({ data: userData, error: userErr } = await sb.auth.getUser(bearer)) } catch { return json({ success: false, error: 'Oturum doğrulama servisine ulaşılamadı' }, 503) }
  if (userErr || !userData?.user) return json({ success: false, error: 'Oturum dogrulanamadi' }, 401)

  let body = {}
  try { body = await request.json() } catch { return json({ success: false, error: 'Gecersiz istek' }, 400) }
  const coklu = Array.isArray(body.vknler)
  const vknler = coklu ? body.vknler.map(v => String(v || '').trim()) : [String(body.vkn || '').replace(/\D/g, '')]
  const clientId = Number(body.clientId)
  if (!Number.isSafeInteger(clientId) || clientId <= 0 || !vknler.length || vknler.length > 10 || vknler.some(v => !/^\d{10,11}$/.test(v))) {
    return json({ success: false, error: 'Geçerli müşteri ve en fazla 10 VKN/TCKN girilmelidir' }, 400)
  }
  const vkn = vknler[0]
  let client, cErr, profile, pErr
  try {
    ;({ data: profile, error: pErr } = await sb.from('profiles').select('role,office_id').eq('id', userData.user.id).maybeSingle())
    ;({ data: client, error: cErr } = await sb.from('clients').select('id,office_id,auth_user_id,dvs_username,dvs_password').eq('id', clientId).maybeSingle())
  } catch { return json({ success: false, error: 'Müşteri yetkisi doğrulanamadı' }, 503) }
  if (pErr || cErr) return json({ success: false, error: 'Müşteri yetkisi doğrulanamadı' }, 503)
  const yetkili = profile && client && (
    profile.role === 'super_admin' ||
    (['admin', 'personel'].includes(profile.role) && profile.office_id != null && String(profile.office_id) === String(client.office_id)) ||
    (['musteri', 'client'].includes(profile.role) && client.auth_user_id === userData.user.id)
  )
  if (!yetkili) return json({ success: false, error: 'Bu müşteri için yetkiniz yok' }, 403)
  const kullaniciAdi = String(client.dvs_username || '').trim()
  const sifre = String(client.dvs_password || '').trim()
  if (!kullaniciAdi || !sifre) {
    return json({ success: false, error: 'GIB_SIFRE_YOK: Musteri kartinda Dijital Vergi Dairesi kullanici adi/sifre girilmemis' }, 422)
  }

  let token = null
  try {
    token = await portalGirisYap(kullaniciAdi, sifre, env)
    if (coklu) {
      const sonuclar = {}
      for (const numara of new Set(vknler)) {
        const kayit = await sicilSorgula(token, numara, env)
        const cevapNo = String(kayit?.vknTcknn || '').trim()
        if (cevapNo && cevapNo !== numara) continue
        const unvan = [kayit?.unvan, kayit?.unvan2].map(s => String(s || '').trim()).filter(Boolean).join(' ').trim()
        const adSoyad = [kayit?.adi, kayit?.soyadi].map(s => String(s || '').trim()).filter(Boolean).join(' ').trim()
        const ad = unvan || adSoyad
        if (ad && !/^\d+$/.test(ad)) sonuclar[numara] = ad
      }
      await portalCikis(token, env)
      token = null
      return json({ success: true, data: sonuclar })
    }
    const kayit = await sicilSorgula(token, vkn, env)
    await portalCikis(token, env)
    token = null

    if (!kayit) return json({ success: true, data: null, message: 'Kayit bulunmamaktadir' })

    const unvan = [kayit.unvan, kayit.unvan2].map(s => String(s || '').trim()).filter(Boolean).join(' ').trim()
    // Adres: sicil kaydinda adres alanlari doluysa birlestir (her kayitta gelmez)
    const parca = (k) => String(kayit[k] || '').trim()
    const adresParcalari = [
      [parca('cadde'), parca('apartmanAdi')].filter(Boolean).join(' '),
      [parca('disKapiNo'), parca('icKapiNo')].filter(Boolean).join('/'),
      [parca('ilce'), parca('il')].filter(Boolean).join(' - '),
      parca('postaKodu')
    ].filter(Boolean)
    const sonuc = {
      vknTckn: kayit.vknTcknn || vkn,
      unvan,
      adi: String(kayit.adi || '').trim(),
      soyadi: String(kayit.soyadi || '').trim(),
      vergiDairesi: String(kayit.vergiDairesi || '').trim(),
      adres: adresParcalari.join(', '),
      il: parca('il'),
      ilce: parca('ilce'),
      ulkeAdi: parca('ulkeAdi')
    }
    if (!sonuc.unvan && !sonuc.adi && !sonuc.vergiDairesi) {
      return json({ success: true, data: null, message: 'Kayit bulunmamaktadir' })
    }
    return json({ success: true, data: sonuc })
  } catch (err) {
    await portalCikis(token, env)
    return json({ success: false, error: err?.message || 'GIB sorgusu basarisiz' }, 502)
  }
}
