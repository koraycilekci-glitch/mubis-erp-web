// MUBIS - e-Tebligat otomatik sorgu planlari (Cloudflare Pages Function)
// GET    /api/etebligat-cron         -> plan listesi (yardimci program + admin UI)
// POST   /api/etebligat-cron         -> plan ekle { client_ids, gunler, saat, tekrar }
// PATCH  /api/etebligat-cron         -> yardimci isaretler { id, tebligatlar, hata }
// DELETE /api/etebligat-cron?id=...  -> plan sil
// Not: Otomatik sorgu yalnizca Vergi Dairesi (DVS) tebligatlari icindir;
// SGK tebligatlari e-Devlet guvenlik kodu gerektirdiginden otomatiklestirilemez.
import { json, supabaseAdmin } from './_lib.js'

export async function onRequestGet({ env, request }) {
  const supabase = supabaseAdmin(env)
  if (!supabase) return json({ error: 'Supabase credentials missing' }, 500)
  // 2.8.1: Planlari YALNIZCA sunucu yardimcisi gorur (?sunucu=1 isaretiyle
  // gelir). Yerel yardimci program eski surum olsa bile plan listesi bos
  // doner — boylece otomatik sorgulari sadece VPS yapar, kullanicinin
  // bilgisayarinda Chrome penceresi acilmaz, cift sorgu olmaz.
  const url = new URL(request.url)
  // sunucu=1 -> VPS yardimcisi: tam liste (DVS bilgileriyle, sorgu yapabilsin)
  // ui=1     -> admin paneli: liste ama DVS sifreleri MASKELI
  // ikisi de yok -> bos liste (yerel yardimci program asla plan cekemez)
  const sunucuIstegi = url.searchParams.get('sunucu') === '1'
  const uiIstegi = url.searchParams.get('ui') === '1'
  const [{ data: planSatirlari, error }, { data: clientSatirlari }] = await Promise.all([
    (sunucuIstegi || uiIstegi)
      ? supabase.from('etebligat_cron').select('*').order('id', { ascending: true })
      : Promise.resolve({ data: [] }),
    (sunucuIstegi || uiIstegi) ? supabase.from('clients').select('id, name, dvs_username, dvs_password') : Promise.resolve({ data: [] })
  ])
  if (error) return json({ error: error.message }, 500)
  const clientMap = new Map((clientSatirlari || []).map(c => [String(c.id), c]))
  const planlar = (planSatirlari || []).map(p => {
    const c = clientMap.get(String(p.client_id)) || {}
    return {
      id: p.id,
      client_id: p.client_id,
      client_name: c.name || '',
      dvs_username: sunucuIstegi ? (c.dvs_username || '') : '',
      dvs_password: sunucuIstegi ? (c.dvs_password || '') : '',
      gunler: Array.isArray(p.gunler) ? p.gunler : [],
      saat: p.saat || '09:00',
      tekrar: p.tekrar !== false,
      aktif: p.aktif !== false,
      son_calisma: p.son_calisma || null
    }
  })
  return json({ ok: true, planlar })
}

export async function onRequestPost({ env, request }) {
  const supabase = supabaseAdmin(env)
  if (!supabase) return json({ error: 'Supabase credentials missing' }, 500)
  let body = {}
  try { body = await request.json() } catch { return json({ error: 'gecersiz govde' }, 400) }
  const clientIds = Array.isArray(body.client_ids) ? body.client_ids.map(Number).filter(Boolean) : []
  const gunler = Array.isArray(body.gunler) ? body.gunler.map(Number).filter(g => g >= 0 && g <= 6) : []
  const saat = String(body.saat || '09:00')
  const tekrar = body.tekrar !== false
  if (!clientIds.length) return json({ error: 'musteri secilmedi' }, 400)
  if (!gunler.length) return json({ error: 'gun secilmedi' }, 400)
  if (!/^\d{1,2}:\d{2}$/.test(saat)) return json({ error: 'gecersiz saat' }, 400)
  // 2.8.1: Yeni plan bugun "calismis" sayilir — aksi halde kayit saati
  // plan saatinden sonraysa yardimci HEMEN baslatir. Ilk calisma bir
  // sonraki secilen gunde, belirtilen saatte yapilir.
  const satirlar = clientIds.map(cid => ({ client_id: cid, gunler, saat, tekrar, aktif: true, son_calisma: new Date().toISOString() }))
  const { data, error } = await supabase.from('etebligat_cron').insert(satirlar).select()
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true, eklenen: (data || []).length })
}

export async function onRequestPatch({ env, request }) {
  const supabase = supabaseAdmin(env)
  if (!supabase) return json({ error: 'Supabase credentials missing' }, 500)
  let body = {}
  try { body = await request.json() } catch { return json({ error: 'gecersiz govde' }, 400) }
  const id = Number(body.id)
  if (!id) return json({ error: 'id gerekli' }, 400)
  const { data: plan } = await supabase
    .from('etebligat_cron')
    .select('id, client_id, tekrar')
    .eq('id', id)
    .maybeSingle()
  if (!plan) return json({ error: 'plan bulunamadi' }, 404)
  // Musteri unvani — admin ana ekran uyarisi icin
  const { data: cl } = await supabase
    .from('clients')
    .select('name, company_name')
    .eq('id', plan.client_id)
    .maybeSingle()
  const musteriAdi = cl?.company_name || cl?.name || 'Müşteri'
  // Plan isaretle: son_calisma=now; tekrarsiz plan icin bir kez calistiktan sonra pasiflestir
  const aktif = plan.tekrar !== false
  await supabase.from('etebligat_cron').update({ son_calisma: new Date().toISOString(), aktif }).eq('id', id)
  // Tebligat satirlarini etebligatlar tablosuna isle (browser satirNormalize ile ayni yapi)
  const tebligatlar = Array.isArray(body.tebligatlar) ? body.tebligatlar : []
  let eklenen = 0
  let upsertHata = ''
  let yeniler = []
  if (tebligatlar.length) {
    const satirlar = tebligatlar.map(t => ({
      client_id: plan.client_id,
      kaynak: t.kaynak || 'vergi',
      kurum: t.kurum || '',
      belge_turu: t.belgeTuru || t.belge_turu || '',
      belge_no: String(t.belgeNo || t.belge_no || t.tebligTarihi || '').trim(),
      gonderme_tarihi: t.gondermeTarihi || t.gonderme_tarihi || '',
      teblig_tarihi: t.tebligTarihi || t.teblig_tarihi || '',
      okuma_tarihi: t.okumaTarihi || t.okuma_tarihi || '',
      okundu: !!t.okundu,
      sorgu_ts: new Date().toISOString()
    })).filter(s => s.belge_no)
    if (satirlar.length) {
      // 2.7.455: Otomatik gonderim icin YENI tebligatlari belirle — upsert
      // oncesi tabloda OLMAYAN belge_no'lar yenidir. Yardimci program bu
      // listedeki belgeleri indirip /api/etebligat-gonder'e yollar.
      let oncekiler = []
      try {
        const { data } = await supabase
          .from('etebligatlar')
          .select('belge_no')
          .eq('client_id', plan.client_id)
          .in('belge_no', satirlar.map(s => s.belge_no))
        oncekiler = (data || []).map(r => r.belge_no)
      } catch { /* tablo okunamadi — hepsi yeni sayilmaz, gonderim atlanir */ }
      yeniler = satirlar.map(s => s.belge_no).filter(no => !oncekiler.includes(no))
      const { error } = await supabase
        .from('etebligatlar')
        .upsert(satirlar, { onConflict: 'client_id,belge_no' })
      if (!error) eklenen = satirlar.length
      else { upsertHata = error.message; yeniler = [] }
      // Admin ana ekran uyarisi: yeni tebligat geldiyse bildirim kaydet
      if (yeniler.length) {
        await supabase.from('notifications').insert({
          client_id: plan.client_id,
          audience: 'admin',
          type: 'etebligat',
          title: 'Yeni e-Tebligat',
          message: `${musteriAdi} için ${yeniler.length} adet yeni tebligat gelmişti`,
          route: '/admin/etebligatlar',
          metadata: { belge_nolar: yeniler, kaynak: 'otomatik-sorgu' }
        }).then(({ error: nHata }) => {
          if (nHata) console.log('[etebligat-cron] bildirim yazilamadi:', nHata.message)
        })
      }
    }
  }
  return json({
    ok: true,
    islenen: eklenen,
    yeniler,
    client_id: plan.client_id,
    tekrar_aktif: aktif,
    hata: upsertHata || (eklenen ? undefined : 'belge-yok')
  })
}

export async function onRequestDelete({ env, request }) {
  const supabase = supabaseAdmin(env)
  if (!supabase) return json({ error: 'Supabase credentials missing' }, 500)
  const url = new URL(request.url)
  const id = Number(url.searchParams.get('id'))
  // 2.8.2: ?ids=1,2,3 -> secili planlari toplu sil
  const idsParam = url.searchParams.get('ids')
  if (idsParam) {
    const ids = idsParam.split(',').map(s => Number(s.trim())).filter(Boolean)
    if (!ids.length) return json({ error: 'gecerli id listesi yok' }, 400)
    const { error } = await supabase.from('etebligat_cron').delete().in('id', ids)
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true, silinen: ids.length })
  }
  // 2.8.1: id olmadan (veya ?tumu=1) cagrilirsa TUM planlar iptal edilir —
  // "Otomatik Sorguyu Iptal Et" dugmesi bunu kullanir.
  if (!id) {
    const { error } = await supabase.from('etebligat_cron').delete().neq('id', 0)
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true, tumu: true })
  }
  const { error } = await supabase.from('etebligat_cron').delete().eq('id', id)
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true })
}
