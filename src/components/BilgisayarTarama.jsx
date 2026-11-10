import { useCallback, useEffect, useState } from 'react'
import { ScanLine, Upload, FolderPlus, RefreshCw, CheckCircle2, AlertTriangle, Download } from 'lucide-react'
import { fisYukle } from '../services/taramaService'
import { supabase } from '../lib/supabase'

// MubisTarama.exe köprüsü: exe 8770 portunda mini sunucu açar.
// Fi-6130 taramaları G:\Drive'ım\EDEFTER\_TARAMA_GIRIS'e düşer, exe bunları
// <müşteri>/<yıl>/<ay>/giden/zraporu veya .../gelen/giderfişi klasörüne taşır.
// Bu panel aynı seçimlerle klasördeki dosyaları listeler ve MUBiS'e yükler.

const YARDIMCI = 'http://127.0.0.1:8770'
const YUKLENEN_KEY = 'mubis_klasor_yuklenen'

function yuklenenOku() {
  try { return JSON.parse(localStorage.getItem(YUKLENEN_KEY) || '{}') } catch { return {} }
}
function yuklenenIsaretle(hedef, ad, mtime) {
  const g = yuklenenOku()
  g[`${hedef}|${ad}`] = mtime
  try { localStorage.setItem(YUKLENEN_KEY, JSON.stringify(g)) } catch { /* kota */ }
}

export default function BilgisayarTarama({ musteri, musteriAd, yil, ay, onGonderildi }) {
  const [yardimci, setYardimci] = useState(null) // null=bilinmiyor true/false
  const [tip, setTip] = useState('z')
  const [hedef, setHedef] = useState(null)
  const [dosyalar, setDosyalar] = useState([])
  const [urlNesneleri, setUrlNesneleri] = useState([])
  const [mesaj, setMesaj] = useState('')
  const [hata, setHata] = useState('')
  const [mesgul, setMesgul] = useState(false)

  useEffect(() => () => { urlNesneleri.forEach(u => URL.revokeObjectURL(u)) }, []) // eslint-disable-line

  const ping = useCallback(async () => {
    try {
      const r = await fetch(`${YARDIMCI}/ping?t=${Date.now()}`, { signal: AbortSignal.timeout(2500) })
      const j = await r.json()
      setYardimci(j?.ok === true)
      return j?.ok === true
    } catch {
      setYardimci(false)
      return false
    }
  }, [])

  useEffect(() => { ping(); const t = setInterval(ping, 15000); return () => clearInterval(t) }, [ping])

  const urlTemizle = () => {
    urlNesneleri.forEach(u => URL.revokeObjectURL(u))
    setUrlNesneleri([])
  }

  const blobUrl = async (yol) => {
    const r = await fetch(`${YARDIMCI}/dosya?yol=${encodeURIComponent(yol)}`, { signal: AbortSignal.timeout(30000) })
    if (!r.ok) throw new Error('dosya alınamadı')
    const b = await r.blob()
    const u = URL.createObjectURL(b)
    return u
  }

  const hazirla = async () => {
    if (!musteriAd) { setHata('Önce üstte müşteri seçin.'); return }
    setHata(''); setMesaj('')
    if (!(await ping())) { setHata('MubisTarama.exe çalışmıyor. Masaüstündeki MUBIS-Tarama klasöründen başlatın.'); return }
    setMesgul(true)
    try {
      const r = await fetch(`${YARDIMCI}/hazirla`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ musteri: musteriAd, yil, ay, tip }),
        signal: AbortSignal.timeout(8000),
      })
      const j = await r.json()
      if (!r.ok || j.hata) throw new Error(j.hata || 'hazırlanamadı')
      setHedef(j.hedef)
      setMesaj(`Klasör hazır: ${j.hedef} — tarayıcıdan tarama yaptıkça dosyalar buraya düşer.`)
    } catch (e) {
      setHata('Klasör hazırlanamadı: ' + (e?.message || e))
    } finally {
      setMesgul(false)
    }
  }

  const getir = async () => {
    if (!musteriAd) { setHata('Önce üstte müşteri seçin.'); return }
    setHata(''); setMesaj('')
    if (!(await ping())) { setHata('MubisTarama.exe çalışmıyor.'); return }
    setMesgul(true)
    try {
      const q = `musteri=${encodeURIComponent(musteriAd)}&yil=${yil}&ay=${ay}&tip=${tip}`
      const r = await fetch(`${YARDIMCI}/liste?${q}`, { signal: AbortSignal.timeout(10000) })
      const j = await r.json()
      if (j.hata) throw new Error(j.hata)
      setHedef(j.hedef)
      urlTemizle()
      const yuklenen = yuklenenOku()
      const urls = []
      const liste = []
      for (const d of (j.dosyalar || [])) {
        if (yuklenen[`${j.hedef}|${d.ad}`] === d.mtime) continue
        try {
          const u = await blobUrl(d.yol)
          urls.push(u)
          liste.push({ ...d, url: u })
        } catch { /* tek dosya hatası listeyi bozmasın */ }
      }
      setUrlNesneleri(urls)
      setDosyalar(liste)
      if (!liste.length) setMesaj('Klasörde yüklenmemiş tarama yok.')
    } catch (e) {
      setHata('Liste alınamadı: ' + (e?.message || e))
    } finally {
      setMesgul(false)
    }
  }

  const gonder = async (d) => {
    if (!musteri) { setHata('Önce üstte müşteri seçin.'); return }
    setHata('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const file = await (await fetch(d.url)).blob()
      const dosya = new File([file], d.ad, { type: file.type || 'image/jpeg' })
      await fisYukle({ clientId: musteri, yil, ay, file: dosya, yukleyenId: user?.id, belgeTipi: tip, kaynak: 'klasor' })
      yuklenenIsaretle(hedef, d.ad, d.mtime)
      setDosyalar(l => l.filter(x => x.yol !== d.yol))
      setMesaj(`${d.ad} MUBiS'e yüklendi → Taramalar'da "İşle" ile kayda geçer.`)
      onGonderildi?.()
    } catch (e) {
      setHata('Yükleme hatası: ' + (e?.message || e))
    }
  }

  const tumunuGonder = async () => {
    for (const d of [...dosyalar]) await gonder(d)
  }

  return (
    <div className="mb-4 bg-blue-950/40 border border-blue-800/40 rounded-2xl p-3">
      <div className="flex flex-wrap items-center gap-2">
        <ScanLine className="w-4 h-4 text-cyan-400" />
        <span className="text-white text-sm font-semibold">Tarayıcı Taramaları</span>
        {yardimci === true && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> MubisTarama çalışıyor
          </span>
        )}
        {yardimci === false && (
          <span className="flex items-center gap-1.5 text-xs text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5" /> MubisTarama.exe kapalı
          </span>
        )}
        <div className="flex items-center gap-1 bg-blue-900/60 border border-blue-700/60 rounded-lg p-0.5">
          {[['z', 'Z Raporu'], ['fis', 'Gider Fişi']].map(([v, l]) => (
            <button key={v} onClick={() => { setTip(v); setDosyalar([]); setHedef(null) }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${tip === v ? 'bg-cyan-700 text-white' : 'text-blue-200 hover:text-white'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button onClick={hazirla} disabled={mesgul || !musteriAd}
          className="flex items-center gap-2 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">
          <FolderPlus className="w-3.5 h-3.5" /> Klasörü Hazırla
        </button>
        <button onClick={getir} disabled={mesgul || !musteriAd}
          className="flex items-center gap-2 bg-blue-800 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">
          <RefreshCw className={`w-3.5 h-3.5 ${mesgul ? 'animate-spin' : ''}`} /> Taramaları Getir
        </button>
        {dosyalar.length > 0 && (
          <button onClick={tumunuGonder}
            className="flex items-center gap-2 bg-emerald-700/80 hover:bg-emerald-600 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">
            <Upload className="w-3.5 h-3.5" /> Tümünü Yükle ({dosyalar.length})
          </button>
        )}
        <a href="/indir/MubisTarama.zip" download title="MubisTarama.exe kurulumunu indir"
          className="flex items-center gap-1.5 text-xs text-blue-300 hover:text-cyan-300 underline underline-offset-2">
          <Download className="w-3.5 h-3.5" /> MubisTarama İndir
        </a>
      </div>

      {mesaj && <div className="mt-2 text-xs text-emerald-300">{mesaj}</div>}
      {hata && <div className="mt-2 text-xs text-red-300">{hata}</div>}
      {yardimci === false && (
        <p className="mt-2 text-xs text-gray-400">
          Masaüstündeki <b className="text-gray-300">MUBIS-Tarama\MubisTarama.exe</b>'yi başlatın (yüklü değilse{' '}
          <a href="/indir/MubisTarama.zip" download className="text-cyan-300 underline underline-offset-2 font-semibold">MubisTarama.zip indir</a>,
          zip'i açıp MubisTarama.exe'yi çalıştırın); fi-6130 profilinin kayıt klasörü
          <b className="text-gray-300"> G:\Drive'ım\EDEFTER\_TARAMA_GIRIS</b> olmalı — exe taramaları seçtiğiniz müşteri/dönem klasörüne otomatik taşır.
        </p>
      )}
      {dosyalar.length > 0 && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {dosyalar.map(d => (
            <div key={d.yol} className="bg-blue-900/40 border border-blue-800/40 rounded-lg overflow-hidden">
              <img src={d.url} alt={d.ad} className="w-full h-20 object-cover object-top" />
              <div className="p-1.5">
                <div className="text-[10px] text-gray-300 truncate" title={d.ad}>{d.ad}</div>
                <button onClick={() => gonder(d)}
                  className="mt-1 w-full bg-cyan-700 hover:bg-cyan-600 text-white rounded px-1.5 py-1 text-[10px] font-semibold transition">
                  Yükle
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {hedef && dosyalar.length === 0 && !mesgul && (
        <div className="mt-2 text-xs text-gray-500 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> {hedef}
        </div>
      )}
    </div>
  )
}
