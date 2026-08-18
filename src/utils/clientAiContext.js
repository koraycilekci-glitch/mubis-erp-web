// MUBIS Asistan - giris yapmis musteri icin kisisel veri ozeti uretir.
// Uretilen metin api/ai-chat.js'e "context" olarak gonderilir; model bu verilerle
// "KDV odemem ne kadar", "bu ay toplam ne odeyecegim" gibi sorulari yanitlar.

import { getClient, dbToFrontend } from '../services/clientService'
import { getAccountingFee, getPayments, hesaplaBorcOzeti } from '../services/paymentService'
import { getBeyanStorageKey, getFormattedBeyanDeadline, getMonthName } from './dateUtils'
import { getTahakkukList, sumTahakkukTutar, getHizmetListesi } from './tahakkukUtils'

const DURUM_ADI = {
  yapilamadi: 'henüz hazırlanmadı',
  hazir: 'hazırlandı, onay bekliyor',
  onaylandi: 'onaylandı',
  tahakkuk_gonderildi: 'tahakkuk gönderildi',
  gonderildi: 'gönderildi'
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

// Belirli bir takvim (odeme) ayinda son tarihi gelen beyan kalemleri
function ayinKalemleri(yil, ay) {
  const ayinSonGunu = new Date(yil, ay + 1, 0).getDate()
  const kalemler = [
    { type: 'kdv2', ad: 'KDV2 (tevkifat)', gun: 25 },
    { type: 'muhtasar', ad: 'Muhtasar ve Prim Hizmet', gun: 26 },
    { type: 'kdv', ad: 'KDV', gun: 28 },
    { type: 'sgk', ad: 'SGK primi', gun: ayinSonGunu }
  ]
  const geciciDonem = { 1: '4. Dönem', 4: '1. Dönem', 7: '2. Dönem', 10: '3. Dönem' }[ay]
  if (geciciDonem) kalemler.push({ type: 'gecici_vergi', ad: `Geçici Vergi (${geciciDonem})`, gun: 17 })
  if (ay === 2) kalemler.push({ type: 'gelir_vergi', ad: 'Gelir Vergisi', gun: 31 })
  if (ay === 3) kalemler.push({ type: 'kurumlar_vergi', ad: 'Kurumlar Vergisi', gun: 30 })
  return kalemler
}

// Bir ayin ozet satirlari + toplam tutar
function ayOzeti(beyanDurumlari, yil, ay) {
  const satirlar = []
  let toplam = 0

  ayinKalemleri(yil, ay).forEach(k => {
    const storage = getBeyanStorageKey(k.type, yil, ay)
    if (!storage) return
    const key = storage.statusKey

    const tahakkuklar = getTahakkukList(beyanDurumlari, key)
    const tutar = tahakkuklar.length > 0
      ? sumTahakkukTutar(tahakkuklar)
      : (Number(beyanDurumlari[`${key}_tutar`]) || 0)

    const durum = beyanDurumlari[key] || 'yapilamadi'
    // Tutari da durumu da olmayan kalemi yazma
    if (!tutar && durum === 'yapilamadi') return

    const sonOdeme = getFormattedBeyanDeadline(yil, ay, k.gun)
    const donem = `${getMonthName(storage.belongMonth)} ${storage.belongYear} dönemi`

    let satir = `- ${k.ad} (${donem}): `
    satir += tutar > 0 ? `${para(tutar)} TL` : 'tutar henüz belli değil'
    satir += `, son ödeme ${tarihTR(sonOdeme)}, durum: ${DURUM_ADI[durum] || durum}`

    if (tahakkuklar.length > 1) {
      satir += ` (${tahakkuklar.length} ayrı tahakkuk: ${tahakkuklar.map(t => para(t.tutar) + ' TL').join(' + ')})`
    }

    // Belge linkleri: musteriye yalnizca tahakkuk fisi; SGK'da ek olarak hizmet listesi.
    const linkler = []
    tahakkuklar.forEach((t, i) => {
      if (t.url) linkler.push(`[${k.ad} tahakkuku${tahakkuklar.length > 1 ? ' ' + (i + 1) : ''}](${t.url})`)
    })
    if (k.type === 'sgk') {
      getHizmetListesi(beyanDurumlari, key).forEach((h, i) => {
        linkler.push(`[SGK hizmet listesi${i > 0 ? ' ' + (i + 1) : ''}](${h.url})`)
      })
    }
    if (linkler.length > 0) satir += `\n  Belgeler: ${linkler.join(' , ')}`

    satirlar.push(satir)
    toplam += tutar
  })

  return { satirlar, toplam }
}

/**
 * Giris yapmis musteri icin yapay zekaya gonderilecek ozet metni uretir.
 * @param {number} clientId
 * @returns {Promise<string>} bos string = veri bulunamadi
 */
export async function buildClientAiContext(clientId) {
  if (!clientId) return ''

  const [dbClient, fee, payments] = await Promise.all([
    getClient(clientId).catch(() => null),
    getAccountingFee(clientId).catch(() => null),
    getPayments(clientId).catch(() => [])
  ])

  const client = dbToFrontend(dbClient)
  if (!client) return ''

  const beyanDurumlari = client.beyanDurumlari || {}
  const bugun = new Date()
  const yil = bugun.getFullYear()
  const ay = bugun.getMonth()

  const bolumler = []

  bolumler.push(`MUSTERI: ${client.company || client.name || ''}
Vergi no / TCKN: ${client.vkn || client.taxNo || client.tc || '-'}
Vergi dairesi: ${client.taxOffice || '-'}
Mükellef tipi: ${client.type === 'sahis' || client.tc ? 'Gelir vergisi (şahıs)' : 'Kurumlar vergisi (şirket)'}
Bugünün tarihi: ${bugun.toLocaleDateString('tr-TR')}`)

  // Mali musavirlik ucreti / borc
  if (fee) {
    const b = hesaplaBorcOzeti(fee, payments, bugun)
    bolumler.push(`MALI MÜŞAVİRLİK (muhasebe) ÜCRETİ:
Aylık ücret: ${para(b.aylikUcret)} TL
Önceki dönem devir borcu: ${para(b.oncekiDonem)} TL
Defter tasdik ücreti: ${para(b.defterTasdik)} TL
Tahakkuk eden toplam (${b.gecenAy} ay): ${para(b.toplamBorc)} TL
Yapılan ödemeler: ${para(b.toplamOdeme)} TL
KALAN MUHASEBE BORCU: ${para(b.kalanBorc)} TL${b.sonOdeme ? `\nSon ödeme yaptığı tarih: ${tarihTR(b.sonOdeme)}` : ''}`)
  }

  // Vergi / SGK tahakkuklari: gecen ay, bu ay, gelecek ay
  const aylar = [
    { yil: ay === 0 ? yil - 1 : yil, ay: ay === 0 ? 11 : ay - 1, etiket: 'GEÇEN AY' },
    { yil, ay, etiket: 'BU AY' },
    { yil: ay === 11 ? yil + 1 : yil, ay: ay === 11 ? 0 : ay + 1, etiket: 'GELECEK AY' }
  ]

  const vergiBolumleri = []
  aylar.forEach(a => {
    const { satirlar, toplam } = ayOzeti(beyanDurumlari, a.yil, a.ay)
    if (satirlar.length === 0) return
    vergiBolumleri.push(`[${getMonthName(a.ay)} ${a.yil} - ${a.etiket}] (bu ay ödenecek vergi/SGK)
${satirlar.join('\n')}
${a.etiket} TOPLAM VERGİ+SGK: ${para(toplam)} TL`)
  })

  if (vergiBolumleri.length > 0) {
    bolumler.push(`VERGİ VE SGK TAHAKKUKLARI:
(Tarihler ödemenin yapılacağı tarihtir; parantezteki dönem beyanın ait olduğu aydır.)
${vergiBolumleri.join('\n\n')}`)
  } else {
    bolumler.push('VERGİ VE SGK TAHAKKUKLARI: Sistemde bu döneme ait yüklenmiş tahakkuk bulunmuyor.')
  }

  bolumler.push(`NOT: Vergi/SGK tutarları tahakkuk belgelerinden okunmuştur; ödenip ödenmediği bilgisi
sistemde tutulmaz. Muhasebe ücreti borcu ise ödemeler düşülerek hesaplanmıştır.`)

  // Genel belgeler (vergi levhasi, imza sirkuleri, gazete vb.)
  const docs = dbClient?.client_documents || client.clientDocuments || {}
  const belgeLinkleri = []
  const vl = docs?.mali_veriler?.vergi_levhasi
  if (vl?.url) belgeLinkleri.push(`- Vergi levhası: [Vergi Levhası](${vl.url})`)

  const maliEvraklar = docs?.mali_evraklar || {}
  Object.entries(maliEvraklar).forEach(([kategori, icerik]) => {
    if (icerik?.url) {
      belgeLinkleri.push(`- ${kategori}: [${icerik.name || kategori}](${icerik.url})`)
    } else if (icerik && typeof icerik === 'object') {
      Object.values(icerik).forEach(d => {
        if (d?.url) belgeLinkleri.push(`- ${kategori}: [${d.name || kategori}](${d.url})`)
      })
    }
  })

  if (belgeLinkleri.length > 0) {
    bolumler.push(`MÜŞTERİNİN BELGELERİ (indirilebilir bağlantılar):
${belgeLinkleri.join('\n')}`)
  }

  bolumler.push(`BELGE LİNKİ KURALI: Kullanıcı bir belgeyi isterse (vergi levhası, KDV/SGK tahakkuku,
hizmet listesi vb.) yukarıdaki listede o belgenin bağlantısı varsa cevabında aynen
[Belge Adı](https://...) markdown biçiminde ver ki kullanıcı tıklayıp açabilsin.
Müşteriye asla beyanname linki verme; yalnızca tahakkuk fişi ve SGK hizmet listesi linki ver.
Listede olmayan bir belge için link uydurma; "bu belge henüz sisteme yüklenmemiş" de.`)

  return bolumler.join('\n\n')
}
