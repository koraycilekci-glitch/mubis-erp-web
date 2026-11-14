import { useEffect, useState } from 'react'
import { UseRepair, Shield, Clipboard, Loader2, Excel, BarChart3 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { tl } from '../utils/format'

function MizanKontrol() {
  const navigate = useNavigate()
  const [firmalar, setFirmalar] = useState([])
  const [yil, setYil] = useState(new Date().getFullYear())
  const [ay, setAy] = useState((new Date().getMonth() + 1).toString().padStart(2, '0'))
  const [yukleme, setYukleme] = useState('ready')
  const [filtre, setFiltre] = useState({ firma: '', status: 'all' })
  const AYLAR = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK']

  useEffect(() => {
    // Firms and mizan data would be fetched from Supabase
    // Placeholder data for now
    const placeholderFirmalar = [
      { id: '1', ad: 'ABC Muhasebe Danışmanlık', vkn: '1234567890', mizanDurumu: 'tamam', sonYukleme: '2026-11', dosyaSayisi: 12, topMiktar: 45000 },
      { id: '2', ad: 'XYZ İnşaat A.Ş.', vkn: '0987654321', mizanDurumu: 'eksik', sonYukleme: '2026-10', dosyaSayisi: 5, topMiktar: 28000 },
      { id: '3', ad: 'Mavi Teknoloji A.Ş.', vkn: '1122334455', mizanDurumu: 'tamam', sonYukleme: '2026-11', dosyaSayisi: 8, topMiktar: 32000 },
    ]
    setFirmalar(placeholderFirmalar)
  }, [])

  const handleAyDegis = (newAy) => {
    setAy(newAy)
  }

  const handleYilDegis = (newYil) => {
    setYil(newYil)
  }

  const statusClass = (durum) => {
    switch (durum) {
      case 'tamam': return 'bg-green-500/20 text-green-400'
      case 'eksik': return 'bg-yellow-500/20 text-yellow-400'
      case 'ders': return 'bg-red-500/20 text-red-400'
      default: return 'bg-gray-500/20 text-gray-400'
    }
  }

  const statusText = (durum) => {
    switch (durum) {
      case 'tamam': return 'Tamam'
      case 'eksik': return 'Eksik'
      case 'ders': return 'Ders'
      default: return 'Bilinmiyor'
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Mizan (TDHP) Kontrol Motoru</h1>
          <p className="text-gray-400 mt-1">Firmaların mizan (TDHP) durumları ve finansman kısıtlamaları</p>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={yil}
            onChange={(e) => handleYilDegis(parseInt(e.target.value, 10))}
            className="bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400 transition-colors"
          >
            <option value={2024}>2024</option>
            <option value={2025}>2025</option>
            <option value={2026}>2026</option>
          </select>
          <select
            value={ay}
            onChange={(e) => handleAyDegis(e.target.value)}
            className="bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400 transition-colors"
          >
            {AYLAR.map((a) => <option key={a} value={a.slice(0, 3).toLowerCase()}>{a}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
        {firmalar.map((f) => (
          <div
            key={f.id}
            className="bg-blue-900/20 rounded-xl border border-blue-700/30 p-6 hover:bg-blue-800/30 transition-colors"
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-white font-medium">{f.ad}</h3>
              <span className={`px-2 py-1 rounded text-xs font-medium ${statusClass(f.mizanDurumu)}`}>
                {statusText(f.mizanDurumu)}
              </span>
            </div>
            <p className="text-gray-300 text-sm">VKN: {f.vkn}</p>
            <p className="text-gray-400 text-xs mb-2">Son mizan yükleme: {f.sonYukleme}</p>
            <p className="text-gray-300 text-xs">Mizan dosyası sayısı: {f.dosyaSayisi}</p>
            <p className="text-white font-medium">Toplam miktar: {tl(f.topMiktar)}</p>
            <div className="mt-4">
              <button
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm transition-colors"
                onClick={() => navigate(`/admin/mizan-detay/${f.id}`)}
              >
                Detaylı Rapor
              </button>
              <button
                className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded text-sm transition-colors ml-2"
                onClick={() => navigate('/admin/finansman-kisitlamalari')}
              >
                Finansman Kısıtlaması
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Stats Summary */}
      <div className="bg-blue-900/20 rounded-xl border border-blue-700/30 p-6 mb-8">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-gray-400 text-sm">Toplam Firma</p>
            <p className="text-2xl font-bold text-white">{firmalar.length}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm">Tamamlanan</p>
            <p className="text-2xl font-bold text-green-400">{firmalar.filter(f => f.mizanDurumu === 'tamam').length}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm">Eksik</p>
            <p className="text-2xl font-bold text-yellow-400">{firmalar.filter(f => f.mizanDurumu === 'eksik').length}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm">Ders</p>
            <p className="text-2xl font-bold text-red-400">{firmalar.filter(f => f.mizanDurumu === 'ders').length}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-blue-900/20 rounded-xl border border-blue-700/30 p-6 mb-8">
        <h2 className="text-white font-medium mb-4">Filtreler</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <select
              value={filtre.firma}
              onChange={(e) => setFiltre({ ...filtre, firma: e.target.value })}
              className="bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400 transition-colors"
            >
              <option value="">Tümü</option>
              {firmalar.map((f) => <option key={f.id} value={f.id}>{f.ad}</option>)}
            </select>
          </div>
          <div>
            <select
              value={filtre.status}
              onChange={(e) => setFiltre({ ...filtre, status: e.target.value })}
              className="bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400 transition-colors"
            >
              <option value="all">Tümü</option>
              <option value="tamam">Tamam</option>
              <option value="eksik">Eksik</option>
              <option value="ders">Ders</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MizanKontrol