import { supabase } from '../lib/supabase'
import { kiraArtisBildirimDurumu, kiraSayisi } from '../utils/kiraUtils'

const KIRA_TALEP_TIPI = 'kira_artisi'

const parseKira = (client) => {
  const raw = client?.kiraBilgisi ?? client?.kira_bilgisi ?? {}
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return {}
    }
  }
  return raw || {}
}

const clientName = (client) => client?.name || client?.unvan || client?.company || `Müşteri #${client?.id}`

const buildNotification = (client, durum) => {
  const name = clientName(client)
  return {
    baslik: `Kira artışınıza ${durum.kalanGun} gün kaldı`,
    mesaj: `${name} için kira artış tarihi yaklaşıyor. Yeni kira belli ise tıklayarak bildirebilirsiniz.`,
    actionLabel: 'Yeni kirayı bildir'
  }
}

export async function kiraArtisBildirimleriniOlustur(clients = []) {
  const adaylar = clients
    .map((client) => ({ client, durum: kiraArtisBildirimDurumu(parseKira(client)) }))
    .filter(({ durum }) => durum)

  if (adaylar.length === 0) return []

  const clientIds = adaylar.map(({ client }) => client.id).filter(Boolean)
  const { data: mevcut, error: mevcutError } = await supabase
    .from('notifications')
    .select('client_id, metadata')
    .eq('type', KIRA_TALEP_TIPI)
    .in('client_id', clientIds)

  if (mevcutError && !String(mevcutError.message || '').includes('does not exist')) throw mevcutError

  const mevcutAnahtarlar = new Set((mevcut || []).map((item) => item.metadata?.bildirimAnahtari).filter(Boolean))
  const yeni = adaylar
    .filter(({ client, durum }) => !mevcutAnahtarlar.has(`${client.id}:${durum.kod}:${durum.bitisTarihi}`))
    .map(({ client, durum }) => {
      const metin = buildNotification(client, durum)
      return {
        client_id: client.id,
        type: KIRA_TALEP_TIPI,
        title: metin.baslik,
        message: metin.mesaj,
        is_read: false,
        okundu: false,
        route: `/admin/client/${client.id}?tab=kira`,
        metadata: {
          bildirimAnahtari: `${client.id}:${durum.kod}:${durum.bitisTarihi}`,
          durum: durum.kod,
          kalanGun: durum.kalanGun,
          bitisTarihi: durum.bitisTarihi,
          action: 'kira_artisi_yanitla',
          actionLabel: metin.actionLabel
        }
      }
    })

  if (yeni.length === 0) return []
  const { data, error } = await supabase.from('notifications').insert(yeni).select()
  if (error) {
    const fallback = yeni.map(({ client_id, title, message, route, metadata }) => ({
      client_id,
      type: KIRA_TALEP_TIPI,
      title,
      message,
      route,
      metadata
    }))
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('notifications')
      .insert(fallback)
      .select()
    if (fallbackError) throw fallbackError
    return fallbackData || []
  }
  return data || []
}

export async function kiraArtisiYanitiniKaydet({ clientId, yanit, yeniNetKira, yeniBrutKira, aciklama = '' }) {
  const kiraYanit = yanit === 'var'
  const payload = {
    client_id: clientId,
    type: KIRA_TALEP_TIPI,
    title: kiraYanit ? 'Kira artışı bildirildi' : 'Kira artışı yok',
    message: kiraYanit
      ? 'Müşterinin bildirdiği yeni kira tutarı admin onayına gönderildi.'
      : 'Müşteri bu dönem kira artışı olmadığını bildirdi.',
    is_read: false,
    okundu: false,
    route: `/admin/client/${clientId}?tab=kira`,
    metadata: {
      yanit,
      yeniNetKira: kiraYanit ? kiraSayisi(yeniNetKira) : null,
      yeniBrutKira: kiraYanit ? kiraSayisi(yeniBrutKira) : null,
      aciklama,
      durum: 'musteri_yanitladi',
      adminOnayi: 'bekliyor'
    }
  }
  const { data, error } = await supabase.from('notifications').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function kiraArtisiTalebiOlustur({ clientId, yeniNetKira, yeniBrutKira = 0, aciklama = '', clientName = '' }) {
  const net = kiraSayisi(yeniNetKira)
  if (net <= 0) throw new Error('Yeni kira tutarı geçerli olmalıdır.')

  const { data, error } = await supabase
    .from('notifications')
    .insert({
      client_id: clientId,
      type: KIRA_TALEP_TIPI,
      title: 'Kira artışı bildirildi',
      message: `${clientName || `Müşteri #${clientId}`} yeni kira tutarını admin onayına gönderdi.`,
      route: `/admin/client/${clientId}?tab=kira`,
      is_read: false,
      okundu: false,
      metadata: {
        yanit: 'var',
        yeniNetKira: net,
        yeniBrutKira: kiraSayisi(yeniBrutKira),
        aciklama,
        durum: 'musteri_yanitladi',
        adminOnayi: 'bekliyor'
      }
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function adminKiraArtisiOnayla(notification) {
  const metadata = notification?.metadata || {}
  if (metadata.yanit !== 'var') {
    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true, metadata: { ...metadata, adminOnayi: 'onaylandi' } })
      .eq('id', notification.id)
      .select()
      .single()
    if (error) throw error
    return data
  }

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, name, company, kira_bilgisi')
    .eq('id', notification.client_id)
    .single()
  if (clientError) throw clientError

  const kira = parseKira(client)
  const yeniNet = Number(metadata.yeniNetKira) || 0
  const yeniBrut = Number(metadata.yeniBrutKira) || 0
  const eskiDonem = {
    netKira: Number(kira.netKira || kira.kiraNet || kira.isYeriKirasi || 0) || 0,
    brutKira: Number(kira.brutKira || kira.kiraBrut || 0) || 0,
    kiraBaslangic: kira.kiraBaslangic || kira.kiraBaslangicTarihi || null,
    kiraBitis: kira.kiraBitis || kira.kiraBitisTarihi || null,
    stopaj: kira.stopaj || null,
    isyeriSahipleri: Array.isArray(kira.isyeriSahipleri) ? kira.isyeriSahipleri : [],
    evSahipleri: Array.isArray(kira.evSahipleri) ? kira.evSahipleri : [],
    kayitTarihi: new Date().toISOString(),
    kaynak: 'kira_artisi_onayi'
  }
  const kiraGecmisi = Array.isArray(kira.kiraGecmisi) ? kira.kiraGecmisi : []
  const guncelKira = {
    ...kira,
    netKira: yeniNet || kira.netKira || 0,
    brutKira: yeniBrut || kira.brutKira || 0,
    kiraGecmisi: eskiDonem.netKira > 0 || eskiDonem.brutKira > 0
      ? [...kiraGecmisi, eskiDonem]
      : kiraGecmisi,
    kiraDegisikligiTalebi: {
      ...(kira.kiraDegisikligiTalebi || {}),
      durum: 'onaylandi',
      onayTarihi: new Date().toISOString()
    },
    kiraDegisikligiOnayTarihi: new Date().toISOString(),
    kiraDegisikligiOnaylandi: true
  }
  const { error: updateError } = await supabase
    .from('clients')
    .update({ kira_bilgisi: JSON.stringify(guncelKira) })
    .eq('id', notification.client_id)
  if (updateError) throw updateError

  const { data, error } = await supabase
    .from('notifications')
    .update({ is_read: true, metadata: { ...metadata, adminOnayi: 'onaylandi' } })
    .eq('id', notification.id)
    .select()
    .single()
  if (error) throw error
  return data
}