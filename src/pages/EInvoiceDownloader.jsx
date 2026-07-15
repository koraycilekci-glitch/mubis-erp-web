import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { 
  Download, 
  CheckCircle, AlertTriangle, Clock, 
  Database, Building, Globe,
  RefreshCw, FileArchive, Loader2
} from 'lucide-react'

export default function EInvoiceDownloader() {
  const { user: _user, getClients } = useAuth()
  const [loading, setLoading] = useState(false)
  const [invoices, setInvoices] = useState([])
  const [selectedClient, setSelectedClient] = useState('all')
  const [selectedPortal, setSelectedPortal] = useState('all')
  const [dateRange, setDateRange] = useState({ start: '', end: '' })
  const [statusFilter, setStatusFilter] = useState('all')
  const [clients, setClients] = useState([])

  useEffect(() => {
    const allClients = getClients()
    setClients(allClients)
    generateSampleInvoices(allClients)
  }, [getClients])

  // ✅ SADECE LUCA ve DVS'den fatura indirilir
  const generateSampleInvoices = (clientList) => {
    const sampleInvoices = []
    const portals = ['Luca', 'DVS']  // ✅ SGK ve Ticari Sicil kaldırıldı
    const statuses = ['pending', 'downloaded', 'failed']
    
    clientList.forEach((client, index) => {
      const count = Math.floor(Math.random() * 5) + 1
      for (let i = 0; i < count; i++) {
        const date = new Date()
        date.setDate(date.getDate() - Math.floor(Math.random() * 30))
        sampleInvoices.push({
          id: Date.now() + index * 100 + i,
          clientId: client.id,
          clientName: client.name,
          portal: portals[Math.floor(Math.random() * portals.length)],
          invoiceNo: `INV${String(Math.floor(Math.random() * 100000)).padStart(6, '0')}`,
          date: date.toISOString().split('T')[0],
          amount: Math.round((Math.random() * 5000 + 100) * 100) / 100,
          status: statuses[Math.floor(Math.random() * statuses.length)],
          type: Math.random() > 0.5 ? 'alış' : 'satış',
          fileName: `fatura_${date.toISOString().split('T')[0]}.xml`
        })
      }
    })
    setInvoices(sampleInvoices)
  }

  const filteredInvoices = invoices.filter(inv => {
    const matchClient = selectedClient === 'all' || inv.clientId === parseInt(selectedClient)
    const matchPortal = selectedPortal === 'all' || inv.portal === selectedPortal
    const matchStatus = statusFilter === 'all' || inv.status === statusFilter
    const matchDate = (!dateRange.start || inv.date >= dateRange.start) &&
                      (!dateRange.end || inv.date <= dateRange.end)
    return matchClient && matchPortal && matchStatus && matchDate
  })

  const handleDownload = async (invoice) => {
    setLoading(true)
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice>
  <Header>
    <InvoiceNo>${invoice.invoiceNo}</InvoiceNo>
    <Date>${invoice.date}</Date>
    <Portal>${invoice.portal}</Portal>
  </Header>
  <Client>
    <Name>${invoice.clientName}</Name>
  </Client>
  <Details>
    <Amount>${invoice.amount}</Amount>
    <Tax>${(invoice.amount * 0.18).toFixed(2)}</Tax>
    <Total>${(invoice.amount * 1.18).toFixed(2)}</Total>
  </Details>
</Invoice>`

    const blob = new Blob([xmlContent], { type: 'application/xml' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = invoice.fileName
    link.click()
    
    setInvoices(invoices.map(inv => 
      inv.id === invoice.id ? { ...inv, status: 'downloaded' } : inv
    ))
    setLoading(false)
  }

  const handleDownloadAll = async () => {
    const pendingInvoices = filteredInvoices.filter(inv => inv.status === 'pending')
    if (pendingInvoices.length === 0) {
      alert('İndirilecek fatura bulunamadı!')
      return
    }
    
    if (window.confirm(`${pendingInvoices.length} adet fatura indirilecek. Devam etmek istiyor musunuz?`)) {
      setLoading(true)
      for (const invoice of pendingInvoices) {
        await handleDownload(invoice)
      }
      setLoading(false)
      alert('✅ Tüm faturalar indirildi!')
    }
  }

  const refreshInvoices = () => {
    generateSampleInvoices(clients)
  }

  const getStatusIcon = (status) => {
    switch(status) {
      case 'downloaded': return <CheckCircle className="w-5 h-5 text-green-400" />
      case 'pending': return <Clock className="w-5 h-5 text-yellow-400" />
      case 'failed': return <AlertTriangle className="w-5 h-5 text-red-400" />
      default: return <Clock className="w-5 h-5 text-gray-400" />
    }
  }

  const getStatusText = (status) => {
    switch(status) {
      case 'downloaded': return 'İndirildi'
      case 'pending': return 'Bekliyor'
      case 'failed': return 'Başarısız'
      default: return 'Bilmiyor'
    }
  }

  const getPortalIcon = (portal) => {
    switch(portal) {
      case 'Luca': return <Database className="w-4 h-4 text-blue-400" />
      case 'DVS': return <Building className="w-4 h-4 text-green-400" />
      default: return <Globe className="w-4 h-4 text-gray-400" />
    }
  }

  const stats = {
    total: invoices.length,
    downloaded: invoices.filter(inv => inv.status === 'downloaded').length,
    pending: invoices.filter(inv => inv.status === 'pending').length,
    failed: invoices.filter(inv => inv.status === 'failed').length
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center space-x-3">
            <FileArchive className="w-8 h-8 text-yellow-400" />
            <span>e-Fatura XML İndirici</span>
          </h1>
          <p className="text-gray-400 mt-1">
            Luca ve DVS'den e-Fatura XML'lerini tek bir yerden indirin
          </p>
          <div className="flex items-center space-x-2 mt-2">
            <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">Luca</span>
            <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded">DVS</span>
            <span className="text-xs text-gray-500">(SGK ve Ticari Sicil'den fatura indirilmez)</span>
          </div>
        </div>
        <div className="flex space-x-3 mt-4 md:mt-0">
          <button
            onClick={refreshInvoices}
            className="bg-blue-500/20 text-blue-400 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-500/30 transition-all duration-300 flex items-center space-x-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Yenile</span>
          </button>
          <button
            onClick={handleDownloadAll}
            disabled={loading}
            className="bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:shadow-lg hover:shadow-green-500/30 transition-all duration-300 flex items-center space-x-2 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>{loading ? 'İndiriliyor...' : 'Tümünü İndir'}</span>
          </button>
        </div>
      </div>

      {/* İstatistikler */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-white">{stats.total}</div>
          <div className="text-gray-400 text-xs">Toplam Fatura</div>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-green-400">{stats.downloaded}</div>
          <div className="text-gray-400 text-xs">İndirilen</div>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-yellow-400">{stats.pending}</div>
          <div className="text-gray-400 text-xs">Bekleyen</div>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-red-400">{stats.failed}</div>
          <div className="text-gray-400 text-xs">Başarısız</div>
        </div>
      </div>

      {/* Filtreler */}
      <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="text-gray-400 text-xs block mb-1">Müşteri</label>
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors"
            >
              <option value="all">Tüm Müşteriler</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-gray-400 text-xs block mb-1">Portal</label>
            <select
              value={selectedPortal}
              onChange={(e) => setSelectedPortal(e.target.value)}
              className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors"
            >
              <option value="all">Tüm Portallar</option>
              <option value="Luca">Luca</option>
              <option value="DVS">Dijital Vergi Dairesi</option>
            </select>
          </div>

          <div>
            <label className="text-gray-400 text-xs block mb-1">Durum</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors"
            >
              <option value="all">Tümü</option>
              <option value="pending">Bekleyen</option>
              <option value="downloaded">İndirilen</option>
              <option value="failed">Başarısız</option>
            </select>
          </div>

          <div>
            <label className="text-gray-400 text-xs block mb-1">Başlangıç</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors"
            />
          </div>

          <div>
            <label className="text-gray-400 text-xs block mb-1">Bitiş</label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Fatura Listesi */}
      <div className="bg-blue-800/20 rounded-2xl border border-blue-700/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-blue-900/30">
              <tr className="text-left text-gray-400 text-sm">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Müşteri</th>
                <th className="px-4 py-3">Portal</th>
                <th className="px-4 py-3">Fatura No</th>
                <th className="px-4 py-3">Tarih</th>
                <th className="px-4 py-3">Tutar</th>
                <th className="px-4 py-3">Tür</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan="9" className="text-center py-8 text-gray-400">
                    Filtrelere uygun fatura bulunamadı
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv, index) => (
                  <tr key={inv.id} className="border-t border-blue-700/30 hover:bg-blue-800/20 transition-colors">
                    <td className="px-4 py-3 text-gray-400">{index + 1}</td>
                    <td className="px-4 py-3 text-white text-sm">{inv.clientName}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-1">
                        {getPortalIcon(inv.portal)}
                        <span className="text-gray-300 text-sm">{inv.portal}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-sm">{inv.invoiceNo}</td>
                    <td className="px-4 py-3 text-gray-400 text-sm">{inv.date}</td>
                    <td className="px-4 py-3 text-gray-300 text-sm">{inv.amount.toFixed(2)} ₺</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        inv.type === 'alış' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'
                      }`}>
                        {inv.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-1">
                        {getStatusIcon(inv.status)}
                        <span className="text-xs text-gray-400">{getStatusText(inv.status)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {inv.status === 'pending' ? (
                        <button
                          onClick={() => handleDownload(inv)}
                          disabled={loading}
                          className="text-yellow-400 hover:text-yellow-300 transition-colors p-1"
                          title="İndir"
                        >
                          <Download className="w-5 h-5" />
                        </button>
                      ) : inv.status === 'downloaded' ? (
                        <button
                          onClick={() => handleDownload(inv)}
                          className="text-green-400 hover:text-green-300 transition-colors p-1"
                          title="Tekrar İndir"
                        >
                          <RefreshCw className="w-5 h-5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDownload(inv)}
                          className="text-red-400 hover:text-red-300 transition-colors p-1"
                          title="Tekrar Dene"
                        >
                          <RefreshCw className="w-5 h-5" />
                        </button>
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