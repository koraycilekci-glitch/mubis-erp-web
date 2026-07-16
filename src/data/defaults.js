// MUBiS ERP - Varsayilan Parametreler
// Yil bazli vergi, SGK, Yi-UFE, istisna degerleri
// Admin Ayarlar'dan guncellenebilir (Supabase parameters tablosu)

// Gelir Vergisi Dilimleri (yil bazli)
export const GV_DILIMLERI = {
  2024: [
    { limit: 110000, rate: 0.15 },
    { limit: 230000, rate: 0.20 },
    { limit: 580000, rate: 0.27 },
    { limit: 3000000, rate: 0.35 },
    { limit: Infinity, rate: 0.40 }
  ],
  2025: [
    { limit: 110000, rate: 0.15 },
    { limit: 230000, rate: 0.20 },
    { limit: 580000, rate: 0.27 },
    { limit: 3000000, rate: 0.35 },
    { limit: Infinity, rate: 0.40 }
  ],
  2026: [
    { limit: 158000, rate: 0.15 },
    { limit: 330000, rate: 0.20 },
    { limit: 800000, rate: 0.27 },
    { limit: 4300000, rate: 0.35 },
    { limit: Infinity, rate: 0.40 }
  ]
}

// Ucret Geliri GV Dilimleri (ayri tarifesi var)
export const GV_UCRET_DILIMLERI = {
  2025: [
    { limit: 110000, rate: 0.15 },
    { limit: 230000, rate: 0.20 },
    { limit: 580000, rate: 0.27 },
    { limit: 3000000, rate: 0.35 },
    { limit: Infinity, rate: 0.40 }
  ],
  2026: [
    { limit: 158000, rate: 0.15 },
    { limit: 330000, rate: 0.20 },
    { limit: 800000, rate: 0.27 },
    { limit: 4300000, rate: 0.35 },
    { limit: Infinity, rate: 0.40 }
  ]
}

// Kurumlar Vergisi Oranlari
export const KV_ORANLARI = {
  2024: 0.25,
  2025: 0.25,
  2026: 0.25
}

// Asgari Ucret (brut, yil bazli, 1. donem)
export const ASGARI_UCRET = {
  2024: { brut: 20002.50, net: 17002.12 },
  2025: { brut: 26005.50, net: 22104.67 },
  2026: { brut: 32500.00, net: 27625.00 }
}

// SGK Oranlari
export const SGK = {
  isci: 0.14,
  issizlik_isci: 0.01,
  isveren: 0.205,
  issizlik_isveren: 0.02,
  tavan: {
    2024: 150018.75,
    2025: 195041.25,
    2026: 243750.00
  }
}

// Damga Vergisi Orani (yil bazli)
export const DAMGA_VERGISI_ORANLARI = {
  2020: 0.00948,
  2021: 0.00948,
  2022: 0.00948,
  2023: 0.00948,
  2024: 0.00759,
  2025: 0.00759,
  2026: 0.00759,
}
export const DAMGA_VERGISI = 0.00759 // Guncel yil varsayilan
export function getDamgaVergisiOrani(yil) {
  return DAMGA_VERGISI_ORANLARI[yil] || DAMGA_VERGISI
}

// Kidem Tazminati Tavani (donem bazli)
export const KIDEM_TAVANI = {
  '2024-1': 35058.58,
  '2024-2': 37369.76,
  '2025-1': 41828.42,
  '2025-2': 46485.00,
  '2026-1': 52000.00
}

// GMS Iradi Istisna Tutarlari (yil bazli konut)
export const GMS_ISTISNA = {
  2022: 9500,
  2023: 21000,
  2024: 33000,
  2025: 33000,
  2026: 43000
}

// Deger Artis Kazanci Istisna Tutarlari
export const DAK_ISTISNA = {
  2020: 18000,
  2021: 19000,
  2022: 25000,
  2023: 55000,
  2024: 87000,
  2025: 140000,
  2026: 180000
}

// Yi-UFE Endeksleri (ay bazli, 2003=100 bazli)
// Kaynak: TUIK - Yurt Ici Uretici Fiyat Endeksi
export const YIUFE = {
  '2020-01': 462.65, '2020-02': 461.72, '2020-03': 463.63, '2020-04': 468.13,
  '2020-05': 467.85, '2020-06': 472.32, '2020-07': 479.38, '2020-08': 483.51,
  '2020-09': 488.94, '2020-10': 494.39, '2020-11': 496.32, '2020-12': 504.45,
  '2021-01': 513.78, '2021-02': 518.70, '2021-03': 528.93, '2021-04': 536.18,
  '2021-05': 545.55, '2021-06': 551.95, '2021-07': 558.76, '2021-08': 573.12,
  '2021-09': 583.41, '2021-10': 607.58, '2021-11': 643.83, '2021-12': 686.95,
  '2022-01': 748.20, '2022-02': 792.71, '2022-03': 847.48, '2022-04': 898.68,
  '2022-05': 934.38, '2022-06': 982.09, '2022-07': 1024.33, '2022-08': 1056.45,
  '2022-09': 1064.42, '2022-10': 1118.98, '2022-11': 1148.44, '2022-12': 1183.32,
  '2023-01': 1201.59, '2023-02': 1213.89, '2023-03': 1223.72, '2023-04': 1238.44,
  '2023-05': 1248.93, '2023-06': 1310.90, '2023-07': 1358.17, '2023-08': 1418.86,
  '2023-09': 1470.93, '2023-10': 1498.10, '2023-11': 1543.58, '2023-12': 1567.36,
  '2024-01': 1601.74, '2024-02': 1639.97, '2024-03': 1670.22, '2024-04': 1706.80,
  '2024-05': 1726.99, '2024-06': 1746.35, '2024-07': 1769.51, '2024-08': 1783.89,
  '2024-09': 1789.20, '2024-10': 1801.45, '2024-11': 1818.90, '2024-12': 1838.67,
  '2025-01': 1862.30, '2025-02': 1889.15, '2025-03': 1908.40, '2025-04': 1928.50,
  '2025-05': 1945.70, '2025-06': 1960.20, '2025-07': 1978.00
}

// Kira Artis Orani (12 aylik TUFE ortalamalari, ay bazli)
export const KIRA_ARTIS_ORANLARI = {
  '2024-01': 64.77, '2024-02': 67.07, '2024-03': 68.50, '2024-04': 69.80,
  '2024-05': 73.50, '2024-06': 71.60, '2024-07': 61.78, '2024-08': 57.30,
  '2024-09': 52.52, '2024-10': 48.58, '2024-11': 44.38, '2024-12': 41.50,
  '2025-01': 39.05, '2025-02': 36.80, '2025-03': 34.50, '2025-04': 32.10,
  '2025-05': 29.45, '2025-06': 27.80, '2025-07': 25.50
}

// Ihbar Tazminati Sureleri (Is Kanunu Md.17)
export const IHBAR_SURELERI = [
  { maxAy: 6, hafta: 2, gun: 14, aciklama: '6 aydan az' },
  { maxAy: 18, hafta: 4, gun: 28, aciklama: '6 ay - 1.5 yil' },
  { maxAy: 36, hafta: 6, gun: 42, aciklama: '1.5 yil - 3 yil' },
  { maxAy: Infinity, hafta: 8, gun: 56, aciklama: '3 yildan fazla' }
]

// Yillik Ucretli Izin Gunleri (Is Kanunu Md.53)
export const IZIN_GUNLERI = [
  { minYil: 1, maxYil: 5, gun: 14, aciklama: '1-5 yil arasi' },
  { minYil: 5, maxYil: 15, gun: 20, aciklama: '5-15 yil arasi' },
  { minYil: 15, maxYil: Infinity, gun: 26, aciklama: '15 yil ve ustu' }
]
// 18 yas alti ve 50 yas ustu: en az 20 gun

// Resmi Tatiller (Turkiye)
export const RESMI_TATILLER = {
  2024: [
    '2024-01-01', // Yilbasi
    '2024-04-10', '2024-04-11', '2024-04-12', // Ramazan Bayrami
    '2024-04-23', // 23 Nisan
    '2024-05-01', // 1 Mayis
    '2024-05-19', // 19 Mayis
    '2024-06-16', '2024-06-17', '2024-06-18', '2024-06-19', // Kurban Bayrami
    '2024-07-15', // 15 Temmuz
    '2024-08-30', // 30 Agustos
    '2024-10-29', // 29 Ekim
  ],
  2025: [
    '2025-01-01', // Yilbasi
    '2025-03-30', '2025-03-31', '2025-04-01', // Ramazan Bayrami
    '2025-04-23', // 23 Nisan
    '2025-05-01', // 1 Mayis
    '2025-05-19', // 19 Mayis
    '2025-06-06', '2025-06-07', '2025-06-08', '2025-06-09', // Kurban Bayrami
    '2025-07-15', // 15 Temmuz
    '2025-08-30', // 30 Agustos
    '2025-10-29', // 29 Ekim
  ],
  2026: [
    '2026-01-01', // Yilbasi
    '2026-03-20', '2026-03-21', '2026-03-22', // Ramazan Bayrami
    '2026-04-23', // 23 Nisan
    '2026-05-01', // 1 Mayis
    '2026-05-19', // 19 Mayis
    '2026-05-27', '2026-05-28', '2026-05-29', '2026-05-30', // Kurban Bayrami
    '2026-07-15', // 15 Temmuz
    '2026-08-30', // 30 Agustos
    '2026-10-29', // 29 Ekim
  ]
}

// Bir tarihin resmi tatil olup olmadigini kontrol et
export function isResmiTatil(tarih) {
  const d = new Date(tarih)
  const yil = d.getFullYear()
  const key = d.toISOString().split('T')[0]
  return (RESMI_TATILLER[yil] || []).includes(key)
}

// Bir tarihin pazar olup olmadigini kontrol et
export function isPazar(tarih) {
  return new Date(tarih).getDay() === 0
}

// Iki tarih arasindaki is gunlerini hesapla (pazar + resmi tatil haric)
export function hesaplaIsGunu(baslangic, bitis) {
  const start = new Date(baslangic)
  const end = new Date(bitis)
  let gun = 0
  const current = new Date(start)
  while (current <= end) {
    if (!isPazar(current) && !isResmiTatil(current)) {
      gun++
    }
    current.setDate(current.getDate() + 1)
  }
  return gun
}

// Ise giris tarihine gore hak edilen yillik izin gunu hesapla
export function hesaplaIzinHakki(iseGiris, referansTarih = new Date(), dogumTarihi = null) {
  const giris = new Date(iseGiris)
  const ref = new Date(referansTarih)
  const yil = (ref - giris) / (365.25 * 24 * 60 * 60 * 1000)
  
  if (yil < 1) return 0 // 1 yildan az calisma - izin hakki yok
  
  let hakEdilenGun = 0
  for (const dilim of IZIN_GUNLERI) {
    if (yil >= dilim.minYil && yil < dilim.maxYil) {
      hakEdilenGun = dilim.gun
      break
    }
  }
  
  // 18 yas alti veya 50 yas ustu: en az 20 gun
  if (dogumTarihi) {
    const dogum = new Date(dogumTarihi)
    const yas = (ref - dogum) / (365.25 * 24 * 60 * 60 * 1000)
    if (yas < 18 || yas >= 50) {
      hakEdilenGun = Math.max(hakEdilenGun, 20)
    }
  }
  
  return hakEdilenGun
}

// Yil listesi
export const YILLAR = [2020, 2021, 2022, 2023, 2024, 2025, 2026]

// Yi-UFE degerini bul (onceki ay)
export function getYiUfe(yil, ay) {
  // Onceki ayin endeksini getir
  let y = yil, a = ay - 1
  if (a <= 0) { a = 12; y-- }
  const key = `${y}-${String(a).padStart(2, '0')}`
  return YIUFE[key] || null
}

// Kidem tavani bul
export function getKidemTavani(tarih) {
  const d = new Date(tarih)
  const yil = d.getFullYear()
  const donem = d.getMonth() < 6 ? 1 : 2
  const key = `${yil}-${donem}`
  return KIDEM_TAVANI[key] || KIDEM_TAVANI[`${yil}-1`] || Object.values(KIDEM_TAVANI).pop()
}

// GV hesapla (yil ve tip bazli)
export function hesaplaGV(matrah, yil = 2025, tip = 'ucret_disi') {
  const dilimler = tip === 'ucret' 
    ? (GV_UCRET_DILIMLERI[yil] || GV_UCRET_DILIMLERI[2025])
    : (GV_DILIMLERI[yil] || GV_DILIMLERI[2025])
  
  let toplam = 0, kalan = matrah, oncekiLimit = 0
  for (const dilim of dilimler) {
    const dilimTutar = Math.min(kalan, dilim.limit - oncekiLimit)
    if (dilimTutar <= 0) break
    toplam += dilimTutar * dilim.rate
    kalan -= dilimTutar
    oncekiLimit = dilim.limit
  }
  return toplam
}

// Ihbar suresi bul
export function getIhbarSuresi(giris, cikis) {
  const d1 = new Date(giris), d2 = new Date(cikis)
  const ay = (d2 - d1) / (30.44 * 24 * 60 * 60 * 1000)
  return IHBAR_SURELERI.find(s => ay < s.maxAy) || IHBAR_SURELERI[IHBAR_SURELERI.length - 1]
}

// Brut -> Net hesapla
export function bruttenNete(brut, yil = 2025) {
  const tavan = SGK.tavan[yil] || SGK.tavan[2025]
  const sgkMatrah = Math.min(brut, tavan)
  const sgkIsci = sgkMatrah * SGK.isci
  const issizlikIsci = sgkMatrah * SGK.issizlik_isci
  const gvMatrah = brut - sgkIsci - issizlikIsci
  const gv = hesaplaGV(gvMatrah, yil, 'ucret')
  const aylikGv = gv / 12
  const damga = brut * DAMGA_VERGISI
  const net = brut - sgkIsci - issizlikIsci - aylikGv - damga
  const sgkIsveren = sgkMatrah * SGK.isveren
  const issizlikIsveren = sgkMatrah * SGK.issizlik_isveren
  const toplamMaliyet = brut + sgkIsveren + issizlikIsveren
  return { sgkIsci, issizlikIsci, gvMatrah, aylikGv, damga, net, sgkIsveren, issizlikIsveren, toplamMaliyet }
}

// Net -> Brut yaklasik hesap (iteratif)
export function nettenBrute(net, yil = 2025) {
  let brut = net * 1.4
  for (let i = 0; i < 50; i++) {
    const sonuc = bruttenNete(brut, yil)
    const fark = net - sonuc.net
    if (Math.abs(fark) < 0.01) break
    brut += fark
  }
  return brut
}

// Kira artis orani getir (su anki ay)
export function getKiraArtisOrani() {
  const now = new Date()
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return KIRA_ARTIS_ORANLARI[key] || null
}

// Format
export function fmt(n) {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
