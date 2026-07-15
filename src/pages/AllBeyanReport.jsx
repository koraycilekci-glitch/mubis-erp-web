import { useState, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronLeft, BarChart3, ChevronDown, ChevronUp } from 'lucide-react'

const MONTHS = ['Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran', 'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik']

const BEYAN_TYPES = [
  { id: 'kdv', name: 'KDV', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  { id: 'kdv2', name: 'KDV2', color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
  { id: 'muhtasar', name: 'Muhtasar', color: 'text-purple-400', bg: 'bg-purple-500/10' },
  { id: 'sgk', name: 'SGK', color: 'text-red-400', bg: 'bg-red-500/10' },
  { id: 'gecici_vergi', name: 'Gecici Vergi', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  { id: 'kurumlar_vergi', name: 'Kurumlar Vergisi', color: 'text-teal-400', bg: 'bg-teal-500/10' },
  { id: 'gelir_vergi', name: 'Gelir Vergisi', color: 'text-orange-400', bg: 'bg-orange-500/10' },
  { id: 'damga', name: 'Damga Vergisi', color: 'text-pink-400', bg: 'bg-pink-500/10' },
  { id: 'edefter', name: 'e-Defter', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
]

export default function AllBeyanReport() {
  const { updateClient } = useAuth()
  const { clients } = useClients()
  const navigate = useNavigate()

  const now = new Date()
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth())
  const [selectedBeyan, setSelectedBeyan] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedClient, setExpandedClient] = useState(null)

  // Musteri bazli rapor verisi
  const reportData = useMemo(() => {
    let yapilmadi = 0, hazir = 0, onaylandi = 0, tahakkukGonderildi = 0, totalBeyan = 0

    const beyanFilter = selectedBeyan === 'all' ? BEYAN_TYPES : BEYAN_TYPES.filter(b => b.id === selectedBeyan)

    const clientRows = clients.map(client => {
      const profile = client.beyanProfile || {}
      const durumlari = client.beyanDurumlari || {}

      const activeBeyanlar = []
      beyanFilter.forEach(beyanType => {
        const monthConfig = profile[beyanType.id]?.[selectedMonth]
        if (!monthConfig?.active) return

        const statusKey = `${selectedYear}_${selectedMonth}_${beyanType.id}`
        const status = durumlari[statusKey] || 'yapilmadi'
        const period = monthConfig.period || 'aylik'

        activeBeyanlar.push({
          beyanId: beyanType.id,
          beyanName: beyanType.name,
          color: beyanType.color,
          bg: beyanType.bg,
          status,
          period,
        })

        totalBeyan++
        if (status === 'hazir') hazir++
        else if (status === 'onaylandi' || status === 'yapildi') onaylandi++
        else if (status === 'tahakkuk_gonderildi') tahakkukGonderildi++
        else yapilmadi++
      })

      if (activeBeyanlar.length === 0) return null

      return {
        clientId: client.id,
        clientName: client.name || client.company,
        beyanlar: activeBeyanlar,
      }
    }).filter(Boolean)

    // Arama filtresi
    const filtered = clientRows.filter(r => {
      if (!searchTerm) return true
      return r.clientName.toLowerCase().includes(searchTerm.toLowerCase())
    })

    return {
      clientRows: filtered,
      stats: { yapilmadi, hazir, onaylandi, tahakkukGonderildi, total: totalBeyan }
    }
  }, [clients, selectedYear, selectedMonth, selectedBeyan, searchTerm])

  const getStatusBadge = (status) => {
    switch(status) {
      case 'hazir': return { label: 'Hazir', cls: 'bg-blue-500/20 text-blue-400' }
      case 'onaylandi':
      case 'yapildi': return { label: 'Onaylandi', cls: 'bg-green-500/20 text-green-400' }
      case 'tahakkuk_gonderildi': return { label: 'Tahakkuk', cls: 'bg-purple-500/20 text-purple-400' }
      default: return { label: 'Yapilmadi', cls: 'bg-yellow-500/20 text-yellow-400' }
    }
  }

  const handleStatusChange = async (clientId, beyanId, newStatus) => {
    const client = clients.find(c => c.id === clientId)
    if (!client) return

    const durumlari = { ...(client.beyanDurumlari || {}) }
    const statusKey = `${selectedYear}_${selectedMonth}_${beyanId}`
    durumlari[statusKey] = newStatus

    await updateClient(clientId, { ...client, beyanDurumlari: durumlari })
    // State'i guncellemek icin sayfayi yenile
    window.location.reload()
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/admin')} className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-blue-800/30">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-yellow-400" />
            Aylik Beyan Raporu
          </h1>
          <p className="text-gray-400 text-sm">{MONTHS[selectedMonth]} {selectedYear} - {reportData.clientRows.length} musteri</p>
        </div>
      </div>

      {/* Filtreler */}
      <div className="bg-blue-800/20 rounded-2xl p-4 border border-blue-700/30 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-gray-400 text-xs block mb-1">Yil</label>
            <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400">
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="text-gray-400 text-xs block mb-1">Ay</label>
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400">
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-gray-400 text-xs block mb-1">Beyan Turu</label>
            <select value={selectedBeyan} onChange={(e) => setSelectedBeyan(e.target.value)} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400">
              <option value="all">Tum Beyanlar</option>
              {BEYAN_TYPES.map(bt => <option key={bt.id} value={bt.id}>{bt.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-gray-400 text-xs block mb-1">Musteri Ara</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 pl-9 pr-3 text-white text-sm focus:outline-none focus:border-yellow-400" placeholder="Musteri ara..." />
            </div>
          </div>
        </div>
      </div>

      {/* Istatistik Kartlari */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-white">{reportData.stats.total}</div>
          <div className="text-gray-400 text-xs">Toplam Beyan</div>
        </div>
        <div className="bg-yellow-500/10 rounded-xl p-4 border border-yellow-500/20 text-center">
          <div className="text-2xl font-bold text-yellow-400">{reportData.stats.yapilmadi}</div>
          <div className="text-gray-400 text-xs">Yapilmadi</div>
        </div>
        <div className="bg-blue-500/10 rounded-xl p-4 border border-blue-500/20 text-center">
          <div className="text-2xl font-bold text-blue-400">{reportData.stats.hazir}</div>
          <div className="text-gray-400 text-xs">Hazir</div>
        </div>
        <div className="bg-green-500/10 rounded-xl p-4 border border-green-500/20 text-center">
          <div className="text-2xl font-bold text-green-400">{reportData.stats.onaylandi}</div>
          <div className="text-gray-400 text-xs">Onaylandi</div>
        </div>
        <div className="bg-purple-500/10 rounded-xl p-4 border border-purple-500/20 text-center">
          <div className="text-2xl font-bold text-purple-400">{reportData.stats.tahakkukGonderildi}</div>
          <div className="text-gray-400 text-xs">Tahakkuk Gonderildi</div>
        </div>
      </div>

      {/* Musteri Bazli Liste */}
      <div className="space-y-2">
        {reportData.clientRows.length === 0 ? (
          <div className="bg-blue-800/20 rounded-2xl p-8 border border-blue-700/30 text-center">
            <p className="text-gray-500">Bu donem icin beyan kaydi bulunamadi</p>
          </div>
        ) : (
          reportData.clientRows.map((row, idx) => {
            const isExpanded = expandedClient === row.clientId
            const completedCount = row.beyanlar.filter(b => b.status === 'onaylandi' || b.status === 'yapildi' || b.status === 'tahakkuk_gonderildi').length
            const totalCount = row.beyanlar.length

            return (
              <div key={row.clientId} className="bg-blue-800/20 rounded-xl border border-blue-700/30 overflow-hidden">
                {/* Musteri Satiri */}
                <button
                  onClick={() => setExpandedClient(isExpanded ? null : row.clientId)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-800/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500 text-sm w-8">{idx + 1}</span>
                    <span className="text-white font-medium text-sm">{row.clientName}</span>
                    <div className="flex gap-1 flex-wrap">
                      {row.beyanlar.map(b => {
                        const badge = getStatusBadge(b.status)
                        return (
                          <span key={b.beyanId} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.cls}`}>
                            {b.beyanName}{b.period === '3aylik' ? ' (3A)' : ''}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400 text-xs">{completedCount}/{totalCount}</span>
                    <div className="w-16 bg-blue-900/30 rounded-full h-1.5 overflow-hidden">
                      <div className="h-full bg-green-500 transition-all" style={{ width: `${totalCount > 0 ? (completedCount/totalCount)*100 : 0}%` }}></div>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>

                {/* Detay - Musterinin Bu Aydaki Beyanlari */}
                {isExpanded && (
                  <div className="border-t border-blue-700/30 bg-blue-950/30">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-gray-500 text-xs">
                          <th className="px-4 py-2">Beyan Turu</th>
                          <th className="px-4 py-2">Periyot</th>
                          <th className="px-4 py-2">Durum</th>
                          <th className="px-4 py-2">Islem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.beyanlar.map(b => {
                          const badge = getStatusBadge(b.status)
                          return (
                            <tr key={b.beyanId} className="border-t border-blue-800/20">
                              <td className="px-4 py-2">
                                <span className={`text-sm font-medium ${b.color}`}>{b.beyanName}</span>
                              </td>
                              <td className="px-4 py-2">
                                <span className="text-gray-400 text-xs">{b.period === '3aylik' ? '3 Aylik' : 'Aylik'}</span>
                              </td>
                              <td className="px-4 py-2">
                                <span className={`px-2 py-1 rounded text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                              </td>
                              <td className="px-4 py-2">
                                <select
                                  value={b.status}
                                  onChange={(e) => handleStatusChange(row.clientId, b.beyanId, e.target.value)}
                                  className="bg-blue-900/30 border border-blue-700/50 rounded-lg py-1 px-2 text-white text-xs focus:outline-none focus:border-yellow-400"
                                >
                                  <option value="yapilmadi">Yapilmadi</option>
                                  <option value="hazir">Hazir</option>
                                  <option value="onaylandi">Onaylandi</option>
                                  <option value="tahakkuk_gonderildi">Tahakkuk Gonderildi</option>
                                </select>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    <div className="px-4 py-2 border-t border-blue-800/20">
                      <button
                        onClick={() => navigate(`/admin/client/${row.clientId}/beyan-takip`)}
                        className="text-yellow-400 hover:text-yellow-300 text-xs font-medium"
                      >
                        Tum yil beyan takibi &rarr;
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
