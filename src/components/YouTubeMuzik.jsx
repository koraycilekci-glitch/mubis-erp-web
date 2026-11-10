// YouTube Müzik — admin ust bandi rozeti (Web Radyo rozeti tasariminda).
// Panelde arama kutusu + hazir muzik listeleri; tiklaninca ayri kucuk
// pencerede music.youtube.com acilir (sayfadan ayrilmadan dinlenir).
// Ayarlar > Ana Ekran Asistani'ndan acilir/kapatilir (varsayilan kapali).
import { useState, useEffect, useRef } from 'react'
import { Play, ChevronDown, Search, ExternalLink, X, Music2 } from 'lucide-react'

// Hazir muzik listeleri (YouTube Music karisimlar/temalar)
const LİSTELER = [
  { ad: 'YouTube Music Ana Sayfa', url: 'https://music.youtube.com/' },
  { ad: 'Pop Yükselenler', url: 'https://music.youtube.com/playlist?list=RDCLAK5uy_kLWIr9gv1XLlPbaDS965-Db4TrBoUTxQ8' },
  { ad: 'Türkçe Pop Hit', url: 'https://music.youtube.com/playlist?list=RDCLAK5uy_mBHBGbSSgfq9yNJxwy29TuJZ1Bps9IwJ4' },
  { ad: 'Türkçe Akustik', url: 'https://music.youtube.com/playlist?list=RDCLAK5uy_kdEODR5eHlF3QLyMWUHHOTsdRQ0vcjQk4' },
  { ad: 'Lo-Fi Çalışma Müziği', url: 'https://music.youtube.com/playlist?list=RDCLAK5uy_kFgPdmIj0njssEAeDHA5Y3ECgMtdLyGfU' },
  { ad: 'Klasik Müzik', url: 'https://music.youtube.com/playlist?list=RDCLAK5uy_kxryTM4JUTo4nIQUmRHtRB4zNzfnLgzXk' }
]

const SON_KEY = 'admin_ytmusic_son_v1'

function muzikPenceresiAc(url) {
  // Kucuk müzik penceresi — ayni pencere yeniden kullanilir
  window.open(url, 'mubisYTMuzik', 'width=420,height=760,left=' +
    Math.max(0, (window.screen.width - 430)) + ',top=40')
}

export default function YouTubeMuzik() {
  const [acik, setAcik] = useState(false)
  const [arama, setArama] = useState('')
  const [sonAramalar, setSonAramalar] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SON_KEY) || '[]') } catch (_) { return [] }
  })
  const panelRef = useRef(null)

  useEffect(() => {
    if (!acik) return
    const tik = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setAcik(false)
    }
    document.addEventListener('mousedown', tik)
    return () => document.removeEventListener('mousedown', tik)
  }, [acik])

  function aramayiAc(e) {
    e?.preventDefault()
    const q = arama.trim()
    if (!q) return
    muzikPenceresiAc('https://music.youtube.com/search?q=' + encodeURIComponent(q))
    setSonAramalar(prev => {
      const yeni = [q, ...prev.filter(x => x.toLocaleLowerCase('tr') !== q.toLocaleLowerCase('tr'))].slice(0, 5)
      localStorage.setItem(SON_KEY, JSON.stringify(yeni))
      return yeni
    })
    setArama('')
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Rozet */}
      <button
        onClick={() => setAcik(a => !a)}
        className="flex items-center gap-3 rounded-full border border-red-500/50 bg-gradient-to-r from-blue-950/95 to-blue-900/95 px-2 py-1.5 pr-4 shadow-lg transition-all hover:border-red-400/70"
        title="YouTube Müzik"
      >
        <span className="relative w-9 h-9 rounded-full bg-red-600 flex items-center justify-center shrink-0">
          <Play className="w-4.5 h-4.5 text-white fill-white ml-0.5" />
        </span>
        <span className="text-left leading-tight">
          <span className="block text-red-300 font-bold text-sm">YouTube Müzik</span>
          <span className="block text-blue-200 text-[11px]">Küçük pencerede dinle</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-red-300 transition-transform ${acik ? 'rotate-180' : ''}`} />
      </button>

      {/* Panel */}
      {acik && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-red-500/40 bg-blue-950 shadow-2xl z-50 overflow-hidden">
          {/* Arama */}
          <form onSubmit={aramayiAc} className="flex items-center gap-2 px-3 py-2.5 border-b border-blue-800/60 bg-blue-900/40">
            <Search className="w-4 h-4 text-blue-300 shrink-0" />
            <input
              value={arama}
              onChange={e => setArama(e.target.value)}
              placeholder="Şarkı / sanatçı ara…"
              className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none min-w-0"
            />
            {arama && (
              <button type="button" onClick={() => setArama('')} className="text-gray-500 hover:text-gray-300">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button type="submit" className="text-[11px] font-semibold bg-red-600/80 hover:bg-red-500 text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1">
              <ExternalLink className="w-3 h-3" /> Aç
            </button>
          </form>

          {/* Son aramalar */}
          {sonAramalar.length > 0 && (
            <div className="px-3 pt-2.5 pb-1">
              <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Son aramalar</p>
              <div className="flex flex-wrap gap-1.5">
                {sonAramalar.map(q => (
                  <button key={q}
                    onClick={() => muzikPenceresiAc('https://music.youtube.com/search?q=' + encodeURIComponent(q))}
                    className="text-[11px] px-2 py-1 rounded-lg bg-blue-900/50 text-blue-200 hover:bg-blue-800/70 border border-blue-700/40 max-w-[140px] truncate">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Hazir listeler */}
          <div className="max-h-64 overflow-y-auto py-1">
            <p className="text-[10px] uppercase tracking-wide text-gray-500 px-3 pt-1.5 pb-1">Hazır listeler</p>
            {LİSTELER.map(l => (
              <button key={l.ad}
                onClick={() => muzikPenceresiAc(l.url)}
                className="w-full flex items-center gap-2.5 px-3 py-2 border-b border-blue-900/40 last:border-0 hover:bg-blue-900/50 text-left transition-colors">
                <Music2 className="w-4 h-4 text-red-400 shrink-0" />
                <span className="flex-1 text-sm text-gray-200 truncate">{l.ad}</span>
                <ExternalLink className="w-3.5 h-3.5 text-gray-600 shrink-0" />
              </button>
            ))}
          </div>

          <p className="px-3 py-2 text-[10px] text-gray-500 border-t border-blue-900/60 bg-blue-900/20">
            Müzik ayrı küçük pencerede çalar; MUBiS sayfasında gezinirken kesilmez.
          </p>
        </div>
      )}
    </div>
  )
}
