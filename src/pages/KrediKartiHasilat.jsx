// Kredi Kartı Hasılatı (POS) — admin toplu görünüm sayfası.
//
// Seçilen dönem (yıl/ay) için ya tek müşteri ya da tüm seçili müşteriler
// gösterilir. Her müşteri için kredi_karti_hasilat kaydındaki
//   banka_pos_tutar    -> Banka POS toplamı
//   odeme_para_tutar   -> Ödeme/e-Para Kuruluşu toplamı
//   toplam_tutar       -> Toplam
// ve metadata içindeki banka_detay / odeme_detay listeleri kullanılır.
// Müşteri satırına tıklanınca detay tabloları açılır/kapanır.
import { useEffect, useMemo, useState } from 'react'
import { clientDisplayName } from '../utils/clientDisplay'
import { useClients } from '../hooks/useClients'
import { krediKartiHasilatGetir } from '../services/dvsSorguService'
import { CreditCard, Wallet, ChevronDown, ChevronUp, Loader2, RefreshCw, Users } from 'lucide-react'

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

function paraYaz(v) {
  const n = Number(v)
  return (isFinite(n) ? n : 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const sayi = (v) => {
  const n = Number(v)
  return isFinite(n) ? n : 0
}

function musteriAdi(c) {
  return clientDisplayName(c)
}

export default function KrediKartiHasilat() {
  const { clients } = useClients()
  const bugun = new Date()

  const [yil, setYil] = useState(String(bugun.getFullYear()))
  const [ay, setAy] = useState(String(bugun.getMonth() + 1))
  // '' = tüm müşteriler, aksi halde tek müşteri id'si
  const [seciliId, setSeciliId] = useState('')
  const [kapsam, setKapsam] = useState('tum') // 'tum' | 'tek'
  const [kayitlar, setKayitlar] = useState({}) // clientId -> hasilat kaydı
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState('')
  const [acik, setAcik] = useState(() => new Set()) // detayı açık müşteri id'leri

  const siraliMusteriler = useMemo(
    () => [...(clients || [])].sort((a, b) => musteriAdi(a).localeCompare(musteriAdi(b), 'tr')),
    [clients]
  )

  const hedefMusteriler = useMemo(() => {
    if (kapsam === 'tek') return siraliMusteriler.filter(c => String(c.id) === String(seciliId))
    return siraliMusteriler
  }, [kapsam, seciliId, siraliMusteriler])

  const yukle = async () => {
    if (!hedefMusteriler.length) { setKayitlar({}); return }
    setYukleniyor(true)
    setHata('')
    try {
      const sonuc = []
      // 8'erli gruplar halinde paralel sorgu — çok müşteride de hızlı kalsın
      for (let i = 0; i < hedefMusteriler.length; i += 8) {
        const grup = hedefMusteriler.slice(i, i + 8)
        const parca = await Promise.all(grup.map(async (c) => {
          try {
            const h = await krediKartiHasilatGetir({ clientId: c.id, yil: Number(yil), ay: Number(ay) })
            return [String(c.id), h]
          } catch {
            return [String(c.id), null]
          }
        }))
        sonuc.push(...parca)
      }
      setKayitlar(Object.fromEntries(sonuc))
    } catch (e) {
      setHata(e?.message || 'Kredi kartı hasılatı yüklenemedi')
    } finally {
      setYukleniyor(false)
    }
  }

  useEffect(() => { yukle() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [yil, ay, kapsam, seciliId, clients?.length])

  const liste = useMemo(() => hedefMusteriler.map(c => ({
    client: c,
    h: kayitlar[String(c.id)] || null
  })), [hedefMusteriler, kayitlar])

  const toplamlar = useMemo(() => liste.reduce((t, { h }) => {
    const hamBanka = sayi(h?.banka_pos_tutar)
    const odeme = sayi(h?.odeme_para_tutar)
    // GİB "Banka POS" tutarı ödeme/e-para kuruluşu tahsilatını da içerebilir.
    // Banka POS = GİB banka POS − Ödeme/e-Para; hiç banka POS yoksa (GİB
    // banka POS = 0) sonuç negatife düşmemeli, 0 kalmalı. Tahsilatın tamamı
    // ödeme kuruluşundan geldiyse ödeme kuruluşu tutarı = toplam POS'tur.
    const banka = Math.max(0, hamBanka - odeme)
    return {
      banka: t.banka + banka,
      odeme: t.odeme + odeme,
      toplam: t.toplam + banka + odeme
    }
  }, { banka: 0, odeme: 0, toplam: 0 }), [liste])

  const detayAc = (id) => {
    setAcik(prev => {
      const yeni = new Set(prev)
      if (yeni.has(id)) yeni.delete(id); else yeni.add(id)
      return yeni
    })
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2.5 bg-yellow-500/15 rounded-xl border border-yellow-500/30">
          <CreditCard className="w-5 h-5 text-yellow-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white">Kredi Kartı Hasılatı (POS)</h1>
          <p className="text-xs text-gray-400">Dijital Vergi Dairesi'nden alınan banka POS ve ödeme/e-para kuruluşu hasılatları. Müşteri satırına tıklayınca detay açılır.</p>
        </div>
      </div>

      {/* Filtreler */}
      <div className="bg-blue-950/30 border border-blue-800/30 rounded-2xl p-4 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">Kapsam</label>
            <div className="inline-flex rounded-xl overflow-hidden border border-blue-700/50 w-full">
              <button
                onClick={() => setKapsam('tum')}
                className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${kapsam === 'tum' ? 'bg-blue-500 text-white' : 'bg-blue-900/50 text-gray-400 hover:text-white'}`}
              >
                <Users className="w-3.5 h-3.5 inline mr-1" />Tümü
              </button>
              <button
                onClick={() => setKapsam('tek')}
                className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${kapsam === 'tek' ? 'bg-blue-500 text-white' : 'bg-blue-900/50 text-gray-400 hover:text-white'}`}
              >
                Tek Müşteri
              </button>
            </div>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">Müşteri</label>
            <select
              value={seciliId}
              onChange={(e) => { setSeciliId(e.target.value); if (e.target.value) setKapsam('tek') }}
              className="w-full bg-blue-900/60 border border-blue-700/50 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-yellow-500/50"
            >
              <option value="">— Müşteri seçin —</option>
              {siraliMusteriler.map(c => (
                <option key={c.id} value={c.id}>{musteriAdi(c)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">Yıl</label>
            <select value={yil} onChange={e => setYil(e.target.value)} className="w-full bg-blue-900/60 border border-blue-700/50 rounded-xl px-3 py-2.5 text-white text-sm">
              {Array.from({ length: 7 }, (_, i) => bugun.getFullYear() + 1 - i).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">Ay</label>
            <select value={ay} onChange={e => setAy(e.target.value)} className="w-full bg-blue-900/60 border border-blue-700/50 rounded-xl px-3 py-2.5 text-white text-sm">
              {AYLAR.map((ad, i) => <option key={ad} value={i + 1}>{ad}</option>)}
            </select>
          </div>
          <div>
            <button
              onClick={yukle}
              disabled={yukleniyor || (kapsam === 'tek' && !seciliId)}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-yellow-400 to-yellow-500 text-blue-950 font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {yukleniyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {yukleniyor ? 'Yükleniyor…' : 'Getir'}
            </button>
          </div>
        </div>
      </div>

      {hata && (
        <div className="mb-5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/40 text-red-300 text-sm">{hata}</div>
      )}

      {/* Özet kutuları */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <OzetKutu baslik="Banka POS" deger={toplamlar.banka} renk="text-blue-300" border="border-blue-500/30" />
        <OzetKutu baslik="Ödeme/e-Para Kuruluşu" deger={toplamlar.odeme} renk="text-purple-300" border="border-purple-500/30" />
        <OzetKutu baslik="Toplam" deger={toplamlar.toplam} renk="text-yellow-300" border="border-yellow-500/30" kalin />
      </div>

      {/* Müşteri listesi */}
      <div className="bg-blue-950/30 border border-blue-800/30 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-blue-800/30">
          <h2 className="text-sm font-semibold text-white">Müşteri Bazlı Hasılat</h2>
          <span className="text-xs text-gray-400">
            {kapsam === 'tek'
              ? (seciliId ? '1 müşteri' : 'müşteri seçilmedi')
              : `${liste.length} müşteri`}
            {' · '}{AYLAR[Number(ay) - 1]} {yil}
          </span>
        </div>

        {yukleniyor && !liste.length ? (
          <div className="py-12 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Yükleniyor…
          </div>
        ) : !liste.length ? (
          <div className="py-12 text-center text-gray-500 text-sm">Müşteri bulunamadı.</div>
        ) : (
          <div className="divide-y divide-blue-800/20 max-h-[70vh] overflow-y-auto">
            {liste.map(({ client, h }) => {
              const id = String(client.id)
              const acikMi = acik.has(id)
              const bankaDetay = Array.isArray(h?.metadata?.banka_detay) ? h.metadata.banka_detay : []
              const odemeDetay = Array.isArray(h?.metadata?.odeme_detay) ? h.metadata.odeme_detay : []
              const kayitVar = !!h && (sayi(h.banka_pos_tutar) || sayi(h.odeme_para_tutar))
              return (
                <div key={id}>
                  <button
                    onClick={() => detayAc(id)}
                    className="w-full flex flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-blue-900/30 transition-colors"
                  >
                    <span className="text-gray-400 shrink-0">
                      {acikMi ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-sm truncate ${kayitVar ? 'text-white' : 'text-gray-500'}`}>{musteriAdi(client)}</span>
                      <span className="block text-[11px] text-gray-500">
                        {h?.sorgu_tarihi ? `Son sorgu: ${h.sorgu_tarihi}` : 'Bu dönem için kayıt yok'}
                        {bankaDetay.length || odemeDetay.length ? ` · ${bankaDetay.length + odemeDetay.length} detay` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-right w-36">
                      <span className="block text-[10px] text-gray-500">Banka POS</span>
                      <span className="block text-sm text-blue-300 whitespace-nowrap">{paraYaz(Math.max(0, sayi(h?.banka_pos_tutar) - sayi(h?.odeme_para_tutar)))} TL</span>
                    </span>
                    <span className="shrink-0 text-right w-36">
                      <span className="block text-[10px] text-gray-500">Ödeme/e-Para</span>
                      <span className="block text-sm text-purple-300 whitespace-nowrap">{paraYaz(h?.odeme_para_tutar)} TL</span>
                    </span>
                    <span className="shrink-0 text-right w-40">
                      <span className="block text-[10px] text-gray-500">Toplam</span>
                      <span className="block text-sm font-semibold text-yellow-300 whitespace-nowrap">
                        {paraYaz(Math.max(0, sayi(h?.banka_pos_tutar) - sayi(h?.odeme_para_tutar)) + sayi(h?.odeme_para_tutar))} TL
                      </span>
                    </span>
                  </button>

                  {acikMi && (
                    <div className="px-4 pb-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <DetayTablo baslik="Banka POS Detayı" ikon={<CreditCard className="w-3.5 h-3.5" />} liste={bankaDetay} renk="text-blue-300" />
                      <DetayTablo baslik="Ödeme/e-Para Kuruluşu Detayı" ikon={<Wallet className="w-3.5 h-3.5" />} liste={odemeDetay} renk="text-purple-300" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <p className="text-[11px] text-gray-600 mt-3">
        Not: GİB "Banka POS" tutarı ödeme/e-para kuruluşu tahsilatını da içerebilir. <strong>Banka POS = GİB banka POS − Ödeme/e-Para</strong> (negatife düşmez, 0 kalır), <strong>Toplam = Banka POS + Ödeme/e-Para</strong>. Banka POS yoksa ödeme kuruluşu tutarı doğrudan toplam POS olur.
      </p>
    </div>
  )
}

function OzetKutu({ baslik, deger, renk, border, kalin }) {
  return (
    <div className={`bg-blue-950/40 border ${border} rounded-xl p-4`}>
      <div className="text-xs text-gray-400 mb-1">{baslik}</div>
      <div className={`${kalin ? 'text-2xl' : 'text-xl'} font-bold ${renk}`}>
        {paraYaz(deger)} <span className="text-sm font-normal text-gray-500">TL</span>
      </div>
    </div>
  )
}

function DetayTablo({ baslik, ikon, liste, renk }) {
  const satirlar = Array.isArray(liste) ? liste : []
  const toplam = satirlar.reduce((s, d) => s + sayi(d?.tutar), 0)
  return (
    <div className="bg-blue-950/50 rounded-lg p-3 border border-blue-800/30">
      <div className="flex items-center justify-between mb-2">
        <h4 className={`text-xs font-semibold flex items-center gap-1.5 ${renk}`}>{ikon}{baslik}</h4>
        <span className="text-xs text-gray-400">{satirlar.length} kayıt</span>
      </div>
      {satirlar.length ? (
        <div className="overflow-x-auto max-h-72 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-blue-950">
              <tr className="text-left text-gray-400 border-b border-blue-800/30">
                <th className="pb-2 pr-2">#</th>
                <th className="pb-2 pr-2">Banka / Kuruluş</th>
                <th className="pb-2 pr-2">Üye İş Yeri No</th>
                <th className="pb-2 text-right">Tutar</th>
              </tr>
            </thead>
            <tbody>
              {satirlar.map((d, i) => {
                const m = Array.isArray(d?.metinler) ? d.metinler : []
                return (
                  <tr key={i} className="border-b border-blue-800/20 last:border-0">
                    <td className="py-1.5 pr-2 text-gray-500">{i + 1}</td>
                    <td className="py-1.5 pr-2 text-gray-300 whitespace-nowrap">{(m[1] || '').trim() || '-'}</td>
                    <td className="py-1.5 pr-2 text-gray-400 whitespace-nowrap">{(m[2] || '').trim() || '-'}</td>
                    <td className="py-1.5 text-right text-gray-200 whitespace-nowrap">{paraYaz(d?.tutar)} TL</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-blue-800/40 text-gray-300">
                <td colSpan={3} className="py-2 font-medium">Toplam</td>
                <td className="py-2 text-right font-semibold text-white whitespace-nowrap">{paraYaz(toplam)} TL</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="text-sm text-gray-500 py-4 text-center">Detay kaydı yok.</div>
      )}
    </div>
  )
}
