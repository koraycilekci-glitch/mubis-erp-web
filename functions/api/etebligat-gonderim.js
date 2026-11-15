// MUBIS - e-Tebligat OTOMATIK GONDERIM plani (Cloudflare Pages Function)
// Tek global plan: app_settings.etebligat_gonderim_v1 (JSON)
// GET    (JWT)            -> admin UI: plan
// GET    ?sunucu=1       -> VPS poller: plan (x-mubis-key)
// POST   (JWT)            -> admin: plan kaydet
// DELETE (JWT)            -> plan iptal
import { supabaseAdmin, json } from './_lib.js'

function anahtarUydu(env, request) {
  const beklenen = env?.MUBIS_SUNUCU_ANAHTARI
  return Boolean(beklenen) && request.headers.get('x-mubis-key') === beklenen
}

async function jwtProfili(supabase, request) {
  const auth = request.headers.get('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null
  const { data } = await supabase.auth.getUser(token)
  if (!data?.user) return null
  const { data: prof } = await supabase.from('profiles').select('id, role, client_id').eq('id', data.user.id).maybeSingle()
  return prof || { id: data.user.id, role: null, client_id: null }
}

const adminMi = (p) => p && ['admin', 'personel', 'super_admin'].includes(String(p.role || ''))

const PLAN_KEY = 'etebligat_gonderim_v1'

async function planOku(supabase) {
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', PLAN_KEY).limit(1).maybeSingle()
    if (!data?.value) return null
    return typeof data.value === 'string' ? JSON.parse(data.value) : data.value
  } catch { return null }
}

export async function onRequestGet({ env, request }) {
  const supabase = supabaseAdmin(env)
  if (!supabase) return json({ error: 'Supabase credentials missing' }, 500)
  const url = new URL(request.url)
  if (url.searchParams.get('sunucu') === '1') {
    if (!anahtarUydu(env, request)) return json({ ok: false, error: 'yetkisiz' }, 401)
    const plan = await planOku(supabase)
    return json({ ok: true, plan: plan || null })
  }
  const prof = await jwtProfili(supabase, request)
  if (!adminMi(prof)) return json({ ok: false, error: 'yetkisiz' }, 401)
  const plan = await planOku(supabase)
  return json({ ok: true, plan: plan || null })
}

export async function onRequestPost({ env, request }) {
  const supabase = supabaseAdmin(env)
  if (!supabase) return json({ error: 'Supabase credentials missing' }, 500)
  const prof = await jwtProfili(supabase, request)
  if (!adminMi(prof)) return json({ ok: false, error: 'yetkisiz' }, 401)
  let govde = {}
  try { govde = await request.json() } catch { return json({ ok: false, error: 'gecersiz govde' }, 400) }

  const gunler = Array.isArray(govde.gunler) ? govde.gunler.map(Number).filter(n => (n >= 0 && n <= 6) || (n >= 101 && n <= 131)) : []
  const saat = /^\d{1,2}:\d{2}$/.test(String(govde.saat || '')) ? String(govde.saat) : null
  const kanal = ['tercih', 'whatsapp', 'email', 'ikisi'].includes(govde.kanal) ? govde.kanal : 'tercih'
  const musteriler = Array.isArray(govde.musteriler) ? govde.musteriler.map(Number).filter(n => n > 0) : []
  if (!gunler.length) return json({ ok: false, error: 'gun-secilmedi' }, 400)
  if (!saat) return json({ ok: false, error: 'saat-gecersiz' }, 400)

  const plan = { aktif: govde.aktif !== false, gunler, saat, kanal, musteriler, guncelleme: new Date().toISOString() }
  const { error } = await supabase.from('app_settings').upsert({ key: PLAN_KEY, value: JSON.stringify(plan), office_id: 1 }, { onConflict: 'office_id,key' })
  if (error) {
    const { error: e2 } = await supabase.from('app_settings').insert({ key: PLAN_KEY, value: JSON.stringify(plan) })
    if (e2) return json({ ok: false, error: e2.message }, 500)
  }
  return json({ ok: true, plan })
}

export async function onRequestDelete({ env, request }) {
  const supabase = supabaseAdmin(env)
  if (!supabase) return json({ error: 'Supabase credentials missing' }, 500)
  const prof = await jwtProfili(supabase, request)
  if (!adminMi(prof)) return json({ ok: false, error: 'yetkisiz' }, 401)
  await supabase.from('app_settings').delete().eq('key', PLAN_KEY)
  return json({ ok: true })
}
