import { parseTurkishNumber } from '../../utils/numberFormat'
import * as D from '../../data/defaults'

export const currentYear = new Date().getFullYear()

export const createEmployeeForm = () => ({
  ad_soyad: '',
  tc_kimlik: '',
  ise_giris_tarihi: '',
  cikis_tarihi: '',
  dogum_tarihi: '',
  departman: '',
  gorev: '',
  email: '',
  telefon: '',
  adres: '',
  aktif: true,
  ucret_tipi: 'brut',
  net_ucret: '',
  brut_ucret: '',
  emekli_calisan_durumu: 'calisan',
  ise_giris_bildirgesi_url: '',
  isten_cikis_bildirgesi_url: '',
  gecmis_yil_izinleri_kullanildi: false,
  gecmis_yil_bakiyeleri: [{ yil: currentYear - 1, gun: 0 }]
})

export const createLeaveForm = () => ({
  employee_id: '',
  izin_turu: 'Yıllık İzin',
  baslangic_tarihi: '',
  bitis_tarihi: '',
  gun: 1,
  aciklama: ''
})

export const asArray = (value) => {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.data)) return value.data
  return []
}

export const numberValue = (value) => parseTurkishNumber(value)

export const dateValue = (value) => (value ? String(value).slice(0, 10) : '')

export const displayDate = (value) => {
  const normalized = dateValue(value)
  if (!normalized) return ''
  const [year, month, day] = normalized.split('-')
  if (!year || !month || !day) return normalized
  return `${day}.${month}.${year}`
}

export const employeeLabel = (employee) => employee?.ad_soyad || employee?.name || 'İsimsiz personel'

export const getSalaryType = (employee) => employee?.ucret_tipi
  || employee?.ucret_turu
  || (employee?.net_ucret || employee?.net_maas ? 'net' : 'brut')

// gecmis_yil_izinleri_kullanildi bazen veritabanindan boolean yerine
// "true"/"false" metni ya da 1/0 olarak donebiliyor; hepsini gercek boolean'a cevirir.
export const isPastLeaveCleared = (employee) => {
  const value = employee?.gecmis_yil_izinleri_kullanildi
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  if (typeof value === 'string') return value.trim().toLocaleLowerCase('tr-TR') === 'true' || value.trim() === '1'
  return false
}

// gecmis_yil_bakiyeleri bazen JSON metni olarak donebiliyor; guvenli sekilde diziye cevirir.
export const pastBalances = (employee) => {
  if (isPastLeaveCleared(employee)) return []
  let raw = employee?.gecmis_yil_bakiyeleri
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      raw = []
    }
  }
  return Array.isArray(raw)
    ? raw
      .map((item) => ({ yil: numberValue(item?.yil), gun: numberValue(item?.gun) }))
      .filter((item) => item.yil > 0)
    : []
}

export const getPastTotal = (employee) => pastBalances(employee)
  .reduce((total, item) => total + numberValue(item?.gun), 0)

// İş Kanunu'na göre izin türleri ve yasal süreler
export const IZIN_TURLERI = [
  {
    id: 'yillik',
    label: 'Yıllık Ücretli İzin',
    yasalGun: null,
    aciklama: 'Kıdeme göre: 1-5 yıl 14 gün, 5-15 yıl 20 gün, 15+ yıl 26 gün',
    ucretli: true,
    yillikBakiyedenDuser: true
  },
  {
    id: 'evlilik',
    label: 'Evlilik İzni',
    yasalGun: 3,
    aciklama: 'İş Kanunu Ek Md. 2 — işçinin evlenmesinde 3 gün ücretli izin',
    ucretli: true
  },
  {
    id: 'olum',
    label: 'Ölüm İzni',
    yasalGun: 3,
    aciklama: 'Anne, baba, eş, kardeş veya çocuk ölümünde 3 gün ücretli izin',
    ucretli: true
  },
  {
    id: 'babalik',
    label: 'Babalık İzni',
    yasalGun: 5,
    aciklama: 'Eşinin doğum yapması halinde 5 gün ücretli izin',
    ucretli: true
  },
  {
    id: 'analik',
    label: 'Analık İzni',
    yasalGun: 112,
    aciklama: '16 hafta (8 hafta doğum öncesi + 8 hafta doğum sonrası)',
    ucretli: true,
    takvimGunu: true
  },
  {
    id: 'hastalik',
    label: 'Hastalık İzni (Raporlu)',
    yasalGun: null,
    aciklama: 'SGK istirahat raporu süresine göre — rapor tarihleri girilir',
    ucretli: true,
    raporGerekli: true
  },
  {
    id: 'mazeret',
    label: 'Mazeret İzni',
    yasalGun: null,
    aciklama: 'Ücretli mazeret izni',
    ucretli: true
  },
  {
    id: 'ucretsiz',
    label: 'Ücretsiz İzin',
    yasalGun: null,
    aciklama: 'Ücretsiz izin — yıllık izin bakiyesinden düşülmez',
    ucretli: false
  }
]

export const izinTuruBul = (value) => {
  const text = String(value || '').toLocaleLowerCase('tr-TR').trim()
  return IZIN_TURLERI.find((tur) => tur.id === text || tur.label.toLocaleLowerCase('tr-TR') === text) || null
}

// Kayıt yıllık ücretli izin bakiyesinden düşer mi?
// (Evlilik, ölüm, babalık, analık, hastalık vb. izinler yıllık izinden DÜŞÜLMEZ — İş K. Md. 55)
export const isYillikIzinKaydi = (record) => {
  const text = String(record?.izin_turu || '').toLocaleLowerCase('tr-TR').trim()
  if (!text) return true // türü belirtilmemiş eski kayıtlar yıllık izin sayılır
  return text === 'yillik' || text.includes('yıllık') || text.includes('yillik')
}

// Bir izin kaydının tür bazlı gün sayısı
export const leaveRecordDaysByType = (record) => ({
  gun: numberValue(record?.gun ?? record?.is_gunu),
  tur: izinTuruBul(record?.izin_turu)
})

export const money = (value) => Number(value || 0).toLocaleString('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export const dateDifferenceInYears = (start, end) => {
  if (!start || !end) return 0
  return Math.max(0, (new Date(end) - new Date(start)) / (365.25 * 24 * 60 * 60 * 1000))
}

export const dateDifferenceInDays = (start, end) => {
  if (!start || !end) return 0
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0
  return Math.max(0, Math.floor((endDate - startDate) / (24 * 60 * 60 * 1000)) + 1)
}

export const employeeDate = (employee, ...keys) => {
  for (const key of keys) {
    if (employee?.[key]) return dateValue(employee[key])
  }
  return ''
}

export const leaveRecordEmployeeId = (record) => record?.employee_id ?? record?.employeeId

export const leaveRecordYear = (record) => Number(
  record?.yil ?? record?.year ?? new Date(record?.baslangic_tarihi ?? record?.baslangic ?? record?.bitis).getFullYear()
)

export const leaveRecordDays = (record) => {
  const explicitDays = record?.gun ?? record?.days ?? record?.is_gunu
  if (explicitDays !== undefined && explicitDays !== null && explicitDays !== '') {
    return numberValue(explicitDays)
  }
  return dateDifferenceInDays(
    record?.baslangic_tarihi ?? record?.baslangic,
    record?.bitis_tarihi ?? record?.bitis
  )
}

export const isAnnualLeave = (record) => {
  const type = String(record?.izin_turu ?? record?.izin_tipi ?? record?.leave_type ?? '').toLocaleLowerCase('tr-TR')
  if (!type) return true
  return type.includes('yıllık') || type.includes('yillik') || type.includes('annual')
}

export const clientName = (client) => client?.name || client?.unvan || client?.company || `Müşteri #${client?.id}`

export const getEmployeeName = (employees, employeeId) => (
  employeeLabel((employees || []).find((employee) => String(employee.id) === String(employeeId)))
)

// Personelin işe giriş tarihinden itibaren, verilen referans tarihine kadar
// kümülatif hak ettiği yıllık izin gün sayısı
const cumulativeEntitlement = (employee, refDate) => {
  const startDate = employeeDate(employee, 'ise_giris', 'ise_giris_tarihi', 'iseGiris')
  if (!startDate || !refDate) return 0
  const start = new Date(startDate)
  const ref = new Date(refDate)
  if (ref < start) return 0

  let total = 0
  const startYear = start.getFullYear()
  const refYear = ref.getFullYear()

  for (let year = startYear; year <= refYear; year += 1) {
    const yearEnd = new Date(year, 11, 31)
    const point = year === refYear ? ref : (yearEnd > ref ? ref : yearEnd)
    const yil = (point - start) / (365.25 * 24 * 60 * 60 * 1000)
    if (yil >= 1) {
      let gun = 0
      if (yil >= 15) gun = 26
      else if (yil >= 5) gun = 20
      else gun = 14

      if (employee?.dogum_tarihi) {
        const dogum = new Date(employee.dogum_tarihi)
        const yas = (point - dogum) / (365.25 * 24 * 60 * 60 * 1000)
        if (yas < 18 || yas >= 50) gun = Math.max(gun, 20)
      }
      total += gun
    }
  }
  return total
}

/**
 * Bir personel için işe giriş yılından (ya da işten çıkış / bugüne kadar) her yıl için
 * yıl bazlı Hak Edilen / Kullanılan / Devreden(Kalan) izin tablosunu üretir.
 * Kullanılan gün sayısı, o yıla ait "Yıllık İzin" türündeki kayıtlardan hesaplanır.
 * Geçmiş yıl bakiyesi (manuel giriş), personelin ilk izlenen yılına devir olarak eklenir.
 */
export function buildYearlyLeaveTable(employee, leaveRecords, { uptoYear } = {}) {
  if (!employee) return []
  const startDate = employeeDate(employee, 'ise_giris', 'ise_giris_tarihi', 'iseGiris')
  if (!startDate) return []

  const hireYear = new Date(startDate).getFullYear()
  const exitDate = employeeDate(employee, 'isten_cikis', 'cikis_tarihi')
  const exitYear = exitDate ? new Date(exitDate).getFullYear() : null
  const lastYear = uptoYear || exitYear || currentYear
  if (Number.isNaN(hireYear) || hireYear > lastYear) return []

  const employeeLeaveRecords = (leaveRecords || [])
    .filter((record) => String(leaveRecordEmployeeId(record)) === String(employee.id))
    .filter(isYillikIzinKaydi)

  const usedInYear = (year) => employeeLeaveRecords
    .filter((record) => leaveRecordYear(record) === year)
    .reduce((total, record) => total + leaveRecordDays(record), 0)

  const yearEndRef = (year) => {
    const dec31 = `${year}-12-31`
    const today = new Date().toISOString().slice(0, 10)
    let ref = dec31
    if (year === currentYear && dec31 > today) ref = today
    if (exitDate && ref > exitDate) ref = exitDate
    return ref
  }

  const rows = []
  const cleared = isPastLeaveCleared(employee)
  let carry = getPastTotal(employee) // önceki (izlenmeyen) yıllardan gelen devir bakiyesi

  for (let year = hireYear; year <= lastYear; year += 1) {
    // "Geçmiş yıl izinleri kullanıldı" işaretliyse önceki yıllardan devir alınmaz;
    // son (güncel ya da çıkış) yıla sıfır bakiye ile girilir.
    if (cleared && year === lastYear) carry = 0

    const ref = yearEndRef(year)
    const cumulative = cumulativeEntitlement(employee, ref)
    const prevRef = year === hireYear ? null : yearEndRef(year - 1)
    const prevCumulative = prevRef ? cumulativeEntitlement(employee, prevRef) : 0
    const earned = Math.max(0, cumulative - prevCumulative)
    const used = usedInYear(year)
    const remaining = carry + earned - used

    rows.push({ year, opening: carry, earned, used, remaining })

    carry = remaining
  }

  return rows
}

export { D }
