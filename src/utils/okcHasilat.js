function kurusOku(deger) {
  if (typeof deger === 'number') return Number.isFinite(deger) ? Math.round(deger * 100) : null
  const metin = String(deger ?? '').trim().replace(/\s*(?:TL|₺)$/i, '').trim()
  if (!/^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(metin)) return null
  const kurus = Math.round(Number(metin.replace(/\./g, '').replace(',', '.')) * 100)
  return Number.isSafeInteger(kurus) ? kurus : null
}

const etiketOku = etiket => etiket.toLocaleLowerCase('tr').normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i').replace(/\s+/g, ' ').trim()

function bildirilenToplamKurus(kayitlar, etiketDeseni) {
  let toplam = 0
  for (const kayit of kayitlar) {
    const alan = Object.entries(kayit.detay || {}).find(([etiket]) => etiketDeseni.test(etiketOku(etiket)))
    const kurus = kurusOku(alan?.[1])
    if (kurus === null) return null
    toplam += kurus
  }
  return toplam
}

export function okcBildirilenSatisToplami(kayitlar) {
  const kurus = bildirilenToplamKurus(kayitlar, /^toplam satis tutari[:\s]*$/)
  return kurus === null ? null : kurus / 100
}

export function okcHasilatOzeti(kayitlar) {
  const oranlar = new Map()
  const odemeler = { nakit: { kurus: 0, sayi: 0 }, kart: { kurus: 0, sayi: 0 } }
  let oranliKayit = 0
  for (const kayit of kayitlar) {
    const raporOranlari = new Map()
    const raporOdemeleri = {}
    for (const [etiket, metin] of Object.entries(kayit.detay || {})) {
      const anahtar = etiketOku(etiket)
      const kurus = kurusOku(metin)
      if (kurus === null) continue
      const oranEtiketi = anahtar.match(/^%\s*(\d{1,2}(?:[,.]\d+)?)\s*kdv.*satislar? toplami\b/)
      if (oranEtiketi) raporOranlari.set(Number(oranEtiketi[1].replace(',', '.')), kurus)
      if (/^nakit satislarin toplam tutari\b/.test(anahtar)) raporOdemeleri.nakit = kurus
      if (/^(?:banka\s*\/\s*)?kredi karti ile yapilan satislarin toplam tutari\b/.test(anahtar)) raporOdemeleri.kart = kurus
    }
    if (raporOranlari.size) oranliKayit++
    for (const [oran, brut] of raporOranlari) {
      const satir = oranlar.get(oran) || { matrah: 0, kdv: 0 }
      const matrah = Math.sign(brut) * Math.round(Math.abs(brut) * 100 / (100 + oran))
      satir.matrah += matrah
      satir.kdv += brut - matrah
      oranlar.set(oran, satir)
    }
    for (const [tur, kurus] of Object.entries(raporOdemeleri)) {
      odemeler[tur].kurus += kurus
      odemeler[tur].sayi++
    }
  }
  const satirlar = Array.from(oranlar, ([oran, { matrah, kdv }]) => ({ oran, matrah: matrah / 100, kdv: kdv / 100 })).sort((ilk, ikinci) => ilk.oran - ikinci.oran)
  const toplam = { matrah: 0, kdv: 0 }
  for (const satir of oranlar.values()) {
    toplam.matrah += satir.matrah
    toplam.kdv += satir.kdv
  }
  const bildirilenSatis = bildirilenToplamKurus(kayitlar, /^toplam satis tutari[:\s]*$/)
  const bildirilenKdv = bildirilenToplamKurus(kayitlar, /^toplam kdv tutari[:\s]*$/)
  const oranToplamiSatis = toplam.matrah + toplam.kdv
  return {
    satirlar,
    toplam: { matrah: toplam.matrah / 100, kdv: toplam.kdv / 100 },
    bildirilen: {
      satis: bildirilenSatis === null ? null : bildirilenSatis / 100,
      kdv: bildirilenKdv === null ? null : bildirilenKdv / 100,
      matrah: bildirilenSatis === null || bildirilenKdv === null ? null : (bildirilenSatis - bildirilenKdv) / 100
    },
    kdvFarki: kayitlar.length > 0 && bildirilenSatis === oranToplamiSatis && bildirilenKdv !== null && oranliKayit === kayitlar.length
      ? (toplam.kdv - bildirilenKdv) / 100
      : null,
    oranliKayit,
    odemeler: Object.fromEntries(Object.entries(odemeler).map(([tur, { kurus, sayi }]) => [tur, { tutar: sayi ? kurus / 100 : null, sayi }]))
  }
}
