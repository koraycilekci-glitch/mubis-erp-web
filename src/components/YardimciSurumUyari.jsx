// Yardimci program surum kontrolu:
// - Calisan yardimcinin surumu (/ping) ile sitede yayinlanan guncel surum
//   (/downloads/helper-surum.json) karsilastirilir.
// - Eski surum saptanirsa sari banner gosterilir + yardimciya
//   POST /guncelleme-uyari gonderilir (Windows masaustu bildirimi).
// - Yardimci kapaliysa veya surumler esitse hicbir sey gostermez.
import { useState, useEffect } from 'react'
import { AlertTriangle, X, Download, Loader2, CheckCircle2 } from 'lucide-react'
import { gibYerelYardimciSurumu, gibYardimciGuncellemeUyari, gibYardimciGuncelleBaslat } from '../utils/gibOdemeHelper'
import { YARDIMCI_EXE_URL } from '../config/indirmeLinkleri'

// '2.10.0' > '2.9.0' dogru sekilde kiyaslayan basit semver kiyasi
function surumKiyasla(a, b) {
  const pa = String(a || '').split('.').map(n => parseInt(n) || 0)
  const pb = String(b || '').split('.').map(n => parseInt(n) || 0)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1
    if ((pa[i] || 0) < (pb[i] || 0)) return -1
  }
  return 0
}

const OTURUM_ANAHTARI = 'mubis_yardimci_uyari_gosterildi'

export default function YardimciSurumUyari() {
  const [guncellemeVar, setGuncellemeVar] = useState(false)
  const [yeniSurum, setYeniSurum] = useState('')
  const [notlar, setNotlar] = useState([])
  const [kapatildi, setKapatildi] = useState(() => sessionStorage.getItem(OTURUM_ANAHTARI) === '1')
  const [guncellemeDurumu, setGuncellemeDurumu] = useState('hazir')

  const guncelleTikla = async (e) => {
    e.preventDefault()
    if (guncellemeDurumu === 'calisiyor' || guncellemeDurumu === 'dogrulaniyor') return
    setGuncellemeDurumu('calisiyor')
    const r = await gibYardimciGuncelleBaslat()
    if (r.ok) {
      setGuncellemeDurumu('dogrulaniyor')
      sessionStorage.removeItem(OTURUM_ANAHTARI)
    } else {
      window.location.href = YARDIMCI_EXE_URL
      setGuncellemeDurumu('hazir')
    }
  }

  useEffect(() => {
    if (guncellemeDurumu !== 'dogrulaniyor' || !yeniSurum) return
    let iptal = false
    const baslangic = Date.now()
    const kontrol = async () => {
      const surum = await gibYerelYardimciSurumu()
      if (iptal) return
      if (surum && surumKiyasla(surum, yeniSurum) >= 0) {
        setGuncellemeDurumu('tamam')
      } else if (Date.now() - baslangic >= 240000) {
        setGuncellemeDurumu('dogrulanamadi')
      }
    }
    kontrol()
    const zamanlayici = setInterval(kontrol, 5000)
    return () => { iptal = true; clearInterval(zamanlayici) }
  }, [guncellemeDurumu, yeniSurum])

  useEffect(() => {
    let iptal = false
    ;(async () => {
      try {
        const [surum, res] = await Promise.all([
          gibYerelYardimciSurumu(),
          // Cache-buster: tarayici eski surum dosyasini onbellekten getirmesin
          fetch('/downloads/helper-surum.json?t=' + Date.now(), { signal: AbortSignal.timeout(5000) })
            .then(r => (r.ok ? r.json() : null))
            .catch(() => null)
        ])
        // Yardimci calismiyor veya surum dosyasi yoksa uyarma
        if (iptal || !surum || !res?.surum) return
        if (surumKiyasla(res.surum, surum) > 0) {
          setYeniSurum(res.surum)
          setNotlar(Array.isArray(res.notlar) ? res.notlar : [])
          setGuncellemeVar(true)
          // Windows masaustu bildirimi (yardimciya iletilir; her oturumda 1 kez)
          if (sessionStorage.getItem(OTURUM_ANAHTARI + '_bildirim') !== '1') {
            sessionStorage.setItem(OTURUM_ANAHTARI + '_bildirim', '1')
            gibYardimciGuncellemeUyari()
          }
        }
      } catch { /* yoksay - uyari kritik degil */ }
    })()
    // Yardimci acilisi gec olabilir / oturum ortasinda guncelleme yayinlanabilir:
    // 60 sn'de bir yeniden kontrol et
    const periyodik = setInterval(() => {
      ;(async () => {
        try {
          const [surum, res] = await Promise.all([
            gibYerelYardimciSurumu(),
            fetch('/downloads/helper-surum.json?t=' + Date.now(), { signal: AbortSignal.timeout(5000) })
              .then(r => (r.ok ? r.json() : null))
              .catch(() => null)
          ])
          if (surum && res?.surum && surumKiyasla(res.surum, surum) > 0) {
            setYeniSurum(res.surum)
            setNotlar(Array.isArray(res.notlar) ? res.notlar : [])
            setGuncellemeVar(true)
            if (sessionStorage.getItem(OTURUM_ANAHTARI + '_bildirim') !== '1') {
              sessionStorage.setItem(OTURUM_ANAHTARI + '_bildirim', '1')
              gibYardimciGuncellemeUyari()
            }
          }
        } catch { /* yoksay */ }
      })()
    }, 60000)
    return () => { iptal = true; clearInterval(periyodik) }
  }, [])

  if (!guncellemeVar || kapatildi) return null

  const kapat = () => {
    sessionStorage.setItem(OTURUM_ANAHTARI, '1')
    setKapatildi(true)
  }

  return (
    <div className="relative group mx-4 lg:mx-8 mt-3 bg-yellow-500/10 border border-yellow-500/40 rounded-xl px-4 py-3 flex items-center gap-3">
      <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0" />
      <span className="text-yellow-200 text-sm flex-1">
        {guncellemeDurumu === 'dogrulanamadi'
          ? 'Güncelleme doğrulanamadı. Yardımcıyı kontrol edip yeniden deneyin.'
          : guncellemeDurumu === 'tamam'
            ? 'MUBİS Yardımcı Programı güncel.'
            : 'MUBİS Yardımcı Programı için yeni güncelleme mevcut.'}
        {notlar.length > 0 && <span className="text-yellow-300/70 text-xs ml-1.5 underline decoration-dotted underline-offset-2">Yenilikler için üzerine gelin</span>}
      </span>
      {guncellemeDurumu === 'tamam' ? (
        <span className="flex items-center gap-1.5 bg-emerald-500/20 text-emerald-300 text-sm font-medium px-3 py-1.5 rounded-lg shrink-0">
          <CheckCircle2 className="w-4 h-4" />
          Güncelleme doğrulandı
        </span>
      ) : (
        <a
          href={YARDIMCI_EXE_URL}
          download
          onClick={guncelleTikla}
          title={yeniSurum ? `Güncel sürüm: ${yeniSurum}` : 'Güncelle'}
          className={`flex items-center gap-1.5 text-blue-950 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0 ${guncellemeDurumu === 'calisiyor' || guncellemeDurumu === 'dogrulaniyor' ? 'bg-yellow-500/60 cursor-wait' : 'bg-yellow-500 hover:bg-yellow-400'}`}
        >
          {guncellemeDurumu === 'calisiyor' || guncellemeDurumu === 'dogrulaniyor' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {guncellemeDurumu === 'calisiyor' || guncellemeDurumu === 'dogrulaniyor' ? 'Güncelleme doğrulanıyor...' : <>Güncelle {yeniSurum && <span className="text-[11px] font-semibold opacity-80">({yeniSurum})</span>}</>}
        </a>
      )}
      <button onClick={kapat} title="Kapat" className="text-yellow-300/60 hover:text-yellow-200 shrink-0">
        <X className="w-4 h-4" />
      </button>
      {notlar.length > 0 && (
        <div className="absolute left-8 right-8 lg:left-16 lg:right-auto lg:w-[520px] top-full mt-2 hidden group-hover:block z-50 bg-blue-950 border border-yellow-500/40 rounded-xl p-3.5 shadow-2xl shadow-black/50">
          <div className="text-xs font-semibold text-yellow-400 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Sürüm {yeniSurum} yenilikleri
          </div>
          <ul className="space-y-1.5 text-xs text-gray-200 leading-relaxed">
            {notlar.map((n, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-yellow-500/70 mt-0.5 shrink-0">•</span>
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
