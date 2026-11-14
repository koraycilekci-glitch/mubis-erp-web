// company-activity.js — Faaliyet dönemi dışındaki firmayı hiç sorgulamama
// Supabase'de ofis/firma aktivite periyotlarını tutar ve sorgulama
// öncesi kontrol sağlar. "Aktif dönemi dışı firma" istenirse direk
// boş sonuç döndürülerek needless GIB sorgulaması önlenir.

const day = (value) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value || '')
  return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : NaN
}

// Ofis aktif periyotlarını Supabase'ten çeker
async function ofisAktifPeriyotlari(ofisId) {
  try {
    const { data, error } = await supabase
      .from('office_activity_periods')
      .select('company_id, start_date, end_date')
      .eq('office_id', ofisId)

    if (error) throw error
    return data || []
  } catch (e) {
    console.log('[company-activity] Ofis periyotları okunamadı, varsayilan calisir:', e.message)
    return []
  }
}

// Bir firmanın sorgu-periodu overlap'ını kontrol eder
function companyInActivePeriod(companyId, periodStart, periodEnd, activePeriods) {
  if (!activePeriods || activePeriods.length === 0) return true // kontrol yoksa sor

  const start = day(periodStart)
  const end = day(periodEnd)

  if (Number.isNaN(start) || Number.isNaN(end)) return true // tarih parse edilemezse sor

  for (const p of activePeriods) {
    const pStart = day(p.start_date)
    const pEnd = day(p.end_date)
    if (Number.isFinite(pStart) && Number.isFinite(pEnd) && pStart <= end && pEnd >= start) {
      return true // overlap var, aktive
    }
  }
  return false // overlap yok, inaktif
}

module.exports = { ofisAktifPeriyotlari, companyInActivePeriod, day }