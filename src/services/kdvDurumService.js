// KDV Durumu servisi — musteri ana ekrani "KDV Durumu" karti
//
// Hesap (içinde bulunulan aydan bir önceki aya ait KDV1 beyanı esas alınır):
//   1. Önceki aydan devreden KDV  -> bir önceki ayin KDV1 beyanname PDF'indeki
//      "Sonraki Döneme Devreden Katma Değer Vergisi" satiri (o ayin sonunda
//      bir sonraki doneme tasinan KDV = okunan ayin basindaki devreden).
//      DIKKAT: beyandaki "Önceki Dönemden Devreden" satiri DEGIL — o, bir
//      önceki aya gelen devredendir ve bu kart icin yanlis tutardir.
//      beyan_durumlari'nda URL yoksa Storage'daki standart dosya yolu denenir.
//   2. Alınan fatura KDV toplami  -> efatura_faturalar, yon='gelen', önceki ay.
//   3. İndirilebilir toplam KDV   -> (1) + (2).
//   4. Tahsil edilen KDV          -> efatura_faturalar, yon='giden', önceki ay.
//   5. Tahsil > İndirilebilir     -> KDV Ödemesi = tahsil - indirilebilir
//      aksi halde                 -> Sonraki Aya Devreden = indirilebilir - tahsil
import { supabase } from '../lib/supabase'
import { tevkifatKdvDokumu, tevkifatOdendiOku } from './tevkifatService'

const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const AY_SLUG = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik']

function sayi(v) {
  const n = Number(v)
  return isFinite(n) && n > 0 ? n : 0
}

// KDV1 beyanname PDF'inden "Sonraki Döneme Devreden Katma Değer Vergisi"
// tutarini oku — bu, o ayin sonunda bir sonraki doneme tasinan KDV'dir ve
// bir sonraki ayin kartindaki "Önceki Aydan Devreden" tutaridir.
// NOT: "Önceki Dönemden Devreden" satiri kasitli olarak OKUNMAZ — o, beyan
// donemine gelen devredendir (bir onceki ayin karti icin dogru, bu kart icin
// yanlis tutar; orn. Agustos beyaninda 2.463.231,98 vs dogru 2.526.955,36).
export async function devredenKdvOku(pdfUrl) {
  if (!pdfUrl) return { tutar: 0, kaynak: 'beyanname-yok' }
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
      pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default
    }
    const pdf = await pdfjsLib.getDocument({ url: pdfUrl }).promise
    let items = []
    for (let p = 1; p <= Math.min(pdf.numPages, 6); p++) {
      const page = await pdf.getPage(p)
      const tc = await page.getTextContent()
      items = items.concat(tc.items.filter(i => i.str && i.str.trim()).map(i => ({
        s: i.str.trim(), x: i.transform[4], y: i.transform[5]
      })))
    }
    const metin = items.map(i => i.s).join(' ').replace(/\s+/g, ' ')

    const TL = '(\\d{1,3}(?:\\.\\d{3})*,\\d{2})'
    const sayiMi = s => /^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(s)

    // --- 1) y-koordinat satir gruplamasi (en guvenli): kolonlar metin
    // akisinda karissa da ayni satirdakiler ayni y'dedir. "Sonraki Döneme
    // Devreden" iceren TUM satirlar toplanir; GIB beyanlarinda ayni ibare
    // baska sayfalarda (iade listesi basligi vb.) de geçebildigi ve oradaki
    // sag deger 0,00 olabildigi icin sag degeri EN BUYUK olan satir esas
    // alınır (2.8.13: özet kutusundaki gerçek devreden satırı).
    const satirlar = []
    for (const it of items) {
      let sr = satirlar.find(s => Math.abs(s.y - it.y) < 4)
      if (!sr) { sr = { y: it.y, items: [] }; satirlar.push(sr) }
      sr.items.push(it)
    }
    satirlar.sort((a, b) => b.y - a.y)
    let enIyi = null
    for (const sr of satirlar) {
      const t = sr.items.map(i => i.s).join(' ')
      if (!(/sonraki/i.test(t) && /d[öo]nem/i.test(t) && /devreden/i.test(t))) continue
      const sayilar = sr.items.filter(i => sayiMi(i.s))
      if (!sayilar.length) continue
      // 2.8.13: en sagdaki degil EN BUYUK deger — komşu kolonların 0,00'ları
      // sağ tarafa taşabiliyor (x=543); gerçek devreden tutarı satırdaki en büyük
      const enBuyuk = sayilar.reduce((en, s) => Number(s.s.replace(/\./g, '').replace(',', '.')) > Number(en.s.replace(/\./g, '').replace(',', '.')) ? s : en, sayilar[0])
      const tutar = Number(enBuyuk.s.replace(/\./g, '').replace(',', '.'))
      if (!isFinite(tutar) || tutar < 0) continue
      if (!enIyi || tutar > enIyi.tutar) enIyi = { tutar, kaynak: 'beyanname-sonraki-donem' }
    }
    if (enIyi) return enIyi

    // --- 2) Yedek: duz metin regex'i (pypdf benzeri duzgun akis icin)
    let m = metin.match(new RegExp('Sonraki\\s*D[öo]nem(?:e|lere)?\\s*Devreden[^\\d]{0,60}' + TL, 'i'))
    if (m) {
      const tutar = Number(m[1].replace(/\./g, '').replace(',', '.'))
      if (isFinite(tutar) && tutar >= 0) return { tutar, kaynak: 'beyanname-sonraki-donem' }
    }
    return { tutar: 0, kaynak: 'okunamadi' }
  } catch (e) {
    console.warn('[kdv-durum] devreden KDV okunamadi:', e?.message)
    return { tutar: 0, kaynak: 'hata' }
  }
}

// Storage'daki standart beyanname yolundan public URL uretir:
//   <vkn>_<slug-ad>/beyannameler/<yil>/kdv/<ay-slug>_kdv.pdf
// (uploadClientDocument ile ayni klasor adlandirmasi; ofis 1 ise prefix yok)
export function storageBeyanUrl(client, yil, ay) {
  try {
    const identifier = client?.vkn || client?.tc || client?.taxNo || ''
    const ad = client?.name || client?.company || ''
    if (!identifier || !ad) return ''
    const trMap = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'i': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'Ç': 'C', 'Ğ': 'G', 'I': 'I', 'İ': 'I', 'Ö': 'O', 'Ş': 'S', 'Ü': 'U' }
    const slug = String(ad)
      .split('').map(c => trMap[c] || c).join('')
      .toLowerCase().trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
    const officeId = client?.office_id || client?.officeId
    const prefix = officeId && officeId !== 1 ? `ofis_${officeId}/` : ''
    const yol = `${prefix}${identifier}_${slug}/beyannameler/${yil}/kdv/${AY_SLUG[ay - 1]}_kdv.pdf`
    const { data } = supabase.storage.from('client-documents').getPublicUrl(yol)
    return data?.publicUrl || ''
  } catch {
    return ''
  }
}

export async function kdvDurumuGetir(client) {
  const simdi = new Date()
  const buYil = simdi.getFullYear()
  const buAy = simdi.getMonth() + 1 // 1-based

  // 2.7.266: OKUNAN AY = son yuklenen faturalarin ayi — icinde bulunulan
  // aya ait fatura henuz yuklenmemisse (ay basi) "faturalar yuklenmedi"
  // diye bos kalmak yerine, son yuklenen faturalarin ait oldugu ayin
  // verileri gosterilir ve donem o ay yazilir.
  const oncekiAyF = (y, m) => { m -= 1; if (m < 1) { m = 12; y -= 1 } return { y, m } }

  // Pencere: son 4 ay (okunacak aday aylar). Fatura tarihinden YYYY-MM
  // cikarilip en guncel ay secilir.
  // 2.7.385: oncekiAyF object dondurdugu icin ic-ice cagri bozuktu;
  // donguyle 3 ay geri gidilip ayri y/m degiskenleriyle pencereBas uretilir.
  let pYil = buYil, pAy = buAy
  for (let i = 0; i < 3; i++) { const r = oncekiAyF(pYil, pAy); pYil = r.y; pAy = r.m }
  const pencereBas = `${pYil}-${String(pAy).padStart(2, '0')}-01`

  let faturalar = []
  try {
    // Sayfalama ZORUNLU — PostgREST istek basina ~1000 satirla sinirlar;
    // canli testte 1000'lik sayfa bile 999 satirda kesildi. Sayfa boyutu 500
    // ve dongu YALNIZCA BOS sayfada durur (kismi sayfada durmak kayit
    // kaybettiriyordu → kart yanlis toplamlar).
    for (let from = 0; from < 100000; ) {
      const { data, error } = await supabase
        .from('efatura_faturalar')
        .select('kdv, yon, tur, tarih, para_birimi')
        .eq('client_id', client.id)
        .gte('tarih', pencereBas)
        .range(from, from + 499)
      if (error) { console.warn('[kdv-durum] faturalar alinamadi:', error.message); break }
      faturalar = faturalar.concat(data || [])
      if (!data || data.length === 0) break
      from += data.length
    }
  } catch (e) {
    console.warn('[kdv-durum] faturalar alinamadi:', e?.message)
  }

  // Sayilan faturalar (KDV > 0, e-belge turleri) — hem son-ay tespiti
  // hem toplamlar yalnizca bunlar uzerinden yapilir; KDV'siz belgeler
  // (orn. e-SMM istisna) son ayi ezip "henüz yüklenmedi"ye dusurmesin.
  // NOT: para_birimi filtresi YOK — kdv alani TL kaydediliyor (USD/EUR
  // faturanin KDV'si de TL); Luca toplamlariyla birebir eslesir.
  const sayilanFaturalar = faturalar.filter(f =>
    f.tarih
    && (['efatura', 'earsiv', 'esmm'].includes(String(f.tur)) || (f.tur === 'utts' && f.yon === 'gelen'))
    && sayi(f.kdv) > 0
  )

  // 2.7.385: donem secimi tarih kuraliyla — KDV bildirimi bir onceki ayin
  // donemine aittir: ayin 28'ine kadar ONCEKI ay gosterilir (Ekim'de Eylul
  // donemi); 28'den sonra bu ayin faturalari yuklendiyse bu ay'a gecilir,
  // yuklenmediyse onceki/son yuklenen ay gosterilmeye DEVAM eder.
  let hedefYil = buYil
  let hedefAy = buAy
  if (simdi.getDate() < 28) {
    ({ y: hedefYil, m: hedefAy } = oncekiAyF(buYil, buAy))
  }
  const hedefAnahtar = `${hedefYil}-${String(hedefAy).padStart(2, '0')}`
  const hedefVeriVar = sayilanFaturalar.some(f => String(f.tarih).slice(0, 7) === hedefAnahtar)

  // Son yuklenen faturalarin ayi (YYYY-MM); fatura yoksa bulunulan ay
  let okunanYil = hedefYil
  let okunanAy = hedefAy
  let enSonAyAnahtari = null
  for (const f of sayilanFaturalar) {
    const anahtar = String(f.tarih).slice(0, 7)
    if (anahtar >= '2000-01' && anahtar > (enSonAyAnahtari || '')) enSonAyAnahtari = anahtar
  }
  if (hedefVeriVar) {
    okunanYil = hedefYil
    okunanAy = hedefAy
  } else if (enSonAyAnahtari) {
    const [yy, mm] = enSonAyAnahtari.split('-').map(Number)
    if (isFinite(yy) && isFinite(mm)) { okunanYil = yy; okunanAy = mm }
  }

  // Okunan ayin fatura KDV toplamlari
  const ayBas = `${okunanYil}-${String(okunanAy).padStart(2, '0')}-01`
  const sYil = okunanAy === 12 ? okunanYil + 1 : okunanYil
  const aySon = okunanAy === 12 ? `${sYil}-01-01` : `${okunanYil}-${String(okunanAy + 1).padStart(2, '0')}-01`

  let alinanKdv = 0
  let kesilenKdv = 0
  let faturaSayisi = 0
  for (const f of sayilanFaturalar) {
    const t = String(f.tarih)
    if (t < ayBas || t >= aySon) continue
    const kdv = sayi(f.kdv)
    faturaSayisi++
    if (f.yon === 'gelen') alinanKdv += kdv
    else if (f.yon === 'giden') kesilenKdv += kdv
  }

  // Devreden: OKUNAN aydan bir onceki ayin KDV1 beyanindaki
  // "Sonraki Döneme Devreden" tutari (o ayin sonunda devreden KDV).
  const prev = oncekiAyF(okunanYil, okunanAy)
  const yil = prev.y
  const ay = prev.m
  const bd = client?.beyan_durumlari || client?.beyanDurumlari || {}
  const beyanAnahtar = `${yil}_${ay}_kdv`
  // 2.8.13: dvsSorguService.devredenGirisBul ile ayni anahtar cesitlileri —
  // ana ekran karti beyan URL'sini bulamayip 0 gostermiyordu. 0-bazli ay
  // anahtari da denenir (eski yukleme akislari 0-bazli yazmis olabiliyor).
  let beyanUrl =
    bd[`${beyanAnahtar}_beyan_url`] ||
    bd[`${beyanAnahtar}_beyanname_url`] ||
    bd[`${beyanAnahtar}_beyan_pdf_url`] ||
    bd[`${beyanAnahtar}_pdf_url`] ||
    bd[`${yil}_${ay}_kdv1_beyan_url`] ||
    bd[`${yil}_${ay}_kdv1_pdf_url`] ||
    bd[`${yil}_${ay - 1}_kdv_beyan_url`] ||
    bd[`${yil}_${ay - 1}_kdv1_beyan_url`] ||
    ''
  // Coklu beyanname listesi: en son yuklenen beyanname URL'si
  if (!beyanUrl && Array.isArray(bd[`${beyanAnahtar}_beyanlar`]) && bd[`${beyanAnahtar}_beyanlar`].length) {
    beyanUrl = bd[`${beyanAnahtar}_beyanlar`][bd[`${beyanAnahtar}_beyanlar`].length - 1]?.url || ''
  }

  let devreden = await devredenKdvOku(beyanUrl)

  // Yedek: beyan_durumlari'nda URL kaydi yoksa Storage'daki standart dosya
  // yolunu dene (yardimci/beyan yukleme akislari dosyayi yukleyip URL'yi
  // yazamamis olabilir; dosya yerindeyse beyandan okunur).
  if (['okunamadi', 'beyanname-yok', 'hata'].includes(devreden.kaynak)) {
    const storageUrl = storageBeyanUrl(client, yil, ay)
    if (storageUrl && storageUrl !== beyanUrl) {
      const yedek = await devredenKdvOku(storageUrl)
      if (yedek.tutar > 0) devreden = yedek
    }
  }

  // 2.8.13: PDF bulunamazsa KDV dökümleriyle AYNI kaynaga dus — onceki ayin
  // kdv_durum_kartlari "devreden_sonraki" degeri (dökümleri sayfasinin hesap
  // özetindeki "Sonraki Aya Devreden"). Böylece ana ekran karti ile KDV
  // dökümleri sayfasi ayni devreden tutarini gösterir.
  if (devreden.tutar <= 0) {
    try {
      const { data: oncekiKart } = await supabase
        .from('kdv_durum_kartlari')
        .select('yil, ay, devreden_sonraki')
        .eq('client_id', client.id)
        .eq('yil', yil)
        .eq('ay', ay)
        .gt('devreden_sonraki', 0)
        .maybeSingle()
      if (oncekiKart?.devreden_sonraki) {
        devreden = { tutar: sayi(oncekiKart.devreden_sonraki), kaynak: 'kart-devreden-sonraki' }
      }
    } catch { /* tablo yoksa PDF sonucu neyse o kalir */ }
  }

  // KDV 109 (sorumlu sıfatıyla ödenen) döküm toplamı — Dijital Vergi
  // Dairesi sorgusundan (kdv_dokumleri tablosu). İndirilebilir KDV'dir
  // ve indirilebilir toplama eklenir.
  let kdv109 = 0
  let gibGumrukTutar = 0
  try {
    const { data: dokumler, error: dokumErr } = await supabase
      .from('kdv_dokumleri')
      .select('tur, toplam_tutar')
      .eq('client_id', client.id)
      .eq('yil', okunanYil)
      .eq('ay', okunanAy)
      .in('tur', ['109', '110'])
    if (!dokumErr && dokumler) {
      for (const d of dokumler) {
        if (d.tur === '109') { kdv109 = sayi(d.toplam_tutar) }
        else if (d.tur === '110') { gibGumrukTutar = sayi(d.toplam_tutar) }
      }
    }
  } catch (e) {
    console.warn('[kdv-durum] kdv dokumleri alinamadi:', e?.message)
  }

  // 2.7.442: GÜMRÜK / İTHALDE ÖDENEN KDV — kullanıcının yüklediği ithalat
  // faturalarının (efatura_faturalar, tur='gumruk', "Gümrük/İthalat" adlı
  // Excel'lerden) KDV toplamı. İthalatte ödenen KDV indirilebilir olduğu
  // için İNDİRİLEBİLİR TOPLAMA DAHİL EDİLDİ (kullanıcı tercihi).
  let gumrukKdv = 0
  let gumrukSayisi = 0
  for (const f of faturalar) {
    if (String(f.tur) !== 'gumruk') continue
    const t = String(f.tarih)
    if (t < ayBas || t >= aySon) continue
    gumrukKdv += sayi(f.kdv)
    gumrukSayisi++
  }
  gumrukKdv = +gumrukKdv.toFixed(2)

  // 2.8.14: ithalat faturası YÜKLENDİYSE onların KDV'si esas; yüklenmediyse
  // GİB Gümrük İşlemleri KDV (kdv_dokumleri tur=110) toplamı kullanılır.
  const kdv110Etkin = gumrukSayisi > 0 ? gumrukKdv : gibGumrukTutar
  const kdv110Kaynak = gumrukSayisi > 0 ? 'yuklenen-ithalat-faturalari' : (gibGumrukTutar > 0 ? 'gib-sorgusu' : 'yok')

  // "Sorumlu Sıfatıyla KDV (109)" etkin tutarı:
  //   1. GİB 109 sorgusunda tutar varsa  -> o tutar (ödendiği GİB'den teyitli)
  //   2. GİB 109 yok ama Tevkifat Alış "Ödendi" işaretliyse -> tevkifat KDV
  //   3. İkisi de yoksa -> 0 (indirilebilir toplama eklenmez)
  // Etkin tutar indirilebilir KDV toplamına EKLENİR.
  let tevkifatKdv = 0
  let tevkifatOdendi = false
  try {
    const dokum = await tevkifatKdvDokumu({ clientId: client.id, yil: okunanYil, ay: okunanAy })
    tevkifatKdv = dokum?.toplam?.tevkifatKdv || 0
    tevkifatOdendi = await tevkifatOdendiOku({ clientId: client.id, yil: okunanYil, ay: okunanAy })
  } catch (e) {
    console.warn('[kdv-durum] tevkifat KDV hesaplanamadi:', e?.message)
  }
  const kdv109Etkin = kdv109 > 0 ? kdv109 : (tevkifatOdendi ? tevkifatKdv : 0)
  const kdv109Kaynak = kdv109 > 0 ? 'gib-sorgusu' : (tevkifatOdendi && tevkifatKdv > 0 ? 'tevkifat-alis-odendi' : 'yok')

  const indirilebilirToplam = +(devreden.tutar + alinanKdv + kdv109Etkin + kdv110Etkin).toFixed(2)
  const sonuc = {
    // 2.7.266: donem = son yuklenen faturalarin ayi (arayuzde görünür)
    donem: `${okunanYil} ${AY_ADLARI[okunanAy - 1]}`,
    yil: okunanYil, ay: okunanAy,
    // Okunan ayda (son yuklenen faturalarin ayinda) KDV'si > 0 fatura yoksa
    // hesap yapilmaz; arayuz "faturalar henüz yüklenmedi" uyarisi gösterir.
    faturalarYuklenmedi: faturaSayisi === 0,
    devredenOnceki: devreden.tutar,
    devredenKaynak: devreden.kaynak,
    alinanKdv,
    kesilenKdv,
    faturaSayisi,
    kdv109,
    kdv109Etkin,
    kdv109Kaynak,
    kdv110: kdv110Etkin,
    kdv110Kaynak,
    gumrukSayisi,
    tevkifatKdv,
    tevkifatOdendi,
    kdvDokumVar: kdv109Etkin > 0 || kdv110Etkin > 0,
    indirilebilirToplam,
    tahsilEdilen: kesilenKdv,
    odeme: 0,
    devredenSonraki: 0
  }
  if (sonuc.faturalarYuklenmedi) return sonuc
  if (kesilenKdv > indirilebilirToplam) {
    sonuc.odeme = +(kesilenKdv - indirilebilirToplam).toFixed(2)
  } else {
    sonuc.devredenSonraki = +(indirilebilirToplam - kesilenKdv).toFixed(2)
  }
  return sonuc
}
