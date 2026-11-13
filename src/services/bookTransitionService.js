// Defter Türü Geçişi — VUK 177, 179, 180.
// Lisanslı otomasyondaki "Defter Türü Geçişi" bolumunun MUBiS uyarlamasi.
// Bu modul Luca kayitlarini veya defter turunu DEGISTIRMEZ; yalnızca
// yillik verilerden gecis degerlendirmesi uretir.
//
// Girdi: firma (defterTuru, tckn), yil, yillik veriler (purchases/sales/
// services + complete/closed) ve had tahmini (rate).
// Cikti: status, reason, estimated, provisional, years[].

// Resmi hadler (GIB tebligi). Yeni yil aciklanmadiginda kullanici oraniyla
// tahmin edilir.
export const OFFICIAL_LIMITS = {
  2024: { purchases: 1400000, sales: 2000000, services: 690000, mixed: 1400000 },
  2025: { purchases: 2000000, sales: 2800000, services: 990000, mixed: 2000000 },
  2026: { purchases: 2500000, sales: 3500000, services: 1200000, mixed: 2500000 },
}

export const LIMIT_LABELS = [
  ['purchases', 'Yıllık mal alımları'],
  ['sales', 'Yıllık mal satışları'],
  ['services', 'Gayrisafi hizmet geliri'],
  ['mixed', 'Mal satışları + 5 × hizmet geliri'],
]

export function limitsFor(year, estimates = {}) {
  if (OFFICIAL_LIMITS[year]) return { ...OFFICIAL_LIMITS[year], year, estimated: false }
  const entry = estimates[year]
  if (!entry || !['purchases', 'sales', 'services', 'mixed'].every(k => typeof entry[k] === 'number' && Number.isFinite(entry[k]) && entry[k] > 0)) return null
  return { ...entry, year, estimated: true }
}

export function estimateLimits(year, rate) {
  const y = Number(year), r = Number(rate)
  if (!Number.isInteger(y) || !OFFICIAL_LIMITS[y - 1]) throw new Error('Tahmin yılı veya oran geçersiz.')
  if (!Number.isFinite(r) || r < 0 || r > 200) throw new Error('Tahmin oranı 0-200 arası olmalıdır.')
  const prev = OFFICIAL_LIMITS[y - 1]
  const out = {}
  for (const k of ['purchases', 'sales', 'services', 'mixed']) out[k] = Math.round(prev[k] * (1 + r / 100))
  return out
}

// Luca raporundan gelen satir; classificationIssues varsa (mal/hizmet ayrimi
// belirsiz) hesaplamaya dahil edilmez.
function useRecordedColumns(record) {
  if (!record || record.bookType !== 'isletme' || !record.classificationIssues?.length) return record
  const known = record.classificationIssues.every(i => i.reason === 'Hizmet açıklaması satılan emtia sütununda kayıtlı.')
  const onlyClassification = record.complete === true || record.error === 'Yıllık hareketlerin mal/hizmet veya fatura/aktarım ayrımı kontrol edilmeli.'
  if (!known || !onlyClassification) return record
  if (!['purchases', 'sales', 'services'].every(k => Number.isFinite(record[k]) && record[k] >= 0)) return record
  return { ...record, complete: true, error: '', classificationWarnings: record.classificationIssues, classificationIssues: [] }
}

function measures(record, limits) {
  if (!record || !record.complete || !limits || record.classificationIssues?.length) return null
  const needed = record.activity === 'trade' ? ['purchases', 'sales']
    : record.activity === 'service' ? ['services']
    : record.activity === 'mixed' ? ['sales', 'services'] : null
  if (!needed || needed.some(k => typeof record[k] !== 'number' || !Number.isFinite(record[k]) || record[k] < 0)) return null
  const keys = record.activity === 'mixed' ? ['mixed'] : needed
  return keys.map(key => {
    const amount = key === 'mixed' ? record.sales + 5 * record.services : record[key]
    return { key, amount, limit: limits[key], ratio: amount / limits[key], percent: (amount / limits[key] - 1) * 100 }
  })
}

export function evaluate({ bookType, entity, year, years = {}, estimates = {}, today = new Date() }) {
  const result = { year, targetYear: year + 1, status: 'Veri eksik', reason: '', estimated: false, provisional: false, years: [] }
  if (!Number.isInteger(year) || year < 2023 || year > 2098) throw new Error('Faaliyet yılı geçersiz.')
  if (!bookType) return { ...result, reason: years[year]?.error || 'Defter türü okunamadı.' }
  if (!['bilanco', 'isletme'].includes(bookType)) return { ...result, status: 'Kapsam dışı', reason: 'Bu kontrol bilanço ve işletme hesabı esasındaki ticari faaliyetler içindir.' }
  if (entity === 'corporate') return { ...result, status: bookType === 'bilanco' ? 'Mevcut tür devam' : 'Veri eksik', reason: bookType === 'bilanco' ? 'Ticaret şirketi / kurum: yalnızca iş hacmi azalması işletme hesabına dönüş hakkı vermez (VUK 177).' : 'Hukuki tür ile işletme defteri kaydı birlikte kontrol edilmeli.' }
  if (!['individual', 'ordinaryPartnership'].includes(entity)) return { ...result, reason: 'Hukuki tür doğrulanmadı; işletmeye dönüş önerilmedi.' }

  const normalizedYears = Object.fromEntries(Object.entries(years).map(([y, r]) => [y, useRecordedColumns(r)]))
  const count = bookType === 'bilanco' ? 3 : 2
  for (let offset = 0; offset < count; offset++) {
    const y = year - offset
    const record = normalizedYears[y]
    const limits = limitsFor(y + 1, estimates)
    const values = measures(record, limits)
    result.years.push({ year: y, limits, values, error: record?.error || (!limits ? 'İzleyen yılın hadleri yok.' : !values ? 'Yıllık veri veya faaliyet ayrımı eksik.' : '') })
  }
  const current = result.years[0]
  if (!current.values) return { ...result, reason: current.error }
  result.estimated = !!current.limits?.estimated
  result.provisional = year >= today.getFullYear() || normalizedYears[year]?.closed !== true

  const over = x => x.values?.some(v => v.ratio > 1)
  const under = x => x.values?.every(v => v.ratio < 1)
  let used = [current]
  if (bookType === 'isletme' && current.values.some(v => v.ratio > 1.2)) {
    result.status = 'Bilançoya geçiş gerekli'
    result.reason = 'Tek dönem iş hacmi haddi %20\'den fazla aşıyor (VUK 180/1).'
  } else if (bookType === 'bilanco' && current.values.every(v => v.ratio < 0.8)) {
    result.status = 'İşletmeye dönüş mümkün'
    result.reason = 'Tek dönem iş hacmi ilgili hadlerin %20\'den fazla altında (VUK 179/1).'
  } else if ((bookType === 'isletme' ? over(current) : under(current))) {
    used = result.years
    if (used.some(x => !x.values)) { result.reason = 'Ardışık dönem kontrolü için geçmiş yıl verisi veya had eksik.'; return result }
    const pass = used.every(bookType === 'isletme' ? over : under)
    result.status = pass ? (bookType === 'isletme' ? 'Bilançoya geçiş gerekli' : 'İşletmeye dönüş mümkün') : 'Mevcut tür devam'
    result.reason = pass ? (bookType === 'isletme' ? 'Arka arkaya iki dönemde had aşıldı (VUK 180/2).' : 'Arka arkaya üç dönemde ilgili hadlerin altında kalındı (VUK 179/2).') : 'Ardışık dönem geçiş şartı oluşmadı.'
  } else {
    result.status = 'Mevcut tür devam'
    result.reason = 'İş hacmi yönünden geçiş şartı oluşmadı.'
  }
  if (Object.values(normalizedYears).some(r => r?.classificationWarnings?.length)) result.reason += ' Mal/hizmet ayrımı kontrol edilmeli. Hesaplama Luca\'da kayıtlı sütunlara göre yapıldı.'
  if (Object.values(normalizedYears).some(r => r?.classificationCorrections?.length)) result.reason += ' Doğrulanan hizmet faturaları hizmet gelirine alındı.'
  result.estimated = used.some(x => x.limits?.estimated)
  result.provisional ||= used.some(x => normalizedYears[x.year]?.closed !== true)
  return result
}

// Excel'e aktar
export async function bookTransitionExcel({ yil, rows, rate }) {
  const XLSX = await import('xlsx')
  const kolonlar = ['Firma', 'Defter Türü', 'Mal Alımları', 'Mal Satışları', 'Hizmet Geliri', 'Önceki Yıl (Al/Sat/Hiz)', 'Sonuç', 'Açıklama', 'Tahmini mi', 'Ön Değerlendirme mi']
  const satirlar = (rows || []).map(r => {
    const v = r.years?.[yil] || {}
    const prev = r.years?.[yil - 1]
    return {
      'Firma': r.ad,
      'Defter Türü': r.bookType === 'bilanco' ? 'Bilanço' : r.bookType === 'isletme' ? 'İşletme' : (r.bookType || ''),
      'Mal Alımları': v.purchases ?? '',
      'Mal Satışları': v.sales ?? '',
      'Hizmet Geliri': v.services ?? '',
      'Önceki Yıl (Al/Sat/Hiz)': prev?.complete ? [prev.purchases, prev.sales, prev.services].map(n => Number.isFinite(n) ? n : '—').join(' / ') : (prev?.error || 'önceki yıl okunamadı'),
      'Sonuç': r.result?.status || '',
      'Açıklama': r.result?.reason || v.error || '',
      'Tahmini mi': r.result?.estimated ? 'Evet' : 'Hayır',
      'Ön Değerlendirme mi': r.result?.provisional ? 'Evet' : 'Hayır',
    }
  })
  const aoa = [
    [`Defter Türü Geçiş Kontrolü — ${yil} faaliyet yılı`],
    [`Hedef yıl: ${Number(yil) + 1} · Tahmini had artışı: %${rate ?? '—'} · ${satirlar.length} firma`],
    kolonlar,
    ...satirlar.map(s => kolonlar.map(k => s[k] ?? '')),
  ]
  if (!satirlar.length) aoa.push(['Seçili dönemde kayıt bulunamadı.'])
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = kolonlar.map(k => ({ wch: Math.min(48, Math.max(12, String(k).length + 4)) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Defter Gecisi')
  XLSX.writeFile(wb, `Defter_Turu_Gecisi_${yil}.xlsx`)
  return satirlar.length
}
