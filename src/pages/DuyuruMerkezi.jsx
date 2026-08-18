import { useState, useEffect } from 'react'
import { useClients } from '../hooks/useClients'
import {
  Megaphone, Send, MessageCircle, Mail, CheckSquare, Square,
  Search, RefreshCw, CheckCircle, XCircle, Clock, Trash2,
  ChevronDown, ChevronUp, Bell, FileText, Users, AlertTriangle
} from 'lucide-react'
import {
  createAnnouncement, getAnnouncements, deleteAnnouncement,
  getRecipientsByAnnouncement, sendAnnouncementToRecipients,
  getAnnouncementTemplates, formatAnnouncementMessage, addRecipients,
  addCustomTemplate, deleteCustomTemplate
} from '../services/announcementService'
import { getSettings } from '../services/settingsService'

export default function DuyuruMerkezi() {
  const { clients, loading: clientsLoading } = useClients()
  const [activeTab, setActiveTab] = useState('yeni')
  const [settings, setSettings] = useState(null)

  // Yeni duyuru formu
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [selectedChannels, setSelectedChannels] = useState(['whatsapp'])
  const [selectedClients, setSelectedClients] = useState(new Set())
  const [selectAll, setSelectAll] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState(null)

  // Gecmis
  const [announcements, setAnnouncements] = useState([])
  const [announcementsLoading, setAnnouncementsLoading] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [recipients, setRecipients] = useState({})

  // Sablonlar
  const [templates, setTemplates] = useState(getAnnouncementTemplates())
  const [showNewTemplate, setShowNewTemplate] = useState(false)
  const [newTemplateTitle, setNewTemplateTitle] = useState('')
  const [newTemplateMessage, setNewTemplateMessage] = useState('')

  useEffect(() => {
    loadSettings()
    loadAnnouncements()
  }, [])

  const loadTemplates = () => {
    setTemplates(getAnnouncementTemplates())
  }

  const handleAddTemplate = () => {
    if (!newTemplateTitle.trim() || !newTemplateMessage.trim()) {
      alert('Lutfen baslik ve mesaj girin')
      return
    }
    addCustomTemplate({ title: newTemplateTitle, message: newTemplateMessage })
    setNewTemplateTitle('')
    setNewTemplateMessage('')
    setShowNewTemplate(false)
    loadTemplates()
  }

  const handleDeleteTemplate = (templateId) => {
    if (!templateId.startsWith('custom_')) {
      alert('Varsayilan sablonlar silinemez')
      return
    }
    if (confirm('Bu sablonu silmek istiyor musunuz?')) {
      deleteCustomTemplate(templateId)
      loadTemplates()
    }
  }

  const loadSettings = async () => {
    try {
      const s = await getSettings()
      setSettings(s)
    } catch (e) {
      console.error('Ayarlar yuklenemedi:', e)
    }
  }

  const loadAnnouncements = async () => {
    setAnnouncementsLoading(true)
    try {
      const data = await getAnnouncements()
      setAnnouncements(data)
    } catch (e) {
      console.error('Duyurular yuklenemedi:', e)
    } finally {
      setAnnouncementsLoading(false)
    }
  }

  const filteredClients = clients.filter(c => {
    if (!searchTerm) return true
    const s = searchTerm.toLowerCase()
    return (c.name || '').toLowerCase().includes(s) ||
           (c.company || '').toLowerCase().includes(s) ||
           (c.phone || '').includes(s)
  })

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedClients(new Set())
    } else {
      setSelectedClients(new Set(filteredClients.map(c => c.id)))
    }
    setSelectAll(!selectAll)
  }

  const toggleClient = (id) => {
    const next = new Set(selectedClients)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedClients(next)
    setSelectAll(next.size === filteredClients.length && filteredClients.length > 0)
  }

  const handleTemplateSelect = (template) => {
    setTitle(template.title)
    setMessage(template.message)
  }

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      alert('Lutfen baslik ve mesaj girin')
      return
    }
    if (selectedClients.size === 0) {
      alert('Lutfen en az bir musteri secin')
      return
    }
    if (selectedChannels.length === 0) {
      alert('Lutfen en az bir kanal secin')
      return
    }

    setSending(true)
    setSendResult(null)

    try {
      // Duyuru olustur
      const announcement = await createAnnouncement({
        title,
        message,
        type: 'duyuru',
        channels: selectedChannels
      })

      // Alicilari ekle (her kanal icin)
      const clientIds = Array.from(selectedClients)
      for (const channel of selectedChannels) {
        await addRecipients(announcement.id, clientIds, channel)
      }

      // Gonder
      const result = await sendAnnouncementToRecipients(announcement.id, settings)
      setSendResult(result)

      // Formu temizle
      setTitle('')
      setMessage('')
      setSelectedClients(new Set())
      setSelectAll(false)

      // Gecmisi yenile
      loadAnnouncements()
    } catch (err) {
      console.error('Gonderim hatasi:', err)
      alert('Gonderim sirasinda hata: ' + err.message)
    } finally {
      setSending(false)
    }
  }

  const loadRecipients = async (announcementId) => {
    if (recipients[announcementId]) return
    try {
      const data = await getRecipientsByAnnouncement(announcementId)
      setRecipients(prev => ({ ...prev, [announcementId]: data }))
    } catch (e) {
      console.error('Alicilar yuklenemedi:', e)
    }
  }

  const toggleExpand = (id) => {
    if (expandedId === id) {
      setExpandedId(null)
    } else {
      setExpandedId(id)
      loadRecipients(id)
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'gonderildi': return <CheckCircle className="w-4 h-4 text-green-400" />
      case 'basarisiz': return <XCircle className="w-4 h-4 text-red-400" />
      default: return <Clock className="w-4 h-4 text-yellow-400" />
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'gonderildi': return 'Gonderildi'
      case 'basarisiz': return 'Basarisiz'
      default: return 'Bekliyor'
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-8">
        <Megaphone className="w-8 h-8 text-yellow-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Duyuru Merkezi</h1>
          <p className="text-gray-400 text-sm">Musterilere toplu duyuru gonderin</p>
        </div>
      </div>

      {/* Sekmeler */}
      <div className="flex gap-2 mb-6 border-b border-blue-800/50">
        {[
          { id: 'yeni', label: 'Yeni Duyuru', icon: Bell },
          { id: 'gecmis', label: 'Duyuru Gecmisi', icon: FileText },
          { id: 'sablonlar', label: 'Sablonlar', icon: FileText }
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

      {/* YENI DUYURU */}
      {activeTab === 'yeni' && (
        <div className="space-y-6">
          {/* Kanal Secimi */}
          <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-800/30">
            <label className="text-sm font-medium text-white mb-3 block">Gonderim Kanali</label>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  const next = selectedChannels.includes('whatsapp')
                    ? selectedChannels.filter(c => c !== 'whatsapp')
                    : [...selectedChannels, 'whatsapp']
                  setSelectedChannels(next)
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                  selectedChannels.includes('whatsapp')
                    ? 'bg-green-500/20 border-green-500/50 text-green-400'
                    : 'bg-blue-900/30 border-blue-700/30 text-gray-400'
                }`}
              >
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </button>
              <button
                onClick={() => {
                  const next = selectedChannels.includes('email')
                    ? selectedChannels.filter(c => c !== 'email')
                    : [...selectedChannels, 'email']
                  setSelectedChannels(next)
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                  selectedChannels.includes('email')
                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                    : 'bg-blue-900/30 border-blue-700/30 text-gray-400'
                }`}
              >
                <Mail className="w-4 h-4" /> E-Posta
              </button>
            </div>
          </div>

          {/* Duyuru Formu */}
          <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-800/30 space-y-4">
            <div>
              <label className="text-sm font-medium text-white mb-1 block">Baslik</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Duyuru basligi..."
                className="w-full bg-blue-950/50 border border-blue-700/50 rounded-lg py-2 px-3 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-white mb-1 block">Mesaj</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Duyuru mesajini yazin... {musteri_adi} ile musteri ismi ekleyebilirsiniz."
                rows={5}
                className="w-full bg-blue-950/50 border border-blue-700/50 rounded-lg py-2 px-3 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400 resize-none"
              />
              <p className="text-xs text-gray-500 mt-1">Ipucu: {'{musteri_adi}'} yazarak musteri ismini otomatik ekleyebilirsiniz.</p>
            </div>
          </div>

          {/* Musteri Secimi */}
          <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-800/30">
            <div className="flex items-center justify-between mb-4">
              <label className="text-sm font-medium text-white">Musteri Secimi ({selectedClients.size} secili)</label>
              <div className="flex gap-2">
                <button
                  onClick={handleSelectAll}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  {selectAll ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
                  {selectAll ? 'Tumunu Kaldir' : 'Tumunu Sec'}
                </button>
              </div>
            </div>

            <div className="mb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Musteri ara..."
                  className="w-full bg-blue-950/50 border border-blue-700/50 rounded-lg py-2 pl-9 pr-3 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400"
                />
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-1">
              {clientsLoading ? (
                <div className="text-center py-4 text-gray-400">Yukleniyor...</div>
              ) : filteredClients.length === 0 ? (
                <div className="text-center py-4 text-gray-400">Musteri bulunamadi</div>
              ) : (
                filteredClients.map(client => (
                  <div
                    key={client.id}
                    onClick={() => toggleClient(client.id)}
                    className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                      selectedClients.has(client.id)
                        ? 'bg-yellow-500/10 border border-yellow-500/30'
                        : 'bg-blue-950/30 border border-transparent hover:bg-blue-800/20'
                    }`}
                  >
                    {selectedClients.has(client.id) ? (
                      <CheckSquare className="w-4 h-4 text-yellow-400 shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-500 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">{client.company || client.name}</div>
                      <div className="text-xs text-gray-500">
                        {client.phone || 'Telefon yok'} • {client.email || 'E-posta yok'}
                      </div>
                      {/* Birden fazla numara varsa goster */}
                      {client.phoneNumbers && client.phoneNumbers.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {client.phoneNumbers.map((pn, idx) => (
                            <span
                              key={idx}
                              className={`text-[10px] px-1.5 py-0.5 rounded ${
                                pn.isWhatsapp
                                  ? 'bg-green-500/20 text-green-400'
                                  : 'bg-blue-500/20 text-blue-400'
                              }`}
                            >
                              {pn.name || 'Kisi'}: {pn.phone} {pn.isWhatsapp && '(WA)'}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Gonderim Sonucu */}
          {sendResult && (
            <div className={`rounded-xl p-4 border ${
              sendResult.failed === 0
                ? 'bg-green-900/20 border-green-500/30'
                : 'bg-yellow-900/20 border-yellow-500/30'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {sendResult.failed === 0 ? (
                  <>
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    <span className="text-green-400 font-medium">Gonderim Tamamlandi</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-5 h-5 text-yellow-400" />
                    <span className="text-yellow-400 font-medium">Gonderim Kismen Tamamlandi</span>
                  </>
                )}
              </div>
              <div className="text-sm text-gray-300">
                Basarili: <span className="text-green-400 font-medium">{sendResult.sent}</span> |
                Basarisiz: <span className="text-red-400 font-medium">{sendResult.failed}</span> |
                Toplam: <span className="text-white font-medium">{sendResult.total}</span>
              </div>
            </div>
          )}

          {/* Gonder Butonu */}
          <button
            onClick={handleSend}
            disabled={sending || selectedClients.size === 0 || !title.trim() || !message.trim()}
            className="w-full btn-primary py-3 rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {sending ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                Gonderiliyor...
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                {selectedClients.size} Musteriye Gonder
              </>
            )}
          </button>
        </div>
      )}

      {/* GECMIS */}
      {activeTab === 'gecmis' && (
        <div className="space-y-4">
          {announcementsLoading ? (
            <div className="text-center py-8 text-gray-400">Yukleniyor...</div>
          ) : announcements.length === 0 ? (
            <div className="text-center py-8 text-gray-400">Heniz duyuru gonderilmemis.</div>
          ) : (
            announcements.map(a => (
              <div key={a.id} className="bg-blue-900/20 rounded-xl border border-blue-800/30 overflow-hidden">
                <div
                  onClick={() => toggleExpand(a.id)}
                  className="p-4 cursor-pointer hover:bg-blue-800/20 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Bell className="w-5 h-5 text-yellow-400" />
                      <div>
                        <div className="text-white font-medium">{a.title}</div>
                        <div className="text-xs text-gray-400">
                          {new Date(a.created_at).toLocaleString('tr-TR')} |
                          Kanal: {a.channels?.join(', ') || '-'} |
                          Basarili: {a.sent_count} |
                          Basarisiz: {a.failed_count}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm('Bu duyuruyu silmek istiyor musunuz?')) {
                            deleteAnnouncement(a.id).then(loadAnnouncements)
                          }
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      {expandedId === a.id ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </div>
                </div>

                {expandedId === a.id && recipients[a.id] && (
                  <div className="border-t border-blue-800/30 p-4">
                    <p className="text-sm text-gray-300 mb-3">{a.message}</p>
                    <div className="text-xs font-medium text-gray-400 mb-2">Alici Durumlari:</div>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {recipients[a.id].map(r => (
                        <div key={r.id} className="flex items-center gap-2 text-sm">
                          {getStatusIcon(r.status)}
                          <span className="text-gray-300">{r.clients?.company || r.clients?.name || 'Bilinmiyor'}</span>
                          <span className="text-xs text-gray-500">({r.channel})</span>
                          <span className={`text-xs ${
                            r.status === 'gonderildi' ? 'text-green-400' :
                            r.status === 'basarisiz' ? 'text-red-400' : 'text-yellow-400'
                          }`}>
                            {getStatusText(r.status)}
                          </span>
                          {r.error_message && (
                            <span className="text-xs text-red-400">- {r.error_message}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* SABLONLAR */}
      {activeTab === 'sablonlar' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-400">
              {templates.filter(t => t.id.startsWith('custom_')).length} ozel sablon
            </div>
            <button
              onClick={() => setShowNewTemplate(!showNewTemplate)}
              className="text-sm text-yellow-400 hover:text-yellow-300 flex items-center gap-1"
            >
              {showNewTemplate ? 'Iptal' : '+ Yeni Sablon'}
            </button>
          </div>

          {showNewTemplate && (
            <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-800/30 space-y-3">
              <div>
                <label className="text-sm text-white mb-1 block">Sablon Basligi</label>
                <input
                  type="text"
                  value={newTemplateTitle}
                  onChange={(e) => setNewTemplateTitle(e.target.value)}
                  placeholder="Orn: Yil Sonu Duyurusu"
                  className="w-full bg-blue-950/50 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-yellow-400"
                />
              </div>
              <div>
                <label className="text-sm text-white mb-1 block">Mesaj Icerigi</label>
                <textarea
                  value={newTemplateMessage}
                  onChange={(e) => setNewTemplateMessage(e.target.value)}
                  placeholder="Sayin {musteri_adi},..."
                  rows={4}
                  className="w-full bg-blue-950/50 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-yellow-400 resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">Ipucu: {'{musteri_adi}'} yazarak musteri ismini otomatik ekleyebilirsiniz.</p>
              </div>
              <button
                onClick={handleAddTemplate}
                className="btn-primary px-4 py-2 rounded-lg text-sm"
              >
                Sablonu Kaydet
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map(t => (
              <div
                key={t.id}
                className="bg-blue-900/20 rounded-xl p-4 border border-blue-800/30 hover:border-yellow-500/30 hover:bg-blue-800/20 transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-yellow-400" />
                    <span className="text-white font-medium text-sm">{t.title}</span>
                  </div>
                  {t.id.startsWith('custom_') && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteTemplate(t.id)
                      }}
                      className="text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400 line-clamp-3 mb-3">{t.message}</p>
                <button
                  onClick={() => {
                    handleTemplateSelect(t)
                    setActiveTab('yeni')
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Kullanmak icin tiklayin →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
