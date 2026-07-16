import { supabase } from '../lib/supabase'

// ============ MUHASEBE UCRETLERI ============

export async function getAccountingFee(clientId) {
  const { data, error } = await supabase
    .from('accounting_fees')
    .select('*')
    .eq('client_id', clientId)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data || null
}

export async function saveAccountingFee(clientId, feeData) {
  const { data, error } = await supabase
    .from('accounting_fees')
    .upsert({
      client_id: clientId,
      onceki_donem_borc: feeData.onceki_donem_borc || 0,
      defter_tasdik_ucreti: feeData.defter_tasdik_ucreti || 0,
      aylik_ucret: feeData.aylik_ucret || 0,
      baslangic_ay: feeData.baslangic_ay || 1,
      baslangic_yil: feeData.baslangic_yil || 2025,
      notlar: feeData.notlar || '',
      updated_at: new Date().toISOString()
    }, { onConflict: 'client_id' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getAllAccountingFees() {
  const { data, error } = await supabase
    .from('accounting_fees')
    .select('*')
  if (error) throw error
  return data || []
}

// ============ ODEMELER ============

export async function getPayments(clientId) {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('client_id', clientId)
    .order('odeme_tarihi', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getAllPayments() {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .order('odeme_tarihi', { ascending: false })
  if (error) throw error
  return data || []
}

export async function addPayment(paymentData) {
  const { data, error } = await supabase
    .from('payments')
    .insert({
      client_id: paymentData.client_id,
      tutar: paymentData.tutar,
      odeme_tipi: paymentData.odeme_tipi || 'eft',
      odeme_kanali: paymentData.odeme_kanali || 'manuel',
      aciklama: paymentData.aciklama || '',
      donem: paymentData.donem || '',
      gateway_ref: paymentData.gateway_ref || '',
      odeme_tarihi: paymentData.odeme_tarihi || new Date().toISOString().split('T')[0]
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deletePayment(id) {
  const { error } = await supabase.from('payments').delete().eq('id', id)
  if (error) throw error
}

// ============ BORC HESAPLAMA ============

export function hesaplaBorcOzeti(fee, payments, referansTarih = new Date()) {
  if (!fee) return { oncekiDonem: 0, defterTasdik: 0, aylikToplam: 0, toplamBorc: 0, toplamOdeme: 0, kalanBorc: 0, aylikUcret: 0, gecenAy: 0 }

  const oncekiDonem = Number(fee.onceki_donem_borc) || 0
  const defterTasdik = Number(fee.defter_tasdik_ucreti) || 0
  const aylikUcret = Number(fee.aylik_ucret) || 0

  // Baslangictan bugune kac ay gecti
  const basYil = fee.baslangic_yil || 2025
  const basAy = fee.baslangic_ay || 1
  const refYil = referansTarih.getFullYear()
  const refAy = referansTarih.getMonth() + 1
  let gecenAy = (refYil - basYil) * 12 + (refAy - basAy) + 1
  if (gecenAy < 0) gecenAy = 0

  const aylikToplam = aylikUcret * gecenAy
  const toplamBorc = oncekiDonem + defterTasdik + aylikToplam

  // Toplam odeme
  const toplamOdeme = (payments || []).reduce((sum, p) => sum + (Number(p.tutar) || 0), 0)

  const kalanBorc = toplamBorc - toplamOdeme

  // Son odeme tarihi
  const sonOdeme = payments && payments.length > 0 ? payments[0].odeme_tarihi : null

  return { oncekiDonem, defterTasdik, aylikUcret, gecenAy, aylikToplam, toplamBorc, toplamOdeme, kalanBorc, sonOdeme }
}

// ============ BANKA BILGILERI ============
export const BANKA_BILGILERI = {
  banka: 'Garanti Bankası',
  hesapSahibi: 'Aziz Koray Çilekci',
  iban: 'TR04 0006 2000 1350 0006 6215 82'
}
