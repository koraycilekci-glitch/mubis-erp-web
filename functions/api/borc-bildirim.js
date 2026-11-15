// MUBIS - Otomatik Borç Bildirimi (Cloudflare Pages Function)
//
// Plan: app_settings.borc_bildirim_plan
//   { aktif, gunler:[1,5,20] (ayın günleri), saat:'10:00', kanal:'whatsapp'|'email' }
//
// Uclar:
//   GET  (JWT admin)      -> plan + son çalışma bilgisi
//   POST (JWT admin)      -> plan kaydet
//   POST ?calistir=1 (x-mubis-key) -> VPS her dakika tetikler; gün/saat uyarsa
//                                     borcu olan müşterilere bildirim gönderir
//
// Gönderim:
//   WhatsApp -> VPS yardımcısındaki WhatsApp Web (whatsapp-web-gonder)
//   E-posta  -> nodemailer (app_settings SMTP)
import nodemailer from 'nodemailer'
import { json, supabaseAdmin, normalizePhone } from './_lib.js'

const PLAN_KEY = 'borc_bildirim_plan'
const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

const sayi = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function para(n) {
  return sayi(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Türkiye saatine göre bugünün gün numarası ve saat
function trZaman() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date())
  const al = (t) => Number(parts.find(p => p.type === t).value)
  return {
    yil: al('year'), ay: al('month'), gun: al('day'),
    saat: `${String(al('hour')).padStart(2, '0')}:${String(al('minute')).padStart(2, '0')}`,
    tarih: `${String(al('day')).padStart(2, '0')}.${String(al('month')).padStart(2, '0')}.${al('year')}`,
    anahtar: `${al('year')}-${String(al('month')).padStart(2, '0')}-${String(al('day')).padStart(2, '0')}`
  }
}

function planOku(ham) {
  if (!ham) return { aktif: false, gunler: [], saat: '10:00', kanal: 'whatsapp', son_anahtar: '' }
  let j = ham
  if (typeof ham === 'string') {
    try { j = JSON.parse(ham) } catch { return { aktif: false, gunler: [], saat: '10:00', kanal: 'whatsapp', son_anahtar: '' } }
  }
  if (!j || typeof j !== 'object') return { aktif: false, gunler: [], saat: '10:00', kanal: 'whatsapp', son_anahtar: '' }
  return {
    aktif: !!j.aktif,
    gunler: Array.isArray(j.gunler) ? j.gunler.map(Number).filter(n => n >= 1 && n <= 31) : [],
    saat: /^\d{1,2}:\d{2}$/.test(String(j.saat || '')) ? String(j.saat) : '10:00',
    kanal: ['email', 'ikisi', 'tercih'].includes(j.kanal) ? j.kanal : 'whatsapp',
    muhasebeDahil: j.muhasebeDahil === true,
    son_anahtar: String(j.son_anahtar || '')
  }
}

// Borç dökümü satırlarını (SGK/Vergi) frontend ile aynı mantıkla çözer
function detaylar(kayit) {
  const d = kayit?.detay || {}
  if (kayit?.tip === 'sgk') {
    let sadece = sayi(d.sadeceBorclar ?? d.sadece_borclar)
    let gz = sayi(d.gz ?? d.gecikmeZammi ?? d.gecikme_zammi)
    if (sadece === 0 && gz === 0 && sayi(kayit?.toplam) > 0 && kayit?.mesaj) {
      const m = String(kayit.mesaj)
      const s = m.match(/Sadece Bor[a-zçğıöşü]* Toplami:\s*([\d.,]+)/i)
      const g = m.match(/GZ:\s*([\d.,]+)/i)
      if (s) sadece = sayi(String(s[1]).replace(/\./g, '').replace(',', '.'))
      if (g) gz = sayi(String(g[1]).replace(/\./g, '').replace(',', '.'))
    }
    return { gecmis: sadece, guncel: gz, toplam: sayi(kayit.toplam) || sadece + gz }
  }
  let gecmis = sayi(d.vadesiGecmis ?? d.vadesi_gecmis)
  let guncel = sayi(d.vadesiGelmemis ?? d.vadesi_gelmemis)
  if (gecmis === 0 && guncel === 0 && sayi(kayit?.toplam) > 0 && kayit?.mesaj) {
    const m = String(kayit.mesaj)
    const g = m.match(/Vadesi gecmis:\s*([\d.,]+)/i)
    const g2 = m.match(/Vadesi gecmemis:\s*([\d.,]+)/i)
    const g3 = m.match(/Vadesi gelmemis:\s*([\d.,]+)/i)
    if (g) gecmis = sayi(String(g[1]).replace(/\./g, '').replace(',', '.'))
    if (g2 || g3) guncel = sayi(String((g2 || g3)[1]).replace(/\./g, '').replace(',', '.'))
  }
  return { gecmis, guncel, toplam: sayi(kayit.toplam) || gecmis + guncel }
}

function mesajUret(musteriAdi, tarih, sgk, vergi, muhasebe = null) {
  const ad = (musteriAdi || 'Değerli Müşterimiz').toLocaleUpperCase('tr-TR')
  const satirlar = [
    '📢 *MUBİS – BORÇ BİLGİLENDİRMESİ*',
    '',
    `📅 *Tarih: ${tarih}*`,
    '',
    `Sayın *${ad}*,`,
    '',
    `${tarih} tarihi itibarıyla sistemimizde kayıtlı borç durumunuz aşağıdaki gibidir:`
  ]

  const s = sgk ? detaylar(sgk) : null
  const v = vergi ? detaylar(vergi) : null
  const sgkGecmis = s ? sayi(s.gecmis) : 0
  const sgkGuncel = s ? sayi(s.guncel) : 0
  const sgkToplam = sgk ? (sayi(sgk.toplam) || (sgkGecmis + sgkGuncel)) : 0

  const vergiGecmis = v ? sayi(v.gecmis) : 0
  const vergiGuncel = v ? sayi(v.guncel) : 0
  const vergiToplam = vergi ? (sayi(vergi.toplam) || (vergiGecmis + vergiGuncel)) : 0

  let muhasebeGecmis = 0, muhasebeGuncel = 0, muhasebeToplam = 0
  if (muhasebe && sayi(muhasebe.kalanBorc) > 0) {
    muhasebeToplam = sayi(muhasebe.kalanBorc)
    muhasebeGecmis = sayi(muhasebe.gecmisDonem)
    muhasebeGuncel = sayi(muhasebe.guncelDonem ?? (muhasebeToplam - muhasebeGecmis))
  }

  const genelToplam = sgkToplam + vergiToplam + muhasebeToplam

  if (sgk) {
    satirlar.push(
      '',
      '🔹 *SGK BORCU*',
      `• Geçmiş Dönem: ${para(sgkGecmis)} TL`,
      `• Güncel Dönem: ${para(sgkGuncel)} TL`,
      `• *TOPLAM: ${para(sgkToplam)} TL*`
    )
  }
  if (vergi) {
    satirlar.push(
      '',
      '🔹 *VERGİ BORCU*',
      `• Geçmiş Dönem: ${para(vergiGecmis)} TL`,
      `• Güncel Dönem: ${para(vergiGuncel)} TL`,
      `• *TOPLAM: ${para(vergiToplam)} TL*`
    )
  }
  if (muhasebe && sayi(muhasebe.kalanBorc) > 0) {
    satirlar.push(
      '',
      '🔹 *MUHASEBE ÜCRETİ*',
      `• Geçmiş Dönem: ${para(muhasebeGecmis)} TL`,
      `• Güncel Dönem: ${para(muhasebeGuncel)} TL`,
      `• *TOPLAM: ${para(muhasebeToplam)} TL*`
    )
  }

  satirlar.push(
    '',
    '━━━━━━━━━━━━━━',
    `💰 *GENEL TOPLAM: ${para(genelToplam)} TL*`,
    '━━━━━━━━━━━━━━',
    '',
    '⚠️ Vadesi gelen ödemelerinizi zamanında gerçekleştirmenizi rica ederiz. Gecikme faizi, olası cezalar ve diğer yasal yaptırımlarla karşılaşmamanız için ödeme durumunuzu kontrol etmenizi önemle hatırlatırız.',
    '',
    'Borç bilgileriniz veya ödeme detayları hakkında bilgi almak için bizimle iletişime geçebilirsiniz.',
    '',
    'Saygılarımızla,',
    '',
    '*Smmm Aziz Koray Çilekci*',
    '*MUBİS ERP – Muhasebe Bizim İşimiz*',
    '',
    '_Bu mesaj MUBiS ERP Borç Takip Sistemi tarafından otomatik olarak gönderilmiştir._'
  )
  return satirlar.join('\n')
}

function mesajHtmlUret(musteriAdi, tarih, sgk, vergi, muhasebe = null) {
  const ad = (musteriAdi || 'Değerli Müşterimiz').toLocaleUpperCase('tr-TR')
  const blok = (baslik, d) => `
    <h3 style="margin:18px 0 6px;font-size:15px;color:#111;">${baslik}</h3>
    <table style="border-collapse:collapse;font-size:14px;color:#333;">
      <tr><td style="padding:2px 12px 2px 0;">Geçmiş Dönem:</td><td style="padding:2px 0;text-align:right;">${para(d.gecmis)} TL</td></tr>
      <tr><td style="padding:2px 12px 2px 0;">Güncel Dönem:</td><td style="padding:2px 0;text-align:right;">${para(d.guncel)} TL</td></tr>
      <tr><td style="padding:6px 12px 2px 0;font-weight:700;border-top:1px solid #ddd;">TOPLAM:</td><td style="padding:6px 0 2px;text-align:right;font-weight:700;border-top:1px solid #ddd;">${para(d.toplam)} TL</td></tr>
    </table>`

  let govde = ''
  if (sgk) govde += blok('🔹 SGK BORCU', detaylar(sgk))
  if (vergi) govde += blok('🔹 VERGİ BORCU', detaylar(vergi))
  if (muhasebe && sayi(muhasebe.kalanBorc) > 0) {
    const m = sayi(muhasebe.kalanBorc)
    const gecmis = sayi(muhasebe.gecmisDonem)
    govde += blok('🔹 MUHASEBE ÜCRETİ', { gecmis, guncel: sayi(muhasebe.guncelDonem ?? m - gecmis), toplam: m })
  }

  const sgkD = sgk ? detaylar(sgk) : null
  const vergiD = vergi ? detaylar(vergi) : null
  const sgkToplam = sgk ? (sayi(sgk.toplam) || (sayi(sgkD?.gecmis) + sayi(sgkD?.guncel))) : 0
  const vergiToplam = vergi ? (sayi(vergi.toplam) || (sayi(vergiD?.gecmis) + sayi(vergiD?.guncel))) : 0
  const muhasebeToplam = (muhasebe && sayi(muhasebe.kalanBorc) > 0) ? sayi(muhasebe.kalanBorc) : 0
  const genelToplam = sgkToplam + vergiToplam + muhasebeToplam

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f6f8;">
  <div style="max-width:640px;margin:0 auto;padding:24px 20px;font-family:Arial,Helvetica,sans-serif;color:#222;background:#fff;">
    <h2 style="margin:0 0 4px;font-size:18px;color:#0b2a4a;">📢 MUBİS – BORÇ BİLGİLENDİRMESİ</h2>
    <p style="margin:0 0 12px;font-size:14px;color:#555;">📅 Tarih: ${tarih}</p>
    <p style="margin:18px 0 8px;font-size:14px;">Sayın <strong>${ad}</strong>,</p>
    <p style="margin:0 0 6px;font-size:14px;line-height:1.6;">${tarih} tarihi itibarıyla sistemimizde kayıtlı borç durumunuz aşağıdaki gibidir:</p>
    ${govde}
    <p style="margin:18px 0 0;font-size:16px;font-weight:700;color:#0b2a4a;">💰 GENEL TOPLAM: ${para(genelToplam)} TL</p>
    <p style="margin:22px 0 0;font-size:14px;line-height:1.6;color:#333;">
      ⚠️ Vadesi gelen ödemelerinizi zamanında gerçekleştirmenizi rica ederiz. Gecikme faizi, olası cezalar ve diğer yasal yaptırımlarla karşılaşmamanız için ödeme durumunuzu kontrol etmenizi önemle hatırlatırız.
    </p>
    <p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#333;">
      Borç bilgileriniz veya ödeme detayları hakkında bilgi almak için bizimle iletişime geçebilirsiniz.
    </p>
    <p style="margin:22px 0 0;font-size:14px;line-height:1.6;">Saygılarımızla,<br /><strong>Smmm Aziz Koray Çilekci</strong><br /><em>MUBİS ERP – Muhasebe Bizim İşimiz</em></p>
    <p style="margin:18px 0 0;padding-top:12px;border-top:1px solid #e5e7eb;font-size:11px;color:#888;">
      Bu e-posta MUBİS ERP Borç Takip Sistemi tarafından otomatik olarak gönderilmiştir. Lütfen bu mesajı yanıtlamayınız.
    </p>
  </div>
</body></html>`
}

// Muhasebe (mesleki) borcu: accounting_fees + payments üzerinden kalan borç.
// Frontend hesaplaBorcOzeti ile aynı mantığın sunucu tarafı sadeleştirilmiş
// hâli: yalnızca "kalan borç > 0" bilgisi ve tutarı gerekir.
async function muhasebeBorclari(supabase, musteriIdleri) {
  const sonuc = new Map()
  try {
    const [{ data: fees }, { data: payments }] = await Promise.all([
      supabase.from('accounting_fees').select('*').in('client_id', musteriIdleri),
      supabase.from('payments').select('client_id, tutar, durum, donem, odeme_kanali').in('client_id', musteriIdleri)
    ])
    for (const fee of (fees || [])) {
      const cid = String(fee.client_id)
      const odemeler = (payments || []).filter(p => String(p.client_id) === cid)
      const aylik = sayi(fee.aylik_ucret)
      // 2.8.46: GECMIS / GUNCEL DONEM AYRIMI (muhasebe borcu)
      //  - gecmisDonem: onceki donem borcu + defter tasdik + onceki yillarin
      //    odenmemis aylik ucretleri
      //  - guncelDonem: icinde bulunulan yilin odenmemis aylik ucretleri
      //  - toplam: ikisinin toplami - tahsilat (en az 0)
      const oncekiDonem = sayi(fee.onceki_donem_borc)
      const defterTasdik = sayi(fee.defter_tasdik_ucreti)
      const now = new Date()
      const basYil = Number(fee.baslangic_yil) || now.getFullYear()
      const basAy = Number(fee.baslangic_ay) || 1
      const buYil = now.getFullYear()
      const buAy = now.getMonth() + 1

      // Odemeleri donem bazli topla (YYYY-AA)
      const donemTahsil = (yil, ay) => {
        const anahtar = `${yil}-${String(ay).padStart(2, '0')}`
        return odemeler
          .filter(p => p.durum !== 'reddedildi' && (p.durum === 'onaylandi' || p.durum === 'uygulandi' || p.durum === 'alindi' || !p.durum || p.odeme_kanali === 'manuel'))
          .filter(p => String(p.donem || '').startsWith(anahtar))
          .reduce((s, p) => s + sayi(p.tutar), 0)
      }

      let gecmisAylik = 0
      let guncelAylik = 0
      for (let y = basYil; y <= buYil; y++) {
        const ilkAy = y === basYil ? basAy : 1
        const sonAy = y === buYil ? buAy : 12
        for (let m = ilkAy; m <= sonAy; m++) {
          const kalan = Math.max(0, aylik - donemTahsil(y, m))
          if (y < buYil) gecmisAylik += kalan
          else guncelAylik += kalan
        }
      }
      // Dönem etiketi olmayan/eski ödemeler toplamdan düşülür
      const donemsizTahsil = odemeler
        .filter(p => p.durum !== 'reddedildi' && (p.durum === 'onaylandi' || p.durum === 'uygulandi' || p.durum === 'alindi' || !p.durum || p.odeme_kanali === 'manuel'))
        .filter(p => !/^\d{4}-\d{2}/.test(String(p.donem || '')))
        .reduce((s, p) => s + sayi(p.tutar), 0)

      const gecmisDonem = oncekiDonem + defterTasdik + gecmisAylik
      const guncelDonem = Math.max(0, guncelAylik - donemsizTahsil)
      const kalanBorc = Math.max(0, gecmisDonem + guncelDonem)
      if (kalanBorc > 0) sonuc.set(cid, { kalanBorc, gecmisDonem, guncelDonem })
    }
  } catch { /* yoksay */ }
  return sonuc
}

async function jwtProfili(supabase, request) {
  const auth = request.headers.get('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null
  const { data } = await supabase.auth.getUser(token)
  if (!data?.user) return null
  const { data: prof } = await supabase.from('profiles').select('id, role, office_id').eq('id', data.user.id).maybeSingle()
  return prof || null
}

const adminMi = (p) => p && ['admin', 'personel', 'super_admin'].includes(String(p.role || ''))

async function ayarlariYukle(supabase) {
  const { data } = await supabase.from('app_settings').select('key, value')
  const m = {}
  ;(data || []).forEach(r => {
    if (r.value === null || r.value === undefined || r.value === '') return
    // Ofis bazlı kayıtlarda ilk değer geçerli
    if (!(r.key in m)) m[r.key] = r.value
  })
  return m
}

export async function onRequestGet({ env, request }) {
  const supabase = supabaseAdmin(env)
  if (!supabase) return json({ ok: false, error: 'Supabase yapılandırılmamış' }, 500)
  const prof = await jwtProfili(supabase, request)
  if (!adminMi(prof)) return json({ ok: false, error: 'yetkisiz' }, 401)
  const ayarlar = await ayarlariYukle(supabase)
  return json({ ok: true, plan: planOku(ayarlar[PLAN_KEY]) })
}

export async function onRequestPost({ env, request }) {
  const supabase = supabaseAdmin(env)
  if (!supabase) return json({ ok: false, error: 'Supabase yapılandırılmamış' }, 500)
  const url = new URL(request.url)

  // --- VPS tetikleyici ---
  if (url.searchParams.get('calistir') === '1') {
    if (!env?.MUBIS_SUNUCU_ANAHTARI || request.headers.get('x-mubis-key') !== env.MUBIS_SUNUCU_ANAHTARI) {
      return json({ ok: false, error: 'yetkisiz' }, 401)
    }
    return calistir(env, supabase)
  }

  // --- Admin plan kaydet ---
  const prof = await jwtProfili(supabase, request)
  if (!adminMi(prof)) return json({ ok: false, error: 'yetkisiz' }, 401)
  let govde = {}
  try { govde = await request.json() } catch { return json({ ok: false, error: 'geçersiz gövde' }, 400) }

  const gunler = Array.isArray(govde.gunler)
    ? [...new Set(govde.gunler.map(Number).filter(n => n >= 1 && n <= 31))].sort((a, b) => a - b)
    : []
  const saat = /^\d{1,2}:\d{2}$/.test(String(govde.saat || '')) ? String(govde.saat) : null
  const kanal = ['email', 'ikisi', 'tercih'].includes(govde.kanal) ? govde.kanal : 'whatsapp'
  const muhasebeDahil = govde.muhasebeDahil === true
  if (!gunler.length || !saat) return json({ ok: false, error: 'gün ve saat gerekli' }, 400)

  const planStr = JSON.stringify({ aktif: govde.aktif !== false, gunler, saat, kanal, muhasebeDahil, son_anahtar: '' })
  const officeId = prof.office_id || null
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: PLAN_KEY, value: planStr, office_id: officeId }, { onConflict: 'office_id,key' })
  if (error) {
    // ofis filtresi yoksa düz upsert
    const { error: e2 } = await supabase.from('app_settings').upsert({ key: PLAN_KEY, value: planStr, office_id: 1 }, { onConflict: 'office_id,key' })
    if (e2) return json({ ok: false, error: e2.message }, 500)
  }
  return json({ ok: true, plan: planOku(planStr) })
}

async function calistir(env, supabase) {
  const zaman = trZaman()
  const ayarlar = await ayarlariYukle(supabase)
  const plan = planOku(ayarlar[PLAN_KEY])

  if (!plan.aktif) return json({ ok: true, atlandi: 'plan-pasif' })
  if (!plan.gunler.includes(zaman.gun)) return json({ ok: true, atlandi: 'gun-degil', gun: zaman.gun })
  if (plan.saat > zaman.saat) return json({ ok: true, atlandi: 'saat-gelmedi', plan: plan.saat, simdi: zaman.saat })
  if (plan.son_anahtar === zaman.anahtar) return json({ ok: true, atlandi: 'bugun-gonderildi' })

  // Aynı gün ikinci kez göndermeyi engellemek için ÖNCE işaretle
  const yeniPlan = JSON.stringify({ ...plan, son_anahtar: zaman.anahtar })
  await supabase.from('app_settings').upsert({ key: PLAN_KEY, value: yeniPlan, office_id: null }, { onConflict: 'office_id,key' })

  // Müşteriler + güncel borç sonuçları
  const [{ data: musteriler }, { data: borclar }] = await Promise.all([
    supabase.from('clients').select('id, name, company, phone, email, phonenumbers, emails, beyan_durumlari, beyanDurumlari, close_date'),
    supabase.from('borc_sonuclari').select('client_id, tip, toplam, detay, mesaj, sorgu_ts')
  ])

  const aktifler = (musteriler || []).filter(m => !m.close_date)
  const borcMap = new Map()
  for (const b of (borclar || [])) {
    const k = String(b.client_id)
    if (!borcMap.has(k)) borcMap.set(k, {})
    const g = borcMap.get(k)
    // Aynı tip için en yeni kaydı tut
    if (!g[b.tip] || new Date(b.sorgu_ts) > new Date(g[b.tip].sorgu_ts)) g[b.tip] = b
  }

  // E-posta için SMTP (tercih modunda müşteri bazında e-posta gerekebilir)
  let transporter = null
  if (plan.kanal === 'email' || plan.kanal === 'ikisi' || plan.kanal === 'tercih') {
    const host = ayarlar.smtp_host
    const user = ayarlar.smtp_user
    const pass = ayarlar.smtp_pass
    if (host && user && pass) {
      const port = parseInt(ayarlar.smtp_port || '587', 10)
      transporter = nodemailer.createTransport({
        host, port,
        secure: String(ayarlar.smtp_secure) === 'true' || port === 465,
        auth: { user, pass }
      })
    }
  }

  // Muhasebe (mesleki) borçlar — plan seçeneğinde işaretliyse
  const muhasebeMap = plan.muhasebeDahil
    ? await muhasebeBorclari(supabase, aktifler.map(m => m.id))
    : new Map()

  const sonuclar = []
  const hatalar = []

  for (const m of aktifler) {
    const g = borcMap.get(String(m.id))
    const sgk = g?.sgk || null
    const vergi = g?.vergi || null
    const muhasebe = muhasebeMap.get(String(m.id)) || null
    const toplam = sayi(sgk?.toplam) + sayi(vergi?.toplam) + sayi(muhasebe?.kalanBorc)
    if (!(toplam > 0)) continue

    const ad = m.company || m.name || ''
    const mesaj = mesajUret(ad || 'Değerli Müşterimiz', zaman.tarih, sgk, vergi, muhasebe)

    // 2.8.320: "Tercih" -> müşterinin Tahakkuk Gönderim Şekli neyse ona göre.
    let hedefKanal = plan.kanal
    if (hedefKanal === 'tercih') {
      let bd = m.beyan_durumlari || m.beyanDurumlari || {}
      if (typeof bd === 'string') { try { bd = JSON.parse(bd) } catch { bd = {} } }
      const tercih = bd?.tahakkukGonderim || 'whatsapp'
      if (tercih === 'yok') continue
      hedefKanal = tercih === 'mail' ? 'email' : tercih === 'ikisi' ? 'ikisi' : 'whatsapp'
    }

    try {
      const yapilan = []
      const eksikler = []

      if (hedefKanal === 'whatsapp' || hedefKanal === 'ikisi') {
        const telefonlar = []
        if (m.phone) telefonlar.push(m.phone)
        if (Array.isArray(m.phonenumbers)) {
          m.phonenumbers.forEach(pn => {
            const tel = typeof pn === 'string' ? pn : pn?.phone
            if (tel && !telefonlar.includes(tel)) telefonlar.push(tel)
          })
        }

        if (!telefonlar.length) {
          if (hedefKanal === 'whatsapp') throw new Error('telefon yok')
          eksikler.push('telefon yok')
        } else {
          const hedef = String(env?.YARDIMCI_URL || '').replace(/\/+$/, '')
          const anahtar = String(env?.MUBIS_SUNUCU_ANAHTARI || '')
          if (!hedef || !anahtar) throw new Error('VPS yardımcı adresi yapılandırılmamış')

          for (const tel of telefonlar) {
            const r = await fetch(`${hedef}/is`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-mubis-key': anahtar },
              body: JSON.stringify({ is: 'whatsapp-web-gonder', telefon: normalizePhone(tel), mesaj })
            })
            const j = await r.json().catch(() => ({}))
            if (!j?.success || (j?.ok === false)) {
              throw new Error(j?.error || j?.not || `WhatsApp hata (${r.status})`)
            }
          }
          yapilan.push('WhatsApp')
        }
      }

      if (hedefKanal === 'email' || hedefKanal === 'ikisi') {
        const adresler = []
        if (m.email) adresler.push(m.email)
        if (Array.isArray(m.emails)) {
          m.emails.forEach(e => {
            const a = typeof e === 'string' ? e : e?.email
            if (a && !adresler.includes(a)) adresler.push(a)
          })
        }

        if (!adresler.length) {
          if (hedefKanal === 'email') throw new Error('e-posta yok')
          eksikler.push('e-posta yok')
        } else {
          if (!transporter) throw new Error('SMTP ayarları eksik')
          const html = mesajHtmlUret(ad || 'Değerli Müşterimiz', zaman.tarih, sgk, vergi, muhasebe)
          for (const to of adresler) {
            await transporter.sendMail({
              from: ayarlar.smtp_from || ayarlar.smtp_user,
              to,
              subject: `${zaman.tarih} Tarihli Borç Bilgilendirmesi - MUBiS`,
              text: mesaj,
              html
            })
          }
          yapilan.push('e-posta')
        }
      }

      if (!yapilan.length) throw new Error(eksikler.join(', ') || 'gönderim yapılamadı')
      sonuclar.push({ musteri: ad, toplam, kanal: yapilan.join('+') })
    } catch (e) {
      hatalar.push(`${ad}: ${e?.message || e}`)
    }
  }

  // Günlük özet bildirimi (admin)
  try {
    await supabase.from('notifications').insert({
      audience: 'admin',
      type: 'borc_bildirim_otomatik',
      title: 'Otomatik borç bildirimi',
      message: `${zaman.tarih} ${zaman.saat}: ${sonuclar.length} müşteriye ${plan.kanal === 'ikisi' ? 'WhatsApp + e-posta' : plan.kanal === 'email' ? 'e-posta' : plan.kanal === 'tercih' ? 'müşteri tercihine göre' : 'WhatsApp'} gönderildi` +
        (plan.muhasebeDahil ? ' (muhasebe borcu dahil)' : '') +
        (hatalar.length ? `, ${hatalar.length} hata.` : '.'),
      route: '/admin/musteri-borc-dokumu'
    })
  } catch { /* yoksay */ }

  return json({
    ok: true,
    tarih: zaman.anahtar,
    saat: zaman.saat,
    kanal: plan.kanal,
    gonderilen: sonuclar.length,
    hatalar: hatalar.slice(0, 10)
  })
}
