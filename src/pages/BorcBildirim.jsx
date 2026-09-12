import { useState, useEffect } from 'react'
import {
  DollarSign, Send, MessageCircle, Mail, CheckSquare, Square,
  Search, RefreshCw, CheckCircle, XCircle, Clock, AlertTriangle,
  ChevronDown, ChevronUp, Users, TrendingDown
} from 'lucide-react'
import {
  getClientsWithDebt, sendDebtNotification, sendBulkDebtNotifications,
  getDebtNotificationHistory
} from '../services/debtNotificationService'
import { getSettings } from '../services/settingsService'
import { formatDateTimeTR } from '../utils/dateUtils'

export default function BorcBildirim() {
  const [activeTab, setActiveTab] = useState('borclular')
  const [settings, setSettings] = useState(null)

  // Borclu listesi
  const [debtors, setDebtors] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedClients, setSelectedClients] = useState(new Set())
  const [selectAll, setSelectAll] = useState(false)

  // Gonderim
  const [selectedChannel, setSelectedChannel] = useState('whatsapp')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState(null)

  // Gecmis
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    loadSettings()
    loadDebtors()
    loadHistory()
  }, [])

  const loadSettings = async () => {
    try {
      const s = await getSettings()
      setSettings(s)
    } catch (e) {
      console.error('Ayarlar yuklenemedi:', e)
    }
  }

  const loadDebtors = async () => {
    setLoading(true)
    try {
      const data = await getClientsWithDebt()
      setDebtors(data)
    } catch (e) {
      console.error('Borclu listesi yuklenemedi:', e)
    } finally {
      setLoading(false)
    }
  }

  const loadHistory = async () => {
    setHistoryLoading(true)
    try {
      const data = await getDebtNotificationHistory()
      setHistory(data)
    } catch (e) {
      console.error('Gecmis yuklenemedi:', e)
    } finally {
      setHistoryLoading(false)
    }
  }

  const filteredDebtors = debtors.filter(d => {
    if (!searchTerm) return true
    const s = searchTerm.toLowerCase()
    return (d.name || '').toLowerCase().includes(s) ||
           (d.company || '').toLowerCase().includes(s)
  })

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedClients(new Set())
    } else {
      setSelectedClients(new Set(filteredDebtors.map(d => d.id)))
    }
    setSelectAll(!selectAll)
  }

  const toggleClient = (id) => {
    const next = new Set(selectedClients)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedClients(next)
    setSelectAll(next.size === filteredDebtors.length && filteredDebtors.length > 0)
  }

  const handleSendSingle = async (clientId) => {
    if (!confirm('Borc bildirimi gondermek istiyor musunuz?')) return
    setSending(true)
    try {
      await sendDebtNotification(clientId, selectedChannel, settings)
      alert('Bildirim gonderildi!')
      loadHistory()
    } catch (err) {
      alert('Hata: ' + err.message)
    } finally {
      setSending(false)
    }
  }

  const handleSendBulk = async () => {
    if (selectedClients.size === 0) {
      alert('Lutfen en az bir musteri secin')
      return
    }
    if (!confirm(`${selectedClients.size} musteriye borc bildirimi gondermek istiyor musunuz?`)) return

    setSending(true)
    setSendResult(null)
    try {
      const result = await sendBulkDebtNotifications(
        Array.from(selectedClients),
        selectedChannel,
        settings
      )
      setSendResult(result)
      setSelectedClients(new Set())
      setSelectAll(false)
      loadHistory()
    } catch (err) {
      alert('Hata: ' + err.message)
    } finally {
      setSending(false)
    }
  }

  const totalBorc = debtors.reduce((sum, d) => sum + (d.ozet?.kalanBorc || 0), 0)

  const getStatusIcon = (status) => {
    switch (status) {
      case 'gonderildi': return <CheckCircle className="w-4 h-4 text-green-400" />
      case 'basarisiz': return <XCircle className="w-4 h-4 text-red-400" />
      default: return <Clock className="w-4 h-4 text-yellow-400" />
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-8">
        <DollarSign className="w-8 h-8 text-red-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Borc Bildirim Merkezi</h1>
          <p className="text-gray-400 text-sm">Musterilere borc hatirlatmasi gonderin</p>
        </div>
      </div>

      {/* Ozet Kartlari */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-800/30">
          <div className="text-2xl font-bold text-white">{debtors.length}</div>
          <div className="text-sm text-gray-400">Borclu Musteri</div>
        </div>
        <div className="bg-red-900/20 rounded-xl p-4 border border-red-800/30">
          <div className="text-2xl font-bold text-red-400">
            {totalBorc.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
          </div>
          <div className="text-sm text-gray-400">Toplam Borc</div>
        </div>
        <div className="bg-yellow-900/20 rounded-xl p-4 border border-yellow-800/30">
          <div className="text-2xl font-bold text-yellow-400">
            {history.filter(h => h.status === 'gonderildi').length}
          </div>
          <div className="text-sm text-gray-400">Gonderilen Bildirim</div>
        </div>
      </div>

      {/* Sekmeler */}
      <div className="flex gap-2 mb-6 border-b border-blue-800/50">
        {[
          { id: 'borclular', label: 'Borclu Musteriler', icon: Users },
          { id: 'gecmis', label: 'Bildirim Gecmisi', icon: Clock }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-yellow-400 text-yellow-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* BORCLU MUSTERILER */}
      {activeTab === 'borclular' && (
        <div className="space-y-4">
          {/* Kanal Secimi ve Toplu Gonderim */}
          <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-800/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-sm text-white">Kanal:</span>
              <button
                onClick={() => setSelectedChannel('whatsapp')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition-all ${
                  selectedChannel === 'whatsapp'
                    ? 'bg-green-500/20 border-green-500/50 text-green-400'
                    : 'bg-blue-900/30 border-blue-700/30 text-gray-400'
                }`}
              >
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </button>
              <button
                onClick={() => setSelectedChannel('email')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition-all ${
                  selectedChannel === 'email'
                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                    : 'bg-blue-900/30 border-blue-700/30 text-gray-400'
                }`}
              >
                <Mail className="w-3.5 h-3.5" /> E-Posta
              </button>
            </div>

            {selectedClients.size > 0 && (
              <button
                onClick={handleSendBulk}
                disabled={sending}
                className="btn-primary px-4 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {sending ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Gonderiliyor...</>
                ) : (
                  <><Send className="w-4 h-4" /> {selectedClients.size} Kisiye Gonder</>
                )}
              </button>
            )}
          </div>

          {/* Sonuc */}
          {sendResult && (
            <div className={`rounded-xl p-4 border ${
              sendResult.failed === 0
                ? 'bg-green-900/20 border-green-500/30'
                : 'bg-yellow-900/20 border-yellow-500/30'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                {sendResult.failed === 0 ? (
                  <><CheckCircle className="w-5 h-5 text-green-400" /><span className="text-green-400 font-medium">Tamamlandi</span></>
                ) : (
                  <><AlertTriangle className="w-5 h-5 text-yellow-400" /><span className="text-yellow-400 font-medium">Kismen Tamamlandi</span></>
                )}
              </div>
              <div className="text-sm text-gray-300">
                Basarili: <span className="text-green-400">{sendResult.sent}</span> |
                Basarisiz: <span className="text-red-400">{sendResult.failed}</span>
              </div>
            </div>
          )}

          {/* Arama ve Secim */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Musteri ara..."
                className="w-full bg-blue-950/50 border border-blue-700/50 rounded-lg py-2 pl-9 pr-3 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400"
              />
            </div>
            <button
              onClick={handleSelectAll}
              className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1 whitespace-nowrap"
            >
              {selectAll ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              {selectAll ? 'Tumunu Kaldir' : 'Tumunu Sec'}
            </button>
            <button
              onClick={loadDebtors}
              className="p-2 text-gray-400 hover:text-white transition-colors"
              title="Yenile"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Liste */}
          {loading ? (
            <div className="text-center py-8 text-gray-400">Yukleniyor...</div>
          ) : filteredDebtors.length === 0 ? (
            <div className="text-center py-8 text-gray-400">Borclu musteri bulunmamaktadir.</div>
          ) : (
            <div className="space-y-2">
              {filteredDebtors.map(d => (
                <div
                  key={d.id}
                  className={`bg-blue-900/20 rounded-xl p-4 border transition-all ${
                    selectedClients.has(d.id)
                      ? 'border-yellow-500/30 bg-yellow-500/5'
                      : 'border-blue-800/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      onClick={() => toggleClient(d.id)}
                      className="cursor-pointer"
                    >
                      {selectedClients.has(d.id) ? (
                        <CheckSquare className="w-5 h-5 text-yellow-400" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-500" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-white font-medium">{d.company || d.name}</div>
                      <div className="text-xs text-gray-400">
                        {d.phone || 'Telefon yok'} • {d.email || 'E-posta yok'}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-lg font-bold text-red-400">
                        {d.ozet.kalanBorc.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                      </div>
                      <div className="text-xs text-gray-500">
                        Aylik: {(d.fee?.aylik_ucret || 0).toLocaleString('tr-TR')} TL
                      </div>
                    </div>

                    <button
                      onClick={() => handleSendSingle(d.id)}
                      disabled={sending}
                      className="p-2 bg-green-500/20 rounded-lg text-green-400 hover:bg-green-500/30 transition-colors disabled:opacity-50"
                      title="Bildirim Gonder"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* GECMIS */}
      {activeTab === 'gecmis' && (
        <div className="space-y-4">
          {historyLoading ? (
            <div className="text-center py-8 text-gray-400">Yukleniyor...</div>
          ) : history.length === 0 ? (
            <div className="text-center py-8 text-gray-400">Heniz borc bildirimi gonderilmemis.</div>
          ) : (
            history.map(h => (
              <div key={h.id} className="bg-blue-900/20 rounded-xl p-4 border border-blue-800/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(h.status)}
                    <div>
                      <div className="text-white font-medium">{h.clients?.company || h.clients?.name || 'Bilinmiyor'}</div>
                      <div className="text-xs text-gray-400">
                         {formatDateTimeTR(h.created_at)} |
                        Kanal: {h.channel} |
                        Tutar: {h.borc_tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                      </div>
                    </div>
                  </div>
                  <div className={`text-xs px-2 py-1 rounded-full ${
                    h.status === 'gonderildi'
                      ? 'bg-green-500/20 text-green-400'
                      : h.status === 'basarisiz'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {h.status === 'gonderildi' ? 'Gonderildi' : h.status === 'basarisiz' ? 'Basarisiz' : 'Bekliyor'}
                  </div>
                </div>
                {h.error_message && (
                  <div className="mt-2 text-xs text-red-400">Hata: {h.error_message}</div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
