// 2.8.3: e-Tebligat bildirim listesi — MUBiS yardimci programi (PC tray)
// 60 saniyede bir yoklar; web sayfasi kapaliyken bile yeni tebligat uyarisi
// icin. Yanit: notifications tablosundaki okunmamis e-tebligat bildirimleri.
import { supabaseAdmin } from './_lib'

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  })
}

export async function onRequestGet({ env, request }) {
  const beklenen = env?.MUBIS_DESKTOP_ANAHTARI
  if (!beklenen || request.headers.get('x-mubis-key') !== beklenen) {
    return json({ ok: false, error: 'yetkisiz' }, 401)
  }
  const officeId = String(env?.YARDIMCI_OFFICE_ID || '').trim()
  if (!/^\d+$/.test(officeId) || officeId === '0') return json({ ok: false, error: 'ofis-yapilandirilmamis' }, 503)
  const supabase = supabaseAdmin(env)
  if (!supabase) return json({ ok: false, error: 'Supabase credentials missing' }, 500)

  const { data, error } = await supabase
    .from('notifications')
    .select('id, title, message, route, created_at, clients!inner(office_id)')
    .eq('clients.office_id', Number(officeId))
    .eq('type', 'etebligat')
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) return json({ ok: false, error: error.message }, 500)

  return json({
    ok: true,
    bildirimler: (data || []).map(b => ({
      id: b.id,
      title: b.title,
      message: b.message,
      route: b.route || '/admin/etebligatlar'
    }))
  })
}
