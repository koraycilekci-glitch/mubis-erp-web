import { useEffect, useState } from 'react'

/**
 * Ana ekran — Tarih/saat/hava kartının altında gösterilen döviz & altın bandı.
 * Veri kaynağı: /api/kurlar (Cloudflare Pages Function).
 * Ayarlar > Ana Ekran Asistanı > "Döviz & Altın Kurları" anahtarı ile açılır/kapanır
 * (varsayılan AÇIK; localStorage: admin_kurlar_v1 = '0' ise kapanır).
 */
export default function KurAltinBandi() {
  const [veri, setVeri] = useState(null)
  const [hata, setHata] = useState(false)

  const yenile = async () => {
    try {
      const r = await fetch('/api/kurlar', { cache: 'no-store' })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      const j = await r.json()
      if (j?.ok) { setVeri(j); setHata(false) }
      else setHata(true)
    } catch {
      setHata(true)
    }
  }

  useEffect(() => {
    yenile()
    // TCMB 10 dk, altın 2 dk önbellekli → 5 dk'da bir yoklamak yeterli.
    const iv = setInterval(yenile, 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [])

  const degisimRenk = (d) => d == null ? 'text-gray-500' : d > 0 ? 'text-emerald-400' : d < 0 ? 'text-red-400' : 'text-gray-400'
  const degisimYazi = (d) => d == null ? '' : `${d > 0 ? '▲' : d < 0 ? '▼' : '—'} ${Math.abs(d).toFixed(2)}%`
  const fiyatYazi = (v) => v == null ? '—' : Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })

  const dovizler = veri?.doviz || []
  const altinlar = veri?.altin || []

  return (
    <div className="w-[560px] max-w-[90vw] rounded-xl border border-blue-700/50 bg-blue-950/90 px-3 py-2 shadow-lg backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[11px] font-bold text-yellow-300 tracking-wide">💱 Döviz &amp; Altın</span>
        <span className="text-[9px] text-gray-400 truncate">
          {hata ? 'Kur verisi alınamadı' : veri
            ? `${veri.tcmbTarih || '—'} · ${veri.usdKaynak || ''} · ${new Date(veri.guncelleme).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`
            : 'Yükleniyor…'}
        </span>
      </div>

      {dovizler.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {dovizler.map((d) => (
            <div key={d.kod} className="flex items-baseline gap-1 whitespace-nowrap" title={`${d.ad} — ${d.alis ?? '—'} / ${d.satis ?? '—'}`}>
              <span className="text-[11px]">{d.ikon}</span>
              <span className="text-[10px] font-semibold text-blue-200">{d.kod}</span>
              <span className="text-[11px] font-bold text-white tabular-nums">{fiyatYazi(d.satis ?? d.alis)}</span>
              <span className={`text-[9px] tabular-nums ${degisimRenk(d.degisim)}`}>{degisimYazi(d.degisim)}</span>
            </div>
          ))}
        </div>
      )}

      {altinlar.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-blue-800/60 flex flex-wrap gap-x-3 gap-y-1">
          {altinlar.map((a) => (
            <div key={a.kod} className="flex items-baseline gap-1 whitespace-nowrap" title={a.hesaplanan ? `${a.ad} — hesaplanan gösterge` : a.ad}>
              <span className="text-[11px]">{a.ikon}</span>
              <span className="text-[10px] font-semibold text-yellow-200/90">{a.ad.replace(' Altın', '')}</span>
              <span className="text-[11px] font-bold text-white tabular-nums">{fiyatYazi(a.fiyat)}</span>
              <span className="text-[9px] text-gray-500">{a.para === 'USD' ? '$' : '₺'}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-1 text-[9px] leading-tight text-gray-500">
        Altın TRY değerleri ons × TCMB dolar kuru ile hesaplanan göstergedir; yatırım tavsiyesi değildir.
      </div>
    </div>
  )
}
