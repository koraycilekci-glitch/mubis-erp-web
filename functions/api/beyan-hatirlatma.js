// MUBIS - Beyan teslim hatirlatma (Cloudflare Pages Function)
// GET/POST /api/beyan-hatirlatma  (gunluk cron tetikler)
//
// Bu ay verilmeyecek ama son gunu yaklasan beyanlari bulup musterilere
// WhatsApp (API kanali) + portal bildirimi + e-posta gonderir.
// Her beyan icin bir kez gonderir (beyan_durumlari'daki
// <key>_beyan_hatirlatma_gonderildi bayragi ile).
//
// Ayarlar (app_settings):
//   beyan_hatirlatma_gun  - son gunden kac gun once (varsayilan 3)
//   beyan_hatirlatma_aktif - 'false' ise bos doner (varsayilan acik)
//
// Son gun hesaplamasi src/utils/dateUtils.js + AylikBeyanTakip
// generateMonthlyBeyanlar ile birebir uyumlu (tatil/hafta sonu erteleme dahil).
import nodemailer from 'nodemailer'
import { json, supabaseAdmin, normalizePhone } from './_lib.js'

const BEYAN_ETIKETLERI = {
  kdv: 'KDV Beyannamesi', kdv2: 'KDV-2 Beyannamesi', muhtasar: 'Muhtasar Beyannamesi',
  muhtasar_3aylik: 'Muhtasar (3 Aylık) Beyannamesi', sgk: 'SGK Bildirgesi',
  gecici_vergi: 'Geçici Vergi Beyannamesi', poset: 'Poşet Beyannamesi',
  edefter: 'e-Defter Beratı', gelir_vergi: 'Gelir Vergisi Beyannamesi',
  kurumlar_vergi: 'Kurumlar Vergisi Beyannamesi', damga: 'Damga Vergisi Beyannamesi'
}
const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

// ---- Tatil / is gunu yardimcilari (src/utils/dateUtils.js kopyasi) ----
const RESMI_TATILLER = {
  '2025-01-01': 1, '2025-03-30': 1, '2025-03-31': 1, '2025-04-01': 1, '2025-04-23': 1,
  '2025-05-01': 1, '2025-05-19': 1, '2025-06-06': 1, '2025-06-07': 1, '2025-06-08': 1, '2025-06-09': 1,
  '2025-07-15': 1, '2025-08-30': 1, '2025-10-29': 1,
  '2026-01-01': 1, '2026-03-20': 1, '2026-03-21': 1, '2026-03-22': 1, '2026-04-23': 1,
  '2026-05-01': 1, '2026-05-19': 1, '2026-05-27': 1, '2026-05-28': 1, '2026-05-29': 1, '2026-05-30': 1,
  '2026-07-15': 1, '2026-08-30': 1, '2026-10-29': 1,
  '2027-01-01': 1, '2027-03-10': 1, '2027-03-11': 1, '2027-03-12': 1, '2027-04-23': 1,
  '2027-05-01': 1, '2027-05-16': 1, '2027-05-17': 1, '2027-05-18': 1, '2027-05-19': 1,
  '2027-07-15': 1, '2027-08-30': 1, '2027-10-29': 1
}
const vergiHaftaSonu = (d) => d.getDay() === 0 || d.getDay() === 6
const tatil = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), g = String(d.getDate()).padStart(2, '0')
  return RESMI_TATILLER[`${y}-${m}-${g}`] !== undefined
}
// Beyan son gunu: cumartesi/pazar/tatile denk gelirse takip eden ilk is gunu
const beyanSonGunu = (y, m, gun) => {
  const d = new Date(y, m, gun)
  while (vergiHaftaSonu(d) || tatil(d)) d.setDate(d.getDate() + 1)
  return d
}
// SGK odeme gunu: ayin son gunu; tatile denk gelirse takip eden ilk is gunu
const sgkOdemeGunu = (y, m) => {
  const d = new Date(y, m + 1, 0)
  while (vergiHaftaSonu(d) || tatil(d)) d.setDate(d.getDate() + 1)
  return d
}
const isoGun = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const trTarih = (d) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`

// Beyan profili: { tur: { [belongM0]: { active, period } } } — AylikBeyanTakip checkProfile ile ayni
function profilAcik(profile, tur, belongM) {
  const p = profile?.[tur]?.[belongM]
  if (!p) return { active: true, period: 'aylik' }
  return { active: p.active !== false && p.period !== 'yok', period: p.period || 'aylik' }
}

const TAMAMLANMIS = ['yapildi', 'onaylandi', 'gonderildi', 'tahakkuk_gonderildi']

// Filing (verilme) ayina gore bu ayin beyanlarini uretir.
// AylikBeyanTakip generateMonthlyBeyanlar ile ayni kurallar:
// F = bu ay (verilme ayi), ait ay = F-1.
function buAyinBeyanlari(client, Y, F) {
  const items = []
  const profile = client.beyan_profile || {}
  const dm = client.beyan_durumlari || {}
  const M = (F + 11) % 12                 // ait ay (0-tabanli)
  const MY = F === 0 ? Y - 1 : Y          // ait yil
  const sahis = client.type === 'individual'
  const edefterRaw = client.edefer ?? client.edefter
  const edefterBayrak = edefterRaw === true || edefterRaw === 1 ||
    (typeof edefterRaw === 'string' && edefterRaw.trim().toLowerCase() === 'true')
  const edefterPeriod = String(client.edefter_period ?? profile.edefter?.[0]?.period ?? 'aylik')
    .toLowerCase().replace(/[\s_-]/g, '')
  const uc3Aylik = edefterPeriod === '3aylik' || edefterPeriod === 'ucaylik' || edefterPeriod === '3ay'

  const push = (tur, label, belongM, belongY, deadline, ekstra = {}) => {
    const key = `${belongY}_${belongM}_${tur}`
    if (TAMAMLANMIS.includes(dm[key])) return
    if (dm[`${key}_beyan_hatirlatma_gonderildi`] === true) return
    items.push({ tur, label, key, deadline, ...ekstra })
  }

  // ---- AYLIK BEYANLAR (ait ay = M) ----
  if (profilAcik(profile, 'kdv', M).active) push('kdv', BEYAN_ETIKETLERI.kdv, M, MY, beyanSonGunu(Y, F, 28))
  if (profilAcik(profile, 'kdv2', M).active) push('kdv2', BEYAN_ETIKETLERI.kdv2, M, MY, beyanSonGunu(Y, F, 25))
  const posetMd = profile.poset?.[M]
  if (posetMd && posetMd.active !== false && posetMd.period !== 'yok') {
    push('poset', BEYAN_ETIKETLERI.poset, M, MY, beyanSonGunu(Y, F, 25))
  }
  if (profilAcik(profile, 'sgk', M).active) {
    push('sgk', BEYAN_ETIKETLERI.sgk, M, MY, beyanSonGunu(Y, F, 26), { odeme: sgkOdemeGunu(Y, F) })
  }
  const muhtCheck = profilAcik(profile, 'muhtasar', M)
  if (muhtCheck.active && muhtCheck.period === 'aylik') {
    push('muhtasar', BEYAN_ETIKETLERI.muhtasar, M, MY, beyanSonGunu(Y, F, 26))
  }

  // ---- MUHTASAR (3 AYLIK): filing aylari Ocak/Nisan/Temmuz/Ekim ----
  if ([0, 3, 6, 9].includes(F)) {
    const qStart = M - 2
    const qMonths = [qStart, qStart + 1, qStart + 2]
    const has3Aylik = qMonths.some(m => {
      const mc = profilAcik(profile, 'muhtasar', m)
      return mc.active && mc.period === '3aylik'
    })
    if (has3Aylik) push('muhtasar_3aylik', BEYAN_ETIKETLERI.muhtasar_3aylik, qStart, MY, beyanSonGunu(Y, F, 26))
  }

  // ---- GECICI VERGI: filing aylari Subat/Mayis/Agustos/Kasim ----
  const geciciDonemler = {
    1: { donem: 4, qMonths: [9, 10, 11], yAdj: -1 },
    4: { donem: 1, qMonths: [0, 1, 2], yAdj: 0 },
    7: { donem: 2, qMonths: [3, 4, 5], yAdj: 0 },
    10: { donem: 3, qMonths: [6, 7, 8], yAdj: 0 }
  }
  if (geciciDonemler[F]) {
    const gd = geciciDonemler[F]
    if (profilAcik(profile, 'gecici_vergi', gd.qMonths[2]).active) {
      push('gecici_vergi', `Geçici Vergi ${gd.donem}. Dönem Beyannamesi`, gd.qMonths[0], Y + gd.yAdj, beyanSonGunu(Y, F, 17))
    }
  }

  // ---- E-DEFTER ----
  const edAktif = edefterBayrak && profilAcik(profile, 'edefter', M).active
  if (edAktif) {
    const edGun = sahis ? 10 : 14
    if (!uc3Aylik) {
      // Aylik: ait ay = F - 3
      const edBelongM = (F + 8) % 12
      const edBelongY = F <= 3 ? Y - 1 : Y
      push('edefter', `e-Defter (Aylık) Beratı`, edBelongM, edBelongY, beyanSonGunu(Y, F, edGun))
    } else {
      // 3 aylik GIB takvimi (AylikBeyanTakip ucAylikTakvim ile ayni)
      const ucAylikTakvim = {
        5: { qMonths: [0, 1, 2], yAdj: 0, gun: edGun, donem: '1. Dönem' },
        8: { qMonths: [3, 4, 5], yAdj: 0, gun: edGun, donem: '2. Dönem' },
        11: { qMonths: [6, 7, 8], yAdj: 0, gun: edGun, donem: '3. Dönem' },
        3: { qMonths: [9, 10, 11], yAdj: -1, gun: 10, donem: '4. Dönem', sadeceSahis: true },
        4: { qMonths: [9, 10, 11], yAdj: -1, gun: 14, donem: '4. Dönem', sadeceSirket: true }
      }
      const cfg = ucAylikTakvim[F]
      const uygun = cfg && !(cfg.sadeceSahis && !sahis) && !(cfg.sadeceSirket && sahis)
      if (uygun) push('edefter', `e-Defter (3 Aylık ${cfg.donem}) Beratı`, cfg.qMonths[0], Y + cfg.yAdj, beyanSonGunu(Y, F, cfg.gun))
    }
  }

  // ---- YILLIK BEYANLAR: Gelir Mart, Kurumlar Nisan ----
  if (F === 2 && sahis && profilAcik(profile, 'gelir_vergi', 0).active) {
    push('gelir_vergi', BEYAN_ETIKETLERI.gelir_vergi, 0, Y - 1, beyanSonGunu(Y, 2, 31))
  }
  if (F === 3 && !sahis && profilAcik(profile, 'kurumlar_vergi', 0).active) {
    push('kurumlar_vergi', BEYAN_ETIKETLERI.kurumlar_vergi, 0, Y - 1, beyanSonGunu(Y, 3, 30))
  }

  return items
}

// Test yardimcisi (saf fonksiyonlar — yan etkisiz):
export const _test = { buAyinBeyanlari, beyanSonGunu, sgkOdemeGunu, profilAcik }

export async function onRequestGet({ env }) { return calistir(env) }
export async function onRequestPost({ env }) { return calistir(env) }

async function calistir(env) {
  const supabase = supabaseAdmin(env)
  if (!supabase) return json({ error: 'Supabase credentials missing' }, 500)

  try {
    const { data: settingsRows } = await supabase.from('app_settings').select('key, value')
      .in('key', ['beyan_hatirlatma_gun', 'beyan_hatirlatma_aktif', 'whatsapp_channel',
        'whatsapp_phone_number_id', 'whatsapp_access_token',
        'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'smtp_secure'])
    const settings = {}
    ;(settingsRows || []).forEach(r => {
      if (r.value === null || r.value === undefined || r.value === '') return
      settings[r.key] = r.value
    })

    if (settings.beyan_hatirlatma_aktif === 'false') return json({ success: true, gonderimSayisi: 0, not: 'beyan_hatirlatma_aktif=false' })
    // DİKKAT: `parseInt(...) || 3` yazmayın — 0 (sadece bugün) ayarı falsy
    // olduğu için sessizce 3'e döner (ilk testte bu bug gerçek gönderim yaptırdı).
    const gunHam = parseInt(settings.beyan_hatirlatma_gun ?? '3')
    const hatirlatmaGun = Number.isFinite(gunHam) ? Math.max(0, gunHam) : 3
    const waChannel = settings.whatsapp_channel === 'web' ? 'web' : 'api'

    const { data: clients, error: cErr } = await supabase
      .from('clients')
      .select('id, name, email, phone, type, edefter, edefter_period, beyan_profile, beyan_durumlari, whatsapp_opt_out')
    if (cErr) throw cErr

    const bugun = new Date(); bugun.setHours(0, 0, 0, 0)
    const Y = bugun.getFullYear(), F = bugun.getMonth()
    const gonderimler = []
    const hatalar = []

    let transporter = null
    const smtpHazir = settings.smtp_host && settings.smtp_user && settings.smtp_pass
    if (smtpHazir) {
      const port = parseInt(settings.smtp_port || '587')
      transporter = nodemailer.createTransport({
        host: settings.smtp_host, port,
        secure: settings.smtp_secure === 'true' || port === 465,
        auth: { user: settings.smtp_user, pass: settings.smtp_pass }
      })
    }

    for (const c of (clients || [])) {
      // Beyan durumlari JSONB icindeki tarihli anahtarlar her guncellemeyi icerir;
      // stale kayit olmasin diye her musteri icin guncel veriyi kullaniyoruz.
      const beyanlar = buAyinBeyanlari(c, Y, F)
      if (!beyanlar.length) continue

      for (const b of beyanlar) {
        const kalanGun = Math.round((b.deadline - bugun) / 86400000)
        if (kalanGun < 0 || kalanGun > hatirlatmaGun) continue

        const aitAy = `${AY_ADLARI[(b.key.split('_')[1] * 1)]} ${b.key.split('_')[0]}`
        const mesaj = [
          `Sayın ${c.name || ''},`,
          `${aitAy} dönemi ${b.label} için son gün ${trTarih(b.deadline)} (${kalanGun === 0 ? 'BUGÜN' : `${kalanGun} gün kaldı`}).`,
          b.odeme ? `Prim ödemesi son günü: ${trTarih(b.odeme)} (e-Devlet üzerinden ödenebilir).` : '',
          `Beyan durumunu https://www.mubiserp.com/portal üzerinden takip edebilirsiniz.`,
          `Saygılarımızla, MUBiS ERP`
        ].filter(Boolean).join('\n')

        // 1) WhatsApp (yalniz API kanalinda + opt-out degilse)
        let waSonuc = 'atlandi'
        if (waChannel === 'api' && settings.whatsapp_phone_number_id && settings.whatsapp_access_token && !c.whatsapp_opt_out) {
          const to = normalizePhone(c.phone)
          if (to.length >= 12) {
            try {
              const body = { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body: mesaj } }
              const r = await fetch(`https://graph.facebook.com/v18.0/${settings.whatsapp_phone_number_id}/messages`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${settings.whatsapp_access_token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
              })
              waSonuc = r.ok ? 'gonderildi' : 'hata'
              await supabase.from('whatsapp_logs').insert({
                client_id: c.id, beyan_type: b.tur, year: Y, month: F + 1,
                document_type: 'beyan_hatirlatma', phone: to, email: '', channel: 'whatsapp',
                message_id: '', status: r.ok ? 'sent' : 'failed', sent_at: new Date().toISOString()
              })
            } catch (e) {
              waSonuc = 'hata'
              hatalar.push(`${c.name}/wa: ${e.message}`)
            }
          }
        }

        // 2) E-posta
        let mailSonuc = 'atlandi'
        if (transporter && c.email) {
          try {
            await transporter.sendMail({
              from: settings.smtp_from || settings.smtp_user,
              to: c.email,
              subject: `Beyan Hatırlatması - ${b.label} (son gün ${trTarih(b.deadline)})`,
              text: mesaj,
              html: `<p>${mesaj.replace(/\n/g, '<br/>')}</p>`
            })
            mailSonuc = 'gonderildi'
            await supabase.from('whatsapp_logs').insert({
              client_id: c.id, beyan_type: b.tur, year: Y, month: F + 1,
              document_type: 'beyan_hatirlatma', phone: '', email: c.email, channel: 'email',
              message_id: '', status: 'sent', sent_at: new Date().toISOString()
            })
          } catch (e) {
            mailSonuc = 'hata'
            hatalar.push(`${c.name}/mail: ${e.message}`)
          }
        }

        // 3) Portal bildirimi
        await supabase.from('notifications').insert({
          client_id: c.id,
          audience: 'client',
          type: 'beyan_hatirlatma',
          title: 'Beyan Hatırlatması',
          message: mesaj,
          route: '/portal',
          metadata: { beyan: b.tur, key: b.key, son_gun: isoGun(b.deadline), kalan_gun: kalanGun }
        })

        // 4) Bayrak: bir daha gonderme
        const yeniDurumlar = { ...(c.beyan_durumlari || {}) }
        yeniDurumlar[`${b.key}_beyan_hatirlatma_gonderildi`] = true
        await supabase.from('clients').update({ beyan_durumlari: yeniDurumlar }).eq('id', c.id)

        gonderimler.push({ musteri: c.name, beyan: b.label, sonGun: isoGun(b.deadline), kalanGun, whatsapp: waSonuc, mail: mailSonuc })
      }
    }

    return json({ success: true, gonderimSayisi: gonderimler.length, gonderimler, hatalar })
  } catch (err) {
    return json({ success: false, error: err.message }, 500)
  }
}
