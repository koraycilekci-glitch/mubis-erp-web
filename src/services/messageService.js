import { supabase } from '../lib/supabase'

// ============================================================
// MUBIS ASISTAN MESAJLASMA SERVISI
// Admin -> MUBIS Asistan -> Musteri
// ============================================================

export const ONCELIKLER = [
  { id: 'normal', label: 'Normal', renk: 'green', ikon: '🟢' },
  { id: 'onemli', label: 'Önemli', renk: 'yellow', ikon: '🟡' },
  { id: 'acil', label: 'Acil', renk: 'red', ikon: '🔴' }
]

export const AKSIYONLAR = [
  { id: 'none', label: 'Aksiyon yok', buton: '' },
  { id: 'belge_talebi', label: 'Belge talebi', buton: 'Belge Yükle' },
  { id: 'odeme', label: 'Ödeme hatırlatması', buton: 'Borç Durumu' },
  { id: 'beyanname_onay', label: 'Beyanname onayı', buton: 'Beyannameyi Görüntüle' },
  { id: 'bilgi', label: 'Bilgilendirme', buton: 'Detayı Gör' }
]

const AKSIYON_URL = {
  belge_talebi: '/portal?tab=evraklar',
  odeme: '/portal?tab=borc',
  beyanname_onay: '/portal?tab=beyanlar',
  bilgi: '/portal'
}

function tarihYaz(d) {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
  } catch {
    return String(d)
  }
}

/**
 * Adminin yazdigi ham mesaji, asistan uslubuyla musteriye iletilecek metne cevirir.
 */
export function asistanMetniOlustur({
  message,
  priority = 'normal',
  actionType = 'none',
  dueDate = null,
  clientName = '',
  senderName = 'Mali müşaviriniz'
}) {
  const hitap = clientName ? `Merhaba ${clientName},` : 'Merhaba,'
  const basliklar = {
    acil: '🔴 Acil bir bildiriminiz var.',
    onemli: '🟡 Önemli bir bildiriminiz var.',
    normal: '🔔 Yeni bir bildiriminiz var.'
  }

  const satirlar = [hitap, '', basliklar[priority] || basliklar.normal, '']

  const girisler = {
    belge_talebi: `${senderName} sizden belge talep ediyor:`,
    odeme: `${senderName} ödeme hatırlatması gönderdi:`,
    beyanname_onay: `${senderName} beyanname onayınızı bekliyor:`,
    bilgi: `${senderName} sizi bilgilendiriyor:`,
    none: `${senderName} size bir mesaj gönderdi:`
  }
  satirlar.push(girisler[actionType] || girisler.none)
  satirlar.push('')
  satirlar.push(String(message || '').trim())

  if (dueDate) {
    satirlar.push('')
    satirlar.push(`📅 Son tarih: ${tarihYaz(dueDate)}`)
  }

  return satirlar.join('\n').trim()
}

/**
 * Admin -> musteri mesaji gonderir. Portal her zaman, secilirse WhatsApp/e-posta da.
 */
export async function sendMessageToClient({
  clientId,
  clientName = '',
  title = '',
  message,
  priority = 'normal',
  actionType = 'none',
  dueDate = null,
  relatedPeriod = null,
  channels = ['portal'],
  senderName = ''
}) {
  if (!clientId) throw new Error('Müşteri seçilmedi')
  if (!message || !message.trim()) throw new Error('Mesaj boş olamaz')

  const aksiyon = AKSIYONLAR.find(a => a.id === actionType) || AKSIYONLAR[0]
  const assistantMessage = asistanMetniOlustur({
    message,
    priority,
    actionType,
    dueDate,
    clientName,
    senderName: senderName ? `${senderName} (SMMM)` : 'Mali müşaviriniz'
  })

  const { data: userData } = await supabase.auth.getUser()

  const kayit = {
    client_id: clientId,
    sender: 'admin',
    sender_name: senderName || null,
    title: title || null,
    message: message.trim(),
    assistant_message: assistantMessage,
    priority,
    action_type: actionType,
    action_label: aksiyon.buton || null,
    action_url: AKSIYON_URL[actionType] || null,
    due_date: dueDate || null,
    related_period: relatedPeriod || null,
    channels,
    created_by: userData?.user?.id || null
  }

  const { data, error } = await supabase
    .from('client_messages')
    .insert(kayit)
    .select()
    .single()

  if (error) {
    console.error('Mesaj kaydedilemedi:', error)
    throw new Error('Mesaj kaydedilemedi: ' + error.message)
  }

  const sonuc = { message: data, whatsapp: null, email: null }

  // WhatsApp (opsiyonel)
  if (channels.includes('whatsapp')) {
    try {
      const { openWhatsAppWeb } = await import('./whatsappService')
      sonuc.whatsapp = { hazir: true, metin: assistantMessage, ac: openWhatsAppWeb }
    } catch (e) {
      console.warn('WhatsApp gönderimi hazırlanamadı:', e.message)
    }
  }

  // E-posta (opsiyonel)
  if (channels.includes('email')) {
    try {
      const { sendEmail } = await import('./whatsappService')
      const { getClientById } = await import('./clientService')
      const client = await getClientById(clientId)
      const adres = client?.email || client?.emails?.[0]?.email
      if (adres) {
        await sendEmail({
          toEmail: adres,
          subject: title || 'MUBİS Asistan - Yeni bildiriminiz var',
          message: assistantMessage
        })
        sonuc.email = { gonderildi: true, adres }
      } else {
        sonuc.email = { gonderildi: false, hata: 'E-posta adresi yok' }
      }
    } catch (e) {
      console.warn('E-posta gönderilemedi:', e.message)
      sonuc.email = { gonderildi: false, hata: e.message }
    }
  }

  return sonuc
}

/** Musteri -> admin cevabi */
export async function replyFromClient({ clientId, message, parentId = null, clientName = '' }) {
  if (!clientId) throw new Error('Müşteri bulunamadı')
  if (!message || !message.trim()) throw new Error('Mesaj boş olamaz')

  const { data, error } = await supabase
    .from('client_messages')
    .insert({
      client_id: clientId,
      sender: 'client',
      sender_name: clientName || null,
      message: message.trim(),
      assistant_message: message.trim(),
      priority: 'normal',
      action_type: 'none',
      channels: ['portal'],
      parent_id: parentId,
      is_read: false
    })
    .select()
    .single()

  if (error) {
    console.error('Cevap gönderilemedi:', error)
    throw new Error('Cevap gönderilemedi: ' + error.message)
  }

  // Admin tarafinda zil bildirimi olustur (tiklayinca Mesaj Merkezi acilir)
  try {
    await supabase.from('notifications').insert({
      client_id: clientId,
      audience: 'admin',
      type: 'client_message',
      title: `Yeni mesaj: ${clientName || 'Müşteri'}`,
      message: message.trim().slice(0, 140),
      route: `/admin/mesaj-merkezi?clientId=${clientId}`,
      metadata: { client_id: clientId, message_id: data?.id },
      is_read: false
    })
  } catch (e) {
    console.warn('Mesaj bildirimi olusturulamadi:', e.message)
  }

  return data
}

/** Bir musterinin tum mesajlari (eskiden yeniye) */
export async function getMessages(clientId, limit = 100) {
  if (!clientId) return []
  try {
    const { data, error } = await supabase
      .from('client_messages')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true })
      .limit(limit)
    if (error) {
      console.warn('Mesajlar yüklenemedi:', error.message)
      return []
    }
    return data || []
  } catch (e) {
    console.warn('Mesajlar yüklenemedi:', e.message)
    return []
  }
}

/** Musterinin okumadigi admin mesaji sayisi */
export async function getUnreadCount(clientId) {
  if (!clientId) return 0
  try {
    const { count, error } = await supabase
      .from('client_messages')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('sender', 'admin')
      .eq('is_read', false)
    if (error) return 0
    return count || 0
  } catch {
    return 0
  }
}

export async function markAsRead(messageId) {
  try {
    await supabase
      .from('client_messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', messageId)
  } catch (e) {
    console.warn('Mesaj okundu işaretlenemedi:', e.message)
  }
}

export async function markAllAsRead(clientId, sender = 'admin') {
  if (!clientId) return
  try {
    const { error } = await supabase
      .from('client_messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('client_id', clientId)
      .eq('sender', sender)
      .eq('is_read', false)
    if (error) console.warn('Mesajlar okundu işaretlenemedi:', error.message)
  } catch (e) {
    console.warn('Mesajlar okundu işaretlenemedi:', e.message)
  }
}

/** Admin gelen kutusu: musterilerden gelen cevaplar */
export async function getAdminInbox({ sadeceOkunmamis = false, limit = 200 } = {}) {
  try {
    let q = supabase
      .from('client_messages')
      .select('*, clients(id, name, company)')
      .eq('sender', 'client')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (sadeceOkunmamis) q = q.eq('is_read', false)
    const { data, error } = await q
    if (error) {
      console.warn('Gelen kutusu yüklenemedi:', error.message)
      return []
    }
    return data || []
  } catch (e) {
    console.warn('Gelen kutusu yüklenemedi:', e.message)
    return []
  }
}

/** Admin icin son mesaj ozetleri (musteri bazinda) */
export async function getMessageSummaryByClient(limit = 300) {
  try {
    const { data, error } = await supabase
      .from('client_messages')
      .select('id, client_id, sender, message, created_at, is_read, priority')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) return {}
    const ozet = {}
    for (const m of data || []) {
      if (!ozet[m.client_id]) {
        ozet[m.client_id] = { sonMesaj: m, okunmamis: 0, toplam: 0 }
      }
      ozet[m.client_id].toplam += 1
      if (m.sender === 'client' && !m.is_read) ozet[m.client_id].okunmamis += 1
    }
    return ozet
  } catch {
    return {}
  }
}

/**
 * Beyan son tarihi yaklasan musteriler icin hazir hatirlatma metni uretir.
 */
export function hatirlatmaMetni({ beyanAdi, sonTarih, kalanGun }) {
  const aciliyet = kalanGun <= 3 ? 'acil' : kalanGun <= 7 ? 'onemli' : 'normal'
  const metin = `${beyanAdi} beyannamenizin son günü ${tarihYaz(sonTarih)}'dir. ` +
    (kalanGun >= 0
      ? `Son tarihe ${kalanGun} gün kaldı. Gerekli belgeleri tarafımıza iletmenizi rica ederiz.`
      : 'Son tarih geçmiştir, lütfen en kısa sürede tarafımıza ulaşınız.')
  return { metin, aciliyet }
}
