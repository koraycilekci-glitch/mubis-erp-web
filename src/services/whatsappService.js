import { supabase } from '../lib/supabase'
import { getWhatsAppConfig, getSMTPConfig } from './settingsService'

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
  const config = getSMTPConfig(settings)
  if (!config.host || !config.user || !config.pass) {
    throw new Error('SMTP ayarlari eksik. Lutfen Ayarlar > Iletisim kismindan girin.')
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
 * Tarayici yeni sekmede hazir mesaj acar, kullanici kendi telefonundan gonderir.
 * Otomatik PDF eklenemez; sadece metin ve link gonderilir.
 */
export function openWhatsAppWeb({ phone, message }) {
  const to = normalizePhone(phone)
  if (!to) throw new Error('Gecerli telefon numarasi bulunamadi')
  const encoded = encodeURIComponent(message || '')
  const url = `https://wa.me/${to}?text=${encoded}`
  window.open(url, '_blank', 'noopener,noreferrer')
  return { ok: true, channel: 'whatsapp_web' }
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
 * Secili evraklarin linklerini iceren text mesaji WhatsApp'tan gonderir.
 * 24 saat kurali icin oncelikle hello_world sablonu ile gonderim dener,
 * basarisiz olursa normal text mesaji dener.
 */
export async function sendShareDocumentsViaWhatsApp({ phone, message, settings = null }) {
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
