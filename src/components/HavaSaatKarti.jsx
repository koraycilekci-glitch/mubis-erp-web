import { useEffect, useState } from 'react'
import {
  Sun, Moon, CloudSun, CloudMoon, Cloud, CloudFog,
  CloudDrizzle, CloudRain, CloudSnow, CloudLightning
} from 'lucide-react'

// 2.7.543: open-meteo weather_code -> lucide ikon + Turkce etiket
function havaIkonu(kod, gunduz) {
  if (kod === 0) return gunduz ? { I: Sun, etiket: 'Açık' } : { I: Moon, etiket: 'Açık' }
  if (kod === 1 || kod === 2) return gunduz ? { I: CloudSun, etiket: 'Az bulutlu' } : { I: CloudMoon, etiket: 'Az bulutlu' }
  if (kod === 3) return { I: Cloud, etiket: 'Kapalı' }
  if (kod === 45 || kod === 48) return { I: CloudFog, etiket: 'Puslu' }
  if (kod >= 51 && kod <= 57) return { I: CloudDrizzle, etiket: 'Çisenti' }
  if ((kod >= 61 && kod <= 67) || (kod >= 80 && kod <= 82)) return { I: CloudRain, etiket: 'Yağmurlu' }
  if ((kod >= 71 && kod <= 77) || kod === 85 || kod === 86) return { I: CloudSnow, etiket: 'Karlı' }
  if (kod >= 95) return { I: CloudLightning, etiket: 'Sağanak' }
  return gunduz ? { I: Sun, etiket: 'Açık' } : { I: Moon, etiket: 'Açık' }
}

const ISTANBUL = { enlem: 41.0082, boylam: 28.9784, sehir: 'İstanbul' }

/**
 * HavaSaatKarti — saat + tarih + hava durumu (2.7.543)
 * Konum zinciri: tarayıcı konum izni (geolocation) -> IP (ipapi.co) -> İstanbul.
 * Hava: open-meteo (weather_code, is_day, temperature_2m), saat başı yenilenir.
 * Şehir adı: bigdatacloud reverse geocode (ücretsiz, anahtarsız).
 */
export default function HavaSaatKarti({ className = '' }) {
  const [simdi, setSimdi] = useState(() => new Date())
  const [hava, setHava] = useState(null)

  // saat/dakika tik
  useEffect(() => {
    const t = setInterval(() => setSimdi(new Date()), 10000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let iptal = false
    let havaAralik = null

    const havaGetir = (enlem, boylam, sehir) => {
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${enlem}&longitude=${boylam}&current=temperature_2m,weather_code,is_day`)
        .then(r => r.json())
        .then(j => {
          if (!iptal && j?.current) {
            setHava({
              sicaklik: Math.round(j.current.temperature_2m),
              kod: j.current.weather_code ?? 0,
              gunduz: !!j.current.is_day,
              sehir
            })
          }
        })
        .catch(() => {})
    }

    const baslat = (enlem, boylam, sehir) => {
      if (iptal) return
      havaGetir(enlem, boylam, sehir)
      havaAralik = setInterval(() => havaGetir(enlem, boylam, sehir), 3600000)
    }

    const ipKonum = () => {
      fetch('https://ipapi.co/json/')
        .then(r => r.json())
        .then(j => {
          if (iptal) return
          if (j && j.latitude != null && j.longitude != null) {
            baslat(j.latitude, j.longitude, j.city || j.region || 'İstanbul')
          } else {
            baslat(ISTANBUL.enlem, ISTANBUL.boylam, ISTANBUL.sehir)
          }
        })
        .catch(() => { if (!iptal) baslat(ISTANBUL.enlem, ISTANBUL.boylam, ISTANBUL.sehir) })
    }

    // once tarayici konum izni; reddedilirse/hata ise IP'ye dus
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          if (iptal) return
          const { latitude, longitude } = pos.coords
          fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=tr`)
            .then(r => r.json())
            .then(j => {
              if (iptal) return
              baslat(latitude, longitude, j.locality || j.city || j.principalSubdivision || 'Konumum')
            })
            .catch(() => { if (!iptal) baslat(latitude, longitude, 'Konumum') })
        },
        () => { if (!iptal) ipKonum() },
        { timeout: 8000, maximumAge: 600000 }
      )
    } else {
      ipKonum()
    }

    return () => {
      iptal = true
      if (havaAralik) clearInterval(havaAralik)
    }
  }, [])

  const { I: Ikon, etiket } = havaIkonu(hava?.kod ?? 0, hava?.gunduz ?? true)

  return (
    <div className={`flex items-center gap-5 shrink-0 ${className}`}>
      <div className="text-right">
        <div className="text-gray-300 text-sm">
          {simdi.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
        <div className="text-3xl font-bold text-white tabular-nums leading-tight">
          {simdi.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <Ikon className={`w-8 h-8 ${hava?.gunduz ? 'text-yellow-300' : 'text-blue-300'}`} aria-hidden="true" />
        <div>
          <div className="text-white font-semibold text-lg leading-tight">
            {hava && hava.sicaklik != null ? `${hava.sicaklik}°C` : '--°C'}
          </div>
          <div className="text-gray-400 text-xs leading-tight">
            {hava?.sehir ? `${hava.sehir} · ${etiket}` : 'Hava alınıyor…'}
          </div>
        </div>
      </div>
    </div>
  )
}
