// 2.8.5: Otomatik vergi + SGK borc sorgulama (VPS) plani.
// GET    ?sunucu=1 -> VPS poller: plan + aktif musterilerin giris bilgileri (x-mubis-key)
// GET    (JWT)     -> admin: plan + son sonuc
// POST   (JWT)     -> admin plan kaydet (tek satir upsert)
// PATCH  (x-mubis-key) -> VPS sonuclari: borc_sonuclari upsert + plan son_calisma/son_sonuc
// DELETE (JWT)     -> plan iptal
import { supabaseAdmin, json } from './_lib'
import { BORC_PLAN_KEY, planJsonOku, planJsonYaz, zamanlariNormalize } from './plan-store'

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

export async function onRequestGet({ env, request }) {
  const supabase = supabaseAdmin(env)
  if (!supabase) return json({ error: 'Supabase credentials missing' }, 500)
  const url = new URL(request.url)

  // --- VPS poller: plan + musteri giris bilgileri ---
  if (url.searchParams.get('sunucu') === '1') {
    if (!anahtarUydu(env, request)) return json({ ok: false, error: 'yetkisiz' }, 401)
    const [{ data: plan }, { data: musteriler }, detay] = await Promise.all([
      supabase.from('borc_cron').select('*').limit(1).maybeSingle(),
      supabase.from('clients').select('id,name,short_name,vkn,tc,dvs_username,dvs_password,sgk_username,sgk_user,sgk_sistem_sifre,sgk_isyeri_sifre,sgk_isyeri_sifresi,sgk_isyeri_kodu,close_date').order('name', { ascending: true }),
      planJsonOku(supabase, BORC_PLAN_KEY)
    ])
    const aktifler = (musteriler || []).filter(m => !m.close_date).map(({ close_date, ...rest }) => rest)
    // 2.8.45: genisletilmis alanlar app_settings'teki JSON'dan gelir
    const birlesik = {
      ...(plan || {}),
      ...(detay || {}),
      turlar: (detay && Array.isArray(detay.turlar) && detay.turlar.length) ? detay.turlar : (plan?.turlar || ['vergi', 'sgk'])
    }
    return json({ ok: true, plan: birlesik, musteriler: aktifler })
  }

  // --- Admin UI ---
  const prof = await jwtProfili(supabase, request)
  if (!adminMi(prof)) return json({ ok: false, error: 'yetkisiz' }, 401)
  // 2.8.45: yalniz mevcut kolonlar secilir (sema onbellegi hatasi olmasin)
  const [{ data: plan }, detay] = await Promise.all([
    supabase.from('borc_cron').select('id,gunler,saat,turlar,aktif,son_calisma,son_sonuc,created_at').limit(1).maybeSingle(),
    planJsonOku(supabase, BORC_PLAN_KEY)
  ])
  return json({ ok: true, plan: { ...(plan || {}), ...(detay || {}) } })
}

export async function onRequestPost({ env, request }) {
  const supabase = supabaseAdmin(env)
  if (!supabase) return json({ error: 'Supabase credentials missing' }, 500)
  const prof = await jwtProfili(supabase, request)
  if (!adminMi(prof)) return json({ ok: false, error: 'yetkisiz' }, 401)
  let govde = {}
  try { govde = await request.json() } catch { return json({ ok: false, error: 'gecersiz govde' }, 400) }

  // 2.8.45: TUR BAZLI COKLU GUN+SAAT.
  //   turlar_zamanlar: { vergi:[{gunler_ay,saat}], sgk:[{gunler_ay,saat}] }
  // Geriye uyum: eski tek "gunler_ay/saat/turlar" alanlari da kabul edilir ve
  // secili her ture uygulanir.
  const TURLER = ['vergi', 'sgk']
  const eskiGunlerAy = Array.isArray(govde.gunler_ay)
    ? [...new Set(govde.gunler_ay.map(Number).filter(n => n >= 1 && n <= 31))].sort((a, b) => a - b)
    : []
  const eskiSaat = /^\d{1,2}:\d{2}$/.test(String(govde.saat || '')) ? govde.saat : '06:00'
  const eskiTurlar = Array.isArray(govde.turlar) && govde.turlar.length
    ? govde.turlar.filter(t => TURLER.includes(t))
    : TURLER

  let turlarZamanlar = {}
  if (govde.turlar_zamanlar && typeof govde.turlar_zamanlar === 'object') {
    for (const t of TURLER) {
      const liste = zamanlariNormalize(govde.turlar_zamanlar[t])
      if (liste.length) turlarZamanlar[t] = liste
    }
  }
  if (!Object.keys(turlarZamanlar).length) {
    if (!eskiGunlerAy.length) return json({ ok: false, error: 'eksik-alanlar' }, 400)
    const tek = [{ gunler_ay: eskiGunlerAy, saat: eskiSaat }]
    for (const t of eskiTurlar) turlarZamanlar[t] = tek
  }

  const turlar = TURLER.filter(t => Array.isArray(turlarZamanlar[t]) && turlarZamanlar[t].length)
  if (!turlar.length) return json({ ok: false, error: 'eksik-alanlar' }, 400)

  // Musteri secimi: bos/verilmezse tum aktif musteriler sorgulanir.
  const musteriler = Array.isArray(govde.musteriler)
    ? [...new Set(govde.musteriler.map(Number).filter(n => Number.isInteger(n) && n > 0))]
    : []

  // Ozet (mevcut kolonlar) — ilk turun ilk dilimi
  const ilkZamanlar = turlarZamanlar[turlar[0]]
  const saat = ilkZamanlar[0].saat
  const gunlerAyOzet = ilkZamanlar[0].gunler_ay

  const detay = {
    gunler_ay: gunlerAyOzet,
    musteriler,
    turlar,
    turlar_zamanlar: turlarZamanlar,
    saat,
    guncelleme: new Date().toISOString()
  }
  const yazildi = await planJsonYaz(supabase, BORC_PLAN_KEY, detay)
  if (!yazildi) return json({ ok: false, error: 'Plan detayi kaydedilemedi (app_settings)' }, 500)

  const { data: mevcut } = await supabase.from('borc_cron').select('id').limit(1).maybeSingle()
  const satir = {
    gunler: [],
    saat,
    turlar,
    aktif: govde.aktif !== false
  }
  let plan = null
  if (mevcut) {
    const { data, error } = await supabase.from('borc_cron').update(satir).eq('id', mevcut.id).select().single()
    if (error) return json({ ok: false, error: error.message }, 500)
    plan = data
  } else {
    const { data, error } = await supabase.from('borc_cron').insert(satir).select().single()
    if (error) return json({ ok: false, error: error.message }, 500)
    plan = data
  }
  return json({ ok: true, plan: { ...(plan || {}), ...detay } })
}

export async function onRequestPatch({ env, request }) {
  const supabase = supabaseAdmin(env)
  if (!supabase) return json({ error: 'Supabase credentials missing' }, 500)
  if (!anahtarUydu(env, request)) return json({ ok: false, error: 'yetkisiz' }, 401)
  let govde = {}
  try { govde = await request.json() } catch { return json({ ok: false, error: 'gecersiz govde' }, 400) }

  // --- Musteri bazli borc sonucu: borc_sonuclari upsert ---
  if (govde.tip === 'sonuc') {
    const clientId = Number(govde.client_id)
    const borcTipi = govde.borcTipi === 'sgk' ? 'sgk' : 'vergi'
    if (!clientId) return json({ ok: false, error: 'client-yok' }, 400)
    if (govde.hata) {
      // hatali sorgu — onceki sonucu EZME (musteri son bilinen borcu gorsin)
      return json({ ok: true, hataKaydedildi: true })
    }
    const satir = {
      client_id: clientId,
      tip: borcTipi,
      toplam: Number(govde.toplam) || 0,
      detay: govde.detay || {},
      mesaj: String(govde.mesaj || '').slice(0, 300),
      sorgu_ts: new Date().toISOString()
    }
    const { error } = await supabase.from('borc_sonuclari').upsert(satir, { onConflict: 'client_id,tip' })
    if (error) return json({ ok: false, error: error.message }, 500)
    return json({ ok: true })
  }

  // --- Plan sonucu ---
  const { data: mevcut } = await supabase.from('borc_cron').select('id').limit(1).maybeSingle()
  if (mevcut) {
    const guncelleme = { son_calisma: new Date().toISOString(), son_sonuc: govde.sonuc || null }
    if (govde.sonuc?.son_turlar && typeof govde.sonuc.son_turlar === 'object') {
      guncelleme.son_turlar = govde.sonuc.son_turlar
    }
    await supabase.from('borc_cron').update(guncelleme).eq('id', mevcut.id)
  }
  if (govde.sonuc?.ozet) {
    await supabase.from('notifications').insert({
      audience: 'admin',
      type: 'borc_cron',
      title: 'Otomatik borç sorgulama',
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
  const { error } = await supabase.from('borc_cron').delete().neq('id', 0)
  if (error) return json({ ok: false, error: error.message }, 500)
  return json({ ok: true })
}
