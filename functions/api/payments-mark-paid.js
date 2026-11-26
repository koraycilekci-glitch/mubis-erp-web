// MUBIS - Odemeyi "Odendi" olarak isaretle (Cloudflare Pages Function)
// POST /api/payments-mark-paid
// Body: { paymentId, donem }
// Auth: Authorization: Bearer <supabase access token> (admin/personel/super_admin)
// SUPABASE_SERVICE_ROLE_KEY ile RLS'i asarak islemler (istemci tarafinda RLS
// sizintisi/sansurlenen 23503 sorununu asar).
import { createClient } from '@supabase/supabase-js'

export async function onRequestPost({ request, env }) {
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })

  // Supabase proje adresi zaten on yüzde acik (gizli degil); env'de yoksa gore.
  const url = env?.VITE_SUPABASE_URL || env?.SUPABASE_URL || 'https://gxuqrxmpgoeyykoolmwv.supabase.co'
  const serviceKey = env?.SUPABASE_SERVICE_ROLE_KEY || env?.SUPABASE_SERVICE_KEY
  if (!url) {
    return json({ error: 'VITE_SUPABASE_URL degiskeni tanimli degil (Production ortami). Cloudflare Pages > Settings > Variables and Secrets bolumune ekleyin.' }, 500)
  }
  if (!serviceKey) {
    return json({ error: 'SUPABASE_SERVICE_ROLE_KEY degiskeni tanimli degil (Production ortami). Cloudflare Pages > Settings > Variables and Secrets > Production sekmesine aynen bu isimle ekleyin, sonra bir deploy gerekiyor.' }, 500)
  }

  // Cagiran kullaniciyi dogrula
  const auth = request.headers.get('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const admin = createClient(url, serviceKey)
  if (!token) return json({ error: 'Oturum token\'i eksik' }, 401)
  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userData?.user) return json({ error: 'Gecersiz oturum' }, 401)
  const { data: profile } = await admin.from('profiles').select('role, office_id').eq('id', userData.user.id).maybeSingle()
  const rol = profile?.role
  if (!['super_admin', 'admin', 'personel'].includes(rol)) {
    return json({ error: 'Bu islem icin yetkiniz yok (rol: ' + (rol || '?') + ')' }, 403)
  }

  let body = {}
  try { body = await request.json() } catch { return json({ error: 'Gecersiz JSON govdesi' }, 400) }
  const paymentId = parseInt(body.paymentId)
  if (!paymentId) return json({ error: 'paymentId gerekli' }, 400)
  const donem = body.donem || ''

  const { data: mevcutOdeme, error: okumaHatasi } = await admin
    .from('payments')
    .select('client_id, office_id')
    .eq('id', paymentId)
    .maybeSingle()
  if (okumaHatasi) return json({ error: 'Odeme kaydi okunamadi' }, 500)
  if (!mevcutOdeme) return json({ error: 'Odeme kaydi bulunamadi' }, 404)
  if (rol !== 'super_admin') {
    const { data: musteri, error: musteriHatasi } = await admin
      .from('clients')
      .select('office_id')
      .eq('id', mevcutOdeme.client_id)
      .maybeSingle()
    if (musteriHatasi) return json({ error: 'Musteri yetkisi dogrulanamadi' }, 500)
    if (!profile.office_id || !musteri?.office_id || profile.office_id !== musteri.office_id ||
      (mevcutOdeme.office_id != null && mevcutOdeme.office_id !== musteri.office_id)) {
      return json({ error: 'Bu odeme icin yetkiniz yok' }, 403)
    }
  }

  const kullanici = createClient(url, serviceKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  })
  let odemeSorgusu = kullanici
    .from('payments')
    .update({ durum: 'uygulandi', donem, red_sebebi: null })
    .eq('id', paymentId)
  if (mevcutOdeme.client_id == null) odemeSorgusu = odemeSorgusu.is('client_id', null)
  else odemeSorgusu = odemeSorgusu.eq('client_id', mevcutOdeme.client_id)
  const { data: pay, error: payErr } = await odemeSorgusu.select().maybeSingle()
  if (payErr) return json({ error: 'Odeme isleme hatasi: ' + (payErr.message || ''), code: payErr.code || null }, 500)
  if (!pay) return json({ error: 'Odeme kaydi bulunamadi' }, 404)

  // Musteri bildirimi (best-effort)
  try {
    await admin.from('notifications').insert({
      client_id: pay.client_id,
      audience: 'client',
      type: 'odeme',
      title: 'Odemeniz Borctan Dusuldu',
      message: `${Number(pay.tutar || 0).toLocaleString('tr-TR')} TL tutarindaki odemeniz borctan dusuldu.`,
      route: '/portal?tab=borc',
      is_read: false
    })
  } catch (notifErr) {
    console.error('Musteri odeme bildirimi hatasi:', notifErr)
  }

  return json({ ok: true, payment: pay })
}
