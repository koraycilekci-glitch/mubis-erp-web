import { useEffect, useState } from 'react'
import { Users, CalendarClock, TrendingUp, Sparkles, Activity } from 'lucide-react'
import { useClients } from '../hooks/useClients'
import { getEmployees } from '../services/clientService'
import PersonelKayitlari from './izin/PersonelKayitlari'
import IzinGirisiSorgulama from './izin/IzinGirisiSorgulama'
import KidemIhbarHesap from './izin/KidemIhbarHesap'
import SaglikRapor from './izin/SaglikRapor'
import { asArray, clientName } from './izin/izinUtils'

const TABS = [
  { key: 'personel', label: 'Personel', icon: Users },
  { key: 'izin', label: 'İzin', icon: CalendarClock },
  { key: 'kidem-ihbar', label: 'Kıdem / İhbar', icon: TrendingUp },
  { key: 'saglik-rapor', label: 'Rapor', icon: Activity }
]

export default function IzinTakip({ clientId: propClientId }) {
  const { clients = [] } = useClients()
  // 2.7.5xx: Müşteri listesi açılır listede alfabetik (Türkçe) — tüm rollerde
  const clientList = (Array.isArray(clients) ? clients : [])
    .slice()
    .sort((a, b) => clientName(a).localeCompare(clientName(b), 'tr'))
  const [clientId, setClientId] = useState(propClientId || '')
  const [employees, setEmployees] = useState([])
  const [activeTab, setActiveTab] = useState('personel')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (propClientId) setClientId(propClientId)
  }, [propClientId])

  const reloadEmployees = async () => {
    if (!clientId) {
      setEmployees([])
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await getEmployees(clientId)
      setEmployees(asArray(result))
    } catch (loadError) {
      setError(loadError?.message || 'Personel listesi yüklenemedi.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reloadEmployees()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  return (
    <div
      className="min-h-screen gradient-bg space-y-6 p-4 text-white md:p-6"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-amber-300/70">
            <Sparkles className="h-3.5 w-3.5" /> MUBİS İzin Takip
          </div>
          <h1 className="gradient-text text-2xl font-bold">İzin Takip</h1>
          <p className="text-sm text-muted">Personel, izin ve kıdem/ihbar tazminatı yönetimi</p>
        </div>
        {!propClientId && (
          <select
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-blue-100"
          >
            <option value="">Müşteri seçin</option>
            {clientList.filter((client) => client?.id).map((client) => (
              <option key={client.id} value={client.id}>{clientName(client)}</option>
            ))}
          </select>
        )}
      </div>

      {error && <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
      {loading && <div className="text-sm text-muted">Yükleniyor...</div>}

      <div className="flex gap-1 border-b border-white/10">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                isActive ? 'text-amber-300' : 'text-blue-200/60 hover:text-blue-100'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {isActive && (
                <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500" />
              )}
            </button>
          )
        })}
      </div>

      {activeTab === 'personel' && (
        <PersonelKayitlari
          clientId={clientId}
          employees={employees}
          reload={reloadEmployees}
          setLoading={setLoading}
          setError={setError}
          onTabChange={setActiveTab}
        />
      )}

      {activeTab === 'izin' && (
        <IzinGirisiSorgulama
          clientId={clientId}
          employees={employees}
          clientList={clientList}
          setError={setError}
        />
      )}

      {activeTab === 'kidem-ihbar' && (
        <KidemIhbarHesap
          clientId={clientId}
          employees={employees}
          clientList={clientList}
          setError={setError}
        />
      )}

      {activeTab === 'saglik-rapor' && (
        <SaglikRapor
          clientId={clientId}
          employees={employees}
          clientList={clientList}
          isMusteri={!!propClientId}
        />
      )}
    </div>
  )
}
