import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Users, Globe, LogIn, UserX, RefreshCw } from 'lucide-react'
import { getSiteVisitStats, getClientLoginList } from '../services/statsService'

function tarihSaatTR(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function MusteriGirisTakip() {
  const navigate = useNavigate()
  const [clients, setClients] = useState([])
  const [visits, setVisits] = useState({ total: 0, today: 0 })
  const [loading, setLoading] = useState(true)
  const [arama, setArama] = useState('')

  const yukle = async () => {
    setLoading(true)
    try {
      const [v, liste] = await Promise.all([getSiteVisitStats(), getClientLoginList()])
      setVisits(v)
      setClients(liste)
    } catch (e) {
      console.error('Giris takip yukleme hatasi:', e)
    }
    setLoading(false)
  }

  useEffect(() => { yukle() }, [])

  const filtreli = useMemo(() => {
    const q = arama.trim().toLowerCase()
    const liste = q
      ? clients.filter(c => (c.name || '').toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q))
      : [...clients]
    // Hic girmeyenler en üstte, sonra en son giren en üstte
    return liste.sort((a, b) => {
      const at = a.last_login_at ? new Date(a.last_login_at).getTime() : 0
      const bt = b.last_login_at ? new Date(b.last_login_at).getTime() : 0
      return bt - at
    })
  }, [clients, arama])

  const girenSayisi = clients.filter(c => c.last_login_at).length
  const girmeyenSayisi = clients.length - girenSayisi

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Baslik */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/admin')} className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-blue-800/30">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <LogIn className="w-6 h-6 text-yellow-400" />
            Giriş Takibi
          </h1>
          <p className="text-gray-400 text-sm">Hangi müşteri portala girdi, hangisi hiç girmedi</p>
        </div>
        <button onClick={yukle} className="flex items-center gap-2 bg-blue-800/40 hover:bg-blue-800/60 text-blue-200 px-3 py-2 rounded-lg text-sm">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Yenile
        </button>
      </div>

      {/* Ozet kartlari */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-800/20 rounded-2xl p-5 border border-blue-700/30">
          <div className="flex items-center gap-2 text-blue-300 text-xs mb-2"><Globe className="w-4 h-4" /> Toplam Ziyaretçi</div>
          <div className="text-3xl font-bold text-white">{visits.total}</div>
          <div className="text-gray-400 text-xs mt-1">web sitesi</div>
        </div>
        <div className="bg-blue-800/20 rounded-2xl p-5 border border-blue-700/30">
          <div className="flex items-center gap-2 text-blue-300 text-xs mb-2"><Globe className="w-4 h-4" /> Bugün Ziyaret</div>
          <div className="text-3xl font-bold text-white">{visits.today}</div>
          <div className="text-gray-400 text-xs mt-1">bugünkü oturum</div>
        </div>
        <div className="bg-green-500/10 rounded-2xl p-5 border border-green-500/30">
          <div className="flex items-center gap-2 text-green-300 text-xs mb-2"><Users className="w-4 h-4" /> Giriş Yapan</div>
          <div className="text-3xl font-bold text-green-400">{girenSayisi}</div>
          <div className="text-gray-400 text-xs mt-1">müşteri portala girdi</div>
        </div>
        <div className="bg-red-500/10 rounded-2xl p-5 border border-red-500/30">
          <div className="flex items-center gap-2 text-red-300 text-xs mb-2"><UserX className="w-4 h-4" /> Hiç Girmeyen</div>
          <div className="text-3xl font-bold text-red-400">{girmeyenSayisi}</div>
          <div className="text-gray-400 text-xs mt-1">müşteri hiç girmedi</div>
        </div>
      </div>

      {/* Arama */}
      <div className="mb-4">
        <input
          type="text"
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          placeholder="Müşteri ara..."
          className="w-full sm:w-80 bg-blue-900/30 border border-blue-700/50 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-yellow-400"
        />
      </div>

      {/* Musteri giris tablosu */}
      <div className="bg-blue-800/10 rounded-2xl border border-blue-700/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-blue-700/30 bg-blue-900/20">
                <th className="py-3 px-4 font-medium">Müşteri</th>
                <th className="py-3 px-4 font-medium">Kullanıcı Adı</th>
                <th className="py-3 px-4 font-medium">Durum</th>
                <th className="py-3 px-4 font-medium">Son Giriş</th>
                <th className="py-3 px-4 font-medium text-right">Giriş Sayısı</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" className="py-10 text-center text-gray-400">Yükleniyor...</td></tr>
              ) : filtreli.length === 0 ? (
                <tr><td colSpan="5" className="py-10 text-center text-gray-400">Kayıt bulunamadı</td></tr>
              ) : filtreli.map(c => {
                const girdi = !!c.last_login_at
                return (
                  <tr key={c.id} className="border-b border-blue-800/20 hover:bg-blue-800/10">
                    <td className="py-3 px-4">
                      <div className="text-white font-medium">{c.name || c.company || '-'}</div>
                      {c.company && c.name && <div className="text-gray-500 text-xs">{c.company}</div>}
                    </td>
                    <td className="py-3 px-4 text-gray-300 font-mono text-xs">{c.username || '-'}</td>
                    <td className="py-3 px-4">
                      {girdi ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">Girdi</span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-400">Hiç Girmedi</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-300 text-xs">
                      {girdi ? tarihSaatTR(c.last_login_at) : <span className="text-gray-600">-</span>}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={`font-mono font-semibold ${girdi ? 'text-yellow-400' : 'text-gray-600'}`}>
                        {c.login_count || 0}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
