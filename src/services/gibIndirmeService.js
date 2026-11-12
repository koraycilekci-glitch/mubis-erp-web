// GIB'den belge indirme koprusu:
// 1. Yerel yardimci programa "tahakkuk-indir" / "beyanname-indir" / "makbuz-indir" isi gonderilir
// 2. Yardimci program Dijital VD'yi acip giris bilgilerini doldurur (kullanici yalniz guvenlik kodu girer)
// 3. Kullanici belgeyi indirdiginde dosya yardimcinin "indirilenler" klasorune duser
// 4. Yeni dosya algilanir, Blob olarak cekilir ve musteri klasorune (Supabase Storage) yuklenir
// 5. beyan_durumlari'na URL yazilir; belge takip ekranlarinda aninda gorunur

import { gibYardimciIs, gibDosyalariListele, gibDosyaGetir, arsivDosyaGetir, musteriGirisBilgileriGetir, edevletKimlikGetir } from '../utils/gibOdemeHelper'
import { uploadClientDocument, uploadMakbuz } from './documentService'
import { extractTahakkukBilgileri } from './tahakkukService'
import { isBusinessDay, getNextVergiWorkDay } from '../utils/dateUtils'
import { getSettings, kayitKlasorleriGetir } from './settingsService'
import { sendDocumentViaWhatsAppChannel, sendEmail } from './whatsappService'
import { supabase } from '../lib/supabase'

const AYLAR_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

/**
 * 2.7.157: Windows tepsisindeki MUBiS simgesi uzerinde balon (konuşma balonu)
 * bildirim gosterir. Yardimci programa /tray-bildir ile gonderilir; tray-host
 * 5 saniye icinde balonu sac altinda gosterir. Yardimci kapaliysa sessiz gecer.
 */
export async function yardimciTrayBildir(baslik, mesaj) {
  try {
    await fetch('http://127.0.0.1:8765/tray-bildir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baslik: String(baslik || 'MUBiS').substring(0, 120), mesaj: String(mesaj || '').substring(0, 400) })
    })
  } catch { /* yardimci kapali — bildirim atlanir */ }
}

const DOSYA_BEKLEME_MS = 6 * 60 * 1000 // kullanici captcha + indirme icin 6 dk
const YOKLAMA_MS = 4000

const IS_ADLARI = {
  gib: {
    tahakkuk: 'tahakkuk-indir',
    beyanname: 'beyanname-indir',
    makbuz: 'makbuz-indir'
  },
  etebligat: {
    tahakkuk: 'eb-tahakkuk-indir',
    beyanname: 'eb-beyanname-indir'
  }
}

/**
 * GIB / e-Bildirge'den belge indirir ve musterinin klasorune yukler.
 * documentType: 'tahakkuk' | 'beyanname' | 'makbuz'
 * sistem: 'gib' (dijital.gib.gov.tr, varsayilan) | 'etebligat' (ebildirge.dib.gov.tr)
 * statusKey: beyan_durumlari anahtari (makbuz icin verilmez)
 * onDurum: (durum: string) => void  — 'yardimci-kontrol' | 'gib-aciliyor' | 'dosya-bekleniyor' | 'yukleniyor'
 */
export async function gibBelgeIndirVeYukle({
  clientId,
  client = null,
  statusKey = null,
  year,
  month,
  beyanType,
  documentType = 'tahakkuk',
  sistem = 'gib',
  onDurum = null
}) {
  onDurum?.('yardimci-kontrol')

  // 1) Is oncesi dosya goruntusu (yeni inen dosyayi ayirt etmek icin)
  let onceki = []
  try { onceki = await gibDosyalariListele() } catch { /* liste alinamadiysa bos basla */ }

  // 2) Musteri kaydi + DVS giris bilgileri (gönderilen client objesi oncelikli)
  let musteri = client
  let giris = null
  if (clientId) {
    try {
      giris = await musteriGirisBilgileriGetir(clientId)
      if (!musteri && giris) musteri = giris
    } catch { /* bilgi yoksa yardimci config.json'a duser */ }
  }
  if (!musteri) throw new Error('Musteri kaydi bulunamadi')

  // 3) Isi gonder
  onDurum?.('gib-aciliyor')
  const isAdi = (IS_ADLARI[sistem] || IS_ADLARI.gib)[documentType] || 'tahakkuk-indir'
  const sonuc = await gibYardimciIs(isAdi, {
    kullaniciKodu: giris?.dvs_username || '',
    parola: giris?.dvs_password || '',
    yil: year,
    ay: month,
    tur: beyanType
  })
  if (!sonuc.ok) throw new Error(sonuc.error || 'Yardimci programa ulasilamadi. Yardimci programin kurulu ve calisir oldugundan emin olun.')

  // 4) Yeni dosya bekle (kullanici guvenlik kodu girip belgeyi indirir)
  onDurum?.('dosya-bekleniyor')
  const t0 = Date.now()
  let yeni = null
  while (Date.now() - t0 < DOSYA_BEKLEME_MS) {
    await new Promise(r => setTimeout(r, YOKLAMA_MS))
    let simdi = []
    try { simdi = await gibDosyalariListele() } catch { continue }
    yeni = simdi.find(f => !onceki.some(o => o.ad === f.ad))
    if (yeni) break
  }
  if (!yeni) {
    throw new Error('Belge indirilemedi (sure doldu). Acilan GIB penceresinde guvenlik kodunu girip belgeyi indirdiginizden emin olun.')
  }

  // 5) Blob'u cek ve Storage'a yukle
  onDurum?.('yukleniyor')
  const blob = await gibDosyaGetir(yeni.ad)
  const ext = /\.xlsx?$/i.test(yeni.ad) ? '.xlsx' : '.pdf'
  const file = new File([blob], yeni.ad || `belge${ext}`, { type: ext === '.xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf' })

  let path = ''
  let url = ''
  if (documentType === 'makbuz') {
    const r = await uploadMakbuz({ client: musteri, name: yeni.ad.replace(/\.[^.]+$/, ''), file })
    path = r.path
    url = r.url
  } else {
    const r = await uploadClientDocument({
      client: musteri,
      year,
      month,
      beyanType,
      documentType,
      file
    })
    path = r.path
    url = r.url
  }

  // 6) beyan_durumlari'na yaz (coklu liste + eski tek URL anahtari)
  if (statusKey) {
    const { data: row, error: readErr } = await supabase
      .from('clients')
      .select('beyan_durumlari')
      .eq('id', musteri.id || clientId)
      .single()
    if (readErr) throw readErr

    const durumlar = { ...(row?.beyan_durumlari || {}) }
    const nowIso = new Date().toISOString()

    if (documentType === 'beyanname') {
      const liste = Array.isArray(durumlar[`${statusKey}_beyanlar`]) ? durumlar[`${statusKey}_beyanlar`] : []
      if (!liste.some(b => b?.url === url)) liste.push({ url, name: yeni.ad, uploadedAt: nowIso })
      durumlar[`${statusKey}_beyanlar`] = liste
      durumlar[`${statusKey}_beyan_url`] = url
    } else if (documentType === 'tahakkuk') {
      const liste = Array.isArray(durumlar[`${statusKey}_tahakkuklar`]) ? durumlar[`${statusKey}_tahakkuklar`] : []
      if (!liste.some(t => t?.url === url)) liste.push({ url, name: yeni.ad, uploadedAt: nowIso, tutar: 0, analiz_durumu: '' })
      durumlar[`${statusKey}_tahakkuklar`] = liste
      durumlar[`${statusKey}_tahakkuk_url`] = url
    }

    const { error: updErr } = await supabase
      .from('clients')
      .update({ beyan_durumlari: durumlar })
      .eq('id', musteri.id || clientId)
    if (updErr) throw updErr
  }

  return { path, url, name: yeni.ad }
}

/**
 * e-Devlet "e-Tebligatlarim"dan belgeleri indirir ve musterinin klasorune yukler.
 * kaynak: 'sgk' | 'vergi' | 'ptt' | 'tumu'
 * Akis: yardimci programa 'etebligat-indir' isi gonderilir -> kullanici e-Devlet
 * guvenlik kodunu girer -> listedeki belgeler indirilenler klasorune duser ->
 * yeni dosyalar musteri klasorune (Storage) yuklenir.
 */
export async function etebligatlariGetirVeYukle({ clientId, client = null, kaynak = 'tumu', onDurum = null }) {
  onDurum?.('yardimci-kontrol')

  let onceki = []
  try { onceki = await gibDosyalariListele() } catch { /* liste alinamadiysa bos basla */ }

  let musteri = client
  let giris = null
  if (clientId) {
    try {
      giris = await musteriGirisBilgileriGetir(clientId)
      if (!musteri && giris) musteri = giris
    } catch { /* bilgi yoksa hata asagida */ }
  }
  if (!musteri) throw new Error('Musteri kaydi bulunamadi')

  // Isaretli ortak varsa onun TC + sifresi, yoksa musterinin kendi bilgileri
  const kimlik = await edevletKimlikGetir(clientId, giris)
  const tc = kimlik.tc || giris?.vkn || giris?.tc || ''
  const edevletSifre = kimlik.edevletPass || giris?.edevlet_pass || ''
  if (!tc || !edevletSifre) {
    throw new Error('e-Devlet giris bilgileri eksik: musteri profilinde TC ve e-Devlet sifresi kayitli olmali')
  }

  onDurum?.('gib-aciliyor')
  const sonuc = await gibYardimciIs('etebligat-indir', { tc, edevletSifre, kaynak })
  if (!sonuc.ok) throw new Error(sonuc.error || sonuc.reason || 'Yardimci programa ulasilamadi. Yardimci programin kurulu ve calisir oldugundan emin olun.')

  // Yeni dosyalari bekle: her turda yeni gelenler eklenir; 2 ardisik turla
  // yeni dosya gelmezse indirme tamamlandi kabul edilir (max 8 dk)
  onDurum?.('dosya-bekleniyor')
  const t0 = Date.now()
  const oncekiAdlar = new Set(onceki.map(f => f.ad))
  const yeniDosyalar = []
  let bosTur = 0
  while (Date.now() - t0 < 8 * 60 * 1000 && bosTur < 2) {
    await new Promise(r => setTimeout(r, 5000))
    let simdi = []
    try { simdi = await gibDosyalariListele() } catch { continue }
    const yeni = simdi.filter(f => !oncekiAdlar.has(f.ad) && !yeniDosyalar.some(y => y.ad === f.ad))
    if (yeni.length > 0) {
      yeniDosyalar.push(...yeni)
      bosTur = 0
    } else if (yeniDosyalar.length > 0) {
      bosTur++
    }
  }
  if (yeniDosyalar.length === 0) {
    throw new Error('Belge indirilemedi (sure doldu). Acilan e-Devlet penceresinde guvenlik kodunu girip giris yaptiginizdan emin olun.')
  }

  // Her yeni belgeyi musteri klasorune yukle
  onDurum?.('yukleniyor')
  const bugun = new Date()
  const yuklenenler = []
  for (const f of yeniDosyalar) {
    const blob = await gibDosyaGetir(f.ad)
    const file = new File([blob], f.ad, { type: 'application/pdf' })
    const r = await uploadClientDocument({
      client: musteri,
      year: bugun.getFullYear(),
      month: bugun.getMonth() + 1,
      beyanType: 'etebligat',
      documentType: 'etebligat',
      file
    })
    yuklenenler.push(r)
  }
  return { yuklenenler, sayi: yuklenenler.length }
}

/**
 * 2.7.170: Beyan belgelerini MUBiS'e yukler + beyan_durumlari'na yazar.
 * Hem GIB'den inen dosyalar hem G: arsivindeki dosyalar icin ortak yol.
 * dosyalar: dosya adi listesi; blobGetir(ad): dosyayi Blob olarak getirir.
 * kaynak: 'arsiv' | 'gib' (tepsi bildirimi metni icin).
 */
async function beyanBelgeleriniIsle({ client, year, month, tur, adaylar, blobGetir, kaynak = 'gib' }) {
  const yuklenenler = []
  const tahakkukBelgeleri = []
  const durumYazilari = {} // urlKey -> url, listeKey -> {url, name, uploadedAt}
  // 2.7.178: MUBiS'e DAHA ONCE yuklenmis belgeler tekrar yuklenmez —
  // beyan_durumlari listelerinde ayni ada sahip kayit varsa dosya atlanir.
  let mevcutListeler = {}
  try {
    const { data: oncekiRow } = await supabase
      .from('clients')
      .select('beyan_durumlari')
      .eq('id', client.id)
      .single()
    mevcutListeler = oncekiRow?.beyan_durumlari || {}
  } catch { /* okunamazsa bos — yukleme normal akar */ }
  const baseKeyOn = `${year}_${month}_${tur}`
  // 2.7.233: Luca dosya adlari suffix tabanli — _BYN = beyanname,
  // _THK/_TAH = tahakkuk (isim icinde "tahakkuk" kelimesi GECMEZ).
  // Eski kontrol sadece /tahakkuk/i aradigi icin Luca tahakkuğu
  // BEYANNAME diye siniflandiriliyordu; musteriyee yalniz tahakkuk
  // fisi gonderme kurali bozuluyordu.
  const belgeTuru = (ad) => /tahakkuk|(?:^|_)(?:THK|TAH)(?:_|\.)/i.test(ad) ? 'tahakkuk'
    : /hizmet|belge|bordro/i.test(ad) ? 'bordro' : 'beyanname'
  const yukluAdlar = (documentType) => {
    const listeKey = documentType === 'tahakkuk'
      ? `${baseKeyOn}_tahakkuklar`
      : documentType === 'bordro'
        ? `${baseKeyOn}_bordrolar`
        : `${baseKeyOn}_beyanlar`
    const liste = Array.isArray(mevcutListeler[listeKey]) ? mevcutListeler[listeKey] : []
    return new Set(liste.map(b => (b?.name || b?.ad || '')).filter(Boolean))
  }
  const atlanan = []
  // 2.7.157 SGK akisi: indirilen tahakkuk + hizmet listesi ayrica
  // ${baseKey}_documents'a category ile yazilir — SGK Evrak panelinde
  // (Tahakkuk Fişi / Hizmet Listesi / Bordro) OTOMATIK olarak gorunur.
  // Ayni zamanda muhtasar anahtarlarina yansitilir (SGK onayi muhtasar
  // beyanname + tahakkuku da kapsar).
  const sgkMi = String(tur || '').toLocaleLowerCase('tr') === 'sgk'
  const sgkDocsEklenecek = []
  const paralelSonuclar = await Promise.all(adaylar.map(async ad => {
    try {
      const documentType = belgeTuru(ad)
      if (yukluAdlar(documentType).has(ad)) {
        return { ad, documentType, atlandi: true }
      }
      const blob = await blobGetir(ad)
      const file = new File([blob], ad, { type: 'application/pdf' })
      const r = await uploadClientDocument({
        client, year, month, beyanType: tur, documentType, file
      })
      return { ad, documentType, r }
    } catch (e) {
      console.error('beyan_onay dosya yukleme hatasi:', ad, e)
      return null
    }
  }))
  for (const sr of paralelSonuclar) {
    if (!sr) continue
    const { ad, documentType, r } = sr
    if (sr.atlandi) { atlanan.push({ ad, documentType }); continue }
    yuklenenler.push(r)
    if (documentType === 'tahakkuk' || documentType === 'bordro') {
      tahakkukBelgeleri.push({ url: r.url, ad, documentType })
    }
    const baseKey = `${year}_${month}_${tur}`
    const urlKey = documentType === 'tahakkuk'
      ? `${baseKey}_tahakkuk_url`
      : documentType === 'bordro'
        ? `${baseKey}_bordro_url`
        : `${baseKey}_beyan_url`
    const listeKey = documentType === 'tahakkuk'
      ? `${baseKey}_tahakkuklar`
      : documentType === 'bordro'
        ? `${baseKey}_bordrolar`
        : `${baseKey}_beyanlar`
    durumYazilari[urlKey] = `${r.url}?v=${Date.now()}`
    durumYazilari[listeKey] = { url: r.url, name: ad, uploadedAt: new Date().toISOString() }
    if (sgkMi) {
      // SGK Evrak paneline otomatik kayit (kategori: sigorta_tahakkuk / hizmet_listesi)
      const kategori = documentType === 'tahakkuk'
        ? 'sigorta_tahakkuk'
        : documentType === 'bordro' ? 'hizmet_listesi' : null
      if (kategori) {
        sgkDocsEklenecek.push({
          url: r.url,
          name: ad,
          category: kategori,
          uploaded_at: new Date().toISOString(),
          fileType: /\.xlsx?$/i.test(ad) ? 'excel' : 'pdf'
        })
      }
      // 2.7.163: Vergi takvimi yansitmasi — takvim SGK beyanini BEYAN
      // DOSYALAMA AYI anahtarindan okur (ay sonu is gunu; or. Agustos SGK'si
      // Eylul sonunda odenir -> takvim "2026_8_sgk" okur), onay akisi ise
      // AIT AY anahtarina yazar ("2026_7_sgg"). Indirilen tahakkuk anahtarlari
      // dosyalama ayi anahtarina da yazilir; boylece GIB'den inen tahakkuk
      // musteri vergi takviminde aninda gorunur.
      const fYil = month === 11 ? year + 1 : year
      const fAy = (month + 1) % 12
      const fBase = `${fYil}_${fAy}_sgk`
      if (documentType === 'tahakkuk') {
        durumYazilari[`${fBase}_tahakkuk_url`] = durumYazilari[urlKey]
        durumYazilari[`${fBase}_tahakkuklar`] = durumYazilari[listeKey]
      }
      // Muhtasar anahtarlarina yansit: SGK tahakkuku -> muhtasar tahakkuku,
      // GIB'den inen muhtasar beyannamesi -> muhtasar beyan kaydi.
      const mBase = `${year}_${month}_muhtasar`
      if (documentType === 'beyanname') {
        durumYazilari[`${mBase}_beyan_url`] = durumYazilari[urlKey]
        durumYazilari[`${mBase}_beyanlar`] = durumYazilari[listeKey]
      } else if (documentType === 'tahakkuk') {
        durumYazilari[`${mBase}_tahakkuk_url`] = durumYazilari[urlKey]
        durumYazilari[`${mBase}_tahakkuklar`] = durumYazilari[listeKey]
      }
    }
  }
  // 2.7.173/2.7.237: Tahakkuk tutarini VE son odeme tarihini OTOMATIK oku
  // (AI -> PDF metni -> OCR) ve ${baseKey}_tutar / ${baseKey}_son_odeme'ye
  // yaz — böylece WhatsApp/mail mesajinda "Ödeme tutarı X TL'dir. Son ödeme
  // tarihi X'tir" satirlari dolu gider. 90 sn zaman asimi.
  const tahakkukSr = paralelSonuclar.find(s => s && s.documentType === 'tahakkuk')
  if (tahakkukSr) {
    try {
      const bilgiler = await Promise.race([
        extractTahakkukBilgileri(tahakkukSr.r.url),
        new Promise(r => setTimeout(() => r({ amount: 0, dueDate: '' }), 90000))
      ])
      if (bilgiler.amount > 0 || bilgiler.dueDate) {
        const baseKey = `${year}_${month}_${tur}`
        if (bilgiler.amount > 0) durumYazilari[`${baseKey}_tutar`] = bilgiler.amount
        if (bilgiler.dueDate) durumYazilari[`${baseKey}_son_odeme`] = bilgiler.dueDate
        // SGK aynasi (takvim/dosyalama ayi anahtari)
        if (sgkMi) {
          const fYil = month === 11 ? year + 1 : year
          const fAy = (month + 1) % 12
          const fBase = `${fYil}_${fAy}_sgk`
          if (bilgiler.amount > 0) durumYazilari[`${fBase}_tutar`] = bilgiler.amount
          if (bilgiler.dueDate) durumYazilari[`${fBase}_son_odeme`] = bilgiler.dueDate
        }
        // Muhtasar aynasi
        const mBase = `${year}_${month}_muhtasar`
        if (bilgiler.amount > 0) durumYazilari[`${mBase}_tutar`] = bilgiler.amount
        if (bilgiler.dueDate) durumYazilari[`${mBase}_son_odeme`] = bilgiler.dueDate
        console.log('beyan_onay tahakkuk bilgileri okundu:', bilgiler)
      }
    } catch (e) { console.warn('beyan_onay tutar okuma hatasi:', e.message) }
  }
  if (Object.keys(durumYazilari).length || sgkDocsEklenecek.length) {
    try {
      const { data: row } = await supabase
        .from('clients')
        .select('beyan_durumlari')
        .eq('id', client.id)
        .single()
      const durumlar = { ...(row?.beyan_durumlari || {}) }
      for (const [k, v] of Object.entries(durumYazilari)) {
        if (k.endsWith('_url') || k.endsWith('_tutar') || k.endsWith('_son_odeme')) {
          durumlar[k] = v
        } else {
          const liste = Array.isArray(durumlar[k]) ? durumlar[k] : []
          if (!liste.some(b => b?.url === v.url)) liste.push(v)
          durumlar[k] = liste
        }
      }
      if (sgkDocsEklenecek.length) {
        const docsKey = `${year}_${month}_${tur}_documents`
        const docsListe = Array.isArray(durumlar[docsKey]) ? durumlar[docsKey] : []
        for (const d of sgkDocsEklenecek) {
          if (!docsListe.some(x => x?.url === d.url)) docsListe.push(d)
        }
        durumlar[docsKey] = docsListe
      }
      await supabase.from('clients').update({ beyan_durumlari: durumlar }).eq('id', client.id)
    } catch (e) { console.error('beyan_onay durumu yazilamadi:', e) }
  }
  // 2.7.157: MUBiS tepsi balonu — indirme/yukleme sonucu sac altinda belirir
  if (yuklenenler.length) {
    const musteriAd = client.name || client.company || client.shortName || 'Müşteri'
    const nereden = kaynak === 'arsiv' ? 'G: arşivinden MUBiS\'e yüklendi' : kaynak === 'luca' ? 'Luca’dan indirildi ve MUBiS’e yüklendi' : 'GİB\'den indirildi ve MUBiS\'e yüklendi'
    yardimciTrayBildir('MUBiS - Beyan İndirme', `${musteriAd}: ${yuklenenler.length} belge ${nereden} (${AYLAR_TR[month] || ''} ${year}).`).catch(() => {})
  } else if (atlanan.length) {
    const musteriAd = client.name || client.company || client.shortName || 'Müşteri'
    yardimciTrayBildir('MUBiS - Beyan İndirme', `${musteriAd}: Belgeler zaten MUBiS'te yüklü — tekrar yüklenmedi (${AYLAR_TR[month] || ''} ${year}).`).catch(() => {})
  }
  return { yuklenenler, tahakkukBelgeleri, atlanan }
}

/**
 * Beyan ONAY otomasyonu (2.7.139):
 * MUBiS beyan listesinde "onaylandi" isaretlenen beyan icin yardimci programa
 * 'eb-beyan-otomatik-indir' isi gonderilir. Yardimci program:
 *   - vergi turleri: e-Beyanname (ebildirge.dib.gov.tr) -> beyanname + tahakkuk PDF
 *   - sgk: SGK e-Bildirge -> tahakkuk + hizmet belgesi
 * dosyalarini indirir ve G:\Drive'ım\BEYANNAME\<musteri>\<tur>\<yil>\<ay>
 * klasorune kaydeder. Yeni inen dosyalar ayni zamanda musterinin MUBiS
 * klasorune yuklenir ve beyan_durumlari'na yazilir.
 * Hata dondurmesi normaldir (giris bilgisi yok / yardimci kapali): cagiran
 * taraf yakalayip sessiz gecer; onay akisi etkilenmez.
 */
export async function beyanOnayOtomatikIndir({ client, beyan }) {
  const yearValue = beyan?.belongYear
  const monthValue = beyan?.belongMonths?.[0]
  const year = Number(yearValue)
  const month = Number(monthValue)
  const tur = beyan?.type
  if (!client?.id || yearValue == null || monthValue == null || !Number.isInteger(year) || !Number.isInteger(month) || month < 0 || month > 11 || !tur) {
    throw new Error('Beyanname indirmek için müşteri ve geçerli beyan dönemi gerekli')
  }

  // 2.7.170 ONCE ARSIV: G:\Drive'ım\BEYANNAME\<musteri>\<tur>\<yil>\<ay>
  // klasorunde beyanname/tahakkuk varsa GIB'e HIC baglanilmaz; belgeler
  // dogrudan MUBiS'e yuklenir — musteriye gonderim cagiran tarafta ayni
  // akisla surer (tahakkukBelgeleri ayni doner). Klasor bos / ay klasoru
  // yoksa asagidaki e-Beyanname indirme akisi calisir.
  const donemYil = month === 11 ? year + 1 : year
  const donemAy = month === 11 ? 1 : month + 1
  const musteriAdArsiv = client.name || client.company || client.shortName || 'DIGER'
  // 2.7.193: Adminin ayarladigi BEYANNAME klasoru (app_settings)
  let kl = null
  try { kl = await kayitKlasorleriGetir() } catch { kl = null }
  try {
    const r = await gibYardimciIs('eb-arsiv-listele', { musteriAd: musteriAdArsiv, yil: donemYil, ay: donemAy, tur, beyanKok: kl?.beyannameKlasoru || '' })
    const arsivBelgeleri = Array.isArray(r?.dosyalar) ? r.dosyalar : []
    const arsivTam = String(tur).toLocaleLowerCase('tr') === 'sgk' ||
      (arsivBelgeleri.some(f => /beyanname|(?:^|_)BYN(?:_|\.)/i.test(f.ad)) &&
       arsivBelgeleri.some(f => /tahakkuk|(?:^|_)(?:THK|TAH)(?:_|\.)/i.test(f.ad)))
    if (r?.ok && arsivBelgeleri.length && arsivTam) {
      const islenen = await beyanBelgeleriniIsle({
        client, year, month, tur,
        adaylar: r.dosyalar.map(f => f.ad),
        blobGetir: async (ad) => {
          const f = r.dosyalar.find(x => x.ad === ad)
          return arsivDosyaGetir(f?.yol || ad)
        },
        kaynak: 'arsiv'
      })
      if (islenen.yuklenenler.length > 0) {
        return { ok: true, kaynak: 'arsiv', hedef: r.hedef || '', sayi: islenen.yuklenenler.length, yuklenenler: islenen.yuklenenler, tahakkukBelgeleri: islenen.tahakkukBelgeleri }
      }
      // 2.7.178: Klasordeki TUM belgeler zaten MUBiS'te yuklu — GIB'e
      // baglanma, tekrar indirme/yukleme yapma.
      if (islenen.atlanan.length > 0) {
        console.log('[beyan-onay] belgeler zaten MUBiS\'te yuklu, atlandi:', islenen.atlanan.map(a => a.ad).join(', '))
        return { ok: true, kaynak: 'arsiv', zatenYuklu: true, hedef: r.hedef || '', sayi: 0, atlanan: islenen.atlanan, yuklenenler: [], tahakkukBelgeleri: [] }
      }
      console.warn('[beyan-onay] arsivden yukleme basarisiz, GIB akisina geciliyor:', r.hedef)
    }
  } catch (e) { console.warn('[beyan-onay] arsiv kontrolu atlandi:', e.message) }

  let onceki = []
  try { onceki = await gibDosyalariListele() } catch { /* bos basla */ }
  const oncekiAdlar = new Set(onceki.map(f => f.ad))

  const giris = await musteriGirisBilgileriGetir(client.id)
  // 2.7.150: Giris ADMIN'in GİB (vergi dairesi) bilgileriyle yapilir
  // (Ayarlar → GİB Bağlantı'da saklanir). Beyanlar tek admin hesabi uzerinden
  // yonetildigi icin musteri kimlikleri degil, admin kimlikleri kullanilir;
  // musterinin sadece VKN/TCKN'i aramada kullanilir. Admin bilgisi girilmemisse
  // musterinin kendi VD bilgilerine duser (geriye donuk uyum).
  let kullaniciKodu = '', parola = '', luca = null
  try {
    const st = await getSettings()
    kullaniciKodu = st?.admin_gib_kullanici_kodu || ''
    parola = st?.admin_gib_parola || ''
    luca = {
      member: st?.luca_member || '',
      username: st?.luca_username || '',
      password: st?.luca_password || ''
    }
  } catch (e) { console.warn('[beyan-onay] ayarlar okunamadi:', e?.message) }
  // 2.7.186: Ofis filtresi anahtari kacirdiysa (ofis eslesmesi / RLS) FILTRESIZ
  // app_settings taramasi — admin GIB bilgisi tek kume, ofis farki akisi
  // bogmamali. Hata 'admin-gib-bilgi-yok' veriyordu.
  if ((!luca?.member || !luca?.username || !luca?.password) && (!kullaniciKodu || !parola)) {
    try {
      const { data: satirlar } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['admin_gib_kullanici_kodu', 'admin_gib_parola'])
      for (const s of (satirlar || [])) {
        if (s.key === 'admin_gib_kullanici_kodu' && !kullaniciKodu) kullaniciKodu = s.value || ''
        if (s.key === 'admin_gib_parola' && !parola) parola = s.value || ''
      }
    } catch (e) { console.warn('[beyan-onay] app_settings yedek okuma hatasi:', e?.message) }
  }
  const turNorm = String(tur || '').toLocaleLowerCase('tr')
  if (turNorm === 'sgk') {
    if (!giris?.sgk_username) throw new Error('musteri-sgk-bilgi-yok')
  } else if (!luca?.member || !luca?.username || !luca?.password) {
    throw new Error('Luca giriş bilgileri eksik: Ayarlar > Luca Bağlantısı bölümünü doldurun')
  }
  // 2.7.163: Kimlik tipi MUSTERI TIPINE gore — type 'individual'/'sahis'
  // (GERCEK KISI) ise TC kimlik no, sirket ise VERGI KIMLIK NO ile arama.
  // Tip alanı boşsa numara uzunlugundan türetilir (10 = VKN, 11 = TCKN).
  // Eski hata: vkn her zaman öncelikliydigi icin gercek kisi mukellefin
  // TC'si yerine bos/hatali tc gonderiliyordu.
  const vknAday = String(client?.vkn || client?.vergi_no || '').replace(/\D/g, '')
  const tcAday = String(client?.tc || client?.tckn || '').replace(/\D/g, '')
  const tipNorm = String(client?.type || '').toLocaleLowerCase('tr')
  let kimlikTip = ''
  if (tipNorm === 'individual' || tipNorm === 'sahis' || tipNorm === 'gercek_kisi') kimlikTip = 'tckn'
  else if (tipNorm === 'company' || tipNorm === 'sirket') kimlikTip = 'vkn'
  else if (vknAday.length === 10) kimlikTip = 'vkn'
  else if (tcAday.length === 11) kimlikTip = 'tckn'
  else if (vknAday.length === 11) kimlikTip = 'tckn'
  const sonuc = await gibYardimciIs('eb-beyan-otomatik-indir', {
    kaynak: turNorm === 'sgk' ? 'gib' : 'luca',
    lucaMember: luca?.member || '',
    lucaUsername: luca?.username || '',
    lucaPassword: luca?.password || '',
    shortName: client.shortName || client.name || client.company || '',
    kullaniciKodu,
    parola,
    kimlikTip,
    vkn: vknAday,
    tc: tcAday || (vknAday.length === 11 ? vknAday : ''),
    kullaniciAdi: giris?.sgk_username || '',
    isyeriKodu: giris?.sgkIsyeriKodu || '',
    sistemSifre: giris?.sgk_password || '',
    isyeriSifre: giris?.sgk_work_password || '',
    yil: donemYil,
    ay: donemAy,
    tur,
    musteriAd: client.name || client.company || client.shortName || 'DIGER',
    beyanKok: kl?.beyannameKlasoru || ''
  })
  if (!sonuc.ok) throw new Error(sonuc.reason || sonuc.error || 'Yardimci programa ulasilamadi')
  if (turNorm !== 'sgk' && (!Array.isArray(sonuc.dosyalar) || sonuc.dosyalar.length !== 2)) {
    throw new Error('Luca beyanname ve tahakkuk PDF dosyalarinin ikisi de indirilemedi')
  }

  // Yardimci zaten arsive kopyaladi (sonuc.dosyalar). Yeni inen dosyalari
  // MUBiS'e yukle + beyan_durumlari'na yaz — ortak islev:
  // beyanBelgeleriniIsle (arsiv yoluyla ayni kod, tek yazim).
  const adaylar = (Array.isArray(sonuc.dosyalar) && sonuc.dosyalar.length)
    ? sonuc.dosyalar.map(y => y.replace(/^.*[\\/]/, ''))
    : []
  const islenen = await beyanBelgeleriniIsle({ client, year, month, tur, adaylar, blobGetir: gibDosyaGetir, kaynak: turNorm === 'sgk' ? 'gib' : 'luca' })
  if (turNorm !== 'sgk' && islenen.yuklenenler.length + islenen.atlanan.length < 2) {
    throw new Error('Luca belgeleri indirildi ancak ikisi birden MUBiS’e yüklenemedi; müşteri klasörünü kontrol edin')
  }
  return { ok: true, kaynak: turNorm === 'sgk' ? 'gib' : 'luca', sayi: islenen.yuklenenler.length, yuklenenler: islenen.yuklenenler, tahakkukBelgeleri: islenen.tahakkukBelgeleri, hedef: sonuc.hedef || '' }
}

/**
 * Tahakkuk/bordro belgelerini musterinin gonderim tercihine gore iletir.
 * tercih (client.beyanDurumlari.tahakkukGonderim): 'whatsapp' | 'mail' | 'ikisi' | 'yok'
 * 'yok' seciliyse hicbir kanaldan gonderim yapilmaz.
 * Mesaj: "Sayın X, X ayına ait X tahakkuklarınız ektedir. Son ödeme
 * tarihi X'tir. Ödeme tutarı X TL'dir."
 */
export async function tahakkuklariGonder({ client, beyan, tahakkukBelgeleri = [] }) {
  if (!client?.id || !tahakkukBelgeleri.length) return { ok: false, reason: 'eksik-parametre' }
  const year = beyan?.belongYear
  const month = beyan?.belongMonths?.[0]
  const baseKey = `${year}_${month}_${beyan?.type}`
  const tercih = client?.beyanDurumlari?.tahakkukGonderim || 'whatsapp'

  // Musteri "Gonderim Yok" secmise hicbir kanaldan gonderim yapma
  if (tercih === 'yok') {
    console.log('[tahakkuk-gonderim] atlandi (tercih: gonderim yok):', client.name)
    return { ok: true, tercih, atlandi: true, reason: 'gonderim-yok' }
  }

  // Gonderim kapsami: SGK'da tahakkuk + hizmet listesi + bordro gider;
  // diger tum beyanlarda YALNIZ tahakkuk fisi gonderilir (bordro/hizmet hariç).
  const sgkMi = String(beyan?.type || '').toLocaleLowerCase('tr').includes('sgk')
  const gonderilecek = sgkMi
    ? tahakkukBelgeleri
    : tahakkukBelgeleri.filter(b => b.documentType === 'tahakkuk')
  if (!gonderilecek.length) {
    console.log('[tahakkuk-gonderim] gonderilecek tahakkuk fisi yok:', client.name, '| sgkMi:', sgkMi)
    return { ok: true, tercih, atlandi: true, reason: 'tahakkuk-fisi-yok' }
  }

  // Tutar + son odeme: beyan_durumlari'ndan (tahakkuk analizi yaziyor)
  let tutar = 0, sonOdeme = ''
  try {
    const { data: row } = await supabase
      .from('clients')
      .select('beyan_durumlari')
      .eq('id', client.id)
      .single()
    const d = row?.beyan_durumlari || {}
    tutar = Number(d[`${baseKey}_tutar`]) || 0
    if (!tutar && Array.isArray(d[`${baseKey}_tahakkuklar`])) {
      tutar = d[`${baseKey}_tahakkuklar`].reduce((t, b) => t + (Number(b?.tutar) || 0), 0)
    }
    sonOdeme = d[`${baseKey}_son_odeme`] || ''
  } catch { /* tutar/son odeme opsiyonel */ }
  // 2.7.237 yedek: analiz yazmadiysa beyan takvimindeki odeme son gunu
  if (!sonOdeme) sonOdeme = beyan?.paymentDeadline || beyan?.deadline || ''
  // 2.7.239 ODENE GUNU KURALI (kullanici bildirimi: muhtasarda 16 Eylül
  // yaziyordu): muhtasar ödemesi beyan döneminin IZLEYEN ayinin 26'si,
  // SGK ödemesi izleyen ayin SON GUNUDür; gün hafta sonuna (Cumartesi
  // dahil) veya resmi tatile denk gelirse takip eden ilk is gunu. Bu iki
  // turde PDF'ten okunan tarih yerine KURAL tarihine cevrilir (orn. Ağustos
  // muhtasari -> 26 Eylül Cumartesi -> mesajda 28 Eylül Pazartesi).
  const turNorm = String(beyan?.type || '').toLocaleLowerCase('tr')
  if (turNorm.includes('muhtasar') || turNorm.includes('sgk')) {
    const nYil = month === 11 ? year + 1 : year
    const nAy = (month + 1) % 12 // izleyen ayin JS ay indeksi
    const gun = turNorm.includes('sgk') ? new Date(year, nAy + 1, 0).getDate() : 26
    let dt = new Date(nYil, nAy, gun)
    if (!isBusinessDay(dt)) dt = getNextVergiWorkDay(dt)
    sonOdeme = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`
    console.log('tahakkukGonder: odeme gunu kurali ->', turNorm, sonOdeme)
  } else {
    // 2.7.238: Diger beyanlarda da son ödeme tarihi hafta sonuna veya resmi
    // tatile denk gelirse takip eden ilk is gunune ertelenir.
    const dte = String(sonOdeme || '').match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)
    if (dte) {
      let dt = new Date(Number(dte[3]), Number(dte[2]) - 1, Number(dte[1]))
      if (!isBusinessDay(dt)) {
        dt = getNextVergiWorkDay(dt)
        sonOdeme = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`
        console.log('tahakkukGonder: son odeme tarihi is gunune ertelendi ->', sonOdeme)
      }
    }
  }

  const musteriAd = client.name || client.company || client.shortName || 'Müşterimiz'
  const ayAdi = `${AYLAR_TR[month] || ''}${year ? ` ${year}` : ''}`
  const turEtiket = beyan?.label || beyan?.type || 'beyanname'
  const tutarStr = tutar > 0 ? `${tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL` : ''
  const mesaj = [
    `Sayın ${musteriAd},`,
    `${ayAdi} dönemine ait ${turEtiket} tahakkuklarınız ektedir.`,
    sonOdeme ? `Son ödeme tarihi ${sonOdeme}'dir.` : '',
    tutarStr ? `Ödeme tutarı ${tutarStr}'dir.` : ''
  ].filter(Boolean).join(' ')

  const sonuc = { tercih, whatsapp: null, mail: null, hatalar: [] }

  // 2.7.171: Ayarlari BIR KEZ yukle — whatsapp_channel 'web' ise yardimci
  // otomatik WhatsApp gonderimi devreye girer (settings verilmezse kod
  // varsayilan 'api' kanalina dusup 'WhatsApp API ayarlari eksik' hatasi
  // veriyordu; halbuki ayarlarda kanal web + API bilgileri giriliydi).
  let ayarlar = null
  try { ayarlar = await getSettings() } catch { /* ayarlar okunamadi */ }

  if (tercih === 'whatsapp' || tercih === 'ikisi') {
    const tel = client.whatsapp || client.phone
    if (!tel) {
      sonuc.hatalar.push('WhatsApp/telefon numarasi yok')
    } else {
      for (const belge of gonderilecek) {
        try {
          const waSonuc = await sendDocumentViaWhatsAppChannel({
            phone: tel,
            documentUrl: belge.url,
            documentName: belge.ad,
            caption: mesaj,
            clientId: client.id,
            beyanType: beyan?.type,
            year,
            month,
            documentType: belge.documentType,
            settings: ayarlar
          })
          sonuc.whatsapp = waSonuc
          if (waSonuc?.ok === false) {
            sonuc.hatalar.push(`WhatsApp: ${waSonuc?.not || waSonuc?.reason || 'gonderilemedi'}`)
          }
        } catch (e) { sonuc.hatalar.push(`WhatsApp: ${e.message}`) }
      }
    }
  }

  if (tercih === 'mail' || tercih === 'ikisi') {
    if (!client.email) {
      sonuc.hatalar.push('E-posta adresi yok')
    } else {
      try {
        sonuc.mail = await sendEmail({
          toEmail: client.email,
          toName: musteriAd,
          subject: `${ayAdi} dönemi ${turEtiket} tahakkukları`,
          message: mesaj,
          documents: gonderilecek.map(b => ({ url: b.url, name: b.ad })),
          clientId: client.id,
          beyanType: beyan?.type,
          year,
          month,
          documentType: 'tahakkuk',
          settings: ayarlar
        })
      } catch (e) { sonuc.hatalar.push(`Mail: ${e.message}`) }
    }
  }

  console.log('[tahakkuk-gonderim]', musteriAd, '| tercih:', tercih, '| belge:', tahakkukBelgeleri.length, sonuc.hatalar.length ? '| hatalar: ' + sonuc.hatalar.join(' ; ') : '')
  // 2.7.157: Gonderim basariliysa MUBiS tepsi balonu — sac altinda belirir
  // (NOT: atlanan durumlar yukarida erken dondur; buraya yalniz gonderim denemesi ulasir)
  if (sonuc.hatalar.length === 0) {
    const kanal = tercih === 'ikisi' ? 'WhatsApp + E-Posta' : tercih === 'mail' ? 'E-Posta' : 'WhatsApp'
    yardimciTrayBildir('MUBiS - Tahakkuk Gönderimi', `${musteriAd}: ${ayAdi} ${turEtiket} tahakkukları müşteriye gönderildi (${kanal}).`).catch(() => {})
  }
  return { ok: sonuc.hatalar.length === 0, ...sonuc }
}
