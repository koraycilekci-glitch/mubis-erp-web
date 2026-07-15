import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Search, Download, Eye } from 'lucide-react'

export default function TaxCenter() {
  const { user: _user } = useAuth()
  const [taxFilter, setTaxFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  // Örnek beyan verileri
  const declarations = [
    { id: 1, client: 'ABC Ltd. Şti.', type: 'KDV', period: '2026-07', status: 'pending', taxType: 'Kurumlar Vergisi' },
    { id: 2, client: 'XYZ Ticaret A.Ş.', type: 'Muhtasar', period: '2026-07', status: 'completed', taxType: 'Kurumlar Vergisi' },
    { id: 3, client: '123 Danışmanlık', type: 'Gelir Vergisi', period: '2026-06', status: 'pending', taxType: 'Gelir Vergisi' },
    { id: 4, client: 'Demo İnşaat Ltd. Şti.', type: 'Geçici Vergi', period: '2026-08', status: 'pending', taxType: 'Kurumlar Vergisi' },
    { id: 5, client: 'Mavi Teknoloji A.Ş.', type: 'KDV', period: '2026-07', status: 'pending', taxType: 'Kurumlar Vergisi' },
  ]

  const filteredDeclarations = declarations.filter(dec => {
    const matchTax = taxFilter === 'all' || dec.taxType === taxFilter
    const matchSearch = dec.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        dec.type.toLowerCase().includes(searchTerm.toLowerCase())
    return matchTax && matchSearch
  })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Beyan Merkezi</h1>
          <p className="text-gray-400 mt-1">Tüm beyannameleri tek bir yerden yönetin</p>
        </div>
        <button className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-6 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-yellow-500/30 transition-all duration-300 mt-4 md:mt-0">
          Yeni Beyan Ekle
        </button>
      </div>

      {/* Filtreler */}
      <div className="bg-blue-800/20 rounded-xl p-6 border border-blue-700/30 mb-8">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              placeholder="Müşteri veya beyan ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400 transition-colors"
            />
          </div>
          <div className="flex space-x-2 overflow-x-auto pb-2">
            <button 
              onClick={() => setTaxFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                taxFilter === 'all' ? 'bg-yellow-500 text-blue-950' : 'bg-blue-800/30 text-gray-400 hover:text-white'
              }`}
            >
              Tümü
            </button>
            <button 
              onClick={() => setTaxFilter('Kurumlar Vergisi')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                taxFilter === 'Kurumlar Vergisi' ? 'bg-yellow-500 text-blue-950' : 'bg-blue-800/30 text-gray-400 hover:text-white'
              }`}
            >
              🏢 Kurumlar
            </button>
            <button 
              onClick={() => setTaxFilter('Gelir Vergisi')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                taxFilter === 'Gelir Vergisi' ? 'bg-yellow-500 text-blue-950' : 'bg-blue-800/30 text-gray-400 hover:text-white'
              }`}
            >
              👤 Gelir
            </button>
          </div>
        </div>
      </div>

      {/* Beyan Listesi */}
      <div className="bg-blue-800/20 rounded-xl border border-blue-700/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-blue-900/30">
              <tr className="text-left text-gray-400 text-sm">
                <th className="px-6 py-4">Müşteri</th>
                <th className="px-6 py-4">Beyan Türü</th>
                <th className="px-6 py-4">Dönem</th>
                <th className="px-6 py-4">Vergi Türü</th>
                <th className="px-6 py-4">Durum</th>
                <th className="px-6 py-4">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filteredDeclarations.map((dec) => (
                <tr key={dec.id} className="border-t border-blue-700/30 hover:bg-blue-800/20 transition-colors">
                  <td className="px-6 py-4 text-white font-medium">{dec.client}</td>
                  <td className="px-6 py-4 text-gray-300">{dec.type}</td>
                  <td className="px-6 py-4 text-gray-300">{dec.period}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      dec.taxType === 'Kurumlar Vergisi' 
                        ? 'bg-blue-500/20 text-blue-400' 
                        : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {dec.taxType}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      dec.status === 'completed' 
                        ? 'bg-green-500/20 text-green-400' 
                        : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {dec.status === 'completed' ? 'Tamamlandı' : 'Bekliyor'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex space-x-2">
                      <button className="text-gray-400 hover:text-yellow-400 transition-colors">
                        <Eye className="w-5 h-5" />
                      </button>
                      <button className="text-gray-400 hover:text-blue-400 transition-colors">
                        <Download className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}