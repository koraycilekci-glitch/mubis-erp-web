import { supabase } from '../lib/supabase'
import { getAccountingFee, getPayments, hesaplaBorcOzeti } from './paymentService'
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

// ============ BORC HESAPLAMA ============

export async function getClientsWithDebt() {
  const { data: clients, error: cErr } = await supabase
    .from('clients')
    .select('id, name, company, phone, email')
    .order('name')
  if (cErr) throw cErr

  const { data: fees, error: fErr } = await supabase
    .from('accounting_fees')
    .select('*')
  if (fErr) throw fErr

  const { data: payments, error: pErr } = await supabase
    .from('payments')
    .select('*')
  if (pErr) throw pErr

  const results = []
  for (const client of clients) {
    const fee = fees.find(f => f.client_id === client.id)
    const clientPayments = payments.filter(p => p.client_id === client.id)
    const ozet = hesaplaBorcOzeti(fee, clientPayments)

    if (ozet.kalanBorc > 0) {
      results.push({
        ...client,
        fee,
        payments: clientPayments,
        ozet
      })
    }
  }

  // Borc tutarina gore azalan siralama
  return results.sort((a, b) => b.ozet.kalanBorc - a.ozet.kalanBorc)
}

// ============ BORC BILDIRIMI GONDERIMI ============

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

async function sendEmailMessage({ to, subject, body, smtpConfig }) {
  const { sendEmail } = await import('./whatsappService')
  return sendEmail({ to, subject, body, smtpConfig })
}

function formatDebtMessage(client, ozet) {
  const name = client.company || client.name || 'Degerli Musterimiz'
  const borc = ozet.kalanBorc.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return `Sayin ${name},

Muhasebe hizmetlerimize iliskin borc durumunuz asagidaki gibidir:

Toplam Borc: ${borc} TL

Lutfen en kisa surede odemenizi gerceklestiriniz.
Odeme yapmak icin musteri portalimizdan kredi karti ile odeme yapabilirsiniz.

Saygilarimizla,
MUBiS ERP`
}

function formatDebtEmailHtml(client, ozet) {
  const name = client.company || client.name || 'Degerli Musterimiz'
  const borc = ozet.kalanBorc.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return `
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <p>Sayin <strong>${name}</strong>,</p>
  <p>Muhasebe hizmetlerimize iliskin borc durumunuz asagidaki gibidir:</p>
  <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0;">
    <p style="margin: 0; font-size: 18px;"><strong>Toplam Borc: ${borc} TL</strong></p>
  </div>
  <p>Lutfen en kisa surede odemenizi gerceklestiriniz.</p>
  <p>Odeme yapmak icin <a href="https://mubiserp.com/portal">musteri portalimizdan</a> kredi karti ile odeme yapabilirsiniz.</p>
  <p>Saygilarimizla,<br/><strong>MUBiS ERP</strong></p>
</body>
</html>
  `.trim()
}

export async function sendDebtNotification(clientId, channel, settings = null) {
  // Musteri bilgilerini cek
  const { data: client, error: cErr } = await supabase
    .from('clients')
    .select('id, name, company, phone, email, phonenumbers, emails')
    .eq('id', clientId)
    .single()
  if (cErr) throw cErr

  // Borc hesapla
  const fee = await getAccountingFee(clientId)
  const clientPayments = await getPayments(clientId)
  const ozet = hesaplaBorcOzeti(fee, clientPayments)

  if (ozet.kalanBorc <= 0) {
    throw new Error('Musterinin borcu bulunmamaktadir')
  }

  // WhatsApp config
  const waConfig = getWhatsAppConfig(settings)
  const smtpConfig = getSMTPConfig(settings)

  // Kayit olustur
  const { data: notifRecord, error: nErr } = await supabase
    .from('debt_notifications')
    .insert({
      client_id: clientId,
      channel,
      borc_tutar: ozet.kalanBorc,
      status: 'bekliyor'
    })
    .select()
    .single()
  if (nErr) throw nErr

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
      
      const message = formatDebtMessage(client, ozet)
      
      for (const phone of waNumbers) {
        try {
          await sendWhatsAppText({
            phone,
            message,
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
      
      const html = formatDebtEmailHtml(client, ozet)
      
      for (const to of emailList) {
        try {
          await sendEmailMessage({
            to,
            subject: 'Muhasebe Borc Hatirlatmasi - MUBiS ERP',
            body: html,
            smtpConfig
          })
        } catch (err) {
          console.warn(`Email gonderim hatasi (${to}):`, err.message)
        }
      }
    }

    // Basarili guncelle
    await supabase
      .from('debt_notifications')
      .update({ status: 'gonderildi', sent_at: new Date().toISOString() })
      .eq('id', notifRecord.id)

    return { success: true, message: 'Bildirim gonderildi' }
  } catch (err) {
    await supabase
      .from('debt_notifications')
      .update({ status: 'basarisiz', error_message: err.message })
      .eq('id', notifRecord.id)
    throw err
  }
}

export async function sendBulkDebtNotifications(clientIds, channel, settings = null) {
  const results = { sent: 0, failed: 0, errors: [] }

  for (const clientId of clientIds) {
    try {
      await sendDebtNotification(clientId, channel, settings)
      results.sent++
    } catch (err) {
      results.failed++
      results.errors.push({ clientId, error: err.message })
    }
  }

  return results
}

// ============ GECMIS ============

export async function getDebtNotificationHistory(clientId = null) {
  let query = supabase
    .from('debt_notifications')
    .select('*, clients(name, company)')
    .order('created_at', { ascending: false })

  if (clientId) {
    query = query.eq('client_id', clientId)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}
