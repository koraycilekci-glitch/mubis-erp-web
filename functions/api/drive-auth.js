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
      const { data } = await admin.from('app_settings').select('value').eq('key', TOKEN_KEY).maybeSingle()
      const kadro = await accessTokenAl(admin, env)
      return json({
        ok: true,
        bagli: !!kadro.ok,
        kaynak: env?.GOOGLE_REFRESH_TOKEN ? 'env' : (data?.value ? 'app_settings' : 'yok'),
        hata: kadro.ok ? '' : kadro.hata,
      })
    }

    // ---------------- OAUTH BASLAT ----------------
    if (action === 'start') {
      if (!clientId || !clientSecret || !redirectUri) {
        return json({
          ok: false,
          error: 'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET ve GOOGLE_REDIRECT_URI tanimli olmali.',
        }, 500)
      }
      const state = Math.random().toString(36).slice(2) + Date.now().toString(36)
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
      return new Response(null, {
        status: 302,
        headers: { ...CORS, Location: g.toString() },
      })
    }

    // ---------------- OAUTH CALLBACK ----------------
    const code = url.searchParams.get('code')
    if (code) {
      const state = url.searchParams.get('state') || ''
      const { data: kayitli } = await admin.from('app_settings').select('value').eq('key', STATE_KEY).maybeSingle()
      if (!kayitli?.value || kayitli.value !== String(state)) {
        return json({ ok: false, error: 'Gecersiz veya suresi gecmis yetkilendirme istegi (state uyusmuyor).' }, 400)
      }

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

      const { error: tokenHata } = await admin.from('app_settings').upsert(
        { key: TOKEN_KEY, value: j.refresh_token, updated_at: new Date().toISOString(), office_id: 1 },
        { onConflict: 'office_id,key' }
      )
      if (tokenHata) {
        return json({ ok: false, error: 'Token kaydedilemedi: ' + tokenHata.message }, 500)
      }
      await admin.from('app_settings').delete().eq('key', STATE_KEY)

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
  if (kontrol.profil?.role !== 'super_admin') {
    return json({ ok: false, error: 'Bu islem icin sistem yoneticisi yetkisi gerekir' }, 403)
  }

  try {
    const body = await request.json().catch(() => ({}))
    if (body?.action !== 'disconnect') {
      return json({ ok: false, error: "action 'disconnect' bekleniyor" }, 400)
    }
    await admin.from('app_settings').delete().eq('key', TOKEN_KEY)
    return json({ ok: true, mesaj: 'Google Drive baglantisi kaldirildi.' })
  } catch (e) {
    return json({ ok: false, error: e?.message || 'Baglanti kaldirilamadi' }, 500)
  }
}
