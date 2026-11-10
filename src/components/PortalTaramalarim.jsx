import { useEffect, useState } from 'react'
import { ScanLine, Loader2, RefreshCw, ExternalLink } from 'lucide-react'
import { taramaListesi, taramaFotoUrl } from '../services/taramaService'
import MobilYuklemeKarti from './MobilYuklemeKarti'

// Müşteri portalı — kendi taramaları (RLS yalnız kendi kayıtlarını döndürür)
export default function PortalTaramalarim({ clientId, refreshKey = 0 }) {
  const [kayitlar, setKayitlar] = useState(null)
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState('')

  const yukle = async () => {
    if (!clientId) return
    setYukleniyor(true)
    setHata('')
    try {
      setKayitlar(await taramaListesi({}))
    } catch (e) {
      setHata(e?.message || 'Liste alınamadı')
      setKayitlar([])
    } finally {
      setYukleniyor(false)
    }
  }
  useEffect(() => { yukle() }, [clientId, refreshKey])

  const fotoAc = async (t) => {
    const url = await taramaFotoUrl(t.storage_path)
    if (url) window.open(url, '_blank')
  }

  return (
    <div className="bg-blue-950/30 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-white flex items-center gap-2">
          <ScanLine className="w-5 h-5 text-cyan-400" /> Taramalarım
        </h3>
        <button onClick={yukle} disabled={yukleniyor} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg px-3 py-1.5 text-xs font-medium transition">
          {yukleniyor ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Yenile
        </button>
      </div>
      <p className="text-gray-400 text-sm mb-4">Mobil uygulamadan gönderdiğiniz fiş ve Z raporları burada listelenir.</p>

      <MobilYuklemeKarti baslik="MUBiS Tarama Uygulamasını Yükle" />

      {hata && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-2 mb-3">{hata}</div>}
      {!kayitlar && !hata && <div className="text-center py-8 text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>}
      {kayitlar && kayitlar.length === 0 && (
        <div className="text-center py-8 text-gray-500 text-sm">Henüz tarama gönderilmedi.</div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(kayitlar || []).map(t => {
          const on = t.on_okuma || {}
          const manuel = on.kaynak === 'musteri-manuel'
          const tutarGoster = t.belge_tipi === 'z'
            ? (on.satis ? [on.satis.s0, on.satis.s1, on.satis.s10, on.satis.s20].reduce((a, v) => a + (Number(v) || 0), 0) : null)
            : (on.toplam != null ? on.toplam : on.tutar)
          const tl = (v) => Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          return (
            <div key={t.id} className="bg-blue-900/20 border border-blue-800/40 rounded-xl p-3 flex gap-3 items-center">
              <button onClick={() => fotoAc(t)} className="w-12 h-16 rounded-lg overflow-hidden bg-blue-900/40 border border-blue-800/40 shrink-0 hover:opacity-80 transition flex items-center justify-center">
                <ScanLine className="w-4 h-4 text-gray-500" />
              </button>
              <div className="min-w-0">
                <div className="text-white text-sm font-medium">
                  {t.belge_tipi === 'z' ? 'Z Raporu' : 'Gider Fişi'}{manuel ? ' (elle giriş)' : ''} · {String(t.donem_ay).padStart(2, '0')}/{t.donem_yil}
                </div>
                <div className="text-gray-400 text-xs mt-0.5">
                  {new Date(t.created_at).toLocaleString('tr-TR')}
                  {tutarGoster != null && tutarGoster > 0 ? ` · ${tl(tutarGoster)} TL` : ''}
                </div>
                <div className={`text-xs mt-0.5 font-medium ${t.durum === 'islendi' ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {t.durum === 'islendi' ? (manuel ? 'Onaylandı — faturalara işlendi' : 'Muhasebeye işlendi') : (manuel ? 'Onay bekliyor' : 'İşlem bekliyor')}
                </div>
              </div>
              <button onClick={() => fotoAc(t)} className="ml-auto text-blue-300 hover:text-blue-200 shrink-0" title="Fotoğrafı aç">
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
