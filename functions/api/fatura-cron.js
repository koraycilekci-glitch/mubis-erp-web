// 2.8.4: Otomatik fatura sorgulama (VPS) + musteri "Fatura Guncelle Talebi".
// GET  ?sunucu=1   -> VPS poller: plan + aktif musteriler + Luca bilgileri + bekleyen talepler (x-mubis-key)
// GET  ?drive=1    -> yerel yardimci: son yuklenen fatura kayitlari, Drive hedef yollarıyla (x-mubis-key)
// GET  (JWT)       -> admin UI: plan + son talepler
// POST             -> admin: plan kaydet (upsert) | musteri (JWT): tip='talep' fatura guncelleme talebi
// PATCH (x-mubis-key) -> VPS sonuc raporlar (plan son_calisma/son_sonuc, talep tamam/hata + bildirimler)
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
  const { data: prof } = await supabase.from('profiles').select('id, role, client_id, office_id').eq('id', data.user.id).maybeSingle()
  return prof || { id: data.user.id, role: null, client_id: null, office_id: null }
}

const adminMi = (p) => p && ['admin', 'personel', 'super_admin'].includes(String(p.role || ''))

export async function onRequestGet({ env, request }) {
  const supabase = supabaseAdmin(env)
  if (!supabase) return json({ error: 'Supabase credentials missing' }, 500)
  const url = new URL(request.url)

  // --- VPS poller: tam plan paketi ---
  if (url.searchParams.get('sunucu') === '1') {
    if (!anahtarUydu(env, request)) return json({ ok: false, error: 'yetkisiz' }, 401)
    const hatalar = []
    const [{ data: plan }, { data: musteriler, error: mHata }, { data: talepler }, { data: st, error: sHata }] = await Promise.all([
      supabase.from('fatura_cron').select('*').limit(1).maybeSingle(),
      supabase.from('clients').select('id,name,short_name,vkn,tc,office_id,close_date').order('name', { ascending: true }),
      supabase.from('fatura_cron_talepler').select('id,client_id,yil,ay,durum,created_at').eq('durum', 'bekliyor').order('created_at', { ascending: true }).limit(10),
      supabase.from('app_settings').select('key,value').in('key', ['luca_member', 'luca_username', 'luca_password', 'fatura_gelen_klasoru', 'fatura_giden_klasoru'])
    ])
    if (mHata) hatalar.push('clients: ' + mHata.message)
    if (sHata) hatalar.push('app_settings: ' + sHata.message)
    // 2.8.4: kapanis tarihi (close_date) dolu musteriler pasif sayilir
    const aktifler = (musteriler || []).filter(m => !m.close_date).map(({ close_date, ...rest }) => rest)
    const setMap = {}
    ;(st || []).forEach(s => { setMap[s.key] = s.value })
    return json({
      ok: true,
      plan: plan || null,
      musteriler: aktifler,
      talepler: talepler || [],
      luca: {
        member: setMap.luca_member || '',
        username: setMap.luca_username || '',
        password: setMap.luca_password || ''
      },
      driveKlasorleri: {
        gelen: setMap.fatura_gelen_klasoru || '',
        giden: setMap.fatura_giden_klasoru || ''
      },
      hatalar
    })
  }

  // --- Yerel yardimci Drive senkronu: son yuklenen faturalar ---
  if (url.searchParams.get('drive') === '1') {
    const desktopKey = env?.MUBIS_DESKTOP_ANAHTARI
    if (!desktopKey || request.headers.get('x-mubis-key') !== desktopKey) return json({ ok: false, error: 'yetkisiz' }, 401)
    const officeId = String(env?.YARDIMCI_OFFICE_ID || '').trim()
    if (!/^\d+$/.test(officeId) || officeId === '0') return json({ ok: false, error: 'ofis-yapilandirilmamis' }, 503)
    const since = url.searchParams.get('since')
    let q = supabase.from('efatura_faturalar')
      .select('id,client_id,yon,tur,fatura_uuid,fatura_no,tarih,pdf_url,xml_url,html_url,sorgu_ts,clients!inner(office_id)')
      .eq('clients.office_id', Number(officeId))
      .or('pdf_url.neq.,xml_url.neq.,html_url.neq.')
      .order('sorgu_ts', { ascending: false })
      .limit(500)
    if (since) q = q.gt('sorgu_ts', since)
    const { data: faturalar, error } = await q
    if (error) return json({ ok: false, error: error.message }, 500)
    // musteri adlari + ofis onegi
    const cidler = [...new Set((faturalar || []).map(f => f.client_id))]
    const { data: cl } = await supabase.from('clients').select('id,name,vkn,tc,office_id').in('id', cidler.length ? cidler : ['0'])
    const clMap = {}
    ;(cl || []).forEach(c => { clMap[c.id] = c })
    // Drive hedef klasorleri (app_settings)
    const { data: st } = await supabase.from('app_settings').select('key,value').in('key', ['fatura_gelen_klasoru', 'fatura_giden_klasoru'])
    const setMap = {}
    ;(st || []).forEach(s => { setMap[s.key] = s.value })
    const slug = (t) => String(t || '').split('').map(c => ({
      'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
      'Ç': 'C', 'Ğ': 'G', 'I': 'I', 'İ': 'I', 'Ö': 'O', 'Ş': 'S', 'Ü': 'U'
    })[c] || c).join('').toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    const kayitlar = (faturalar || []).map(f => {
      const c = clMap[f.client_id] || {}
      const identifier = c.vkn || c.tc || 'bilinmeyen'
      const klasorAdi = `${identifier}_${slug(c.name || 'musteri')}`
      const tabanKlasor = f.yon === 'giden'
        ? (setMap.fatura_giden_klasoru || setMap.fatura_gelen_klasoru || '')
        : (setMap.fatura_gelen_klasoru || setMap.fatura_giden_klasoru || '')
      const yil = (f.tarih ? String(f.tarih).slice(0, 4) : String(f.sorgu_ts || '').slice(0, 4)) || String(new Date().getFullYear())
      return {
        id: f.id,
        client_id: f.client_id,
        musteri: c.name || '',
        yon: f.yon,
        tur: f.tur,
        fatura_uuid: f.fatura_uuid,
        fatura_no: f.fatura_no || '',
        tarih: f.tarih || null,
        sorgu_ts: f.sorgu_ts,
        dosyalar: [
          { url: f.pdf_url, ad: `${f.yon}_${f.fatura_uuid}.pdf` },
          { url: f.xml_url, ad: `${f.yon}_${f.fatura_uuid}.xml` },
          { url: f.html_url, ad: `${f.yon}_${f.fatura_uuid}.html` }
        ].filter(d => d.url),
        hedefKlasor: tabanKlasor ? `${tabanKlasor.replace(/[\\/]+$/, '')}\\${yil}\\${klasorAdi}` : ''
      }
    }).filter(k => k.hedefKlasor && k.dosyalar.length)
    const sonTs = (faturalar || []).reduce((m, f) => (f.sorgu_ts > m ? f.sorgu_ts : m), '') || since || new Date().toISOString()
    return json({ ok: true, kayitlar, sonTs })
  }

  // --- Admin UI (JWT): plan + son talepler | musteri (JWT): yalniz kendi talepleri ---
  const prof = await jwtProfili(supabase, request)
  // 2.8.4: musteri rozetinin "Sorgulanıyor..." durumu icin kendi taleplerini okur
  if (prof && !adminMi(prof)) {
    if (!prof.client_id) return json({ ok: false, error: 'yetkisiz' }, 401)
    const { data: kendiTalepleri } = await supabase.from('fatura_cron_talepler')
      .select('id,client_id,yil,ay,durum,hata,created_at,tamamlandi_at')
      .eq('client_id', prof.client_id)
      .order('created_at', { ascending: false }).limit(5)
    return json({ ok: true, talepler: kendiTalepleri || [], plan: null })
  }
  if (!adminMi(prof)) return json({ ok: false, error: 'yetkisiz' }, 401)
  const [{ data: plan }, { data: talepler }] = await Promise.all([
    supabase.from('fatura_cron').select('*').limit(1).maybeSingle(),
    supabase.from('fatura_cron_talepler').select('id,client_id,yil,ay,durum,hata,created_at,tamamlandi_at').order('created_at', { ascending: false }).limit(20)
  ])
  // talep listesine musteri adlari
  const cidler = [...new Set((talepler || []).map(t => t.client_id))]
  const { data: cl } = await supabase.from('clients').select('id,name').in('id', cidler.length ? cidler : ['0'])
  const clMap = {}
  ;(cl || []).forEach(c => { clMap[c.id] = c.name })
  return json({
    ok: true,
    plan: plan || null,
    talepler: (talepler || []).map(t => ({ ...t, musteri_adi: clMap[t.client_id] || `#${t.client_id}` }))
  })
}

export async function onRequestPost({ env, request }) {
  const supabase = supabaseAdmin(env)
  if (!supabase) return json({ error: 'Supabase credentials missing' }, 500)
  let govde = {}
  try { govde = await request.json() } catch { return json({ ok: false, error: 'gecersiz govde' }, 400) }
  const prof = await jwtProfili(supabase, request)
  if (!prof) return json({ ok: false, error: 'yetkisiz' }, 401)

  // --- Musteri fatura guncelleme talebi ---
  if (govde.tip === 'talep') {
    let clientId = null
    if (adminMi(prof) && govde.client_id) clientId = govde.client_id
    else clientId = prof.client_id
    if (!clientId) return json({ ok: false, error: 'musteri-eslesmesi-yok' }, 403)
    const yil = Number(govde.yil) || new Date().getFullYear()
    const ay = Number(govde.ay) || (new Date().getMonth() + 1)
    // Devam eden ayni donem talebi varsa tekrar acma
    const { data: mevcut } = await supabase.from('fatura_cron_talepler')
      .select('id,durum').eq('client_id', clientId).eq('yil', yil).eq('ay', ay).in('durum', ['bekliyor', 'calisiyor']).limit(1).maybeSingle()
    if (mevcut) return json({ ok: true, talepId: mevcut.id, zatenVar: true, durum: mevcut.durum })
    const { data: talep, error } = await supabase.from('fatura_cron_talepler')
      .insert({ client_id: clientId, yil, ay, durum: 'bekliyor' }).select().single()
    if (error) return json({ ok: false, error: error.message }, 500)
    // Admin bildirimi (mesaj merkezi disinda bildirim olarak)
    const { data: cl } = await supabase.from('clients').select('name').eq('id', clientId).maybeSingle()
    await supabase.from('notifications').insert({
      client_id: clientId,
      audience: 'admin',
      type: 'fatura_talep',
      title: 'Fatura Güncelle Talebi',
      message: `${cl?.name || 'Müşteri'} ${ay}/${yil} dönemi faturalarının otomatik sorgulanmasını talep etti. Talep kuyruğa alındı.`,
      route: '/admin/fatura-sorgulama'
    })
    return json({ ok: true, talepId: talep.id, durum: talep.durum })
  }

  // --- Admin plan kaydet (tek satir upsert) ---
  if (!adminMi(prof)) return json({ ok: false, error: 'yetkisiz' }, 401)
  const gunler = Array.isArray(govde.gunler) ? govde.gunler.map(Number).filter(n => n >= 0 && n <= 6) : null
  const saat = /^\d{2}:\d{2}$/.test(String(govde.saat || '')) ? govde.saat : null
  const turlar = Array.isArray(govde.turlar) ? govde.turlar.filter(t => ['efatura', 'earsiv', 'esmm', 'utts'].includes(t)) : null
  const yonler = Array.isArray(govde.yonler) ? govde.yonler.filter(t => ['alis', 'satis'].includes(t)) : null
  if (!gunler?.length || !saat || !turlar?.length || !yonler?.length) {
    return json({ ok: false, error: 'eksik-alanlar' }, 400)
  }
  const { data: mevcutPlan } = await supabase.from('fatura_cron').select('id').limit(1).maybeSingle()
  // 2.8.8: musteri secimi — bos dizi/null = tum aktif musteriler
  const musteriler = Array.isArray(govde.musteriler)
    ? govde.musteriler.map(Number).filter(n => n > 0)
    : null
  const satir = { gunler, saat, turlar, yonler, aktif: govde.aktif !== false, musteriler }
  const { data: plan, error } = mevcutPlan
    ? await supabase.from('fatura_cron').update(satir).eq('id', mevcutPlan.id).select().single()
    : await supabase.from('fatura_cron').insert(satir).select().single()
  if (error) return json({ ok: false, error: error.message }, 500)
  return json({ ok: true, plan })
}

export async function onRequestPatch({ env, request }) {
  const supabase = supabaseAdmin(env)
  if (!supabase) return json({ error: 'Supabase credentials missing' }, 500)
  if (!anahtarUydu(env, request)) return json({ ok: false, error: 'yetkisiz' }, 401)
  let govde = {}
  try { govde = await request.json() } catch { return json({ ok: false, error: 'gecersiz govde' }, 400) }

  // --- Talep sonucu ---
  if (govde.tip === 'talep') {
    const id = Number(govde.id)
    if (!id) return json({ ok: false, error: 'id-yok' }, 400)
    const tamam = govde.durum === 'tamam'
    const { data: talep } = await supabase.from('fatura_cron_talepler')
      .update({ durum: govde.durum || 'tamam', hata: govde.hata || null, tamamlandi_at: new Date().toISOString() })
      .eq('id', id).select().maybeSingle()
    if (talep && talep.durum !== 'calisiyor') {
      const { data: cl } = await supabase.from('clients').select('name').eq('id', talep.client_id).maybeSingle()
      const donem = `${talep.ay}/${talep.yil}`
      if (tamam) {
        await supabase.from('notifications').insert({
          client_id: talep.client_id,
          audience: 'client',
          type: 'fatura',
          title: 'Faturalarınız güncellendi',
          message: `${donem} dönemine ait alış/satış faturalarınız sisteme yüklendi.`,
          route: '/portal'
        })
        await supabase.from('notifications').insert({
          client_id: talep.client_id,
          audience: 'admin',
          type: 'fatura_talep',
          title: 'Fatura talebi tamamlandı',
          message: `${cl?.name || 'Müşteri'} ${donem} dönemi faturaları otomatik sorgulanıp yüklendi.`,
          route: '/admin/fatura-sorgulama'
        })
      } else {
        await supabase.from('notifications').insert({
          client_id: talep.client_id,
          audience: 'admin',
          type: 'fatura_talep',
          title: 'Fatura talebi başarısız',
          message: `${cl?.name || 'Müşteri'} ${donem} dönemi fatura sorgusu hata verdi: ${govde.hata || 'bilinmeyen'}`,
          route: '/admin/fatura-sorgulama'
        })
      }
    }
    return json({ ok: true })
  }

  // --- Plan sonucu ---
  const { data: mevcutPlan } = await supabase.from('fatura_cron').select('id').limit(1).maybeSingle()
  if (mevcutPlan) {
    await supabase.from('fatura_cron').update({
      son_calisma: new Date().toISOString(),
      son_sonuc: govde.sonuc || null
    }).eq('id', mevcutPlan.id)
  }
  if (govde.sonuc?.ozet) {
    await supabase.from('notifications').insert({
      audience: 'admin',
      type: 'fatura_cron',
      title: 'Otomatik fatura sorgulama',
      message: String(govde.sonuc.ozet).slice(0, 400),
      route: '/admin/fatura-sorgulama'
    })
  }
  return json({ ok: true })
}

export async function onRequestDelete({ env, request }) {
  const supabase = supabaseAdmin(env)
  if (!supabase) return json({ error: 'Supabase credentials missing' }, 500)
  const prof = await jwtProfili(supabase, request)
  if (!adminMi(prof)) return json({ ok: false, error: 'yetkisiz' }, 401)
  const { error } = await supabase.from('fatura_cron').delete().neq('id', 0)
  if (error) return json({ ok: false, error: error.message }, 500)
  return json({ ok: true })
}
