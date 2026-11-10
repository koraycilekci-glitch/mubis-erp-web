// MUBiS ERP - Varsayilan Parametreler
// Yil bazli vergi, SGK, Yi-UFE, istisna degerleri
// Admin Ayarlar'dan guncellenebilir (Supabase parameters tablosu)

// Gelir Vergisi Dilimleri (yil bazli, ucret disi)
// Kaynak: 332 seri no.lu GV Genel Tebligi (2026), 330 seri no.lu (2025)
export const GV_DILIMLERI = {
  2024: [
    { limit: 110000, rate: 0.15 },
    { limit: 230000, rate: 0.20 },
    { limit: 580000, rate: 0.27 },
    { limit: 3000000, rate: 0.35 },
    { limit: Infinity, rate: 0.40 }
  ],
  2025: [
    { limit: 158000, rate: 0.15 },
    { limit: 330000, rate: 0.20 },
    { limit: 800000, rate: 0.27 },
    { limit: 4300000, rate: 0.35 },
    { limit: Infinity, rate: 0.40 }
  ],
  2026: [
    { limit: 190000, rate: 0.15 },
    { limit: 400000, rate: 0.20 },
    { limit: 1000000, rate: 0.27 },
    { limit: 5300000, rate: 0.35 },
    { limit: Infinity, rate: 0.40 }
  ]
}

// Ucret Geliri GV Dilimleri (ayri tarifesi var)
export const GV_UCRET_DILIMLERI = {
  2024: [
    { limit: 110000, rate: 0.15 },
    { limit: 230000, rate: 0.20 },
    { limit: 870000, rate: 0.27 },
    { limit: 3000000, rate: 0.35 },
    { limit: Infinity, rate: 0.40 }
  ],
  2025: [
    { limit: 158000, rate: 0.15 },
    { limit: 330000, rate: 0.20 },
    { limit: 1200000, rate: 0.27 },
    { limit: 4300000, rate: 0.35 },
    { limit: Infinity, rate: 0.40 }
  ],
  2026: [
    { limit: 190000, rate: 0.15 },
    { limit: 400000, rate: 0.20 },
    { limit: 1500000, rate: 0.27 },
    { limit: 5300000, rate: 0.35 },
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
  2026: { brut: 33030.00, net: 28075.50 }
}

// SGK Oranlari
// 2026: isveren hissesi %21,75 (7566 s. Kanun); tavan asgari ucretin 9 kati
export const SGK = {
  isci: 0.14,
  issizlik_isci: 0.01,
  isveren: 0.205,
  isveren_2026: 0.2175,
  issizlik_isveren: 0.02,
  tavan: {
    2024: 150018.75,
    2025: 195041.25,
    2026: 297270.00
  }
}

// Yil bazli SGK isveren hissesi
export function getSgkIsverenOrani(yil) {
  return yil >= 2026 ? SGK.isveren_2026 : SGK.isveren
}

// Gunluk prime esas kazanc (PEK) sinirlari
export function getGunlukPekSinirlari(yil) {
  const asgari = ASGARI_UCRET[yil] || ASGARI_UCRET[2026]
  const tavanAylik = SGK.tavan[yil] || SGK.tavan[2026]
  return {
    asgari: Math.round((asgari.brut / 30) * 100) / 100,
    tavan: Math.round((tavanAylik / 30) * 100) / 100
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
  2025: 47000,
  2026: 58000
}

// Deger Artis Kazanci Istisna Tutarlari (TL)
export const DAK_ISTISNA = {
  2020: 15000,
  2021: 18000,
  2022: 25000,
  2023: 55000,
  2024: 87000,
  2025: 150000,
  2026: 150000
}

// Yi-UFE Endeksleri (ay bazli, 2003=100 bazli)
// Kaynak: TUIK - Yurt Ici Uretici Fiyat Endeksi (resmi seri)
export const YIUFE = {
  '2020-01': 462.42, '2020-02': 464.64, '2020-03': 468.69, '2020-04': 474.69,
  '2020-05': 482.02, '2020-06': 485.37, '2020-07': 490.33, '2020-08': 501.85,
  '2020-09': 515.13, '2020-10': 533.44, '2020-11': 555.18, '2020-12': 568.27,
  '2021-01': 583.38, '2021-02': 590.52, '2021-03': 614.93, '2021-04': 641.63,
  '2021-05': 666.79, '2021-06': 693.54, '2021-07': 710.61, '2021-08': 730.28,
  '2021-09': 741.58, '2021-10': 780.45, '2021-11': 858.43, '2021-12': 1022.25,
  '2022-01': 1129.03, '2022-02': 1210.60, '2022-03': 1321.90, '2022-04': 1423.27,
  '2022-05': 1548.01, '2022-06': 1652.75, '2022-07': 1738.21, '2022-08': 1780.05,
  '2022-09': 1865.09, '2022-10': 2011.13, '2022-11': 2026.08, '2022-12': 2021.19,
  '2023-01': 2105.17, '2023-02': 2138.04, '2023-03': 2147.44, '2023-04': 2164.94,
  '2023-05': 2179.02, '2023-06': 2320.72, '2023-07': 2511.75, '2023-08': 2659.60,
  '2023-09': 2749.98, '2023-10': 2803.29, '2023-11': 2882.04, '2023-12': 2915.02,
  '2024-01': 3035.59, '2024-02': 3149.03, '2024-03': 3252.79, '2024-04': 3369.98,
  '2024-05': 3435.96, '2024-06': 3483.25, '2024-07': 3550.88, '2024-08': 3610.51,
  '2024-09': 3659.84, '2024-10': 3707.10, '2024-11': 3731.43, '2024-12': 3746.52,
  '2025-01': 3861.33, '2025-02': 3943.01, '2025-03': 4017.30, '2025-04': 4128.19,
  '2025-05': 4230.69, '2025-06': 4334.94, '2025-07': 4409.73, '2025-08': 4518.89,
  '2025-09': 4632.89, '2025-10': 4708.20, '2025-11': 4747.63, '2025-12': 4783.04,
  '2026-01': 4910.53, '2026-02': 5029.76, '2026-03': 5145.36, '2026-04': 5308.46,
  '2026-05': 5454.58, '2026-06': 5552.52, '2026-07': 5637.14, '2026-08': 5781.74,
  '2026-09': 5901.26
}

// Kira Artis Orani (12 aylik TUFE ortalamalari, ay bazli)
// Kaynak: TUIK; anahtar = sozlesme yenileme ayi
export const KIRA_ARTIS_ORANLARI = {
  '2024-01': 64.77, '2024-02': 67.07, '2024-03': 68.50, '2024-04': 69.80,
  '2024-05': 73.50, '2024-06': 71.60, '2024-07': 61.78, '2024-08': 57.30,
  '2024-09': 52.52, '2024-10': 48.58, '2024-11': 44.38, '2024-12': 41.50,
  '2025-01': 39.05, '2025-02': 36.80, '2025-03': 34.50, '2025-04': 32.10,
  '2025-05': 29.45, '2025-06': 27.80, '2025-07': 25.50,
  '2025-09': 39.62, '2025-10': 38.36, '2025-11': 37.15, '2025-12': 35.91,
  '2026-01': 34.88, '2026-02': 33.98, '2026-03': 33.39, '2026-04': 32.82,
  '2026-05': 32.43, '2026-06': 32.24, '2026-07': 32.03, '2026-08': 31.90
}

// Kira artis oranini bul; istenen ay yoksa en yakin gecmis aya geri don
export function getKiraArtisOraniDetay(yil, ay) {
  let y = yil, a = ay
  for (let i = 0; i < 36; i++) {
    const key = `${y}-${String(a).padStart(2, '0')}`
    if (KIRA_ARTIS_ORANLARI[key] != null) {
      return { oran: KIRA_ARTIS_ORANLARI[key], yil: y, ay: a, key }
    }
    a--
    if (a <= 0) { a = 12; y-- }
  }
  return null
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
  
  // Is Kanunu Md.53: "1 yildan 5 yila kadar (5 yil DAHIL)" 14 gun,
  // "5 yildan fazla 15 yildan az" 20 gun, "15 yil (DAHIL) ve fazlasi" 26 gun.
  // Sinir degerlerin (tam 5 yil, tam 15 yil) hangi dilime dahil oldugu onemli;
  // asagidaki <= / < kullanimi bu "dahil" ifadelerini birebir yansitir.
  let hakEdilenGun
  if (yil <= 5) {
    hakEdilenGun = 14
  } else if (yil < 15) {
    hakEdilenGun = 20
  } else {
    hakEdilenGun = 26
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

// Brut -> Net hesapla (2025+: asgari ucret GV ve damga vergisi istisnasi, 7555 s.K.)
export function bruttenNete(brut, yil = 2025) {
  const tavan = SGK.tavan[yil] || SGK.tavan[2025]
  const sgkMatrah = Math.min(brut, tavan)
  const sgkIsci = sgkMatrah * SGK.isci
  const issizlikIsci = sgkMatrah * SGK.issizlik_isci
  const gvMatrah = brut - sgkIsci - issizlikIsci
  const damgaOran = getDamgaVergisiOrani(yil)
  // Asgari ucret istisnasi (2025+): brut asgari ucrete isabet eden gelir
  // vergisi ve damga vergisi tutarlari kadar istisna uygulanir.
  // Kaynak oranlar: 2026 GV istisnasi 4.211,33 TL, damga istisnasi 250,70 TL.
  let gvIstisna = 0, damgaIstisna = 0
  if (yil >= 2025) {
    const asgariBrut = (ASGARI_UCRET[yil] || ASGARI_UCRET[2026]).brut
    const ilkOran = (GV_UCRET_DILIMLERI[yil] || GV_UCRET_DILIMLERI[2025])[0].rate
    gvIstisna = asgariBrut * (1 - SGK.isci - SGK.issizlik_isci) * ilkOran
    damgaIstisna = asgariBrut * damgaOran
  }
  const hamGv = hesaplaGV(gvMatrah, yil, 'ucret')
  const aylikGv = Math.max(0, hamGv - gvIstisna)
  const damga = Math.max(0, brut * damgaOran - damgaIstisna)
  const net = brut - sgkIsci - issizlikIsci - aylikGv - damga
  const sgkIsveren = sgkMatrah * getSgkIsverenOrani(yil)
  const issizlikIsveren = sgkMatrah * SGK.issizlik_isveren
  const toplamMaliyet = brut + sgkIsveren + issizlikIsveren
  return { sgkIsci, issizlikIsci, gvMatrah, hamGv, gvIstisna, aylikGv, damgaIstisna, damga, net, sgkIsveren, issizlikIsveren, toplamMaliyet }
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
