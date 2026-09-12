// Türkiye resmi tatilleri — sabit günler + yıla göre değişen dini bayramlar (2025-2027)
// Arife günleri yarım gün tatil olduğu için izin hesabına dahil edilmez
export const RESMI_TATILLER = {
  // ---- 2025 ----
  '2025-01-01': 'Yılbaşı',
  '2025-03-30': 'Ramazan Bayramı (1. Gün)',
  '2025-03-31': 'Ramazan Bayramı (2. Gün)',
  '2025-04-01': 'Ramazan Bayramı (3. Gün)',
  '2025-04-23': 'Ulusal Egemenlik ve Çocuk Bayramı',
  '2025-05-01': 'Emek ve Dayanışma Günü',
  '2025-05-19': 'Atatürk\'ü Anma, Gençlik ve Spor Bayramı',
  '2025-06-06': 'Kurban Bayramı (1. Gün)',
  '2025-06-07': 'Kurban Bayramı (2. Gün)',
  '2025-06-08': 'Kurban Bayramı (3. Gün)',
  '2025-06-09': 'Kurban Bayramı (4. Gün)',
  '2025-07-15': 'Demokrasi ve Milli Birlik Günü',
  '2025-08-30': 'Zafer Bayramı',
  '2025-10-29': 'Cumhuriyet Bayramı',
  // ---- 2026 ----
  '2026-01-01': 'Yılbaşı',
  '2026-03-20': 'Ramazan Bayramı (1. Gün)',
  '2026-03-21': 'Ramazan Bayramı (2. Gün)',
  '2026-03-22': 'Ramazan Bayramı (3. Gün)',
  '2026-04-23': 'Ulusal Egemenlik ve Çocuk Bayramı',
  '2026-05-01': 'Emek ve Dayanışma Günü',
  '2026-05-19': 'Atatürk\'ü Anma, Gençlik ve Spor Bayramı',
  '2026-05-27': 'Kurban Bayramı (1. Gün)',
  '2026-05-28': 'Kurban Bayramı (2. Gün)',
  '2026-05-29': 'Kurban Bayramı (3. Gün)',
  '2026-05-30': 'Kurban Bayramı (4. Gün)',
  '2026-07-15': 'Demokrasi ve Milli Birlik Günü',
  '2026-08-30': 'Zafer Bayramı',
  '2026-10-29': 'Cumhuriyet Bayramı',
  // ---- 2027 ----
  '2027-01-01': 'Yılbaşı',
  '2027-03-10': 'Ramazan Bayramı (1. Gün)',
  '2027-03-11': 'Ramazan Bayramı (2. Gün)',
  '2027-03-12': 'Ramazan Bayramı (3. Gün)',
  '2027-04-23': 'Ulusal Egemenlik ve Çocuk Bayramı',
  '2027-05-01': 'Emek ve Dayanışma Günü',
  '2027-05-16': 'Kurban Bayramı (1. Gün)',
  '2027-05-17': 'Kurban Bayramı (2. Gün)',
  '2027-05-18': 'Kurban Bayramı (3. Gün)',
  '2027-05-19': 'Kurban Bayramı (4. Gün)',
  '2027-07-15': 'Demokrasi ve Milli Birlik Günü',
  '2027-08-30': 'Zafer Bayramı',
  '2027-10-29': 'Cumhuriyet Bayramı'
}

// Hafta tatili kontrolü (İş Kanunu'na göre yalnızca Pazar günü hafta tatilidir)
export function isWeekend(date) {
  return date.getDay() === 0 // 0=Pazar; Cumartesi iş günü sayılır
}

// Vergi takvimi icin hafta sonu kontrolu (Cumartesi + Pazar)
export function isVergiHaftaSonu(date) {
  return date.getDay() === 0 || date.getDay() === 6
}

// İş günü mü kontrol et (hafta sonu + resmi tatil hariç)
export function isBusinessDay(date) {
  return !isWeekend(date) && !isResmiTatil(date)
}

// İzin başlangıç tarihi ve gün sayısına göre bitiş tarihi hesapla
// Başlangıç günü dahil, hafta sonları ve resmi tatiller düşülür
export function hesaplaIzinBitis(baslangic, gunSayisi) {
  if (!baslangic || !gunSayisi || gunSayisi < 1) return ''
  const start = new Date(baslangic)
  if (Number.isNaN(start.getTime())) return ''

  let kalan = Number(gunSayisi)
  const current = new Date(start)

  // Başlangıç günü iş günü değilse ilk iş gününe kaydır
  while (!isBusinessDay(current)) {
    current.setDate(current.getDate() + 1)
  }
  kalan -= 1 // Başlangıç günü sayıldı

  while (kalan > 0) {
    current.setDate(current.getDate() + 1)
    if (isBusinessDay(current)) kalan -= 1
  }

  const y = current.getFullYear()
  const m = String(current.getMonth() + 1).padStart(2, '0')
  const d = String(current.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// İzin bitiş tarihinden sonraki ilk iş gününü bul (işe dönüş tarihi)
export function hesaplaIseDonus(bitis) {
  if (!bitis) return ''
  const next = new Date(bitis)
  next.setDate(next.getDate() + 1)
  while (!isBusinessDay(next)) {
    next.setDate(next.getDate() + 1)
  }
  const y = next.getFullYear()
  const m = String(next.getMonth() + 1).padStart(2, '0')
  const d = String(next.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Resmi tatil mi kontrol et
export function isResmiTatil(date) {
  // toISOString() UTC'ye cevirir ve Turkiye (UTC+3) icin 1 gun geriye kayar; yerel tarih kullan
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return RESMI_TATILLER[`${y}-${m}-${d}`] !== undefined
}

// Bir sonraki iş gününü bul (izin/kidem hesaplarinda kullanilir, yalnizca Pazar)
export function getNextWorkDay(date) {
  const nextDay = new Date(date)
  nextDay.setDate(nextDay.getDate() + 1)

  while (isWeekend(nextDay) || isResmiTatil(nextDay)) {
    nextDay.setDate(nextDay.getDate() + 1)
  }
  return nextDay
}

// Vergi takvimi icin bir sonraki is gununu bul (Cumartesi de hafta sonu sayilir)
export function getNextVergiWorkDay(date) {
  const nextDay = new Date(date)
  nextDay.setDate(nextDay.getDate() + 1)
  while (isVergiHaftaSonu(nextDay) || isResmiTatil(nextDay)) {
    nextDay.setDate(nextDay.getDate() + 1)
  }
  return nextDay
}

// Ayin son is gununu hesapla (Cumartesi/Pazar ve resmi tatiller haric, geriye dogru erteleme)
export function getLastBusinessDayOfMonth(year, month) {
  const date = new Date(year, month + 1, 0) // ayin son gunu
  while (isVergiHaftaSonu(date) || isResmiTatil(date)) {
    date.setDate(date.getDate() - 1)
  }
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Beyan son tarihini hesapla (hafta sonu/tatil kontrolu ile)
// Vergi odemelerinde Cumartesi de hafta sonu sayilir ve takip eden ilk is gunune ertelenir.
export function getBeyanDeadline(year, month, day) {
  const date = new Date(year, month, day)

  while (isVergiHaftaSonu(date) || isResmiTatil(date)) {
    date.setDate(date.getDate() + 1)
  }
  return date
}

// Beyan son tarihini formatlı döndür
export function getFormattedBeyanDeadline(year, month, day) {
  const date = getBeyanDeadline(year, month, day)
  // toISOString() UTC'ye cevirir ve 1 gun eksik gosterebilir; yerel tarih kullan
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatDateTR(value) {
  if (!value) return '-'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}.${month}.${date.getFullYear()}`
}

export function formatDateTimeTR(value) {
  if (!value) return '-'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return `${formatDateTR(date)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

// Beyan türüne göre son tarihi hesapla
// mukellefTipi: 'individual' (gelir vergisi mükellefi) | 'company' (kurumlar vergisi mükellefi)
export function getBeyanDeadlineByType(beyanType, year, month, mukellefTipi = 'company') {
  const deadlines = {
    'kdv': { day: 28 },
    'kdv2': { day: 25 },
    'muhtasar': { day: 26 },
    'sgk': { lastBusinessDay: true }, // SGK prim odemeleri ayin son is gunu
  }

  const sahis = mukellefTipi === 'individual'

  // e-Defter son tarihleri (GIB takvimi)
  // Aylik: takip eden 3. ayin sonu (ornek: Ocak defteri -> Nisan 30)
  const eDefterAylik = {
    0: { submitMonth: 3, day: 30 },  // Ocak -> Nisan 30
    1: { submitMonth: 4, day: 31 },  // Subat -> Mayis 31
    2: { submitMonth: 5, day: 30 },  // Mart -> Haziran 30
    3: { submitMonth: 6, day: 31 },  // Nisan -> Temmuz 31
    4: { submitMonth: 7, day: 31 },  // Mayis -> Agustos 31
    5: { submitMonth: 8, day: 30 },  // Haziran -> Eylul 30
    6: { submitMonth: 9, day: 31 },  // Temmuz -> Ekim 31
    7: { submitMonth: 10, day: 30 }, // Agustos -> Kasim 30
    8: { submitMonth: 11, day: 31 }, // Eylul -> Aralik 31
    9: { submitMonth: 0, day: 31, yearOffset: 1 },  // Ekim -> Ocak 31 (sonraki yil)
    10: { submitMonth: 1, day: 28, yearOffset: 1 }, // Kasim -> Subat 28
    11: { submitMonth: 2, day: 31, yearOffset: 1 }, // Aralik -> Mart 31
  }

  // 3 Aylik e-Defter berat takvimi (anahtar: ceyregin SON ayi)
  // Gelir vergisi mukellefi ayin 10'u, kurumlar vergisi mukellefi ayin 14'u
  //   Ocak-Mart     -> 10 / 14 Haziran
  //   Nisan-Haziran -> 10 / 14 Eylul
  //   Temmuz-Eylul  -> 10 / 14 Aralik
  //   Ekim-Aralik   -> yillik beyannameyi takip eden ay: sahis 10 Nisan, sirket 14 Mayis
  const eDefter3Aylik = {
    2:  { submitMonth: 5,  day: sahis ? 10 : 14 },
    5:  { submitMonth: 8,  day: sahis ? 10 : 14 },
    8:  { submitMonth: 11, day: sahis ? 10 : 14 },
    11: { submitMonth: sahis ? 3 : 4, day: sahis ? 10 : 14, yearOffset: 1 },
  }

  const specialDeadlines = {
    'gecici_vergi': {
      months: [1, 4, 7, 10],
      day: 17
    },
    'kurumlar_vergi': {
      months: [3],
      day: 30
    },
    'gelir_vergi': {
      months: [2],
      day: 31
    },
    'muhtasar_3aylik': {
      months: [3, 6, 9, 0],
      day: 26
    }
  }

  // e-Defter ozel islem
  if (beyanType === 'edefter' || beyanType === 'edefter_aylik') {
    const config = eDefterAylik[month]
    if (config) {
      const y = year + (config.yearOffset || 0)
      return getFormattedBeyanDeadline(y, config.submitMonth, config.day)
    }
    return null
  }

  if (beyanType === 'edefter_3aylik') {
    const config = eDefter3Aylik[month]
    if (config) {
      const y = year + (config.yearOffset || 0)
      return getFormattedBeyanDeadline(y, config.submitMonth, config.day)
    }
    return null
  }

  if (specialDeadlines[beyanType]) {
    const special = specialDeadlines[beyanType]
    if (special.months.includes(month)) {
      return getFormattedBeyanDeadline(year, month, special.day)
    }
    return null
  }

  if (deadlines[beyanType]) {
    if (deadlines[beyanType].lastBusinessDay) {
      return getLastBusinessDayOfMonth(year, month)
    }
    return getFormattedBeyanDeadline(year, month, deadlines[beyanType].day)
  }

  return null
}

// Beyan türünün hangi aylarda verildiğini kontrol et
export function isBeyanActive(beyanType, month) {
  if (beyanType === 'gecici_vergi') {
    return [1, 4, 7, 10].includes(month)
  }
  if (beyanType === 'kurumlar_vergi') {
    return month === 3
  }
  if (beyanType === 'gelir_vergi') {
    return month === 2
  }
  if (beyanType === 'muhtasar_3aylik') {
    return [3, 6, 9, 0].includes(month)
  }
  return true
}

// Beyanın ait olduğu ayı hesapla (Temmuz'da Haziran beyanı)
export function getBeyanAitAy(selectedMonth) {
  let aitMonth = selectedMonth - 1
  let aitYear = 0

  if (aitMonth < 0) {
    aitMonth = 11
    aitYear = -1
  }

  return { aitMonth, aitYear }
}

/**
 * Vergi takvimindeki son tarih ayına gore beyan_durumlari anahtarini uret.
 * Admin panelindeki AylikBeyanTakip ile ayni key formatini kullanir.
 */
export function getBeyanStorageKey(beyanType, filingYear, filingMonth) {
  if (beyanType === 'sgk') {
    return {
      belongYear: filingYear,
      belongMonth: filingMonth,
      statusKey: `${filingYear}_${filingMonth}_${beyanType}`
    }
  }

  if (['kdv', 'kdv2', 'muhtasar'].includes(beyanType)) {
    const { aitMonth, aitYear } = getBeyanAitAy(filingMonth)
    const belongYear = filingYear + aitYear
    return {
      belongYear,
      belongMonth: aitMonth,
      statusKey: `${belongYear}_${aitMonth}_${beyanType}`
    }
  }

  if (beyanType === 'gecici_vergi') {
    const geciciMap = {
      1: { belongMonth: 9, yearAdj: -1 },
      4: { belongMonth: 0, yearAdj: 0 },
      7: { belongMonth: 3, yearAdj: 0 },
      10: { belongMonth: 6, yearAdj: 0 }
    }
    const cfg = geciciMap[filingMonth]
    if (!cfg) return null
    const belongYear = filingYear + cfg.yearAdj
    return {
      belongYear,
      belongMonth: cfg.belongMonth,
      statusKey: `${belongYear}_${cfg.belongMonth}_${beyanType}`
    }
  }

  if (beyanType === 'gelir_vergi') {
    const belongYear = filingYear - 1
    return {
      belongYear,
      belongMonth: 0,
      statusKey: `${belongYear}_0_${beyanType}`
    }
  }

  if (beyanType === 'kurumlar_vergi') {
    const belongYear = filingYear - 1
    return {
      belongYear,
      belongMonth: 0,
      statusKey: `${belongYear}_0_${beyanType}`
    }
  }

  return {
    belongYear: filingYear,
    belongMonth: filingMonth,
    statusKey: `${filingYear}_${filingMonth}_${beyanType}`
  }
}

// Beyan türüne göre açıklama getir
export function getBeyanAciklama(beyanType) {
  const aciklamalar = {
    'kdv': 'Her ayın 28\'i (bir önceki ay beyanı)',
    'kdv2': 'Her ayın 25\'i (bir önceki ay beyanı)',
    'muhtasar': 'Her ayın 26\'sı (bir önceki ay beyanı)',
    'sgk': 'Her ayın son iş günü (hafta sonu/tatilde geriye ertelenir)',
    'edefter': 'Aylık: ilgili ayı takip eden 3. ayın sonu · 3 Aylık: dönemi takip eden 3. ayın 10/14\'ü',
    'edefter_3aylik': 'Ocak-Mart 10/14 Haziran, Nisan-Haziran 10/14 Eylül, Temmuz-Eylül 10/14 Aralık, Ekim-Aralık 10 Nisan / 14 Mayıs',
    'gecici_vergi': 'Şubat 17, Mayıs 17, Ağustos 17, Kasım 17',
    'kurumlar_vergi': 'Nisan 30',
    'gelir_vergi': 'Mart 31',
    'muhtasar_3aylik': 'Nisan 26, Temmuz 26, Ekim 26, Ocak 26',
  }
  return aciklamalar[beyanType] || ''
}

// Ayın Türkçe ismini getir
export function getMonthName(month) {
  const months = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
  ]
  return months[month] || ''
}
