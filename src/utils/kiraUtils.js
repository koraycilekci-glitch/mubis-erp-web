// Kira bilgisi yardimcilari
// kira_bilgisi kolonu JSON (bazen string) olarak tutulur:
// { kiraTipi, isYeriKirasi, kiraBaslangic, kiraBitis, stopaj, evSahipleri, isyeriSahipleri,
//   yenilemeTalebi: { yeniNetKira, yeniBaslangic, yeniBitis, aciklama, durum, talepTarihi, ... } }

export const KIRA_STOPAJ_ORANI = 0.20

export const kiraSayisi = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const text = String(value ?? '').trim().replace(/\s/g, '')
  if (!text) return 0
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text
  const result = Number(normalized)
  return Number.isFinite(result) ? result : 0
}

const stopajVarMi = (value) => (
  value === true
  || ['var', 'true', 'evet', 'yes', '1'].includes(String(value ?? '').trim().toLocaleLowerCase('tr-TR'))
)

/** kira_bilgisi alanini guvenli sekilde objeye cevirir */
export function parseKiraBilgisi(source) {
  const raw = source?.kiraBilgisi ?? source?.kira_bilgisi ?? {}
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try {
    const p = JSON.parse(raw)
    return typeof p === 'object' && p !== null ? p : {}
  } catch {
    return {}
  }
}

/**
 * Brut / net kira tutarlarini hesaplar.
 * Kayitli tutar NET (ev sahibine odenen) kabul edilir; stopaj varsa brut = net / 0.80
 */
export function hesaplaKiraTutarlari(kb = {}) {
  const stopajVar = stopajVarMi(kb.stopaj)
  const oran = stopajVar ? KIRA_STOPAJ_ORANI : 0

  let net = kiraSayisi(kb.kiraNet || kb.netKira || kb.isYeriKirasi || 0)
  let brut = kiraSayisi(kb.kiraBrut || kb.brutKira || 0)

  if (!brut && net) brut = stopajVar ? net / (1 - oran) : net
  if (!net && brut) net = stopajVar ? brut * (1 - oran) : brut

  return {
    net: Math.round(net * 100) / 100,
    brut: Math.round(brut * 100) / 100,
    stopaj: Math.round((brut - net) * 100) / 100,
    stopajOrani: oran,
    stopajVar
  }
}

const kiraTarihi = (value) => {
  if (!value) return null
  const tarih = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(tarih.getTime()) ? null : tarih
}

const donemBaslangici = (donem) => kiraTarihi(
  donem?.kiraBaslangic
  || donem?.kiraBaslangicTarihi
  || donem?.baslangic
)

const donemBitisi = (donem) => kiraTarihi(
  donem?.kiraBitis
  || donem?.kiraBitisTarihi
  || donem?.bitis
)

function donemTarihleriniDoldur(donem) {
  let baslangic = donemBaslangici(donem)
  let bitis = donemBitisi(donem)

  // Eger yukaridaki alanlar bos ise isyeriSahipleri'nden en erken baslangic ve en gec bitisi al
  if (!baslangic || !bitis) {
    const sahipler = Array.isArray(donem?.isyeriSahipleri)
      ? donem.isyeriSahipleri
      : (Array.isArray(donem?.isyeriMalSahipleri) ? donem.isyeriMalSahipleri : [])
    const baslangiclar = sahipler
      .map((s) => kiraTarihi(s?.kiraBaslangic || s?.baslangic))
      .filter(Boolean)
    const bitisler = sahipler
      .map((s) => kiraTarihi(s?.kiraBitis || s?.bitis))
      .filter(Boolean)
    if (!baslangic && baslangiclar.length) {
      baslangic = new Date(Math.min(...baslangiclar.map((d) => d.getTime())))
    }
    if (!bitis && bitisler.length) {
      bitis = new Date(Math.max(...bitisler.map((d) => d.getTime())))
    }
  }

  return { baslangic, bitis }
}

export function kiraDonemiGetir(kb = {}, yil, ay) {
  const gecmis = Array.isArray(kb.kiraGecmisi) ? kb.kiraGecmisi : []
  // Mevcut donem: yalnizca isyeriSahipleri ve diger alanlari tasiyoruz;
  // kiraBaslangic/kiraBitis gibi ust alanlari kopyalamiyoruz ki
  // donemTarihleriniDoldur isyeriSahipleri'nden gercek tarihleri alsın.
  const mevcut = Object.fromEntries(
    Object.entries(kb).filter(([key]) => key !== 'kiraBaslangic' && key !== 'kiraBitis' && key !== 'kiraBaslangicTarihi' && key !== 'kiraBitisTarihi')
  )
  const donemler = [...gecmis, mevcut]

  const ayBaslangici = new Date(Number(yil), Number(ay) - 1, 1)
  const aySonu = new Date(Number(yil), Number(ay), 0)

  const siraliDonemler = donemler
    .map((donem, index) => {
      const { baslangic, bitis } = donemTarihleriniDoldur(donem)
      return { donem, index, baslangic, bitis }
    })
    .sort((a, b) => {
      // Once gercek tarihi olanlar; tarihsiz sona kalsin
      const aTarihli = a.baslangic || a.bitis ? 1 : 0
      const bTarihli = b.baslangic || b.bitis ? 1 : 0
      if (aTarihli !== bTarihli) return bTarihli - aTarihli
      return (b.baslangic?.getTime() || 0) - (a.baslangic?.getTime() || 0) || b.index - a.index
    })

  const bulunan = siraliDonemler.find(({ baslangic, bitis }) => {
    const baslangicUygun = !baslangic || baslangic <= aySonu
    const bitisUygun = !bitis || bitis >= ayBaslangici
    return baslangicUygun && bitisUygun
  })

  // Hicbir donem ay kapsamina girmiyorsa, varsa en guncel tarihli donemi,
  // yoksa mevcut donemi dondur (null yerine)
  if (!bulunan) {
    const sonTarihli = siraliDonemler.find((d) => d.baslangic || d.bitis)
    return sonTarihli?.donem || mevcut
  }

  return bulunan.donem
}

/**
 * Verilen yil ve ay icin kira stopaj kalemlerini dondurur.
 * isyeriSahipleri varsa her mal sahibi icin hissesine dusen tutarlarla liste olusturur.
 */
export function hesaplaMalSahibiKiraTutarlari(kb = {}, ortak = {}) {
  const sahipleri = Array.isArray(kb.isyeriSahipleri) && kb.isyeriSahipleri.length > 0
    ? kb.isyeriSahipleri
    : (Array.isArray(kb.isyeriMalSahipleri) && kb.isyeriMalSahipleri.length > 0
      ? kb.isyeriMalSahipleri
      : (Array.isArray(kb.malSahipleri) ? kb.malSahipleri : []))
  if (sahipleri.length === 0) return []

  const ortakBrut = kiraSayisi(ortak.brut || 0)
  const ortakNet = kiraSayisi(ortak.net || 0)
  const ortakStopajVar = ortak.stopajVar === true
    || stopajVarMi(ortak.stopaj)
    || stopajVarMi(kb.stopaj)
  const stopajOrani = ortakStopajVar
    ? (kiraSayisi(ortak.stopajOrani || KIRA_STOPAJ_ORANI) || KIRA_STOPAJ_ORANI)
    : 0
  const ortakStopaj = kiraSayisi(ortak.stopaj || ortakBrut - ortakNet)
  const girilenBrut = sahipleri.reduce((toplam, sahip) => {
    return toplam + kiraSayisi(sahip?.brutKira || sahip?.kiraBrut || 0)
  }, 0)
  const girilenNet = sahipleri.reduce((toplam, sahip) => {
    return toplam + kiraSayisi(sahip?.netKira || sahip?.kiraNet || 0)
  }, 0)
  const toplamBrut = girilenBrut || ortakBrut
  const toplamNet = girilenNet || ortakNet || toplamBrut * (1 - stopajOrani)
  const toplamStopaj = ortakStopaj || (ortakStopajVar ? toplamBrut - toplamNet : 0)

  return sahipleri.map((sahip, index) => {
    const hisse = Number(sahip?.hisseOrani || sahip?.hisse || 0) || 0
    const girilenSahipBrut = kiraSayisi(sahip?.brutKira || sahip?.kiraBrut || 0)
    const girilenSahipNet = kiraSayisi(sahip?.netKira || sahip?.kiraNet || 0)
    const tutarGirildi = girilenSahipBrut > 0 || girilenSahipNet > 0
    const sahipStopajVar = stopajVarMi(sahip?.stopaj)
      || (sahip?.stopaj !== 'yok' && sahip?.stopaj !== 'Yok' && sahip?.stopaj !== '' && ortakStopajVar)
    const sahipStopajOrani = sahipStopajVar ? stopajOrani || KIRA_STOPAJ_ORANI : 0
    const pay = hisse > 0
      ? hisse / 100
      : (sahipleri.length > 0 ? 1 / sahipleri.length : 0)
    const brut = tutarGirildi
      ? (girilenSahipBrut || girilenSahipNet / (1 - sahipStopajOrani))
      : toplamBrut * pay
    const net = tutarGirildi
      ? (girilenSahipNet || girilenSahipBrut * (1 - sahipStopajOrani))
      : toplamNet * pay
    const stopaj = sahipStopajVar
      ? (tutarGirildi ? brut - net : toplamStopaj * pay)
      : 0

    return {
      ...sahip,
      index,
      sahipAdSoyad: sahip?.adSoyad || sahip?.ad_soyad || `Mal Sahibi ${index + 1}`,
      sahipTc: sahip?.tc || sahip?.tc_kimlik || '',
      sahipAdres: sahip?.adres || '',
      hisseOrani: hisse || pay * 100,
      brut: Math.round(brut * 100) / 100,
      net: Math.round(net * 100) / 100,
      stopaj: Math.round(stopaj * 100) / 100,
      stopajVar: sahipStopajVar,
      tutarKaydiMalSahibineAit: tutarGirildi
    }
  })
}

export function kiraArtisBildirimDurumu(kiraBilgisi = {}, bugun = new Date()) {
  const bitisler = [
    kiraBilgisi?.bitisTarihi,
    kiraBilgisi?.kiraBitis,
    kiraBilgisi?.kiraBitisTarihi,
    kiraBilgisi?.kira_bitis_tarihi,
    ...(Array.isArray(kiraBilgisi?.isyeriSahipleri)
      ? kiraBilgisi.isyeriSahipleri.map((sahip) => sahip?.kiraBitis || sahip?.kiraBitisTarihi || sahip?.bitis)
      : []),
    ...(Array.isArray(kiraBilgisi?.isyeriMalSahipleri)
      ? kiraBilgisi.isyeriMalSahipleri.map((sahip) => sahip?.kiraBitis || sahip?.kiraBitisTarihi || sahip?.bitis)
      : [])
  ].filter(Boolean)
  const bitisTarihi = bitisler
    .map((bitis) => new Date(`${String(bitis).slice(0, 10)}T00:00:00`))
    .filter((tarih) => !Number.isNaN(tarih.getTime()))
    .sort((a, b) => a.getTime() - b.getTime())[0]
  if (!bitisTarihi) return null
  const bugunTarihi = new Date(bugun)
  bugunTarihi.setHours(0, 0, 0, 0)
  bitisTarihi.setHours(0, 0, 0, 0)
  const kalanGun = Math.ceil((bitisTarihi.getTime() - bugunTarihi.getTime()) / 86400000)
  if (kalanGun === 15 || kalanGun === 7 || kalanGun === 1) {
    return {
      kod: `kalan_${kalanGun}`,
      kalanGun,
      bitisTarihi: bitisTarihi.toISOString().slice(0, 10)
    }
  }
  return null
}

export function hesaplaAylikKiraStopaj(kb = {}, yil, ay) {
  const donem = kiraDonemiGetir(kb, yil, ay)
  if (!donem) return []

  // Gecmis donem kaydinda isyeriSahipleri yoksa mevcut sahiplerin kisisel
  // bilgilerini kullan ama tutarlarini bosalt; boylece o donemin toplam
  // net/brut degeri hisse oranina gore dagitilir.
  const donemSahipleri = Array.isArray(donem.isyeriSahipleri) && donem.isyeriSahipleri.length > 0
    ? donem.isyeriSahipleri
    : (Array.isArray(donem.isyeriMalSahipleri) && donem.isyeriMalSahipleri.length > 0
      ? donem.isyeriMalSahipleri
      : (Array.isArray(donem.malSahipleri) && donem.malSahipleri.length > 0
        ? donem.malSahipleri
        : (Array.isArray(donem.evSahipleri) && donem.evSahipleri.length > 0
          ? donem.evSahipleri
          : (Array.isArray(kb.isyeriSahipleri)
            ? kb.isyeriSahipleri.map((s) => ({ ...s, netKira: '', brutKira: '' }))
            : []))))

  const sahipBrut = donemSahipleri.reduce((total, sahip) => (
    total + kiraSayisi(sahip?.brutKira || sahip?.kiraBrut || 0)
  ), 0)
  const sahipNet = donemSahipleri.reduce((total, sahip) => (
    total + kiraSayisi(sahip?.netKira || sahip?.kiraNet || 0)
  ), 0)
  const tutarlar = hesaplaKiraTutarlari(donem)
  const sahipTutarGirisiVar = sahipBrut > 0 || sahipNet > 0
  const etkinTutarlar = sahipTutarGirisiVar
    ? {
        ...tutarlar,
        brut: sahipBrut || tutarlar.brut,
        net: sahipNet || (sahipBrut ? sahipBrut * (1 - tutarlar.stopajOrani) : tutarlar.net),
        stopaj: sahipBrut
          ? sahipBrut - (sahipNet || sahipBrut * (1 - tutarlar.stopajOrani))
          : tutarlar.stopaj
      }
    : tutarlar
  const sahipSatirindaStopaj = donemSahipleri.some((sahip) => stopajVarMi(sahip?.stopaj))
  const stopajVar = etkinTutarlar.stopajVar || stopajVarMi(donem.stopaj) || sahipSatirindaStopaj
  if (!etkinTutarlar.brut && !sahipBrut && !sahipNet) return []

  const hesaplanacakDonem = {
    ...donem,
    isyeriSahipleri: donemSahipleri,
    isyeriMalSahipleri: undefined,
    malSahipleri: undefined,
    evSahipleri: undefined
  }
  const kalemler = hesaplaMalSahibiKiraTutarlari(hesaplanacakDonem, {
    ...etkinTutarlar,
    stopajVar,
    stopajOrani: etkinTutarlar.stopajOrani || KIRA_STOPAJ_ORANI
  })
  return kalemler.length > 0 ? kalemler : [{
    index: 0,
    sahipAdSoyad: 'Mal Sahibi',
    sahipTc: '',
    sahipAdres: '',
    hisseOrani: 100,
    brut: Math.round(etkinTutarlar.brut * 100) / 100,
    stopaj: Math.round(etkinTutarlar.stopaj * 100) / 100,
    net: Math.round(etkinTutarlar.net * 100) / 100,
    tutarKaydiMalSahibineAit: false
  }]
}

/** 12 aylik kira stopaj tablosu olusturur */
export function hesaplaYillikKiraStopaj(kb = {}, yil) {
  const aylar = []
  let toplam = { brut: 0, stopaj: 0, net: 0 }

  for (let ay = 1; ay <= 12; ay++) {
    const kalemler = hesaplaAylikKiraStopaj(kb, yil, ay)
    const ayToplam = kalemler.reduce((acc, k) => ({
      brut: acc.brut + k.brut,
      stopaj: acc.stopaj + k.stopaj,
      net: acc.net + k.net
    }), { brut: 0, stopaj: 0, net: 0 })

    aylar.push({ ay, ayAdi: getAyAdi(ay), kalemler, toplam: ayToplam })
    toplam.brut += ayToplam.brut
    toplam.stopaj += ayToplam.stopaj
    toplam.net += ayToplam.net
  }

  return { aylar, toplam }
}

export function getAyAdi(ay) {
  const map = ['Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran', 'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik']
  return map[ay - 1] || ''
}

/** Kontrat bitisine kalan gun (negatif = suresi dolmus). Tarih yoksa null */
export function kontratKalanGun(kb = {}) {
  if (!kb.kiraBitis) return null
  const bitis = new Date(String(kb.kiraBitis).slice(0, 10) + 'T00:00:00')
  if (isNaN(bitis)) return null
  const bugun = new Date()
  bugun.setHours(0, 0, 0, 0)
  return Math.ceil((bitis - bugun) / 86400000)
}

/** Kontrat bitisine 60 gun veya daha az kaldiysa (ya da gectiyse) true */
export function kontratYaklasiyorMu(kb = {}, esikGun = 60) {
  const kalan = kontratKalanGun(kb)
  return kalan !== null && kalan <= esikGun
}

/** Bekleyen (onay bekleyen) kira yenileme talebi var mi */
export function bekleyenTalep(kb = {}) {
  const t = kb.yenilemeTalebi
  return t && t.durum === 'bekliyor' ? t : null
}

export function kiraGecmisi(kb = {}) {
  return Array.isArray(kb.kiraGecmisi) ? kb.kiraGecmisi : []
}

/** Kontrat bitisinden sonraki gun + 1 yil sonrasi (yeni donem varsayilani) */
export function yeniDonemTarihleri(kb = {}) {
  const bitisStr = kb.kiraBitis ? String(kb.kiraBitis).slice(0, 10) : null
  const bas = bitisStr ? new Date(bitisStr + 'T00:00:00') : new Date()
  if (bitisStr) bas.setDate(bas.getDate() + 1)
  const son = new Date(bas)
  son.setFullYear(son.getFullYear() + 1)
  son.setDate(son.getDate() - 1)
  const iso = d => d.toISOString().slice(0, 10)
  return { baslangic: iso(bas), bitis: iso(son) }
}

export function paraTR(n) {
  const num = Number(n)
  if (!Number.isFinite(num)) return '0,00'
  return num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function tarihTR(v) {
  if (!v) return '-'
  const d = new Date(String(v).slice(0, 10) + 'T00:00:00')
  return isNaN(d) ? '-' : d.toLocaleDateString('tr-TR')
}
