// Spotify — admin/musteri ust bandi rozeti (YouTube Muzik rozeti tasariminda).
// Panelde arama + hazir listeler; tiklaninca ayri kucuk pencerede
// open.spotify.com acilir (Spotify yerlestirme/direkt yayin izin vermedigi
// icin popup yontemi; kullanici Spotify hesabina giris yapmis olur).
// Ayarlar > Ana Ekran Asistani'ndan acilir/kapatilir (varsayilan kapali).
import { useState, useEffect, useRef } from 'react'
import { Music2, ChevronDown, Search, ExternalLink, X } from 'lucide-react'

const LİSTELER = [
  { ad: 'Spotify Ana Sayfa', url: 'https://open.spotify.com/' },
  { ad: 'Bugünün En İyileri', url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M' },
  { ad: 'Lo-Fi Çalışma Müziği', url: 'https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn' },
  { ad: 'Türkçe Pop', url: 'https://open.spotify.com/search/T%C3%BCrk%C3%A7e%20Pop' },
  { ad: 'Türkçe Akustik', url: 'https://open.spotify.com/search/T%C3%BCrk%C3%A7e%20Akustik' },
  { ad: 'Klasik Müzik', url: 'https://open.spotify.com/search/klasik%20m%C3%BCzik' }
]

const SON_KEY = 'spotify_son_aramalar_v1'

function spotifyPenceresiAc(url) {
  window.open(url, 'mubisSpotify', 'width=460,height=800,left=' +
    Math.max(0, (window.screen.width - 470)) + ',top=30')
}

export default function SpotifyUstBant() {
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
    spotifyPenceresiAc('https://open.spotify.com/search/' + encodeURIComponent(q))
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
        className="flex items-center gap-3 rounded-full border border-green-500/50 bg-gradient-to-r from-blue-950/95 to-blue-900/95 px-2 py-1.5 pr-4 shadow-lg transition-all hover:border-green-400/70"
        title="Spotify"
      >
        <span className="relative w-9 h-9 rounded-full bg-[#1DB954] flex items-center justify-center shrink-0">
          <Music2 className="w-5 h-5 text-blue-950" />
        </span>
        <span className="text-left leading-tight">
          <span className="block text-green-300 font-bold text-sm">Spotify</span>
          <span className="block text-blue-200 text-[11px]">Küçük pencerede dinle</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-green-300 transition-transform ${acik ? 'rotate-180' : ''}`} />
      </button>

      {/* Panel */}
      {acik && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-green-500/40 bg-blue-950 shadow-2xl z-50 overflow-hidden">
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
            <button type="submit" className="text-[11px] font-semibold bg-[#1DB954]/90 hover:bg-[#1DB954] text-blue-950 px-2.5 py-1.5 rounded-lg flex items-center gap-1">
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
                    onClick={() => spotifyPenceresiAc('https://open.spotify.com/search/' + encodeURIComponent(q))}
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
                onClick={() => spotifyPenceresiAc(l.url)}
                className="w-full flex items-center gap-2.5 px-3 py-2 border-b border-blue-900/40 last:border-0 hover:bg-blue-900/50 text-left transition-colors">
                <Music2 className="w-4 h-4 text-[#1DB954] shrink-0" />
                <span className="flex-1 text-sm text-gray-200 truncate">{l.ad}</span>
                <ExternalLink className="w-3.5 h-3.5 text-gray-600 shrink-0" />
              </button>
            ))}
          </div>

          <p className="px-3 py-2 text-[10px] text-gray-500 border-t border-blue-900/60 bg-blue-900/20">
            Spotify ayrı küçük pencerede açılır; MUBiS sayfasında gezinirken müzik kesilmez. Spotify üyeliği gerekir (ücretsiz üyelikle reklam aralıklı dinlenir).
          </p>
        </div>
      )}
    </div>
  )
}
