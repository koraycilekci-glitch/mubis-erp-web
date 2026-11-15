// api/drive-auth.js
// Google Drive OAuth2 baglanti akisi (sunucu tarafi).
//
// Kullanim:
//   GET /api/drive-auth?action=start      -> Google izin ekranina yonlendirir
//   GET /api/drive-auth?code=...&state=... -> kodu refresh token'a cevirip kaydeder
//   GET /api/drive-auth?action=status     -> baglanti durumu (Bearer gerekir)
//   POST /api/drive-auth { action: 'disconnect' } -> kayitli token'i siler
//
// Gerekli Vercel env:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI

import { cors, supabaseAdmin, dogrulaKullanici, accessTokenAl } from './_driveCommon.js'

const STATE_KEY = 'google_drive_oauth_state'
const TOKEN_KEY = 'google_drive_refresh_token'
const SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive'

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI

  let admin
  try {
    admin = supabaseAdmin()
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message })
  }

  try {
    // ---------------- DURUM ----------------
    if (req.method === 'GET' && req.query?.action === 'status') {
      const kontrol = await dogrulaKullanici(req)
      if (!kontrol.ok) return res.status(kontrol.kod).json({ ok: false, error: kontrol.hata })
      const { data } = await admin.from('app_settings').select('value').eq('key', TOKEN_KEY).maybeSingle()
      const kadro = await accessTokenAl(admin)
      return res.status(200).json({
        ok: true,
        bagli: !!kadro.ok,
        kaynak: process.env.GOOGLE_REFRESH_TOKEN ? 'env' : (data?.value ? 'app_settings' : 'yok'),
        hata: kadro.ok ? '' : kadro.hata,
      })
    }

    // ---------------- BAGLANTIYI KES ----------------
    if (req.method === 'POST' && req.body?.action === 'disconnect') {
      const kontrol = await dogrulaKullanici(req)
      if (!kontrol.ok) return res.status(kontrol.kod).json({ ok: false, error: kontrol.hata })
      if (kontrol.profil?.role !== 'super_admin') {
        return res.status(403).json({ ok: false, error: 'Bu islem icin sistem yoneticisi yetkisi gerekir' })
      }
      await admin.from('app_settings').delete().eq('key', TOKEN_KEY)
      return res.status(200).json({ ok: true, mesaj: 'Google Drive baglantisi kaldirildi.' })
    }

    // ---------------- OAUTH BASLAT ----------------
    if (req.method === 'GET' && req.query?.action === 'start') {
      if (!clientId || !clientSecret || !redirectUri) {
        return res.status(500).json({
          ok: false,
          error: 'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET ve GOOGLE_REDIRECT_URI tanimli olmali.',
        })
      }
      const state = Math.random().toString(36).slice(2) + Date.now().toString(36)
      await admin.from('app_settings').upsert(
        { key: STATE_KEY, value: state, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      )
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      url.searchParams.set('client_id', clientId)
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('scope', SCOPE)
      url.searchParams.set('access_type', 'offline')
      url.searchParams.set('prompt', 'consent')
      url.searchParams.set('state', state)
      res.setHeader('Location', url.toString())
      return res.status(302).end()
    }

    // ---------------- OAUTH CALLBACK ----------------
    if (req.method === 'GET' && req.query?.code) {
      const { code, state } = req.query
      const { data: kayitli } = await admin.from('app_settings').select('value').eq('key', STATE_KEY).maybeSingle()
      if (!kayitli?.value || kayitli.value !== String(state || '')) {
        return res.status(400).json({ ok: false, error: 'Gecersiz veya suresi gecmis yetkilendirme istegi (state uyusmuyor).' })
      }

      const govde = new URLSearchParams({
        code: String(code),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      })
      const yanit = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: govde.toString(),
      })
      const json = await yanit.json().catch(() => ({}))
      if (!yanit.ok || !json.refresh_token) {
        const mesaj = json?.error_description || json?.error || `HTTP ${yanit.status}`
        return res.status(400).json({
          ok: false,
          error: 'Google yetkilendirme tamamlanamadi: ' + mesaj + (json?.refresh_token ? '' : ' (refresh_token gelmedi — prompt=consent ile tekrar deneyin)'),
        })
      }

      await admin.from('app_settings').upsert(
        { key: TOKEN_KEY, value: json.refresh_token, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      )
      await admin.from('app_settings').delete().eq('key', STATE_KEY)

      const hedef = new URL(redirectUri)
      hedef.pathname = '/admin/ayarlar'
      hedef.search = '?drive=ok'
      res.setHeader('Location', hedef.toString())
      return res.status(302).end()
    }

    return res.status(400).json({ ok: false, error: 'Gecersiz istek. action=start|status veya code bekleniyor.' })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'Drive auth hatasi' })
  }
}
