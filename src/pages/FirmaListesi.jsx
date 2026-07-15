import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { 
  Users, Search, Plus, Edit2, Trash2, Save, X,
  Upload, CheckCircle, AlertTriangle,
  Download
} from 'lucide-react'
import { aiService } from '../services/aiService'

export default function FirmaListesi() {
  const { user: _user } = useAuth()
  const [vendors, setVendors] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    vkn: '',
    accountCode: '',
    accountName: '',
    taxOffice: '',
    address: '',
    phone: '',
    email: ''
  })
  const [uploadStatus, setUploadStatus] = useState(null)

  useEffect(() => {
    loadVendors()
  }, [])

  const loadVendors = () => {
    setLoading(true)
    const list = aiService.loadVendorList()
    setVendors(list)
    setLoading(false)
  }

  const filteredVendors = vendors.filter(v => 
    v.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.vkn?.includes(searchTerm) ||
    v.accountCode?.includes(searchTerm)
  )

  const handleAdd = () => {
    setFormData({ name: '', vkn: '', accountCode: '', accountName: '', taxOffice: '', address: '', phone: '', email: '' })
    setEditingId(null)
    setShowAddModal(true)
  }

  const handleEdit = (vendor) => {
    setFormData(vendor)
    setEditingId(vendor.id)
    setShowAddModal(true)
  }

  const handleSave = () => {
    if (!formData.name) {
      alert('Firma ünvanı zorunludur!')
      return
    }
    
    if (editingId) {
      const result = aiService.updateVendor(editingId, formData)
      if (result.success) {
        alert('✅ Firma güncellendi!')
      }
    } else {
      const result = aiService.addVendor(formData)
      if (result.success) {
        alert('✅ Firma eklendi!')
      } else {
        alert('❌ ' + result.error)
      }
    }
    
    setShowAddModal(false)
    loadVendors()
  }

  const handleDelete = (id, name) => {
    if (window.confirm(`"${name}" firmasını silmek istediğinize emin misiniz?`)) {
      aiService.deleteVendor(id)
      loadVendors()
    }
  }

  const handleExcelUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    
    setLoading(true)
    setUploadStatus(null)
    
    try {
      const result = await aiService.loadVendorListFromExcel(file)
      setUploadStatus({ 
        type: 'success', 
        message: `${result.total} firma yüklendi, ${result.merged} toplam firma listesinde.` 
      })
      loadVendors()
    } catch (error) {
      setUploadStatus({ type: 'error', message: error.message })
    }
    
    setLoading(false)
    e.target.value = ''
  }

  const exportVendors = () => {
    // Excel export
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(vendors.map(v => ({
      'Firma Ünvanı': v.name,
      'VKN': v.vkn,
      'Hesap Kodu': v.accountCode,
      'Hesap Adı': v.accountName,
      'Vergi Dairesi': v.taxOffice,
      'Adres': v.address,
      'Telefon': v.phone,
      'Email': v.email
    })))
    XLSX.utils.book_append_sheet(wb, ws, 'Firma Listesi')
    const excelData = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([excelData], { type: 'application/octet-stream' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `Firma_Listesi_${new Date().toISOString().split('T')[0]}.xlsx`
    link.click()
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center space-x-3">
            <Users className="w-8 h-8 text-yellow-400" />
            <span>Firma Listesi</span>
          </h1>
          <p className="text-gray-400 mt-1">
            Faturalardaki firmaları yönetin, hesap kodlarını eşleştirin
          </p>
        </div>
        <div className="flex flex-wrap gap-2 mt-4 md:mt-0">
          <button
            onClick={exportVendors}
            className="bg-green-500/20 text-green-400 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-500/30 transition-all duration-300 flex items-center space-x-2"
          >
            <Download className="w-4 h-4" />
            <span>Excel Export</span>
          </button>
          <label className="bg-blue-500/20 text-blue-400 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-500/30 transition-all duration-300 flex items-center space-x-2 cursor-pointer">
            <Upload className="w-4 h-4" />
            <span>Excel Yükle</span>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleExcelUpload}
              className="hidden"
            />
          </label>
          <button
            onClick={handleAdd}
            className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-4 py-2 rounded-lg text-sm font-semibold hover:shadow-lg hover:shadow-yellow-500/30 transition-all duration-300 flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Firma</span>
          </button>
        </div>
      </div>

      {/* Upload Status */}
      {uploadStatus && (
        <div className={`mb-6 p-4 rounded-xl border ${
          uploadStatus.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-400' :
          'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {uploadStatus.type === 'success' ? <CheckCircle className="w-5 h-5 inline mr-2" /> : <AlertTriangle className="w-5 h-5 inline mr-2" />}
          {uploadStatus.message}
        </div>
      )}

      {/* Arama */}
      <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            placeholder="Firma ünvanı, VKN veya hesap kodu ile ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400 transition-colors"
          />
        </div>
      </div>

      {/* Firma Listesi */}
      <div className="bg-blue-800/20 rounded-2xl border border-blue-700/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-blue-900/30">
              <tr className="text-left text-gray-400 text-sm">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Firma Ünvanı</th>
                <th className="px-4 py-3">VKN</th>
                <th className="px-4 py-3">Hesap Kodu</th>
                <th className="px-4 py-3">Hesap Adı</th>
                <th className="px-4 py-3 text-center">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filteredVendors.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-8 text-gray-400">
                    {loading ? 'Yükleniyor...' : 'Henüz firma eklenmemiş. Excel yükleyin veya manuel ekleyin.'}
                  </td>
                </tr>
              ) : (
                filteredVendors.map((vendor, index) => (
                  <tr key={vendor.id} className="border-t border-blue-700/30 hover:bg-blue-800/20 transition-colors">
                    <td className="px-4 py-3 text-gray-400">{index + 1}</td>
                    <td className="px-4 py-3 text-white font-medium">{vendor.name}</td>
                    <td className="px-4 py-3 text-gray-300">{vendor.vkn || '-'}</td>
                    <td className="px-4 py-3">
                      <span className="bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded text-xs font-medium">
                        {vendor.accountCode || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{vendor.accountName || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center space-x-2">
                        <button
                          onClick={() => handleEdit(vendor)}
                          className="text-gray-400 hover:text-yellow-400 transition-colors"
                          title="Düzenle"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(vendor.id, vendor.name)}
                          className="text-gray-400 hover:text-red-400 transition-colors"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ekle/Düzenle Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-blue-950 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-blue-700/50 shadow-2xl">
            <div className="sticky top-0 bg-blue-950 border-b border-blue-700/50 p-5 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white flex items-center space-x-2">
                {editingId ? <Edit2 className="w-5 h-5 text-yellow-400" /> : <Plus className="w-5 h-5 text-yellow-400" />}
                <span>{editingId ? 'Firma Düzenle' : 'Yeni Firma Ekle'}</span>
              </h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-blue-800/30">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="text-gray-400 text-sm block mb-1">Firma Ünvanı *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
                  placeholder="ABC Ticaret Ltd. Şti."
                />
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">VKN</label>
                <input
                  type="text"
                  value={formData.vkn}
                  onChange={(e) => setFormData({...formData, vkn: e.target.value})}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
                  placeholder="1234567890"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-400 text-sm block mb-1">Hesap Kodu</label>
                  <input
                    type="text"
                    value={formData.accountCode}
                    onChange={(e) => setFormData({...formData, accountCode: e.target.value})}
                    className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
                    placeholder="120.01.34"
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-sm block mb-1">Hesap Adı</label>
                  <input
                    type="text"
                    value={formData.accountName}
                    onChange={(e) => setFormData({...formData, accountName: e.target.value})}
                    className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
                    placeholder="Alıcılar - Opet"
                  />
                </div>
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">Vergi Dairesi</label>
                <input
                  type="text"
                  value={formData.taxOffice}
                  onChange={(e) => setFormData({...formData, taxOffice: e.target.value})}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
                  placeholder="Vergi Dairesi"
                />
              </div>
            </div>

            <div className="p-6 pt-0 flex space-x-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 bg-blue-800/50 text-gray-300 py-2.5 rounded-lg hover:bg-blue-700/50 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleSave}
                className="flex-1 bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 py-2.5 rounded-lg font-semibold hover:shadow-lg hover:shadow-yellow-500/30 transition-all duration-300 flex items-center justify-center space-x-2"
              >
                <Save className="w-5 h-5" />
                <span>Kaydet</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}