import { kapanisSonrasiAy, acilisOncesiAy } from './beyanKapanis.js'

export const aylikDonem = (yil, ay) => `${yil}-${String(ay).padStart(2, '0')}`
export const tasdikDonemi = (yil) => `Defter Tasdik ${yil}`
const aylar = Array.from({ length: 12 }, (_, index) => index + 1)
const aylikDonemDeseni = /^([1-9]\d{3})-(0[1-9]|1[0-2])$/
const tutar = (deger) => Math.round(Math.max(0, Number(deger) || 0) * 100)

function aylikTarife(fee) {
  if (!fee) return []
  const eskiAnahtar = aylikDonem(Number(fee.baslangic_yil), Number(fee.baslangic_ay) || 1)
  const eskiTarife = tutar(fee.aylik_ucret) && aylikDonemDeseni.test(eskiAnahtar) ? { [eskiAnahtar]: fee.aylik_ucret } : {}
  return Object.entries({ ...eskiTarife, ...fee.aylik_tarifeler })
    .filter(([donem]) => aylikDonemDeseni.test(donem)).sort(([ilk], [ikinci]) => ikinci.localeCompare(ilk))
}

export function aylikUcretGetir(fee, yil, ay) {
  const donem = aylikDonem(yil, ay)
  if (!aylikDonemDeseni.test(donem)) return 0
  return tutar(aylikTarife(fee).find(([baslangic]) => baslangic <= donem)?.[1]) / 100
}

export function defterTasdikUcretiGetir(fee, yil) {
  const eskiTutar = yil === Number(fee?.baslangic_yil) ? fee?.defter_tasdik_ucreti : 0
  return tutar(fee?.tasdik_tarifeleri?.[yil] ?? eskiTutar) / 100
}

export function normalizeDonem(deger) {
  const metin = String(deger || '').trim()
  if (/önceki|onceki/i.test(metin)) return 'Onceki Donem'
  if (/defter|tasdik/i.test(metin)) {
    const yil = metin.match(/\b[1-9]\d{3}\b/)?.[0]
    return yil ? tasdikDonemi(yil) : 'Defter Tasdik'
  }
  const ileri = metin.match(/^(\d{4})[\s/.-](\d{1,2})$/)
  const geri = metin.match(/^(\d{1,2})[\s/.-](\d{4})$/)
  return ileri ? aylikDonem(ileri[1], ileri[2]) : geri ? aylikDonem(geri[2], geri[1]) : metin
}

export function odemeDonemi(payment) {
  const donem = normalizeDonem(payment.donem)
  if (donem !== 'Defter Tasdik') return donem
  const yil = String(payment.odeme_tarihi || '').match(/^([1-9]\d{3})-/)?.[1]
  return yil ? tasdikDonemi(yil) : donem
}

export const tahsilEdildi = (payment) => payment.durum !== 'reddedildi' &&
  (['onaylandi', 'uygulandi', 'alindi'].includes(payment.durum) || !payment.durum || payment.odeme_kanali === 'manuel')

export function hesaplaBorcOzeti(fee, payments = [], referansTarih = new Date(), client = null, yil = referansTarih.getFullYear()) {
  const uygulanan = (fee ? payments : []).filter(tahsilEdildi)
  const tahsilatlar = new Map()
  for (const payment of uygulanan) {
    const donem = odemeDonemi(payment)
    tahsilatlar.set(donem, (tahsilatlar.get(donem) || 0) + tutar(payment.tutar))
  }
  const tarife = aylikTarife(fee)
  const aktifAy = (hedefYil, ay) => !acilisOncesiAy(client, hedefYil, ay) && !kapanisSonrasiAy(client, hedefYil, ay)
  const sonAy = (hedefYil) => hedefYil < referansTarih.getFullYear() ? 12
    : hedefYil === referansTarih.getFullYear() ? referansTarih.getMonth() + 1 : 0
  const kalem = (donem, borc) => {
    const odenen = Math.min(borc, tahsilatlar.get(donem) || 0)
    return { donem, borc: borc / 100, odenen: odenen / 100, kalan: (borc - odenen) / 100 }
  }
  const yilKalemleri = (hedefYil) => {
    const aylik = aylar.filter(ay => aktifAy(hedefYil, ay)).map(ay => {
      const donem = aylikDonem(hedefYil, ay)
      const tarifeTutari = tutar(tarife.find(([baslangic]) => baslangic <= donem)?.[1])
      return { ...kalem(donem, ay <= sonAy(hedefYil) ? tarifeTutari : 0), ay, tarife: tarifeTutari / 100 }
    })
    const tasdik = kalem(tasdikDonemi(hedefYil), aylik.some(({ ay }) => ay <= sonAy(hedefYil)) ? tutar(defterTasdikUcretiGetir(fee, hedefYil)) : 0)
    return { aylik, tasdik }
  }
  const topla = (kalemler, alan) => kalemler.reduce((toplam, kayit) => toplam + tutar(kayit[alan]), 0)
  const guncel = yilKalemleri(yil)
  const ilkYil = Math.min(yil, ...tarife.map(([donem]) => Number(donem.slice(0, 4))),
    Number(fee?.baslangic_yil) || yil, ...Object.keys(fee?.tasdik_tarifeleri || {}).filter(deger => /^[1-9]\d{3}$/.test(deger)).map(Number))
  const gecmisKalemler = []
  for (let gecmisYil = ilkYil; gecmisYil < yil && gecmisYil <= referansTarih.getFullYear(); gecmisYil++) {
    const gecmis = yilKalemleri(gecmisYil)
    gecmisKalemler.push(...gecmis.aylik.filter(ay => ay.borc > 0))
    if (gecmis.tasdik.borc > 0) gecmisKalemler.push(gecmis.tasdik)
  }
  const onceki = kalem('Onceki Donem', tutar(fee?.onceki_donem_borc) + topla(gecmisKalemler, 'kalan'))
  const ayKalemleri = guncel.aylik.filter(ay => ay.borc > 0)
  const kalemler = [onceki, guncel.tasdik, ...ayKalemleri]
  const aylikTutarlar = Object.fromEntries(guncel.aylik.map(({ ay, tarife: bedel }) => [ay, bedel]))
  const durumToplami = (durum) => (fee ? payments : []).filter(payment => payment.durum === durum)
    .reduce((toplam, payment) => toplam + tutar(payment.tutar), 0) / 100
  return {
    yil, aylikTutarlar, ayKalemleri, gecmisKalemler,
    oncekiDonem: onceki.borc, oncekiDonemToplam: onceki.borc, oncekiKalan: onceki.kalan,
    defterTasdik: guncel.tasdik.borc, defterKalan: guncel.tasdik.kalan,
    aylikUcret: guncel.aylik.filter(kayit => kayit.ay <= (sonAy(yil) || 12)).at(-1)?.tarife || 0,
    gecenAy: ayKalemleri.length, aylikToplam: topla(ayKalemleri, 'borc') / 100, aylikKalan: topla(ayKalemleri, 'kalan') / 100,
    toplamBorc: topla(kalemler, 'borc') / 100, toplamOdeme: topla(kalemler, 'odenen') / 100, kalanBorc: topla(kalemler, 'kalan') / 100,
    alindiOdeme: durumToplami('alindi'), bekleyenOdeme: durumToplami('bekliyor'), reddedilenOdeme: durumToplami('reddedildi'),
    sonOdeme: uygulanan[0]?.odeme_tarihi || null,
    odenenAylar: ayKalemleri.filter(ay => ay.kalan === 0).map(ay => ay.ay),
    odenmeyenAylar: ayKalemleri.filter(ay => ay.kalan > 0).map(ay => ay.ay)
  }
}
