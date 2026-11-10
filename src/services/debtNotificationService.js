import { supabase } from '../lib/supabase'
import { getAccountingFee, getPayments, hesaplaBorcOzeti, getBankInfo, getBankAccounts, buildBorcMesaji, getActivePaymentProvider } from './paymentService'
import { getWhatsAppConfig, getSMTPConfig, getSettings } from './settingsService'
import { getWhatsAppChannel, openWhatsAppWeb } from './whatsappService'

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

async function sendEmailMessage({ to, subject, body }) {
  const { sendEmail } = await import('./whatsappService')
  // sendEmail duz metin message bekler; firma imzasini /api/send-email ekler
  return sendEmail({ toEmail: to, subject, message: body })
}

function buildDebtText(client, ozet, fee = null, bankInfo = null, linkUrl = '', bankAccounts = null) {
  const name = client.company || client.name || 'Değerli Müşterimiz'
  return buildBorcMesaji({ clientName: name, fee, ozet, bankInfo, bankAccounts, linkUrl })
}

// Musteri icin kalan borc tutarinda online odeme linki olusturur
async function createClientPaymentLink(client, ozet) {
  try {
    if (!(Number(ozet?.kalanBorc) > 0)) return ''
    const provider = await getActivePaymentProvider()
    if (provider !== 'paytr' && provider !== 'odeal') return ''
    const res = await fetch(`/api/${provider}-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Math.round(Number(ozet.kalanBorc) * 100) / 100,
        clientId: client.id,
        customerName: client.company || client.name || '',
        customerEmail: client.email || '',
        description: 'Muhasebe Ucreti Odemesi'
      })
    })
    const data = await res.json()
    return data?.success && data?.paymentUrl ? data.paymentUrl : ''
  } catch (err) {
    console.warn('Odeme linki olusturulamadi:', err.message)
    return ''
  }
}

// Sirali (etkilesimli) WhatsApp gonderimi icin musteri verisini hazirlar
// Borcu yoksa / ucret kaydi yoksa null doner
export async function buildDebtPayload(clientId, { settings = null, bankInfo = null } = {}) {
  try {
    const { data: client, error } = await supabase
      .from('clients')
      .select('id, name, company, phone, email, phonenumbers, emails')
      .eq('id', clientId)
      .single()
    if (error || !client) return null

    const fee = await getAccountingFee(clientId)
    if (!fee) return null
    const clientPayments = await getPayments(clientId)
    const ozet = hesaplaBorcOzeti(fee, clientPayments)
    if (!(Number(ozet.kalanBorc) > 0)) return null

    let effSettings = settings
    if (!effSettings) {
      try { effSettings = await getSettings() } catch { effSettings = null }
    }
    let effBank = bankInfo
    let effHesaplar = null
    if (!effBank) {
      try { effHesaplar = await getBankAccounts() } catch { effHesaplar = null }
      effBank = effHesaplar?.[0] || null
    }

    const linkUrl = await createClientPaymentLink(client, ozet)
    const message = `${buildDebtText(client, ozet, fee, effBank, linkUrl, effHesaplar)}\n\nSaygılarımızla,\nMUBiS ERP`

    const waNumbers = []
    if (client?.phone) waNumbers.push(client.phone)
    if (Array.isArray(client?.phonenumbers)) {
      client.phonenumbers.forEach(pn => {
        if (pn.isWhatsapp && pn.phone && !waNumbers.includes(pn.phone)) waNumbers.push(pn.phone)
      })
    }

    return { clientId: client.id, clientName: client.company || client.name || '', message, phone: waNumbers[0] || '', kalanBorc: ozet.kalanBorc }
  } catch (err) {
    console.warn('Borc bildirim verisi hazirlanamadi:', err.message)
    return null
  }
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

  // Ayarlar parametre gelmediyse yukle
  let effSettings = settings
  if (!effSettings) {
    try { effSettings = await getSettings() } catch { effSettings = null }
  }

  // WhatsApp config
  const waConfig = getWhatsAppConfig(effSettings)
  const smtpConfig = getSMTPConfig(effSettings)
  const bankInfo = await getBankInfo().catch(() => null)
  const bankAccounts = await getBankAccounts().catch(() => null)

  // Musteriye ozel online odeme linki (kalan borc tutariyla)
  const linkUrl = await createClientPaymentLink(client, ozet)

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
      
      const message = `${buildDebtText(client, ozet, fee, bankInfo, linkUrl, bankAccounts)}\n\nSaygılarımızla,\nMUBiS ERP`

      const waChannel = getWhatsAppChannel(effSettings)
      let gonderilen = 0
      let sonHata = ''
      for (const phone of waNumbers) {
        try {
          if (waChannel === 'web') {
            // Kullanicinin kendi WhatsApp'i uzerinden hazir mesaj acar
            openWhatsAppWeb({ phone, message })
          } else {
            await sendWhatsAppText({
              phone,
              message,
              phoneNumberId: waConfig.phoneNumberId,
              accessToken: waConfig.accessToken
            })
          }
          gonderilen++
        } catch (err) {
          sonHata = err.message
          console.warn(`WhatsApp gonderim hatasi (${phone}):`, err.message)
        }
      }
      if (gonderilen === 0) throw new Error(sonHata || 'WhatsApp gonderilemedi')
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
      
      const html = buildDebtText(client, ozet, fee, bankInfo, linkUrl, bankAccounts)
      
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

