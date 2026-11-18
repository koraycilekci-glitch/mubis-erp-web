// MUBIS - Mevzuat & AI Asistan (Cloudflare Pages Function)
// GET  /api/mevzuat?action=...&...   -> listele
// POST /api/mevzuat                 -> ekle / tara / inceleme / gorev
// PATCH /api/mevzuat                -> guncelle
// DELETE /api/mevzuat?id=...&tablo= -> sil
//
// actions (GET):
//   kaynaklar        -> mevzuat_kaynaklar listesi
//   kayitlar         -> mevzuat_kayitlari listesi (?inceleme=bekliyor, ?kaynak_id=, ?limit=)
//   gorevler         -> mevzuat_gorevler listesi (?durum=bekliyor)
//   panel            -> yonetici paneli ozeti
//   tarama-loglari   -> son tarama loglari
//
// actions (POST body.action):
//   kaynak-ekle, kaynak-guncelle, kaynak-sil
//   tara               -> { kaynak_id } veya { tumu: true }
//   inceleme-karar     -> { kayit_id, karar, yorum }
//   kural-ekle         -> { kayit_id, baslik, kural_tipi, tarih, ... }
//   gorev-ekle         -> { baslik, aciklama, sorumlu_user_id, son_tarih, ... }
//   gorev-durum        -> { id, durum }
import { json, supabaseAdmin, dogrulaKullanici } from './_driveCommon.js'

const TABLOLAR = {
  kaynaklar: 'mevzuat_kaynaklar',
  kayitlar: 'mevzuat_kayitlari',
  tarama_loglari: 'mevzuat_tarama_loglari',
  kurallar: 'mevzuat_kurallar',
  gorevler: 'mevzuat_gorevler',
  inceleme_kararlari: 'mevzuat_inceleme_kararlari',
  eslesmeler: 'mevzuat_mukellef_eslesmeleri',
}

async function officeIdAl(kontrol) {
  return kontrol?.profil?.office_id || 1
}

// ---------- Temel HTML -> metin ----------
function htmlToText(html) {
  if (!html) return ''
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------- Tarih adayi cikarimi (basit regex) ----------
function tarihAdaylariCikar(metin) {
  const adaylar = { beyan: [], odeme: [], sgk: [], basvuru: [], diger: [] }
  if (!metin) return adaylar
  // GG.MM.YYYY veya GG/MM/YYYY
  const regex = /\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/g
  const bulunanlar = []
  let m
  while ((m = regex.exec(metin)) !== null) {
    const gun = parseInt(m[1]), ay = parseInt(m[2]), yil = parseInt(m[3])
    if (gun >= 1 && gun <= 31 && ay >= 1 && ay <= 12 && yil >= 2020 && yil <= 2030) {
      bulunanlar.push({ gun, ay, yil, metin: m[0], pozisyon: m.index })
    }
  }
  // Bağlam anahtar kelimesi ile sınıflandır
  for (const b of bulunanlar) {
    const ctx = metin.substring(Math.max(0, b.pozisyon - 60), b.pozisyon + 60).toLowerCase()
    if (/beyan|beyanneme/.test(ctx)) adaylar.beyan.push(b)
    else if (/ödeme|odeme|tahakkuk/.test(ctx)) adaylar.odeme.push(b)
    else if (/sgk|sigorta|prim/.test(ctx)) adaylar.sgk.push(b)
    else if (/başvuru|basvuru|son gün|son gun/.test(ctx)) adaylar.basvuru.push(b)
    else adaylar.diger.push(b)
  }
  // Tekrarları temizle (aynı tarih)
  for (const k of Object.keys(adaylar)) {
    const seen = new Set()
    adaylar[k] = adaylar[k].filter(b => {
      const key = `${b.gun}-${b.ay}-${b.yil}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  return adaylar
}

// ---------- AI özet (OpenAI varsa) ----------
async function aiOzet(env, metin, baslik) {
  const apiKey = env?.OPENAI_API_KEY
  if (!apiKey || !metin || metin.length < 50) return null
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Sen bir mali müşavirlik asistanısın. Verilen resmî mevzuat metnini Türkçe olarak özetle. Önemli değişiklikleri, tarihleri ve yükümlülükleri maddeler halinde listele. Yanıtın sonunda "KAYNAK: ..." ile kaynak bağlantısını belirt. Emin olmadığın bilgileri "kontrol gerekli" olarak işaretle.' },
          { role: 'user', content: `Başlık: ${baslik}\n\nMetin:\n${metin.substring(0, 8000)}` }
        ],
        max_tokens: 800,
        temperature: 0.3,
      })
    })
    if (!resp.ok) return null
    const j = await resp.json()
    return j?.choices?.[0]?.message?.content || null
  } catch { return null }
}

// ---------- Kaynak tarama ----------
async function kaynakTara(env, admin, kaynak, officeId) {
  const logId = null
  const baslangic = Date.now()
  let logKayit = null
  try {
    // tarama logu baslat
    const { data: log } = await admin.from('mevzuat_tarama_loglari').insert({
      office_id: officeId, kaynak_id: kaynak.id, durum: 'calisiyor'
    }).select('id').single()
    logKayit = log

    // URL'den metin cek
    let metin = ''
    let httpStatus = 0
    let hata = null
    try {
      const r = await fetch(kaynak.url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'MUBIS-Mevzuat-Tarayici/1.0' } })
      httpStatus = r.status
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const html = await r.text()
      metin = htmlToText(html)
      if (metin.length < 100) throw new Error('Sayfa metni okunamadi veya cok kisa')
    } catch (e) {
      hata = e.message
    }

    const taramaSuresi = Date.now() - baslangic

    if (hata) {
      await admin.from('mevzuat_tarama_loglari').update({
        bitis_ts: new Date().toISOString(), durum: 'hata',
        hata_mesaji: hata, http_status: httpStatus, sure_ms: taramaSuresi
      }).eq('id', logKayit.id)
      await admin.from('mevzuat_kaynaklar').update({
        son_tarama: new Date().toISOString(), hata_sayisi: (kaynak.hata_sayisi || 0) + 1
      }).eq('id', kaynak.id)
      return { ok: false, hata }
    }

    // Yeni kayit olustur (her tarama yeni bir kayit; ayni baslik+url varsa atla)
    const { data: mevcut } = await admin.from('mevzuat_kayitlari').select('id').eq('office_id', officeId).eq('kaynak_url', kaynak.url).maybeSingle()
    let yeniKayitId = null
    let yeniKayitSayisi = 0
    if (!mevcut) {
      const adaylar = tarihAdaylariCikar(metin)
      const ozet = await aiOzet(env, metin, kaynak.ad)
      const { data: yeni } = await admin.from('mevzuat_kayitlari').insert({
        office_id: officeId,
        kaynak_id: kaynak.id,
        baslik: kaynak.ad + ' — Tarama ' + new Date().toISOString().slice(0, 10),
        kurum: kaynak.kurum,
        kaynak_url: kaynak.url,
        kaynak_bolum: kaynak.ad,
        ham_metin: metin.substring(0, 50000),
        metin_okunamadi: false,
        tarama_hatasi: null,
        tarih_adaylari: adaylar,
        ozet: ozet,
        inceleme_durumu: 'bekliyor',
      }).select('id').single()
      yeniKayitId = yeni?.id
      yeniKayitSayisi = 1
    }

    await admin.from('mevzuat_tarama_loglari').update({
      bitis_ts: new Date().toISOString(), durum: 'basarili',
      yeni_kayit_sayisi: yeniKayitSayisi, http_status: httpStatus, sure_ms: taramaSuresi
    }).eq('id', logKayit.id)
    await admin.from('mevzuat_kaynaklar').update({
      son_tarama: new Date().toISOString(), son_basari: new Date().toISOString(), hata_sayisi: 0
    }).eq('id', kaynak.id)

    return { ok: true, yeniKayitId, yeniKayitSayisi }
  } catch (e) {
    if (logKayit) {
      try { await admin.from('mevzuat_tarama_loglari').update({ bitis_ts: new Date().toISOString(), durum: 'hata', hata_mesaji: e.message }).eq('id', logKayit.id) } catch {}
    }
    return { ok: false, hata: e.message }
  }
}

// ============================================================
// HTTP handlers
// ============================================================
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' } })
}

export async function onRequestGet({ request, env }) {
  const kontrol = await dogrulaKullanici(request, env)
  if (!kontrol.ok) return json({ ok: false, error: kontrol.hata }, kontrol.kod)
  const admin = supabaseAdmin(env)
  if (!admin) return json({ ok: false, error: 'Supabase credentials missing' }, 500)
  const officeId = await officeIdAl(kontrol)
  const url = new URL(request.url)
  const action = url.searchParams.get('action') || 'kaynaklar'

  if (action === 'kaynaklar') {
    const { data } = await admin.from('mevzuat_kaynaklar').select('*').eq('office_id', officeId).order('id', { ascending: true })
    return json({ ok: true, kaynaklar: data || [] })
  }
  if (action === 'kayitlar') {
    const inceleme = url.searchParams.get('inceleme')
    const kaynakId = url.searchParams.get('kaynak_id')
    const limit = Math.min(200, parseInt(url.searchParams.get('limit') || '50'))
    let q = admin.from('mevzuat_kayitlari').select('id,baslik,kurum,yayin_tarihi,yururluk_tarihi,ozet,inceleme_durumu,kaynak_url,tarama_hatasi,metin_okunamadi,olusturma_ts,tarih_adaylari').eq('office_id', officeId).order('olusturma_ts', { ascending: false }).limit(limit)
    if (inceleme) q = q.eq('inceleme_durumu', inceleme)
    if (kaynakId) q = q.eq('kaynak_id', parseInt(kaynakId))
    const { data } = await q
    return json({ ok: true, kayitlar: data || [] })
  }
  if (action === 'kayit-detay') {
    const id = parseInt(url.searchParams.get('id'))
    const { data } = await admin.from('mevzuat_kayitlari').select('*').eq('id', id).eq('office_id', officeId).maybeSingle()
    return json({ ok: true, kayit: data })
  }
  if (action === 'gorevler') {
    const durum = url.searchParams.get('durum')
    let q = admin.from('mevzuat_gorevler').select('*').eq('office_id', officeId).order('son_tarih', { ascending: true })
    if (durum) q = q.eq('durum', durum)
    const { data } = await q
    return json({ ok: true, gorevler: data || [] })
  }
  if (action === 'kurallar') {
    const { data } = await admin.from('mevzuat_kurallar').select('*').eq('office_id', officeId).order('tarih', { ascending: true })
    return json({ ok: true, kurallar: data || [] })
  }
  if (action === 'eslesmeler') {
    const kuralId = url.searchParams.get('kural_id')
    let q = admin.from('mevzuat_mukellef_eslesmeleri').select('*').eq('office_id', officeId)
    if (kuralId) q = q.eq('mevzuat_kural_id', parseInt(kuralId))
    const { data } = await q
    return json({ ok: true, eslesmeler: data || [] })
  }
  if (action === 'tarama-loglari') {
    const { data } = await admin.from('mevzuat_tarama_loglari').select('*').eq('office_id', officeId).order('baslangic_ts', { ascending: false }).limit(50)
    return json({ ok: true, loglar: data || [] })
  }
  if (action === 'panel') {
    const [kaynaklar, kayitlar, gorevler, kurallar] = await Promise.all([
      admin.from('mevzuat_kaynaklar').select('id,ad,kurum,aktif,son_tarama,hata_sayisi').eq('office_id', officeId),
      admin.from('mevzuat_kayitlari').select('id,inceleme_durumu').eq('office_id', officeId),
      admin.from('mevzuat_gorevler').select('id,durum,son_tarih').eq('office_id', officeId),
      admin.from('mevzuat_kurallar').select('id,durum').eq('office_id', officeId),
    ])
    const kayitSayim = {}
    for (const k of kayitlar.data || []) kayitSayim[k.inceleme_durumu] = (kayitSayim[k.inceleme_durumu] || 0) + 1
    const gorevSayim = {}
    for (const g of gorevler.data || []) gorevSayim[g.durum] = (gorevSayim[g.durum] || 0) + 1
    const bugun = new Date().toISOString().slice(0, 10)
    const gecikenGorevler = (gorevler.data || []).filter(g => g.son_tarih && g.son_tarih < bugun && g.durum !== 'tamamlandi' && g.durum !== 'iptal').length
    const yaklasanGorevler = (gorevler.data || []).filter(g => {
      if (!g.son_tarih || g.durum === 'tamamlandi' || g.durum === 'iptal') return false
      const diff = (new Date(g.son_tarih) - new Date(bugun)) / 86400000
      return diff >= 0 && diff <= 7
    }).length
    return json({
      ok: true,
      panel: {
        kaynakSayisi: (kaynaklar.data || []).length,
        aktifKaynak: (kaynaklar.data || []).filter(k => k.aktif).length,
        hataliKaynak: (kaynaklar.data || []).filter(k => (k.hata_sayisi || 0) > 0).length,
        kayitSayim,
        incelemeBekleyen: kayitSayim['bekliyor'] || 0,
        gorevSayim,
        gecikenGorev: gecikenGorevler,
        yaklasanGorev: yaklasanGorevler,
        aktifKural: (kurallar.data || []).filter(k => k.durum === 'aktif').length,
      }
    })
  }
  return json({ ok: false, error: 'Bilinmeyen action' }, 400)
}

export async function onRequestPost({ request, env }) {
  const kontrol = await dogrulaKullanici(request, env)
  if (!kontrol.ok) return json({ ok: false, error: kontrol.hata }, kontrol.kod)
  const admin = supabaseAdmin(env)
  if (!admin) return json({ ok: false, error: 'Supabase credentials missing' }, 500)
  const officeId = await officeIdAl(kontrol)
  const body = await request.json().catch(() => ({}))
  const action = body?.action

  if (action === 'kaynak-ekle') {
    const { ad, kurum, url, tip, erisim_yontemi, aciklama, tarama_araligi_dakika } = body
    if (!ad || !url) return json({ ok: false, error: 'ad ve url gerekli' }, 400)
    const { data, error } = await admin.from('mevzuat_kaynaklar').insert({
      office_id: officeId, ad, kurum: kurum || 'Genel', url,
      tip: tip || 'html', erisim_yontemi: erisim_yontemi || 'scrape',
      aciklama: aciklama || null, tarama_araligi_dakika: tarama_araligi_dakika || 1440, aktif: true
    }).select().single()
    if (error) return json({ ok: false, error: error.message }, 500)
    return json({ ok: true, kaynak: data })
  }
  if (action === 'kaynak-guncelle') {
    const { id, ...rest } = body
    if (!id) return json({ ok: false, error: 'id gerekli' }, 400)
    const izinli = ['ad','kurum','url','tip','erisim_yontemi','aktif','aciklama','tarama_araligi_dakika']
    const patch = {}
    for (const k of izinli) if (rest[k] !== undefined) patch[k] = rest[k]
    const { data, error } = await admin.from('mevzuat_kaynaklar').update(patch).eq('id', id).eq('office_id', officeId).select().single()
    if (error) return json({ ok: false, error: error.message }, 500)
    return json({ ok: true, kaynak: data })
  }
  if (action === 'kaynak-test') {
    const { url } = body
    if (!url) return json({ ok: false, error: 'url gerekli' }, 400)
    try {
      const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'MUBIS-Mevzuat-Tarayici/1.0' } })
      const erisimYontemi = r.ok ? (r.headers.get('content-type')?.includes('json') ? 'api' : r.headers.get('content-type')?.includes('xml') ? 'rss' : 'scrape') : 'manual'
      return json({ ok: true, httpStatus: r.status, erisimYontemi, contentType: r.headers.get('content-type') || '', erisilebilir: r.ok })
    } catch (e) {
      return json({ ok: false, error: e.message, erisilebilir: false })
    }
  }
  if (action === 'kaynak-sil') {
    const { id } = body
    if (error) return json({ ok: false, error: error.message }, 500)
    return json({ ok: true })
  }
  if (action === 'tara') {
    let kaynaklar = []
    if (body.tumu) {
      const { data } = await admin.from('mevzuat_kaynaklar').select('*').eq('office_id', officeId).eq('aktif', true)
      kaynaklar = data || []
    } else if (body.kaynak_id) {
      const { data } = await admin.from('mevzuat_kaynaklar').select('*').eq('id', body.kaynak_id).eq('office_id', officeId).single()
      if (data) kaynaklar = [data]
    }
    const sonuclar = []
    for (const k of kaynaklar) {
      const r = await kaynakTara(env, admin, k, officeId)
      sonuclar.push({ kaynak: k.ad, ...r })
    }
    return json({ ok: true, sonuclar })
  }
  if (action === 'inceleme-karar') {
    const { kayit_id, karar, yorum } = body
    if (!kayit_id || !karar) return json({ ok: false, error: 'kayit_id ve karar gerekli' }, 400)
    const durumMap = { onay: 'onaylandi', red: 'reddedildi', ertele: 'bekliyor' }
    const yeniDurum = durumMap[karar] || 'bekliyor'
    await admin.from('mevzuat_inceleme_kararlari').insert({
      office_id: officeId, mevzuat_kayit_id: kayit_id, karar, yorum: yorum || null, kullanici_id: kontrol.profil?.id
    })
    // kayit bilgisini al (bildirim icin)
    const { data: kayit } = await admin.from('mevzuat_kayitlari').select('baslik,kurum').eq('id', kayit_id).maybeSingle()
    await admin.from('mevzuat_kayitlari').update({ inceleme_durumu: yeniDurum, onaylayan_user_id: kontrol.profil?.id, onay_tarihi: new Date().toISOString() }).eq('id', kayit_id).eq('office_id', officeId)
    // Faz 7: MUBiS ici bildirim olustur (onay/red durumunda)
    if (karar === 'onay' || karar === 'red') {
      try {
        await admin.from('notifications').insert({
          office_id: officeId,
          audience: 'admin',
          type: 'mevzuat_inceleme',
          title: karar === 'onay' ? 'Mevzuat Onaylandı' : 'Mevzuat Reddedildi',
          message: `"${kayit?.baslik || 'Mevzuat kaydı'}" (${kayit?.kurum || ''}) ${karar === 'onay' ? 'onaylandı' : 'reddedildi'}.`,
          route: '/admin/mevzuat-kaynaklari',
          metadata: { kayit_id, karar, kullanici: kontrol.profil?.name || kontrol.profil?.id }
        })
      } catch { /* bildirim yazilamazsa sessizce devam */ }
    }
    return json({ ok: true })
  }
  if (action === 'kural-ekle') {
    const { mevzuat_kayit_id, baslik, kural_tipi, konu, ilgili_kurum, tarih, son_basvuru_tarihi, dayanak_url, dayanak_bolum, aciklama } = body
    if (!baslik) return json({ ok: false, error: 'baslik gerekli' }, 400)
    const { data, error } = await admin.from('mevzuat_kurallar').insert({
      office_id: officeId, mevzuat_kayit_id: mevzuat_kayit_id || null, baslik,
      kural_tipi: kural_tipi || 'tarih', konu, ilgili_kurum, tarih: tarih || null,
      son_basvuru_tarihi: son_basvuru_tarihi || null, dayanak_url, dayanak_bolum, aciklama,
      onaylayan_user_id: kontrol.profil?.id
    }).select().single()
    if (error) return json({ ok: false, error: error.message }, 500)
    return json({ ok: true, kural: data })
  }
  if (action === 'gorev-ekle') {
    const { baslik, aciklama, sorumlu_user_id, son_tarih, oncelik, dayanak_url, mevzuat_kural_id, client_id } = body
    if (!baslik) return json({ ok: false, error: 'baslik gerekli' }, 400)
    const { data, error } = await admin.from('mevzuat_gorevler').insert({
      office_id: officeId, baslik, aciklama: aciklama || null,
      sorumlu_user_id: sorumlu_user_id || null, son_tarih: son_tarih || null,
      oncelik: oncelik || 'normal', dayanak_url: dayanak_url || null,
      mevzuat_kural_id: mevzuat_kural_id || null, client_id: client_id || null,
      olusturan_user_id: kontrol.profil?.id, durum: 'bekliyor'
    }).select().single()
    if (error) return json({ ok: false, error: error.message }, 500)
    return json({ ok: true, gorev: data })
  }
  if (action === 'gorev-durum') {
    const { id, durum } = body
    if (!id || !durum) return json({ ok: false, error: 'id ve durum gerekli' }, 400)
    const patch = { durum, guncelleme_ts: new Date().toISOString() }
    if (durum === 'tamamlandi') patch.tamamlanma_ts = new Date().toISOString()
    const { error } = await admin.from('mevzuat_gorevler').update(patch).eq('id', id).eq('office_id', officeId)
    if (error) return json({ ok: false, error: error.message }, 500)
    return json({ ok: true })
  }
  if (action === 'eslesme-kaydet') {
    const { kural_id, adaylar } = body
    if (!kural_id || !Array.isArray(adaylar)) return json({ ok: false, error: 'kural_id ve adaylar gerekli' }, 400)
    let eklenen = 0
    for (const a of adaylar) {
      const { error } = await admin.from('mevzuat_mukellef_eslesmeleri').upsert({
        office_id: officeId, mevzuat_kural_id: kural_id, client_id: a.client_id,
        eslesme_tipi: a.eslesme_tipi || 'aday', gerekce: (a.gerekce || []).join('; '),
        eksik_bilgiler: a.eksik_bilgiler || null, kontrol_gerekli: !!a.kontrol_gerekli,
      }, { onConflict: 'mevzuat_kural_id,client_id' })
      if (!error) eklenen++
    }
    return json({ ok: true, eklenen })
  }
  if (action === 'mevzuat-bildirim') {
    const { kural_id, baslik, tarih, mesaj, office_id, gonderim_kanali } = body
    const oid = office_id || officeId
    const bildirimMesaji = mesaj || `${baslik} — Son tarih: ${tarih}`
    const sonuclar = { mubis: false, whatsapp: 'atlandi', hatalar: [] }

    // 1) MUBiS ici bildirim (her zaman)
    try {
      await admin.from('notifications').insert({
        office_id: oid,
        audience: 'admin',
        type: 'mevzuat_takvim',
        title: baslik || 'Mevzuat Takvim Hatırlatması',
        message: bildirimMesaji,
        route: '/admin/mevzuat-kaynaklari',
        metadata: { kural_id, tarih, kaynak: 'mevzuat', gonderim_kanali: gonderim_kanali || 'mubis' }
      })
      sonuclar.mubis = true
    } catch (e) { sonuclar.hatalar.push('MUBiS: ' + e.message) }

    // 2) WhatsApp bildirimi (ayarliysa + kanal uygunsa)
    // Mevzuat bildirimleri admin'e (ofis personeline) gider; musteriye degil.
    // WhatsApp kanali 'api' ise ve token'lar varsa gonder.
    if (gonderim_kanali === 'whatsapp' || gonderim_kanali === 'ikisi') {
      try {
        const { data: settingsRows } = await admin.from('app_settings').select('key, value')
          .in('key', ['whatsapp_channel', 'whatsapp_phone_number_id', 'whatsapp_access_token'])
        const settings = {}
        ;(settingsRows || []).forEach(r => { if (r.value) settings[r.key] = r.value })
        const waChannel = settings.whatsapp_channel === 'web' ? 'web' : 'api'
        // Admin (ofis) telefon numarasi: app_settings'de 'office_phone' veya 'admin_phone'
        const { data: phoneRow } = await admin.from('app_settings').select('value').eq('key', 'office_phone').maybeSingle()
        const officePhone = phoneRow?.value || ''
        if (waChannel === 'api' && settings.whatsapp_phone_number_id && settings.whatsapp_access_token && officePhone) {
          const normalizePhone = (p) => {
            let c = String(p || '').replace(/\D/g, '')
            if (c.startsWith('0')) c = c.slice(1)
            if (!c.startsWith('90')) c = '90' + c
            return c
          }
          const to = normalizePhone(officePhone)
          if (to.length >= 12) {
            const r = await fetch(`https://graph.facebook.com/v18.0/${settings.whatsapp_phone_number_id}/messages`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${settings.whatsapp_access_token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body: bildirimMesaji } })
            })
            sonuclar.whatsapp = r.ok ? 'gonderildi' : 'hata'
            await admin.from('whatsapp_logs').insert({
              client_id: null, beyan_type: 'mevzuat', year: new Date().getFullYear(),
              document_type: 'mevzuat_bildirim', phone: to, email: '', channel: 'whatsapp',
              message_id: '', status: r.ok ? 'sent' : 'failed', sent_at: new Date().toISOString()
            })
          } else {
            sonuclar.whatsapp = 'telefon-eksik'
          }
        } else if (waChannel === 'web' || waChannel === 'masaustu') {
          sonuclar.whatsapp = 'web-kanali-sunucudan-gonderilemez'
        } else {
          sonuclar.whatsapp = 'ayar-eksik'
        }
      } catch (e) { sonuclar.whatsapp = 'hata'; sonuclar.hatalar.push('WhatsApp: ' + e.message) }
    }

    // 3) Musterilere bildirim (eslesmeler varsa)
    if (body.musterilere_bildir && kural_id) {
      try {
        const { data: eslesmeler } = await admin.from('mevzuat_mukellef_eslesmeleri').select('client_id').eq('mevzuat_kural_id', kural_id)
        if (eslesmeler?.length) {
          for (const e of eslesmeler) {
            await admin.from('notifications').insert({
              office_id: oid, client_id: e.client_id, audience: 'client',
              type: 'mevzuat_bildirim',
              title: 'Mevzuat Bildirimi',
              message: bildirimMesaji,
              route: '/portal',
              metadata: { kural_id, tarih, kaynak: 'mevzuat' }
            })
          }
          sonuclar.musteriBildirim = eslesmeler.length
        }
      } catch (e) { sonuclar.hatalar.push('Musteri bildirim: ' + e.message) }
    }

    return json({ ok: true, sonuclar })
  }
  if (action === 'kural-guncelle') {
    const { id, ...rest } = body
    const patch = {}
    for (const k of izinli) if (rest[k] !== undefined) patch[k] = rest[k]
    const { error } = await admin.from('mevzuat_kurallar').update(patch).eq('id', id).eq('office_id', officeId)
    if (error) return json({ ok: false, error: error.message }, 500)
    return json({ ok: true })
  }
  return json({ ok: false, error: 'Bilinmeyen action' }, 400)
}

export async function onRequestPatch({ request, env }) {
  // PATCH /api/mevzuat  body: { action, ... }  (kisa yol)
  const kontrol = await dogrulaKullanici(request, env)
  if (!kontrol.ok) return json({ ok: false, error: kontrol.hata }, kontrol.kod)
  // redirect to POST logic by re-parsing
  // (CF Pages: onRequestPatch -> handle like POST)
  const admin = supabaseAdmin(env)
  if (!admin) return json({ ok: false, error: 'Supabase credentials missing' }, 500)
  // Basit: sadece gorev-durum destekle
  const body = await request.json().catch(() => ({}))
  if (body.action === 'gorev-durum') {
    const officeId = await officeIdAl(kontrol)
    const { id, durum } = body
    const patch = { durum, guncelleme_ts: new Date().toISOString() }
    if (durum === 'tamamlandi') patch.tamamlanma_ts = new Date().toISOString()
    const { error } = await admin.from('mevzuat_gorevler').update(patch).eq('id', id).eq('office_id', officeId)
    if (error) return json({ ok: false, error: error.message }, 500)
    return json({ ok: true })
  }
  return json({ ok: false, error: 'Desteklenmeyen PATCH action' }, 400)
}

export async function onRequestDelete({ request, env }) {
  const kontrol = await dogrulaKullanici(request, env)
  if (!kontrol.ok) return json({ ok: false, error: kontrol.hata }, kontrol.kod)
  const admin = supabaseAdmin(env)
  if (!admin) return json({ ok: false, error: 'Supabase credentials missing' }, 500)
  const officeId = await officeIdAl(kontrol)
  const url = new URL(request.url)
  const id = parseInt(url.searchParams.get('id'))
  const tablo = url.searchParams.get('tablo') || 'kaynaklar'
  const tabloAdi = TABLOLAR[tablo]
  if (!tabloAdi || !id) return json({ ok: false, error: 'id ve tablo gerekli' }, 400)
  const { error } = await admin.from(tabloAdi).delete().eq('id', id).eq('office_id', officeId)
  if (error) return json({ ok: false, error: error.message }, 500)
  return json({ ok: true })
}