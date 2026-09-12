// GIB'den belge indirme koprusu:
// 1. Yerel yardimci programa "tahakkuk-indir" / "beyanname-indir" / "makbuz-indir" isi gonderilir
// 2. Yardimci program Dijital VD'yi acip giris bilgilerini doldurur (kullanici yalniz guvenlik kodu girer)
// 3. Kullanici belgeyi indirdiginde dosya yardimcinin "indirilenler" klasorune duser
// 4. Yeni dosya algilanir, Blob olarak cekilir ve musteri klasorune (Supabase Storage) yuklenir
// 5. beyan_durumlari'na URL yazilir; belge takip ekranlarinda aninda gorunur

import { gibYardimciIs, gibDosyalariListele, gibDosyaGetir, musteriGirisBilgileriGetir, edevletKimlikGetir } from '../utils/gibOdemeHelper'
import { uploadClientDocument, uploadMakbuz } from './documentService'
import { supabase } from '../lib/supabase'

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
