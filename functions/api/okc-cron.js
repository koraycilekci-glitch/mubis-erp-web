// Otomatik OKC HAsIlat / Bildirim sorgulama plani (VPS poller).
// GET    ?sunucu=1 -> VPS: plan + aktif musterilerin DVS giris bilgileri (x-mubis-key)
// GET    (JWT)     -> admin: plan
// POST   (JWT)     -> admin plan kaydet (app_settings: okc_cron_plan)
// PATCH  (x-mubis-key) -> VPS sonuclari: kdv_dokumleri (tur='okc') upsert + plan son_calisma
// DELETE (JWT)     -> plan iptal
import { supabaseAdmin, json } from './_lib.js'

const PLAN_KEY = 'okc_cron_plan'

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

async function planOku(supabase) {
  const { data } = await supabase.from('app_settings')
    .select('key,value,office_id')
    .eq('key', PLAN_KEY)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data?.value) return null
  try {
    return typeof data.value === 'string' ? JSON.parse(data.value) : data.value
  } catch { return null }
}

async function planYaz(supabase, plan) {
  // office_id,key tekil; upsert
  const { error } = await supabase.from('app_settings').upsert({
    key: PLAN_KEY,
    value: JSON.stringify(plan),
    office_id: 1
  }, { onConflict: 'office_id,key' })
  if (error) throw new Error(error.message)
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 })
}

export async function onRequestGet({ env, request }) {
  const supabase = supabaseAdmin(env)
  if (!supabase) return json({ error: 'Supabase credentials missing' }, 500)
  const url = new URL(request.url)

  if (url.searchParams.get('sunucu') === '1') {
    if (!anahtarUydu(env, request)) return json({ ok: false, error: 'yetkisiz' }, 401)
    const [plan, { data: musteriler }, { data: okcKayitlar }] = await Promise.all([
      planOku(supabase),
      supabase.from('clients').select('id,name,short_name,office_id,vkn,tc,dvs_username,dvs_password,close_date').order('name', { ascending: true }),
      supabase.from('kdv_dokumleri').select('client_id,yil,ay,tur,toplam_tutar').eq('tur', 'okc')
    ])
    const aktifler = (musteriler || []).filter(m => !m.close_date).map(({ close_date, ...rest }) => rest)
    const mevcut = {}
    for (const k of (okcKayitlar || [])) {
      const deger = Number(k.toplam_tutar) || 0
      if (deger > 0) mevcut[`${k.client_id}|okc|${k.yil}|${k.ay}`] = deger
    }
    return json({ ok: true, plan: plan || null, musteriler: aktifler, mevcut })
  }

  const prof = await jwtProfili(supabase, request)
  if (!adminMi(prof)) return json({ ok: false, error: 'yetkisiz' }, 401)
  const plan = await planOku(supabase)
  return json({ ok: true, plan })
}

export async function onRequestPost({ env, request }) {
  const supabase = supabaseAdmin(env)
  if (!supabase) return json({ error: 'Supabase credentials missing' }, 500)
  const prof = await jwtProfili(supabase, request)
  if (!adminMi(prof)) return json({ ok: false, error: 'yetkisiz' }, 401)

  let govde = {}
  try { govde = await request.json() } catch { return json({ ok: false, error: 'gecersiz govde' }, 400) }

  const zamanlariNormalize = (liste) => Array.isArray(liste)
    ? liste.map(z => {
      const mod = z?.mod === 'haftalik' ? 'haftalik' : 'gunluk'
      return {
        mod,
        gunler_ay: Array.isArray(z?.gunler_ay)
          ? [...new Set(z.gunler_ay.map(Number).filter(n => n >= 1 && n <= 31))].sort((a, b) => a - b)
          : [],
        hafta_gunleri: Array.isArray(z?.hafta_gunleri)
          ? [...new Set(z.hafta_gunleri.map(Number).filter(n => n >= 1 && n <= 7))].sort((a, b) => a - b)
          : [],
        saat: /^\d{1,2}:\d{2}$/.test(String(z?.saat || '')) ? z.saat : null
      }
    }).filter(z => z.saat && (z.mod === 'haftalik' ? z.hafta_gunleri.length : z.gunler_ay.length))
    : []

  const zamanlar = zamanlariNormalize(govde.zamanlar)
  if (!zamanlar.length) return json({ ok: false, error: 'eksik-alanlar' }, 400)

  const plan = {
    aktif: govde.aktif !== false,
    zamanlar,
    yenidenOku: govde.yenidenOku === true,
    musteriler: Array.isArray(govde.musteriler) ? govde.musteriler.map(Number).filter(Boolean) : [],
    detay: govde.detay !== false
  }
  const eskiPlan = (await planOku(supabase)) || {}
  plan.son_calisma = eskiPlan.son_calisma || null
  plan.son_sonuc = eskiPlan.son_sonuc || null
  plan.son_turlar = eskiPlan.son_turlar || {}
  plan.created_at = eskiPlan.created_at || new Date().toISOString()
  try {
    await planYaz(supabase, plan)
  } catch (e) {
    return json({ ok: false, error: e.message }, 500)
  }
  return json({ ok: true, plan })
}

export async function onRequestPatch({ env, request }) {
  const supabase = supabaseAdmin(env)
  if (!supabase) return json({ error: 'Supabase credentials missing' }, 500)
  if (!anahtarUydu(env, request)) return json({ ok: false, error: 'yetkisiz' }, 401)
  let govde = {}
  try { govde = await request.json() } catch { return json({ ok: false, error: 'gecersiz govde' }, 400) }

  // --- Musteri bazli OKC sonucu: kdv_dokumleri (tur='okc') upsert ---
  if (govde.tip === 'sonuc') {
    const clientId = Number(govde.client_id)
    if (!clientId) return json({ ok: false, error: 'client-yok' }, 400)
    if (govde.hata) return json({ ok: true, hataKaydedildi: true })
    let officeId = govde.office_id || null
    if (!officeId) {
      const { data: cl } = await supabase.from('clients').select('office_id').eq('id', clientId).maybeSingle()
      officeId = cl?.office_id || null
    }
    if (!officeId) return json({ ok: false, error: 'office-yok' }, 400)
    const bugun = new Date().toISOString().slice(0, 10)
    const s = govde.sonuc || {}
    const { error } = await supabase.from('kdv_dokumleri').upsert({
      office_id: officeId,
      client_id: clientId,
      yil: Number(govde.yil),
      ay: Number(govde.ay),
      tur: 'okc',
      toplam_tutar: Number(s.toplam_satis) || 0,
      detaylar: s.kayitlar || [],
      sorgu_tarihi: bugun,
      kaynak: 'otomatik'
    }, { onConflict: 'office_id,client_id,yil,ay,tur' })
    if (error) return json({ ok: false, error: error.message }, 500)
    return json({ ok: true })
  }

  // --- Plan sonucu ---
  const plan = (await planOku(supabase)) || {}
  const yeniSonTurlar = { ...(plan.son_turlar && typeof plan.son_turlar === 'object' ? plan.son_turlar : {}), ...(govde.son_turlar && typeof govde.son_turlar === 'object' ? govde.son_turlar : {}) }
  const yeniPlan = {
    ...plan,
    son_calisma: new Date().toISOString(),
    son_sonuc: govde.sonuc || null,
    son_turlar: yeniSonTurlar
  }
  try { await planYaz(supabase, yeniPlan) } catch (e) { return json({ ok: false, error: e.message }, 500) }
  if (govde.sonuc?.ozet) {
    await supabase.from('notifications').insert({
      audience: 'admin',
      type: 'okc_cron',
      title: 'Otomatik ÖKC hasılat sorgulama',
      message: String(govde.sonuc.ozet).slice(0, 400),
      route: '/admin/ayarlar'
    })
  }
  return json({ ok: true })
}

export async function onRequestDelete({ env, request }) {
  const supabase = supabaseAdmin(env)
  if (!supabase) return json({ error: 'Supabase credentials missing' }, 500)
  const prof = await jwtProfili(supabase, request)
  if (!adminMi(prof)) return json({ ok: false, error: 'yetkisiz' }, 401)
  const { error } = await supabase.from('app_settings').delete().eq('key', PLAN_KEY)
  if (error) return json({ ok: false, error: error.message }, 500)
  return json({ ok: true })
}
