// Kira yenileme talebi akisi
// Musteri yeni net kirayi bildirir -> mali musavir onaylar -> kira bilgileri guncellenir.
// Talep, ayri tablo gerektirmemesi icin clients.kira_bilgisi JSON alani icinde tutulur.

import { getClient, updateClient, dbToFrontend } from './clientService'
import { parseKiraBilgisi, yeniDonemTarihleri, paraTR, tarihTR } from '../utils/kiraUtils'

async function kiraBilgisiniAl(clientId) {
  const db = await getClient(clientId)
  const client = dbToFrontend(db)
  return { client, kb: parseKiraBilgisi(client) }
}

async function kiraBilgisiniKaydet(clientId, kb) {
  await updateClient(clientId, { kiraBilgisi: kb })
  return kb
}

/**
 * Musteri yeni net kira tutarini bildirir.
 * Mali musavire mesaj birakilir (client_messages tablosu yoksa sessizce gecilir).
 */
export async function kiraYenilemeTalebiOlustur(clientId, { yeniNetKira, aciklama = '', clientName = '' }) {
  const tutar = Number(yeniNetKira)
  if (!clientId) throw new Error('Musteri bulunamadi')
  if (!tutar || tutar <= 0) throw new Error('Gecerli bir kira tutari girin')

  const { client, kb } = await kiraBilgisiniAl(clientId)
  const donem = yeniDonemTarihleri(kb)
  const eskiNet = Number(kb.kiraNet || kb.isYeriKirasi || 0) || 0

  kb.yenilemeTalebi = {
    yeniNetKira: tutar,
    eskiNetKira: eskiNet,
    yeniBaslangic: donem.baslangic,
    yeniBitis: donem.bitis,
    aciklama: String(aciklama || '').trim(),
    durum: 'bekliyor',
    talepTarihi: new Date().toISOString()
  }

  await kiraBilgisiniKaydet(clientId, kb)

  // Mali musavire bilgi mesaji
  try {
    const { replyFromClient } = await import('./messageService')
    const artis = eskiNet > 0 ? ` (önceki: ${paraTR(eskiNet)} TL, artış %${(((tutar - eskiNet) / eskiNet) * 100).toFixed(2)})` : ''
    await replyFromClient({
      clientId,
      clientName: clientName || client?.company || client?.name || '',
      message:
        `KİRA YENİLEME BİLDİRİMİ\n` +
        `Yeni net kira tutarı: ${paraTR(tutar)} TL${artis}\n` +
        `Yeni dönem: ${tarihTR(donem.baslangic)} - ${tarihTR(donem.bitis)}` +
        (aciklama ? `\nAçıklama: ${aciklama}` : '') +
        `\n\nOnayınız sonrası kira bilgileri güncellenecektir.`
    })
  } catch (e) {
    console.warn('Kira bildirimi mesaji gonderilemedi:', e?.message || e)
  }

  return kb.yenilemeTalebi
}

/**
 * Mali musavir talebi onaylar: kira tutari ve kontrat tarihleri guncellenir.
 * @param {object} override - { yeniNetKira, yeniBaslangic, yeniBitis } ile duzeltme yapilabilir
 */
export async function kiraTalebiOnayla(clientId, override = {}, onaylayan = '') {
  const { kb } = await kiraBilgisiniAl(clientId)
  const t = kb.yenilemeTalebi
  if (!t) throw new Error('Bekleyen kira yenileme talebi yok')

  const yeniNet = Number(override.yeniNetKira ?? t.yeniNetKira)
  const yeniBaslangic = override.yeniBaslangic || t.yeniBaslangic
  const yeniBitis = override.yeniBitis || t.yeniBitis

  // Gecmis kayit
  kb.gecmis = Array.isArray(kb.gecmis) ? kb.gecmis : []
  kb.gecmis.push({
    netKira: Number(kb.kiraNet || kb.isYeriKirasi || 0) || 0,
    baslangic: kb.kiraBaslangic || null,
    bitis: kb.kiraBitis || null,
    kapanisTarihi: new Date().toISOString()
  })

  // Guncel kira bilgileri
  kb.isYeriKirasi = yeniNet
  kb.kiraNet = yeniNet
  kb.kiraBrut = ''
  kb.kiraBaslangic = yeniBaslangic
  kb.kiraBitis = yeniBitis

  kb.yenilemeTalebi = {
    ...t,
    yeniNetKira: yeniNet,
    yeniBaslangic,
    yeniBitis,
    durum: 'onaylandi',
    onayTarihi: new Date().toISOString(),
    onaylayan
  }

  await kiraBilgisiniKaydet(clientId, kb)

  // Musteriye bilgi mesaji
  try {
    const { sendMessageToClient } = await import('./messageService')
    await sendMessageToClient({
      clientId,
      message:
        `Kira yenileme bildiriminiz onaylandı.\n` +
        `Yeni net kira: ${paraTR(yeniNet)} TL\n` +
        `Yeni kontrat dönemi: ${tarihTR(yeniBaslangic)} - ${tarihTR(yeniBitis)}`,
      priority: 'normal',
      actionType: 'bilgi',
      channels: ['portal']
    })
  } catch (e) {
    console.warn('Kira onay mesaji gonderilemedi:', e?.message || e)
  }

  return kb
}

/** Talebi reddet (kira bilgileri degismez) */
export async function kiraTalebiReddet(clientId, neden = '', reddeden = '') {
  const { kb } = await kiraBilgisiniAl(clientId)
  const t = kb.yenilemeTalebi
  if (!t) throw new Error('Bekleyen kira yenileme talebi yok')

  kb.yenilemeTalebi = {
    ...t,
    durum: 'reddedildi',
    redTarihi: new Date().toISOString(),
    redNedeni: neden,
    reddeden
  }
  await kiraBilgisiniKaydet(clientId, kb)

  try {
    const { sendMessageToClient } = await import('./messageService')
    await sendMessageToClient({
      clientId,
      message: `Kira yenileme bildiriminiz onaylanmadı.${neden ? `\nGerekçe: ${neden}` : ''}\nLütfen mali müşavirinizle görüşün.`,
      priority: 'onemli',
      actionType: 'bilgi',
      channels: ['portal']
    })
  } catch (e) {
    console.warn('Kira red mesaji gonderilemedi:', e?.message || e)
  }

  return kb
}

/** Tum musterilerdeki bekleyen kira yenileme taleplerini listeler (admin) */
export async function getBekleyenKiraTalepleri(clients = []) {
  return clients
    .map(c => {
      const kb = parseKiraBilgisi(c)
      const t = kb.yenilemeTalebi
      if (!t || t.durum !== 'bekliyor') return null
      return { clientId: c.id, client: c, talep: t, kiraBilgisi: kb }
    })
    .filter(Boolean)
}
