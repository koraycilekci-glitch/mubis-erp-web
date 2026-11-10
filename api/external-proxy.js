import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

// Dis kaynaklardan veri ceken proxy toplama endpointi.
// Vercel Hobby plan 12 fonksiyon siniri nedeniyle tuik-kira ve guncel-parametreler
// tek bir sunucu fonksiyonu altinda birlestirildi.
// Eski URL'ler (/api/tuik-kira, /api/guncel-parametreler) vercel.json rewrite ile buraya yonlendirilir.

// ---------- TUIK Kira Artis Orani ----------
const TUIK_KAYNAK_URL = 'https://kira-artis-orani.hesaplama.net/'

const TUIK_AYLAR = {
  'ocak': 1, 'subat': 2, 'mart': 3, 'nisan': 4, 'mayis': 5, 'haziran': 6,
  'temmuz': 7, 'agustos': 8, 'eylul': 9, 'ekim': 10, 'kasim': 11, 'aralik': 12
}

function tuikNormalizeTr(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .trim()
}

function tuikParseRate(s) {
  const m = String(s).replace('%', '').trim().match(/(\d{1,3})[.,](\d{1,2})/)
  if (!m) return null
  return Number(`${m[1]}.${m[2]}`)
}

async function tuikKiraHandler(req, res) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const resp = await fetch(TUIK_KAYNAK_URL, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MubisERP/1.0)' }
    })
    clearTimeout(timeout)
    if (!resp.ok) throw new Error(`Kaynak erisim hatasi: ${resp.status}`)
    const html = await resp.text()

    const cells = [...html.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map(m => m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim())

    const oranlar = {}
    for (let i = 0; i < cells.length - 1; i++) {
      const dateMatch = tuikNormalizeTr(cells[i]).match(/^(ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)\s+(\d{4})$/)
      if (!dateMatch) continue
      const oran = tuikParseRate(cells[i + 1])
      if (oran == null || oran <= 0 || oran > 200) continue
      const yil = Number(dateMatch[2])
      const ay = TUIK_AYLAR[dateMatch[1]]
      const key = `${yil}-${String(ay).padStart(2, '0')}`
      if (!oranlar[key]) oranlar[key] = oran
    }

    const keys = Object.keys(oranlar).sort()
    if (keys.length === 0) throw new Error('Kaynak sayfada oran tablosu bulunamadi')

    const sonKey = keys[keys.length - 1]
    const [sonYil, sonAy] = sonKey.split('-').map(Number)

    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400')
    return res.status(200).json({
      success: true,
      guncel: { yil: sonYil, ay: sonAy, oran: oranlar[sonKey] },
      oranlar,
      kaynak: 'TUIK 12 aylik TUFE ortalamasi (cevrimici)',
      alinma: new Date().toISOString()
    })
  } catch (err) {
    return res.status(200).json({ success: false, error: err.message })
  }
}

// ---------- Guncel Yasal Parametreler ----------
const KIDEM_TAVANI_KAYNAKLARI = [
  'https://www.verginet.net/dtt/1/kidem-tazminati-tavani.aspx',
  'https://www.muhasebetr.com/kidem-tazminati-tavani/'
]

const ASGARI_UCRET_KAYNAKLARI = [
  'https://www.muhasebetr.com/asgari-ucret/'
]

function gpTrNumber(value) {
  const n = Number(String(value || '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

function gpDecodeEntities(html) {
  return String(html || '')
    .replace(/&uuml;|&#252;|&#xFC;/gi, 'ü')
    .replace(/&Uuml;|&#220;|&#xDC;/gi, 'Ü')
    .replace(/&ouml;|&#246;|&#xF6;/gi, 'ö')
    .replace(/&Ouml;|&#214;|&#xD6;/gi, 'Ö')
    .replace(/&ccedil;|&#231;|&#xE7;/gi, 'ç')
    .replace(/&Ccedil;|&#199;|&#xC7;/gi, 'Ç')
    .replace(/&gbreve;|&#287;/gi, 'ğ')
    .replace(/&Gbreve;|&#286;/gi, 'Ğ')
    .replace(/&#305;|&#x131;/gi, 'ı')
    .replace(/&#304;|&#x130;/gi, 'İ')
    .replace(/&scedil;|&#351;/gi, 'ş')
    .replace(/&Scedil;|&#350;/gi, 'Ş')
    .replace(/&nbsp;|&#160;/gi, ' ')
}

async function gpFetchText(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'Accept-Language': 'tr-TR,tr;q=0.9'
      }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timeout)
  }
}

function gpParseKidemTavani(html) {
  const text = gpDecodeEntities(html)
  const out = {}
  const re = /01\s*(?:<[^>]*>\s*)*(Ocak|Temmuz)(?:<[^>]*>\s*)*(\d{4})[\s\S]{0,250}?([\d.]+,\d{2})\s*(?:<[^>]*>\s*)*TL/gi
  let match
  while ((match = re.exec(text)) !== null) {
    const donem = /ocak/i.test(match[1]) ? 1 : 2
    const tutar = gpTrNumber(match[3])
    if (tutar) out[`${match[2]}-${donem}`] = tutar
  }
  return out
}

function gpParseAsgariUcret(html) {
  const text = gpDecodeEntities(html)
  const out = {}
  const brutRe = /Asgari\s*Ucret\s*(\d{4})\s*Brut\s*Ucret\s*\(Ayl[ıi]k\)[\s\S]{0,90}?([\d.]+,\d{2})/gi
  const netRe = /Asgari\s*Ucret\s*(\d{4})\s*Net\s*Ucret\s*\(Ayl[ıi]k\)[\s\S]{0,90}?([\d.]+,\d{2})/gi
  let match
  while ((match = brutRe.exec(text)) !== null) {
    const tutar = gpTrNumber(match[2])
    if (tutar) out[match[1]] = { ...(out[match[1]] || {}), brut: tutar }
  }
  while ((match = netRe.exec(text)) !== null) {
    const tutar = gpTrNumber(match[2])
    if (tutar) out[match[1]] = { ...(out[match[1]] || {}), net: tutar }
  }
  return out
}

async function guncelParametrelerHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400')

  const sonuc = { kidemTavani: null, asgariUcret: null, kaynaklar: [] }

  for (const url of KIDEM_TAVANI_KAYNAKLARI) {
    try {
      const html = await gpFetchText(url)
      const map = gpParseKidemTavani(html)
      if (Object.keys(map).length >= 3) {
        sonuc.kidemTavani = map
        sonuc.kaynaklar.push(url)
        break
      }
    } catch { /* sonraki kaynak denenir */ }
  }

  for (const url of ASGARI_UCRET_KAYNAKLARI) {
    try {
      const html = await gpFetchText(url)
      const map = gpParseAsgariUcret(html)
      if (Object.keys(map).length >= 1) {
        sonuc.asgariUcret = map
        sonuc.kaynaklar.push(url)
        break
      }
    } catch { /* sonraki kaynak denenir */ }
  }

  return res.status(200).json({ ...sonuc, alinmaTarihi: new Date().toISOString() })
}

// ---------- Kira Yenileme Hatirlatma ----------
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

function normalizePhone(phone) {
  if (!phone) return ''
  let cleaned = String(phone).replace(/\D/g, '')
  if (cleaned.startsWith('0')) cleaned = cleaned.slice(1)
  if (!cleaned.startsWith('90')) cleaned = '90' + cleaned
  return cleaned
}

function safeJsonParse(val) {
  if (val && typeof val === 'object') return val
  if (typeof val === 'string' && val.trim()) {
    try {
      const parsed = JSON.parse(val)
      // Cift katmanli string JSON icin (ornegin text kolonuna JSON.stringify iki kez atilmis)
      if (typeof parsed === 'string') return safeJsonParse(parsed)
      return parsed
    } catch { return null }
  }
  return null
}

function getKiraBilgisi(client) {
  return safeJsonParse(client.kira_bilgisi) || safeJsonParse(client.kiraBilgisi) || {}
}

function trDateInputToDate(str) {
  if (!str) return null
  if (str.match(/^\d{4}-\d{2}-\d{2}$/)) return new Date(str + 'T00:00:00')
  if (str.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
    const [g, a, y] = str.split('.')
    return new Date(`${y}-${a}-${g}T00:00:00`)
  }
  const d = new Date(str)
  return Number.isNaN(d.getTime()) ? null : d
}

function daysUntil(date) {
  const now = new Date()
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24))
}

async function sendWhatsAppText(phone, message, config) {
  const phoneNumberId = config?.phoneNumberId
  const accessToken = config?.accessToken
  const to = normalizePhone(phone)
  if (!to || !phoneNumberId || !accessToken) return { skipped: true }
  try {
    const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: message }
      })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.message || 'WhatsApp error')
    return { ok: true, messageId: data.messages?.[0]?.id }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

async function kiraYenilemeKontrolHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Supabase credentials missing' })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const created = []
  const errors = []

  try {
    // WhatsApp ayarlari
    const { data: settingsRows } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['whatsapp_phone_number_id', 'whatsapp_access_token'])
    const settings = {}
    ;(settingsRows || []).forEach(r => { settings[r.key] = r.value })
    const waConfig = {
      phoneNumberId: settings.whatsapp_phone_number_id,
      accessToken: settings.whatsapp_access_token
    }

    // Once ertelenen kayitlari aktiflestir
    const todayIso = new Date().toISOString().split('T')[0]
    const { data: ertelenenler } = await supabase
      .from('kira_yenileme')
      .select('id, client_id, sahip_index, bitis_tarihi, erteleme_gunu, hatirlatma_7gun, hatirlatma_1gun')
      .eq('durum', 'ertelendi')
      .lte('erteleme_tarihi', todayIso)

    for (const e of ertelenenler || []) {
      try {
        await supabase
          .from('kira_yenileme')
          .update({ durum: 'bekliyor', erteleme_tarihi: null })
          .eq('id', e.id)
        created.push({ client_id: e.client_id, sahip_index: e.sahip_index, kalan: null, renewal_id: e.id, tekrar: true })
      } catch (err) {
        errors.push({ client_id: e.client_id, error: err.message })
      }
    }

    // Kiraci olan musterileri cek (kira_bilgisi JSONB icinde kiraTipi='kiraci')
    const { data: clients, error } = await supabase
      .from('clients')
      .select('*')
      .limit(50)

    if (error) throw error

    const kiraciClients = (clients || []).filter(client => {
      const kb = getKiraBilgisi(client)
      const tip = String(kb.kiraTipi || kb.kira_tipi || kb.kiraTip || '').toLowerCase()
      return tip === 'kiraci' || tip === 'kiracı'
    })

    const sampleKiraTipi = clients?.slice(0, 3).map(c => ({
      id: c.id,
      keys: Object.keys(c).slice(0, 30),
      kiraTipi: getKiraBilgisi(c).kiraTipi
    }))

    const allKiraBilgisiRaw = clients?.map(c => ({
      id: c.id,
      has_kb: !!getKiraBilgisi(c),
      kb_type: typeof c.kira_bilgisi,
      tip: (() => {
        const kb = getKiraBilgisi(c)
        return String(kb.kiraTipi || kb.kira_tipi || kb.kiraTip || '').toLowerCase()
      })()
    }))

    for (const client of kiraciClients) {
      try {
        const kb = getKiraBilgisi(client)
        const sahipler = Array.isArray(kb.isyeriSahipleri) ? kb.isyeriSahipleri : []
        if (!sahipler.length) {
          errors.push({ client_id: client.id, error: 'isyeriSahipleri bos', debug: JSON.stringify(kb).slice(0, 200) })
          continue
        }

        for (let i = 0; i < sahipler.length; i++) {
          const sahip = sahipler[i]
          const bitis = trDateInputToDate(sahip.kiraBitis)
          if (!bitis) {
            errors.push({ client_id: client.id, sahip_index: i, error: 'kiraBitis parse edilemedi', raw: sahip.kiraBitis })
            continue
          }
          const kalan = daysUntil(bitis)
          if (kalan < 1 || kalan > 7) {
            errors.push({ client_id: client.id, sahip_index: i, debug: `kalan=${kalan}, bitis=${sahip.kiraBitis}`, status: 'atlandi' })
            continue
          }

          // Ayni musteri/sahip/bitis icin bekleyen kayit var mi?
          const { data: existing } = await supabase
            .from('kira_yenileme')
            .select('id, hatirlatma_7gun, hatirlatma_1gun')
            .eq('client_id', client.id)
            .eq('sahip_index', i)
            .eq('bitis_tarihi', bitis.toISOString().split('T')[0])
            .in('durum', ['bekliyor', 'musteri_cevaplandi'])
            .maybeSingle()

          let renewalId = existing?.id
          if (!renewalId) {
            const { data: inserted, error: insertErr } = await supabase
              .from('kira_yenileme')
              .insert({
                client_id: client.id,
                office_id: client.office_id,
                sahip_index: i,
                eski_net_kira: sahip.netKira ? Number(String(sahip.netKira).replace(/\./g, '').replace(',', '.')) : null,
                eski_brut_kira: sahip.brutKira ? Number(String(sahip.brutKira).replace(/\./g, '').replace(',', '.')) : null,
                bitis_tarihi: bitis.toISOString().split('T')[0]
              })
              .select('id')
              .single()
            if (insertErr) throw insertErr
            renewalId = inserted.id
          }

          const updatePatch = {}
          const portalUrl = process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL + '/portal' : 'https://mubiserp.com/portal'
          const mesaj = `Sayin ${client.name}, kira sozlesmeniz ${sahip.kiraBitis} tarihinde sona eriyor. Yeni net kira tutarini MUBiS portaldan bildirin veya kira artisi olmadigini belirtin. ${portalUrl}`

          if (kalan <= 7 && kalan >= 1 && !existing?.hatirlatma_7gun) {
            updatePatch.hatirlatma_7gun = new Date().toISOString()
            if (client.phone) await sendWhatsAppText(client.phone, mesaj, waConfig)
          }
          if (kalan === 1 && !existing?.hatirlatma_1gun) {
            updatePatch.hatirlatma_1gun = new Date().toISOString()
            if (client.phone) await sendWhatsAppText(client.phone, mesaj, waConfig)
          }

          if (Object.keys(updatePatch).length > 0) {
            await supabase.from('kira_yenileme').update(updatePatch).eq('id', renewalId)
          }

          // Musteriye portal bildirimi gonder (admin degil)
          if (kalan <= 7 && kalan >= 1 && !existing?.hatirlatma_7gun) {
            await supabase.from('notifications').insert({
              client_id: client.id,
              type: 'kira_yenileme',
              title: 'Kira sözleşmeniz sona eriyor',
              message: `Sayin ${client.name}, kira sözleşmeniz ${sahip.kiraBitis} tarihinde sona eriyor. Yeni net kira tutarini portaldan bildirebilir veya kira artisi olmadigini belirtebilirsiniz.`,
              audience: 'client',
              route: '/portal',
              metadata: { renewal_id: renewalId, sahip_index: i, kalan_gun: kalan }
            })
            await supabase.from('client_messages').insert({
              client_id: client.id,
              sender: 'admin',
              message: mesaj,
              is_read: true,
              action_type: 'kira_yenileme_hatirlatma',
              action_label: 'Yeni Kira Bildir',
              action_url: '/portal'
            })
          }

          if (kalan === 1 && !existing?.hatirlatma_1gun) {
            await supabase.from('notifications').insert({
              client_id: client.id,
              type: 'kira_yenileme',
              title: 'Kira artisiniza 1 gün kaldi',
              message: `Sayin ${client.name}, kira sözleşmeniz ${sahip.kiraBitis} tarihinde sona eriyor. Son gün hatirlatmasi: Yeni net kira tutarini portaldan bildirin veya kira artisi olmadigini belirtin.`,
              audience: 'client',
              route: '/portal',
              metadata: { renewal_id: renewalId, sahip_index: i, kalan_gun: kalan }
            })
          }

          created.push({ client_id: client.id, sahip_index: i, kalan, renewal_id: renewalId })
        }
      } catch (err) {
        errors.push({ client_id: client.id, error: err.message })
      }
    }

    return res.status(200).json({ success: true, created, errors, debug: { total_clients: clients?.length || 0, kiraci_count: kiraciClients.length, sample: sampleKiraTipi, has_kb_map: allKiraBilgisiRaw } })

  } catch (err) {
    console.error('kira-yenileme-kontrol hatasi:', err)
    return res.status(500).json({ success: false, error: err.message })
  }
}

// ---------- Odeme Hatirlatma (gunluk cron) ----------
// Son odeme tarihi yaklasan ve odenmemis tahakkuklari olan musterilere
// WhatsApp API (kanal 'api' ise) + e-posta gonderir. Her donem icin bir
// kez gonderir (beyan_durumlari'daki _hatirlatma_gonderildi bayragi ile).
// Ayar: app_settings.odeme_hatirlatma_gun (kac gun once, varsayilan 5)
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

async function odemeHatirlatmaHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Supabase credentials missing' })
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  try {
    const { data: settingsRows } = await supabase.from('app_settings').select('key, value')
      .in('key', ['odeme_hatirlatma_gun', 'whatsapp_channel', 'whatsapp_phone_number_id', 'whatsapp_access_token',
        'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'smtp_secure'])
    const settings = {}
    ;(settingsRows || []).forEach(r => {
      if (r.value === null || r.value === undefined || r.value === '') return
      settings[r.key] = r.value
    })

    const hatirlatmaGun = Math.max(0, parseInt(settings.odeme_hatirlatma_gun || '5') || 5)
    const waChannel = settings.whatsapp_channel === 'web' ? 'web' : 'api'

    const { data: clients, error: cErr } = await supabase
      .from('clients')
      .select('id, name, email, phone, beyan_durumlari')
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
        auth: { user: settings.smtp_user, pass: settings.smtp_pass },
        tls: { rejectUnauthorized: false }
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

        // 1) WhatsApp (yalniz API kanalinda; web kanali sunucudan acilamaz)
        let waSonuc = 'atlandi'
        if (waChannel === 'api' && settings.whatsapp_phone_number_id && settings.whatsapp_access_token) {
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

    return res.status(200).json({ success: true, gonderimSayisi: gonderimler.length, gonderimler, hatalar })
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message })
  }
}

// ---------- Router ----------
export default async function handler(req, res) {
  const route = req.query?.route
  if (route === 'tuik-kira') return tuikKiraHandler(req, res)
  if (route === 'guncel-parametreler') return guncelParametrelerHandler(req, res)
  if (route === 'kira-yenileme-kontrol') return kiraYenilemeKontrolHandler(req, res)
  if (route === 'odeme-hatirlatma') return odemeHatirlatmaHandler(req, res)
  return res.status(404).json({ error: 'Bilinmeyen route. Kullanim: ?route=tuik-kira|guncel-parametreler|kira-yenileme-kontrol|odeme-hatirlatma' })
}
