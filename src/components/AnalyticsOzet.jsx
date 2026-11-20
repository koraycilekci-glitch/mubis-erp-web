// MUBiS - Yonetici paneli icin hazir Analytics ozet karti
//
// Kullanim (ileride AdminDashboard'a tek satirla eklenir):
//   import AnalyticsOzet from '../components/AnalyticsOzet'
//   <AnalyticsOzet gun={30} />
//
// Veri /api/analytics ucundan gelir. Uc yapilandirilmadiysa kart bunu
// kullaniciyi rahatsiz etmeyen bir bilgilendirme olarak gosterir.
import { useCallback, useEffect, useState } from 'react'
import { BarChart3, Loader2, RefreshCw, Info } from 'lucide-react'
import { analyticsRaporu, ANALYTICS_HAZIR } from '../services/analyticsService'

const GUN_ETIKETI = { 7: 'Son 7 gün', 30: 'Son 30 gün', 90: 'Son 90 gün' }

function tarihAraligi(gun) {
  const bitis = new Date()
  const bas = new Date(bitis.getTime() - (gun - 1) * 24 * 60 * 60 * 1000)
  const bicim = (d) => d.toISOString().slice(0, 10)
  return { baslangic: bicim(bas), bitis: bicim(bitis) }
}

export default function AnalyticsOzet({ gun = 30 }) {
  const [durum, setDurum] = useState('bekliyor')
  const [veri, setVeri] = useState(null)
  const [hata, setHata] = useState('')

  const yukle = useCallback(async () => {
    setDurum('yukleniyor')
    setHata('')
    const aralik = tarihAraligi(Number(gun) || 30)
    const sonuc = await analyticsRaporu({
      ...aralik,
      metrikler: ['activeUsers', 'sessions', 'screenPageViews'],
      boyutlar: ['date'],
      limit: 400
    })
    if (!sonuc.ok) {
      setVeri(null)
      setDurum(sonuc.reason === 'yapilandirilmadi' ? 'yapilandirilmadi' : 'hata')
      setHata(sonuc.error || '')
      return
    }
    setVeri(sonuc)
    setDurum('hazir')
  }, [gun])

  useEffect(() => { void yukle() }, [yukle])

  const toplam = veri?.toplamlar || {}

  return (
    <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-300" />
          <h3 className="font-semibold text-white">Site İstatistikleri</h3>
          <span className="text-xs text-blue-300">({GUN_ETIKETI[gun] || `Son ${gun} gün`})</span>
        </div>
        <button
          onClick={() => void yukle()}
          className="text-blue-300 hover:text-white inline-flex items-center gap-1 text-xs"
          disabled={durum === 'yukleniyor'}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${durum === 'yukleniyor' ? 'animate-spin' : ''}`} /> Yenile
        </button>
      </div>

      {durum === 'yukleniyor' && (
        <div className="text-sm text-blue-200 inline-flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Yükleniyor…
        </div>
      )}

      {durum === 'yapilandirilmadi' && (
        <div className="text-xs text-blue-200 flex gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {ANALYTICS_HAZIR
              ? 'GA4 ölçümü etkin. Raporlar için sunucu tarafında GA4_PROPERTY_ID ve GA4_SERVICE_ACCOUNT_JSON ortam değişkenlerini tanımlayın.'
              : 'Analitik ölçüm kimliği tanımlı değil (NEXT_PUBLIC_GA_ID).'}
          </span>
        </div>
      )}

      {durum === 'hata' && (
        <div className="text-xs text-amber-200 flex gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Rapor alınamadı: {hata || 'bilinmeyen hata'}</span>
        </div>
      )}

      {durum === 'hazir' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { ad: 'Aktif kullanıcı', deger: toplam.activeUsers },
            { ad: 'Oturum', deger: toplam.sessions },
            { ad: 'Sayfa görüntüleme', deger: toplam.screenPageViews }
          ].map((k) => (
            <div key={k.ad} className="rounded-lg bg-blue-900/40 border border-blue-400/10 px-3 py-3">
              <div className="text-xs text-blue-300">{k.ad}</div>
              <div className="text-xl font-semibold text-white">
                {Number(k.deger || 0).toLocaleString('tr-TR')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
