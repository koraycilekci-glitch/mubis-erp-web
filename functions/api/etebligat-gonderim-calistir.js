// MUBIS - e-Tebligat OTOMATIK GONDERIM calistirici (VPS poller cagirir)
// GET ?sunucu=1 -> plan oku + vadesi kontrol + gonderimi yap + son_calisma guncelle
import { supabaseAdmin, json } from './_lib.js'

function anahtarUydu(env, request) {
  const beklenen = env?.MUBIS_SUNUCU_ANAHTARI
  return Boolean(beklenen) && request.headers.get('x-mubis-key') === beklenen
}

const PLAN_KEY = 'etebligat_gonderim_v1'

// WhatsApp Web/Masaustu kanali: VPS yardimcisinda gonderimi calistir ve
// sonucu bekle. (Cloudflare Functions tarayici acamaz; is VPS'te yapilir.)
async function whatsappYardimciGonder(env, telefon, mesaj) {
  const base = String(env?.YARDIMCI_URL || '').replace(/\/+$/, '')
  const key = String(env?.MUBIS_SUNUCU_ANAHTARI || '')
  if (!base || !key) return { ok: false, reason: 'yardimci-yapilandirilmamis' }
  const basliklar = { 'content-type': 'application/json', 'x-mubis-key': key }
  let isId = ''
  try {
    const r = await fetch(base + '/is', {
      method: 'POST', headers: basliklar,
      body: JSON.stringify({ is: 'whatsapp-web-gonder', asenkron: true, telefon, mesaj }),
      signal: AbortSignal.timeout(20000)
    })
    const j = await r.json().catch(() => ({}))
    if (!j?.success || !j?.isId) return { ok: false, reason: j?.error || 'is-baslatilamadi' }
    isId = j.isId
  } catch (e) {
    return { ok: false, reason: e?.message || 'yardimci-ulasilamadi' }
  }
  const t0 = Date.now()
  while (Date.now() - t0 < 55000) {
    await new Promise(r => setTimeout(r, 3000))
    try {
      const r = await fetch(base + '/is-sonuc?id=' + encodeURIComponent(isId), { headers: basliklar, signal: AbortSignal.timeout(15000) })
      const j = await r.json().catch(() => null)
      if (!j?.success) continue
      if (j.durum === 'bitti') return { ok: true, ...j }
      if (j.durum === 'hata') return { ok: false, reason: j.error || j.reason || 'gonderim-hatasi' }
    } catch { /* yoklamaya devam */ }
  }
  return { ok: false, reason: 'zaman-asimi' }
}

export async function onRequestGet({ env, request }) {
  const supabase = supabaseAdmin(env)
  if (!supabase) return json({ error: 'Supabase credentials missing' }, 500)
  const url = new URL(request.url)
  if (url.searchParams.get('sunucu') !== '1') return json({ ok: false, error: 'yetkisiz' }, 401)
  if (!anahtarUydu(env, request)) return json({ ok: false, error: 'yetkisiz' }, 401)

  // Plan oku
  let plan = null
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', PLAN_KEY).limit(1).maybeSingle()
    if (data?.value) plan = typeof data.value === 'string' ? JSON.parse(data.value) : data.value
  } catch { plan = null }
  if (!plan || plan.aktif !== true) return json({ ok: true, vadesi: false, reason: 'plan-pasif' })

  const gunler = Array.isArray(plan.gunler) ? plan.gunler.map(Number) : []
  // 2.8.321: Cloudflare calisma zamani UTC'dir; plan saatleri Turkiye
  // saatiyle girilir. Karsilastirma Europe/Istanbul'a gore yapilir.
  const trParcalar = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short'
  }).formatToParts(new Date())
  const trAl = (t) => (trParcalar.find(p => p.type === t)?.value || '')
  const gunMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const gun = gunMap[trAl('weekday')] ?? 0
  const simdiSaat = `${trAl('hour')}:${trAl('minute')}`
  const bugunStr = `${trAl('year')}-${trAl('month')}-${trAl('day')}`
  const haftaEslesir = gunler.filter(n => n >= 0 && n <= 6).includes(gun)
  const ayGunuEslesir = gunler.filter(n => n >= 101 && n <= 131).map(n => n - 100).includes(Number(trAl('day')))
  if (url.searchParams.get('kontrol') === '1') {
    return json({ ok: true, vadesi: false, kontrol: {
      simdi: simdiSaat, bugun: bugunStr, haftaGunu: gun, planSaat: plan.saat,
      gunler, haftaEslesir, ayGunuEslesir, sonCalisma: plan.son_calisma || null,
      kanal: plan.kanal || 'tercih', musteriSayisi: Array.isArray(plan.musteriler) ? plan.musteriler.length : 0
    } })
  }
  if (!haftaEslesir && !ayGunuEslesir) return json({ ok: true, vadesi: false, reason: 'gun-eslesmedi' })
  if (!/^\d{1,2}:\d{2}$/.test(String(plan.saat || '')) || String(plan.saat) > simdiSaat) {
    return json({ ok: true, vadesi: false, reason: 'saat-gelmedi' })
  }
  // son_calisma kontrolu (Turkiye tarihine gore)
  if (plan.son_calisma) {
    try {
      const sonStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(plan.son_calisma))
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

  // 2.8.321: Kanal bazli filtre — gonderilmis kanala tekrar gonderme.
  const filtre = kanal === 'whatsapp' ? 'whatsapp_gonderim_ts.is.null'
    : kanal === 'email' ? 'email_gonderim_ts.is.null'
    : 'or=(whatsapp_gonderim_ts.is.null,email_gonderim_ts.is.null)'
  const baslangic = Date.now()
  const SURE_LIMIT = 60000
  let kalan = false

  for (const m of musteriler) {
    if (Date.now() - baslangic > SURE_LIMIT) { kalan = true; break }
    // Bu musterinin gonderilmemis tebligatlarini bul
    let tebligatlar = []
    try {
      const r = await fetch(`${SB}/rest/v1/etebligatlar?client_id=eq.${m.id}&select=belge_no,file_url&${filtre}`, { headers: SVC })
      if (r.ok) tebligatlar = await r.json()
    } catch { tebligatlar = [] }
    if (!Array.isArray(tebligatlar)) tebligatlar = []

    for (const t of tebligatlar) {
      if (!t?.belge_no) continue
      if (Date.now() - baslangic > SURE_LIMIT) { kalan = true; break }
      try {
        const r = await fetch(`${BASE}/api/etebligat-gonder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-mubis-key': env?.MUBIS_SUNUCU_ANAHTARI || '' },
          body: JSON.stringify({ client_id: m.id, belge_no: t.belge_no, file_url: t.file_url || '', kanal })
        })
        const j = await r.json().catch(() => ({}))
        if (!j?.ok && !j?.atlandi) {
          hatali++
          hatalar.push(`${m.id}/${t.belge_no}: ${j?.error || 'hata'}`)
          continue
        }
        let basarili = j?.mail === 'gonderildi' || j?.whatsapp === 'gonderildi'
        // WhatsApp Web/Masaustu: gorevi VPS yardimcisinda calistir
        if (j?.yerel_whatsapp?.telefon) {
          const wa = await whatsappYardimciGonder(env, j.yerel_whatsapp.telefon, j.yerel_whatsapp.mesaj)
          if (wa?.ok) {
            basarili = true
            try {
              await fetch(`${SB}/rest/v1/etebligatlar?client_id=eq.${m.id}&belge_no=eq.${encodeURIComponent(t.belge_no)}`, {
                method: 'PATCH',
                headers: { ...SVC, 'Prefer': 'return=minimal' },
                body: JSON.stringify({ whatsapp_gonderim_ts: new Date().toISOString() })
              })
            } catch { /* zaman damgasi sonraki turda tekrar denenir */ }
          } else {
            hatali++
            hatalar.push(`${m.id}/${t.belge_no}: WhatsApp ${wa?.reason || 'gonderilemedi'}`)
            continue
          }
        }
        if (basarili) gonderilen++
        else {
          const sorun = [j?.mail, j?.whatsapp]
            .filter(v => typeof v === 'string' && v.startsWith('hata')).join('; ')
          if (sorun) {
            hatali++
            hatalar.push(`${m.id}/${t.belge_no}: ${sorun}`.substring(0, 200))
          } else atlanan++
        }
      } catch (e) {
        hatali++; hatalar.push(`${m.id}/${t.belge_no}: ${e?.message || 'hata'}`)
      }
    }
    if (kalan) break
  }

  // son_calisma: yalnizca TUM is bittiyse guncelle. Sure siniri geldiyse
  // dokunma; sonraki dakika kaldigi yerden devam eder.
  if (!kalan) {
    plan.son_calisma = new Date().toISOString()
    try {
      await supabase.from('app_settings').upsert({ key: PLAN_KEY, value: JSON.stringify(plan), office_id: 1 }, { onConflict: 'office_id,key' })
    } catch { /* yoksay */ }
  }

  return json({ ok: true, vadesi: true, gonderilen, atlanan, hatali, kalan, hatalar: hatalar.slice(0, 10) })
}

function SB_URL_BASE() { return 'https://gxuqrxmpgoeyykoolmwv.supabase.co' }
function svcHeaders(env) {
  const key = env?.SUPABASE_SERVICE_ROLE_KEY || env?.SUPABASE_SERVICE_KEY
  if (!key) return null
  return { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' }
}
