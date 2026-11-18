export const fisYuvarla = deger => Math.round((Number(deger) || 0) * 100) / 100

export function satisKdvDetaylari(satis = {}) {
  satis = satis || {}
  return [0, 1, 5, 8, 10, 18, 20].flatMap(oran => {
    const toplam = Number(satis[`s${oran}`] ?? satis[`satis${oran}`]) || 0
    const acikMatrah = satis[`matrah${oran}`], acikKdv = satis[`kdv${oran}`]
    if (!toplam && !Number(acikMatrah) && !Number(acikKdv)) return []
    const matrah = acikMatrah != null && Number(acikMatrah) !== 0 ? fisYuvarla(acikMatrah) : fisYuvarla(toplam / (1 + oran / 100))
    const kdv = acikKdv != null ? fisYuvarla(acikKdv) : fisYuvarla(toplam - matrah)
    return [{ oran, matrah, kdv }]
  })
}

export function fisDetaylariniDogrula(detaylar, matrah, kdv, toplam) {
  if (!Array.isArray(detaylar) || !detaylar.length) return []
  const gruplar = new Map()
  for (const detay of detaylar) {
    if (!detay || detay.oran == null || detay.oran === '' || detay.matrah == null || detay.kdv == null) return []
    const oran = Number(detay.oran), m = Number(detay.matrah), k = Number(detay.kdv)
    if (![oran, m, k].every(Number.isFinite) || oran < 0 || oran > 100) return []
    const grup = gruplar.get(oran) || { oran, matrah: 0, kdv: 0 }
    grup.matrah = fisYuvarla(grup.matrah + m)
    grup.kdv = fisYuvarla(grup.kdv + k)
    gruplar.set(oran, grup)
  }
  const sonuc = [...gruplar.values()].sort((ilk, son) => ilk.oran - son.oran)
  const m = fisYuvarla(sonuc.reduce((sum, detay) => sum + detay.matrah, 0))
  const k = fisYuvarla(sonuc.reduce((sum, detay) => sum + detay.kdv, 0))
  const uyumlu = (beklenen, gercek) => beklenen == null || Math.abs(Number(beklenen) - gercek) <= 0.02
  return uyumlu(matrah, m) && uyumlu(kdv, k) && uyumlu(toplam, fisYuvarla(m + k)) ? sonuc : []
}

export function fisOdemeBilgisi(fis) {
  const nakit = fis.nakit ?? fis.nakit_tutar ?? null
  const manuelZ = fis.fatura_turu === 'Z RAPORU' && !fis.xml_url && /^(manuel-|musteri-)/.test(fis.fatura_uuid || '')
  const kredi = fis.kredi ?? (manuelZ && nakit != null && fis.tutar != null ? fisYuvarla(Number(fis.tutar) - Number(nakit)) : null)
  return {
    nakit: nakit == null ? null : fisYuvarla(nakit),
    kredi: kredi == null ? null : fisYuvarla(kredi),
  }
}

export function fisKaydiMi(fis) {
  return ['Z RAPORU', 'GIDER FISI', 'GIDER DOKUMU'].includes(String(fis.fatura_turu || fis.tur || '').toLocaleUpperCase('tr').replace(/[İı]/g, 'I').replace(/Ş/g, 'S').replace(/Ö/g, 'O').replace(/Ü/g, 'U'))
}

export function fisFaturaSatirlari(fatura, detaylar = []) {
  const odeme = fisOdemeBilgisi(fatura)
  return fisOranSatirlari({
    ...fatura,
    toplam: fatura.tutar ?? fatura.toplam,
    fisNo: fatura.fatura_no || fatura.fisNo,
    satici: fatura.karsi_unvan || fatura.satici || fatura.fatura_turu || fatura.tur,
    kdvDetaylari: fatura.kdvDetaylari?.length ? fatura.kdvDetaylari : detaylar,
    ...odeme,
  })
}

export function fisOranSatirlari(fis) {
  const detaylar = fisDetaylariniDogrula(fis.kdvDetaylari, fis.matrah, fis.kdv, fis.toplam)
  if (!detaylar.length) return [fis]
  return detaylar.map((detay, indeks) => ({
    ...fis,
    satirKey: `${fis.id}-kdv-${detay.oran}`,
    kdvOran: detay.oran,
    matrah: detay.matrah,
    kdv: detay.kdv,
    toplam: fisYuvarla(detay.matrah + detay.kdv),
    nakit: indeks === 0 ? fis.nakit : null,
    kredi: indeks === 0 ? fis.kredi : null,
    odemeBelgeToplami: detaylar.length > 1,
    odemeDevamSatiri: indeks > 0,
  }))
}
