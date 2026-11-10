// Web Radyo — admin ust bandi rozeti (MFatura rozeti tasariminda).
// Acilir listede kayitli istasyonlar; yildizli favoriler en ustte,
// ses ayari + ac/kapa dugmesi. Ayarlar > Ana Ekran Asistani'ndan acilir.
// Ses oynaticisi modul seviyesinde tekil tutulur; sayfa ici gezinmede
// yayin kesilmez (sayfa yenilenince durur).
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import Hls from 'hls.js'
import { Radio, ChevronDown, Star, Play, Square, Volume2, AlertTriangle } from 'lucide-react'

// ===== Istasyon listesi: Turkiye (yerli + yabanci muzik yayini yapan) ve dunya =====
const ISTASYONLAR = [
  // Turkiye (TRT yayinlari: rd-*.medya.trt.com.tr — eski radio-*.live hostlari 404 veriyor)
  { id: 'trt-fm', ad: 'TRT FM', tur: 'Türkçe Pop', grup: 'Türkiye', stream: 'https://rd-trtfm.medya.trt.com.tr/master.m3u8', hls: true },
  { id: 'trt-radyo1', ad: 'TRT Radyo 1', tur: 'Haber / Kültür', grup: 'Türkiye', stream: 'https://rd-trtradyo1.medya.trt.com.tr/master.m3u8', hls: true },
  { id: 'trt-radyo3', ad: 'TRT Radyo 3', tur: 'Klasik / Caz', grup: 'Türkiye', stream: 'https://rd-trtradyo3.medya.trt.com.tr/master.m3u8', hls: true },
  // 2.7.573: TRT Radyo Haber'in resmi HLS kaynagi donmus (ENDLIST) — AAC yedegine gecildi.
  // Kral Pop / Radyo Viva HLS'i tarayicida audio onerror ile cokuyor; AAC (shoutcast) yayinlar sorunsuz.
  { id: 'trt-haber', ad: 'TRT Radyo Haber', tur: 'Haber', grup: 'Türkiye', stream: 'https://trt.radyotvonline.net/trthaber' },
  { id: 'trt-nagme', ad: 'TRT Nağme', tur: 'TSMSM', grup: 'Türkiye', stream: 'https://rd-trtnagme.medya.trt.com.tr/master.m3u8', hls: true },
  { id: 'trt-turku', ad: 'TRT Türkü', tur: 'Türk Halk Müziği', grup: 'Türkiye', stream: 'https://rd-trtturku.medya.trt.com.tr/master.m3u8', hls: true },
  { id: 'power-fm', ad: 'Power FM', tur: 'Yabancı Pop / Rock', grup: 'Türkiye', stream: 'https://listen.powerapp.com.tr/powerfm/mpeg/icecast.audio' },
  { id: 'powerturk', ad: 'PowerTürk', tur: 'Türkçe Pop', grup: 'Türkiye', stream: 'https://listen.powerapp.com.tr/powerturk/mpeg/icecast.audio' },
  { id: 'power-love', ad: 'Power Love', tur: 'Yavaş / Romantik', grup: 'Türkiye', stream: 'https://listen.powerapp.com.tr/powerlove/mpeg/icecast.audio' },
  { id: 'fenomen', ad: 'Radyo Fenomen', tur: 'Yabancı Hit', grup: 'Türkiye', stream: 'https://live.radyofenomen.com/fenomen/256/chunks.m3u8', hls: true },
  { id: 'fenomen-turk', ad: 'Fenomen Türk', tur: 'Türkçe Hit', grup: 'Türkiye', stream: 'https://live.radyofenomen.com/fenomenturk/256/chunks.m3u8', hls: true },
  { id: 'slow-turk', ad: 'Slow Türk', tur: 'Türkçe Yavaş', grup: 'Türkiye', stream: 'https://radyo.duhnet.tv/slowturk' },
  { id: 'super-fm', ad: 'Süper FM', tur: 'Yabancı Hit', grup: 'Türkiye', stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/SUPER_FM.mp3' },
  { id: 'kral-fm', ad: 'Kral FM', tur: 'Türkçe Pop', grup: 'Türkiye', stream: 'https://dygedge2.radyotvonline.net/kralfm/playlist.m3u8', hls: true },
  { id: 'kral-pop', ad: 'Kral Pop', tur: 'Türkçe Pop', grup: 'Türkiye', stream: 'https://kralpop.radyotvonline.net/kralpopaac' },
  { id: 'radyo-viva', ad: 'Radyo Viva', tur: 'Türkçe Pop', grup: 'Türkiye', stream: 'https://radyoviva.radyotvonline.net/radyovivaaac' },
  { id: 'joy-turk', ad: 'Joy Türk', tur: 'Türkçe Akustik', grup: 'Türkiye', stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/JOY_TURK.mp3' },
  { id: 'joy-fm', ad: 'Joy FM', tur: 'Yabancı Yavaş', grup: 'Türkiye', stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/JOY_FM.mp3' },
  // Dunya
  { id: 'swiss-pop', ad: 'Radio Swiss Pop', tur: 'Pop', grup: 'Dünya', stream: 'https://stream.srg-ssr.ch/m/rsp/mp3_128' },
  { id: 'fip-hiphop', ad: 'FIP Hip-Hop', tur: 'Hip-Hop / Groove', grup: 'Dünya', stream: 'https://icecast.radiofrance.fr/fiphiphop-midfi.mp3' },
  { id: 'paradise', ad: 'Radio Paradise', tur: 'Eclectic Rock', grup: 'Dünya', stream: 'https://stream.radioparadise.com/mp3-192' },
  { id: 'paradise-rock', ad: 'Radio Paradise Rock', tur: 'Rock', grup: 'Dünya', stream: 'https://stream.radioparadise.com/rock-128' },
  { id: 'classic-fm', ad: 'Classic FM (UK)', tur: 'Klasik Batı Müziği', grup: 'Dünya', stream: 'https://media-ssl.musicradio.com/ClassicFMMP3' },
  { id: 'swiss-jazz', ad: 'Radio Swiss Jazz', tur: 'Caz', grup: 'Dünya', stream: 'https://stream.srg-ssr.ch/m/rsj/mp3_128' },
  { id: 'swiss-classic', ad: 'Radio Swiss Classic', tur: 'Klasik', grup: 'Dünya', stream: 'https://stream.srg-ssr.ch/m/rsc_de/mp3_128' },
  // 2.7.573: KEXP kaldirildi — tum resmi yayin adresleri (streamguys AAC + HLS) 502/hatali.
  { id: 'fip', ad: 'FIP (Fransa)', tur: 'Eclectic', grup: 'Dünya', stream: 'https://icecast.radiofrance.fr/fip-midfi.mp3' },
  { id: 'fip-jazz', ad: 'FIP Jazz', tur: 'Caz', grup: 'Dünya', stream: 'https://icecast.radiofrance.fr/fipjazz-midfi.mp3' }
]

const FAV_KEY = 'admin_radio_fav_v1'
const VOL_KEY = 'admin_radio_vol_v1'

// Tekil ses oynaticisi — komponent unmount olsa da calismaya devam eder
let audioEl = null
let hlsRef = null
function sesGetir() {
  if (!audioEl) {
    audioEl = new Audio()
    audioEl.preload = 'none'
  }
  return audioEl
}
function yayiniKes() {
  if (hlsRef) { try { hlsRef.destroy() } catch (_) {} hlsRef = null }
  if (audioEl) {
    audioEl.pause()
    audioEl.removeAttribute('src')
    audioEl.load()
  }
}

export default function RadioUstBant() {
  const [acik, setAcik] = useState(false)
  const [favoriler, setFavoriler] = useState(() => {
    try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]') } catch (_) { return [] }
  })
  const [ses, setSes] = useState(() => {
    const v = Number(localStorage.getItem(VOL_KEY))
    return Number.isFinite(v) && v > 0 ? v : 60
  })
  const [calan, setCalan] = useState(null) // id
  const [basliyor, setBasliyor] = useState(false)
  const [hata, setHata] = useState(null)
  const panelRef = useRef(null)
  const sesRef = useRef(ses)

  useEffect(() => { sesRef.current = ses }, [ses])

  // Disari tiklayinca panel kapanir (yayin surer)
  useEffect(() => {
    if (!acik) return
    const tik = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setAcik(false)
    }
    document.addEventListener('mousedown', tik)
    return () => document.removeEventListener('mousedown', tik)
  }, [acik])

  // Ses seviyesini canli uygula
  useEffect(() => {
    if (audioEl) audioEl.volume = Math.min(1, Math.max(0, ses / 100))
    localStorage.setItem(VOL_KEY, String(ses))
  }, [ses])

  const sirali = useMemo(() => {
    const favSet = new Set(favoriler)
    const fav = ISTASYONLAR.filter(s => favSet.has(s.id))
    const diger = ISTASYONLAR.filter(s => !favSet.has(s.id))
    return [...fav, ...diger]
  }, [favoriler])

  const calanIstasyon = useMemo(() => ISTASYONLAR.find(s => s.id === calan) || null, [calan])
  // Kapat'a basildiktan sonra tekrar acilabilmesi icin son istasyonu hatirla
  const [sonCalan, setSonCalan] = useState(null)

  function yayinKapat() {
    yayiniKes()
    setCalan(null)
    setHata(null)
  }

  // Rozetteki sari yuvarlak dugme: kapaliyken son istasyonu acar,
  // acikken yayini durdurur.
  function rozetDugmeTikla(e) {
    e.stopPropagation()
    if (calan) { yayinKapat(); return }
    const son = ISTASYONLAR.find(s => s.id === sonCalan) || sirali[0]
    if (son) cal(son)
  }

  function favoriDegistir(id) {
    setFavoriler(prev => {
      const yeni = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      localStorage.setItem(FAV_KEY, JSON.stringify(yeni))
      return yeni
    })
  }

  const cal = useCallback((istasyon) => {
    // Ayni istasyona basilirsa durdur
    if (calan === istasyon.id) { yayiniKes(); setCalan(null); setHata(null); return }
    yayiniKes()
    setHata(null)
    setCalan(istasyon.id)
    setSonCalan(istasyon.id)
    setBasliyor(true)
    const a = sesGetir()
    a.volume = Math.min(1, Math.max(0, sesRef.current / 100))
    let hlsNative = false
    if (istasyon.hls) {
      if (a.canPlayType('application/vnd.apple.mpegurl')) {
        hlsNative = true
        a.src = istasyon.stream
      } else if (Hls.isSupported()) {
        let agDenemesi = 0
        hlsRef = new Hls({ enableWorker: true, lowLatencyMode: false })
        hlsRef.loadSource(istasyon.stream)
        hlsRef.attachMedia(a)
        // Manifest hazirlaninca cal (erken play() bazi tarayicilarda sessizce dusuyor)
        hlsRef.on(Hls.Events.MANIFEST_PARSED, () => {
          a.play().then(() => setBasliyor(false)).catch(() => {
            setTimeout(() => setBasliyor(false), 4000)
          })
        })
        hlsRef.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal) return
          // Gecici ag kesintilerinde yeniden baglan
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && agDenemesi < 3) {
            agDenemesi++
            setTimeout(() => { try { hlsRef && hlsRef.startLoad() } catch (_) {} }, 800 * agDenemesi)
            return
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && agDenemesi < 3) {
            agDenemesi++
            try { hlsRef.recoverMediaError() } catch (_) {}
            return
          }
          setHata(istasyon.id)
          setBasliyor(false)
        })
      } else {
        setHata(istasyon.id); setBasliyor(false); setCalan(null)
        return
      }
    } else {
      a.src = istasyon.stream
    }
    if (!istasyon.hls || hlsNative) {
      a.play().then(() => setBasliyor(false)).catch(() => {
        setTimeout(() => { setBasliyor(false) }, 4000)
      })
    }
    a.onerror = () => { setHata(istasyon.id); setBasliyor(false) }
    // Onceki onerror'u ezme amacli: her cal'da taze atanir
  }, [calan])

  // Komponent unmount olursa da yayin surer (audioEl modul seviyesinde);
  // sadece panel disi tiklamada panel kapanir.
  const calanAd = calanIstasyon ? calanIstasyon.ad : ''

  return (
    <div className="relative" ref={panelRef}>
      {/* Rozet — MFatura rozeti tasariminda */}
      <button
        onClick={() => setAcik(a => !a)}
        className={`flex items-center gap-3 rounded-full border px-2 py-1.5 pr-4 shadow-lg transition-all ${
          calan ? 'border-yellow-400/60 bg-gradient-to-r from-blue-950 to-blue-900'
            : 'border-blue-600/50 bg-gradient-to-r from-blue-950/95 to-blue-900/95 hover:border-blue-500/70'
        }`}
        title="Web Radyo"
      >
        {/* Sari yuvarlak: ac/kapa dugmesi — acikken parlak, kapaliyken soluk */}
        <button
          onClick={rozetDugmeTikla}
          title={calan ? 'Radyoyu kapat' : 'Radyoyu aç'}
          className={`relative w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
            calan
              ? 'bg-yellow-400 hover:bg-yellow-300 shadow-[0_0_10px_rgba(250,204,21,0.5)]'
              : 'bg-yellow-700/40 hover:bg-yellow-600/50'
          }`}
        >
          <Radio className={`w-5 h-5 ${calan ? 'text-blue-950' : 'text-yellow-200/70'} ${calan && !basliyor ? 'animate-pulse' : ''}`} />
        </button>
        <span className="text-left leading-tight">
          <span className="block text-yellow-300 font-bold text-sm">Web Radyo</span>
          <span className="block text-blue-200 text-[11px] max-w-[140px] truncate">
            {basliyor ? 'Bağlanıyor…' : calan ? `♪ ${calanAd}` : 'Dinlemek için tıklayın'}
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 text-yellow-400 transition-transform ${acik ? 'rotate-180' : ''}`} />
      </button>

      {/* Acilir panel */}
      {acik && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-blue-700/50 bg-blue-950 shadow-2xl z-50 overflow-hidden">
          {/* Ust bar: ses + kapat */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-blue-800/60 bg-blue-900/40">
            <Volume2 className="w-4 h-4 text-blue-300 shrink-0" />
            <input
              type="range" min="0" max="100" value={ses}
              onChange={e => setSes(Number(e.target.value))}
              className="flex-1 h-1.5 accent-yellow-400"
              title="Ses ayarı"
            />
            <span className="text-[10px] text-blue-300 w-7 text-right font-mono">{ses}%</span>
            <button
              onClick={() => { calan ? yayinKapat() : (sonCalan ? cal(ISTASYONLAR.find(s => s.id === sonCalan)) : null) }}
              disabled={!calan && !sonCalan}
              className={`ml-1 flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${
                calan ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
                  : sonCalan ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                  : 'bg-blue-900/40 text-gray-600 cursor-not-allowed'
              }`}
              title={calan ? 'Yayını kapat' : 'Yayını tekrar aç'}
            >
              {calan ? <><Square className="w-3 h-3" /> Kapat</> : <><Play className="w-3 h-3" /> Aç</>}
            </button>
          </div>

          {hata && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 text-red-300 text-[11px] border-b border-red-500/20">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Yayın alınamadı — başka bir istasyon deneyin.
            </div>
          )}

          {/* Istasyon listesi */}
          <div className="max-h-72 overflow-y-auto">
            {sirali.map(s => {
              const fav = favoriler.includes(s.id)
              const aktif = calan === s.id
              return (
                <div
                  key={s.id}
                  className={`group flex items-center gap-2 px-3 py-2 border-b border-blue-900/40 last:border-0 cursor-pointer transition-colors ${
                    aktif ? 'bg-yellow-400/10' : 'hover:bg-blue-900/50'
                  }`}
                  onClick={() => cal(s)}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); favoriDegistir(s.id) }}
                    className="shrink-0 p-0.5"
                    title={fav ? 'Favoriden çıkar' : 'Favorilere ekle'}
                  >
                    <Star className={`w-4 h-4 transition-colors ${fav ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600 group-hover:text-gray-400'}`} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate ${aktif ? 'text-yellow-300' : 'text-gray-200'}`}>{s.ad}</div>
                    <div className="text-[10px] text-gray-500 truncate">{s.tur} · {s.grup}</div>
                  </div>
                  {aktif && (basliyor
                    ? <span className="text-[10px] text-blue-300 shrink-0">bağlanıyor…</span>
                    : <span className="flex items-end gap-[2px] h-3 shrink-0" title="Çalıyor">
                        <span className="w-[3px] h-2 bg-yellow-400 animate-[radioEq_0.8s_ease-in-out_infinite]" />
                        <span className="w-[3px] h-3 bg-yellow-400 animate-[radioEq_0.8s_ease-in-out_0.2s_infinite]" />
                        <span className="w-[3px] h-1.5 bg-yellow-400 animate-[radioEq_0.8s_ease-in-out_0.4s_infinite]" />
                      </span>)}
                  {!aktif && <Play className="w-3.5 h-3.5 text-gray-600 group-hover:text-blue-300 shrink-0" />}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
