import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Search } from 'lucide-react'
import { useClients } from '../hooks/useClients'

export default function Institutions() {
  const { clients, loading } = useClients()
  const [searchTerm, setSearchTerm] = useState('')

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return clients || []
    return (clients || []).filter(c => {
      const text = `${c.name || ''} ${c.company || ''} ${c.tax_office || ''} ${c.tax_no || ''} ${c.vkn || ''} ${c.tax_type || ''}`.toLowerCase()
      return text.includes(q)
    })
  }, [clients, searchTerm])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center space-x-3">
            <Building2 className="w-8 h-8 text-yellow-400" />
            <span>Kurumlar</span>
          </h1>
          <p className="text-gray-400 mt-1">Sistemde kayitli gercek musteri kurumlarinin listesi</p>
        </div>
        <div className="mt-4 md:mt-0 text-gray-400 text-sm">Toplam {filtered.length} kurum</div>
      </div>

      <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            placeholder="Kurum ara (ad, vergi dairesi, VKN...)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400 transition-colors"
          />
        </div>
      </div>

      <div className="bg-blue-800/20 rounded-xl border border-blue-700/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-blue-900/30">
              <tr className="text-left text-gray-400 text-sm">
                <th className="px-6 py-4">#</th>
                <th className="px-6 py-4">Kurum / Musteri</th>
                <th className="px-6 py-4">Vergi Turu</th>
                <th className="px-6 py-4">Vergi Dairesi</th>
                <th className="px-6 py-4">VKN / TCKN</th>
                <th className="px-6 py-4">Durum</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="px-6 py-8 text-center text-gray-400">Yukleniyor...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="6" className="px-6 py-8 text-center text-gray-400">Kayit bulunamadi.</td></tr>
              ) : filtered.map((c, index) => (
                <tr key={c.id} className="border-t border-blue-700/30 hover:bg-blue-800/20 transition-colors">
                  <td className="px-6 py-4 text-gray-400">{index + 1}</td>
                  <td className="px-6 py-4">
                    <Link to={`/admin/client/${c.id}`} className="text-white font-medium hover:text-yellow-400 transition-colors">
                      {c.company || c.name || '-'}
                    </Link>
                    {c.company && c.name && <div className="text-gray-500 text-xs">{c.name}</div>}
                  </td>
                  <td className="px-6 py-4 text-gray-300">{c.tax_type || '-'}</td>
                  <td className="px-6 py-4 text-gray-300">{c.tax_office || '-'}</td>
                  <td className="px-6 py-4 text-gray-300 font-mono text-sm">{c.tax_no || c.vkn || c.tc || '-'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      c.status === 'active'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {c.status === 'active' ? 'Aktif' : 'Pasif'}
                    </span>
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
