// Kira bilgisi yardimcilari
// kira_bilgisi kolonu JSON (bazen string) olarak tutulur:
// { kiraTipi, isYeriKirasi, kiraBaslangic, kiraBitis, stopaj, evSahipleri,
//   yenilemeTalebi: { yeniNetKira, yeniBaslangic, yeniBitis, aciklama, durum, talepTarihi, ... } }

export const KIRA_STOPAJ_ORANI = 0.20

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
  const stopajVar = kb.stopaj === 'var'
  const oran = stopajVar ? KIRA_STOPAJ_ORANI : 0

  let net = Number(kb.kiraNet || kb.isYeriKirasi || 0) || 0
  let brut = Number(kb.kiraBrut || 0) || 0

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
  return Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function tarihTR(v) {
  if (!v) return '-'
  const d = new Date(String(v).slice(0, 10) + 'T00:00:00')
  return isNaN(d) ? '-' : d.toLocaleDateString('tr-TR')
}
