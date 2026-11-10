import { useCallback, useEffect, useRef, useState } from 'react'
import { ScanLine, Upload, FolderOpen, X, CheckCircle2 } from 'lucide-react'
import { fisYukle } from '../services/taramaService'
import { supabase } from '../lib/supabase'

// Fi-6130 vb. tarayıcıdan "klasöre tarama" profiliyle atılan görselleri izler.
// Klasör seçilir (File System Access API — Chrome/Edge), sayfa açıkken 4 sn'de
// bir yeni jpg/png/webp dosyaları listeye düşer; müşteri+dönem seçilip gönderilir.
// Gönderilenler localStorage'da işaretlenir, tekrar listelenmez.

const GONDERILEN_KEY = 'mubis_tarayici_gonderilen'
const RESIM_RE = /\.(jpe?g|png|webp)$/i

function idbAc() {
  return new Promise((coz, reddet) => {
    const r = indexedDB.open('mubis-tarayici', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('handles')
    r.onsuccess = () => coz(r.result)
    r.onerror = () => reddet(r.error)
  })
}
async function handleKaydet(h) {
  const db = await idbAc()
  return new Promise((coz, reddet) => {
    const tx = db.transaction('handles', 'readwrite')
    tx.objectStore('handles').put(h, 'klasor')
    tx.oncomplete = coz
    tx.onerror = () => reddet(tx.error)
  })
}
async function handleOku() {
  const db = await idbAc()
  return new Promise((coz, reddet) => {
    const tx = db.transaction('handles', 'readonly')
    const r = tx.objectStore('handles').get('klasor')
    r.onsuccess = () => coz(r.result || null)
    r.onerror = () => reddet(r.error)
  })
}
function gonderilenOku() {
  try { return JSON.parse(localStorage.getItem(GONDERILEN_KEY) || '{}') } catch { return {} }
}
function gonderilenIsaretle(klasorAd, ad, mtime) {
  const g = gonderilenOku()
  g[`${klasorAd}|${ad}`] = mtime
  try { localStorage.setItem(GONDERILEN_KEY, JSON.stringify(g)) } catch { /* kota */ }
}

export default function TarayiciIzle({ musteri, yil, ay, onGonderildi }) {
  const [destekliyor] = useState(() => typeof window.showDirectoryPicker === 'function')
  const [klasorAd, setKlasorAd] = useState(null)
  const [izliyor, setIzliyor] = useState(false)
  const [dosyalar, setDosyalar] = useState([])
  const [belgeTipi, setBelgeTipi] = useState('fis')
  const [eskilerDahil, setEskilerDahil] = useState(false)
  const [gonderilenler, setGonderilenler] = useState([]) // listeye düşen ama gönderilenler (oturum içi)
  const [goster, setGoster] = useState(true)
  const [mesaj, setMesaj] = useState('')
  const [hata, setHata] = useState('')
  const [taranıyor, setTaranıyor] = useState(false)
  const handleRef = useRef(null)
  const baslangicRef = useRef(Date.now())
  const urlRef = useRef([])

  const urlTemizle = () => { urlRef.current.forEach(u => URL.revokeObjectURL(u)); urlRef.current = [] }

  const tara = useCallback(async () => {
    const handle = handleRef.current
    if (!handle) return
    setTaranıyor(true)
    try {
      const bulun = []
      for await (const [ad, el] of handle.entries()) {
        if (el.kind !== 'file' || !RESIM_RE.test(ad)) continue
        const f = await el.getFile()
        if (!eskilerDahil && f.lastModified <= baslangicRef.current) continue
        bulun.push({ ad, file: f, mtime: f.lastModified })
      }
      bulun.sort((a, b) => b.mtime - a.mtime)
      const g = gonderilenOku()
      urlTemizle()
      const list = bulun
        .filter(d => g[`${handle.name}|${d.ad}`] !== d.mtime)
        .map(d => { const url = URL.createObjectURL(d.file); urlRef.current.push(url); return { ...d, url } })
      setDosyalar(list)
      setHata('')
    } catch (e) {
      setHata('Klasör okunamadı: ' + (e?.message || e))
    } finally {
      setTaranıyor(false)
    }
  }, [eskilerDahil])

  // Bağlantı sonrası izleme döngüsü
  useEffect(() => {
    if (!izliyor || !handleRef.current) return
    tara()
    const t = setInterval(tara, 4000)
    return () => clearInterval(t)
  }, [izliyor, tara])

  // Kayıtlı klasörü geri yükle
  useEffect(() => {
    (async () => {
      try {
        const h = await handleOku()
        if (!h) return
        const izin = await h.queryPermission({ mode: 'read' })
        if (izin === 'granted') {
          handleRef.current = h
          setKlasorAd(h.name)
          baslangicRef.current = Date.now()
          setIzliyor(true)
        }
      } catch { /* IDB yok sayılır */ }
    })()
    return () => urlTemizle()
  }, [])

  const baglan = async () => {
    setHata(''); setMesaj('')
    try {
      const h = await window.showDirectoryPicker({ id: 'mubis-tarayici', mode: 'read' })
      handleRef.current = h
      await handleKaydet(h)
      setKlasorAd(h.name)
      baslangicRef.current = Date.now()
      setDosyalar([])
      setIzliyor(true)
      setMesaj(`"${h.name}" klasörü izleniyor — tarayıcıdan tarama yaptıkça dosyalar burada listelenir.`)
    } catch (e) {
      if (e?.name !== 'AbortError') setHata('Klasör seçilemedi: ' + (e?.message || e))
    }
  }

  const kopar = () => {
    setIzliyor(false)
    handleRef.current = null
    setKlasorAd(null)
    setDosyalar([])
    setMesaj('')
  }

  const gonder = async (d) => {
    if (!musteri) { setHata('Önce üstte müşteri seçin.'); return }
    setHata('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await fisYukle({ clientId: musteri, yil, ay, file: d.file, yukleyenId: user?.id, belgeTipi, kaynak: 'tarayici' })
      gonderilenIsaretle(klasorAd, d.ad, d.mtime)
      setGonderilenler(g => [...g, d.ad])
      setDosyalar(list => list.filter(x => x.ad !== d.ad))
      setMesaj(`${d.ad} gönderildi → Taramalar listesinde "İşle" ile kayda geçer.`)
      onGonderildi?.()
    } catch (e) {
      setHata('Gönderim hatası: ' + (e?.message || e))
    }
  }

  const tumunuGonder = async () => {
    for (const d of [...dosyalar]) await gonder(d)
  }

  if (!destekliyor) return null

  return (
    <div className="mb-4 bg-blue-950/40 border border-blue-800/40 rounded-2xl p-3">
      <div className="flex flex-wrap items-center gap-2">
        <ScanLine className="w-4 h-4 text-cyan-400" />
        <span className="text-white text-sm font-semibold">Tarayıcı Klasörü</span>
        {izliyor && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> İzleniyor: {klasorAd}
          </span>
        )}
        <select value={belgeTipi} onChange={e => setBelgeTipi(e.target.value)} className="bg-blue-900/60 border border-blue-700/60 rounded-lg px-2 py-1.5 text-white text-xs">
          <option value="fis">Gider fişi</option>
          <option value="z">Z Raporu</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
          <input type="checkbox" checked={eskilerDahil} onChange={e => { setEskilerDahil(e.target.checked); if (izliyor) setTimeout(tara, 0) }} className="accent-cyan-500" />
          Klasördeki tüm görselleri göster
        </label>
        <div className="flex-1" />
        {!izliyor ? (
          <button onClick={baglan} className="flex items-center gap-2 bg-cyan-700 hover:bg-cyan-600 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">
            <FolderOpen className="w-3.5 h-3.5" /> Tarama Klasörünü Bağla
          </button>
        ) : (
          <>
            {dosyalar.length > 0 && (
              <button onClick={tumunuGonder} className="flex items-center gap-2 bg-emerald-700/80 hover:bg-emerald-600 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">
                <Upload className="w-3.5 h-3.5" /> Tümünü Gönder ({dosyalar.length})
              </button>
            )}
            <button onClick={kopar} title="Klasör bağlantısını kes" className="p-1.5 rounded-lg bg-blue-900/60 hover:bg-blue-800 text-blue-200 transition">
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}
        <button onClick={() => setGoster(g => !g)} className="text-xs text-blue-300 hover:text-blue-200 underline underline-offset-2">
          {goster ? 'gizle' : 'göster'}
        </button>
      </div>

      {goster && (
        <>
          {mesaj && <div className="mt-2 text-xs text-emerald-300">{mesaj}</div>}
          {hata && <div className="mt-2 text-xs text-red-300">{hata}</div>}
          {!izliyor && (
            <p className="mt-2 text-xs text-gray-400">
              Fi-6130 tarayıcı profilini <b className="text-gray-300">"klasöre JPEG tarama"</b> olarak ayarlayın; buraya bağladığınız klasöre düşen her tarama otomatik listelenir.
            </p>
          )}
          {izliyor && dosyalar.length > 0 && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {dosyalar.map(d => (
                <div key={d.ad} className="bg-blue-900/40 border border-blue-800/40 rounded-lg overflow-hidden">
                  <img src={d.url} alt={d.ad} className="w-full h-20 object-cover object-top" />
                  <div className="p-1.5">
                    <div className="text-[10px] text-gray-300 truncate" title={d.ad}>{d.ad}</div>
                    <div className="text-[10px] text-gray-500">{new Date(d.mtime).toLocaleTimeString('tr-TR')}</div>
                    <button onClick={() => gonder(d)} className="mt-1 w-full flex items-center justify-center gap-1 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-white rounded px-1.5 py-1 text-[10px] font-semibold transition">
                      Gönder
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {izliyor && dosyalar.length === 0 && !taranıyor && (
            <div className="mt-2 text-xs text-gray-500 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Yeni tarama bekleniyor…
            </div>
          )}
          {gonderilenler.length > 0 && (
            <div className="mt-2 text-[10px] text-gray-500">Bu oturumda gönderilen: {gonderilenler.join(', ')}</div>
          )}
        </>
      )}
    </div>
  )
}
