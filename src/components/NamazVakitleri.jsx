import { useEffect, useMemo, useRef, useState } from 'react'
import { MoonStar, MapPin } from 'lucide-react'

// 2.7.543: Namaz vakitleri / imsakiye — Aladhan API (method 13 = Diyanet Isleri).
// Normal mod: yaklasan namaz vakti + geri sayim, hover ile gunluk tum vakitler.
// Ramazan modu (hijri ay 9): iftar/sahur geri sayimi, cami silueti, "Hosgeldin Ramazan".

const VAKIT_AD = [
  ['Imsak', 'İmsak'],
  ['Fajr', 'Sabah'],
  ['Sunrise', 'Güneş'],
  ['Dhuhr', 'Öğle'],
  ['Asr', 'İkindi'],
  ['Maghrib', 'Akşam'],
  ['Isha', 'Yatsı'],
]
const NAMAZ_SIRA = ['Imsak', 'Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']

const ISTANBUL = { en: 41.0082, boy: 28.9784, sehir: 'İstanbul' }

function dakikaParset(s) {
  const m = /(\d{1,2}):(\d{2})/.exec(s || '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

function snBicimle(toplamSn) {
  const sn = Math.max(0, toplamSn)
  const h = Math.floor(sn / 3600)
  const d = Math.floor((sn % 3600) / 60)
  const s = sn % 60
  return `${String(h).padStart(2, '0')}:${String(d).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Cami silueti (minare + kubbe) — panelin alt bandi / Ramazan banneri
function CamiSilueti({ className = '' }) {
  return (
    <svg viewBox="0 0 200 60" className={className} aria-hidden="true" fill="currentColor">
      <rect x="16" y="20" width="6" height="40" />
      <path d="M16 20 L19 9 L22 20 Z" />
      <rect x="12" y="27" width="14" height="3" />
      <rect x="178" y="20" width="6" height="40" />
      <path d="M178 20 L181 9 L184 20 Z" />
      <rect x="174" y="27" width="14" height="3" />
      <path d="M68 60 C68 36 100 24 100 24 C100 24 132 36 132 60 Z" />
      <rect x="60" y="56" width="80" height="4" />
      <line x1="100" y1="24" x2="100" y2="14" />
      <circle cx="100" cy="12" r="2.4" />
    </svg>
  )
}

export default function NamazVakitleri({ className = '' }) {
  const [veri, setVeri] = useState(null) // { bugun, yarin, hijriAy, sehir }
  const [simdiSn, setSimdiSn] = useState(() => Math.floor(Date.now() / 1000))
  const [pariltiBitis, setPariltiBitis] = useState(0)
  const sonKonumRef = useRef(null)
  const gunRef = useRef(new Date().toDateString())

  // 2.7.542: vakti girince 20 sn yanip sonme (normal namaz vakitleri + iftar/sahur)
  useEffect(() => {
    if (!veri?.bugun?.timings) return
    const now = new Date()
    const dk = now.getHours() * 60 + now.getMinutes()
    const T = veri.bugun.timings
    const liste = [T.Imsak, T.Fajr, T.Dhuhr, T.Asr, T.Maghrib, T.Isha]
    const vaktiGirdi = liste.some(s => dakikaParset(s) === dk)
    if (vaktiGirdi) setPariltiBitis(b => (b > Date.now() ? b : Date.now() + 20000))
  }, [simdiSn, veri])

  // konum zinciri: onbellek -> geolocation -> IP -> Istanbul
  useEffect(() => {
    let iptal = false

    const cek = (en, boy, sehir) => {
      if (iptal) return
      sonKonumRef.current = { en, boy, sehir }
      gunRef.current = new Date().toDateString()
      const bugun = new Date()
      const yarin = new Date(bugun.getTime() + 86400000)
      const f = d => `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
      Promise.all([
        fetch(`https://api.aladhan.com/v1/timings/${f(bugun)}?latitude=${en}&longitude=${boy}&method=13`).then(r => r.json()),
        fetch(`https://api.aladhan.com/v1/timings/${f(yarin)}?latitude=${en}&longitude=${boy}&method=13`).then(r => r.json()),
      ])
        .then(([b, y]) => {
          if (iptal) return
          if (b?.data?.timings && y?.data?.timings) {
            setVeri({
              bugun: b.data,
              yarin: y.data,
              hijriAy: b.data?.date?.hijri?.month?.number,
              hijriGun: Number(b.data?.date?.hijri?.day) || 0,
              sehir
            })
          }
        })
        .catch(() => {})
    }

    const baslat = (en, boy, sehir) => {
      try { localStorage.setItem('mubis_konum_v1', JSON.stringify({ en, boy, sehir })) } catch (e) { /* yoksay */ }
      cek(en, boy, sehir)
    }

    const ipKonum = () => {
      fetch('https://ipapi.co/json/')
        .then(r => r.json())
        .then(j => {
          if (iptal) return
          if (j && j.latitude != null && j.longitude != null) baslat(j.latitude, j.longitude, j.city || j.region || 'İstanbul')
          else baslat(ISTANBUL.en, ISTANBUL.boy, ISTANBUL.sehir)
        })
        .catch(() => { if (!iptal) baslat(ISTANBUL.en, ISTANBUL.boy, ISTANBUL.sehir) })
    }

    let onbellek = null
    try { onbellek = JSON.parse(localStorage.getItem('mubis_konum_v1') || 'null') } catch (e) { onbellek = null }
    if (onbellek && onbellek.en != null) {
      cek(onbellek.en, onbellek.boy, onbellek.sehir)
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          if (iptal) return
          const { latitude, longitude } = pos.coords
          fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=tr`)
            .then(r => r.json())
            .then(j => { if (!iptal) baslat(latitude, longitude, j.city || j.locality || j.principalSubdivision || 'Konumum') })
            .catch(() => { if (!iptal) baslat(latitude, longitude, 'Konumum') })
        },
        () => { if (!iptal && !onbellek) ipKonum() },
        { timeout: 8000, maximumAge: 600000 }
      )
    } else if (!onbellek) {
      ipKonum()
    }

    // saniye tiki; gece yarisi gecince vakitleri yeniden cek
    const gun = setInterval(() => {
      setSimdiSn(Math.floor(Date.now() / 1000))
      const bugunStr = new Date().toDateString()
      if (bugunStr !== gunRef.current && sonKonumRef.current) {
        const { en, boy, sehir } = sonKonumRef.current
        cek(en, boy, sehir)
      }
    }, 1000)

    return () => { iptal = true; clearInterval(gun) }
  }, [])

  const hesap = useMemo(() => {
    if (!veri) return null
    const ramazan = veri.hijriAy === 9
    const now = new Date()
    const simdikiDk = now.getHours() * 60 + now.getMinutes()
    const bugunT = veri.bugun.timings
    const yarinT = veri.yarin.timings
    // tum hedefler epoch saniye (simdikiSn ile ayni referans)
    const geceYarisi = new Date(now); geceYarisi.setHours(0, 0, 0, 0)
    const gece = Math.floor(geceYarisi.getTime() / 1000)

    if (ramazan) {
      const aksam = dakikaParset(bugunT.Maghrib)
      if (aksam != null && simdikiDk < aksam) {
        return { ramazan, tip: 'iftar', hedefSn: gece + aksam * 60, ad: 'İftar', saat: bugunT.Maghrib }
      }
      const yarinImsak = dakikaParset(yarinT.Imsak)
      if (yarinImsak != null) {
        const yarinSifir = new Date(now); yarinSifir.setDate(yarinSifir.getDate() + 1); yarinSifir.setHours(0, 0, 0, 0)
        return { ramazan, tip: 'sahur', hedefSn: Math.floor(yarinSifir.getTime() / 1000) + yarinImsak * 60, ad: 'Sahur', saat: yarinT.Imsak }
      }
    }

    for (const k of NAMAZ_SIRA) {
      const dk = dakikaParset(bugunT[k])
      if (dk != null && simdikiDk < dk) {
        const ad = (VAKIT_AD.find(v => v[0] === k) || [k, k])[1]
        return { ramazan, tip: 'namaz', hedefSn: gece + dk * 60, ad, saat: bugunT[k], kalanDk: dk - simdikiDk }
      }
    }
    const yarinImsak = dakikaParset(yarinT.Imsak)
    if (yarinImsak != null) {
      const yarinSifir = new Date(now); yarinSifir.setDate(yarinSifir.getDate() + 1); yarinSifir.setHours(0, 0, 0, 0)
      return { ramazan, tip: 'namaz', hedefSn: Math.floor(yarinSifir.getTime() / 1000) + yarinImsak * 60, ad: 'İmsak', saat: yarinT.Imsak, yarin: true, kalanDk: 1440 - simdikiDk + yarinImsak }
    }
    return { ramazan, tip: 'namaz', hedefSn: null, ad: '—', saat: '--:--' }
  }, [veri, simdiSn])

  if (!veri || !hesap) {
    return (
      <div className={`flex items-center gap-2 bg-blue-900/40 border border-blue-700/40 rounded-xl px-3 py-2 shrink-0 ${className}`}>
        <MoonStar className="w-6 h-6 text-emerald-300/60" aria-hidden="true" />
        <div className="text-gray-400 text-xs whitespace-nowrap">Namaz vakitleri alınıyor…</div>
      </div>
    )
  }

  const kalanSn = hesap.hedefSn != null ? Math.max(0, hesap.hedefSn - simdiSn) : null
  const parildiyor = Date.now() < pariltiBitis
  const baslik = hesap.ramazan
    ? (hesap.tip === 'iftar' ? 'İftar' : 'Sahur')
    : `${hesap.ad}${hesap.yarin ? ' (yarın)' : ''}`
  const saatMetni = hesap.ramazan
    ? (hesap.tip === 'iftar' ? veri.bugun.timings.Maghrib : veri.yarin.timings.Imsak)
    : hesap.saat

  return (
    <div className={`relative group shrink-0 ${className}`}>
      {/* Kucuk kutu: yaklasan vakit + geri sayim (vakti girince 20 sn yanip soner) */}
      <div className={`flex items-center gap-2.5 rounded-xl px-3 py-2 transition-colors cursor-default border ${
        parildiyor
          ? 'bg-emerald-500/25 border-emerald-400 ring-2 ring-emerald-400/60 animate-pulse'
          : 'bg-blue-900/40 border-blue-700/40 hover:border-emerald-500/40'
      }`}>
        <MoonStar className={`w-6 h-6 ${parildiyor ? 'text-emerald-200' : 'text-emerald-300'}`} aria-hidden="true" />
        <div className="text-left leading-tight">
          <div className="text-white font-semibold text-sm whitespace-nowrap">
            {baslik} <span className="tabular-nums">{saatMetni}</span>
          </div>
          {kalanSn != null && (
            <div className="text-gray-400 text-xs tabular-nums">
              {hesap.ramazan ? `${hesap.ad}a ` : ''}{snBicimle(kalanSn)}
            </div>
          )}
          {hesap.ramazan && veri.hijriGun > 0 && (
            <div className="text-amber-300/90 text-xs whitespace-nowrap">Ramazan'ın {veri.hijriGun}. günü</div>
          )}
        </div>
      </div>

      {/* Hover: gunluk imsakiye paneli */}
      <div className="absolute right-0 top-full mt-2 w-72 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 pointer-events-none group-hover:pointer-events-auto">
        <div className="relative overflow-hidden bg-blue-950 border border-blue-700/50 rounded-xl shadow-2xl p-4 pb-8">
          {/* Ramazan banneri: minareler arasinda "Hosgeldin Ramazan" */}
          {hesap.ramazan && (
            <div className="flex items-end justify-center gap-1 mb-2 text-emerald-400/50">
              <CamiSilueti className="w-10 h-8" />
              <span className="pb-1 text-sm font-bold bg-gradient-to-r from-emerald-300 via-teal-200 to-emerald-300 bg-clip-text text-transparent animate-pulse whitespace-nowrap">
                ✨ Hoşgeldin Ramazan ✨
              </span>
              <CamiSilueti className="w-10 h-8 -scale-x-100" />
            </div>
          )}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5 text-emerald-300 text-sm font-semibold">
              <MapPin className="w-3.5 h-3.5" /> {veri.sehir}
            </div>
            <div className="text-gray-400 text-xs">
              {new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
          <div className="space-y-1">
            {VAKIT_AD.map(([k, ad]) => (
              <div key={k} className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-sm ${
                hesap.ramazan && k === 'Imsak' ? 'bg-teal-500/15 text-teal-200 font-semibold'
                : hesap.ramazan && k === 'Maghrib' ? 'bg-amber-500/15 text-amber-200 font-semibold'
                : 'bg-blue-900/30 text-gray-200'
              }`}>
                <span>{ad}</span>
                <span className="tabular-nums font-medium">{veri.bugun.timings[k]}</span>
              </div>
            ))}
          </div>
          {hesap.ramazan && (
            <div className="mt-2 flex items-center justify-between text-xs px-3 text-gray-400">
              <span>İftar: {veri.bugun.timings.Maghrib}</span>
              <span>Sahur (yarın): {veri.yarin.timings.Imsak}</span>
            </div>
          )}
          {/* Arka plan cami silueti */}
          <CamiSilueti className="absolute bottom-0 left-1/2 -translate-x-1/2 w-56 h-16 text-blue-700/25 pointer-events-none" />
        </div>
      </div>
    </div>
  )
}
