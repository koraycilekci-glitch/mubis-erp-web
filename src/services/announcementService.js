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

// ============ DUYURU CRUD ============

export async function createAnnouncement({ title, message, type = 'duyuru', channels }) {
  try {
    const { data: userData } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('announcements')
      .insert({
        title,
        message,
        type,
        channels,
        created_by: userData?.user?.id
      })
      .select()
      .single()
    if (error) {
      console.error('Duyuru olusturma hatasi:', error)
      throw new Error('Duyuru kaydedilemedi: ' + error.message)
    }
    return data
  } catch (e) {
    console.error('Duyuru olusturma hatasi:', e)
    throw e
  }
}

export async function getAnnouncements() {
  try {
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      console.warn('Duyurular yuklenemedi:', error.message)
      return []
    }
    return data || []
  } catch (e) {
    console.warn('Duyurular yuklenemedi:', e.message)
    return []
  }
}

export async function getAnnouncementById(id) {
  try {
    const { data, error } = await supabase
      .from('announcements')
      .select('*, announcement_recipients(*)')
      .eq('id', id)
      .single()
    if (error) {
      console.warn('Duyuru bulunamadi:', error.message)
      return null
    }
    return data
  } catch (e) {
    console.warn('Duyuru bulunamadi:', e.message)
    return null
  }
}

export async function deleteAnnouncement(id) {
  try {
    const { error } = await supabase
      .from('announcements')
      .delete()
      .eq('id', id)
    if (error) console.warn('Duyuru silinemedi:', error.message)
  } catch (e) {
    console.warn('Duyuru silinemedi:', e.message)
  }
}

// ============ ALICI YONETIMI ============

export async function addRecipients(announcementId, clientIds, channel) {
  try {
    const rows = clientIds.map(clientId => ({
      announcement_id: announcementId,
      client_id: clientId,
      channel,
      status: 'bekliyor'
    }))
    const { data, error } = await supabase
      .from('announcement_recipients')
      .insert(rows)
      .select()
    if (error) {
      console.warn('Alicilar eklenemedi:', error.message)
      return []
    }
    return data || []
  } catch (e) {
    console.warn('Alicilar eklenemedi:', e.message)
    return []
  }
}

export async function getRecipientsByAnnouncement(announcementId) {
  try {
    const { data, error } = await supabase
      .from('announcement_recipients')
      .select('*, clients(name, company, phone, email)')
      .eq('announcement_id', announcementId)
      .order('created_at', { ascending: true })
    if (error) {
      console.warn('Alicilar yuklenemedi:', error.message)
      return []
    }
    return data || []
  } catch (e) {
    console.warn('Alicilar yuklenemedi:', e.message)
    return []
  }
}

// ============ GONDERIM ============

async function sendWhatsAppText({ phone, message, phoneNumberId, accessToken }) {
  const to = normalizePhone(phone)
  if (!to) throw new Error('Gecerli telefon numarasi bulunamadi')
  if (!phoneNumberId || !accessToken) throw new Error('WhatsApp API ayarlari eksik')

  const res = await fetch(getWhatsAppApiUrl(phoneNumberId), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: message }
    })
  })

  const result = await res.json()
  if (!res.ok) {
    throw new Error(result?.error?.message || `WhatsApp API hatasi: ${res.status}`)
  }
  return result
}

async function sendEmailMessage({ to, subject, body, settings }) {
  const { sendEmail } = await import('./whatsappService')
  return sendEmail({ toEmail: to, subject, message: body, settings })
}

export async function sendAnnouncementToRecipients(announcementId, settings = null) {
  try {
    // Eger settings disaridan gelmediyse, veritabanindan cek
    if (!settings) {
      try {
        const { getSettings } = await import('./settingsService')
        settings = await getSettings()
      } catch (e) {
        console.warn('Ayarlar yuklenemedi:', e.message)
      }
    }

    // Recipients ve announcement bilgilerini cek
    const { data: announcement, error: aErr } = await supabase
      .from('announcements')
      .select('*')
      .eq('id', announcementId)
      .single()
    if (aErr) {
      console.error('Duyuru bulunamadi:', aErr)
      throw new Error('Duyuru bulunamadi: ' + aErr.message)
    }

    const { data: recipients, error: rErr } = await supabase
      .from('announcement_recipients')
      .select('*, clients(name, company, phone, email, phonenumbers, emails)')
      .eq('announcement_id', announcementId)
      .eq('status', 'bekliyor')
    if (rErr) {
      console.error('Alicilar bulunamadi:', rErr)
      throw new Error('Alicilar bulunamadi: ' + rErr.message)
    }

    if (!recipients || recipients.length === 0) {
      return { sent: 0, failed: 0, message: 'Bekleyen alici yok' }
    }

    // WhatsApp config
    const waConfig = getWhatsAppConfig(settings)
    const smtpConfig = getSMTPConfig(settings)

    console.log('WhatsApp Config:', JSON.stringify(waConfig))
    console.log('SMTP Config:', JSON.stringify(smtpConfig))
    console.log('Raw settings:', JSON.stringify(settings))

    let sent = 0
    let failed = 0

    for (const rec of recipients) {
      const client = rec.clients
      const channel = rec.channel

      try {
        if (channel === 'whatsapp') {
          // Birden fazla WhatsApp numarasi varsa hepsine gonder
          const waNumbers = []
          
          if (client?.phone) waNumbers.push(client.phone)
          
          if (client?.phonenumbers && Array.isArray(client.phonenumbers)) {
            client.phonenumbers.forEach(pn => {
              if (pn.isWhatsapp && pn.phone && !waNumbers.includes(pn.phone)) {
                waNumbers.push(pn.phone)
              }
            })
          }
          
          if (waNumbers.length === 0) throw new Error('Telefon numarasi yok')
          
          for (const phone of waNumbers) {
            try {
              await sendWhatsAppText({
                phone,
                message: announcement.message,
                phoneNumberId: waConfig.phoneNumberId,
                accessToken: waConfig.accessToken
              })
            } catch (err) {
              console.warn(`WhatsApp gonderim hatasi (${phone}):`, err.message)
            }
          }
        } else if (channel === 'email') {
          // Birden fazla e-posta varsa hepsine gonder
          const emailList = []
          
          if (client?.email) emailList.push(client.email)
          
          if (client?.emails && Array.isArray(client.emails)) {
            client.emails.forEach(em => {
              if (em.email && !emailList.includes(em.email)) {
                emailList.push(em.email)
              }
            })
          }
          
          if (emailList.length === 0) throw new Error('E-posta adresi yok')
          
          for (const to of emailList) {
            try {
              await sendEmailMessage({
                to,
                subject: announcement.title,
                body: announcement.message,
                settings
              })
            } catch (err) {
              console.warn(`Email gonderim hatasi (${to}):`, err.message)
            }
          }
        }

        // Basarili guncelle
        await supabase
          .from('announcement_recipients')
          .update({ status: 'gonderildi', sent_at: new Date().toISOString() })
          .eq('id', rec.id)
        sent++
      } catch (err) {
        // Hata kaydet
        await supabase
          .from('announcement_recipients')
          .update({ status: 'basarisiz', error_message: err.message })
          .eq('id', rec.id)
        failed++
      }
    }

    // Announcement ozet guncelle
    await supabase
      .from('announcements')
      .update({
        sent_count: announcement.sent_count + sent,
        failed_count: announcement.failed_count + failed
      })
      .eq('id', announcementId)

    return { sent, failed, total: recipients.length }
  } catch (e) {
    console.error('Gonderim hatasi:', e)
    throw e
  }
}

// ============ SABLONLAR ============

const DEFAULT_TEMPLATES = [
  {
    id: 'yeni_yil',
    title: 'Yeni Yil Duyurusu',
    message: 'Sayin {musteri_adi},\n\nYeni yilinizi en icten dileklerimizle kutlariz. Mali konularda her turlu destek icin yaninizdayiz.\n\nSaygilarimizla,\nMUBiS ERP'
  },
  {
    id: 'beyan_hatirlatma',
    title: 'Beyanname Hatirlatma',
    message: 'Sayin {musteri_adi},\n\nYaklasan beyanname donemi hatirlatmasidir. Lutfen gerekli evraklari hazirlayiniz.\n\nSaygilarimizla,\nMUBiS ERP'
  },
  {
    id: 'genel_duyuru',
    title: 'Genel Duyuru',
    message: 'Sayin {musteri_adi},\n\n{mesaj}\n\nSaygilarimizla,\nMUBiS ERP'
  }
]

const STORAGE_KEY = 'mubis_announcement_templates'

export function getAnnouncementTemplates() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const custom = JSON.parse(stored)
      return [...DEFAULT_TEMPLATES, ...custom]
    }
  } catch (e) {
    console.warn('Sablonlar yuklenemedi:', e)
  }
  return DEFAULT_TEMPLATES
}

export function addCustomTemplate(template) {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    const custom = stored ? JSON.parse(stored) : []
    const newTemplate = {
      id: 'custom_' + Date.now(),
      title: template.title,
      message: template.message
    }
    custom.push(newTemplate)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom))
    return newTemplate
  } catch (e) {
    console.error('Sablon eklenemedi:', e)
    throw e
  }
}

export function deleteCustomTemplate(templateId) {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return
    const custom = JSON.parse(stored)
    const filtered = custom.filter(t => t.id !== templateId)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  } catch (e) {
    console.error('Sablon silinemedi:', e)
  }
}

export function formatAnnouncementMessage(template, clientName) {
  return template
    .replace(/{musteri_adi}/g, clientName || 'Degerli Musterimiz')
}
