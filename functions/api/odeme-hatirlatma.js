// MUBIS - Odeme hatirlatma (Cloudflare Pages Function)
// GET/POST /api/odeme-hatirlatma  (gunluk cron tetikler)
// Son odeme tarihi yaklasan ve odenmemis tahakkuklari olan musterilere
// WhatsApp API (kanal 'api' ise) + e-posta gonderir. Her donem icin bir
// kez gonderir (beyan_durumlari'daki _hatirlatma_gonderildi bayragi ile).
// Ayar: app_settings.odeme_hatirlatma_gun (kac gun once, varsayilan 5)
import nodemailer from 'nodemailer'
import { json, supabaseAdmin, normalizePhone } from './_lib.js'

const BEYAN_ETIKETLERI = {
  kdv: 'KDV Beyannamesi', kdv2: 'KDV-2 Beyannamesi', muhtasar: 'Muhtasar Beyannamesi',
  muhtasar_3aylik: 'Muhtasar (3 Aylık)', gecici_vergi: 'Geçici Vergi',
  kurumlar_vergi: 'Kurumlar Vergisi', gelir_vergi: 'Gelir Vergisi',
  esmm: 'ESMM', sgk: 'SGK', edefter: 'e-Defter'
}
const ODEME_AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

function ohTrTarih(iso) {
  const d = new Date(iso)
  if (isNaN(d)) return iso
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

export async function onRequestGet({ env }) { return calistir(env) }
export async function onRequestPost({ env }) { return calistir(env) }

async function calistir(env) {
  const supabase = supabaseAdmin(env)
  if (!supabase) return json({ error: 'Supabase credentials missing' }, 500)

  try {
    const { data: settingsRows } = await supabase.from('app_settings').select('key, value')
      .in('key', ['odeme_hatirlatma_gun', 'whatsapp_channel', 'whatsapp_phone_number_id', 'whatsapp_access_token',
        'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'smtp_secure'])
    const settings = {}
    ;(settingsRows || []).forEach(r => {
      if (r.value === null || r.value === undefined || r.value === '') return
      settings[r.key] = r.value
    })

    // `parseInt(...) || 5` yazmayın — 0 (sadece bugün) ayarı falsy olduğundan
    // sessizce 5'e döner (beyan-hatirlatma'da bu bug gerçek gönderim yaptırdı).
    const gunHam = parseInt(settings.odeme_hatirlatma_gun ?? '5')
    const hatirlatmaGun = Number.isFinite(gunHam) ? Math.max(0, gunHam) : 5
    const waChannel = settings.whatsapp_channel === 'web' ? 'web' : 'api'

    const { data: clients, error: cErr } = await supabase
      .from('clients')
      .select('id, name, email, phone, beyan_durumlari, whatsapp_opt_out')
    if (cErr) throw cErr

    const bugun = new Date(); bugun.setHours(0, 0, 0, 0)
    const gonderimler = []
    const hatalar = []

    let transporter = null
    const smtpHazir = settings.smtp_host && settings.smtp_user && settings.smtp_pass
    if (smtpHazir) {
      const port = parseInt(settings.smtp_port || '587')
      transporter = nodemailer.createTransport({
        host: settings.smtp_host,
        port,
        secure: settings.smtp_secure === 'true' || port === 465,
        auth: { user: settings.smtp_user, pass: settings.smtp_pass }
      })
    }

    for (const c of (clients || [])) {
      const dm = c.beyan_durumlari || {}
      const anahtarlar = Object.keys(dm).filter(k => k.endsWith('_son_odeme'))

      for (const anahtar of anahtarlar) {
        const base = anahtar.replace(/_son_odeme$/, '')
        if (dm[`${base}_odendi`] === true) continue
        if (dm[`${base}_hatirlatma_gonderildi`] === true) continue

        const sonOdeme = new Date(dm[anahtar])
        if (isNaN(sonOdeme)) continue
        sonOdeme.setHours(0, 0, 0, 0)
        const kalanGun = Math.round((sonOdeme - bugun) / 86400000)
        if (kalanGun < 0 || kalanGun > hatirlatmaGun) continue

        const m = base.match(/^(\d{4})_(\d{1,2})_(.+)$/)
        if (!m) continue
        const yil = m[1]
        const ay = parseInt(m[2])
        const tip = m[3]
        const etiket = BEYAN_ETIKETLERI[tip] || tip
        const tutar = Number(dm[`${base}_tutar`]) || 0

        const mesaj = [
          `Sayın ${c.name || ''},`,
          `${yil} yılı ${ODEME_AY_ADLARI[ay]} dönemi ${etiket} tahakkukunuzun son ödeme tarihi ${ohTrTarih(sonOdeme)} (${kalanGun === 0 ? 'BUGÜN' : `${kalanGun} gün kaldı`}).`,
          tutar > 0 ? `Tahakkuk tutarı: ${tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL.` : '',
          tip === 'sgk'
            ? `SGK prim ödemenizi e-Devlet üzerinden kredi kartıyla yapabilirsiniz: https://www.turkiye.gov.tr/sosyal-guvenlik-sosyal-guvenlik-kurumu-kart-ile-prim-odeme-uygulamasi (e-Devlet şifrenizle giriş yapılır).`
            : `Ödemenizi https://www.mubiserp.com üzerinden veya vergi dairesine yapabilirsiniz.`,
          `Saygılarımızla, MUBiS ERP`
        ].filter(Boolean).join('\n')

        // 1) WhatsApp (yalniz API kanalinda + musteri opt-out secmemisse)
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
                client_id: c.id, beyan_type: tip, year: parseInt(yil), month: ay + 1,
                document_type: 'odeme_hatirlatma', phone: to, email: '', channel: 'whatsapp',
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
              subject: `Ödeme Hatırlatması - ${etiket} (${ODEME_AY_ADLARI[ay]} ${yil})`,
              text: mesaj,
              html: `<p>${mesaj.replace(/\n/g, '<br/>')}</p>`
            })
            mailSonuc = 'gonderildi'
            await supabase.from('whatsapp_logs').insert({
              client_id: c.id, beyan_type: tip, year: parseInt(yil), month: ay + 1,
              document_type: 'odeme_hatirlatma', phone: '', email: c.email, channel: 'email',
              message_id: '', status: 'sent', sent_at: new Date().toISOString()
            })
          } catch (e) {
            mailSonuc = 'hata'
            hatalar.push(`${c.name}/mail: ${e.message}`)
          }
        }

        // 3) Uygulama ici bildirim (musteri)
        await supabase.from('notifications').insert({
          client_id: c.id,
          audience: 'client',
          type: 'odeme_hatirlatma',
          title: 'Ödeme Hatırlatması',
          message: mesaj,
          route: '/portal',
          metadata: { donem: `${yil}_${ay + 1}`, beyan: tip, son_odeme: dm[anahtar], tutar }
        })

        // 4) Bayrak: bir daha gonderme
        dm[`${base}_hatirlatma_gonderildi`] = true
        await supabase.from('clients').update({ beyan_durumlari: dm }).eq('id', c.id)

        gonderimler.push({ musteri: c.name, donem: `${ODEME_AY_ADLARI[ay]} ${yil}`, beyan: tip, kalanGun, whatsapp: waSonuc, mail: mailSonuc })
      }
    }

    return json({ success: true, gonderimSayisi: gonderimler.length, gonderimler, hatalar })
  } catch (err) {
    return json({ success: false, error: err.message }, 500)
  }
}
