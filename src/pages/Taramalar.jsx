import { useEffect, useState, useCallback } from 'react'
import { Loader2, ScanLine, Trash2, CheckCircle2, RefreshCw, ExternalLink, AlertCircle } from 'lucide-react'
import { taramaListesi, taramaFotoUrl, taramaIsle, taramaSil, bekleyenTaramaSayisi } from '../services/taramaService'
import MobilYuklemeKarti from '../components/MobilYuklemeKarti'

const AYLAR = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK']
const SIMDI = new Date()

const tl = (x) => (x == null ? '—' : Number(x).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

export default function Taramalar({ embedded = false }) {
  const [yil, setYil] = useState(SIMDI.getFullYear())
  const [ay, setAy] = useState(0)
  const [durum, setDurum] = useState('')
  const [kayitlar, setKayitlar] = useState(null)
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState('')
  const [mesaj, setMesaj] = useState('')
  const [islemde, setIslemde] = useState(null) // tarama id
  const [bekleyen, setBekleyen] = useState(0)

  const yukle = useCallback(async () => {
    setYukleniyor(true)
    setHata('')
    try {
      const liste = await taramaListesi({ yil, ay: ay || null, durum: durum || null })
      setKayitlar(liste)
      setBekleyen(await bekleyenTaramaSayisi())
    } catch (e) {
      setHata(e?.message || 'Liste alınamadı')
      setKayitlar([])
    } finally {
      setYukleniyor(false)
    }
  }, [yil, ay, durum])

  useEffect(() => { yukle() }, [yukle])

  const isle = async (t) => {
    if (islemde) return
    setIslemde(t.id)
    setMesaj('')
    try {
      const sonuc = await taramaIsle(t)
      const a = sonuc.ayrim
      const ayrimMetni = a && a.giderHesabi
        ? ` → ${a.giderHesabi}${a.kdvHesabi ? ' + ' + a.kdvHesabi : ''} / ${a.cariHesabi}${a.cariYeni ? ' (yeni cari açıldı)' : ''}`
        : ''
      setMesaj(`${t.musteriAd}: işlendi → ${sonuc.hedef === 'z_reports' ? 'Z Raporu kaydı' : 'Gider fişi kaydı'} #${sonuc.kayitId}${ayrimMetni}`)
      await yukle()
    } catch (e) {
      setMesaj('İşleme hatası: ' + (e?.message || e))
    } finally {
      setIslemde(null)
    }
  }

  const sil = async (t) => {
    if (!window.confirm(`${t.musteriAd} — ${t.belge_tipi === 'z' ? 'Z raporu' : 'fiş'} taraması silinsin mi?`)) return
    setIslemde(t.id)
    try {
      await taramaSil(t.id, t.storage_path)
      await yukle()
    } catch (e) {
      setMesaj('Silme hatası: ' + (e?.message || e))
    } finally {
      setIslemde(null)
    }
  }

  const fotoAc = async (t) => {
    const url = await taramaFotoUrl(t.storage_path)
    if (url) window.open(url, '_blank')
  }

  return (
    <div className={embedded ? '' : 'p-4 md:p-6 max-w-[1400px] mx-auto'}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          {embedded ? (
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ScanLine className="w-5 h-5 text-cyan-400" /> Taramalar
              {bekleyen > 0 && <span className="text-xs font-bold bg-amber-500 text-blue-950 rounded-full px-2 py-0.5">{bekleyen} bekleyen</span>}
            </h2>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <ScanLine className="w-6 h-6 text-cyan-400" /> Taramalar
                {bekleyen > 0 && <span className="text-xs font-bold bg-amber-500 text-blue-950 rounded-full px-2 py-0.5">{bekleyen} bekleyen</span>}
              </h1>
              <p className="text-gray-400 text-sm mt-0.5">MUBiS Tarama uygulamasından gönderilen fiş ve Z raporları</p>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={yil} onChange={e => setYil(Number(e.target.value))} className="bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
            {[SIMDI.getFullYear() + 1, SIMDI.getFullYear(), SIMDI.getFullYear() - 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={ay} onChange={e => setAy(Number(e.target.value))} className="bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
            <option value={0}>Tüm aylar</option>
            {AYLAR.map((a, i) => <option key={a} value={i + 1}>{a}</option>)}
          </select>
          <select value={durum} onChange={e => setDurum(e.target.value)} className="bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
            <option value="">Tüm durumlar</option>
            <option value="yeni">Yeni</option>
            <option value="islendi">İşlendi</option>
            <option value="iptal">İptal</option>
          </select>
          <button onClick={yukle} disabled={yukleniyor} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition">
            {yukleniyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Yenile
          </button>
        </div>
      </div>

      {!embedded && <MobilYuklemeKarti />}

      {hata && <div className="mb-3 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-2">{hata}</div>}
      {mesaj && (        <div className={`mb-3 rounded-lg px-4 py-2 text-sm border ${mesaj.startsWith('İşleme hatası') || mesaj.startsWith('Silme hatası') ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'}`}>
          {mesaj}
        </div>
      )}

      <div className="space-y-3">
        {yukleniyor && kayitlar === null && (
          <div className="text-center py-10 text-gray-400"><Loader2 className="w-6 h-6 animate-spin inline" /></div>
        )}
        {kayitlar && kayitlar.length === 0 && (
          <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl px-4 py-10 text-center text-gray-400 text-sm">
            Kayıt bulunamadı. MUBiS Tarama uygulamasından gönderim yapıldığında burada listelenir.
          </div>
        )}
        {(kayitlar || []).map(t => {
          const on = t.on_okuma || {}
          const manuel = on.kaynak === 'musteri-manuel'
          const tl2 = (v) => (v != null ? Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null)
          return (
            <div key={t.id} className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-3 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <Thumb t={t} fotoAc={fotoAc} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-white font-semibold">{t.musteriAd}</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-800/70 text-blue-200">{t.belge_tipi === 'z' ? 'Z Raporu' : 'Fiş'}</span>
                  {manuel && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">Müşteri girişi</span>}
                  <span className="text-xs text-gray-400">{String(t.donem_ay).padStart(2, '0')}/{t.donem_yil}</span>
                  <span className={`text-xs font-medium ${t.durum === 'islendi' ? 'text-emerald-400' : t.durum === 'iptal' ? 'text-red-400' : 'text-amber-400'}`}>
                    {t.durum === 'islendi' ? 'İşlendi' : t.durum === 'iptal' ? 'İptal' : 'Yeni'}
                  </span>
                </div>
                {manuel ? (
                  <div className="text-gray-400 text-xs mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                    {t.belge_tipi === 'z' ? (<>
                      {on.evrakNo && <span>Evrak No: {on.evrakNo}</span>}
                      {on.satis && <>
                        {on.satis.s0 > 0 && <span>Satış 0: {tl2(on.satis.s0)}</span>}
                        {on.satis.s1 > 0 && <span>Satış 1: {tl2(on.satis.s1)}</span>}
                        {on.satis.s10 > 0 && <span>Satış 10: {tl2(on.satis.s10)}</span>}
                        {on.satis.s20 > 0 && <span>Satış 20: {tl2(on.satis.s20)}</span>}
                      </>}
                      {on.nakit > 0 && <span>Nakit: {tl2(on.nakit)}</span>}
                    </>) : (<>
                      {on.fisNo && <span>Fiş No: {on.fisNo}</span>}
                      {on.unvan && <span>Ünvan: {on.unvan}</span>}
                      {on.kdvOran > 0 && <span>KDV %: {on.kdvOran}</span>}
                      {on.toplam > 0 && <span>Toplam: {tl2(on.toplam)} TL</span>}
                    </>)}
                    {on.tarih && <span>Tarih: {on.tarih}</span>}
                  </div>
                ) : (
                  <div className="text-gray-400 text-xs mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                    {on.vkn && <span>VKN: {on.vkn}</span>}
                    {on.tarih && <span>Tarih: {on.tarih}</span>}
                    {on.zNo && <span>Z No: {on.zNo}</span>}
                    {on.tutar != null && <span>Tutar: {tl(on.tutar)} TL</span>}
                    {on.toplamKdv != null && <span>KDV: {tl(on.toplamKdv)} TL</span>}
                    {!on.okundu && <span className="text-amber-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> ön-okuma başarısız</span>}
                  </div>
                )}
                <div className="text-gray-500 text-xs mt-0.5">Gönderim: {new Date(t.created_at).toLocaleString('tr-TR')}{t.islenen_kayit ? ` · Kayıt: ${t.islenen_kayit}` : ''}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {t.storage_path && (
                  <button onClick={() => fotoAc(t)} className="px-3 py-2 rounded-lg bg-blue-800/70 hover:bg-blue-700 text-blue-100 text-xs font-medium flex items-center gap-1.5 transition">
                    <ExternalLink className="w-3.5 h-3.5" /> Fotoğraf
                  </button>
                )}
                {t.durum === 'yeni' && (
                  <button onClick={() => isle(t)} disabled={!!islemde} className="px-4 py-2 rounded-lg bg-emerald-700/80 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 transition">
                    {islemde === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} {manuel ? 'Onayla' : 'İşle'}
                  </button>
                )}
                <button onClick={() => sil(t)} disabled={!!islemde} title="Taramayı sil" className="px-3 py-2 rounded-lg bg-red-900/60 hover:bg-red-800 disabled:opacity-40 text-red-200 text-xs font-medium transition">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Thumb({ t, fotoAc }) {
  const [url, setUrl] = useState(null)
  const [hata, setHata] = useState(false)
  useEffect(() => {
    let iptal = false
    taramaFotoUrl(t.storage_path).then(u => { if (!iptal) setUrl(u) }).catch(() => setHata(true))
    return () => { iptal = true }
  }, [t.storage_path])
  return (
    <button onClick={() => fotoAc(t)} className="w-16 h-20 rounded-lg overflow-hidden bg-blue-900/50 border border-blue-800/40 shrink-0 hover:opacity-80 transition">
      {url && !hata
        ? <img src={url} alt="Tarama" className="w-full h-full object-cover" />
        : <div className="w-full h-full flex items-center justify-center text-gray-500"><ScanLine className="w-5 h-5" /></div>}
    </button>
  )
}
