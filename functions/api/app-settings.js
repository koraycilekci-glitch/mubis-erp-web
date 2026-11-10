// MUBIS - app_settings yazma/silme koprusu.
// Musteri rolleri app_settings uzerindeki RLS INSERT/DELETE politikasindan
// gecemedigi icin (fatura kesim taslaklari vb.) servis anahtari ile yazar.
// Tum istekler gecerli bir Supabase erisim tokeni gerektirir.
import { CORS, json } from './_lib.js'

const SB_URL = 'https://gxuqrxmpgoeyykoolmwv.supabase.co'

function svcHeaders(env) {
  const key = env?.SUPABASE_SERVICE_ROLE_KEY || env?.SUPABASE_SERVICE_KEY
  if (!key) return null
  return { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' }
}

async function authKontrol(request, env) {
  const auth = request.headers.get('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return false
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { 'apikey': env?.SUPABASE_SERVICE_ROLE_KEY || env?.SUPABASE_SERVICE_KEY || '', 'Authorization': `Bearer ${token}` }
    })
    return r.ok
  } catch { return false }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function onRequestPost({ request, env }) {
  const SvcH = svcHeaders(env)
  if (!SvcH) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY tanimli degil' }, 500)
  if (!(await authKontrol(request, env))) return json({ error: 'Yetkisiz (oturum gecerli degil)' }, 401)
  try {
    const body = await request.json()
    const key = String(body?.key || '').trim()
    if (!key) return json({ error: 'key zorunlu' }, 400)
    const officeId = Number(body?.office_id) || 1
    const r = await fetch(`${SB_URL}/rest/v1/app_settings?on_conflict=office_id,key`, {
      method: 'POST',
      headers: { ...SvcH, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key, value: String(body?.value ?? ''), office_id: officeId })
    })
    if (!r.ok) return json({ error: `app_settings yazilamadi (${r.status}): ${await r.text()}` }, 502)
    return json({ ok: true })
  } catch (e) {
    return json({ error: e?.message || 'sunucu hatasi' }, 500)
  }
}

export async function onRequestDelete({ request, env }) {
  const SvcH = svcHeaders(env)
  if (!SvcH) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY tanimli degil' }, 500)
  if (!(await authKontrol(request, env))) return json({ error: 'Yetkisiz (oturum gecerli degil)' }, 401)
  try {
    const url = new URL(request.url)
    const key = url.searchParams.get('key')
    if (!key) return json({ error: 'key zorunlu' }, 400)
    const officeId = Number(url.searchParams.get('office_id')) || 1
    const q = new URLSearchParams({ key: `eq.${key}`, office_id: `eq.${officeId}` })
    const r = await fetch(`${SB_URL}/rest/v1/app_settings?${q}`, { method: 'DELETE', headers: SvcH })
    if (!r.ok) return json({ error: `app_settings silinemedi (${r.status}): ${await r.text()}` }, 502)
    return json({ ok: true })
  } catch (e) {
    return json({ error: e?.message || 'sunucu hatasi' }, 500)
  }
}
