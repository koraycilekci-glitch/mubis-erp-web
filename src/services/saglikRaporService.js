// ============ SAGLIK RAPORLARI (SGK istirahat raporlari takibi) ============
// 2.7.438: saglik_raporlari tablosu — admin elle giris veya SGK Ws_Vizite
// web servisi uzerinden cekilen istirahat raporlari.
// 2.7.440: onay_durumu ('onayli' | 'bekliyor') — SGK'da onaylanmis mi.
// Admin + musteri goruntuler ve sorgulayabilir.

import { supabase } from '../lib/supabase'

export async function getSaglikRaporlari(clientId, yil = null) {
  let query = supabase
    .from('saglik_raporlari')
    .select('*')
    .eq('client_id', clientId)
    .order('rapor_baslangic', { ascending: false })
  if (yil) query = query.gte('rapor_baslangic', `${yil}-01-01`).lte('rapor_baslangic', `${yil}-12-31`)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function addSaglikRapor(rapor) {
  const { data, error } = await supabase
    .from('saglik_raporlari')
    .insert({
      client_id: rapor.client_id ?? rapor.clientId,
      employee_id: rapor.employee_id ?? rapor.employeeId ?? null,
      tc_kimlik: rapor.tc_kimlik ?? rapor.tcKimlik ?? null,
      ad_soyad: rapor.ad_soyad ?? rapor.adSoyad ?? null,
      sicil_no: rapor.sicil_no ?? rapor.sicilNo ?? null,
      rapor_baslangic: rapor.rapor_baslangic ?? rapor.raporBaslangic ?? null,
      rapor_bitis: rapor.rapor_bitis ?? rapor.raporBitis ?? null,
      gun_sayisi: rapor.gun_sayisi ?? rapor.gunSayisi ?? null,
      nitelik: rapor.nitelik || null,
      kaynak: rapor.kaynak || 'manuel',
      onay_durumu: rapor.onay_durumu ?? rapor.onayDurumu ?? null,
      aciklama: rapor.aciklama || null
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// SGK sorgusundan toplu kayit — ayni TC + ayni baslangic tarihli kayit mukerrer
// eklenmez; mevcut kaydin onay durumu degistiyse (onay bekleyen -> onaylandi)
// guncellenir.
export async function bulkSaveSaglikRaporlari(clientId, raporlar) {
  if (!raporlar?.length) return []
  const mevcut = await getSaglikRaporlari(clientId)
  const anahtar = r => `${r.tc_kimlik || r.tcKimlik || ''}|${r.rapor_baslangic || r.raporBaslangic || ''}`
  const mevcutMap = new Map(mevcut.map(r => [anahtar(r), r]))
  const yeni = []
  const guncellenecek = []
  for (const r of raporlar) {
    const onay = r.onay_durumu ?? r.onayDurumu ?? null
    const varolan = mevcutMap.get(anahtar(r))
    if (varolan) {
      if (onay && varolan.onay_durumu !== onay) guncellenecek.push({ id: varolan.id, onay_durumu: onay })
      continue
    }
    yeni.push({
      client_id: clientId,
      employee_id: r.employee_id ?? r.employeeId ?? null,
      tc_kimlik: r.tc_kimlik ?? r.tcKimlik ?? null,
      ad_soyad: r.ad_soyad ?? r.adSoyad ?? null,
      sicil_no: r.sicil_no ?? r.sicilNo ?? null,
      rapor_baslangic: r.rapor_baslangic ?? r.raporBaslangic ?? null,
      rapor_bitis: r.rapor_bitis ?? r.raporBitis ?? null,
      gun_sayisi: r.gun_sayisi ?? r.gunSayisi ?? null,
      nitelik: r.nitelik || null,
      kaynak: 'sgk',
      onay_durumu: onay
    })
  }
  for (const g of guncellenecek) {
    await supabase.from('saglik_raporlari').update({ onay_durumu: g.onay_durumu }).eq('id', g.id)
  }
  if (!yeni.length) return []
  const { data, error } = await supabase.from('saglik_raporlari').insert(yeni).select()
  if (error) throw error
  return data || []
}

export async function deleteSaglikRapor(id) {
  const { error } = await supabase.from('saglik_raporlari').delete().eq('id', id)
  if (error) throw error
}
