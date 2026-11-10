// 2.8.320: Otomatik plan (borç / POS-KDV) gün+saat dilimleri.
// Her dilim iki moddan birini taşır:
//   günlük  -> { mod:'gunluk',  gunler_ay:[18,27], saat:'06:00' }  (ayın günleri 1-31)
//   haftalık-> { mod:'haftalik', hafta_gunleri:[1,3,5], saat:'06:00' } (1=Pzt ... 7=Paz)
// Eski kayıtlarda mod alanı yoktur; gunler_ay doluysa günlük kabul edilir.

export const HAFTA_GUNLERI = [
  { v: 1, k: 'Pzt', e: 'Pazartesi' },
  { v: 2, k: 'Sal', e: 'Salı' },
  { v: 3, k: 'Çar', e: 'Çarşamba' },
  { v: 4, k: 'Per', e: 'Perşembe' },
  { v: 5, k: 'Cum', e: 'Cuma' },
  { v: 6, k: 'Cmt', e: 'Cumartesi' },
  { v: 7, k: 'Paz', e: 'Pazar' }
]

const saatGecerli = (v) => /^\d{1,2}:\d{2}$/.test(String(v || ''))

export function dilimModu(z) {
  return z?.mod === 'haftalik' ? 'haftalik' : 'gunluk'
}

// ISO hafta günü: 1=Pazartesi ... 7=Pazar
export function bugunHaftaGunu() {
  const g = new Date().getDay()
  return g === 0 ? 7 : g
}

export function gunleriAyNormalize(liste) {
  return Array.isArray(liste)
    ? [...new Set(liste.map(Number).filter(n => n >= 1 && n <= 31))].sort((a, b) => a - b)
    : []
}

export function haftaGunleriniNormalize(liste) {
  return Array.isArray(liste)
    ? [...new Set(liste.map(Number).filter(n => n >= 1 && n <= 7))].sort((a, b) => a - b)
    : []
}

// Tek dilimi kayıt/şema biçimine getirir. Moduna göre yalnız ilgili gün
// alanı dolu kalır; böylece eski tüketiciler (gunler_ay okuyanlar) bozulmaz.
export function dilimNormalize(z, varsayilanSaat = '06:00') {
  const mod = dilimModu(z)
  const saat = saatGecerli(z?.saat) ? z.saat : varsayilanSaat
  if (mod === 'haftalik') {
    return { mod: 'haftalik', gunler_ay: [], hafta_gunleri: haftaGunleriniNormalize(z?.hafta_gunleri), saat }
  }
  return { mod: 'gunluk', gunler_ay: gunleriAyNormalize(z?.gunler_ay), hafta_gunleri: [], saat }
}

export function dilimGecerli(z) {
  if (!z || !saatGecerli(z.saat)) return false
  return dilimModu(z) === 'haftalik'
    ? haftaGunleriniNormalize(z.hafta_gunleri).length > 0
    : gunleriAyNormalize(z.gunler_ay).length > 0
}

// Yükleme sırasında aylık çok günlü dilimleri gün başına ayrı satıra böler
// (18, 27, 30 ayrı satırlar). Haftalık dilim tek satır olarak kalır.
export function dilimleriGunlereBol(liste, varsayilanSaat = '06:00') {
  const cikti = []
  for (const z of Array.isArray(liste) ? liste : []) {
    const mod = dilimModu(z)
    const saat = saatGecerli(z?.saat) ? z.saat : varsayilanSaat
    if (mod === 'haftalik') {
      cikti.push({ mod: 'haftalik', gunler_ay: [], hafta_gunleri: haftaGunleriniNormalize(z?.hafta_gunleri), saat })
      continue
    }
    const gunler = gunleriAyNormalize(z?.gunler_ay)
    if (!gunler.length) cikti.push({ mod: 'gunluk', gunler_ay: [], hafta_gunleri: [], saat })
    else for (const gun of gunler) cikti.push({ mod: 'gunluk', gunler_ay: [gun], hafta_gunleri: [], saat })
  }
  return cikti
}

export function dilimOzet(z) {
  const mod = dilimModu(z)
  if (mod === 'haftalik') {
    const adlar = HAFTA_GUNLERI.filter(g => haftaGunleriniNormalize(z?.hafta_gunleri).includes(g.v)).map(g => g.k)
    return adlar.length ? `Haftalık: ${adlar.join(', ')} ${z?.saat || ''}`.trim() : 'Haftalık: gün seçilmedi'
  }
  const gunler = gunleriAyNormalize(z?.gunler_ay)
  return gunler.length ? `Günlük: ${gunler.join(', ')} ${z?.saat || ''}`.trim() : 'Günlük: gün seçilmedi'
}
