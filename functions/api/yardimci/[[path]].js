import { supabaseAdmin } from '../_lib.js'

const yanit = (error, status) => new Response(JSON.stringify({ error }), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
})

const kodla = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const coz = (value) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))

async function imzaAnahtari(secret) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

async function isKimligiOlustur(secret, userId, clientId, isId) {
  const veri = kodla(new TextEncoder().encode(JSON.stringify({ u: userId, c: clientId, i: isId, e: Date.now() + 60 * 60 * 1000 })))
  const imza = await crypto.subtle.sign('HMAC', await imzaAnahtari(secret), new TextEncoder().encode('dvs-is:' + veri))
  return veri + '.' + kodla(new Uint8Array(imza))
}

async function isKimligiDogrula(secret, userId, kimlik) {
  try {
    const [veri, imza, ...fazla] = String(kimlik || '').split('.')
    if (!veri || !imza || fazla.length || veri.length > 1024 || imza.length > 64) return null
    const dogru = await crypto.subtle.verify('HMAC', await imzaAnahtari(secret), coz(imza), new TextEncoder().encode('dvs-is:' + veri))
    if (!dogru) return null
    const bilgi = JSON.parse(new TextDecoder().decode(coz(veri)))
    if (bilgi.u !== userId || !Number.isSafeInteger(bilgi.c) || bilgi.c <= 0 || !/^is_\d+_[a-z0-9]+$/.test(bilgi.i) || !Number.isSafeInteger(bilgi.e) || bilgi.e < Date.now()) return null
    return bilgi
  } catch { return null }
}

export async function onRequest({ env, request }) {
  const token = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return yanit('Oturum gerekli', 401)

  const supabase = supabaseAdmin(env)
  if (!supabase) return yanit('Sunucu kimlik doğrulaması yapılandırılmamış', 503)
  let userData, userError, profile, profileError
  try {
    ;({ data: userData, error: userError } = await supabase.auth.getUser(token))
    if (userError || !userData?.user) return yanit('Oturum geçersiz', 401)
    ;({ data: profile, error: profileError } = await supabase.from('profiles')
      .select('role,office_id').eq('id', userData.user.id).maybeSingle())
  } catch {
    return yanit('Kimlik doğrulama servisine ulaşılamadı', 503)
  }
  const musteri = ['musteri', 'client'].includes(profile?.role)
  if (profileError || !profile || (!musteri && !['super_admin', 'admin', 'personel'].includes(profile.role))) {
    return yanit('Sunucu yardımcısı için yetkiniz yok', 403)
  }

  const officeId = String(env?.YARDIMCI_OFFICE_ID || '').trim()
  if (!/^\d+$/.test(officeId) || officeId === '0') return yanit('Sunucu yardımcısı ofisi yapılandırılmamış', 503)
  if (profile.role !== 'super_admin' && String(profile.office_id) !== officeId) {
    return yanit('Sunucu yardımcısı bu ofise bağlı değil', 403)
  }

  const key = String(env?.MUBIS_SUNUCU_ANAHTARI || '').trim()
  let target
  try {
    target = new URL(String(env?.YARDIMCI_URL || ''))
    if (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash) throw new Error()
  } catch {
    return yanit('Güvenli sunucu yardımcısı adresi yapılandırılmamış', 503)
  }
  if (!key) return yanit('Sunucu yardımcısı anahtarı yapılandırılmamış', 503)
  if (!['GET', 'POST'].includes(request.method)) return yanit('Yöntem desteklenmiyor', 405)

  const url = new URL(request.url)
  const prefix = '/api/yardimci/'
  const path = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : ''
  if (!path) return yanit('Yol eksik', 400)
  let arama = url.search
  let istekGovdesi = request.body
  let musteriIsKimligi = null
  let musteriId = null
  if (musteri) {
    if (request.method === 'POST' && path === 'is' && !url.search) {
      let body
      try { body = await request.json() } catch { return yanit('Geçersiz sorgu', 400) }
      // GİB ödeme formu hazırlama işi: musteri kendi vergi borcu için
      // ödeme ekranı hazırlayabilir. DVS kimlik bilgisi gerekmez.
      if (body?.is === 'gib-odeme-form' && body?.asenkron === true) {
        musteriId = Number(body?.clientId)
        if (!Number.isSafeInteger(musteriId) || musteriId <= 0) return yanit('Geçersiz sorgu', 400)
        let client, clientError
        try {
          ;({ data: client, error: clientError } = await supabase.from('clients').select('id,office_id').eq('id', musteriId).eq('auth_user_id', userData.user.id).maybeSingle())
        } catch { return yanit('Müşteri doğrulanamadı', 503) }
        if (clientError) return yanit('Müşteri doğrulanamadı', 503)
        if (!client || String(client.office_id) !== officeId) return yanit('Bu müşteri için yetkiniz yok', 403)
        istekGovdesi = JSON.stringify({ is: 'gib-odeme-form', asenkron: true, ...body })
        try {
          const temiz = JSON.parse(istekGovdesi)
          delete temiz.clientId
          istekGovdesi = JSON.stringify(temiz)
        } catch { /* yoksay */ }
      } else if (body?.is === 'gib-borc-sorgula' && body?.asenkron === true) {
        musteriId = Number(body?.clientId)
        if (!Number.isSafeInteger(musteriId) || musteriId <= 0) return yanit('Geçersiz sorgu', 400)
        let client, clientError
        try {
          ;({ data: client, error: clientError } = await supabase.from('clients').select('id,office_id,dvs_username,dvs_password').eq('id', musteriId).eq('auth_user_id', userData.user.id).maybeSingle())
        } catch { return yanit('Müşteri doğrulanamadı', 503) }
        if (clientError) return yanit('Müşteri doğrulanamadı', 503)
        if (!client || String(client.office_id) !== officeId) return yanit('Bu müşteri için yetkiniz yok', 403)
        if (!client.dvs_username || !client.dvs_password) return yanit('Müşteri DVS kullanıcı adı/şifresi kayıtlı değil', 400)
        istekGovdesi = JSON.stringify({ is: 'gib-borc-sorgula', asenkron: true, kullaniciKodu: client.dvs_username, parola: client.dvs_password })
      } else if (body?.is === 'sgk-borc-sorgula' && body?.asenkron === true) {
        musteriId = Number(body?.clientId)
        if (!Number.isSafeInteger(musteriId) || musteriId <= 0) return yanit('Geçersiz sorgu', 400)
        let client, clientError
        try {
          ;({ data: client, error: clientError } = await supabase.from('clients').select('id,office_id,sgk_user,sgk_sistem_sifre,sgk_isyeri_sifre,sgk_isyeri_kodu').eq('id', musteriId).eq('auth_user_id', userData.user.id).maybeSingle())
        } catch { return yanit('Müşteri doğrulanamadı', 503) }
        if (clientError) return yanit('Müşteri doğrulanamadı', 503)
        if (!client || String(client.office_id) !== officeId) return yanit('Bu müşteri için yetkiniz yok', 403)
        if (!client.sgk_user || !client.sgk_sistem_sifre || !client.sgk_isyeri_sifre) return yanit('Müşteri SGK bilgileri eksik', 400)
        istekGovdesi = JSON.stringify({ is: 'sgk-borc-sorgula', asenkron: true, kullaniciAdi: client.sgk_user, sistemSifre: client.sgk_sistem_sifre, isyeriSifre: client.sgk_isyeri_sifre, isyeriKodu: client.sgk_isyeri_kodu || '' })
      } else if (body?.is === 'vergi-etebligat-sorgula' && body?.asenkron === true) {
        musteriId = Number(body?.clientId)
        if (!Number.isSafeInteger(musteriId) || musteriId <= 0) return yanit('Geçersiz sorgu', 400)
        let client, clientError
        try {
          ;({ data: client, error: clientError } = await supabase.from('clients').select('id,office_id,dvs_username,dvs_password').eq('id', musteriId).eq('auth_user_id', userData.user.id).maybeSingle())
        } catch { return yanit('Müşteri doğrulanamadı', 503) }
        if (clientError) return yanit('Müşteri doğrulanamadı', 503)
        if (!client || String(client.office_id) !== officeId) return yanit('Bu müşteri için yetkiniz yok', 403)
        if (!client.dvs_username || !client.dvs_password) return yanit('Müşteri DVS kullanıcı adı/şifresi kayıtlı değil', 400)
        istekGovdesi = JSON.stringify({ is: 'vergi-etebligat-sorgula', asenkron: true, kullaniciKodu: client.dvs_username, parola: client.dvs_password, belgeleriIndir: body?.belgeleriIndir, ...(body?.kayitliBelgeler ? { kayitliBelgeler: body.kayitliBelgeler } : {}) })
      } else {
        musteriId = Number(body?.clientId)
        const yil = Number(body?.yil)
        const ay = Number(body?.ay)
        if (body?.is !== 'dvs-sorgula' || body?.asenkron !== true || !Number.isSafeInteger(musteriId) || musteriId <= 0 || !Number.isInteger(yil) || yil < 2000 || yil > 2100 || !Number.isInteger(ay) || ay < 1 || ay > 12 || !['pos', '109', '110'].includes(body?.tur)) return yanit('Geçersiz sorgu', 400)
        let client, clientError
        try {
          ;({ data: client, error: clientError } = await supabase.from('clients').select('id,office_id,dvs_username,dvs_password').eq('id', musteriId).eq('auth_user_id', userData.user.id).maybeSingle())
        } catch { return yanit('Müşteri doğrulanamadı', 503) }
        if (clientError) return yanit('Müşteri doğrulanamadı', 503)
        if (!client || String(client.office_id) !== officeId) return yanit('Bu müşteri için yetkiniz yok', 403)
        if (!client.dvs_username || !client.dvs_password) return yanit('Müşteri DVS kullanıcı adı/şifresi kayıtlı değil', 400)
        istekGovdesi = JSON.stringify({ is: 'dvs-sorgula', asenkron: true, kullaniciKodu: client.dvs_username, parola: client.dvs_password, yil, ay, tur: body.tur })
      }
    } else if (request.method === 'GET' && path === 'is-sonuc' && [...url.searchParams.keys()].length === 1) {
      musteriIsKimligi = url.searchParams.get('id')
      const bilgi = await isKimligiDogrula(key, userData.user.id, musteriIsKimligi)
      if (!bilgi) return yanit('Geçersiz sorgu kimliği', 403)
      let client, clientError
      try {
        ;({ data: client, error: clientError } = await supabase.from('clients').select('id,office_id').eq('id', bilgi.c).eq('auth_user_id', userData.user.id).maybeSingle())
      } catch { return yanit('Müşteri doğrulanamadı', 503) }
      if (clientError) return yanit('Müşteri doğrulanamadı', 503)
      if (!client || String(client.office_id) !== officeId) return yanit('Bu müşteri için yetkiniz yok', 403)
      arama = '?id=' + encodeURIComponent(bilgi.i)
    } else {
      return yanit('Sunucu yardımcısı için yetkiniz yok', 403)
    }
  }
  const targetUrl = target.href.replace(/\/+$/, '') + '/' + path + arama
  const headers = new Headers({ 'x-mubis-key': key })
  const contentType = request.headers.get('content-type')
  if (musteri && request.method === 'POST') headers.set('content-type', 'application/json')
  else if (contentType) headers.set('content-type', contentType)
  const init = { method: request.method, headers, redirect: 'manual' }
  if (request.method === 'POST') init.body = istekGovdesi

  try {
    const response = await fetch(targetUrl, init)
    if (response.status >= 300 && response.status < 400) return yanit('Sunucu yardımcısı yönlendirmesi reddedildi', 502)
    const responseHeaders = new Headers({ 'cache-control': 'no-store' })
    const responseType = response.headers.get('content-type')
    if (responseType) responseHeaders.set('content-type', responseType)
    if (musteri && response.ok) {
      const sonuc = await response.json()
      if (musteriId && sonuc?.success) {
        if (!/^is_\d+_[a-z0-9]+$/.test(sonuc.isId || '')) return yanit('Geçersiz sunucu yanıtı', 502)
        sonuc.isId = await isKimligiOlustur(key, userData.user.id, musteriId, sonuc.isId)
      } else if (musteriIsKimligi && sonuc?.isId) {
        sonuc.isId = musteriIsKimligi
      }
      return new Response(JSON.stringify(sonuc), { status: response.status, headers: responseHeaders })
    }
    return new Response(response.body, { status: response.status, headers: responseHeaders })
  } catch {
    return yanit('Sunucu yardımcısına ulaşılamadı', 502)
  }
}
