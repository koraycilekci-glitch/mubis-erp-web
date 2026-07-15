import { useState, useEffect, useCallback } from 'react'
import { useClients } from '../hooks/useClients'
import { 
  FileText, Search, Download,
  ChevronDown, ChevronRight, ListChecks, ChevronLeft
} from 'lucide-react'

export default function BeyanTakip() {
  const { clients: allClients } = useClients()
  const [clients, setClients] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [expandedClient, setExpandedClient] = useState(null)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  const months = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
  ]

  const beyanTipleri = [
    { id: 'kdv', label: 'KDV', icon: '📄' },
    { id: 'kdv2', label: 'KDV2', icon: '📄' },
    { id: 'muhtasar', label: 'Muhtasar', icon: '📄' },
    { id: 'gecici_vergi', label: 'Geçici Vergi', icon: '📄' },
    { id: 'kurumlar_vergi', label: 'Kurumlar Vergisi', icon: '🏢' },
    { id: 'gelir_vergi', label: 'Gelir Vergisi', icon: '👤' },
    { id: 'sgk', label: 'SGK', icon: '🏥' },
    { id: 'edefter', label: 'e-Defter', icon: '📓' },
  ]

  useEffect(() => {
    const clientsWithBeyan = allClients.map(client => ({
      ...client,
      beyanlar: generateBeyanlar(client)
    }))
    setClients(clientsWithBeyan)
  }, [allClients, generateBeyanlar])

  const generateBeyanlar = useCallback((client) => {
    const beyanlar = []
    const statuses = ['evrak_bekleniyor', 'hesaplandi', 'kontrol_edildi', 'beyan_gonderildi', 'tamamlandi']
    
    beyanTipleri.forEach((beyan, index) => {
      const status = statuses[index % statuses.length]
      beyanlar.push({
        id: `${client.id}_${beyan.id}`,
        type: beyan.id,
        label: beyan.label,
        icon: beyan.icon,
        period: 'Aylık',
        month: selectedMonth,
        year: selectedYear,
        status: status,
        deadline: `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(15 + index * 3).padStart(2, '0')}`,
        amount: Math.round((Math.random() * 5000 + 100) * 100) / 100,
        tax: Math.round((Math.random() * 900 + 18) * 100) / 100,
      })
    })
    return beyanlar
  }, [selectedMonth, selectedYear])

  const filteredClients = clients.filter(client => {
    const matchSearch = client.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        client.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        client.vkn?.includes(searchTerm) ||
                        client.tc?.includes(searchTerm)
    
    let matchType = true
    if (filterType === 'company') matchType = client.type === 'company'
    else if (filterType === 'individual') matchType = client.type === 'individual'

    return matchSearch && matchType
  })

  const stats = {
    total: clients.length,
    totalBeyan: clients.reduce((sum, c) => sum + (c.beyanlar?.length || 0), 0),
    completed: clients.reduce((sum, c) => sum + (c.beyanlar?.filter(b => b.status === 'tamamlandi').length || 0), 0),
    pending: clients.reduce((sum, c) => sum + (c.beyanlar?.filter(b => b.status !== 'tamamlandi').length || 0), 0),
  }

  const getStatusIcon = (status) => {
    const icons = {
      'evrak_bekleniyor': '📄',
      'hesaplandi': '🧮',
      'kontrol_edildi': '👨‍💼',
      'beyan_gonderildi': '📤',
      'tamamlandi': '✅'
    }
    return icons[status] || '📄'
  }

  const getStatusColor = (status) => {
    const colors = {
      'evrak_bekleniyor': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'hesaplandi': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      'kontrol_edildi': 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
      'beyan_gonderildi': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
      'tamamlandi': 'bg-green-500/20 text-green-400 border-green-500/30'
    }
    return colors[status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }

  const getStatusLabel = (status) => {
    const labels = {
      'evrak_bekleniyor': 'Evrak Bekleniyor',
      'hesaplandi': 'Hesaplandı',
      'kontrol_edildi': 'Kontrol Edildi',
      'beyan_gonderildi': 'Beyan Gönderildi',
      'tamamlandi': 'Tamamlandı'
    }
    return labels[status] || status
  }

  const getCompletionRate = (beyanlar) => {
    if (!beyanlar || beyanlar.length === 0) return 0
    const completed = beyanlar.filter(b => b.status === 'tamamlandi').length
    return Math.round((completed / beyanlar.length) * 100)
  }

  const toggleExpand = (clientId) => {
    setExpandedClient(expandedClient === clientId ? null : clientId)
  }

  const changeMonth = (delta) => {
    let newMonth = selectedMonth + delta
    let newYear = selectedYear
    if (newMonth > 11) {
      newMonth = 0
      newYear++
    } else if (newMonth < 0) {
      newMonth = 11
      newYear--
    }
    setSelectedMonth(newMonth)
    setSelectedYear(newYear)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center space-x-3">
            <ListChecks className="w-8 h-8 text-yellow-400" />
            <span>Beyanname Takip Merkezi</span>
          </h1>
          <p className="text-gray-400 mt-1">
            Tüm müşterilerin beyanname durumlarını tek ekrandan takip edin
          </p>
        </div>
        <button className="bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:shadow-lg hover:shadow-green-500/30 transition-all duration-300 flex items-center space-x-2 mt-4 md:mt-0">
          <Download className="w-4 h-4" />
          <span>Rapor İndir</span>
        </button>
      </div>

      {/* İstatistikler */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-white">{stats.total}</div>
          <div className="text-gray-400 text-xs">Toplam Müşteri</div>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-green-400">{stats.completed}</div>
          <div className="text-gray-400 text-xs">Tamamlanan Beyan</div>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-yellow-400">{stats.pending}</div>
          <div className="text-gray-400 text-xs">Bekleyen Beyan</div>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-blue-400">{stats.totalBeyan}</div>
          <div className="text-gray-400 text-xs">Toplam Beyan</div>
        </div>
      </div>

      {/* Ay Seçici */}
      <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 mb-6 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button onClick={() => changeMonth(-1)} className="text-gray-400 hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-white font-semibold text-lg">
            {months[selectedMonth]} {selectedYear}
          </span>
          <button onClick={() => changeMonth(1)} className="text-gray-400 hover:text-white">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Filtreler */}
      <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Müşteri ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 pl-10 pr-4 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors"
            />
          </div>

          <div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors"
            >
              <option value="all">Tüm Müşteri Tipi</option>
              <option value="company">🏢 Şirket</option>
              <option value="individual">👤 Bireysel</option>
            </select>
          </div>

          <div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors"
            >
              <option value="all">Tüm Durumlar</option>
              <option value="tamamlandi">✅ Tamamlandı</option>
              <option value="beyan_gonderildi">📤 Gönderildi</option>
              <option value="kontrol_edildi">👨‍💼 Kontrol Edildi</option>
              <option value="hesaplandi">🧮 Hesaplandı</option>
              <option value="evrak_bekleniyor">📄 Evrak Bekleniyor</option>
            </select>
          </div>
        </div>
      </div>

      {/* Müşteri Listesi */}
      <div className="space-y-3">
        {filteredClients.length === 0 ? (
          <div className="bg-blue-800/20 rounded-2xl p-12 text-center border border-blue-700/30">
            <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">Müşteri bulunamadı</p>
            <p className="text-gray-500 text-sm">Filtreleri değiştirerek tekrar deneyin</p>
          </div>
        ) : (
          filteredClients.map((client) => {
            const rate = getCompletionRate(client.beyanlar)
            const isExpanded = expandedClient === client.id

            return (
              <div key={client.id} className="bg-blue-800/20 rounded-2xl border border-blue-700/30 overflow-hidden">
                {/* Müşteri Özet Kartı */}
                <div 
                  className="p-5 cursor-pointer hover:bg-blue-800/30 transition-colors"
                  onClick={() => toggleExpand(client.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                        client.type === 'company' 
                          ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-blue-950' 
                          : 'bg-gradient-to-br from-blue-400 to-blue-600 text-white'
                      }`}>
                        {client.name?.charAt(0) || '?'}
                      </div>
                      <div>
                        <div className="text-white font-medium">{client.name}</div>
                        <div className="text-gray-400 text-xs flex items-center space-x-2">
                          <span>{client.type === 'company' ? '🏢' : '👤'}</span>
                          <span>{client.type === 'company' ? client.company || 'Şirket' : 'Bireysel'}</span>
                          <span>·</span>
                          <span>{client.beyanlar?.length || 0} Beyan</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-6">
                      {/* Tamamlanma Yüzdesi */}
                      <div className="hidden md:flex items-center space-x-2">
                        <div className="w-20 h-1.5 bg-blue-900/50 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${rate >= 80 ? 'bg-green-400' : rate >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                            style={{ width: `${rate}%` }}
                          />
                        </div>
                        <span className={`text-sm font-medium ${rate >= 80 ? 'text-green-400' : rate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                          %{rate}
                        </span>
                      </div>

                      <div className="text-gray-400">
                        {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Detaylı Beyan Listesi */}
                {isExpanded && (
                  <div className="border-t border-blue-700/30 p-5 bg-blue-900/20">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {client.beyanlar?.map((beyan) => (
                        <div 
                          key={beyan.id}
                          className={`p-4 rounded-xl border ${getStatusColor(beyan.status)}`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              <span className="text-lg">{beyan.icon}</span>
                              <span className="text-white font-medium text-sm">{beyan.label}</span>
                            </div>
                            <span className="text-xs text-gray-400">{beyan.period}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400">Son Tarih:</span>
                            <span className="text-gray-300">{beyan.deadline}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400">Tutar:</span>
                            <span className="text-gray-300">{beyan.amount.toFixed(2)} ₺</span>
                          </div>
                          <div className="flex justify-between text-sm mt-2 pt-2 border-t border-blue-700/30">
                            <span className="text-gray-400">Durum:</span>
                            <span className="text-xs font-medium">
                              {getStatusIcon(beyan.status)} {getStatusLabel(beyan.status)}
                            </span>
                          </div>
                        </div>
                      ))}
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