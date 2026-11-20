// 2.8.8: Otomatik POS / KDV dokum (DVS) sorgulama (VPS) plani.
// GET    ?sunucu=1 -> VPS poller: plan + aktif musterilerin DVS giris bilgileri (x-mubis-key)
// GET    (JWT)     -> admin: plan + son sonuc
// POST   (JWT)     -> admin plan kaydet (tek satir upsert)
// PATCH  (x-mubis-key) -> VPS sonuclari: kredi_karti_hasilat / kdv_dokumleri upsert + plan son_calisma/son_sonuc
// DELETE (JWT)     -> plan iptal
import { supabaseAdmin, json } from './_lib'

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

  if (url.searchParams.get('sunucu') === '1') {
    if (!anahtarUydu(env, request)) return json({ ok: false, error: 'yetkisiz' }, 401)
    const [{ data: plan }, { data: musteriler }, { data: posKayitlar }, { data: kdvKayitlar }] = await Promise.all([
      supabase.from('dvs_cron').select('*').limit(1).maybeSingle(),
      supabase.from('clients').select('id,name,short_name,office_id,vkn,tc,dvs_username,dvs_password,close_date').order('name', { ascending: true }),
      // 2.8.44: DAHA ONCE OKUNMUS DEGERLER — ayni donem icin tekrar sorgu yapilmasin.
      supabase.from('kredi_karti_hasilat').select('client_id,yil,ay,banka_pos_tutar,odeme_para_tutar'),
      supabase.from('kdv_dokumleri').select('client_id,yil,ay,tur,toplam_tutar')
    ])
    const aktifler = (musteriler || []).filter(m => !m.close_date).map(({ close_date, ...rest }) => rest)
    // Anahtar: "<clientId>|<tur>|<yil>|<ay>" → deger
    const mevcut = {}
    for (const k of (posKayitlar || [])) {
      const deger = (Number(k.banka_pos_tutar) || 0) + (Number(k.odeme_para_tutar) || 0)
      if (deger > 0) mevcut[`${k.client_id}|pos|${k.yil}|${k.ay}`] = deger
    }
    for (const k of (kdvKayitlar || [])) {
      const deger = Number(k.toplam_tutar) || 0
      if (deger > 0) mevcut[`${k.client_id}|${k.tur}|${k.yil}|${k.ay}`] = deger
    }
    return json({ ok: true, plan: plan || null, musteriler: aktifler, mevcut })
  }

  const prof = await jwtProfili(supabase, request)
  if (!adminMi(prof)) return json({ ok: false, error: 'yetkisiz' }, 401)
  // 2.8.47: yenidenOku ayrı kolon değil; turlar_plan.__ayar içinde saklanır
  // (eski şemalarda "Could not find the 'yenidenOku' column" hatası olmasın).
  // 2.8.355: Kolon listesi şemaya göre değişebiliyor (örn. "zamanlar" kolonu
  // bazı kurulumlarda YOK). Kolon listesi hataya düşerse SELECT * ile okunur;
  // aksi halde plan null dönüyor, ekran varsayılanlara düşüyor ve kullanıcının
  // tür seçimleri kalıcı olmuyor gibi görünüyordu.
  let plan = null
  {
    const ilk = await supabase.from('dvs_cron')
      .select('id,gunler,saat,turlar,gun_ay,aktif,turlar_plan,son_turlar,son_calisma,son_sonuc,created_at,zamanlar')
      .limit(1).maybeSingle()
    if (ilk.error) {
      const tumu = await supabase.from('dvs_cron').select('*').limit(1).maybeSingle()
      plan = tumu.data || null
    } else {
      plan = ilk.data || null
    }
  }
  if (plan && plan.turlar_plan && plan.turlar_plan.__ayar) {
    plan.yenidenOku = plan.turlar_plan.__ayar.yenidenOku === true
  }
  return json({ ok: true, plan: plan || null })
}

export async function onRequestPost({ env, request }) {
  const supabase = supabaseAdmin(env)
  if (!supabase) return json({ error: 'Supabase credentials missing' }, 500)
  const prof = await jwtProfili(supabase, request)
  if (!adminMi(prof)) return json({ ok: false, error: 'yetkisiz' }, 401)
  let govde = {}
  try { govde = await request.json() } catch { return json({ ok: false, error: 'gecersiz govde' }, 400) }
  const gunler = Array.isArray(govde.gunler) ? govde.gunler.map(Number).filter(n => n >= 0 && n <= 6) : null
  // 2.8.47: tür bazlı ÇOKLU gün+saat. Her tür kendi dilim listesini taşır:
  //   turlar_plan.pos = { aktif, zamanlar:[{gunler_ay:[1,15], saat:'05:00'}] }
  // Eski tek gun_ay/saat alanları geriye uyum için okunur.
  const GECERLI_TURLAR = ['pos', '109', '110']
  const zamanlariNormalize = (liste) => Array.isArray(liste)
    ? liste
        .map(z => {
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
        })
        .filter(z => z.saat && (z.mod === 'haftalik' ? z.hafta_gunleri.length : z.gunler_ay.length))
    : []
  // Eski paylaşılan dilimler (yalnızca dolu geldiyse)
  let zamanlar = null
  if (Array.isArray(govde.zamanlar) && govde.zamanlar.length) {
    zamanlar = zamanlariNormalize(govde.zamanlar)
    if (!zamanlar.length) return json({ ok: false, error: 'eksik-alanlar' }, 400)
  }
  let turlarPlan = null
  if (govde.turlar_plan && typeof govde.turlar_plan === 'object') {
    turlarPlan = {}
    for (const t of GECERLI_TURLAR) {
      const p = govde.turlar_plan[t] || {}
      const pAktif = p.aktif === true
      const pGunAy = Math.min(31, Math.max(0, Number(p.gun_ay) || 0))
      const pSaat = /^\d{1,2}:\d{2}$/.test(String(p.saat || '')) ? p.saat : null
      let pZamanlar = zamanlariNormalize(p.zamanlar)
      if (!pZamanlar.length && pAktif) {
        // Geriye uyum: eski tek gün+saat alanı
        if (!pSaat && !(pGunAy >= 1)) return json({ ok: false, error: 'eksik-alanlar' }, 400)
        if (pGunAy >= 1) pZamanlar = [{ gunler_ay: [pGunAy], saat: pSaat || '05:00' }]
      }
      turlarPlan[t] = {
        aktif: pAktif && pZamanlar.length > 0,
        gun_ay: pGunAy,
        saat: pSaat || '05:00',
        zamanlar: pZamanlar
      }
    }
    if (!GECERLI_TURLAR.some(t => turlarPlan[t].aktif)) return json({ ok: false, error: 'eksik-alanlar' }, 400)
  } else {
    const saat = /^\d{2}:\d{2}$/.test(String(govde.saat || '')) ? govde.saat : null
    const gunAy = Math.min(31, Math.max(0, Number(govde.gun_ay) || 0))
    const turlar = Array.isArray(govde.turlar) && govde.turlar.length
      ? govde.turlar.filter(t => GECERLI_TURLAR.includes(t))
      : ['pos']
    if (!gunAy && !gunler?.length) return json({ ok: false, error: 'eksik-alanlar' }, 400)
    if (!saat || !turlar.length) return json({ ok: false, error: 'eksik-alanlar' }, 400)
    const pZamanlar = gunAy >= 1 ? [{ gunler_ay: [gunAy], saat }] : []
    turlarPlan = Object.fromEntries(GECERLI_TURLAR.map(t => [t, { aktif: turlar.includes(t), gun_ay: gunAy, saat, zamanlar: pZamanlar }]))
  }
  const aktifTurlar = GECERLI_TURLAR.filter(t => turlarPlan[t].aktif)
  const ilk = turlarPlan[aktifTurlar[0]]
  // 2.8.47: yenidenOku ayrı kolon değil; turlar_plan.__ayar içinde saklanır.
  // Böylece eski şemalarda "Could not find the 'yenidenOku' column of
  // 'dvs_cron' in the schema cache" hatası oluşmaz.
  turlarPlan.__ayar = { yenidenOku: govde.yenidenOku === true }
  const { data: mevcut } = await supabase.from('dvs_cron').select('id').limit(1).maybeSingle()
  const satir = {
    gunler: gunler || [],
    saat: zamanlar ? zamanlar[0].saat : ilk.saat,
    turlar: aktifTurlar,
    gun_ay: ilk.gun_ay,
    aktif: govde.aktif !== false,
    turlar_plan: turlarPlan,
    ...(zamanlar ? { zamanlar } : {})
  }
  const { data: plan, error } = mevcut
    ? await supabase.from('dvs_cron').update(satir).eq('id', mevcut.id).select().single()
    : await supabase.from('dvs_cron').insert(satir).select().single()
  if (error) return json({ ok: false, error: error.message }, 500)
  if (plan && plan.turlar_plan && plan.turlar_plan.__ayar) {
    plan.yenidenOku = plan.turlar_plan.__ayar.yenidenOku === true
  }
  return json({ ok: true, plan })
}

export async function onRequestPatch({ env, request }) {
  const supabase = supabaseAdmin(env)
  if (!supabase) return json({ error: 'Supabase credentials missing' }, 500)
  if (!anahtarUydu(env, request)) return json({ ok: false, error: 'yetkisiz' }, 401)
  let govde = {}
  try { govde = await request.json() } catch { return json({ ok: false, error: 'gecersiz govde' }, 400) }

  // --- Musteri bazli DVS sonucu: kredi_karti_hasilat / kdv_dokumleri upsert ---
  if (govde.tip === 'sonuc') {
    const clientId = Number(govde.client_id)
    const tur = ['pos', '109', '110'].includes(String(govde.tur)) ? String(govde.tur) : 'pos'
    if (!clientId) return json({ ok: false, error: 'client-yok' }, 400)
    if (govde.hata) {
      // hatali sorgu — onceki sonucu EZME
      return json({ ok: true, hataKaydedildi: true })
    }
    const s = govde.sonuc || {}
    let officeId = govde.office_id || s.office_id || null
    if (!officeId) {
      const { data: cl } = await supabase.from('clients').select('office_id').eq('id', clientId).maybeSingle()
      officeId = cl?.office_id || null
    }
    if (!officeId) return json({ ok: false, error: 'office-yok' }, 400)
    const bugun = new Date().toISOString().slice(0, 10)
    if (tur === 'pos') {
      const { error } = await supabase.from('kredi_karti_hasilat').upsert({
        office_id: officeId,
        client_id: clientId,
        yil: Number(govde.yil),
        ay: Number(govde.ay),
        banka_pos_tutar: Number(s.banka_pos_tutar) || 0,
        odeme_para_tutar: Number(s.odeme_para_tutar) || 0,
        sorgu_tarihi: bugun,
        kaynak: 'otomatik',
        metadata: {
          banka_detay: s.banka_detay || [],
          odeme_detay: s.odeme_detay || [],
          banka_tani: s.banka_tani || null
        }
      }, { onConflict: 'office_id,client_id,yil,ay' })
      if (error) return json({ ok: false, error: error.message }, 500)
    } else {
      const { error } = await supabase.from('kdv_dokumleri').upsert({
        office_id: officeId,
        client_id: clientId,
        yil: Number(govde.yil),
        ay: Number(govde.ay),
        tur,
        toplam_tutar: Number(s.toplam_tutar) || 0,
        detaylar: s.detaylar || [],
        sorgu_tarihi: bugun,
        kaynak: 'otomatik'
      }, { onConflict: 'office_id,client_id,yil,ay,tur' })
      if (error) return json({ ok: false, error: error.message }, 500)
    }
    return json({ ok: true })
  }

  // --- Plan sonucu ---
  // 2.8.12: VPS tur bazli calisma sonunda son_turlar gonderir (tur -> ISO zaman)
  const { data: mevcut } = await supabase.from('dvs_cron').select('id,son_turlar').limit(1).maybeSingle()
  if (mevcut) {
    const yeniSonTurlar = { ...(mevcut.son_turlar && typeof mevcut.son_turlar === 'object' ? mevcut.son_turlar : {}), ...(govde.son_turlar && typeof govde.son_turlar === 'object' ? govde.son_turlar : {}) }
    await supabase.from('dvs_cron').update({
      son_calisma: new Date().toISOString(),
      son_sonuc: govde.sonuc || null,
      son_turlar: yeniSonTurlar
    }).eq('id', mevcut.id)
  }
  if (govde.sonuc?.ozet) {
    await supabase.from('notifications').insert({
      audience: 'admin',
      type: 'dvs_cron',
      title: 'Otomatik POS / KDV döküm sorgulama',
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
  const { error } = await supabase.from('dvs_cron').delete().neq('id', 0)
  if (error) return json({ ok: false, error: error.message }, 500)
  return json({ ok: true })
}
