import { useState, useEffect } from 'react'
import { useClients } from '../hooks/useClients'
import { getAllAccountingFees, getAllPayments, hesaplaBorcOzeti } from '../services/paymentService'
import { 
  DollarSign, Users, TrendingUp, TrendingDown, Search,
  FileSpreadsheet, Filter, CheckCircle, AlertTriangle, Clock
} from 'lucide-react'
import * as XLSX from 'xlsx'

export default function OdemeTakip() {
  const { clients } = useClients()
  const [fees, setFees] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState('all') // all, borcu_var, borcu_yok

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [f, p] = await Promise.all([getAllAccountingFees(), getAllPayments()])
      setFees(f)
      setPayments(p)
    } catch (err) {
      console.error('Veri yukleme hatasi:', err)
    } finally {
      setLoading(false)
    }
  }

  // Her musteri icin borc ozeti hesapla
  const musteriOzetleri = clients.map(c => {
    const fee = fees.find(f => f.client_id === c.id)
    const clientPayments = payments.filter(p => p.client_id === c.id)
    const ozet = hesaplaBorcOzeti(fee, clientPayments)
    return { ...c, fee, payments: clientPayments, ozet }
  }).filter(c => {
    if (searchTerm) {
      const s = searchTerm.toLowerCase()
      const name = (c.name || c.company || '').toLowerCase()
      if (!name.includes(s)) return false
    }
    if (filter === 'borcu_var') return c.ozet.kalanBorc > 0
    if (filter === 'borcu_yok') return c.ozet.kalanBorc <= 0
    return true
  }).sort((a, b) => b.ozet.kalanBorc - a.ozet.kalanBorc)

  // Toplamlar
  const toplamlar = musteriOzetleri.reduce((acc, c) => ({
    toplamBorc: acc.toplamBorc + c.ozet.toplamBorc,
    toplamOdeme: acc.toplamOdeme + c.ozet.toplamOdeme,
    kalanBorc: acc.kalanBorc + c.ozet.kalanBorc,
    aylikGelir: acc.aylikGelir + c.ozet.aylikUcret
  }), { toplamBorc: 0, toplamOdeme: 0, kalanBorc: 0, aylikGelir: 0 })

  const borcuOlanSayisi = clients.filter(c => {
    const fee = fees.find(f => f.client_id === c.id)
    const cp = payments.filter(p => p.client_id === c.id)
    return hesaplaBorcOzeti(fee, cp).kalanBorc > 0
  }).length

  const fmt = (n) => Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })

  const exportExcel = () => {
    const rows = musteriOzetleri.map((c, i) => ({
      '#': i + 1,
      'Musteri': c.name || c.company || '-',
      'Aylik Ucret': c.ozet.aylikUcret,
      'Onceki Donem': c.ozet.oncekiDonem,
      'Defter Tasdik': c.ozet.defterTasdik,
      'Toplam Borc': c.ozet.toplamBorc,
      'Toplam Odeme': c.ozet.toplamOdeme,
      'Kalan Borc': c.ozet.kalanBorc,
      'Son Odeme': c.ozet.sonOdeme ? new Date(c.ozet.sonOdeme).toLocaleDateString('tr-TR') : '-'
    }))
    rows.push({})
    rows.push({ '#': '', 'Musteri': 'TOPLAM', 'Toplam Borc': toplamlar.toplamBorc, 'Toplam Odeme': toplamlar.toplamOdeme, 'Kalan Borc': toplamlar.kalanBorc })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Odeme Takip')
    XLSX.writeFile(wb, `odeme_takip_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center space-x-3">
            <DollarSign className="w-8 h-8 text-yellow-400" />
            <span>Odeme Takip</span>
          </h1>
          <p className="text-gray-400 mt-1">Tum musterilerin muhasebe odeme durumu</p>
        </div>
        <button onClick={exportExcel} className="mt-4 md:mt-0 bg-green-600/20 text-green-400 px-4 py-2 rounded-lg text-sm font-medium flex items-center space-x-2 hover:bg-green-600/30 transition-colors">
          <FileSpreadsheet className="w-4 h-4" /><span>Excel Dokum</span>
        </button>
      </div>

      {/* Ozet Kartlari */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30">
          <p className="text-gray-400 text-xs">Aylik Toplam Gelir</p>
          <p className="text-2xl font-bold text-blue-400 mt-1">{fmt(toplamlar.aylikGelir)} <span className="text-sm">TL</span></p>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30">
          <p className="text-gray-400 text-xs">Toplam Alacak</p>
          <p className="text-2xl font-bold text-yellow-400 mt-1">{fmt(toplamlar.toplamBorc)} <span className="text-sm">TL</span></p>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30">
          <p className="text-gray-400 text-xs">Toplam Tahsilat</p>
          <p className="text-2xl font-bold text-green-400 mt-1">{fmt(toplamlar.toplamOdeme)} <span className="text-sm">TL</span></p>
        </div>
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30">
          <p className="text-gray-400 text-xs">Kalan Alacak</p>
          <p className={`text-2xl font-bold mt-1 ${toplamlar.kalanBorc > 0 ? 'text-red-400' : 'text-green-400'}`}>{fmt(toplamlar.kalanBorc)} <span className="text-sm">TL</span></p>
        </div>
      </div>

      {/* Filtre ve Arama */}
      <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 mb-6 flex flex-col md:flex-row gap-3 items-start md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input type="text" placeholder="Musteri ara..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 pl-9 pr-3 text-white text-sm focus:outline-none focus:border-yellow-400" />
        </div>
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-gray-500" />
          {[
            { id: 'all', label: 'Tumu', count: clients.length },
            { id: 'borcu_var', label: 'Borcu Var', count: borcuOlanSayisi },
            { id: 'borcu_yok', label: 'Borcu Yok', count: clients.length - borcuOlanSayisi }
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === f.id ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-400 hover:text-white'}`}>
              {f.label} ({f.count})
            </button>
          ))}
        </div>
      </div>

      {/* Tablo */}
      <div className="bg-blue-800/20 rounded-2xl border border-blue-700/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-blue-900/30">
              <tr className="text-left text-gray-400 text-xs">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Musteri</th>
                <th className="px-4 py-3 text-right">Aylik Ucret</th>
                <th className="px-4 py-3 text-right">Toplam Borc</th>
                <th className="px-4 py-3 text-right">Odenen</th>
                <th className="px-4 py-3 text-right">Kalan</th>
                <th className="px-4 py-3 text-center">Son Odeme</th>
                <th className="px-4 py-3 text-center">Durum</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" className="text-center py-8 text-gray-400">Yukleniyor...</td></tr>
              ) : musteriOzetleri.length === 0 ? (
                <tr><td colSpan="8" className="text-center py-8 text-gray-500">Kayit bulunamadi</td></tr>
              ) : (
                musteriOzetleri.map((c, i) => (
                  <tr key={c.id} className="border-t border-blue-700/20 hover:bg-blue-800/20 transition-colors">
                    <td className="px-4 py-3 text-gray-500 text-sm">{i + 1}</td>
                    <td className="px-4 py-3 text-white text-sm font-medium">{c.name || c.company || '-'}</td>
                    <td className="px-4 py-3 text-right text-gray-300 text-sm">{c.ozet.aylikUcret > 0 ? `${fmt(c.ozet.aylikUcret)} TL` : '-'}</td>
                    <td className="px-4 py-3 text-right text-yellow-400 text-sm font-medium">{c.ozet.toplamBorc > 0 ? `${fmt(c.ozet.toplamBorc)} TL` : '-'}</td>
                    <td className="px-4 py-3 text-right text-green-400 text-sm">{c.ozet.toplamOdeme > 0 ? `${fmt(c.ozet.toplamOdeme)} TL` : '-'}</td>
                    <td className={`px-4 py-3 text-right text-sm font-bold ${c.ozet.kalanBorc > 0 ? 'text-red-400' : c.ozet.kalanBorc < 0 ? 'text-blue-400' : 'text-green-400'}`}>
                      {c.ozet.kalanBorc !== 0 ? `${fmt(c.ozet.kalanBorc)} TL` : '-'}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-400 text-xs">
                      {c.ozet.sonOdeme ? new Date(c.ozet.sonOdeme).toLocaleDateString('tr-TR') : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {c.ozet.kalanBorc > 0 ? (
                        <span className="inline-flex items-center space-x-1 bg-red-500/20 text-red-400 px-2 py-1 rounded text-xs">
                          <AlertTriangle className="w-3 h-3" /><span>Borclu</span>
                        </span>
                      ) : c.ozet.toplamBorc > 0 ? (
                        <span className="inline-flex items-center space-x-1 bg-green-500/20 text-green-400 px-2 py-1 rounded text-xs">
                          <CheckCircle className="w-3 h-3" /><span>Tamam</span>
                        </span>
                      ) : (
                        <span className="text-gray-600 text-xs">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {musteriOzetleri.length > 0 && (
              <tfoot className="bg-blue-900/40 border-t-2 border-yellow-400/30">
                <tr className="text-sm font-bold">
                  <td className="px-4 py-3" colSpan="2"><span className="text-yellow-400">TOPLAM</span></td>
                  <td className="px-4 py-3 text-right text-blue-400">{fmt(toplamlar.aylikGelir)} TL</td>
                  <td className="px-4 py-3 text-right text-yellow-400">{fmt(toplamlar.toplamBorc)} TL</td>
                  <td className="px-4 py-3 text-right text-green-400">{fmt(toplamlar.toplamOdeme)} TL</td>
                  <td className={`px-4 py-3 text-right ${toplamlar.kalanBorc > 0 ? 'text-red-400' : 'text-green-400'}`}>{fmt(toplamlar.kalanBorc)} TL</td>
                  <td colSpan="2"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
