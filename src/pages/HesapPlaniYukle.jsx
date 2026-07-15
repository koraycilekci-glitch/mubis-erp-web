import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { 
  Upload, FileSpreadsheet, CheckCircle, 
  Database, Save, Trash2, Search
} from 'lucide-react'
import { aiService } from '../services/aiService'

export default function HesapPlaniYukle() {
  const { getClients } = useAuth()
  const [clients] = useState(getClients())
  const [selectedClient, setSelectedClient] = useState(null)
  const [accountPlan, setAccountPlan] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    
    setLoading(true)
    setUploadStatus(null)
    
    try {
      const plan = await aiService.loadAccountPlanFromExcel(file)
      setAccountPlan(plan)
      setUploadStatus({ type: 'success', message: `${plan.length} hesap başarıyla yüklendi!` })
      
      // Otomatik olarak müşteriye kaydet
      if (selectedClient) {
        aiService.saveClientAccountPlan(selectedClient.id, plan)
      }
    } catch (error) {
      setUploadStatus({ type: 'error', message: error.message })
    }
    
    setLoading(false)
    e.target.value = ''
  }

  const handleSaveToClient = () => {
    if (!selectedClient) {
      alert('Lütfen önce bir müşteri seçin!')
      return
    }
    
    if (accountPlan.length === 0) {
      alert('Kaydedilecek hesap planı yok!')
      return
    }
    
    aiService.saveClientAccountPlan(selectedClient.id, accountPlan)
    setUploadStatus({ type: 'success', message: `${accountPlan.length} hesap müşteriye kaydedildi!` })
  }

  const loadClientPlan = (client) => {
    setSelectedClient(client)
    const plan = aiService.getClientAccountPlan(client.id)
    if (plan) {
      setAccountPlan(plan)
      setUploadStatus({ type: 'info', message: `${client.name} için ${plan.length} hesap yüklendi.` })
    } else {
      setAccountPlan([])
      setUploadStatus({ type: 'info', message: `${client.name} için kayıtlı hesap planı bulunamadı.` })
    }
  }

  const deleteAccount = (index) => {
    const newPlan = [...accountPlan]
    newPlan.splice(index, 1)
    setAccountPlan(newPlan)
  }

  const updateAccount = (index, field, value) => {
    const newPlan = [...accountPlan]
    newPlan[index][field] = value
    setAccountPlan(newPlan)
  }

  const filteredAccounts = accountPlan.filter(item => 
    item.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center space-x-3">
            <Database className="w-8 h-8 text-yellow-400" />
            <span>Hesap Planı Yükle</span>
          </h1>
          <p className="text-gray-400 mt-1">
            LUCA'dan Excel formatında hesap planı yükleyin ve müşterilere özel eşleştirme yapın
          </p>
        </div>
      </div>

      {/* Müşteri Seçimi */}
      <div className="bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
          <User className="w-5 h-5 text-yellow-400" />
          <span>Müşteri Seç</span>
        </h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setSelectedClient(null)
              setAccountPlan([])
              setUploadStatus(null)
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              !selectedClient ? 'bg-yellow-500 text-blue-950' : 'bg-blue-800/30 text-gray-400 hover:text-white'
            }`}
          >
            Genel
          </button>
          {clients.map(client => (
            <button
              key={client.id}
              onClick={() => loadClientPlan(client)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedClient?.id === client.id ? 'bg-yellow-500 text-blue-950' : 'bg-blue-800/30 text-gray-400 hover:text-white'
              }`}
            >
              {client.name}
            </button>
          ))}
        </div>
        {selectedClient && (
          <div className="mt-3 text-gray-400 text-sm">
            📌 {selectedClient.name} için hesap planı yönetiliyor
          </div>
        )}
      </div>

      {/* Excel Yükle */}
      <div className="bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
          <FileSpreadsheet className="w-5 h-5 text-yellow-400" />
          <span>Excel Yükle</span>
        </h3>
        <div className="flex flex-col md:flex-row items-center gap-4">
          <div className="flex-1 relative">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              disabled={loading}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="border-2 border-dashed border-blue-700/50 rounded-xl p-8 text-center hover:border-yellow-400/50 transition-colors">
              <Upload className="w-12 h-12 text-gray-500 mx-auto mb-3" />
              <p className="text-gray-400">Excel dosyasını sürükleyin veya tıklayın</p>
              <p className="text-gray-500 text-sm mt-1">.xlsx, .xls</p>
            </div>
          </div>
          <button
            onClick={handleSaveToClient}
            disabled={!selectedClient || accountPlan.length === 0}
            className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-6 py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-yellow-500/30 transition-all duration-300 disabled:opacity-50 flex items-center space-x-2"
          >
            <Save className="w-5 h-5" />
            <span>Müşteriye Kaydet</span>
          </button>
        </div>
        {uploadStatus && (
          <div className={`mt-4 p-4 rounded-xl border ${
            uploadStatus.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-400' :
            uploadStatus.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
            'bg-blue-500/10 border-blue-500/30 text-blue-400'
          }`}>
            {uploadStatus.type === 'success' && <CheckCircle className="w-5 h-5 inline mr-2" />}
            {uploadStatus.message}
          </div>
        )}
      </div>

      {/* Hesap Listesi */}
      <div className="bg-blue-800/20 rounded-2xl border border-blue-700/30 overflow-hidden">
        <div className="p-4 border-b border-blue-700/30 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center space-x-4">
            <h3 className="text-white font-semibold">
              Hesap Planı ({accountPlan.length} hesap)
            </h3>
            {selectedClient && (
              <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">
                Müşteriye Özel
              </span>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Hesap ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full md:w-64 bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 pl-10 pr-4 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors"
            />
          </div>
        </div>

        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full">
            <thead className="bg-blue-900/30 sticky top-0">
              <tr className="text-left text-gray-400 text-sm">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Hesap Kodu</th>
                <th className="px-4 py-3">Hesap Adı</th>
                <th className="px-4 py-3 text-center">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan="4" className="text-center py-8 text-gray-400">
                    {loading ? 'Yükleniyor...' : 'Henüz hesap planı yüklenmemiş'}
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((item, index) => (
                  <tr key={index} className="border-t border-blue-700/30 hover:bg-blue-800/20 transition-colors">
                    <td className="px-4 py-3 text-gray-400">{index + 1}</td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={item.code}
                        onChange={(e) => updateAccount(index, 'code', e.target.value)}
                        className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => updateAccount(index, 'name', e.target.value)}
                        className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => deleteAccount(index)}
                        className="text-red-400 hover:text-red-300 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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