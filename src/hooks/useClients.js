import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'

// Musteri listesini async olarak yukleyen hook
export function useClients() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const { getClients } = useAuth()

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getClients()
      setClients(data || [])
    } catch (err) {
      console.error('Musteri listesi yuklenemedi:', err)
      setClients([])
    }
    setLoading(false)
  }, [getClients])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { clients, loading, refresh, setClients }
}
