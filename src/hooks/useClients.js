import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  musteriListesiGetir,
  musteriListesiOnbellek,
  musteriListesineAboneOl,
  musteriListesiSifirla
} from '../services/clientStore'

export function useClients() {
  const { getClients, user } = useAuth()
  const kapsam = user?.authUserId || null
  const kapsamRef = useRef(kapsam)
  kapsamRef.current = kapsam
  const getiriciRef = useRef(getClients)
  getiriciRef.current = getClients

  const ilkVeri = musteriListesiOnbellek(kapsam)
  const [liste, setListe] = useState({ kapsam, veri: ilkVeri || [] })
  const [loading, setLoading] = useState(!!kapsam && !ilkVeri)
  const [error, setError] = useState(null)
  const clients = liste.kapsam === kapsam ? liste.veri : (ilkVeri || [])

  const yukle = useCallback(async (zorla = false) => {
    if (!kapsam) {
      setListe({ kapsam, veri: [] })
      setLoading(false)
      setError(null)
      return
    }
    if (!musteriListesiOnbellek(kapsam)) setLoading(true)
    try {
      const veri = await musteriListesiGetir(() => getiriciRef.current(), { kapsam, zorla })
      if (kapsamRef.current !== kapsam) return
      setListe({ kapsam, veri })
      setError(null)
    } catch (err) {
      if (kapsamRef.current !== kapsam) return
      console.error('Musteri listesi yuklenemedi:', err)
      setError('Müşteri verileri alınamadı. Bağlantıyı kontrol edip yeniden deneyin.')
    } finally {
      if (kapsamRef.current === kapsam) setLoading(false)
    }
  }, [kapsam])

  useEffect(() => {
    let canli = true
    const onbellek = musteriListesiOnbellek(kapsam)
    setListe({ kapsam, veri: onbellek || [] })
    setError(null)
    setLoading(!!kapsam && !onbellek)
    const abone = musteriListesineAboneOl(kapsam, (veri) => {
      if (canli) setListe({ kapsam, veri: veri || [] })
    })
    yukle(false)

    const dinle = () => { yukle(true) }
    window.addEventListener('mubis-clients-refresh', dinle)
    return () => {
      canli = false
      abone()
      window.removeEventListener('mubis-clients-refresh', dinle)
    }
  }, [kapsam, yukle])

  const refresh = useCallback(() => yukle(true), [yukle])
  const setClients = useCallback((veri) => {
    setListe(onceki => {
      const mevcut = onceki.kapsam === kapsam ? onceki.veri : (musteriListesiOnbellek(kapsam) || [])
      return { kapsam, veri: typeof veri === 'function' ? veri(mevcut) : (veri || []) }
    })
  }, [kapsam])
  const temizle = useCallback(() => {
    musteriListesiSifirla(kapsam)
    setListe({ kapsam, veri: [] })
  }, [kapsam])

  return { clients, loading, error, refresh, setClients, temizle }
}
