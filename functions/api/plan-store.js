// 2.8.45: Plan detaylari (gunler_ay / musteriler / tur bazli zamanlar) YENI
// KOLON GEREKTIRMEDEN app_settings tablosunda JSON olarak saklanir. Boylece
// Supabase sema onbellegi hatalari ("Could not find the ... column") olusmaz.
export const BORC_PLAN_KEY = 'borc_cron_v2'
export const DVS_PLAN_KEY = 'dvs_cron_v2'

export async function planJsonOku(supabase, key) {
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', key).limit(1).maybeSingle()
    if (!data?.value) return null
    return typeof data.value === 'string' ? JSON.parse(data.value) : data.value
  } catch {
    return null
  }
}

export async function planJsonYaz(supabase, key, deger) {
  const value = JSON.stringify(deger || {})
  const denemeler = [
    () => supabase.from('app_settings').upsert({ key, value, office_id: 1 }, { onConflict: 'office_id,key' }),
    () => supabase.from('app_settings').upsert({ key, value, office_id: null }, { onConflict: 'office_id,key' }),
    () => supabase.from('app_settings').upsert({ key, value }, { onConflict: 'key' }),
    () => supabase.from('app_settings').insert({ key, value })
  ]
  for (const dene of denemeler) {
    try {
      const { error } = await dene()
      if (!error) return true
    } catch { /* sonraki */ }
  }
  return false
}

// Gun+saat dilimlerini normalize eder.
//   gunluk  : {mod:'gunluk',  gunler_ay:[1,15], saat:'05:00'}
//   haftalik: {mod:'haftalik', hafta_gunleri:[1,5], saat:'05:00'}  (1=Pzt ... 7=Paz)
// Eski kayitlarda mod yoktur; gunler_ay doluysa gunluk kabul edilir.
export function zamanlariNormalize(liste) {
  if (!Array.isArray(liste)) return []
  return liste
    .map(z => {
      const mod = z?.mod === 'haftalik' ? 'haftalik' : 'gunluk'
      const saat = /^\d{1,2}:\d{2}$/.test(String(z?.saat || '')) ? z.saat : '05:00'
      if (mod === 'haftalik') {
        return {
          mod,
          gunler_ay: [],
          hafta_gunleri: Array.isArray(z?.hafta_gunleri)
            ? [...new Set(z.hafta_gunleri.map(Number).filter(n => n >= 1 && n <= 7))].sort((a, b) => a - b)
            : [],
          saat
        }
      }
      return {
        mod,
        gunler_ay: Array.isArray(z?.gunler_ay)
          ? [...new Set(z.gunler_ay.map(Number).filter(n => n >= 1 && n <= 31))].sort((a, b) => a - b)
          : [],
        hafta_gunleri: [],
        saat
      }
    })
    .filter(z => (z.mod === 'haftalik' ? z.hafta_gunleri.length : z.gunler_ay.length))
}
