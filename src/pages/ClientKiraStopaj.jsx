import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { resolveClientId } from '../utils/clientResolver'
import KiraStopajRaporu from '../components/KiraStopajRaporu'

export default function ClientKiraStopaj() {
  const { user } = useAuth()
  const [client, setClient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    const loadClient = async () => {
      if (!user) {
        if (active) {
          setClient(null)
          setLoading(false)
        }
        return
      }

      setLoading(true)
      setError('')

      try {
        const resolvedClientId = await resolveClientId(user)
        if (!resolvedClientId) {
          throw new Error('Giriş yapan kullanıcıya bağlı müşteri kaydı bulunamadı.')
        }

        const result = await supabase
          .from('clients')
          .select('*')
          .eq('id', resolvedClientId)
          .maybeSingle()

        if (result.error) throw result.error
        if (active) setClient(result.data || null)
      } catch (loadError) {
        if (active) setError(loadError?.message || 'Müşteri bilgileri yüklenemedi.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadClient()
    return () => {
      active = false
    }
  }, [user])

  if (loading) {
    return <div className="p-6 text-slate-400">Kira bilgileri yükleniyor...</div>
  }

  if (error) {
    return <div className="m-6 rounded-lg bg-red-500/15 p-4 text-red-300">{error}</div>
  }

  if (!client) {
    return <div className="m-6 rounded-lg bg-amber-500/15 p-4 text-amber-200">Kira raporu için müşteri kaydı bulunamadı.</div>
  }

  return <KiraStopajRaporu client={client} />
}