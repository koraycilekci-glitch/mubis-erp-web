// Türkiye resmi tatilleri (2026)
export const RESMI_TATILLER = {
  '2026-01-01': 'Yılbaşı',
  '2026-04-23': 'Ulusal Egemenlik ve Çocuk Bayramı',
  '2026-05-01': 'Emek ve Dayanışma Günü',
  '2026-05-19': 'Atatürk\'ü Anma, Gençlik ve Spor Bayramı',
  '2026-07-15': 'Demokrasi ve Milli Birlik Günü',
  '2026-08-30': 'Zafer Bayramı',
  '2026-10-29': 'Cumhuriyet Bayramı',
  // Ramazan ve Kurban Bayramı (2026 yaklaşık tarihler)
  '2026-02-18': 'Ramazan Bayramı (1. Gün)',
  '2026-02-19': 'Ramazan Bayramı (2. Gün)',
  '2026-02-20': 'Ramazan Bayramı (3. Gün)',
  '2026-04-26': 'Kurban Bayramı (1. Gün)',
  '2026-04-27': 'Kurban Bayramı (2. Gün)',
  '2026-04-28': 'Kurban Bayramı (3. Gün)',
  '2026-04-29': 'Kurban Bayramı (4. Gün)',
}

// Hafta sonu mu kontrol et
export function isWeekend(date) {
  const day = date.getDay()
  return day === 0 || day === 6 // 0=Pazar, 6=Cumartesi
}

// Resmi tatil mi kontrol et
export function isResmiTatil(date) {
  const dateStr = date.toISOString().split('T')[0]
  return RESMI_TATILLER[dateStr] !== undefined
}

// Bir sonraki iş gününü bul
export function getNextWorkDay(date) {
  const nextDay = new Date(date)
  nextDay.setDate(nextDay.getDate() + 1)
  
  while (isWeekend(nextDay) || isResmiTatil(nextDay)) {
    nextDay.setDate(nextDay.getDate() + 1)
  }
  return nextDay
}

// Beyan son tarihini hesapla (hafta sonu/tatil kontrolü ile)
export function getBeyanDeadline(year, month, day) {
  const date = new Date(year, month, day)
  
  if (isWeekend(date) || isResmiTatil(date)) {
    return getNextWorkDay(date)
  }
  return date
}

// Beyan son tarihini formatlı döndür
export function getFormattedBeyanDeadline(year, month, day) {
  const date = getBeyanDeadline(year, month, day)
  return date.toISOString().split('T')[0]
}

// Beyan türüne göre son tarihi hesapla
export function getBeyanDeadlineByType(beyanType, year, month) {
  const deadlines = {
    'kdv': { day: 28 },
    'kdv2': { day: 25 },
    'muhtasar': { day: 26 },
    'sgk': { day: 26 },
  }
  
  // e-Defter son tarihleri (GIB takvimi)
  // Aylik: takip eden 3. ayin sonu (ornek: Ocak defteri -> Nisan 30)
  // 3 Aylik: ceyrek sonrasi 3. ayin sonu (ornek: Ocak-Mart -> Haziran 30)
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

  const eDefter3Aylik = {
    2: { submitMonth: 5, day: 30 },  // Ocak-Mart -> Haziran 30
    5: { submitMonth: 8, day: 30 },  // Nisan-Haziran -> Eylul 30
    8: { submitMonth: 11, day: 31 }, // Temmuz-Eylul -> Aralik 31
    11: { submitMonth: 2, day: 31, yearOffset: 1 }, // Ekim-Aralik -> Mart 31
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

// Beyan türüne göre açıklama getir
export function getBeyanAciklama(beyanType) {
  const aciklamalar = {
    'kdv': 'Her ayın 28\'i (bir önceki ay beyanı)',
    'kdv2': 'Her ayın 25\'i (bir önceki ay beyanı)',
    'muhtasar': 'Her ayın 26\'sı (bir önceki ay beyanı)',
    'sgk': 'Her ayın 26\'sı (bir önceki ay beyanı)',
    'edefter': 'Her ayın 30\'u (bir önceki ay beyanı)',
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