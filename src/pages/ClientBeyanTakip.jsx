import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import { ArrowLeft, FileText, CheckCircle, Clock, Send, ThumbsUp } from 'lucide-react'

const MONTHS = ['Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran', 'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik']

const BEYAN_TYPES = [
  { id: 'kdv', name: 'KDV', color: 'text-blue-400' },
  { id: 'kdv2', name: 'KDV2', color: 'text-indigo-400' },
  { id: 'muhtasar', name: 'Muhtasar', color: 'text-purple-400' },
  { id: 'sgk', name: 'SGK', color: 'text-red-400' },
  { id: 'gecici_vergi', name: 'Gecici Vergi', color: 'text-yellow-400' },
  { id: 'kurumlar_vergi', name: 'Kurumlar Vergisi', color: 'text-teal-400' },
  { id: 'gelir_vergi', name: 'Gelir Vergisi', color: 'text-orange-400' },
  { id: 'damga', name: 'Damga Vergisi', color: 'text-pink-400' },
  { id: 'edefter', name: 'e-Defter', color: 'text-cyan-400' },
]

const STATUS_MAP = {
  yapilmadi: { label: 'Yapilmadi', cls: 'bg-yellow-500/20 text-yellow-400' },
  hazir: { label: 'Hazir', cls: 'bg-blue-500/20 text-blue-400' },
  onaylandi: { label: 'Onaylandi', cls: 'bg-green-500/20 text-green-400' },
  tahakkuk_gonderildi: { label: 'Tahakkuk', cls: 'bg-purple-500/20 text-purple-400' },
}

export default function ClientBeyanTakip() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { updateClient } = useAuth()
  const { clients } = useClients()
  const [client, setClient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  useEffect(() => {
    const found = clients.find(c => c.id === parseInt(id))
    if (found) setClient(found)
    setLoading(false)
  }, [id, clients])

  const activeBeyanlar = useMemo(() => {
    if (!client) return []
    const profile = client.beyanProfile || {}
    const result = []

    BEYAN_TYPES.forEach(bt => {
      const activeMonths = []
      for (let m = 0; m < 12; m++) {
        const config = profile[bt.id]?.[m]
        if (config?.active) {
          const statusKey = `${selectedYear}_${m}_${bt.id}`
          const status = (client.beyanDurumlari || {})[statusKey] || 'yapilmadi'
          activeMonths.push({ month: m, status, period: config.period || 'aylik' })
        }
      }
      if (activeMonths.length > 0) {
        result.push({ ...bt, activeMonths })
      }
    })
    return result
  }, [client, selectedYear])

  const handleStatusChange = async (beyanId, month, newStatus) => {
    if (!client) return
    const durumlari = { ...(client.beyanDurumlari || {}) }
    const statusKey = `${selectedYear}_${month}_${beyanId}`
    durumlari[statusKey] = newStatus

    const updated = { ...client, beyanDurumlari: durumlari }
    await updateClient(parseInt(id), updated)
    setClient(updated)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400"></div>
      </div>
    )
  }

  if (!client) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl text-white mb-4">Musteri bulunamadi</h2>
        <button onClick={() => navigate('/admin/musteriler')} className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-6 py-2 rounded-lg font-semibold">Geri Don</button>
      </div>
    )
  }

  let totalBeyan = 0, yapilmadi = 0, hazirCount = 0, onaylandiCount = 0, tahakkukCount = 0
  activeBeyanlar.forEach(bt => {
    bt.activeMonths.forEach(m => {
      totalBeyan++
      if (m.status === 'hazir') hazirCount++
      else if (m.status === 'onaylandi') onaylandiCount++
      else if (m.status === 'tahakkuk_gonderildi') tahakkukCount++
      else yapilmadi++
    })
  })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(`/admin/client/${id}`)} className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-blue-800/30">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{client.name} - Beyan Takip</h1>
          <p className="text-gray-400 text-sm">{selectedYear} yili beyan durumlari</p>
        </div>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(parseInt(e.target.value))}
          className="bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400"
        >
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-blue-800/20 rounded-xl p-3 border border-blue-700/30 text-center">
          <div className="text-xl font-bold text-white">{totalBeyan}</div>
          <div className="text-gray-400 text-xs">Toplam</div>
        </div>
        <div className="bg-yellow-500/10 rounded-xl p-3 border border-yellow-500/20 text-center">
          <div className="text-xl font-bold text-yellow-400">{yapilmadi}</div>
          <div className="text-gray-400 text-xs">Yapilmadi</div>
        </div>
        <div className="bg-blue-500/10 rounded-xl p-3 border border-blue-500/20 text-center">
          <div className="text-xl font-bold text-blue-400">{hazirCount}</div>
          <div className="text-gray-400 text-xs">Hazir</div>
        </div>
        <div className="bg-green-500/10 rounded-xl p-3 border border-green-500/20 text-center">
          <div className="text-xl font-bold text-green-400">{onaylandiCount}</div>
          <div className="text-gray-400 text-xs">Onaylandi</div>
        </div>
        <div className="bg-purple-500/10 rounded-xl p-3 border border-purple-500/20 text-center">
          <div className="text-xl font-bold text-purple-400">{tahakkukCount}</div>
          <div className="text-gray-400 text-xs">Tahakkuk</div>
        </div>
      </div>

      {activeBeyanlar.length === 0 ? (
        <div className="bg-blue-950/40 rounded-2xl p-8 border border-blue-800/30 text-center">
          <p className="text-gray-400 mb-4">Bu musteri icin beyan profili tanimlanmamis</p>
          <button
            onClick={() => navigate(`/admin/client/${id}/beyan-profile`)}
            className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-4 py-2 rounded-lg font-semibold text-sm"
          >
            Beyan Profili Olustur
          </button>
        </div>
      ) : (
        <div className="bg-blue-800/20 rounded-2xl border border-blue-700/30 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-blue-900/30">
                <tr className="text-left text-gray-400 text-sm">
                  <th className="px-4 py-3 sticky left-0 bg-blue-900/90 z-10">Beyan</th>
                  {MONTHS.map((m, i) => (
                    <th key={i} className="px-2 py-3 text-center text-xs min-w-[90px]">{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeBeyanlar.map(bt => (
                  <tr key={bt.id} className="border-t border-blue-700/20">
                    <td className="px-4 py-3 sticky left-0 bg-blue-950/90 z-10">
                      <span className={`font-medium text-sm ${bt.color}`}>{bt.name}</span>
                    </td>
                    {MONTHS.map((_m, mi) => {
                      const monthData = bt.activeMonths.find(md => md.month === mi)
                      if (!monthData) {
                        return <td key={mi} className="px-2 py-3 text-center"><span className="text-gray-700 text-xs">-</span></td>
                      }
                      const info = STATUS_MAP[monthData.status] || STATUS_MAP.yapilmadi
                      return (
                        <td key={mi} className="px-1 py-2 text-center">
                          <select
                            value={monthData.status}
                            onChange={(e) => handleStatusChange(bt.id, mi, e.target.value)}
                            className={`w-full rounded px-1 py-1 text-[10px] font-medium border-0 focus:outline-none focus:ring-1 focus:ring-yellow-400 cursor-pointer ${info.cls}`}
                          >
                            <option value="yapilmadi">Yapilmadi</option>
                            <option value="hazir">Hazir</option>
                            <option value="onaylandi">Onaylandi</option>
                            <option value="tahakkuk_gonderildi">Tahakkuk</option>
                          </select>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex gap-4 mt-4 text-xs text-gray-500 flex-wrap">
        <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-yellow-400" /> Yapilmadi</span>
        <span className="flex items-center gap-1"><FileText className="w-3 h-3 text-blue-400" /> Hazir</span>
        <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3 text-green-400" /> Onaylandi</span>
        <span className="flex items-center gap-1"><Send className="w-3 h-3 text-purple-400" /> Tahakkuk Gonderildi</span>
      </div>
    </div>
  )
}
