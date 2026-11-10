// MUBIS Asistan - cari hesap verilerinden AI baglam metni uretir.
// Musteri kendi carisi icin, admin/personel tum (veya secili) musterilerin
// cari kartlari, bakiyeleri ve cek/senet portfoyunu sorabilir:
// "bu ay tahsilat yapilacak cekleri listele" gibi.

import { supabase } from '../lib/supabase'

const DURUM_ADLARI = {
  'portfoyde': 'Portföyde',
  'tahsil-edildi': 'Tahsil Edildi',
  'odendi': 'Ödendi',
  'ciro-edildi': 'Ciro Edildi',
  'karsiliksiz': 'Karşılıksız',
  'iade-edildi': 'İade Edildi'
}

const TUR_ADLARI = {
  'acilis': 'Açılış Fişi',
  'satis-fatura': 'Satış Faturası',
  'alis-fatura': 'Alış Faturası',
  'tahsilat': 'Tahsilat',
  'odeme': 'Ödeme',
  'manuel-borc': 'Manuel Borç',
  'manuel-alacak': 'Manuel Alacak',
  'muzahat': 'Mahsup / Mutabakat',
  'virman': 'Cari Virmanı'
}

const ODEME_ADLARI = {
  'nakit': 'Nakit',
  'havale-eft': 'Havale/EFT',
  'cek': 'Çek',
  'senet': 'Senet',
  'kredi-karti': 'Kredi Kartı',
  'diger': 'Diğer'
}

function para(n) {
  return Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function tarihTR(iso) {
  if (!iso) return ''
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00')
  if (isNaN(d)) return ''
  return d.toLocaleDateString('tr-TR')
}

function ayAdi(ay) {
  return ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'][ay]
}

/**
 * Cari kartlari ve hareketleri (hizli alanlarla) getirir.
 * @param {number|null} clientId - null ise erisilebilen tum cariler
 */
async function cariVerisiGetir(clientId = null) {
  let kartQ = supabase.from('cari_kartlar')
    .select('id, client_id, kod, unvan, tur, para_birimi, parasal_limit')
    .order('unvan')
  let hrQ = supabase.from('cari_hareketler')
    .select('kart_id, client_id, tarih, vade_tarihi, borc, alacak, odeme_yontemi, cek_senet_durum, islem_turu, belge_no, aciklama')
    .order('tarih', { ascending: false })
    .limit(2000)
  if (clientId) {
    kartQ = kartQ.eq('client_id', clientId)
    hrQ = hrQ.eq('client_id', clientId)
  }
  const [kartlar, hareketler] = await Promise.all([kartQ, hrQ])
  return { kartlar: kartlar.data || [], hareketler: hareketler.data || [] }
}

function bakiyeHesapla(hareketler, kartId) {
  const kh = hareketler.filter(h => h.kart_id === kartId)
  const borc = kh.reduce((s, h) => s + (Number(h.borc) || 0), 0)
  const alacak = kh.reduce((s, h) => s + (Number(h.alacak) || 0), 0)
  return { borc, alacak, bakiye: borc - alacak }
}

/**
 * Cari verilerinden AI baglam metni uretir.
 * @param {number|null} clientId - null = tum erisilebilen cariler
 * @returns {Promise<string>} bos string = cari verisi yok
 */
export async function buildCariAiContext(clientId = null) {
  const { kartlar, hareketler } = await cariVerisiGetir(clientId)
  if (!kartlar.length) return ''

  const bugun = new Date()
  const bugunStr = bugun.toISOString().slice(0, 10)
  const buAyOnEk = bugunStr.slice(0, 7) // YYYY-MM

  const kartAdi = (id) => {
    const k = kartlar.find(x => x.id === id)
    if (!k) return '?'
    return `${k.unvan || k.kod || 'Cari'}${k.kod ? ` (${k.kod})` : ''}`
  }

  const bolumler = []

  // 1) Cari kartlar ve bakiyeler
  const bakiyeSatirlari = kartlar.map(k => {
    const { borc, alacak, bakiye } = bakiyeHesapla(hareketler, k.id)
    let satir = `- ${kartAdi(k.id)}: toplam borç ${para(borc)} TL, toplam alacak ${para(alacak)} TL, BAKİYE ${para(bakiye)} TL`
    if (bakiye > 0) satir += ' (borçlu)'
    else if (bakiye < 0) satir += ' (alacaklı)'
    if (Number(k.parasal_limit) > 0 && bakiye > Number(k.parasal_limit)) {
      satir += ` — UYARI: parasal limit ${para(k.parasal_limit)} TL aşıldı!`
    }
    return satir
  })
  const toplamBakiye = kartlar.reduce((s, k) => s + bakiyeHesapla(hareketler, k.id).bakiye, 0)
  bolumler.push(`CARİ KARTLAR VE BAKİYELER (pozitif bakiye = cari borçlu, negatif = cari alacaklı):
${bakiyeSatirlari.join('\n')}
TOPLAM NET BAKİYE: ${para(toplamBakiye)} TL (borç fazlası)`)

  // 2) Cek/senet portfoyu
  const cs = hareketler
    .filter(h => h.odeme_yontemi === 'cek' || h.odeme_yontemi === 'senet')
    .map(h => ({
      ...h,
      tutar: (Number(h.borc) || 0) + (Number(h.alacak) || 0),
      vade: h.vade_tarihi || h.tarih,
      durum: DURUM_ADLARI[h.cek_senet_durum || 'portfoyde'] || 'Portföyde',
      tur: ODEME_ADLARI[h.odeme_yontemi] || h.odeme_yontemi,
      alinan: (Number(h.alacak) || 0) > 0 // alacak = bizden tahsil edilecek (alinan cek)
    }))
    .sort((a, b) => String(a.vade).localeCompare(String(b.vade)))

  if (cs.length > 0) {
    const portfoyde = cs.filter(k => (k.cek_senet_durum || 'portfoyde') === 'portfoyde')
    const buAyGelen = portfoyde.filter(k => String(k.vade).startsWith(buAyOnEk))
    const gecen = portfoyde.filter(k => k.vade && k.vade < bugunStr)
    const ileri = portfoyde.filter(k => k.vade && k.vade > bugunStr && !String(k.vade).startsWith(buAyOnEk))

    const satir = (k) => `- ${tarihTR(k.vade)} | ${kartAdi(k.kart_id)} | ${k.tur}${k.belge_no ? ` (#${k.belge_no})` : ''} | ${para(k.tutar)} TL`

    const csBolumleri = []
    csBolumleri.push(`BU AY (${ayAdi(bugun.getMonth())} ${bugun.getFullYear()}) VADESİ GELEN, TAHSİL EDİLECEK (ALINAN) ÇEK/SENETLER:
${buAyGelen.filter(k => k.alinan).length ? buAyGelen.filter(k => k.alinan).map(satir).join('\n') : '- yok'}`)
    if (buAyGelen.filter(k => !k.alinan).length > 0) {
      csBolumleri.push(`BU AY VADESİ GELEN, ÖDENECEK (VERİLEN) ÇEK/SENETLER:
${buAyGelen.filter(k => !k.alinan).map(satir).join('\n')}`)
    }
    if (gecen.length > 0) {
      csBolumleri.push(`VADESİ GEÇMİŞ, HÂLEN PORTFÖYDE (ACİL TAKİP):
${gecen.map(satir).join('\n')}`)
    }
    if (ileri.length > 0) {
      csBolumleri.push(`İLERİ VADELİ (PORTFÖYDE):
${ileri.map(satir).join('\n')}`)
    }
    const tahsilToplam = buAyGelen.filter(k => k.alinan).reduce((s, k) => s + k.tutar, 0)
    const odemeToplam = buAyGelen.filter(k => !k.alinan).reduce((s, k) => s + k.tutar, 0)
    const portfoyAlinan = portfoyde.filter(k => k.alinan).reduce((s, k) => s + k.tutar, 0)
    const portfoyVerilen = portfoyde.filter(k => !k.alinan).reduce((s, k) => s + k.tutar, 0)

    bolumler.push(`ÇEK/SENET PORTFÖYÜ (vade sırasına göre):
${csBolumleri.join('\n\n')}
ÖZET: Bu ay tahsil edilecek: ${para(tahsilToplam)} TL, bu ay ödenecek: ${para(odemeToplam)} TL.
Portföyde toplam: alınan ${para(portfoyAlinan)} TL, verilen ${para(portfoyVerilen)} TL.
Tahsil edilmiş/ödemiş/ciro/karşılıksız/iade edilmiş kayıtlar portföy dışıdır.`)
  } else {
    bolumler.push('ÇEK/SENET PORTFÖYÜ: Çek veya senet kaydı bulunmuyor.')
  }

  // 3) Son hareketler
  const sonHareketler = hareketler.slice(0, 10)
  if (sonHareketler.length > 0) {
    bolumler.push(`SON HAREKETLER (en yeni ${sonHareketler.length} kayıt):
${sonHareketler.map(h => {
  const tur = TUR_ADLARI[h.islem_turu] || h.islem_turu
  const tutar = (Number(h.borc) || 0) > 0
    ? `${para(h.borc)} TL borç`
    : `${para(h.alacak)} TL alacak`
  const ekstra = []
  if (h.odeme_yontemi) ekstra.push(ODEME_ADLARI[h.odeme_yontemi] || h.odeme_yontemi)
  if (h.belge_no) ekstra.push('#' + h.belge_no)
  return `- ${tarihTR(h.tarih)} | ${kartAdi(h.kart_id)} | ${tur}${ekstra.length ? ' (' + ekstra.join(', ') + ')' : ''} | ${tutar}${h.aciklama ? ` — ${h.aciklama}` : ''}`
}).join('\n')}`)
  }

  return `CARİ HESAP VERİLERİ (${bugun.toLocaleDateString('tr-TR')} itibarıyla):
${bolumler.join('\n\n')}

YANIT KURALI: Cari hesap sorularını yukarıdaki verilerle yanıtla. Kullanıcı "bu ay tahsilat yapılacak çekler" derse
BU AY VADESİ GELEN, TAHSİL EDİLECEK bölümündekileri listele; tutarları ve carileri aynen kullan.
Veri yoksa "kayıt bulunmuyor" de; tutar veya cari adı uydurma.`
}
