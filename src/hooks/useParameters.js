import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import * as defaults from '../data/defaults'

// Supabase'den parametreleri cek, yoksa varsayilan kullan
export function useParameters() {
  const [dbParams, setDbParams] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadParams()
  }, [])

  const loadParams = async () => {
    try {
      const { data } = await supabase.from('parameters').select('*')
      if (data && data.length > 0) {
        const params = {}
        data.forEach(p => {
          const key = `${p.category}_${p.year || ''}_${p.month || ''}_${p.key}`
          params[key] = p.value || p.text_value
        })
        setDbParams(params)
      }
    } catch (e) {
      // Tablo yoksa veya hata olursa varsayilanlarla devam
    }
    setLoading(false)
  }

  // Yi-UFE degeri getir
  const getYiUfe = (yil, ay) => {
    const dbKey = `yiufe_${yil}_${ay}_endeks`
    if (dbParams[dbKey]) return Number(dbParams[dbKey])
    return defaults.getYiUfe(yil, ay)
  }

  // DAK istisna tutari
  const getDakIstisna = (yil) => {
    const dbKey = `istisna_${yil}__dak`
    if (dbParams[dbKey]) return Number(dbParams[dbKey])
    return defaults.DAK_ISTISNA[yil] || defaults.DAK_ISTISNA[2025]
  }

  // GMS istisna tutari
  const getGmsIstisna = (yil) => {
    const dbKey = `istisna_${yil}__gms`
    if (dbParams[dbKey]) return Number(dbParams[dbKey])
    return defaults.GMS_ISTISNA[yil] || defaults.GMS_ISTISNA[2025]
  }

  // Kira artis orani
  const getKiraArtisOrani = (yil, ay) => {
    const dbKey = `kira_artis_${yil}_${ay}_oran`
    if (dbParams[dbKey]) return Number(dbParams[dbKey])
    const key = `${yil}-${String(ay).padStart(2, '0')}`
    return defaults.KIRA_ARTIS_ORANLARI[key] || null
  }

  // Kidem tavani
  const getKidemTavani = (tarih) => {
    return defaults.getKidemTavani(tarih)
  }

  // Parametre kaydet (admin)
  const saveParam = async (category, year, month, key, value, textValue = null) => {
    const { error } = await supabase.from('parameters').upsert({
      category, year, month, key,
      value: textValue ? null : value,
      text_value: textValue,
      updated_at: new Date().toISOString()
    }, { onConflict: 'category,year,month,key' })
    if (!error) await loadParams()
    return !error
  }

  // Hesaplama kaydet
  const saveCalculation = async (calcType, data) => {
    const { data: result, error } = await supabase.from('calculations').insert({
      calc_type: calcType,
      data,
      user_id: (await supabase.auth.getUser()).data.user?.id
    }).select().single()
    return error ? null : result
  }

  // Hesaplama guncelle
  const updateCalculation = async (id, data) => {
    const { error } = await supabase.from('calculations').update({ data, updated_at: new Date().toISOString() }).eq('id', id)
    return !error
  }

  // Hesaplama sil
  const deleteCalculation = async (id) => {
    const { error } = await supabase.from('calculations').delete().eq('id', id)
    return !error
  }

  // Hesaplamalari getir
  const getCalculations = async (calcType) => {
    const { data } = await supabase.from('calculations').select('*').eq('calc_type', calcType).order('created_at', { ascending: false })
    return data || []
  }

  return {
    loading, getYiUfe, getDakIstisna, getGmsIstisna, getKiraArtisOrani,
    getKidemTavani, saveParam, saveCalculation, updateCalculation,
    deleteCalculation, getCalculations, dbParams, loadParams
  }
}
