import { useState } from 'react'
import { Download, FileText, Search, Calendar, CheckCircle, Clock } from 'lucide-react'

export default function AllBeyanReport() {
  const [filterMonth, setFilterMonth] = useState('2026-07')
  const [searchTerm, setSearchTerm] = useState('')

  const reports = [
    { id: 1, client: 'ABC Ltd. Şti.', taxType: 'Kurumlar Vergisi', total: 12, completed: 8, pending: 4, rate: 67 },
    { id: 2, client: 'XYZ Ticaret A.Ş.', taxType: 'Kurumlar Vergisi', total: 10, completed: 10, pending: 0, rate: 100 },
    { id: 3, client: '123 Danışmanlık', taxType: 'Gelir Vergisi', total: 8, completed: 5, pending: 3, rate: 63 },
    { id: 4, client: 'Demo İnşaat Ltd. Şti.', taxType: 'Kurumlar Vergisi', total: 15, completed: 9, pending: 6, rate: 60 },
    { id: 5, client: 'Mavi Teknoloji A.Ş.', taxType: 'Kurumlar Vergisi', total: 11, completed: 7, pending: 4, rate: 64 },
    { id: 6, client: 'Yeşil Enerji A.Ş.', taxType: 'Kurumlar Vergisi', total: 9, completed: 6, pending: 3, rate: 67 },
  ]

  const filteredReports = reports.filter(r => 
    r.client.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const totalStats = reports.reduce((acc, r) => ({
    total: acc.total + r.total,
    completed: acc.completed + r.completed,
    pending: acc.pending + r.pending
  }), { total: 0, completed: 0, pending: 0 })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center space-x-3">
            <FileText className="w-8 h-8 text-yellow-400" />
            <span>Tüm Beyan Raporu</span>
          </h1>
          <p className="text-gray-400 mt-1">Tüm müşterilerin beyan durumlarını toplu görüntüleyin</p>
        </div>
        <button className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-6 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-yellow-500/30 transition-all duration-300 flex items-center space-x-2 mt-4 md:mt-0">
          <Download className="w-5 h-5" />
          <span>Rapor İndir</span>
        </button>
      </div>

      {/* İstatistikler */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        <div className="bg-blue-800/20 rounded-xl p-6 border border-blue-700/30">
          <div className="flex items-center justify-between">
            <FileText className="w-8 h-8 text-blue-400" />
            <span className="text-blue-400 text-sm">Toplam</span>
          </div>
          <div className="text-3xl font-bold text-white mt-2">{totalStats.total}</div>
          <div className="text-gray-400 text-sm">Toplam Beyan</div>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-6 border border-blue-700/30">
          <div className="flex items-center justify-between">
            <CheckCircle className="w-8 h-8 text-green-400" />
            <span className="text-green-400 text-sm">Tamamlanan</span>
          </div>
          <div className="text-3xl font-bold text-white mt-2">{totalStats.completed}</div>
          <div className="text-gray-400 text-sm">Tamamlanan Beyan</div>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-6 border border-blue-700/30">
          <div className="flex items-center justify-between">
            <Clock className="w-8 h-8 text-yellow-400" />
            <span className="text-yellow-400 text-sm">Bekleyen</span>
          </div>
          <div className="text-3xl font-bold text-white mt-2">{totalStats.pending}</div>
          <div className="text-gray-400 text-sm">Bekleyen Beyan</div>
        </div>
      </div>

      {/* Filtreler */}
      <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              placeholder="Müşteri ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400 transition-colors"
            />
          </div>
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-gray-400" />
            <select 
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
            >
              <option value="2026-07">Temmuz 2026</option>
              <option value="2026-06">Haziran 2026</option>
              <option value="2026-05">Mayıs 2026</option>
            </select>
          </div>
        </div>
      </div>

      {/* Rapor Tablosu */}
      <div className="bg-blue-800/20 rounded-xl border border-blue-700/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-blue-900/30">
              <tr className="text-left text-gray-400 text-sm">
                <th className="px-6 py-4">#</th>
                <th className="px-6 py-4">Müşteri</th>
                <th className="px-6 py-4">Vergi Türü</th>
                <th className="px-6 py-4">Toplam</th>
                <th className="px-6 py-4">Tamamlanan</th>
                <th className="px-6 py-4">Bekleyen</th>
                <th className="px-6 py-4">Tamamlanma</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.map((r, index) => (
                <tr key={r.id} className="border-t border-blue-700/30 hover:bg-blue-800/20 transition-colors">
                  <td className="px-6 py-4 text-gray-400">{index + 1}</td>
                  <td className="px-6 py-4 text-white font-medium">{r.client}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      r.taxType === 'Kurumlar Vergisi' 
                        ? 'bg-blue-500/20 text-blue-400' 
                        : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {r.taxType}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-300">{r.total}</td>
                  <td className="px-6 py-4 text-green-400">{r.completed}</td>
                  <td className="px-6 py-4 text-yellow-400">{r.pending}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <div className="w-20 h-2 bg-blue-900/50 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${r.rate >= 80 ? 'bg-green-400' : r.rate >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`} 
                          style={{ width: `${r.rate}%` }}
                        ></div>
                      </div>
                      <span className={`text-xs font-medium ${
                        r.rate >= 80 ? 'text-green-400' : r.rate >= 50 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {r.rate}%
                      </span>
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