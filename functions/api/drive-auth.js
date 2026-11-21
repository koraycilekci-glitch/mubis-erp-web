// MUBIS - Google Drive OAuth2 baglanti akisi (Cloudflare Pages Function)
//
// GET  /api/drive-auth?action=start        -> Google izin ekranina yonlendirir
// GET  /api/drive-auth?code=...&state=...  -> kodu refresh token'a cevirip kaydeder
// GET  /api/drive-auth?action=status       -> baglanti durumu (Bearer gerekir)
// POST /api/drive-auth { action:'disconnect' } -> kayitli token'i siler
//
// Gerekli Cloudflare env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI

import { CORS, json, supabaseAdmin, dogrulaKullanici, accessTokenAl } from './_driveCommon.js'

const STATE_KEY = 'google_drive_oauth_state'
const TOKEN_KEY = 'google_drive_refresh_token'
const SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive'

// app_settings yardimcilari (GA4 anahtarlari)
async function ayarGetir(admin, anahtar) {
  try {
    const { data } = await admin.from('app_settings').select('value').eq('office_id', 1).eq('key', anahtar).maybeSingle()
    return data?.value || ''
  } catch { return '' }
}
async function ayarYaz(admin, anahtar, deger) {
  try {
    await admin.from('app_settings').upsert(
      { key: anahtar, value: String(deger ?? ''), updated_at: new Date().toISOString(), office_id: 1 },
      { onConflict: 'office_id,key' }
    )
    return true
  } catch { return false }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function onRequestGet({ request, env }) {
  let admin
  try {
    admin = supabaseAdmin(env)
  } catch (e) {
    return json({ ok: false, error: e.message }, 500)
  }

  const url = new URL(request.url)
  const action = url.searchParams.get('action') || ''
  const clientId = env?.GOOGLE_CLIENT_ID
  const clientSecret = env?.GOOGLE_CLIENT_SECRET
  const redirectUri = env?.GOOGLE_REDIRECT_URI

  try {
    // ---------------- DURUM ----------------
    if (action === 'status') {
      const kontrol = await dogrulaKullanici(request, env)
      if (!kontrol.ok) return json({ ok: false, error: kontrol.hata }, kontrol.kod)
      const { data } = await admin.from('app_settings').select('value').eq('office_id', 1).eq('key', TOKEN_KEY).maybeSingle()
      const kadro = await accessTokenAl(admin, env)
      return json({
        ok: true,
        bagli: !!kadro.ok,
        kaynak: env?.GOOGLE_REFRESH_TOKEN ? 'env' : (data?.value ? 'app_settings' : 'yok'),
        hata: kadro.ok ? '' : kadro.hata,
      })
    }

    // ---------------- GA4 DURUM + MULK LISTESI ----------------
    // Baglanti kurulmus mu, mulk secilmis mi? Secilmemisse erisilebilen
    // mulkleri (olcum kimlikleriyle) listeler — kullanici listeden secer.
    if (action === 'analytics-status') {
      const kontrol = await dogrulaKullanici(request, env)
      if (!kontrol.ok) return json({ ok: false, error: kontrol.hata }, kontrol.kod)
      if (!['super_admin', 'admin'].includes(String(kontrol.profil?.role || ''))) {
        return json({ ok: false, error: 'Bu islem icin yonetici yetkisi gerekir' }, 403)
      }
      const token = await ayarGetir(admin, 'ga4_refresh_token')
      const mulk = await ayarGetir(admin, 'ga4_property_id')
      const mulkAd = await ayarGetir(admin, 'ga4_property_name')
      if (!token) return json({ ok: true, bagli: false, mulk: '', mulkAd: '', adaylar: [] })

      // Token'i tazele
      let access = ''
      try {
        const yanit = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId || '',
            client_secret: clientSecret || '',
            refresh_token: token,
            grant_type: 'refresh_token'
          }).toString()
        })
        const j = await yanit.json().catch(() => ({}))
        access = j.access_token || ''
        if (!access) {
          return json({
            ok: true, bagli: false, mulk: '', mulkAd: '', adaylar: [],
            hata: 'Analytics yetkisi gecersiz veya iptal edilmis: ' + (j.error_description || j.error || 'token alinamadi')
          })
        }
      } catch { /* yoksay */ }

      const hedefKimlik = String(env?.GA_MEASUREMENT_ID || 'G-JQY5VG50Z0').trim()
      const adaylar = []
      try {
        const hdr = { Authorization: 'Bearer ' + access }
        const ozet = await (await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200', { headers: hdr })).json().catch(() => ({}))
        for (const hesap of (ozet.accountSummaries || [])) {
          for (const p of (hesap.propertySummaries || [])) {
            if (!p.property) continue
            const id = p.property.replace('properties/', '')
            const akislar = await (await fetch(`https://analyticsadmin.googleapis.com/v1beta/properties/${id}/dataStreams?pageSize=200`, { headers: hdr })).json().catch(() => ({}))
            const kimlikler = (akislar.dataStreams || []).map(s => String(s.webStreamData?.measurementId || '')).filter(Boolean)
            adaylar.push({ id, ad: p.displayName || '', hesap: hesap.displayName || '', kimlikler, eslesir: kimlikler.includes(hedefKimlik) })
          }
        }
      } catch (e) {
        return json({ ok: true, bagli: true, mulk, mulkAd, adaylar: [], hata: e?.message || 'Mulkler okunamadi' })
      }
      // Otomatik secim: olcum kimligi eslesen mulk
      if (!mulk) {
        const eslesen = adaylar.find(a => a.eslesir)
        if (eslesen) {
          await ayarYaz(admin, 'ga4_property_id', eslesen.id)
          await ayarYaz(admin, 'ga4_property_name', eslesen.ad)
          return json({ ok: true, bagli: true, mulk: eslesen.id, mulkAd: eslesen.ad, adaylar, otomatik: true })
        }
      }
      return json({ ok: true, bagli: true, mulk, mulkAd, adaylar })
    }

    // ---------------- OAUTH BASLAT ----------------
    if (action === 'start') {
      const kontrol = await dogrulaKullanici(request, env)
      if (!kontrol.ok) return json({ ok: false, error: kontrol.hata }, kontrol.kod)
      if (kontrol.profil?.role !== 'super_admin') return json({ ok: false, error: 'Bu islem icin sistem yoneticisi yetkisi gerekir' }, 403)
      if (!clientId || !clientSecret || !redirectUri) {
        return json({
          ok: false,
          error: 'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET ve GOOGLE_REDIRECT_URI tanimli olmali.',
        }, 500)
      }
      const state = crypto.randomUUID()
      // app_settings'in unique kısıtı (office_id, key) — onConflict ona göre olmalı
      const { error: stateHata } = await admin.from('app_settings').upsert(
        { key: STATE_KEY, value: state, updated_at: new Date().toISOString(), office_id: 1 },
        { onConflict: 'office_id,key' }
      )
      if (stateHata) {
        return json({ ok: false, error: 'Yetkilendirme hazirlanamadi: ' + stateHata.message }, 500)
      }
      const g = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      g.searchParams.set('client_id', clientId)
      g.searchParams.set('redirect_uri', redirectUri)
      g.searchParams.set('response_type', 'code')
      g.searchParams.set('scope', SCOPE)
      g.searchParams.set('access_type', 'offline')
      g.searchParams.set('prompt', 'consent')
      g.searchParams.set('state', state)
      return json({ ok: true, url: g.toString() }, 200, { 'Cache-Control': 'no-store' })
    }

    // ---------------- GA4 (ANALYTICS) OAUTH BASLAT ----------------
    // 2.8.356: Google Analytics paneli icin AYRI bir izin akisi. Drive
    // yetkisine DOKUNMAZ: yalniz analytics.readonly istenir ve token ayri
    // anahtarda (ga4_refresh_token) saklanir. Mulk numarasi, olcum kimligi
    // (G-...) ile eslesen veri akisindan OTOMATIK bulunur.
    if (action === 'analytics-start') {
      const kontrol = await dogrulaKullanici(request, env)
      if (!kontrol.ok) return json({ ok: false, error: kontrol.hata }, kontrol.kod)
      // Ofis yoneticisi de baglayabilir (salt okunur izin).
      if (!['super_admin', 'admin'].includes(String(kontrol.profil?.role || ''))) {
        return json({ ok: false, error: 'Bu islem icin yonetici yetkisi gerekir' }, 403)
      }
      if (!clientId || !clientSecret || !redirectUri) {
        return json({ ok: false, error: 'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET ve GOOGLE_REDIRECT_URI tanimli olmali.' }, 500)
      }
      const state = 'ga4:' + crypto.randomUUID()
      const { error: stateHata } = await admin.from('app_settings').upsert(
        { key: STATE_KEY, value: state, updated_at: new Date().toISOString(), office_id: 1 },
        { onConflict: 'office_id,key' }
      )
      if (stateHata) return json({ ok: false, error: 'Yetkilendirme hazirlanamadi: ' + stateHata.message }, 500)
      const g = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      g.searchParams.set('client_id', clientId)
      g.searchParams.set('redirect_uri', redirectUri)
      g.searchParams.set('response_type', 'code')
      g.searchParams.set('scope', 'https://www.googleapis.com/auth/analytics.readonly')
      g.searchParams.set('access_type', 'offline')
      g.searchParams.set('prompt', 'consent')
      g.searchParams.set('state', state)
      return json({ ok: true, url: g.toString() }, 200, { 'Cache-Control': 'no-store' })
    }

    // ---------------- OAUTH CALLBACK ----------------
    const code = url.searchParams.get('code')
    if (code) {
      const state = url.searchParams.get('state') || ''
      const { data: kayitli } = await admin.from('app_settings').select('value,updated_at').eq('office_id', 1).eq('key', STATE_KEY).maybeSingle()
      const age = Date.now() - Date.parse(kayitli?.updated_at || '')
      if (!kayitli?.value || kayitli.value !== String(state) || !Number.isFinite(age) || age < 0 || age > 10 * 60 * 1000) {
        return json({ ok: false, error: 'Gecersiz veya suresi gecmis yetkilendirme istegi (state uyusmuyor).' }, 400)
      }

      const consumed = await admin.from('app_settings').delete().eq('office_id', 1).eq('key', STATE_KEY).eq('value', state).select('key')
      if (consumed.error || consumed.data?.length !== 1) return json({ ok: false, error: 'Yetkilendirme istegi daha once kullanilmis' }, 400)
      const govde = new URLSearchParams({
        code,
        client_id: clientId || '',
        client_secret: clientSecret || '',
        redirect_uri: redirectUri || '',
        grant_type: 'authorization_code',
      })
      const yanit = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: govde.toString(),
      })
      const j = await yanit.json().catch(() => ({}))
      if (!yanit.ok || !j.refresh_token) {
        const mesaj = j?.error_description || j?.error || `HTTP ${yanit.status}`
        return json({
          ok: false,
          error: 'Google yetkilendirme tamamlanamadi: ' + mesaj + (j?.refresh_token ? '' : ' (refresh_token gelmedi — prompt=consent ile tekrar deneyin)'),
        }, 400)
      }

      // 2.8.356: GA4 izin akisi — token'i ayri sakla, mulku olcum kimliginden bul.
      if (String(state).startsWith('ga4:')) {
        const { error: ga4Hata } = await admin.from('app_settings').upsert(
          { key: 'ga4_refresh_token', value: j.refresh_token, updated_at: new Date().toISOString(), office_id: 1 },
          { onConflict: 'office_id,key' }
        )
        if (ga4Hata) return json({ ok: false, error: 'Analytics token kaydedilemedi: ' + ga4Hata.message }, 500)

        // Olcum kimligi (G-...) ile eslesen mulku Admin API'den bul.
        const hedefKimlik = String(env?.GA_MEASUREMENT_ID || 'G-JQY5VG50Z0').trim()
        let bulunanMulk = ''
        let bulunanAd = ''
        try {
          const hdr = { Authorization: 'Bearer ' + j.access_token }
          const ozet = await (await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200', { headers: hdr })).json().catch(() => ({}))
          const mulkler = []
          for (const hesap of (ozet.accountSummaries || [])) {
            for (const p of (hesap.propertySummaries || [])) {
              if (p.property) mulkler.push({ id: p.property.replace('properties/', ''), ad: p.displayName || '' })
            }
          }
          for (const m of mulkler) {
            const akislar = await (await fetch(`https://analyticsadmin.googleapis.com/v1beta/properties/${m.id}/dataStreams?pageSize=200`, { headers: hdr })).json().catch(() => ({}))
            const eslesen = (akislar.dataStreams || []).find(s => String(s.webStreamData?.measurementId || '') === hedefKimlik)
            if (eslesen) { bulunanMulk = m.id; bulunanAd = m.ad; break }
          }
        } catch { /* mulk bulunamadi — panelde elle girilebilir */ }

        if (bulunanMulk) {
          await admin.from('app_settings').upsert(
            { key: 'ga4_property_id', value: bulunanMulk, updated_at: new Date().toISOString(), office_id: 1 },
            { onConflict: 'office_id,key' }
          )
          if (bulunanAd) {
            try {
              await admin.from('app_settings').upsert(
                { key: 'ga4_property_name', value: bulunanAd, updated_at: new Date().toISOString(), office_id: 1 },
                { onConflict: 'office_id,key' }
              )
            } catch { /* yoksay */ }
          }
        }
        const hedef = new URL(redirectUri || url.origin)
        hedef.pathname = '/admin/ayarlar'
        hedef.search = bulunanMulk
          ? `?ga4=ok&mulk=${encodeURIComponent(bulunanMulk)}`
          : '?ga4=mulk-yok'
        return new Response(null, { status: 302, headers: { ...CORS, Location: hedef.toString() } })
      }

      const { error: tokenHata } = await admin.from('app_settings').upsert(
        { key: TOKEN_KEY, value: j.refresh_token, updated_at: new Date().toISOString(), office_id: 1 },
        { onConflict: 'office_id,key' }
      )
      if (tokenHata) {
        return json({ ok: false, error: 'Token kaydedilemedi: ' + tokenHata.message }, 500)
      }

      const hedef = new URL(redirectUri || url.origin)
      hedef.pathname = '/admin/ayarlar'
      hedef.search = '?drive=ok'
      return new Response(null, {
        status: 302,
        headers: { ...CORS, Location: hedef.toString() },
      })
    }

    return json({ ok: false, error: 'Gecersiz istek. action=start|status veya code bekleniyor.' }, 400)
  } catch (e) {
    return json({ ok: false, error: e?.message || 'Drive auth hatasi' }, 500)
  }
}

export async function onRequestPost({ request, env }) {
  let admin
  try {
    admin = supabaseAdmin(env)
  } catch (e) {
    return json({ ok: false, error: e.message }, 500)
  }

  const kontrol = await dogrulaKullanici(request, env)
  if (!kontrol.ok) return json({ ok: false, error: kontrol.hata }, kontrol.kod)
  const yonetici = ['super_admin', 'admin'].includes(String(kontrol.profil?.role || ''))

  try {
    const body = await request.json().catch(() => ({}))

    // GA4: mulk secimi / baglantiyi kaldirma (yonetici)
    if (body?.action === 'analytics-property') {
      if (!yonetici) return json({ ok: false, error: 'Bu islem icin yonetici yetkisi gerekir' }, 403)
      const id = String(body.mulk || '').replace(/^properties\//, '').trim()
      if (!/^\d{4,20}$/.test(id)) return json({ ok: false, error: 'Gecersiz mulk numarasi' }, 400)
      const ok1 = await ayarYaz(admin, 'ga4_property_id', id)
      const ok2 = await ayarYaz(admin, 'ga4_property_name', String(body.ad || '').slice(0, 200))
      if (!ok1) return json({ ok: false, error: 'Mulk numarasi kaydedilemedi' }, 503)
      return json({ ok: true, mulk: id })
    }
    if (body?.action === 'analytics-disconnect') {
      if (!yonetici) return json({ ok: false, error: 'Bu islem icin yonetici yetkisi gerekir' }, 403)
      await admin.from('app_settings').delete().eq('office_id', 1).in('key', ['ga4_refresh_token', 'ga4_property_id', 'ga4_property_name'])
      return json({ ok: true, mesaj: 'Analytics baglantisi kaldirildi.' })
    }

    if (kontrol.profil?.role !== 'super_admin') {
      return json({ ok: false, error: 'Bu islem icin sistem yoneticisi yetkisi gerekir' }, 403)
    }
    if (body?.action !== 'disconnect') {
      return json({ ok: false, error: "action 'disconnect' bekleniyor" }, 400)
    }
    if (env.GOOGLE_REFRESH_TOKEN) return json({ ok: false, error: 'Baglanti ortam ayariyla yonetiliyor; sistem yoneticisi ortamdaki Drive yetkisini kaldirmali' }, 409)
    const removed = await admin.from('app_settings').delete().eq('office_id', 1).eq('key', TOKEN_KEY)
    if (removed.error) return json({ ok: false, error: 'Drive baglantisi kaldirilamadi' }, 503)
    return json({ ok: true, mesaj: 'Google Drive baglantisi kaldirildi.' })
  } catch (e) {
    return json({ ok: false, error: e?.message || 'Baglanti kaldirilamadi' }, 500)
  }
}
