// MUBIS - e-Tebligat OTOMATIK GONDERIM calistirici (VPS poller cagirir)
// GET ?sunucu=1 -> plan oku + vadesi kontrol + gonderimi yap + son_calisma guncelle
import { supabaseAdmin, json } from './_lib.js'

function anahtarUydu(env, request) {
  const beklenen = env?.MUBIS_SUNUCU_ANAHTARI
  return Boolean(beklenen) && request.headers.get('x-mubis-key') === beklenen
}

const PLAN_KEY = 'etebligat_gonderim_v1'

export async function onRequestGet({ env, request }) {
  const supabase = supabaseAdmin(env)
  if (!supabase) return json({ error: 'Supabase credentials missing' }, 500)
  const url = new URL(request.url)
  if (url.searchParams.get('sunucu') !== '1') return json({ ok: false, error: 'yetkisiz' }, 401)
  // anahtar kontrolu (etebligat-cron ile ayni: sunucu=1 yeterli)

  // Plan oku
  let plan = null
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', PLAN_KEY).limit(1).maybeSingle()
    if (data?.value) plan = typeof data.value === 'string' ? JSON.parse(data.value) : data.value
  } catch { plan = null }
  if (!plan || plan.aktif !== true) return json({ ok: true, vadesi: false, reason: 'plan-pasif' })

  const gunler = Array.isArray(plan.gunler) ? plan.gunler.map(Number) : []
  const now = new Date()
  const gun = now.getDay()
  const haftaEslesir = gunler.filter(n => n >= 0 && n <= 6).includes(gun)
  const ayGunuEslesir = gunler.filter(n => n >= 101 && n <= 131).map(n => n - 100).includes(now.getDate())
  if (!haftaEslesir && !ayGunuEslesir) return json({ ok: true, vadesi: false, reason: 'gun-eslesmedi' })
  if (!/^\d{1,2}:\d{2}$/.test(String(plan.saat || '')) || String(plan.saat) > String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')) {
    return json({ ok: true, vadesi: false, reason: 'saat-gelmedi' })
  }
  // son_calisma kontrolu
  const bugunStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0')
  if (plan.son_calisma) {
    try {
      const d = new Date(plan.son_calisma)
      const sonStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
      if (sonStr >= bugunStr) return json({ ok: true, vadesi: false, reason: 'bugun-calisti' })
    } catch { /* devam */ }
  }

  const kanal = plan.kanal || 'tercih'
  const musteriIds = Array.isArray(plan.musteriler) && plan.musteriler.length ? plan.musteriler : null

  // Musteri listesi
  let musteriler = []
  try {
    const url = SB_URL_BASE() + '/rest/v1/clients?select=id,name,company_name,phone,email,phonenumbers,emails,beyan_durumlari&' + (musteriIds ? 'id=in.(' + musteriIds.join(',') + ')' : 'limit=500')
    const r = await fetch(url, { headers: svcHeaders(env) })
    if (r.ok) musteriler = await r.json()
  } catch { musteriler = [] }
  if (!Array.isArray(musteriler)) musteriler = []

  let gonderilen = 0, hatali = 0, atlanan = 0
  const hatalar = []
  const SB = SB_URL_BASE()
  const SVC = svcHeaders(env)
  const BASE = new URL(request.url).origin

  for (const m of musteriler) {
    // Bu musterinin gonderilmemis tebligatlarini bul
    let tebligatlar = []
    try {
      const r = await fetch(`${SB}/rest/v1/etebligatlar?client_id=eq.${m.id}&select=belge_no,file_url&or=(whatsapp_gonderim_ts.is.null,email_gonderim_ts.is.null)`, { headers: SVC })
      if (r.ok) tebligatlar = await r.json()
    } catch { tebligatlar = [] }
    if (!Array.isArray(tebligatlar)) tebligatlar = []

    for (const t of tebligatlar) {
      if (!t?.belge_no) continue
      try {
        const r = await fetch(`${BASE}/api/etebligat-gonder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-mubis-key': env?.MUBIS_SUNUCU_ANAHTARI || '' },
          body: JSON.stringify({ client_id: m.id, belge_no: t.belge_no, file_url: t.file_url || '', kanal })
        })
        const j = await r.json().catch(() => ({}))
        if (j?.ok) gonderilen++
        else if (j?.atlandi) atlanan++
        else { hatali++; hatalar.push(`${m.id}/${t.belge_no}: ${j?.error || 'hata'}`) }
      } catch (e) {
        hatali++; hatalar.push(`${m.id}/${t.belge_no}: ${e?.message || 'hata'}`)
      }
    }
  }

  // son_calisma guncelle
  plan.son_calisma = new Date().toISOString()
  try {
    await supabase.from('app_settings').upsert({ key: PLAN_KEY, value: JSON.stringify(plan) }, { onConflict: 'key' })
  } catch { /* yoksay */ }

  return json({ ok: true, vadesi: true, gonderilen, atlanan, hatali, hatalar: hatalar.slice(0, 10) })
}

function SB_URL_BASE() { return 'https://gxuqrxmpgoeyykoolmwv.supabase.co' }
function svcHeaders(env) {
  const key = env?.SUPABASE_SERVICE_ROLE_KEY || env?.SUPABASE_SERVICE_KEY
  if (!key) return null
  return { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' }
}
