// Kira yenileme talebi akisi
// Musteri yeni net kirayi bildirir -> mali musavir onaylar -> kira bilgileri guncellenir.

import { getClient, updateClient, dbToFrontend } from './clientService'
import { parseKiraBilgisi, yeniDonemTarihleri, paraTR, tarihTR } from '../utils/kiraUtils'
import { parseTurkishNumber } from '../utils/numberFormat'
import * as kiraArtisService from './kiraArtisService'
import { supabase } from '../lib/supabase'

export async function getKiraTalebi(clientId) {
  const client = await getClient(clientId)
  const kira = parseKiraBilgisi(client)
  return kira?.kiraDegisikligiTalebi || null
}

export async function submitKiraTalebi(clientId, payload) {
  const client = await getClient(clientId)
  const kira = parseKiraBilgisi(client)
  const nextKira = {
    ...kira,
    kiraDegisikligiTalebi: {
      ...payload,
      durum: 'bekliyor',
      olusturmaTarihi: new Date().toISOString(),
      talepTarihi: new Date().toISOString()
    }
  }
  const updated = await updateClient(clientId, { kiraBilgisi: nextKira })
  const clientName = client?.name || client?.company || client?.shortName || `Müşteri #${clientId}`
  const { error: notificationError } = await supabase.from('notifications').insert({
    client_id: clientId,
    type: 'kira_yenileme',
    title: 'Yeni kira artışı bildirimi',
    message: `${clientName} yeni kira tutarını onayınıza gönderdi.`,
    route: `/admin/client/${clientId}?tab=kira`,
    metadata: {
      client_id: clientId,
      kira_talebi: nextKira.kiraDegisikligiTalebi
    },
    read: false,
    is_read: false,
    okundu: false
  })
  if (notificationError) {
    await supabase.from('notifications').insert({
      client_id: clientId,
      type: 'kira_yenileme',
      title: 'Yeni kira artışı bildirimi',
      message: `${clientName} yeni kira tutarını onayınıza gönderdi.`,
      route: `/admin/client/${clientId}?tab=kira`,
      metadata: { client_id: clientId, kira_talebi: nextKira.kiraDegisikligiTalebi },
      is_read: false
    })
  }
  return dbToFrontend(updated)
}

export async function approveKiraTalebi(clientId, payloadOrReviewer = '', reviewer = '') {
  const client = await getClient(clientId)
  const kira = parseKiraBilgisi(client)
  const payload = payloadOrReviewer && typeof payloadOrReviewer === 'object'
    ? payloadOrReviewer
    : {}
  const talep = {
    ...(kira?.kiraDegisikligiTalebi || {}),
    ...payload
  }
  const onaylayan = typeof payloadOrReviewer === 'string' ? payloadOrReviewer : reviewer
  if (!talep) throw new Error('Onaylanacak kira talebi bulunamadı')

  const netKira = parseTurkishNumber(talep.yeniNetKira)
  const brutKira = parseTurkishNumber(talep.yeniBrutKira)
  const eskiDonem = {
    netKira: Number(kira.netKira || kira.kiraNet || kira.isYeriKirasi || 0) || 0,
    brutKira: Number(kira.brutKira || kira.kiraBrut || 0) || 0,
    kiraBaslangic: kira.kiraBaslangic || kira.kiraBaslangicTarihi || null,
    kiraBitis: kira.kiraBitis || kira.kiraBitisTarihi || null,
    stopaj: kira.stopaj || null,
    isyeriSahipleri: Array.isArray(kira.isyeriSahipleri) ? kira.isyeriSahipleri : [],
    evSahipleri: Array.isArray(kira.evSahipleri) ? kira.evSahipleri : [],
    kayitTarihi: new Date().toISOString(),
    kaynak: 'kira_yenileme_onayi'
  }
  const kiraGecmisi = Array.isArray(kira.kiraGecmisi) ? kira.kiraGecmisi : []
  const updatedKira = {
    ...kira,
    netKira: netKira || kira.netKira || 0,
    brutKira: brutKira || kira.brutKira || 0,
    kiraBaslangic: talep.yeniBaslangic || kira.kiraBaslangic,
    kiraBitis: talep.yeniBitis || kira.kiraBitis,
    kiraBaslangicTarihi: talep.yeniBaslangic || kira.kiraBaslangicTarihi,
    kiraBitisTarihi: talep.yeniBitis || kira.kiraBitisTarihi,
    kiraGecmisi: eskiDonem.netKira > 0 || eskiDonem.brutKira > 0
      ? [...kiraGecmisi, eskiDonem]
      : kiraGecmisi,
    kiraDegisikligiTalebi: {
      ...talep,
      durum: 'onaylandi',
      onaylayan,
      onayTarihi: new Date().toISOString()
    }
  }
  const updated = await updateClient(clientId, { kiraBilgisi: updatedKira })
  return dbToFrontend(updated)
}

export async function rejectKiraTalebi(clientId, reviewer = '', reason = '') {
  const client = await getClient(clientId)
  const kira = parseKiraBilgisi(client)
  const talep = kira?.kiraDegisikligiTalebi
  if (!talep) throw new Error('Reddedilecek kira talebi bulunamadı')
  const updatedKira = {
    ...kira,
    kiraDegisikligiTalebi: {
      ...talep,
      durum: 'reddedildi',
      onaylayan: reviewer,
      redNedeni: reason,
      onayTarihi: new Date().toISOString()
    }
  }
  const updated = await updateClient(clientId, { kiraBilgisi: updatedKira })
  return dbToFrontend(updated)
}

export { yeniDonemTarihleri, paraTR, tarihTR }

export const kiraArtisBildirimleriniOlustur = kiraArtisService.kiraArtisBildirimleriniOlustur
export const kiraArtisiYanitiniKaydet = kiraArtisService.kiraArtisiYanitiniKaydet
export const kiraArtisiTalebiOlustur = kiraArtisService.kiraArtisiTalebiOlustur
export const adminKiraArtisiOnayla = kiraArtisService.adminKiraArtisiOnayla
export const kiraYenilemeTalebiOlustur = async (clientId, payload) => {
  const client = await getClient(clientId)
  const kira = parseKiraBilgisi(client)
  const donem = yeniDonemTarihleri(kira)
  return submitKiraTalebi(clientId, {
    ...payload,
    yeniBaslangic: payload?.yeniBaslangic || donem.baslangic,
    yeniBitis: payload?.yeniBitis || donem.bitis
  })
}
export const kiraTalebiOnayla = approveKiraTalebi
export const kiraTalebiReddet = (clientId, reason = '', reviewer = '') => (
  rejectKiraTalebi(clientId, reviewer, reason)
)