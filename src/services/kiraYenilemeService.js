import { supabase } from '../lib/supabase'

function safeParseJson(val) {
  if (val === null || val === undefined) return {}
  if (typeof val === 'object') return val
  if (typeof val === 'string' && val.trim()) {
    try {
      const parsed = JSON.parse(val)
      // Cift katmanli string JSON icin (text kolonuna iki kez JSON.stringify atilmis olabilir)
      if (typeof parsed === 'string') return safeParseJson(parsed)
      return parsed
    } catch { return {} }
  }
  return {}
}

function stringifyKiraBilgisi(kb) {
  if (kb && typeof kb === 'object') return JSON.stringify(kb)
  if (typeof kb === 'string') return kb
  return '{}'
}

const KIRA_STOPAJ_ORANI = 0.20

function trDateToIso(str) {
  if (!str) return null
  if (str.match(/^\d{4}-\d{2}-\d{2}$/)) return str
  if (str.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
    const [g, a, y] = str.split('.')
    return `${y}-${a}-${g}`
  }
  return null
}

function formatTrDate(iso) {
  if (!iso) return ''
  const [y, a, g] = iso.split('-')
  return `${g}.${a}.${y}`
}

function addOneYear(iso) {
  if (!iso) return null
  const [y, a, g] = iso.split('-').map(Number)
  const d = new Date(y + 1, a - 1, g)
  // 29 Subat kontrolu
  if (a === 2 && g === 29 && d.getMonth() !== 1) {
    d.setDate(28)
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(iso, days) {
  if (!iso) return null
  const [y, a, g] = iso.split('-').map(Number)
  const d = new Date(y, a - 1, g)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseNumber(val) {
  if (val === '' || val === null || val === undefined) return 0
  if (typeof val === 'number') return val
  return Number(String(val).replace(/\./g, '').replace(',', '.')) || 0
}

export async function getPendingRenewals(clientId) {
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('kira_yenileme')
    .select('*')
    .eq('client_id', clientId)
    .eq('durum', 'bekliyor')
    .or(`erteleme_tarihi.is.null,erteleme_tarihi.lte.${today}`)
    .order('bitis_tarihi', { ascending: true })
  if (error) throw error
  return data || []
}

export async function postponeRenewal({ id, gun }) {
  const { data: renewal, error: fetchErr } = await supabase
    .from('kira_yenileme')
    .select('*, clients(id, name, office_id)')
    .eq('id', id)
    .single()
  if (fetchErr) throw fetchErr
  if (!renewal) throw new Error('Yenileme kaydi bulunamadi')

  const clientId = renewal.client_id
  const officeId = renewal.office_id || renewal.clients?.office_id

  const ertelemeTarihi = new Date()
  ertelemeTarihi.setDate(ertelemeTarihi.getDate() + gun)
  const isoDate = ertelemeTarihi.toISOString().split('T')[0]

  const { error: updErr } = await supabase
    .from('kira_yenileme')
    .update({
      durum: 'ertelendi',
      erteleme_gunu: gun,
      erteleme_tarihi: isoDate
    })
    .eq('id', id)
  if (updErr) throw updErr

  await supabase.from('client_messages').insert({
    client_id: clientId,
    office_id: officeId,
    sender: 'client',
    message: `Kira yenileme konusu ${gun} gun ertelendi. ${isoDate} tarihinde tekrar hatirlatma gonderilecek.`,
    is_read: false,
    metadata: { type: 'kira_yenileme_erteleme', renewal_id: id, gun }
  })

  return { success: true, ertelemeTarihi: isoDate }
}

export async function getRenewalsForAdmin(clientId) {
  const { data, error } = await supabase
    .from('kira_yenileme')
    .select('*')
    .eq('client_id', clientId)
    .in('durum', ['musteri_cevaplandi', 'ertelendi', 'onaylandi', 'uzatildi', 'reddedildi'])
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function replyRenewal({ id, yeniNetKira, artisYok }) {
  // Mevcut kaydi ve musteri bilgisini al
  const { data: renewal, error: fetchErr } = await supabase
    .from('kira_yenileme')
    .select('*, clients(id, name, office_id)')
    .eq('id', id)
    .single()
  if (fetchErr) throw fetchErr
  if (!renewal) throw new Error('Yenileme kaydi bulunamadi')

  const clientId = renewal.client_id
  const officeId = renewal.office_id || renewal.clients?.office_id

  let updateData = { durum: 'musteri_cevaplandi' }
  let message = ''

  if (artisYok) {
    updateData = { ...updateData, artis_yok: true, yeni_net_kira: null }
    message = `Kira artisi olmadigi bildirildi. Mevcut kiranin 1 yil uzatilmasi talep edildi. Bitis: ${formatTrDate(renewal.bitis_tarihi)}`
  } else {
    const numeric = parseNumber(yeniNetKira)
    if (numeric <= 0) throw new Error('Gecerli bir net kira tutari giriniz.')
    updateData = { ...updateData, yeni_net_kira: numeric, artis_yok: false }
    message = `Yeni net kira ${numeric.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL olarak bildirildi. Onayinizi bekliyor. Bitis: ${formatTrDate(renewal.bitis_tarihi)}`
  }

  const { error: updErr } = await supabase
    .from('kira_yenileme')
    .update(updateData)
    .eq('id', id)
  if (updErr) throw updErr

  // Admin icin bildirim
  const { error: notifErr } = await supabase.from('notifications').insert({
    client_id: clientId,
    type: 'kira_yenileme',
    title: 'Kira yenileme cevabi geldi',
    message: `${renewal.clients?.name || 'Musteri'} - ${message}`,
    audience: 'admin',
    route: `/admin/client/${clientId}?tab=kira`,
    metadata: { renewal_id: id, cevap: artisYok ? 'uzatma' : 'yeni_kira' }
  })
  if (notifErr) console.error('Kira yenileme admin bildirim hatasi:', notifErr)

  // Admin mesaj merkezine dusur
  const { error: msgErr } = await supabase.from('client_messages').insert({
    client_id: clientId,
    sender: 'client',
    message,
    is_read: false,
    action_type: 'kira_yenileme_cevap',
    action_label: 'Incele',
    action_url: `/admin/client/${clientId}?tab=kira`
  })
  if (msgErr) console.error('Kira yenileme client_messages hatasi:', msgErr)

  return { success: true }
}

export async function approveRenewal(id) {
  const { data: renewal, error: fetchErr } = await supabase
    .from('kira_yenileme')
    .select('*, clients(id, kira_bilgisi, name)')
    .eq('id', id)
    .single()
  if (fetchErr) throw fetchErr
  if (!renewal) throw new Error('Yenileme kaydi bulunamadi')
  if (renewal.durum !== 'musteri_cevaplandi' || !renewal.yeni_net_kira) {
    throw new Error('Bu kayit onaylanmaya uygun degil.')
  }

  const clientId = renewal.client_id

  // Musteri bilgisini yeniden ve guvenli sekilde al
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('id, kira_bilgisi')
    .eq('id', clientId)
    .single()
  if (clientErr) throw new Error('Musteri bilgisi alinamadi: ' + clientErr.message)
  if (!client) throw new Error('Musteri bulunamadi')

  const rawKb = safeParseJson(client.kira_bilgisi)
  if (!rawKb || typeof rawKb !== 'object') {
    throw new Error('Musteri kira bilgisi okunamadi.')
  }
  const kb = { ...rawKb }
  const sahipler = Array.isArray(kb.isyeriSahipleri) ? [...kb.isyeriSahipleri] : []
  if (!sahipler.length) {
    throw new Error('Isyeri sahibi listesi bos.')
  }

  const sahipIndex = renewal.sahip_index ?? 0
  const sahip = sahipler[sahipIndex]
  if (!sahip) {
    throw new Error(`Isyeri sahibi bulunamadi (index: ${sahipIndex}, toplam: ${sahipler.length}).`)
  }

  const eskiBitis = trDateToIso(sahip.kiraBitis) || renewal.bitis_tarihi
  if (!eskiBitis) {
    throw new Error('Mevcut kira bitis tarihi bulunamadi.')
  }

  // Onceki donemi gecmise kaydet
  const gecmis = Array.isArray(kb.kiraGecmisi) ? [...kb.kiraGecmisi] : []
  gecmis.push({
    kiraBaslangic: sahip.kiraBaslangic,
    kiraBitis: sahip.kiraBitis,
    netKira: sahip.netKira,
    brutKira: sahip.brutKira,
    isyeriSahipleri: JSON.parse(JSON.stringify(sahipler)),
    kayitTarihi: new Date().toISOString().slice(0, 10),
    aciklama: 'Kira artisi onayi'
  })

  const yeniBaslangic = addDays(eskiBitis, 1)
  const yeniBitis = addOneYear(eskiBitis)
  const yeniNet = Number(renewal.yeni_net_kira)
  const yeniBrut = yeniNet / (1 - KIRA_STOPAJ_ORANI)

  sahip.netKira = yeniNet.toFixed(2)
  sahip.brutKira = yeniBrut.toFixed(2)
  sahip.kiraBaslangic = yeniBaslangic
  sahip.kiraBitis = yeniBitis

  const yeniKiraBilgisi = stringifyKiraBilgisi({ ...kb, isyeriSahipleri: sahipler, kiraGecmisi: gecmis })

  const { error: updErr } = await supabase
    .from('clients')
    .update({ kira_bilgisi: yeniKiraBilgisi })
    .eq('id', clientId)
  if (updErr) throw new Error('Kira bilgisi kaydedilemedi: ' + updErr.message)

  // Kaydedilen veriyi dogrula
  const { data: dogrula, error: dogrulaErr } = await supabase
    .from('clients')
    .select('kira_bilgisi')
    .eq('id', clientId)
    .single()
  if (dogrulaErr) console.error('Kira bilgisi dogrulama hatasi:', dogrulaErr)
  else {
    const dogrulaKb = safeParseJson(dogrula.kira_bilgisi)
    const dogrulaSahip = dogrulaKb?.isyeriSahipleri?.[sahipIndex]
    if (dogrulaSahip?.kiraBitis !== yeniBitis) {
      console.warn('Kira bilgisi dogrulama uyumsuz:', { beklenen: yeniBitis, gercek: dogrulaSahip?.kiraBitis })
    }
  }

  const { error: durumErr } = await supabase
    .from('kira_yenileme')
    .update({ durum: 'onaylandi' })
    .eq('id', id)
  if (durumErr) throw new Error('Yenileme durumu guncellenemedi: ' + durumErr.message)

  // Musteriye onay bilgisi mesaji gonder
  const { error: clientMsgErr } = await supabase.from('client_messages').insert({
    client_id: clientId,
    sender: 'admin',
    message: `Kira yenileme talebiniz onaylandi. Yeni net kira: ${yeniNet.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL, brüt kira: ${yeniBrut.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL. Yeni dönem: ${formatTrDate(yeniBaslangic)} - ${formatTrDate(yeniBitis)}`,
    is_read: false
  })
  if (clientMsgErr) console.error('Kira yenileme onay musteri mesaj hatasi:', clientMsgErr)

  return { success: true, yeniBaslangic, yeniBitis, yeniNet, yeniBrut }
}

export async function extendRenewal(id) {
  const { data: renewal, error: fetchErr } = await supabase
    .from('kira_yenileme')
    .select('*, clients(id, kira_bilgisi, name)')
    .eq('id', id)
    .single()
  if (fetchErr) throw fetchErr
  if (!renewal) throw new Error('Yenileme kaydi bulunamadi')
  if (renewal.durum !== 'musteri_cevaplandi' || !renewal.artis_yok) {
    throw new Error('Bu kayit uzatilmaya uygun degil.')
  }

  const clientId = renewal.client_id

  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('id, kira_bilgisi')
    .eq('id', clientId)
    .single()
  if (clientErr) throw new Error('Musteri bilgisi alinamadi: ' + clientErr.message)
  if (!client) throw new Error('Musteri bulunamadi')

  const rawKb2 = safeParseJson(client.kira_bilgisi)
  if (!rawKb2 || typeof rawKb2 !== 'object') {
    throw new Error('Musteri kira bilgisi okunamadi.')
  }
  const kb = { ...rawKb2 }
  const sahipler = Array.isArray(kb.isyeriSahipleri) ? [...kb.isyeriSahipleri] : []
  if (!sahipler.length) {
    throw new Error('Isyeri sahibi listesi bos.')
  }

  const sahipIndex = renewal.sahip_index ?? 0
  const sahip = sahipler[sahipIndex]
  if (!sahip) {
    throw new Error(`Isyeri sahibi bulunamadi (index: ${sahipIndex}, toplam: ${sahipler.length}).`)
  }

  const eskiBitis = trDateToIso(sahip.kiraBitis) || renewal.bitis_tarihi
  if (!eskiBitis) {
    throw new Error('Mevcut kira bitis tarihi bulunamadi.')
  }

  // Onceki donemi gecmise kaydet
  const gecmis2 = Array.isArray(kb.kiraGecmisi) ? [...kb.kiraGecmisi] : []
  gecmis2.push({
    kiraBaslangic: sahip.kiraBaslangic,
    kiraBitis: sahip.kiraBitis,
    netKira: sahip.netKira,
    brutKira: sahip.brutKira,
    isyeriSahipleri: JSON.parse(JSON.stringify(sahipler)),
    kayitTarihi: new Date().toISOString().slice(0, 10),
    aciklama: 'Kira artisi olmadan 1 yil uzatma onayi'
  })

  const yeniBaslangic = addDays(eskiBitis, 1)
  const yeniBitis = addOneYear(eskiBitis)

  sahip.kiraBaslangic = yeniBaslangic
  sahip.kiraBitis = yeniBitis

  const { error: updErr2 } = await supabase
    .from('clients')
    .update({ kira_bilgisi: stringifyKiraBilgisi({ ...kb, isyeriSahipleri: sahipler, kiraGecmisi: gecmis2 }) })
    .eq('id', clientId)
  if (updErr2) throw new Error('Kira bilgisi kaydedilemedi: ' + updErr2.message)

  const { error: durumErr } = await supabase
    .from('kira_yenileme')
    .update({ durum: 'uzatildi' })
    .eq('id', id)
  if (durumErr) throw new Error('Yenileme durumu guncellenemedi: ' + durumErr.message)

  // Musteriye uzatma bilgisi mesaji gonder
  const { error: clientMsgErr } = await supabase.from('client_messages').insert({
    client_id: clientId,
    sender: 'admin',
    message: `Kira artisi olmadigi bildiriminiz onaylandi. Mevcut kiraniz 1 yil uzatildi. Yeni dönem: ${formatTrDate(yeniBaslangic)} - ${formatTrDate(yeniBitis)}`,
    is_read: false
  })
  if (clientMsgErr) console.error('Kira yenileme uzatma musteri mesaj hatasi:', clientMsgErr)

  return { success: true, yeniBaslangic, yeniBitis }
}

export async function rejectRenewal(id) {
  const { data: renewal, error: fetchErr } = await supabase
    .from('kira_yenileme')
    .select('*, clients(id, name)')
    .eq('id', id)
    .single()
  if (fetchErr) throw fetchErr
  if (!renewal) throw new Error('Yenileme kaydi bulunamadi')

  const { error } = await supabase
    .from('kira_yenileme')
    .update({ durum: 'reddedildi' })
    .eq('id', id)
  if (error) throw error

  const { error: clientMsgErr } = await supabase.from('client_messages').insert({
    client_id: renewal.client_id,
    sender: 'admin',
    message: `Kira yenileme talebiniz reddedildi. Lütfen gerekli goruyorsaniz mali müşavirinizle iletişime geçin.`,
    is_read: false
  })
  if (clientMsgErr) console.error('Kira yenileme red musteri mesaj hatasi:', clientMsgErr)

  return { success: true }
}

export async function resetRenewalStatus(id, yeniDurum) {
  const izinli = ['bekliyor', 'musteri_cevaplandi', 'onaylandi', 'uzatildi', 'reddedildi', 'ertelendi']
  if (!izinli.includes(yeniDurum)) throw new Error('Gecersiz durum')

  const { data: renewal, error: fetchErr } = await supabase
    .from('kira_yenileme')
    .select('*, clients(id, name)')
    .eq('id', id)
    .single()
  if (fetchErr) throw fetchErr
  if (!renewal) throw new Error('Yenileme kaydi bulunamadi')

  const { error } = await supabase
    .from('kira_yenileme')
    .update({ durum: yeniDurum })
    .eq('id', id)
  if (error) throw error

  const durumMetni = {
    bekliyor: 'Bekleme durumuna alindi',
    musteri_cevaplandi: 'Musteri cevabi olarak isaretlendi',
    onaylandi: 'Onaylandi',
    uzatildi: 'Uzatildi',
    reddedildi: 'Reddedildi',
    ertelendi: 'Ertelendi'
  }

  const { error: clientMsgErr } = await supabase.from('client_messages').insert({
    client_id: renewal.client_id,
    sender: 'admin',
    message: `Kira yenileme talebiniz ${durumMetni[yeniDurum].toLowerCase()}.`,
    is_read: false
  })
  if (clientMsgErr) console.error('Kira yenileme durum degisikligi musteri mesaj hatasi:', clientMsgErr)

  return { success: true, durum: yeniDurum }
}

export async function deleteRenewal(id) {
  const { data: renewal, error: fetchErr } = await supabase
    .from('kira_yenileme')
    .select('*, clients(id, name)')
    .eq('id', id)
    .single()
  if (fetchErr) throw fetchErr
  if (!renewal) throw new Error('Yenileme kaydi bulunamadi')

  const { error } = await supabase
    .from('kira_yenileme')
    .delete()
    .eq('id', id)
  if (error) throw error

  const { error: clientMsgErr } = await supabase.from('client_messages').insert({
    client_id: renewal.client_id,
    sender: 'admin',
    message: 'Kira yenileme talebi iptal edildi.',
    is_read: false
  })
  if (clientMsgErr) console.error('Kira yenileme silme musteri mesaj hatasi:', clientMsgErr)

  return { success: true }
}
