// Beyan Hazirlama — Defter-Beyan Sistemi (portal.defterbeyan.gov.tr) koprusu.
// Gelir gecici vergi (isletme) beyannamesi hazirlama akisi:
//   1) Mali musavir IVD girisi (defterbeyan-giris isi)
//   2) Mukellef gecisi + Hesap Ozeti (Mali) olusturma (defterbeyan-hesap-ozeti isi)
//   3) Kar oranina gore hesaplanan Donem Sonu Emtia Mevcudu'nu portala
//      gonderme (defterbeyan-donem-sonu-gonder isi)
// IVD giris bilgileri ofis bazli app_settings'te saklanir.
//
// ONEMLI: Defter-Beyan isleri OFIS BILGISAYARINDAKI YEREL yardimci program
// uzerinden calisir (kullanici tercihi). gibYardimciIs sunucu modu aciksa
// VPS'e, kapaliysa yerel yardimciya gider.
import { gibYardimciIs } from '../utils/gibOdemeHelper'
import { getAppSetting, setAppSetting, kayitKlasorleriGetir } from './settingsService'

export const DEFTERBEYAN_KULLANICI_KEY = 'defterbeyan_username'
export const DEFTERBEYAN_PAROLA_KEY = 'defterbeyan_password'

export async function defterbeyanBilgileriGetir() {
  const [kullaniciKodu, parola] = await Promise.all([
    getAppSetting(DEFTERBEYAN_KULLANICI_KEY).catch(() => null),
    getAppSetting(DEFTERBEYAN_PAROLA_KEY).catch(() => null)
  ])
  return { kullaniciKodu: kullaniciKodu || '', parola: parola || '' }
}

export async function defterbeyanBilgileriKaydet(kullaniciKodu, parola) {
  await setAppSetting(DEFTERBEYAN_KULLANICI_KEY, kullaniciKodu || '')
  await setAppSetting(DEFTERBEYAN_PAROLA_KEY, parola || '')
  return true
}

// 1) Portal girisi (oturum aciksa atlanir — yardimci sayfayi bulur)
export function defterbeyanGiris(kullaniciKodu, parola) {
  return gibYardimciIs('defterbeyan-giris', { kullaniciKodu, parola }, 4 * 60 * 1000)
}

// 2) Mukellefe gec + Hesap Ozeti (Mali) olustur + degerleri oku.
// baslangic/bitis: 'gg.aa.yyyy'
// 2.7.550: oturum kapaliysa yardimci otomatik giris yapsin diye IVD
// giris bilgileri de gonderilir.
export function defterbeyanHesapOzeti(vkn, baslangic, bitis, kullaniciKodu, parola) {
  return gibYardimciIs('defterbeyan-hesap-ozeti', { vkn, baslangic, bitis, kullaniciKodu, parola }, 5 * 60 * 1000)
}

// 3) Donem sonu emtia mevcudunu portala yazip Olustur'a basar
export function defterbeyanDonemSonuGonder(donemSonu) {
  return gibYardimciIs('defterbeyan-donem-sonu-gonder', { donemSonu }, 3 * 60 * 1000)
}

// 4) Hesap ozeti tamamlandiktan sonra: Kaydet + popup Tamam (varsa),
//    Beyannameler > Gecici Vergi ekranini acar, yil + donem secip
//    Olustur'a basar. donemAy: ceyregin son ayi (3/6/9/12).
export function defterbeyanGeciciVergi(yil, donemAy) {
  return gibYardimciIs('defterbeyan-gecici-vergi', { yil, donemAy }, 3 * 60 * 1000)
}

// 5) Onceki donem gecici vergi beyannamesini (yerel PDF) okur —
//    "Sonraki Doneme Devreden Hesaplanan Gecici Vergi" tutarini doner.
//    donem: ONCEKI donemin numarasi (1-4). 2.7.572: klasor koku Admin >
//    Ayarlar > Kayit Klasorleri > Beyanname Klasoru'nden okunur;
//    ayar yoksa yardimci varsayilan G:\Drive'im\BEYANNAME kullanir.
export async function beyannameGeciciOku(mukellefAd, yil, donem) {
  let kok
  try {
    const k = await kayitKlasorleriGetir()
    kok = k.beyannameKlasoru
  } catch { /* ayar okunamazsa yardimci varsayilani kullanir */ }
  return gibYardimciIs('beyanname-gecici-oku', { mukellefAd, yil, donem, kok }, 60 * 1000)
}

// 6) ADI ORTAKLIK: ortaklik dosyasindaki hesap ozeti bittikten sonra her
//    ortak icin ayri gecici vergi beyannamesi acar (kendi hesabima don ->
//    mukellef yonetimi -> VKN hizli gecis -> Beyannameler > Gecici Vergi ->
//    Olustur). vknler: ortaklarin TC/VKN listesi.
export function defterbeyanOrtaklikBeyanlari(vknler, yil, donemAy) {
  return gibYardimciIs('defterbeyan-ortaklik-beyanlari', { vknler, yil, donemAy }, 10 * 60 * 1000)
}

// 7) ADI ORTAKLIK adim-adim: TEK ortak icin kendi hesabima don -> mukellef
//    yonetimi -> VKN yaz -> hizli gecis -> Beyannameler > Gecici Vergi ->
//    yil/donem sec -> Olustur (doldurma ekrani acilir, orada durur).
//    Mevcut ortaklik isine tek VKN gonderilir — ayni adimlari tekrarlar.
export function defterbeyanOrtakGec(vkn, yil, donemAy) {
  return gibYardimciIs('defterbeyan-ortaklik-beyanlari', { vknler: [vkn], yil, donemAy }, 3 * 60 * 1000)
}

// Portal sekmelerini kapatir
export function defterbeyanKapat() {
  return gibYardimciIs('defterbeyan-kapat', {}, 30000)
}

// Yardimci programdan gelen ham ozeti normalize eder
export function ozetNormalize(res) {
  const o = res?.ozet || {}
  const n = (v) => (v == null ? null : Number(v))
  return {
    unvan: o.unvan || '',
    // Giderler sutunu
    donemBasiEmtia: n(o.donemBasiEmtia),
    satinAlinanEmtia: n(o.satinAlinanEmtia),
    giderler: n(o.giderler),
    amortisman: n(o.amortisman),
    // Gelirler sutunu
    donemSonuEmtia: n(o.donemSonuEmtia),
    hasilat: n(o.hasilat),
    digerGelirler: n(o.digerGelirler),
    zarar: n(o.zarar),
    kar: n(o.kar)
  }
}

// Kar oranina gore Donem Sonu Emtia Mevcudu hesabi (kullanici kurali):
//   Hasilat + Diger Gelirler BOS ise:
//     Donem Sonu Emtia = Donem Basi + Satin Alinan
//     Giderler (+ amortisman) dogrudan ZARAR; kar orani kullanilmaz.
//   Gelir varsa:
//     Hedef Brut Kar  = Gelir Tarafi (hasilat + diger gelirler) * oran / 100
//     Satilan Mal Maliyeti (SMM) = Gelir Tarafi - Hedef Brut Kar
//     Devreden Mal (Donem Sonu Emtia) = Toplam Mal (Donem Basi + Satin Alinan) - SMM
//     Net Kar/Zarar = Brut Kar - Giderler - Amortisman
//     Devreden mal eksiye dusmemeli: SMM <= Toplam Mal olmali ->
//       minOran = (Gelir - Toplam Mal) / Gelir * 100  (yuvarlanmis, yukari)
//     SMM eksiye dusmemeli -> maxOran = 100.
//     Oran aralik disindaysa devreden/smm 0'a cekilir ve kirpildi=true doner.
export function karOraniylaHesapla(ozet, oran) {
  const yuvarla = (x) => Math.round(x * 100) / 100
  const donemBasi = ozet.donemBasiEmtia || 0
  const satinAlinan = ozet.satinAlinanEmtia || 0
  const giderler = ozet.giderler || 0
  const amortisman = ozet.amortisman || 0
  const toplamMal = donemBasi + satinAlinan
  const gelirTarafi = (ozet.hasilat || 0) + (ozet.digerGelirler || 0)

  // KURAL (kullanici tanimi): Hasilat VE diger gelirler bos ise
  //   Donem Sonu Emtia = Donem Basi + Satin Alinan
  //   Giderler (+ amortisman) dogrudan ZARAR olarak islenir; kar orani kullanilmaz.
  if (gelirTarafi <= 0) {
    const zarar = yuvarla(giderler + amortisman)
    return { hedefKar: -zarar, smm: 0, donemSonu: yuvarla(toplamMal), brutKar: 0, netKar: -zarar, zarar, minOran: 0, maxOran: 100, kirpildi: false }
  }

  // Uygulanabilir kar orani araligi:
  //   minOran: devreden mal (donem sonu) 0'in altina dusmesin
  //   maxOran: satilan mal maliyeti 0'in altina dusmesin
  const minOran = yuvarla(Math.ceil(Math.max(0, (1 - toplamMal / gelirTarafi) * 100) * 100) / 100)
  const maxOran = 100
  const oranSayi = Number(oran) || 0
  const kirpildi = oranSayi < minOran || oranSayi > maxOran

  // Gelir varsa: hedef brut kar hasilat uzerinden, devreden toplam mal - SMM
  const hedefBrutKar = yuvarla(gelirTarafi * oranSayi / 100)
  let smm = yuvarla(gelirTarafi - hedefBrutKar)
  let donemSonu = yuvarla(toplamMal - smm)
  let brutKar = hedefBrutKar
  if (donemSonu < 0) {
    donemSonu = 0
    smm = yuvarla(toplamMal)
    brutKar = yuvarla(gelirTarafi - toplamMal)
  }
  if (smm < 0) {
    smm = 0
    donemSonu = yuvarla(toplamMal)
    brutKar = yuvarla(gelirTarafi)
  }
  const netKar = yuvarla(brutKar - giderler - amortisman)
  return { hedefKar: brutKar, smm, donemSonu, brutKar, netKar, zarar: netKar < 0 ? Math.abs(netKar) : 0, minOran, maxOran, kirpildi }
}
