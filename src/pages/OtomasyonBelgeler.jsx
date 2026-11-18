import { useState, useEffect, useCallback } from 'react'
import { FileArchive, Eye, EyeOff, Filter, Download, ExternalLink, FileText } from 'lucide-react'
import { getAutomationDocuments, markDocumentRead } from '../services/automationService'
import { useClients } from '../hooks/useClients'

const TYPE_LABELS = {
  etebligat: 'e-Tebligat',
  sgk_tahakkuk: 'SGK Tahakkuk',
  sgk_hizmet: 'SGK Hizmet Listesi',
  sgk_borc_dokumu: 'SGK Borç Dökümü',
  vergi_borc_dokumu: 'Vergi Borç Dökümü',
  tahakkuk_fisi: 'Tahakkuk Fişi',
  beyanname: 'Beyanname'
}

export default function OtomasyonBelgeler() {
  const { clients } = useClients()
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    client_id: '',
    document_type: '',
    is_read: ''
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAutomationDocuments({
        client_id: filters.client_id || undefined,
        document_type: filters.document_type || undefined,
        is_read: filters.is_read === '' ? undefined : filters.is_read === 'true',
        limit: 200
      })
      setDocs(data)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }, [filters])

  useEffect(() => {
    load()
  }, [load])

  const toggleRead = async (doc) => {
    try {
      await markDocumentRead(doc.id, !doc.is_read)
      setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, is_read: !d.is_read } : d))
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="bg-blue-600/20 p-3 rounded-xl">
          <FileArchive className="w-7 h-7 text-yellow-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Gelen Belgeler</h1>
          <p className="text-gray-400 text-sm">Otomasyon ile indirilen tüm belgeler</p>
        </div>
      </div>

      {/* Filtreler */}
      <div className="bg-blue-950/40 border border-blue-800/30 rounded-2xl p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-gray-400 text-xs mb-1">Müşteri</label>
            <select
              value={filters.client_id}
              onChange={(e) => setFilters({ ...filters, client_id: e.target.value })}
              className="bg-blue-900/30 border border-blue-700/40 rounded-lg px-3 py-2 text-white text-sm focus:outline-none min-w-[180px]"
            >
              <option value="">Tümü</option>
              {clients.slice().sort((a, b) => (a.name || a.company || '').localeCompare(b.name || b.company || '', 'tr')).map(c => (
                <option key={c.id} value={c.id}>{c.name || c.company}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">Belge Türü</label>
            <select
              value={filters.document_type}
              onChange={(e) => setFilters({ ...filters, document_type: e.target.value })}
              className="bg-blue-900/30 border border-blue-700/40 rounded-lg px-3 py-2 text-white text-sm focus:outline-none min-w-[180px]"
            >
              <option value="">Tümü</option>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">Durum</label>
            <select
              value={filters.is_read}
              onChange={(e) => setFilters({ ...filters, is_read: e.target.value })}
              className="bg-blue-900/30 border border-blue-700/40 rounded-lg px-3 py-2 text-white text-sm focus:outline-none min-w-[140px]"
            >
              <option value="">Tümü</option>
              <option value="false">Okunmamış</option>
              <option value="true">Okunmuş</option>
            </select>
          </div>
        </div>
      </div>

      {/* Liste */}
      <div className="bg-blue-950/40 border border-blue-800/30 rounded-2xl p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-blue-800/30">
                <th className="text-left py-3 px-3 font-medium">Müşteri</th>
                <th className="text-left py-3 px-3 font-medium">Tür</th>
                <th className="text-left py-3 px-3 font-medium">Başlık / Dönem</th>
                <th className="text-left py-3 px-3 font-medium">Tarih</th>
                <th className="text-left py-3 px-3 font-medium">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-800/20">
              {loading && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-500">Yükleniyor...</td>
                </tr>
              )}
              {!loading && docs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-500">Henüz belge yok.</td>
                </tr>
              )}
              {docs.map(doc => (
                <tr key={doc.id} className={`hover:bg-blue-900/10 ${!doc.is_read ? 'bg-blue-900/10' : ''}`}>
                  <td className="py-3 px-3 text-gray-200">{doc.clients?.name || `#${doc.client_id}`}</td>
                  <td className="py-3 px-3">
                    <span className="inline-flex items-center gap-1.5 bg-blue-600/20 text-blue-200 text-xs px-2 py-1 rounded-full">
                      <FileText className="w-3 h-3" />
                      {TYPE_LABELS[doc.document_type] || doc.document_type}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-gray-300 max-w-xs truncate" title={doc.title}>{doc.title || doc.source_id || '-'}</td>
                  <td className="py-3 px-3 text-gray-400">{doc.document_date || new Date(doc.created_at).toLocaleDateString('tr-TR')}</td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleRead(doc)}
                        title={doc.is_read ? 'Okunmadı işaretle' : 'Okundu işaretle'}
                        className="p-1.5 text-gray-400 hover:text-white hover:bg-blue-700/30 rounded-lg transition-colors"
                      >
                        {doc.is_read ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      {doc.file_url && (
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 text-gray-400 hover:text-white hover:bg-blue-700/30 rounded-lg transition-colors"
                          title="Görüntüle"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
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
