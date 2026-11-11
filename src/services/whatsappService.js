import { supabase } from '../lib/supabase'
import { getWhatsAppConfig, getSMTPConfig, getSettings } from './settingsService'
import { gibYardimciIs, yardimciIsSunucu } from '../utils/gibOdemeHelper'

const WHATSAPP_API_VERSION = 'v18.0'

function getWhatsAppApiUrl(phoneNumberId) {
  return `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`
}

function normalizePhone(phone) {
  if (!phone) return ''
  let cleaned = String(phone).replace(/\D/g, '')
  if (cleaned.startsWith('0')) cleaned = cleaned.slice(1)
  if (!cleaned.startsWith('90')) cleaned = '90' + cleaned
  return cleaned
}

export function getWhatsAppChannel(settings) {
  if (settings?.whatsapp_channel === 'web') return 'web'
  if (settings?.whatsapp_channel === 'masaustu') return 'masaustu'
  return 'api'
}

/**
 * Ayarlardaki kanala gore WhatsApp gonderimi yapar.
 * - api: WhatsApp Business API uzerinden dosya eki ile gonderir.
 * - web: web.whatsapp.com uzerinden link iceren hazir mesaj acar.
 */
export async function sendDocumentViaWhatsAppChannel({
  phone,
  documentUrl,
  documentName,
  caption,
  clientId,
  beyanType,
  year,
  month,
  documentType,
  settings = null
}) {
  const channel = getWhatsAppChannel(settings)

  // 2.7.172: WINDOWS WHATSAPP UYGULAMASI — whatsapp:// derin baglantisiyla
  // masastu programdan otomatik gonderim (yardimci program >= 2.7.172).
  // Yardimci yok / uygulama acilmadiysa tarayici WhatsApp Web'e duser.
  if (channel === 'masaustu') {
    try {
      const res = await gibYardimciIs('whatsapp-desktop-gonder', {
        telefon: normalizePhone(phone),
        mesaj: [caption || 'Merhaba, dosyaniz asagidaki linktedir:', documentUrl].filter(Boolean).join('\n')
      })
      if (res?.ok) {
        await logSend({
          clientId, beyanType, year, month, documentType,
          channel: 'whatsapp_desktop',
          target: normalizePhone(phone),
          status: 'sent',
          messageId: ''
        })
        return { ...res, channel: 'whatsapp_desktop' }
      }
      console.warn('[whatsapp-desktop] yardimci gonderemedi, WhatsApp Web yedegine geciliyor:', res?.reason)
    } catch (e) { /* yardimci hic yok - asagida eski yontem */ }
    return openWhatsAppWeb({ phone, message: [caption || 'Merhaba, dosyaniz asagidaki linktedir:', documentUrl].filter(Boolean).join('\n') })
  }

  if (channel === 'web') {
    const message = [
      caption || 'Merhaba, dosyaniz asagidaki linktedir:',
      documentUrl
    ].join('\n')

    const result = await openWhatsAppWeb({ phone, message })

    await logSend({
      clientId,
      beyanType,
      year,
      month,
      documentType,
      channel: 'whatsapp_web',
      target: normalizePhone(phone),
      status: result?.otomatik ? 'sent' : 'pending',
      messageId: ''
    })

    return { ...result, channel: 'whatsapp_web' }
  }

  return sendDocumentToWhatsApp({
    phone,
    documentUrl,
    documentName,
    caption,
    clientId,
    beyanType,
    year,
    month,
    documentType,
    settings
  })
}

/**
 * WhatsApp'a PDF dosyasi gonderir.
 * Ayarlar Settings sayfasindan veya ortam degiskenlerinden okunur.
 */
export async function sendDocumentToWhatsApp({
  phone,
  documentUrl,
  documentName,
  caption,
  clientId,
  beyanType,
  year,
  month,
  documentType,
  settings = null
}) {
  const config = getWhatsAppConfig(settings)
  const phoneNumberId = config.phoneNumberId
  const accessToken = config.accessToken

  const to = normalizePhone(phone)
  if (!to) throw new Error('Gecerli telefon numarasi bulunamadi')
  if (!phoneNumberId || !accessToken) {
    throw new Error('WhatsApp API ayarlari eksik. Lutfen Ayarlar > Iletisim kismindan girin.')
  }

  let mediaId = null
  try {
    const mediaFormData = new FormData()
    const response = await fetch(documentUrl)
    if (!response.ok) throw new Error('PDF dosyasi indirilemedi')
    const blob = await response.blob()
    mediaFormData.append('file', blob, documentName || 'beyanname.pdf')
    mediaFormData.append('messaging_product', 'whatsapp')

    const mediaUploadRes = await fetch(`https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: mediaFormData
    })
    const mediaData = await mediaUploadRes.json()
    if (!mediaUploadRes.ok) throw new Error(mediaData.error?.message || 'Media upload hatasi')
    mediaId = mediaData.id

    const messageBody = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'document',
      document: {
        id: mediaId,
        caption: caption || 'Beyanname/Tahakkuk dosyaniz ektedir.',
        filename: documentName || 'beyanname.pdf'
      }
    }

    const sendRes = await fetch(getWhatsAppApiUrl(phoneNumberId), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messageBody)
    })
    const sendData = await sendRes.json()
    if (!sendRes.ok) throw new Error(sendData.error?.message || 'WhatsApp mesaj gonderim hatasi')

    await logSend({
      clientId,
      beyanType,
      year,
      month,
      documentType,
      channel: 'whatsapp',
      target: to,
      status: 'sent',
      messageId: sendData.messages?.[0]?.id || ''
    })

    return sendData
  } catch (err) {
    await logSend({
      clientId,
      beyanType,
      year,
      month,
      documentType,
      channel: 'whatsapp',
      target: to,
      status: 'failed',
      errorMessage: err.message
    })
    throw err
  }
}

/**
 * Kendi /api/send-email endpoint'imiz uzerinden mail gonderir.
 */
export async function sendEmail({
  toEmail,
  toName,
  subject,
  message,
  documentUrl,
  documents,
  clientId,
  beyanType,
  year,
  month,
  documentType,
  settings = null
}) {
  // Ayarlar parametre gelmediyse veya eksikse ayarlardan yukle
  let smtpSettings = settings
  let config = getSMTPConfig(smtpSettings)
  if (!config.host || !config.user || !config.pass) {
    try { smtpSettings = await getSettings() } catch { /* ayarlar okunamadi */ }
    config = getSMTPConfig(smtpSettings)
  }
  if (!config.host || !config.user || !config.pass) {
    throw new Error('SMTP ayarlari eksik. Lutfen Ayarlar > Iletisim kismindan girin.')
  }

  // 2.7.171: ONCE LOKAL YARDIMCI — Cloudflare Workers raw SMTP acamadigi
  // icin e-posta nodemailer'la lokal yardimci programdan gider (PDF ekleri
  // URL'den indirilip eklenir). Yardimci yoksa eski /api/send-email yolu
  // denenir; o da yoksa hatanin kendisi yukariya firlatilir (sessiz
  // basarisizlik olmasin).
  try {
    const res = await gibYardimciIs('mail-gonder', {
      host: config.host,
      port: config.port,
      secure: config.secure !== false,
      user: config.user,
      pass: config.pass,
      from: config.from || config.user,
      to: toEmail,
      toName,
      subject,
      mesaj: message,
      documents: documents || (documentUrl ? [{ url: documentUrl, name: 'belge.pdf' }] : [])
    }, 120000)
    if (res?.ok) {
      await logSend({
        clientId,
        beyanType,
        year,
        month,
        documentType,
        channel: 'email',
        target: toEmail,
        status: 'sent'
      })
      return { ok: true, channel: 'yardimci', ekAdet: res.ekAdet }
    }
    throw new Error(res?.error || res?.reason || 'Yardimci program mail gonderemedi')
  } catch (yardimciHatasi) {
    console.warn('[send-email] yardimci yolu basarisiz, /api/send-email denenir:', yardimciHatasi.message)
  }

  const body = {
    toEmail,
    toName,
    subject,
    message,
    documentUrl,
    documents,
    clientId,
    beyanType,
    year,
    month,
    documentType
  }

  try {
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Email gonderilemedi')

    await logSend({
      clientId,
      beyanType,
      year,
      month,
      documentType,
      channel: 'email',
      target: toEmail,
      status: 'sent'
    })

    return data
  } catch (err) {
    await logSend({
      clientId,
      beyanType,
      year,
      month,
      documentType,
      channel: 'email',
      target: toEmail,
      status: 'failed',
      errorMessage: err.message
    })
    throw err
  }
}

/**
 * Gonderim logu kaydeder.
 */
async function logSend({
  clientId,
  beyanType,
  year,
  month,
  documentType,
  channel,
  target,
  status,
  messageId = '',
  errorMessage = ''
}) {
  try {
    await supabase.from('whatsapp_logs').insert({
      client_id: clientId || null,
      beyan_type: beyanType || '',
      year: year || null,
      month: month || null,
      document_type: documentType || 'beyanname',
      phone: channel === 'whatsapp' ? target : '',
      email: channel === 'email' ? target : '',
      channel,
      message_id: messageId,
      status,
      error_message: errorMessage,
      sent_at: new Date().toISOString()
    })
  } catch (logErr) {
    console.error('Gonderim log kayit hatasi:', logErr)
  }
}

/**
 * Kullanicinin kendi WhatsApp Web / masaustu uygulamasi uzerinden gonderim yapmasini saglar.
 * Yardimci program (gib-yardimci >= 2.6.6) calisiyorsa tam otomatik gonderim yapar:
 * web.whatsapp.com'da sohbeti acar, mesaji yazar ve GONDER tusuna otomatik basar.
 * Yardimci yoksa eski davranis: tarayicida hazir mesaj acilir, gonderi kullanici basar.
 * Otomatik PDF eklenemez; sadece metin ve link gonderilir.
 */
export async function openWhatsAppWeb({ phone, message, kaynak = null }) {
  const to = normalizePhone(phone)
  if (!to) throw new Error('Gecerli telefon numarasi bulunamadi')
  const mesaj = message || ''

  // 2.8.35: Gonderim makinesi secimi (Ayarlar > Iletisim > WhatsApp Web):
  // 'vps'    -> Istanbul sunucusundaki yardimci (ofis kapali olsa da calisir)
  // 'yerel'  -> bu bilgisayardaki yardimci program
  // kaynak verilmezse app_settings.whatsapp_web_kaynak okunur (varsayilan vps).
  let hedefKaynak = kaynak
  if (hedefKaynak !== 'vps' && hedefKaynak !== 'yerel') {
    try {
      const s = await getSettings()
      hedefKaynak = s?.whatsapp_web_kaynak === 'yerel' ? 'yerel' : 'vps'
    } catch { hedefKaynak = 'vps' }
  }

  // 1) Yardimci program varsa tam otomatik gonderim (GONDER tusuna otomatik basar)
  let yardimciHata = ''
  let yardimciSonuc = null
  try {
    const gonder = hedefKaynak === 'vps'
      ? (p) => yardimciIsSunucu('whatsapp-web-gonder', p, 3 * 60 * 1000)
      : (p) => gibYardimciIs('whatsapp-web-gonder', p, 3 * 60 * 1000)
    const res = await gonder({ telefon: to, mesaj })
    yardimciSonuc = res
    if (res?.ok) {
      return { ok: true, channel: 'whatsapp_web', otomatik: true, kaynak: hedefKaynak }
    }
    // QR girisi gerekli: yardimci Chrome penceresi acik; fallback YAPILMAZ
    // (wa.me sekmesi acmak kullaniciyi iki pencereyle basbasa birakir)
    if (res?.reason === 'giris-gerekli') {
      return {
        ok: false,
        channel: 'whatsapp_web',
        otomatik: false,
        kaynak: hedefKaynak,
        reason: 'giris-gerekli',
        not: res.not || (hedefKaynak === 'vps'
          ? "Sunucudaki WhatsApp oturumu yok. Ayarlar > Iletisim bolumundeki 'QR Kodu Göster' ile QR kodu okutun."
          : "Yardimci programin Chrome penceresinde WhatsApp'a bir kez QR ile giris yapin; sonraki gonderimler otomatik olacak.")
      }
    }
    yardimciHata = res?.reason || res?.error || ''
  } catch (e) { yardimciHata = e?.message || '' }

  // 2.8.37: VPS seciliyken yerel tarayicida WhatsApp ACMA. Kullanici acikca
  // "Sunucu (VPS)" sectiyse gonderim orada yapilmalidir; hata varsa net mesaj
  // ver. (Eskiden sessizce wa.me sekmesi aciliyor, "yerel WhatsApp acildi"
  // goruntusune yol aciyordu.)
  if (hedefKaynak === 'vps') {
    // QR/giris gerekli ise fallback YAPMA (VPS Chrome'da taranmasi gerekir)
    if (yardimciSonuc?.reason === 'giris-gerekli') {
      return {
        ok: false,
        channel: 'whatsapp_web',
        otomatik: false,
        kaynak: 'vps',
        reason: 'giris-gerekli',
        not: yardimciSonuc.not || "Sunucudaki WhatsApp oturumu yok. Ayarlar > İletişim bölümündeki 'QR Kodu Göster' ile QR kodu okutun."
      }
    }
    // Gonderim dogrulanamadi ise wa.me linkini mesajda ver (otomatik sekme acma)
    const encoded = encodeURIComponent(mesaj)
    const url = `https://wa.me/${to}?text=${encoded}`
    return {
      ok: false,
      channel: 'whatsapp_web',
      otomatik: false,
      kaynak: 'vps',
      reason: 'gonderilemedi',
      not: 'Sunucu otomatik gönderimi doğrulanamadı. Hazır mesajı açmak için: ' + url
    }
  }

  // 2) Yedek: wa.me linkini yeni sekmede ac (gonder tusuna kullanici basar)
  const encoded = encodeURIComponent(mesaj)
  const url = `https://wa.me/${to}?text=${encoded}`
  let sekmeAcildi = false
  try {
    sekmeAcildi = !!window.open(url, '_blank', 'noopener,noreferrer')
  } catch (e) { /* popup engellendi */ }
  return {
    ok: true,
    channel: 'whatsapp_web',
    otomatik: false,
    link: url,
    sekmeAcildi,
    not: sekmeAcildi
      ? 'Hazir mesaj yeni sekmede acildi; GONDER tusuna siz basmalisiniz (tam otomatik gonderim icin yardimci programi guncelleyin).'
      : 'Tarayici yeni sekmeyi engelledi. Bu linki acarak gonderebilirsiniz: ' + url
  }
}

/**
 * WhatsApp Web oturum durumu / QR goruntusu getirir.
 * kaynak: 'vps' | 'yerel'
 * Donus: { ok, girisVar, goruntu?, not }
 */
export async function whatsappWebDurum({ kaynak = 'vps', qr = false } = {}) {
  const isAdi = qr ? 'whatsapp-web-qr' : 'whatsapp-web-durum'
  const gonder = kaynak === 'vps'
    ? (p) => yardimciIsSunucu(isAdi, p, 2 * 60 * 1000)
    : (p) => gibYardimciIs(isAdi, p, 2 * 60 * 1000)
  try {
    const res = await gonder({})
    if (!res?.ok) {
      return { ok: false, hata: res?.reason || res?.error || 'Yardimci yanit vermedi' }
    }
    return { ok: true, girisVar: !!res.girisVar, goruntu: res.goruntu || '', not: res.not || '' }
  } catch (e) {
    return { ok: false, hata: e?.message || 'Baglanti kurulamadi' }
  }
}

/**
 * Gonderim logu kaydeder (WhatsApp Web icin manuel gonderim varsayilir).
 */
export async function logWhatsAppWebSend({
  clientId,
  beyanType,
  year,
  month,
  documentType,
  target,
  status = 'pending',
  errorMessage = ''
}) {
  await logSend({
    clientId,
    beyanType,
    year,
    month,
    documentType,
    channel: 'whatsapp',
    target,
    status,
    errorMessage
  })
}

/**
 * Secili evraklarin linklerini iceren mesaji WhatsApp'tan gonderir.
 * Ayarlardaki kanala gore:
 * - api: WhatsApp Business API uzerinden text mesaji olarak gonderir.
 * - web: web.whatsapp.com uzerinden hazir mesaj acar.
 */
export async function sendShareDocumentsViaWhatsApp({ phone, message, settings = null }) {
  const channel = getWhatsAppChannel(settings)

  if (channel === 'web') {
    return openWhatsAppWeb({ phone, message })
  }

  const config = getWhatsAppConfig(settings)
  if (!config.phoneNumberId || !config.accessToken) {
    throw new Error('WhatsApp API ayarlari eksik')
  }

  const to = normalizePhone(phone)
  if (!to) throw new Error('Gecerli telefon numarasi bulunamadi')

  // Once sablon ile gondermeyi dene (24 saat kurali icin)
  try {
    const templateBody = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: 'hello_world',
        language: { code: 'en_US' }
      }
    }

    const templateRes = await fetch(getWhatsAppApiUrl(config.phoneNumberId), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(templateBody)
    })

    const templateData = await templateRes.json()
    if (templateRes.ok) {
      // Sablon basarili, simdi asil mesaji gonder
      const textBody = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: message }
      }

      const textRes = await fetch(getWhatsAppApiUrl(config.phoneNumberId), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(textBody)
      })

      const textData = await textRes.json()
      if (textRes.ok) return textData
      // Text basarisiz olsa bile sablon gitti, hata verme
      return templateData
    }
    // Sablon basarisizsa direkt text dene
  } catch (templateErr) {
    console.log('Sablon gonderimi basarisiz, direkt text deneniyor:', templateErr.message)
  }

  // Direkt text mesaji gonder
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: message }
  }

  const res = await fetch(getWhatsAppApiUrl(config.phoneNumberId), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  const data = await res.json()
  if (!res.ok) {
    const msg = data.error?.message || data.error?.error_user_msg || 'WhatsApp mesaji gonderilemedi'
    throw new Error(msg)
  }
  return data
}

/**
 * Onayli mesaj sablonu ile text mesaj gonder (alternatif, test icin)
 */
export async function sendTemplateMessage({ phone, templateParams = [], settings = null }) {
  const config = getWhatsAppConfig(settings)
  if (!config.phoneNumberId || !config.accessToken) {
    throw new Error('WhatsApp API ayarlari eksik')
  }

  const to = normalizePhone(phone)
  if (!to) throw new Error('Gecerli telefon numarasi bulunamadi')

  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: config.templateName,
      language: { code: 'tr' },
      components: templateParams.length
        ? [{ type: 'body', parameters: templateParams.map(p => ({ type: 'text', text: String(p) })) }]
        : undefined
    }
  }

  const res = await fetch(getWhatsAppApiUrl(config.phoneNumberId), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Sablon mesaj gonderilemedi')
  return data
}
