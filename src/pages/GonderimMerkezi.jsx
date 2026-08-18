import { useState, useEffect, useMemo, useCallback } from 'react'
import { useClients } from '../hooks/useClients'
import { supabase } from '../lib/supabase'
import {
  Send, MessageCircle, Mail, CheckSquare, Square,
  Search, Filter, Calendar, FileText, RefreshCw,
  CheckCircle, XCircle, Clock, Phone, AtSign, Trash2, AlertTriangle
} from 'lucide-react'
import { getClientDocumentUrl } from '../services/documentService'
import { sendEmail, openWhatsAppWeb, logWhatsAppWebSend } from '../services/whatsappService'
import { getSettings } from '../services/settingsService'
import { createNotification } from '../services/notificationService'

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

const BEYAN_TIPLERI = [
  { id: 'kdv', label: 'KDV' },
  { id: 'kdv2', label: 'KDV2' },
  { id: 'muhtasar', label: 'Muhtasar' },
  { id: 'sgk', label: 'SGK' },
  { id: 'gecici_vergi', label: 'Geçici Vergi' },
  { id: 'kurumlar_vergi', label: 'Kurumlar Vergisi' },
  { id: 'gelir_vergi', label: 'Gelir Vergisi' },
  { id: 'muhtasar_3aylik', label: 'Muhtasar (3 Aylık)' },
]

const DURUM_LABELS = {
  onaylandi: 'Onaylandı',
  tahakkuk_gonderildi: 'Tahakkuk Kesildi'
}

export default function GonderimMerkezi() {
  const { clients: allClients, loading: clientsLoading, refresh } = useClients()
  const [logs, setLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [selectedItems, setSelectedItems] = useState(new Set())
  const [sending, setSending] = useState(false)
  const [settings, setSettings] = useState(null)
  const [sendingMap, setSendingMap] = useState({})

  const [filters, setFilters] = useState({
    search: '',
    beyanType: 'all',
    year: new Date().getFullYear().toString(),
    month: 'all',
    status: 'all',
    sentFilter: 'unsent' // all | sent | unsent (varsayilan: bekleyenler)
  })

  useEffect(() => {
    getSettings().then(setSettings).catch(err => console.error('Ayarlar yuklenemedi:', err))
  }, [])

  // Onaylanmis / tahakkuk kesilmis beyanlari listele
  const pendingItems = useMemo(() => {
    const items = []
    allClients.forEach(client => {
      const durumlar = client.beyanDurumlari || {}
      Object.entries(durumlar).forEach(([key, value]) => {
        if (value !== 'onaylandi' && value !== 'tahakkuk_gonderildi') return
        const parts = key.split('_')
        if (parts.length < 3) return
        const year = parseInt(parts[0])
        const month = parseInt(parts[1])
        const beyanType = parts.slice(2).join('_')
        if (!year || isNaN(month) || !beyanType) return
        if (beyanType === 'edefter') return // e-Defter gonderim gerektirmez, sadece durum takibi

        // Gonderim bilgisi (eski + yeni format)
        const gonderildiEski = durumlar[`${key}_gonderildi`] === true || durumlar[`${key}_gonderildi`] === 'true'
        const kanal = durumlar[`${key}_gonderim_kanali`] || ''
        const gonderimTarihi = durumlar[`${key}_gonderim_tarihi`] || ''
        const beyanGonderildi = durumlar[`${key}_beyanname_gonderildi`] === true || durumlar[`${key}_beyanname_gonderildi`] === 'true'
        const beyanKanal = durumlar[`${key}_beyanname_gonderim_kanali`] || ''
        const beyanTarihi = durumlar[`${key}_beyanname_gonderim_tarihi`] || ''
        const tahakkukGonderildi = durumlar[`${key}_tahakkuk_gonderildi`] === true || durumlar[`${key}_tahakkuk_gonderildi`] === 'true'
        const tahakkukKanal = durumlar[`${key}_tahakkuk_gonderim_kanali`] || ''
        const tahakkukTarihi = durumlar[`${key}_tahakkuk_gonderim_tarihi`] || ''
        // Satirin tamami gonderilmis kabul edilirse her iki belge de gonderilmis olmali;
        // gonderilmisleri gizle/goster filtreleri icin bu kriter kullanilir.
        const gonderildi = gonderildiEski || (beyanGonderildi && tahakkukGonderildi)

        items.push({
          clientId: client.id,
          clientName: client.name,
          phone: client.whatsapp || client.phone || '',
          email: client.email || '',
          year,
          month,
          beyanType,
          beyanLabel: BEYAN_TIPLERI.find(b => b.id === beyanType)?.label || beyanType,
          status: value,
          durumKey: key,
          gonderildi,
          kanal,
          gonderimTarihi,
          beyanGonderildi,
          beyanKanal,
          beyanTarihi,
          tahakkukGonderildi,
          tahakkukKanal,
          tahakkukTarihi,
          beyanUrlKey: `${key}_beyan_url`,
          tahakkukUrlKey: `${key}_tahakkuk_url`,
          hasBeyanUrl: !!durumlar[`${key}_beyan_url`],
          hasTahakkukUrl: !!durumlar[`${key}_tahakkuk_url`]
        })
      })
    })
    return items
  }, [allClients])

  const filteredItems = useMemo(() => {
    return pendingItems.filter(item => {
      if (filters.search && !item.clientName?.toLowerCase().includes(filters.search.toLowerCase())) return false
      if (filters.beyanType !== 'all' && item.beyanType !== filters.beyanType) return false
      if (filters.year && item.year !== parseInt(filters.year)) return false
      if (filters.month !== 'all' && item.month !== parseInt(filters.month)) return false
      if (filters.status !== 'all' && item.status !== filters.status) return false
      if (filters.sentFilter === 'sent' && !item.gonderildi) return false
      if (filters.sentFilter === 'unsent' && item.gonderildi) return false
      return true
    })
  }, [pendingItems, filters])

  const missingCount = useMemo(() => filteredItems.filter(i => !i.hasBeyanUrl && !i.hasTahakkukUrl).length, [filteredItems])

  const loadLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const { data, error } = await supabase
        .from('whatsapp_logs')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(200)
      if (error) throw error
      setLogs(data || [])
    } catch (err) {
      console.error('Log yukleme hatasi:', err)
    }
    setLogsLoading(false)
  }, [])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  const toggleSelect = (item) => {
    const id = getItemId(item)
    const next = new Set(selectedItems)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedItems(next)
  }

  const toggleSelectAll = () => {
    if (selectedItems.size === filteredItems.length) {
      setSelectedItems(new Set())
    } else {
      setSelectedItems(new Set(filteredItems.map(getItemId)))
    }
  }

  const getItemId = (item) => `${item.clientId}_${item.durumKey}`

  const getSelectedObjects = () => {
    return filteredItems.filter(item => selectedItems.has(getItemId(item)))
  }

  const isAlreadySent = (item, documentType, channel) => {
    const key = `${item.durumKey}_gonderildi`
    const docKey = `${item.durumKey}_${documentType}_gonderildi`
    const docChannel = item.beyanDurumlari?.[`${item.durumKey}_${documentType}_gonderim_kanali`]
    if (item.beyanDurumlari?.[docKey]) return true
    // eski format tek gonderim bayragi varsa ve kanal eslesiyorsa da engelle
    if (item.beyanDurumlari?.[key]) {
      const storedChannel = item.beyanDurumlari?.[`${item.durumKey}_gonderim_kanali`]
      if (!storedChannel || storedChannel === channel) return true
    }
    return false
  }

  const markAsSent = async (item, channel, documentType) => {
    const client = allClients.find(c => c.id === item.clientId)
    if (!client) return
    const currentMap = client.beyanDurumlari || {}
    const updatedMap = {
      ...currentMap,
      [`${item.durumKey}_gonderildi`]: true,
      [`${item.durumKey}_${documentType}_gonderildi`]: true,
      [`${item.durumKey}_${documentType}_gonderim_kanali`]: channel,
      [`${item.durumKey}_${documentType}_gonderim_tarihi`]: new Date().toISOString(),
      [`${item.durumKey}_gonderim_kanali`]: channel,
      [`${item.durumKey}_gonderim_tarihi`]: new Date().toISOString()
    }
    await supabase.from('clients').update({ beyan_durumlari: updatedMap }).eq('id', item.clientId)
  }

  const sendWhatsApp = async (item, documentType) => {
    if (isAlreadySent(item, documentType, 'whatsapp')) {
      throw new Error('Bu belge daha once WhatsApp ile gonderilmis')
    }
    const client = allClients.find(c => c.id === item.clientId)
    if (!client) throw new Error('Musteri bulunamadi')
    const phone = client.whatsapp || client.phone
    if (!phone) throw new Error('Telefon numarasi yok')

    const hasUrl = documentType === 'tahakkuk' ? item.hasTahakkukUrl : item.hasBeyanUrl
    if (!hasUrl) throw new Error(`${documentType === 'tahakkuk' ? 'Tahakkuk' : 'Beyanname'} dosyasi yuklenmemis`)

    const docUrl = await getClientDocumentUrl({
      client,
      year: item.year,
      month: item.month,
      beyanType: item.beyanType,
      documentType
    })
    if (!docUrl) throw new Error('Dosya URL alinamadi')

    const message = `Sayin ${client.name},\n${item.year} ${MONTHS[item.month]} donemine ait ${item.beyanLabel} ${documentType === 'tahakkuk' ? 'tahakkuk' : 'beyanname'} dosyaniz hazirdir.\n\nIndirmek icin linke tiklayin:\n${docUrl}\n\nSaygilarimizla,\nMUBiS ERP`

    // wa.me ile WhatsApp Web'de hazir mesaj ac (PDF linki mesaj iceriginde)
    openWhatsAppWeb({ phone, message })
    await logWhatsAppWebSend({
      clientId: client.id,
      beyanType: item.beyanType,
      year: item.year,
      month: item.month,
      documentType,
      target: phone,
      status: 'pending'
    })

    await markAsSent(item, 'whatsapp', documentType)
    await createNotification({
      clientId: client.id,
      title: `${item.beyanLabel} ${documentType === 'tahakkuk' ? 'Tahakkuk' : 'Beyanname'} WhatsApp ile gonderildi`,
      message: `${item.year} ${MONTHS[item.month]} donemine ait ${item.beyanLabel} ${documentType === 'tahakkuk' ? 'tahakkuk' : 'beyanname'} dosyasi WhatsApp ile gonderildi.`,
      type: 'success'
    })
  }

  const sendMail = async (item, documentType) => {
    if (isAlreadySent(item, documentType, 'email')) {
      throw new Error('Bu belge daha once Mail ile gonderilmis')
    }
    const client = allClients.find(c => c.id === item.clientId)
    if (!client) throw new Error('Musteri bulunamadi')
    if (!client.email) throw new Error('Mail adresi yok')

    const hasUrl = documentType === 'tahakkuk' ? item.hasTahakkukUrl : item.hasBeyanUrl
    if (!hasUrl) throw new Error(`${documentType === 'tahakkuk' ? 'Tahakkuk' : 'Beyanname'} dosyasi yuklenmemis`)

    const docUrl = await getClientDocumentUrl({
      client,
      year: item.year,
      month: item.month,
      beyanType: item.beyanType,
      documentType
    })

    await sendEmail({
      toEmail: client.email,
      toName: client.name,
      subject: `${item.year} ${MONTHS[item.month]} - ${item.beyanLabel} ${documentType === 'tahakkuk' ? 'Tahakkuk' : 'Beyanname'}`,
      message: `Sayin ${client.name},\n\n${item.year} ${MONTHS[item.month]} donemine ait ${item.beyanLabel} ${documentType === 'tahakkuk' ? 'tahakkuk' : 'beyanname'} dosyaniz ektedir.\n\nSaygilarimizla,\nMUBiS ERP`,
      documentUrl: docUrl || '',
      clientId: client.id,
      beyanType: item.beyanType,
      year: item.year,
      month: item.month,
      documentType,
      settings
    })

    await markAsSent(item, 'email', documentType)
    await createNotification({
      clientId: client.id,
      title: `${item.beyanLabel} ${documentType === 'tahakkuk' ? 'Tahakkuk' : 'Beyanname'} gonderildi`,
      message: `${item.year} ${MONTHS[item.month]} donemine ait ${item.beyanLabel} ${documentType === 'tahakkuk' ? 'tahakkuk' : 'beyanname'} dosyaniz Mail ile gonderilmistir.`,
      type: 'success'
    })
  }

  const getSendingKey = (item, documentType, channel) => `${item.clientId}_${item.durumKey}_${documentType}_${channel}`

  const handleBulkSend = async (channel, documentType) => {
    const selected = getSelectedObjects()
    if (selected.length === 0) {
      alert('Lutfen en az bir kayit secin')
      return
    }
    setSending(true)
    let success = 0
    let failed = 0
    const errors = []

    for (const item of selected) {
      try {
        if (channel === 'whatsapp') await sendWhatsApp(item, documentType)
        else await sendMail(item, documentType)
        success++
      } catch (err) {
        failed++
        errors.push(`${item.clientName} - ${item.beyanLabel}: ${err.message}`)
      }
    }

    await refresh()
    await loadLogs()
    setSelectedItems(new Set())
    setSending(false)
    if (channel === 'whatsapp') {
      alert(`${success} adet WhatsApp penceresi acildi, ${failed} adet basarisiz.\nAcilan pencerelerde mesaji gondermeyi unutmayin.\n${errors.slice(0, 5).join('\n')}`)
    } else {
      alert(`${success} adet basarili, ${failed} adet basarisiz.\n${errors.slice(0, 5).join('\n')}`)
    }
  }

  const handleBulkSendAll = async (channel) => {
    const selected = getSelectedObjects()
    if (selected.length === 0) {
      alert('Lutfen en az bir kayit secin')
      return
    }
    setSending(true)
    let success = 0
    let skipped = 0
    let opened = 0
    let failed = 0
    const errors = []

    for (const item of selected) {
      const docs = []
      if (item.hasBeyanUrl) docs.push('beyanname')
      if (item.hasTahakkukUrl) docs.push('tahakkuk')
      if (docs.length === 0) {
        skipped++
        continue
      }
      for (const docType of docs) {
        try {
          if (channel === 'whatsapp') await sendWhatsApp(item, docType)
          else await sendMail(item, docType)
          if (channel === 'whatsapp') opened++
          else success++
        } catch (err) {
          failed++
          errors.push(`${item.clientName} - ${item.beyanLabel} ${docType}: ${err.message}`)
        }
      }
    }

    await refresh()
    await loadLogs()
    setSelectedItems(new Set())
    setSending(false)
    if (channel === 'whatsapp') {
      alert(`${opened} adet WhatsApp penceresi acildi, ${failed} adet basarisiz, ${skipped} adet dosyasi eksik.\n${errors.slice(0, 5).join('\n')}`)
    } else {
      alert(`${success} adet basarili, ${failed} adet basarisiz, ${skipped} adet dosyasi eksik.\n${errors.slice(0, 5).join('\n')}`)
    }
  }

  const handleSingleSend = async (item, channel, documentType) => {
    const key = getSendingKey(item, documentType, channel)
    setSendingMap(prev => ({ ...prev, [key]: true }))
    try {
      if (channel === 'whatsapp') await sendWhatsApp(item, documentType)
      else await sendMail(item, documentType)
      await refresh()
      await loadLogs()
      alert(channel === 'whatsapp' ? 'WhatsApp penceresi acildi. Mesaji WhatsApp uzerinden gonderin.' : 'Gonderim tamamlandi')
    } catch (err) {
      alert('Gonderim hatasi: ' + err.message)
    }
    setSendingMap(prev => ({ ...prev, [key]: false }))
  }

  const clearSentFlag = async (item, documentType) => {
    const client = allClients.find(c => c.id === item.clientId)
    if (!client) return
    const currentMap = { ...client.beyanDurumlari }
    delete currentMap[`${item.durumKey}_${documentType}_gonderildi`]
    delete currentMap[`${item.durumKey}_${documentType}_gonderim_kanali`]
    delete currentMap[`${item.durumKey}_${documentType}_gonderim_tarihi`]
    // tum gonderimler silinirse genel bayrak da kaldir
    const hasAny = ['beyanname', 'tahakkuk'].some(dt => currentMap[`${item.durumKey}_${dt}_gonderildi`])
    if (!hasAny) {
      delete currentMap[`${item.durumKey}_gonderildi`]
      delete currentMap[`${item.durumKey}_gonderim_kanali`]
      delete currentMap[`${item.durumKey}_gonderim_tarihi`]
    }
    await supabase.from('clients').update({ beyan_durumlari: currentMap }).eq('id', item.clientId)
    await refresh()
  }

  const updateFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setSelectedItems(new Set())
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center space-x-3">
            <Send className="w-8 h-8 text-yellow-400" />
            <span>Gonderim Merkezi</span>
          </h1>
          <p className="text-gray-400 mt-1">
            Onaylanmis ve tahakkuk kesilmis beyannameleri toplu veya tek tek WhatsApp / Mail ile gonderin
          </p>
        </div>
        <div className="flex flex-wrap gap-2 mt-4 md:mt-0">
          <button
            onClick={() => handleBulkSend('whatsapp', 'beyanname')}
            disabled={sending || selectedItems.size === 0}
            className="bg-green-500/20 text-green-400 hover:bg-green-500/30 disabled:opacity-50 px-3 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>WA Beyanname ({selectedItems.size})</span>
          </button>
          <button
            onClick={() => handleBulkSend('whatsapp', 'tahakkuk')}
            disabled={sending || selectedItems.size === 0}
            className="bg-green-500/20 text-green-400 hover:bg-green-500/30 disabled:opacity-50 px-3 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>WA Tahakkuk ({selectedItems.size})</span>
          </button>
          <button
            onClick={() => handleBulkSend('email', 'beyanname')}
            disabled={sending || selectedItems.size === 0}
            className="bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 disabled:opacity-50 px-3 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Mail Beyanname ({selectedItems.size})</span>
          </button>
          <button
            onClick={() => handleBulkSend('email', 'tahakkuk')}
            disabled={sending || selectedItems.size === 0}
            className="bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 disabled:opacity-50 px-3 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Mail Tahakkuk ({selectedItems.size})</span>
          </button>
          <button
            onClick={() => handleBulkSendAll('whatsapp')}
            disabled={sending || selectedItems.size === 0}
            className="bg-green-600/20 text-green-400 hover:bg-green-600/30 disabled:opacity-50 px-3 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>WA Hepsi ({selectedItems.size})</span>
          </button>
          <button
            onClick={() => handleBulkSendAll('email')}
            disabled={sending || selectedItems.size === 0}
            className="bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 disabled:opacity-50 px-3 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Mail Hepsi ({selectedItems.size})</span>
          </button>
        </div>
      </div>

      {/* Filtreler */}
      <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Musteri ara..."
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 pl-10 pr-4 text-white text-sm focus:outline-none focus:border-yellow-400"
            />
          </div>
          <select
            value={filters.beyanType}
            onChange={(e) => updateFilter('beyanType', e.target.value)}
            className="bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400"
          >
            <option value="all">Tum Beyan Turleri</option>
            {BEYAN_TIPLERI.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
          <select
            value={filters.year}
            onChange={(e) => updateFilter('year', e.target.value)}
            className="bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400"
          >
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            value={filters.month}
            onChange={(e) => updateFilter('month', e.target.value)}
            className="bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400"
          >
            <option value="all">Tum Aylar</option>
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select
            value={filters.status}
            onChange={(e) => updateFilter('status', e.target.value)}
            className="bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400"
          >
            <option value="all">Tum Durumlar</option>
            <option value="onaylandi">Onaylandi</option>
            <option value="tahakkuk_gonderildi">Tahakkuk Kesildi</option>
          </select>
          <select
            value={filters.sentFilter}
            onChange={(e) => updateFilter('sentFilter', e.target.value)}
            className="bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400"
          >
            <option value="all">Tum Gonderimler</option>
            <option value="unsent">Gonderilmemisleri Goster (Gonderilmisleri Gizle)</option>
            <option value="sent">Sadece Gonderilmisler</option>
          </select>
        </div>
      </div>

      {missingCount > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span>{missingCount} adet kayitta gonderilecek beyanname/tahakkuk dosyasi eksik.</span>
        </div>
      )}

      {/* Liste */}
      <div className="bg-blue-800/20 rounded-xl border border-blue-700/30 overflow-hidden mb-8">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-blue-900/30">
              <tr className="text-left text-gray-400 text-xs">
                <th className="px-4 py-3">
                  <button onClick={toggleSelectAll} className="flex items-center space-x-1 hover:text-white">
                    {selectedItems.size === filteredItems.length && filteredItems.length > 0 ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>
                </th>
                <th className="px-4 py-3">Musteri</th>
                <th className="px-4 py-3">Beyan Turu</th>
                <th className="px-4 py-3">Donem</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">Dosyalar</th>
                <th className="px-4 py-3">Iletisim</th>
                <th className="px-4 py-3">Gonderim</th>
                <th className="px-4 py-3">Islem</th>
              </tr>
            </thead>
            <tbody>
              {clientsLoading ? (
                <tr><td colSpan="9" className="text-center py-8 text-gray-400">Yukleniyor...</td></tr>
              ) : filteredItems.length === 0 ? (
                <tr><td colSpan="9" className="text-center py-8 text-gray-400">Filtrelere uygun kayit bulunamadi</td></tr>
              ) : (
                filteredItems.map((item) => {
                  const itemId = getItemId(item)
                  const selected = selectedItems.has(itemId)
                  return (
                    <tr key={itemId} className={`border-t border-blue-700/30 hover:bg-blue-800/20 transition-colors ${selected ? 'bg-blue-700/20' : ''}`}>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleSelect(item)} className="text-gray-400 hover:text-white">
                          {selected ? <CheckSquare className="w-4 h-4 text-yellow-400" /> : <Square className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-white text-sm font-medium">{item.clientName}</td>
                      <td className="px-4 py-3 text-gray-300 text-sm">{item.beyanLabel}</td>
                      <td className="px-4 py-3 text-gray-300 text-sm">{item.year} {MONTHS[item.month]}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-lg text-xs font-medium ${item.status === 'onaylandi' ? 'bg-green-500/20 text-green-400' : 'bg-purple-500/20 text-purple-400'}`}>
                          {DURUM_LABELS[item.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex space-x-2 text-xs">
                          {item.hasBeyanUrl ? (
                            <span className="text-blue-400 flex items-center gap-1"><FileText className="w-3 h-3" /> Beyanname</span>
                          ) : (
                            <span className="text-red-400 flex items-center gap-1"><XCircle className="w-3 h-3" /> Beyanname</span>
                          )}
                          {item.status === 'tahakkuk_gonderildi' && (
                            item.hasTahakkukUrl ? (
                              <span className="text-purple-400 flex items-center gap-1"><FileText className="w-3 h-3" /> Tahakkuk</span>
                            ) : (
                              <span className="text-red-400 flex items-center gap-1"><XCircle className="w-3 h-3" /> Tahakkuk</span>
                            )
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col text-xs text-gray-400">
                          {item.phone ? <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {item.phone}</span> : <span className="text-red-400">Tel yok</span>}
                          {item.email ? <span className="flex items-center gap-1"><AtSign className="w-3 h-3" /> {item.email}</span> : <span className="text-red-400">Mail yok</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1 text-xs">
                          {item.beyanGonderildi ? (
                            <span className={`flex items-center gap-1 ${item.beyanKanal === 'whatsapp' ? 'text-green-400' : 'text-blue-400'}`}>
                              <CheckCircle className="w-3 h-3" />
                              Beyanname: {item.beyanKanal === 'whatsapp' ? 'WhatsApp' : 'Mail'}
                            </span>
                          ) : (
                            <span className="text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3" /> Beyanname: Bekliyor</span>
                          )}
                          {item.tahakkukGonderildi ? (
                            <span className={`flex items-center gap-1 ${item.tahakkukKanal === 'whatsapp' ? 'text-green-400' : 'text-blue-400'}`}>
                              <CheckCircle className="w-3 h-3" />
                              Tahakkuk: {item.tahakkukKanal === 'whatsapp' ? 'WhatsApp' : 'Mail'}
                            </span>
                          ) : (
                            <span className="text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3" /> Tahakkuk: Bekliyor</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-2">
                          {item.hasBeyanUrl && (
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-gray-500 w-16">Beyanname:</span>
                              <button
                                onClick={() => handleSingleSend(item, 'whatsapp', 'beyanname')}
                                disabled={sendingMap[getSendingKey(item, 'beyanname', 'whatsapp')] || !item.phone || item.beyanGonderildi}
                                className="p-1 rounded-lg text-green-400 hover:bg-green-500/20 disabled:opacity-40"
                                title="WhatsApp'tan beyanname gonder"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleSingleSend(item, 'email', 'beyanname')}
                                disabled={sendingMap[getSendingKey(item, 'beyanname', 'email')] || !item.email || item.beyanGonderildi}
                                className="p-1 rounded-lg text-blue-400 hover:bg-blue-500/20 disabled:opacity-40"
                                title="Mailden beyanname gonder"
                              >
                                <Mail className="w-3.5 h-3.5" />
                              </button>
                              {item.beyanGonderildi && (
                                <button
                                  onClick={() => clearSentFlag(item, 'beyanname')}
                                  className="p-1 rounded-lg text-red-400 hover:bg-red-500/20"
                                  title="Beyanname gonderilmemis olarak isaretle"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                          {item.hasTahakkukUrl && (
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-gray-500 w-16">Tahakkuk:</span>
                              <button
                                onClick={() => handleSingleSend(item, 'whatsapp', 'tahakkuk')}
                                disabled={sendingMap[getSendingKey(item, 'tahakkuk', 'whatsapp')] || !item.phone || item.tahakkukGonderildi}
                                className="p-1 rounded-lg text-green-400 hover:bg-green-500/20 disabled:opacity-40"
                                title="WhatsApp'tan tahakkuk gonder"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleSingleSend(item, 'email', 'tahakkuk')}
                                disabled={sendingMap[getSendingKey(item, 'tahakkuk', 'email')] || !item.email || item.tahakkukGonderildi}
                                className="p-1 rounded-lg text-blue-400 hover:bg-blue-500/20 disabled:opacity-40"
                                title="Mailden tahakkuk gonder"
                              >
                                <Mail className="w-3.5 h-3.5" />
                              </button>
                              {item.tahakkukGonderildi && (
                                <button
                                  onClick={() => clearSentFlag(item, 'tahakkuk')}
                                  className="p-1 rounded-lg text-red-400 hover:bg-red-500/20"
                                  title="Tahakkuk gonderilmemis olarak isaretle"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                          {!item.hasBeyanUrl && !item.hasTahakkukUrl && (
                            <span className="text-[10px] text-red-400">Dosya yuklenmemis</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Gonderim Loglari */}
      <div className="bg-blue-800/20 rounded-xl border border-blue-700/30 overflow-hidden">
        <div className="px-6 py-4 border-b border-blue-700/30 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Filter className="w-5 h-5 text-yellow-400" />
            Son Gonderimler
          </h2>
          <button onClick={loadLogs} className="text-gray-400 hover:text-white"><RefreshCw className="w-4 h-4" /></button>
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full">
            <thead className="bg-blue-900/30 sticky top-0">
              <tr className="text-left text-gray-400 text-xs">
                <th className="px-4 py-3">Tarih</th>
                <th className="px-4 py-3">Musteri ID</th>
                <th className="px-4 py-3">Beyan</th>
                <th className="px-4 py-3">Donem</th>
                <th className="px-4 py-3">Kanal</th>
                <th className="px-4 py-3">Hedef</th>
                <th className="px-4 py-3">Durum</th>
              </tr>
            </thead>
            <tbody>
              {logsLoading ? (
                <tr><td colSpan="7" className="text-center py-4 text-gray-400">Yukleniyor...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan="7" className="text-center py-4 text-gray-400">Log kaydi bulunamadi</td></tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="border-t border-blue-700/30 hover:bg-blue-800/20">
                    <td className="px-4 py-3 text-gray-300 text-xs">{new Date(log.sent_at).toLocaleString('tr-TR')}</td>
                    <td className="px-4 py-3 text-gray-300 text-xs">{log.client_id}</td>
                    <td className="px-4 py-3 text-gray-300 text-xs">{BEYAN_TIPLERI.find(b => b.id === log.beyan_type)?.label || log.beyan_type} ({log.document_type})</td>
                    <td className="px-4 py-3 text-gray-300 text-xs">{log.year} {MONTHS[log.month]}</td>
                    <td className="px-4 py-3 text-xs">
                      {log.channel === 'whatsapp' ? (
                        <span className="text-green-400 flex items-center gap-1"><MessageCircle className="w-3 h-3" /> WhatsApp</span>
                      ) : (
                        <span className="text-blue-400 flex items-center gap-1"><Mail className="w-3 h-3" /> Mail</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-xs">{log.phone || log.email}</td>
                    <td className="px-4 py-3 text-xs">
                      {log.status === 'sent' ? (
                        <span className="text-green-400 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Basarili</span>
                      ) : (
                        <span className="text-red-400 flex items-center gap-1" title={log.error_message}><XCircle className="w-3 h-3" /> Basarisiz</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
