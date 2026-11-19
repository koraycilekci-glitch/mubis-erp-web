import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import {
  Loader2, Play, CheckCircle2, XCircle, Search, Users, User,
  ChevronDown, ChevronRight, Info, RefreshCw, ScanLine
} from 'lucide-react'
import { fisTara, FIS_TURLERI, AYLAR } from '../services/fisTaramaService'

const yilSecenekleri = () => {
  const bu = new Date().getFullYear()
  return Array.from({ length: 6 }, (_, i) => bu - 3 + i)
}

const musteriAdi = (c) => c?.name || c?.company || c?.shortName || `Müşteri #${c?.id}`

export default function FisTarama() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/giris" replace />
  if (!['admin', 'super_admin', 'personel'].includes(user.role)) return <Navigate to="/portal" replace />

  const { clients, loading: musterilerYukleniyor, error: musteriHatasi } = useClients()

  const [yil, setYil] = useState(String(new Date().getFullYear()))
  const [ay, setAy] = useState('')
  const [turler, setTurler] = useState(() => new Set(FIS_TURLERI.map((t) => t.kod)))
  const [secimModu, setSecimModu] = useState('tek')
  const [tekMusteri, setTekMusteri] = useState('')
  const [secililer, setSecililer] = useState(() => new Set())
  const [arama, setArama] = useState('')

  const [calisiyor, setCalisiyor] = useState(false)
  const [aktifAdim, setAktifAdim] = useState('')
  const [sonuclar, setSonuclar] = useState([])
  const [acikSatir, setAcikSatir] = useState(null)

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

  const turDegistir = (kod) => {
    setTurler((onceki) => {
      const yeni = new Set(onceki)
      if (yeni.has(kod)) yeni.delete(kod)
      else yeni.add(kod)
      return yeni
    })
  }

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

  const tara = async () => {
    if (calisiyor) return
    if (!hedefMusteriler.length) {
      alert(secimModu === 'tek' ? 'Lütfen bir müşteri seçin.' : 'Lütfen en az bir müşteri seçin.')
      return
    }
    if (!turler.size) {
      alert('En az bir tarama türü seçin (Boş fiş / Dengesiz fiş / Pasif fiş).')
      return
    }
    if (!confirm(
      `${hedefMusteriler.length} müşteride ${ay === '' ? yil + ' yılı tamamı' : yil + ' ' + AYLAR[Number(ay) - 1]} taranacak.\n` +
      `Türler: ${[...turler].map((k) => FIS_TURLERI.find((t) => t.kod === k)?.ad).join(', ')}\n\n` +
      'Tarama SALT OKUNUR; hiçbir kayıt değiştirilmez. Devam edilsin mi?'
    )) return

    setCalisiyor(true)
    setSonuclar(hedefMusteriler.map((c) => ({
      clientId: c.id,
      musteri: musteriAdi(c),
      durum: 'bekliyor',
      mesaj: '',
      turler: {}
    })))

    const guncelle = (id, yama) => {
      setSonuclar((liste) => liste.map((s) => (s.clientId === id ? { ...s, ...yama } : s)))
    }

    for (const c of hedefMusteriler) {
      guncelle(c.id, { durum: 'calisiyor', mesaj: 'Taranıyor...' })
      setAktifAdim(musteriAdi(c))
      try {
        const r = await fisTara({
          client: c,
          yil,
          ay,
          turler: [...turler],
          onDurum: (m) => guncelle(c.id, { mesaj: m })
        })
        const toplam = Object.values(r.turler || {}).reduce((t, x) => t + (x.sayi || 0), 0)
        guncelle(c.id, {
          durum: 'tamam',
          mesaj: `${toplam} fiş bulundu`,
          turler: r.turler || {}
        })
      } catch (e) {
        guncelle(c.id, { durum: 'hata', mesaj: e?.message || String(e) })
      }
    }
    setAktifAdim('')
    setCalisiyor(false)
  }

  const toplamFis = sonuclar.reduce(
    (t, s) => t + Object.values(s.turler || {}).reduce((x, y) => x + (y.sayi || 0), 0), 0
  )
  const tamamSayisi = sonuclar.filter((s) => s.durum === 'tamam').length
  const hataSayisi = sonuclar.filter((s) => s.durum === 'hata').length

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6 text-white">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold inline-flex items-center gap-2">
          <ScanLine className="w-7 h-7" /> Fiş Taraması
        </h1>
        <p className="mt-2 text-blue-100/70 text-sm">
          Luca'daki fiş listesinden <b>boş</b>, <b>dengesiz</b> ve <b>pasif</b> fişleri seçilen dönem için tarar.
          Salt okunurdur — hiçbir kayıt değiştirilmez veya silinmez.
        </p>
      </div>

      <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 p-5 space-y-4">
        {/* Dönem */}
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

        {/* Tarama türleri */}
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
            onClick={tara}
            disabled={calisiyor || !hedefMusteriler.length || !turler.size}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
          >
            {calisiyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Seçilen firmalarda fiş tara
          </button>
          {calisiyor && aktifAdim && (
            <span className="text-sm text-blue-200 inline-flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> {aktifAdim} taranıyor...
            </span>
          )}
          <span className="text-xs text-blue-300 ml-auto">Seçili: {hedefMusteriler.length} müşteri</span>
        </div>

        <div className="rounded-lg bg-blue-900/20 border border-blue-400/10 px-3 py-2 text-xs text-blue-200 flex gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Dönem seçilmezse yılın tamamı taranır. Ay seçilirse o ayın 1'i ile son günü arası
            (içinde bulunulan ayda bugüne kadar) taranır. Sonuçlar Luca'nın kendi fiş listesinden okunur.
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
            <span className="text-blue-200">Bulunan fiş: {toplamFis}</span>
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
              {sonuclar.map((s) => {
                const acik = acikSatir === s.clientId
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
                          onClick={() => setAcikSatir(acik ? null : s.clientId)}
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

          {acikSatir != null && (() => {
            const s = sonuclar.find((x) => x.clientId === acikSatir)
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
    </div>
  )
}
