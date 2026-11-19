import { Fragment, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import {
  Loader2, Play, Eye, CheckCircle2, XCircle, AlertTriangle, Search,
  Users, User, ChevronDown, ChevronRight, Info, RefreshCw
} from 'lucide-react'
import { topluBelgeDuzenle, HATA_TURLERI } from '../services/topluBelgeService'

const yilSecenekleri = () => {
  const bu = new Date().getFullYear()
  return Array.from({ length: 6 }, (_, i) => bu - 3 + i)
}

const musteriAdi = (c) => c?.name || c?.company || c?.shortName || `Müşteri #${c?.id}`

export default function TopluBelgeIslemleri() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/giris" replace />
  if (!['admin', 'super_admin', 'personel'].includes(user.role)) return <Navigate to="/portal" replace />

  const { clients, loading: musterilerYukleniyor, error: musteriHatasi } = useClients()

  const [yil, setYil] = useState(String(new Date().getFullYear()))
  const [secimModu, setSecimModu] = useState('tek') // 'tek' | 'toplu'
  const [tekMusteri, setTekMusteri] = useState('')
  const [secililer, setSecililer] = useState(() => new Set())
  const [arama, setArama] = useState('')

  const [calisiyor, setCalisiyor] = useState(false)
  const [aktifAdim, setAktifAdim] = useState('')
  const [sonuclar, setSonuclar] = useState([])
  const [acikSatir, setAcikSatir] = useState(null)
  const [hata, setHata] = useState('')

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

  const calistir = async (mod) => {
    if (calisiyor) return
    if (!hedefMusteriler.length) {
      setHata(secimModu === 'tek' ? 'Lütfen bir müşteri seçin.' : 'Lütfen en az bir müşteri seçin.')
      return
    }
    if (mod === 'uygula' && !confirm(
      `${hedefMusteriler.length} müşteride ${yil} yılı için toplu belge türü/ödeme yöntemi düzeltmesi YAPILACAK ve KAYDEDİLECEK.\n\nDevam edilsin mi?`
    )) return

    setHata('')
    setCalisiyor(true)
    setSonuclar(hedefMusteriler.map((c) => ({
      clientId: c.id,
      musteri: musteriAdi(c),
      durum: 'bekliyor',
      mesaj: '',
      kodlar: {},
      degisen: 0,
      batches: 0,
      ornek: []
    })))

    const guncelle = (id, yama) => {
      setSonuclar((liste) => liste.map((s) => (s.clientId === id ? { ...s, ...yama } : s)))
    }

    for (const c of hedefMusteriler) {
      guncelle(c.id, { durum: 'calisiyor', mesaj: mod === 'onizle' ? 'Önizleniyor...' : 'Uygulanıyor...' })
      setAktifAdim(musteriAdi(c))
      try {
        const r = await topluBelgeDuzenle({
          client: c,
          yil,
          mod,
          onDurum: (m) => guncelle(c.id, { mesaj: m })
        })
        guncelle(c.id, {
          durum: 'tamam',
          mesaj: mod === 'onizle'
            ? `${r.kodlar?.['20041']?.degisecek || 0} + ${r.kodlar?.['20042']?.degisecek || 0} satır düzeltilecek`
            : `${r.degisen || 0} satır düzeltildi (${r.batches || 0} paket)`,
          kodlar: r.kodlar || {},
          degisen: r.degisen || 0,
          batches: r.batches || 0,
          ornek: r.ornek || []
        })
      } catch (e) {
        guncelle(c.id, { durum: 'hata', mesaj: e?.message || String(e) })
      }
    }
    setAktifAdim('')
    setCalisiyor(false)
  }

  const toplamDegisecek = sonuclar.reduce((t, s) => t + (s.kodlar?.['20041']?.degisecek || 0) + (s.kodlar?.['20042']?.degisecek || 0), 0)
  const tamamSayisi = sonuclar.filter((s) => s.durum === 'tamam').length
  const hataSayisi = sonuclar.filter((s) => s.durum === 'hata').length

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6 text-white">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Toplu Belge Türü ve Ödeme Yöntemi Düzenleme</h1>
        <p className="mt-2 text-blue-100/70 text-sm">
          Luca'daki E-Defter uyumsuzluklarını (belge türü boş / diğer) toplu düzeltir:
          belge türü (FT/MF/PS), ödeme yöntemi (Banka), boş belge tarihi ve belge numarası.
          Dolu belge numaralarına ve fatura fişlerine dokunulmaz.
        </p>
      </div>

      {/* Seçim paneli */}
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
          <button
            onClick={() => calistir('onizle')}
            disabled={calisiyor || !hedefMusteriler.length}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
          >
            {calisiyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            Önizle
          </button>
          <button
            onClick={() => calistir('uygula')}
            disabled={calisiyor || !hedefMusteriler.length}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
          >
            {calisiyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Uygula ve Kaydet
          </button>
          {calisiyor && aktifAdim && (
            <span className="text-sm text-blue-200 inline-flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> {aktifAdim} işleniyor...
            </span>
          )}
          <span className="text-xs text-blue-300 ml-auto">
            Seçili: {hedefMusteriler.length} müşteri
          </span>
        </div>

        {hata && (
          <div className="rounded-lg bg-red-500/10 border border-red-400/30 px-3 py-2 text-sm text-red-200">{hata}</div>
        )}

        <div className="rounded-lg bg-blue-900/20 border border-blue-400/10 px-3 py-2 text-xs text-blue-200 flex gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            E-Defter hata türleri: {HATA_TURLERI.map((h) => `${h.kod} (${h.ad})`).join(' · ')}.
            Yalnız <b>20041</b> ve <b>20042</b> düzeltilir; diğerleri bilgi amaçlı okunur.
          </span>
        </div>
      </div>

      {/* Sonuçlar */}
      {sonuclar.length > 0 && (
        <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 overflow-hidden">
          <div className="flex flex-wrap items-center gap-4 px-4 py-3 border-b border-blue-400/10 text-sm">
            <span className="font-semibold">Sonuçlar</span>
            <span className="text-blue-200">Tamam: {tamamSayisi}</span>
            {hataSayisi > 0 && <span className="text-red-300">Hata: {hataSayisi}</span>}
            <span className="text-blue-200">Düzeltilecek/gereken toplam satır: {toplamDegisecek}</span>
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
              {sonuclar.map((s) => {
                const k41 = s.kodlar?.['20041'] || {}
                const k42 = s.kodlar?.['20042'] || {}
                const acik = acikSatir === s.clientId
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
                      <td className="px-4 py-3 text-xs text-blue-100/80 max-w-[320px] truncate" title={s.mesaj}>{s.mesaj}</td>
                      <td className="px-4 py-3 text-right">
                        {s.ornek?.length ? (
                          <button
                            onClick={() => setAcikSatir(acik ? null : s.clientId)}
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

      {hataSayisi > 0 && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100 flex gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <div>
            Bazı müşterilerde işlem tamamlanamadı. Olası nedenler: Luca oturumu düşmüş, firma/dönem
            Luca'da bulunamadı veya müşteri bilanço defter türünde değil. Satır açıklamalarına bakın.
          </div>
        </div>
      )}
    </div>
  )
}
