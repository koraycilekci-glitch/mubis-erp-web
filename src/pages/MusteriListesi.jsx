import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import { Link, useNavigate } from 'react-router-dom'
import { 
  Plus, Search, Filter, MapPin,
  Trash2, X, Eye, ListChecks, FileText,
  Users, Building2, UserCheck, ChevronLeft
} from 'lucide-react'

export default function MusteriListesi() {
  const { user, deleteClient } = useAuth()
  const { clients, refresh } = useClients()
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterTax, setFilterTax] = useState('all')
  const [showFilters, setShowFilters] = useState(false)
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState('asc')

  const handleDelete = async (id, name) => {
    if (window.confirm(`"${name}" musterisini silmek istediginize emin misiniz?`)) {
      await deleteClient(id)
      await refresh()
    }
  }

  const filteredClients = clients
    .filter(client => {
      const matchSearch = 
        client.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.vkn?.includes(searchTerm) ||
        client.tc?.includes(searchTerm) ||
        client.address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.phone?.includes(searchTerm) ||
        client.taxOffice?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.city?.toLowerCase().includes(searchTerm.toLowerCase())

      let matchType = true
      if (filterType === 'company') matchType = client.type === 'company'
      else if (filterType === 'individual') matchType = client.type === 'individual'

      let matchStatus = true
      if (filterStatus === 'active') matchStatus = client.status === 'active'
      else if (filterStatus === 'inactive') matchStatus = client.status === 'inactive'

      let matchTax = true
      if (filterTax === 'kurumlar') {
        matchTax = client.taxType === 'Kurumlar Vergisi'
      } else if (filterTax === 'gelir') {
        matchTax = client.taxType === 'Gelir Vergisi'
      }

      return matchSearch && matchType && matchStatus && matchTax
    })
    .sort((a, b) => {
      let valA, valB
      switch(sortBy) {
        case 'name':
          valA = a.name || ''
          valB = b.name || ''
          break
        case 'date':
          valA = a.createdAt || ''
          valB = b.createdAt || ''
          break
        case 'type':
          valA = a.type || ''
          valB = b.type || ''
          break
        default:
          valA = a.name || ''
          valB = b.name || ''
      }
      if (sortOrder === 'asc') {
        return valA.localeCompare(valB)
      } else {
        return valB.localeCompare(valA)
      }
    })

  const stats = {
    total: clients.length,
    active: clients.filter(c => c.status === 'active').length,
    companies: clients.filter(c => c.type === 'company').length,
    individuals: clients.filter(c => c.type === 'individual').length,
    kurumlar: clients.filter(c => c.taxType === 'Kurumlar Vergisi').length,
    gelir: clients.filter(c => c.taxType === 'Gelir Vergisi').length,
  }

  const clearFilters = () => {
    setSearchTerm('')
    setFilterType('all')
    setFilterStatus('all')
    setFilterTax('all')
    setSortBy('name')
    setSortOrder('asc')
  }

  const isFilterActive = () => {
    return searchTerm !== '' || 
           filterType !== 'all' || 
           filterStatus !== 'all' || 
           filterTax !== 'all'
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400"></div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin')}
            className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-blue-800/30"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
              <Users className="w-7 h-7 text-yellow-400" />
              Musteri Yonetimi
            </h1>
            <p className="text-gray-400 mt-1 text-sm">
              {stats.total} kayitli musteri
              {isFilterActive() && (
                <span className="ml-2 text-yellow-400 text-sm">(Filtreler aktif)</span>
              )}
            </p>
          </div>
        </div>
        <Link 
          to="/admin/clients/new"
          className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-6 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-yellow-500/30 transition-all duration-300 flex items-center space-x-2 mt-4 md:mt-0"
        >
          <Plus className="w-5 h-5" />
          <span>Yeni Musteri</span>
        </Link>
      </div>

      {/* Istatistikler */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-white">{stats.total}</div>
          <div className="text-gray-400 text-xs">Toplam</div>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-green-400">{stats.active}</div>
          <div className="text-gray-400 text-xs">Aktif</div>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-yellow-400">{stats.companies}</div>
          <div className="text-gray-400 text-xs">Sirket</div>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-purple-400">{stats.individuals}</div>
          <div className="text-gray-400 text-xs">Bireysel</div>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-blue-400">{stats.kurumlar}</div>
          <div className="text-gray-400 text-xs">Kurumlar</div>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-orange-400">{stats.gelir}</div>
          <div className="text-gray-400 text-xs">Gelir</div>
        </div>
      </div>

      {/* Filtreler */}
      <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 mb-6">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              placeholder="Isim, sirket, VKN, TC, adres, email, telefon, vergi dairesi, sehir ile ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400 transition-colors"
            />
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center space-x-2 ${
                isFilterActive() ? 'bg-yellow-500 text-blue-950' : 'bg-blue-800/30 text-gray-400 hover:text-white'
              }`}
            >
              <Filter className="w-4 h-4" />
              <span>Filtreler</span>
              {isFilterActive() && (
                <span className="ml-1 text-xs bg-blue-950/30 px-1.5 py-0.5 rounded-full">!</span>
              )}
            </button>
            {isFilterActive() && (
              <button
                onClick={clearFilters}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all bg-red-500/20 text-red-400 hover:bg-red-500/30 flex items-center space-x-1"
              >
                <X className="w-4 h-4" />
                <span>Temizle</span>
              </button>
            )}
          </div>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-blue-700/50">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-gray-400 text-xs block mb-1">Musteri Tipi</label>
                <div className="flex space-x-1 bg-blue-900/30 rounded-lg p-1">
                  {[
                    { val: 'all', label: 'Tumu' },
                    { val: 'company', label: 'Sirket' },
                    { val: 'individual', label: 'Bireysel' },
                  ].map(opt => (
                    <button
                      key={opt.val}
                      onClick={() => setFilterType(opt.val)}
                      className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                        filterType === opt.val ? 'bg-yellow-500 text-blue-950' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-gray-400 text-xs block mb-1">Durum</label>
                <div className="flex space-x-1 bg-blue-900/30 rounded-lg p-1">
                  {[
                    { val: 'all', label: 'Tumu' },
                    { val: 'active', label: 'Aktif' },
                    { val: 'inactive', label: 'Pasif' },
                  ].map(opt => (
                    <button
                      key={opt.val}
                      onClick={() => setFilterStatus(opt.val)}
                      className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                        filterStatus === opt.val ? 'bg-yellow-500 text-blue-950' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-gray-400 text-xs block mb-1">Vergi Turu</label>
                <div className="flex space-x-1 bg-blue-900/30 rounded-lg p-1">
                  {[
                    { val: 'all', label: 'Tumu' },
                    { val: 'kurumlar', label: 'Kurumlar' },
                    { val: 'gelir', label: 'Gelir' },
                  ].map(opt => (
                    <button
                      key={opt.val}
                      onClick={() => setFilterTax(opt.val)}
                      className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                        filterTax === opt.val ? 'bg-yellow-500 text-blue-950' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-gray-400 text-xs block mb-1">Siralama</label>
                <div className="flex space-x-1 bg-blue-900/30 rounded-lg p-1">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="flex-1 bg-transparent text-white text-xs px-2 py-1.5 rounded focus:outline-none"
                  >
                    <option value="name">Isim</option>
                    <option value="date">Tarih</option>
                    <option value="type">Tip</option>
                  </select>
                  <button
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    className="px-3 py-1.5 rounded text-xs font-medium transition-all bg-blue-800/30 text-gray-400 hover:text-white"
                  >
                    {sortOrder === 'asc' ? '\u2191' : '\u2193'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Musteri Listesi */}
      <div className="bg-blue-800/20 rounded-2xl border border-blue-700/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-blue-900/30">
              <tr className="text-left text-gray-400 text-sm">
                <th className="px-6 py-4">#</th>
                <th className="px-6 py-4">Musteri</th>
                <th className="px-6 py-4">Adres</th>
                <th className="px-6 py-4">Vergi Turu</th>
                <th className="px-6 py-4">Durum</th>
                <th className="px-6 py-4">Islem</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-8 text-gray-400">
                    {isFilterActive() ? 'Filtrelere uygun musteri bulunamadi' : 'Henuz musteri eklenmemis'}
                  </td>
                </tr>
              ) : (
                filteredClients.map((client, index) => (
                  <tr 
                    key={client.id} 
                    className="border-t border-blue-700/30 hover:bg-blue-800/20 transition-colors"
                  >
                    <td className="px-6 py-4 text-gray-400">{index + 1}</td>
                    <td className="px-6 py-4 cursor-pointer" onClick={() => navigate(`/admin/client/${client.id}`)}>
                      <div>
                        <div className="text-white font-medium">{client.name}</div>
                        <div className="text-gray-400 text-xs">{client.company || client.email || '-'}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 cursor-pointer" onClick={() => navigate(`/admin/client/${client.id}`)}>
                      <div className="flex items-center space-x-1">
                        <MapPin className="w-3 h-3 text-gray-500 flex-shrink-0" />
                        <span className="text-gray-300 text-sm truncate max-w-[150px] block">
                          {client.address || '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 cursor-pointer" onClick={() => navigate(`/admin/client/${client.id}`)}>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        client.taxType === 'Kurumlar Vergisi' 
                          ? 'bg-blue-500/20 text-blue-400' 
                          : client.taxType === 'Gelir Vergisi'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {client.taxType || 'Kurumlar Vergisi'}
                      </span>
                    </td>
                    <td className="px-6 py-4 cursor-pointer" onClick={() => navigate(`/admin/client/${client.id}`)}>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        client.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {client.status === 'active' ? 'Aktif' : 'Pasif'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => navigate(`/admin/client/${client.id}`)}
                          className="text-gray-400 hover:text-yellow-400 transition-colors"
                          title="Detay"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => navigate(`/admin/client/${client.id}/beyan-profile`)}
                          className="text-gray-400 hover:text-teal-400 transition-colors"
                          title="Beyan Profili"
                        >
                          <ListChecks className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => navigate(`/admin/client/${client.id}/beyan-takip`)}
                          className="text-gray-400 hover:text-blue-400 transition-colors"
                          title="Beyan Takip"
                        >
                          <FileText className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => handleDelete(client.id, client.name)}
                          className="text-gray-400 hover:text-red-400 transition-colors"
                          title="Sil"
                        >
                          <Trash2 className="w-5 h-5" />
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
    </div>
  )
}
