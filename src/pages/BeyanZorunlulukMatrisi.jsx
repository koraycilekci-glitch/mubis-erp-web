import { useEffect, useState } from 'react'
import { UseRepair, Shield, Clipboard, Loader2, CalendarDays, BarChart3, FileText, Calendar, Check, XCircle, Info } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { tl } from '../utils/format'

function BeyanZorunlulukMatrisi() {
  const navigate = useNavigate()
  const { selectedYear = new Date().getFullYear().toString(), selectedMonth } = useParams()
  const [yil, setYil] = useState(selectedYear ? parseInt(selectedYear, 10) : new Date().getFullYear())
  const [ay, setAy] = useState(selectedMonth ? parseInt(selectedMonth, 10) : new Date().getMonth() + 1)
  const [firmalar, setFirmalar] = useState([])
  const [yukleme, setYukleme] = useState('loading')
  const [seciliFirma, setSeciliFirma] = useState(null)
  const [filtre, setFiltre] = useState({ status: 'all' })
  const AYLAR = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK']
  const BEYAN_TURLARI = ['kdv', 'kdv2', 'sgk', 'muhtasar', 'gecici_vergi', 'poset', 'muhtasar_3aylik', 'edefter', 'esmm']

  useEffect(() => {
    // Fetch firms with beyan obligation data from Supabase
    // Placeholder data for now
    const placeholderFirmalar = [
      { id: '1', ad: 'ABC Muhasebe Danışmanlık', vkn: '1234567890', vergiDairesi: '1. V.D. İstanbul' },
      { id: '2', ad: 'XYZ İnşaat A.Ş.', vkn: '0987654321', vergiDairesi: '2. V.D. Ankara' },
      { id: '3', ad: 'Mavi Teknoloji A.Ş.', vkn: '1122334455', vergiDairesi: '3. V.D. İzmir' },
    ]
    setFirmalar(placeholderFirmalar)
    setYukleme('ready')
  }, [yil, ay])

  const beyanZorunlulari = {
    kdv: { zorunlu: true, label: 'KDV Beyannamesi' },
    kdv2: { zorunlu: true, label: 'KDV2 (Tevkifatlı Alış)' },
    sgk: { zorunlu: true, label: 'SGK Beyannamesi' },
    muhtasar: { zorunlu: false, label: 'Muhtasar Beyannamesi' },
    gecici_vergi: { zorunlu: false, label: 'Geçici Vergi Beyannamesi' },
    poset: { zorunlu: false, label: 'POST Beyannamesi' },
    muhtasar_3aylik: { zorunlu: false, label: 'Muhtasar (3 Aylık)' },
    edefter: { zorunlu: false, label: 'e-Defter Beyannamesi' },
    esmm: { zorunlu: false, label: 'e-SMM Beyannamesi' },
  }

  const statusClass = (tamamlandi, zorunlu) => {
    if (!zorunlu) return 'bg-gray-500/20 text-gray-400'
    if (tamamlandi) return 'bg-green-500/20 text-green-400'
    return 'bg-red-500/20 text-red-400'
  }

  const statusText = (tamamlandi, zorunlu) => {
    if (!zorunlu) return 'Seçmeli'
    if (tamamlandi) return 'Tamam'
    return 'Zorunlu'
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">
            Beyanname Zorunluluk Matrisi
            <Info className="w-4 h-4 ml-1 text-yellow-400 text-xs" title="Seçili dönem için zorunlu beyan türleri" />
          </h1>
          <p className="text-gray-400 mt-1">
            {yil} yıl - {AYLAR[ay - 1]} {ay}. Dönemi için beyan zorunluluk durumu
          </p>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={yil}
            onChange={(e) => setYil(parseInt(e.target.value, 10))}
            className="bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400 transition-colors"
          >
            <option value={2024}>2024</option>
            <option value={2025}>2025</option>
            <option value={2026}>2026</option>
          </select>
          <select
            value={ay}
            onChange={(e) => setAy(parseInt(e.target.value, 10))}
            className="bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400 transition-colors"
          >
            <option value={0}>Tümü</option>
            {AYLAR.map((a, i) => <option key={i + 1} value={i + 1}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* Obligation Matrix */}
      {yukleme === 'ready' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-8 gap-6 mb-8">
          {/* Mandatory Column */}
          <div className="lg:col-span-1 bg-blue-900/20 rounded-xl border border-blue-700/30 p-6">
            <h2 className="text-white font-medium mb-4">Zorunlu Beyannameler</h2>
            <p className="text-gray-400 text-sm mb-6">
              Şu an için zorunlu olan beyan türleri
            </p>
            <div className="space-y-2">
              {BEYAN_TURLARI.map((tur) => {
                const zorunlu = beyanZorunlulari[tur]?.zorunlu
                return (
                  <div
                    key={tur}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs ${
                      zorunlu ? 'bg-red-500/20 text-red-300' : 'bg-green-500/20 text-green-300'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full ${
                      zorunlu ? 'bg-red-500' : 'bg-green-500'
                    }" />
                    <span>{beyanZorunlulari[tur]?.label || tur}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Firms */}
          {firmalar.map((firma) => (
            <div
              key={firma.id}
              className="lg:col-span-2 bg-blue-900/20 rounded-xl border border-blue-700/30 p-6 hover:bg-blue-800/30 transition-colors"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-white font-medium">{firma.ad}</h3>
                  <p className="text-gray-400 text-xs">VKN: {firma.vkn}</p>
                  <p className="text-gray-400 text-xs">Vergi Dairesi: {firma.vergiDairesi}</p>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${statusClass(true, true)}`}>
                  {statusText(true, true)}
                </span>
              </div>

              <div className="space-y-3">
                {BEYAN_TURLARI.map((tur) => {
                  const zorunlu = beyanZorunlulari[tur]?.zorunlu
                  if (!zorunlu) return null
                  return (
                    <div
                      key={tur}
                      className="flex items-center gap-2 px-3 py-1.5 rounded text-xs"
                    >
                      <span className="w-2 h-2 rounded-full bg-gray-300" />
                      <span>{beyanZorunlulari[tur]?.label || tur}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Firmaların beyan durumu matrisi */}
        <div className="bg-blue-900/20 rounded-xl border border-blue-700/30 p-6 mb-8">
          <h2 className="text-white font-medium mb-4">Firma Beyan Durumu</h2>
          <p className="text-gray-400 text-sm mb-6">
            {seciliFirma ? `${seciliFirma.ad} - ${yil} yıl - ${AYLAR[ay - 1]} ay` : 'Firma seçili değil'}
          </p>

          {seciliFirma && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-blue-900/30">
                  <tr className="text-left text-gray-400 text-sm">
                    <th className="px-6 py-4">Beyan Türü</th>
                    <th className="px-6 py-4">Zorunlu?</th>
                    <th className="px-6 py-4">Durum</th>
                    <th className="px-6 py-4">Son İşlem</th>
                    <th className="px-6 py-4">Eylem</th>
                  </tr>
                </thead>
                <tbody>
                  {BEYAN_TURLARI.map((tur) => (
                    <tr key={tur} className="border-b border-blue-700/30 hover:bg-blue-800/20 transition-colors">
                      <td className="px-6 py-3 text-white font-medium">{beyanZorunlulari[tur]?.label || tur}</td>
                      <td className="px-6 py-3">
                        <span className={tur === 'kdv' || tur === 'sgk' ? 'bg-green-500/20 text-green-300' : 'bg-gray-500/20 text-gray-300'}>{beyanZorunlulari[tur]?.zorunlu ? 'Zorunlu' : 'Seçmeli'}</span>
                      </td>
                      <td className="px-6 py-3">
                        <span className="bg-blue-900/20 text-blue-300 px-2 py-1 rounded text-xs">Bilgi yok</span>
                      </td>
                      <td className="px-6 py-3">
                        <span className="bg-gray-900/20 text-gray-300 px-2 py-1 rounded text-xs">Henüz yapılmadı</span>
                      </td>
                      <td className="px-6 py-3">
                        <button
                          className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-xs transition-colors"
                          onClick={() => navigate(`/admin/beyan-detay/${firma.id}/${tur}`)}
                        >
                          Takip
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )} else {
            <div className="bg-gray-900/30 rounded-xl p-8 text-center">
              <p className="text-gray-400">Lütfen sol tablodan birirma seçin</p>
              <button
                className="mt-4 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded text-sm transition-colors"
                onClick={() => setSeciliFirma(firmalar[0])}
              >
                İlk Firmanın Beyan Durumu
              </button>
            </div>
          }
        </div>
      )}
    </div>
  )
}

export default BeyanZorunlulukMatrisi