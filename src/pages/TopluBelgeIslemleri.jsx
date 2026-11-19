import { Fragment, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import {
  Loader2, Play, Eye, CheckCircle2, XCircle, AlertTriangle, Search,
  Users, User, ChevronDown, ChevronRight, Info, RefreshCw, ScanLine,
  FileCheck, ClipboardList
} from 'lucide-react'
import { topluBelgeDuzenle, HATA_TURLERI } from '../services/topluBelgeService'
import { fisTara, FIS_TURLERI, AYLAR } from '../services/fisTaramaService'

const yilSecenekleri = () => {
  const bu = new Date().getFullYear()
  return Array.from({ length: 6 }, (_, i) => bu - 3 + i)
}

const musteriAdi = (c) => c?.name || c?.company || c?.shortName || `Müşteri #${c?.id}`

const SEKMELER = [
  {
    id: 'belge',
    ad: 'Toplu Belge Türü ve Ödeme Yöntemi',
    kisa: 'Toplu Belge Düzenleme',
    ikon: FileCheck,
    aciklama: 'Luca\'daki E-Defter uyumsuzluklarını (belge türü boş / diğer) toplu düzeltir: belge türü (FT/MF/PS), ödeme yöntemi (Banka), boş belge tarihi ve belge numarası. Dolu belge numaralarına ve fatura fişlerine dokunulmaz.'
  },
  {
    id: 'tarama',
    ad: 'Fiş Taraması',
    kisa: 'Fiş Taraması',
    ikon: ScanLine,
    aciklama: 'Luca\'daki fiş listesinden boş, dengesiz ve pasif fişleri seçilen dönem için tarar. Salt okunurdur — hiçbir kayıt değiştirilmez veya silinmez.'
  }
]

export default function TopluBelgeIslemleri() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/giris" replace />
  if (!['admin', 'super_admin', 'personel'].includes(user.role)) return <Navigate to="/portal" replace />

  const { clients, loading: musterilerYukleniyor, error: musteriHatasi } = useClients()

  const [sekme, setSekme] = useState('belge')

  // Ortak secim
  const [yil, setYil] = useState(String(new Date().getFullYear()))
  const [ay, setAy] = useState('')
  const [secimModu, setSecimModu] = useState('tek')
  const [tekMusteri, setTekMusteri] = useState('')
  const [secililer, setSecililer] = useState(() => new Set())
  const [arama, setArama] = useState('')

  // Toplu belge durumu
  const [belgeCalisiyor, setBelgeCalisiyor] = useState(false)
  const [belgeAdim, setBelgeAdim] = useState('')
  const [belgeSonuclar, setBelgeSonuclar] = useState([])
  const [belgeAcik, setBelgeAcik] = useState(null)
  const [belgeHata, setBelgeHata] = useState('')

  // Fis tarama durumu
  const [turler, setTurler] = useState(() => new Set(FIS_TURLERI.map((t) => t.kod)))
  const [tarmaCalisiyor, setTaramaCalisiyor] = useState(false)
  const [taramaAdim, setTaramaAdim] = useState('')
  const [taramaSonuclar, setTaramaSonuclar] = useState([])
  const [taramaAcik, setTaramaAcik] = useState(null)

  const sirali = useMemo(() => {
    const norm = (s) => String(s || '').toLocaleLowerCase('tr')
    return (clients || []).slice().sort((a, b) => norm(musteriAdi(a)).localeCompare(norm(musteriAdi(b)), 'tr'))
  }, [clients])

  const filtreli = useMemo(() => {
    const q = String(arama || '').trim().toLocaleLowerCase('tr')
    if (!q) return sirali
    return sirali.filter((c) => {
      const metin = [musteriAdi(c), c.shortName, c.vkn, c.tc].filter(Boolean).join(' ').toLocaleLowerCase('tr')
      return metin.includes(q)
    })
  }, [sirali, arama])

  const hedefMusteriler = useMemo(() => {
    if (secimModu === 'tek') {
      const c = sirali.find((x) => String(x.id) === String(tekMusteri))
      return c ? [c] : []
    }
    return sirali.filter((c) => secililer.has(c.id))
  }, [secimModu, tekMusteri, sirali, secililer])

  const calisiyor = sekme === 'belge' ? belgeCalisiyor : tarmaCalisiyor

  const secimDegistir = (id) => {
    setSecililer((onceki) => {
      const yeni = new Set(onceki)
      if (yeni.has(id)) yeni.delete(id)
      else yeni.add(id)
      return yeni
    })
  }

  const filtredekileriSec = () => {
    setSecililer((onceki) => {
      const yeni = new Set(onceki)
      const hepsiSecili = filtreli.every((c) => yeni.has(c.id))
      for (const c of filtreli) {
        if (hepsiSecili) yeni.delete(c.id)
        else yeni.add(c.id)
      }
      return yeni
    })
  }

  const turDegistir = (kod) => {
    setTurler((onceki) => {
      const yeni = new Set(onceki)
      if (yeni.has(kod)) yeni.delete(kod)
      else yeni.add(kod)
      return yeni
    })
  }

  // ---- Toplu belge ----
  const belgeCalistir = async (mod) => {
    if (belgeCalisiyor) return
    if (!hedefMusteriler.length) {
      setBelgeHata(secimModu === 'tek' ? 'Lütfen bir müşteri seçin.' : 'Lütfen en az bir müşteri seçin.')
      return
    }
    if (mod === 'uygula' && !confirm(
      `${hedefMusteriler.length} müşteride ${yil} yılı için toplu belge türü/ödeme yöntemi düzeltmesi YAPILACAK ve KAYDEDİLECEK.\n\nDevam edilsin mi?`
    )) return

    setBelgeHata('')
    setBelgeCalisiyor(true)
    setBelgeSonuclar(hedefMusteriler.map((c) => ({
      clientId: c.id, musteri: musteriAdi(c), durum: 'bekliyor',
      mesaj: '', kodlar: {}, degisen: 0, batches: 0, ornek: []
    })))
    const guncelle = (id, yama) => {
      setBelgeSonuclar((liste) => liste.map((s) => (s.clientId === id ? { ...s, ...yama } : s)))
    }
    for (const c of hedefMusteriler) {
      guncelle(c.id, { durum: 'calisiyor', mesaj: mod === 'onizle' ? 'Önizleniyor...' : 'Uygulanıyor...' })
      setBelgeAdim(musteriAdi(c))
      try {
        const r = await topluBelgeDuzenle({
          client: c, yil, mod,
          onDurum: (m) => guncelle(c.id, { mesaj: m })
        })
        guncelle(c.id, {
          durum: 'tamam',
          mesaj: mod === 'onizle'
            ? `${r.kodlar?.['20041']?.degisecek || 0} + ${r.kodlar?.['20042']?.degisecek || 0} satır düzeltilecek`
            : `${r.degisen || 0} satır düzeltildi (${r.batches || 0} paket)`,
          kodlar: r.kodlar || {}, degisen: r.degisen || 0, batches: r.batches || 0, ornek: r.ornek || []
        })
      } catch (e) {
        guncelle(c.id, { durum: 'hata', mesaj: e?.message || String(e) })
      }
    }
    setBelgeAdim('')
    setBelgeCalisiyor(false)
  }

  // ---- Fis tarama ----
  const taramaBaslat = async () => {
    if (tarmaCalisiyor) return
    if (!hedefMusteriler.length) {
      alert(secimModu === 'tek' ? 'Lütfen bir müşteri seçin.' : 'Lütfen en az bir müşteri seçin.')
      return
    }
    if (!turler.size) {
      alert('En az bir tarama türü seçin (Boş fiş / Dengesiz fiş / Pasif fiş).')
      return
    }
    const donemMetni = ay === '' ? `${yil} yılı tamamı` : `${yil} ${AYLAR[Number(ay) - 1]}`
    if (!confirm(
      `${hedefMusteriler.length} müşteride ${donemMetni} taranacak.\n` +
      `Türler: ${[...turler].map((k) => FIS_TURLERI.find((t) => t.kod === k)?.ad).join(', ')}\n\n` +
      'Tarama SALT OKUNUR; hiçbir kayıt değiştirilmez. Devam edilsin mi?'
    )) return

    setTaramaCalisiyor(true)
    setTaramaSonuclar(hedefMusteriler.map((c) => ({
      clientId: c.id, musteri: musteriAdi(c), durum: 'bekliyor', mesaj: '', turler: {}
    })))
    const guncelle = (id, yama) => {
      setTaramaSonuclar((liste) => liste.map((s) => (s.clientId === id ? { ...s, ...yama } : s)))
    }
    for (const c of hedefMusteriler) {
      guncelle(c.id, { durum: 'calisiyor', mesaj: 'Taranıyor...' })
      setTaramaAdim(musteriAdi(c))
      try {
        const r = await fisTara({
          client: c, yil, ay, turler: [...turler],
          onDurum: (m) => guncelle(c.id, { mesaj: m })
        })
        const toplam = Object.values(r.turler || {}).reduce((t, x) => t + (x.sayi || 0), 0)
        guncelle(c.id, { durum: 'tamam', mesaj: `${toplam} fiş bulundu`, turler: r.turler || {} })
      } catch (e) {
        guncelle(c.id, { durum: 'hata', mesaj: e?.message || String(e) })
      }
    }
    setTaramaAdim('')
    setTaramaCalisiyor(false)
  }

  // ---- Ozetler ----
  const belgeToplam = belgeSonuclar.reduce(
    (t, s) => t + (s.kodlar?.['20041']?.degisecek || 0) + (s.kodlar?.['20042']?.degisecek || 0), 0
  )
  const belgeTamam = belgeSonuclar.filter((s) => s.durum === 'tamam').length
  const belgeHataSayisi = belgeSonuclar.filter((s) => s.durum === 'hata').length

  const taramaToplam = taramaSonuclar.reduce(
    (t, s) => t + Object.values(s.turler || {}).reduce((x, y) => x + (y.sayi || 0), 0), 0
  )
  const taramaTamam = taramaSonuclar.filter((s) => s.durum === 'tamam').length
  const taramaHataSayisi = taramaSonuclar.filter((s) => s.durum === 'hata').length

  const aktifSekme = SEKMELER.find((s) => s.id === sekme)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6 text-white">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Toplu Belge İşlemleri</h1>
        <p className="mt-2 text-blue-100/70 text-sm">{aktifSekme?.aciklama}</p>
      </div>

      {/* Sekmeler */}
      <div className="flex flex-wrap gap-2 border-b border-blue-400/20">
        {SEKMELER.map((s) => {
          const Ikon = s.ikon
          const aktif = sekme === s.id
          return (
            <button
              key={s.id}
              onClick={() => setSekme(s.id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                aktif
                  ? 'border-blue-400 text-white bg-blue-900/40'
                  : 'border-transparent text-blue-300 hover:text-white hover:bg-blue-900/20'
              }`}
            >
              <Ikon className="w-4 h-4" />
              <span className="hidden sm:inline">{s.ad}</span>
              <span className="sm:hidden">{s.kisa}</span>
            </button>
          )
        })}
      </div>

      {/* Ortak secim paneli */}
      <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 p-5 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="text-sm text-blue-300 block mb-1">Defter yılı</label>
            <select
              value={yil}
              onChange={(e) => setYil(e.target.value)}
              className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm"
            >
              {yilSecenekleri().map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {sekme === 'tarama' && (
            <div>
              <label className="text-sm text-blue-300 block mb-1">Dönem (ay)</label>
              <select
                value={ay}
                onChange={(e) => setAy(e.target.value)}
                className="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm"
              >
                <option value="">Tüm yıl</option>
                {AYLAR.map((ad, i) => <option key={ad} value={i + 1}>{ad}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="text-sm text-blue-300 block mb-1">Müşteri seçimi</label>
            <div className="inline-flex rounded-lg overflow-hidden border border-blue-700/50">
              <button
                onClick={() => setSecimModu('tek')}
                className={`px-3 py-2 text-sm inline-flex items-center gap-1.5 ${secimModu === 'tek' ? 'bg-blue-600 text-white' : 'bg-blue-900/30 text-blue-200'}`}
              >
                <User className="w-4 h-4" /> Tek müşteri
              </button>
              <button
                onClick={() => setSecimModu('toplu')}
                className={`px-3 py-2 text-sm inline-flex items-center gap-1.5 ${secimModu === 'toplu' ? 'bg-blue-600 text-white' : 'bg-blue-900/30 text-blue-200'}`}
              >
                <Users className="w-4 h-4" /> Toplu seçim
              </button>
            </div>
          </div>

          <div className="flex-1 min-w-[240px]">
            <label className="text-sm text-blue-300 block mb-1">
              {secimModu === 'tek' ? 'Müşteri' : `Seçili müşteri: ${secililer.size}`}
            </label>
            {secimModu === 'tek' ? (
              <select
                value={tekMusteri}
                onChange={(e) => setTekMusteri(e.target.value)}
                className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm"
              >
                <option value="">Müşteri seçin...</option>
                {sirali.map((c) => (
                  <option key={c.id} value={c.id}>{musteriAdi(c)}{c.vkn ? ` (${c.vkn})` : ''}</option>
                ))}
              </select>
            ) : (
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-blue-300" />
                <input
                  value={arama}
                  onChange={(e) => setArama(e.target.value)}
                  placeholder="Müşteri adı / VKN ara"
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg pl-9 pr-3 py-2 text-white text-sm"
                />
              </div>
            )}
          </div>
        </div>

        {sekme === 'tarama' && (
          <div className="rounded-lg border border-blue-400/20 bg-blue-900/20 p-3">
            <div className="text-sm text-blue-300 mb-2">Tarama türleri</div>
            <div className="flex flex-wrap gap-4">
              {FIS_TURLERI.map((t) => (
                <label key={t.kod} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={turler.has(t.kod)}
                    onChange={() => turDegistir(t.kod)}
                    className="w-4 h-4 mt-0.5 accent-blue-500"
                  />
                  <span className="text-sm">
                    {t.ad}
                    <span className="block text-xs text-blue-300/70">{t.aciklama}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {secimModu === 'toplu' && (
          <div className="rounded-lg border border-blue-400/20 bg-blue-900/20">
            <div className="flex items-center justify-between px-3 py-2 border-b border-blue-400/10">
              <button onClick={filtredekileriSec} className="text-xs text-blue-200 hover:text-white inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                {filtreli.length && filtreli.every((c) => secililer.has(c.id)) ? 'Filtredekilerin seçimini kaldır' : 'Filtredekilerin tümünü seç'}
              </button>
              <button onClick={() => setSecililer(new Set())} className="text-xs text-blue-300 hover:text-white">
                Seçimi temizle
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-blue-400/10">
              {musterilerYukleniyor && (
                <div className="px-3 py-6 text-center text-blue-200 text-sm inline-flex items-center gap-2 w-full justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" /> Müşteriler yükleniyor...
                </div>
              )}
              {!musterilerYukleniyor && musteriHatasi && (
                <div className="px-3 py-4 text-sm text-red-300">{musteriHatasi}</div>
              )}
              {!musterilerYukleniyor && !musteriHatasi && filtreli.length === 0 && (
                <div className="px-3 py-4 text-sm text-blue-200">Eşleşen müşteri yok.</div>
              )}
              {filtreli.map((c) => (
                <label key={c.id} className="flex items-center gap-3 px-3 py-2 hover:bg-blue-800/20 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={secililer.has(c.id)}
                    onChange={() => secimDegistir(c.id)}
                    className="w-4 h-4 accent-blue-500"
                  />
                  <span className="text-sm flex-1 truncate">{musteriAdi(c)}</span>
                  <span className="text-xs text-blue-300">{c.vkn || c.tc || ''}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          {sekme === 'belge' ? (
            <>
              <button
                onClick={() => belgeCalistir('onizle')}
                disabled={calisiyor || !hedefMusteriler.length}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
              >
                {belgeCalisiyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                Önizle
              </button>
              <button
                onClick={() => belgeCalistir('uygula')}
                disabled={calisiyor || !hedefMusteriler.length}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
              >
                {belgeCalisiyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Uygula ve Kaydet
              </button>
            </>
          ) : (
            <button
              onClick={taramaBaslat}
              disabled={calisiyor || !hedefMusteriler.length || !turler.size}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
            >
              {tarmaCalisiyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
              Seçilen firmalarda fiş tara
            </button>
          )}

          {calisiyor && (belgeAdim || taramaAdim) && (
            <span className="text-sm text-blue-200 inline-flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              {(sekme === 'belge' ? belgeAdim : taramaAdim)} {sekme === 'belge' ? 'işleniyor' : 'taranıyor'}...
            </span>
          )}
          <span className="text-xs text-blue-300 ml-auto">Seçili: {hedefMusteriler.length} müşteri</span>
        </div>

        {belgeHata && sekme === 'belge' && (
          <div className="rounded-lg bg-red-500/10 border border-red-400/30 px-3 py-2 text-sm text-red-200">{belgeHata}</div>
        )}

        <div className="rounded-lg bg-blue-900/20 border border-blue-400/10 px-3 py-2 text-xs text-blue-200 flex gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          {sekme === 'belge' ? (
            <span>
              E-Defter hata türleri: {HATA_TURLERI.map((h) => `${h.kod} (${h.ad})`).join(' · ')}.
              Yalnız <b>20041</b> ve <b>20042</b> düzeltilir; diğerleri bilgi amaçlı okunur.
            </span>
          ) : (
            <span>
              Dönem seçilmezse yılın tamamı taranır. Ay seçilirse o ayın 1'i ile son günü arası
              (içinde bulunulan ayda bugüne kadar) taranır. Sonuçlar Luca'nın kendi fiş listesinden okunur.
            </span>
          )}
        </div>
      </div>

      {/* === TOPLU BELGE SONUCLARI === */}
      {sekme === 'belge' && belgeSonuclar.length > 0 && (
        <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 overflow-hidden">
          <div className="flex flex-wrap items-center gap-4 px-4 py-3 border-b border-blue-400/10 text-sm">
            <span className="font-semibold">Sonuçlar</span>
            <span className="text-blue-200">Tamam: {belgeTamam}</span>
            {belgeHataSayisi > 0 && <span className="text-red-300">Hata: {belgeHataSayisi}</span>}
            <span className="text-blue-200">Düzeltilecek/gereken toplam satır: {belgeToplam}</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-blue-900/40 text-blue-300 text-xs">
              <tr>
                <th className="text-left px-4 py-3">Müşteri</th>
                <th className="text-left px-4 py-3">Durum</th>
                <th className="text-left px-4 py-3">20041</th>
                <th className="text-left px-4 py-3">20042</th>
                <th className="text-left px-4 py-3">Düzeltilen</th>
                <th className="text-left px-4 py-3">Paket</th>
                <th className="text-left px-4 py-3">Açıklama</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {belgeSonuclar.map((s) => {
                const k41 = s.kodlar?.['20041'] || {}
                const k42 = s.kodlar?.['20042'] || {}
                const acik = belgeAcik === s.clientId
                return (
                  <Fragment key={s.clientId}>
                    <tr className="border-t border-blue-400/10 hover:bg-blue-800/20">
                      <td className="px-4 py-3 font-medium">{s.musteri}</td>
                      <td className="px-4 py-3">
                        {s.durum === 'bekliyor' && <span className="text-blue-300 text-xs">Bekliyor</span>}
                        {s.durum === 'calisiyor' && (
                          <span className="text-amber-300 text-xs inline-flex items-center gap-1.5">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> İşleniyor
                          </span>
                        )}
                        {s.durum === 'tamam' && (
                          <span className="text-emerald-300 text-xs inline-flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Tamam
                          </span>
                        )}
                        {s.durum === 'hata' && (
                          <span className="text-red-300 text-xs inline-flex items-center gap-1.5">
                            <XCircle className="w-3.5 h-3.5" /> Hata
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">{k41.satir != null ? `${k41.satir} satır / ${k41.degisecek ?? 0} değişecek` : '-'}</td>
                      <td className="px-4 py-3 text-xs">{k42.satir != null ? `${k42.satir} satır / ${k42.degisecek ?? 0} değişecek` : '-'}</td>
                      <td className="px-4 py-3 text-xs">{s.degisen || 0}</td>
                      <td className="px-4 py-3 text-xs">{s.batches || 0}</td>
                      <td className="px-4 py-3 text-xs text-blue-100/80 max-w-[320px]" title={s.mesaj}>{s.mesaj}</td>
                      <td className="px-4 py-3 text-right">
                        {s.ornek?.length ? (
                          <button
                            onClick={() => setBelgeAcik(acik ? null : s.clientId)}
                            className="text-blue-300 hover:text-white inline-flex items-center gap-1 text-xs"
                          >
                            {acik ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            Örnek
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    {acik && (
                      <tr className="bg-blue-900/20">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="text-xs text-blue-300 mb-2">Değişecek ilk {s.ornek.length} satır (önizleme)</div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead className="text-blue-300">
                                <tr>
                                  <th className="text-left py-1 pr-3">Fiş No</th>
                                  <th className="text-left py-1 pr-3">Hesap</th>
                                  <th className="text-left py-1 pr-3">Belge Türü</th>
                                  <th className="text-left py-1 pr-3">Belge No</th>
                                  <th className="text-left py-1">Yeni değerler</th>
                                </tr>
                              </thead>
                              <tbody>
                                {s.ornek.map((o, i) => (
                                  <tr key={i} className="border-t border-blue-400/10">
                                    <td className="py-1 pr-3">{o.fis || '-'}</td>
                                    <td className="py-1 pr-3">{o.hesap || '-'}</td>
                                    <td className="py-1 pr-3">{o.belgeTuru || '(boş)'}</td>
                                    <td className="py-1 pr-3">{o.belgeNo || '(boş)'}</td>
                                    <td className="py-1">
                                      {Object.entries(o.degisim || {}).map(([k, v]) => (
                                        <span key={k} className="inline-flex items-center gap-1 mr-3">
                                          <span className="text-blue-300">{k}:</span>
                                          <span className="text-emerald-300">{v === '' ? '(boş)' : v}</span>
                                        </span>
                                      ))}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {sekme === 'belge' && belgeHataSayisi > 0 && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100 flex gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <div>
            Bazı müşterilerde işlem tamamlanamadı. Satır açıklamalarına bakın.
            Olası nedenler: Luca oturumu düşmüş, firma/dönem Luca'da bulunamadı,
            müşteri bilanço defter türünde değil veya yardımcı program güncel değil.
          </div>
        </div>
      )}

      {/* === FIS TARAMA SONUCLARI === */}
      {sekme === 'tarama' && taramaSonuclar.length > 0 && (
        <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 overflow-hidden">
          <div className="flex flex-wrap items-center gap-4 px-4 py-3 border-b border-blue-400/10 text-sm">
            <span className="font-semibold">Sonuçlar</span>
            <span className="text-blue-200">Tamam: {taramaTamam}</span>
            {taramaHataSayisi > 0 && <span className="text-red-300">Hata: {taramaHataSayisi}</span>}
            <span className="text-blue-200">Bulunan fiş: {taramaToplam}</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-blue-900/40 text-blue-300 text-xs">
              <tr>
                <th className="text-left px-4 py-3">Müşteri</th>
                <th className="text-left px-4 py-3">Durum</th>
                {FIS_TURLERI.map((t) => (
                  <th key={t.kod} className="text-left px-4 py-3">{t.ad}</th>
                ))}
                <th className="text-left px-4 py-3">Açıklama</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {taramaSonuclar.map((s) => {
                const acik = taramaAcik === s.clientId
                const listelenecek = FIS_TURLERI.reduce((t, x) => t + (s.turler?.[x.kod]?.fisler?.length || 0), 0)
                return (
                  <tr key={s.clientId} className="border-t border-blue-400/10 hover:bg-blue-800/20">
                    <td className="px-4 py-3 font-medium">{s.musteri}</td>
                    <td className="px-4 py-3">
                      {s.durum === 'bekliyor' && <span className="text-blue-300 text-xs">Bekliyor</span>}
                      {s.durum === 'calisiyor' && (
                        <span className="text-amber-300 text-xs inline-flex items-center gap-1.5">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Taranıyor
                        </span>
                      )}
                      {s.durum === 'tamam' && (
                        <span className="text-emerald-300 text-xs inline-flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Tamam
                        </span>
                      )}
                      {s.durum === 'hata' && (
                        <span className="text-red-300 text-xs inline-flex items-center gap-1.5">
                          <XCircle className="w-3.5 h-3.5" /> Hata
                        </span>
                      )}
                    </td>
                    {FIS_TURLERI.map((t) => (
                      <td key={t.kod} className="px-4 py-3 text-xs">
                        {s.turler?.[t.kod] ? `${s.turler[t.kod].sayi} fiş` : '-'}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-xs text-blue-100/80 max-w-[320px]">
                      <div className="truncate" title={s.mesaj}>{s.mesaj}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {listelenecek > 0 && (
                        <button
                          onClick={() => setTaramaAcik(acik ? null : s.clientId)}
                          className="text-blue-300 hover:text-white inline-flex items-center gap-1 text-xs"
                        >
                          {acik ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          Fişler
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {taramaAcik != null && (() => {
            const s = taramaSonuclar.find((x) => x.clientId === taramaAcik)
            if (!s) return null
            return (
              <div className="border-t border-blue-400/10 bg-blue-900/20 p-4 space-y-4">
                {FIS_TURLERI.map((t) => {
                  const blok = s.turler?.[t.kod]
                  if (!blok || !blok.fisler?.length) return null
                  return (
                    <div key={t.kod}>
                      <div className="text-sm text-blue-200 mb-2">
                        {t.ad} — {blok.sayi} fiş ({blok.baslangic} – {blok.bitis})
                        {blok.sayi > blok.fisler.length && (
                          <span className="text-blue-300/70"> (ilk {blok.fisler.length} gösteriliyor)</span>
                        )}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="text-blue-300">
                            <tr>
                              <th className="text-left py-1 pr-3">Tarih</th>
                              <th className="text-left py-1 pr-3">Tip</th>
                              <th className="text-left py-1 pr-3">Fiş No</th>
                              <th className="text-left py-1 pr-3">Açıklama</th>
                              <th className="text-left py-1 pr-3">Dengeli</th>
                              <th className="text-left py-1 pr-3">Aktif</th>
                              <th className="text-right py-1 pr-3">Borç</th>
                              <th className="text-right py-1">Alacak</th>
                            </tr>
                          </thead>
                          <tbody>
                            {blok.fisler.map((f, i) => (
                              <tr key={f.id || i} className="border-t border-blue-400/10">
                                <td className="py-1 pr-3 whitespace-nowrap">{f.date}</td>
                                <td className="py-1 pr-3">{f.type}</td>
                                <td className="py-1 pr-3 font-medium">{f.voucherNo}</td>
                                <td className="py-1 pr-3 max-w-[280px] truncate" title={f.description}>{f.description}</td>
                                <td className="py-1 pr-3">{f.balance}</td>
                                <td className="py-1 pr-3">{f.active}</td>
                                <td className="py-1 pr-3 text-right">{f.debit}</td>
                                <td className="py-1 text-right">{f.credit}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      )}

      {sekme === 'tarama' && taramaHataSayisi > 0 && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100 flex gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <div>
            Bazı müşterilerde tarama tamamlanamadı. Satır açıklamalarına bakın.
            Olası nedenler: Luca oturumu düşmüş, firma/dönem bulunamadı veya yardımcı program güncel değil.
          </div>
        </div>
      )}
    </div>
  )
}
