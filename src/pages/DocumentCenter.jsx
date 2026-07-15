import { useState } from 'react'
import { 
  FolderOpen, Download, Eye, 
  Search, Plus, Trash2, Clock,
  File, Image, Archive, FileSpreadsheet
} from 'lucide-react'

export default function DocumentCenter() {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [viewMode, setViewMode] = useState('grid')

  const documents = [
    { id: 1, name: 'Temmuz 2026 Tahakkuk', type: 'pdf', size: '245 KB', date: '2026-07-12', client: 'ABC Ltd. Şti.', category: 'tahakkuk' },
    { id: 2, name: 'Haziran 2026 KDV Beyannamesi', type: 'pdf', size: '180 KB', date: '2026-06-25', client: 'ABC Ltd. Şti.', category: 'beyan' },
    { id: 3, name: '2026 2.Dönem Geçici Vergi', type: 'pdf', size: '320 KB', date: '2026-06-15', client: 'XYZ Ticaret A.Ş.', category: 'beyan' },
    { id: 4, name: 'e-Defter Berat 2026-06', type: 'xml', size: '1.2 MB', date: '2026-06-30', client: 'Demo İnşaat Ltd. Şti.', category: 'edefter' },
    { id: 5, name: 'e-Fatura 2026-06-01', type: 'pdf', size: '156 KB', date: '2026-06-01', client: 'Mavi Teknoloji A.Ş.', category: 'fatura' },
  ]

  const getIcon = (type) => {
    switch(type) {
      case 'pdf': return <File className="w-6 h-6 text-red-400" />  // ✅ FilePdf yerine File
      case 'xml': return <Archive className="w-6 h-6 text-blue-400" />  // ✅ Archive
      case 'xlsx': return <FileSpreadsheet className="w-6 h-6 text-green-400" />  // ✅ FileSpreadsheet
      case 'jpg': 
      case 'png': return <Image className="w-6 h-6 text-purple-400" />  // ✅ Image
      default: return <File className="w-6 h-6 text-gray-400" />
    }
  }

  const filteredDocs = documents.filter(doc => {
    const matchSearch = doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        doc.client.toLowerCase().includes(searchTerm.toLowerCase())
    const matchType = filterType === 'all' || doc.type === filterType
    return matchSearch && matchType
  })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center space-x-3">
            <FolderOpen className="w-8 h-8 text-yellow-400" />
            <span>Evrak Merkezi</span>
          </h1>
          <p className="text-gray-400 mt-1">Tüm evrakları tek bir yerden yönetin</p>
        </div>
        <button className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-6 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-yellow-500/30 transition-all duration-300 flex items-center space-x-2 mt-4 md:mt-0">
          <Plus className="w-5 h-5" />
          <span>Yeni Evrak Yükle</span>
        </button>
      </div>

      {/* Filtreler */}
      <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              placeholder="Evrak veya müşteri ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400 transition-colors"
            />
          </div>
          <div className="flex space-x-2 overflow-x-auto pb-2">
            <button 
              onClick={() => setFilterType('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                filterType === 'all' ? 'bg-yellow-500 text-blue-950' : 'bg-blue-800/30 text-gray-400 hover:text-white'
              }`}
            >
              Tümü
            </button>
            <button 
              onClick={() => setFilterType('pdf')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                filterType === 'pdf' ? 'bg-yellow-500 text-blue-950' : 'bg-blue-800/30 text-gray-400 hover:text-white'
              }`}
            >
              PDF
            </button>
            <button 
              onClick={() => setFilterType('xml')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                filterType === 'xml' ? 'bg-yellow-500 text-blue-950' : 'bg-blue-800/30 text-gray-400 hover:text-white'
              }`}
            >
              XML
            </button>
            <button 
              onClick={() => setFilterType('xlsx')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                filterType === 'xlsx' ? 'bg-yellow-500 text-blue-950' : 'bg-blue-800/30 text-gray-400 hover:text-white'
              }`}
            >
              Excel
            </button>
          </div>
          <div className="flex space-x-1 bg-blue-900/30 rounded-lg p-1">
            <button 
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-all ${
                viewMode === 'grid' ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-400 hover:text-white'
              }`}
            >
              <div className="grid grid-cols-2 gap-0.5 w-4 h-4">
                <div className="w-1.5 h-1.5 bg-current rounded"></div>
                <div className="w-1.5 h-1.5 bg-current rounded"></div>
                <div className="w-1.5 h-1.5 bg-current rounded"></div>
                <div className="w-1.5 h-1.5 bg-current rounded"></div>
              </div>
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-all ${
                viewMode === 'list' ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-400 hover:text-white'
              }`}
            >
              <div className="flex flex-col space-y-0.5 w-4 h-4">
                <div className="w-full h-1 bg-current rounded"></div>
                <div className="w-full h-1 bg-current rounded"></div>
                <div className="w-full h-1 bg-current rounded"></div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Evrak Listesi */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDocs.map((doc) => (
            <div key={doc.id} className="bg-blue-800/20 rounded-xl p-5 border border-blue-700/30 card-hover">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-blue-900/30 rounded-xl">
                  {getIcon(doc.type)}
                </div>
                <div className="flex space-x-1">
                  <button className="text-gray-400 hover:text-yellow-400 transition-colors p-1">
                    <Eye className="w-4 h-4" />
                  </button>
                  <button className="text-gray-400 hover:text-blue-400 transition-colors p-1">
                    <Download className="w-4 h-4" />
                  </button>
                  <button className="text-gray-400 hover:text-red-400 transition-colors p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <h4 className="text-white font-medium text-sm truncate">{doc.name}</h4>
              <div className="flex items-center justify-between mt-2 text-xs">
                <span className="text-gray-400">{doc.client}</span>
                <div className="flex items-center space-x-2 text-gray-500">
                  <Clock className="w-3 h-3" />
                  <span>{doc.date}</span>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-gray-400">{doc.size}</span>
                <span className="uppercase px-2 py-0.5 rounded bg-blue-900/30 text-gray-400">
                  {doc.type}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-blue-800/20 rounded-xl border border-blue-700/30 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-blue-900/30">
                <tr className="text-left text-gray-400 text-sm">
                  <th className="px-6 py-4">Evrak</th>
                  <th className="px-6 py-4">Müşteri</th>
                  <th className="px-6 py-4">Tür</th>
                  <th className="px-6 py-4">Boyut</th>
                  <th className="px-6 py-4">Tarih</th>
                  <th className="px-6 py-4">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocs.map((doc) => (
                  <tr key={doc.id} className="border-t border-blue-700/30 hover:bg-blue-800/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        {getIcon(doc.type)}
                        <span className="text-white font-medium text-sm">{doc.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-300 text-sm">{doc.client}</td>
                    <td className="px-6 py-4">
                      <span className="uppercase text-xs px-2 py-1 rounded bg-blue-900/30 text-gray-400">
                        {doc.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-sm">{doc.size}</td>
                    <td className="px-6 py-4 text-gray-400 text-sm">{doc.date}</td>
                    <td className="px-6 py-4">
                      <div className="flex space-x-2">
                        <button className="text-gray-400 hover:text-yellow-400 transition-colors">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="text-gray-400 hover:text-blue-400 transition-colors">
                          <Download className="w-4 h-4" />
                        </button>
                        <button className="text-gray-400 hover:text-red-400 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}