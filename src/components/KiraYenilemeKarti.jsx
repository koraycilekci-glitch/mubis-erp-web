import { useState, useMemo } from 'react'
import { Home, AlertTriangle, Clock, CheckCircle, X, Send, RefreshCw, Info } from 'lucide-react'
import {
  parseKiraBilgisi, hesaplaKiraTutarlari, kontratKalanGun,
  bekleyenTalep, yeniDonemTarihleri, kiraGecmisi, paraTR, tarihTR
} from '../utils/kiraUtils'
import { kiraYenilemeTalebiOlustur } from '../services/kiraService'
import { getKiraArtisOraniDetay } from '../data/defaults'

/**
 * Musteri portalinda kira bilgileri + kontrat yenileme bildirimi.
 * @param {'kart'|'uyari'} mod - 'kart': profil sayfasi detay karti, 'uyari': bildirim seridi
 */
export default function KiraYenilemeKarti({ client, clientId, clientName = '', mod = 'kart', onGuncelle }) {
  const [modalAcik, setModalAcik] = useState(false)
  const [yeniKira, setYeniKira] = useState('')
  const [aciklama, setAciklama] = useState('')
  const [kaydediyor, setKaydediyor] = useState(false)
  const [sonuc, setSonuc] = useState(null)

  const kb = useMemo(() => parseKiraBilgisi(client), [client])
  const tutarlar = useMemo(() => hesaplaKiraTutarlari(kb), [kb])
  const kalanGun = kontratKalanGun(kb)
  const talep = bekleyenTalep(kb)
  const donem = useMemo(() => yeniDonemTarihleri(kb), [kb])

  // Yenileme ayindaki yasal tavan (12 aylik TUFE ortalamasi)
  const tavan = useMemo(() => {
    const d = new Date(donem.baslangic + 'T00:00:00')
    if (isNaN(d)) return null
    return getKiraArtisOraniDetay(d.getFullYear(), d.getMonth() + 1)
  }, [donem.baslangic])

  const kiraci = kb.kiraTipi === 'kiraci'
  const uyariVar = kiraci && kalanGun !== null && kalanGun <= 60

  const onerilen = tavan && tutarlar.net
    ? Math.round(tutarlar.net * (1 + tavan.oran / 100) * 100) / 100
    : 0

  const gonder = async () => {
    setSonuc(null)
    const tutar = Number(String(yeniKira).replace(/\./g, '').replace(',', '.'))
    if (!tutar || tutar <= 0) {
      setSonuc({ ok: false, text: 'Lütfen geçerli bir kira tutarı girin.' })
      return
    }
    setKaydediyor(true)
    try {
      await kiraYenilemeTalebiOlustur(clientId, { yeniNetKira: tutar, aciklama, clientName })
      setSonuc({ ok: true, text: 'Bildiriminiz mali müşavirinize iletildi. Onaylandığında kira bilgileriniz güncellenecek.' })
      setYeniKira('')
      setAciklama('')
      onGuncelle?.()
      setTimeout(() => setModalAcik(false), 2200)
    } catch (e) {
      setSonuc({ ok: false, text: e.message || 'Bildirim gönderilemedi.' })
    } finally {
      setKaydediyor(false)
    }
  }

  const modal = modalAcik && (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4">
      <div className="bg-blue-950 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-blue-700/50 shadow-2xl">
        <div className="sticky top-0 bg-blue-950 border-b border-blue-700/50 p-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Yeni Kirayı Muhasebeye Bildir</h2>
            <p className="text-gray-400 text-xs mt-0.5">Onay sonrası kira bilgileriniz güncellenir</p>
          </div>
          <button onClick={() => setModalAcik(false)} className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-blue-800/30">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-blue-900/25 rounded-xl p-4 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Mevcut net kira</span>
              <span className="text-white font-semibold">{paraTR(tutarlar.net)} TL</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Mevcut kontrat</span>
              <span className="text-white">{tarihTR(kb.kiraBaslangic)} - {tarihTR(kb.kiraBitis)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Yeni dönem</span>
              <span className="text-yellow-400 font-medium">{tarihTR(donem.baslangic)} - {tarihTR(donem.bitis)}</span>
            </div>
          </div>

          {tavan && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3.5 text-xs text-yellow-200/90 flex gap-2.5">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                Yasal azami artış oranı <b>%{tavan.oran}</b> (12 aylık TÜFE ortalaması).
                {onerilen > 0 && (
                  <> Bu orana göre yeni kira <b>{paraTR(onerilen)} TL</b> olur.{' '}
                    <button
                      onClick={() => setYeniKira(String(onerilen))}
                      className="underline hover:text-white"
                    >Bu tutarı kullan</button>
                  </>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block text-gray-400 text-sm mb-1.5">Yeni Net Kira Tutarı (TL)</label>
            <input
              type="number"
              inputMode="decimal"
              value={yeniKira}
              onChange={e => setYeniKira(e.target.value)}
              placeholder="Örnek: 32500"
              className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2.5 text-white text-lg font-semibold focus:outline-none focus:border-yellow-400"
            />
            {kb.stopaj === 'var' && Number(yeniKira) > 0 && (
              <p className="text-gray-500 text-xs mt-1.5">
                Brüt karşılığı: {paraTR(Number(yeniKira) / 0.8)} TL (stopaj %20 dahil)
              </p>
            )}
          </div>

          <div>
            <label className="block text-gray-400 text-sm mb-1.5">Açıklama (isteğe bağlı)</label>
            <textarea
              rows={3}
              value={aciklama}
              onChange={e => setAciklama(e.target.value)}
              placeholder="Örnek: Ev sahibiyle 32.500 TL üzerinden anlaşıldı, sözleşme yenilendi."
              className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
            />
          </div>

          {sonuc && (
            <div className={`rounded-xl p-3 text-sm ${sonuc.ok ? 'bg-green-500/15 text-green-300 border border-green-500/30' : 'bg-red-500/15 text-red-300 border border-red-500/30'}`}>
              {sonuc.text}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setModalAcik(false)}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-300 bg-blue-900/40 hover:bg-blue-800/50"
            >
              Vazgeç
            </button>
            <button
              onClick={gonder}
              disabled={kaydediyor}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-yellow-500 text-blue-950 hover:bg-yellow-400 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {kaydediyor ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Muhasebeye Bildir
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // ── Bildirim seridi modu ──
  if (mod === 'uyari') {
    if (!kiraci || (!uyariVar && !talep)) return null

    if (talep) {
      return (
        <>
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 flex items-start gap-3">
            <Clock className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm">Kira bildiriminiz onay bekliyor</p>
              <p className="text-blue-200/70 text-xs mt-1">
                Bildirdiğiniz yeni net kira: <b>{paraTR(talep.yeniNetKira)} TL</b> —
                dönem {tarihTR(talep.yeniBaslangic)} - {tarihTR(talep.yeniBitis)}.
                Mali müşaviriniz onayladığında kira bilgileriniz güncellenecek.
              </p>
            </div>
          </div>
          {modal}
        </>
      )
    }

    const gecti = kalanGun < 0
    return (
      <>
        <div className={`rounded-2xl p-4 border ${gecti ? 'bg-red-500/10 border-red-500/30' : 'bg-yellow-500/10 border-yellow-500/30'}`}>
          <div className="flex items-start gap-3">
            <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${gecti ? 'text-red-400' : 'text-yellow-400'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm">
                {gecti
                  ? `Kira kontratınızın süresi ${Math.abs(kalanGun)} gün önce doldu`
                  : `Kira kontrat tarihiniz yaklaşıyor — ${kalanGun} gün kaldı`}
              </p>
              <p className={`text-xs mt-1 ${gecti ? 'text-red-200/70' : 'text-yellow-200/80'}`}>
                Kontrat bitişi: <b>{tarihTR(kb.kiraBitis)}</b> • Mevcut net kira: <b>{paraTR(tutarlar.net)} TL</b>
                <br />Yeni kirayı muhasebeye bildirmek için tıklayın.
              </p>
              <button
                onClick={() => setModalAcik(true)}
                className="mt-3 bg-yellow-500 text-blue-950 text-xs font-bold px-4 py-2 rounded-lg hover:bg-yellow-400 flex items-center gap-2"
              >
                <Send className="w-3.5 h-3.5" />
                Yeni Kirayı Muhasebeye Bildir
              </button>
            </div>
          </div>
        </div>
        {modal}
      </>
    )
  }

  // ── Profil karti modu ──
  if (!kiraci && !kb.kiraTipi) return null

  return (
    <>
      <div className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Home className="w-5 h-5 text-yellow-400" /> Kira Bilgileri
        </h3>

        {!kiraci ? (
          <p className="text-gray-400 text-sm">İş yeri mülkiyeti size ait (mal sahibi).</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-blue-900/20 rounded-xl p-4">
                <p className="text-gray-400 text-xs mb-1">Kira Başlangıç</p>
                <p className="text-white font-medium">{tarihTR(kb.kiraBaslangic)}</p>
              </div>
              <div className="bg-blue-900/20 rounded-xl p-4">
                <p className="text-gray-400 text-xs mb-1">Kira Bitiş</p>
                <p className="text-white font-medium">{tarihTR(kb.kiraBitis)}</p>
                {kalanGun !== null && (
                  <p className={`text-xs mt-1 ${kalanGun < 0 ? 'text-red-400' : kalanGun <= 60 ? 'text-yellow-400' : 'text-gray-500'}`}>
                    {kalanGun < 0 ? `${Math.abs(kalanGun)} gün önce doldu` : `${kalanGun} gün kaldı`}
                  </p>
                )}
              </div>
              <div className="bg-blue-900/20 rounded-xl p-4">
                <p className="text-gray-400 text-xs mb-1">Net Kira (ödenen)</p>
                <p className="text-white font-semibold text-lg">{paraTR(tutarlar.net)} TL</p>
              </div>
              <div className="bg-blue-900/20 rounded-xl p-4">
                <p className="text-gray-400 text-xs mb-1">Brüt Kira</p>
                <p className="text-white font-semibold text-lg">{paraTR(tutarlar.brut)} TL</p>
                <p className="text-gray-500 text-xs mt-1">
                  {tutarlar.stopajVar
                    ? `Stopaj %20: ${paraTR(tutarlar.stopaj)} TL`
                    : 'Stopaj yok (brüt = net)'}
                </p>
              </div>
            </div>
            {kiraGecmisi(kb).length > 0 && (
              <details className="mt-4 rounded-xl border border-blue-800/40 bg-blue-950/30 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-white">Eski kira kayıtlarını göster</summary>
                <div className="mt-3 space-y-2">
                  {kiraGecmisi(kb).slice().reverse().map((donem, index) => (
                    <div key={`${donem.kayitTarihi || 'donem'}-${index}`} className="grid grid-cols-2 gap-2 rounded-lg bg-blue-900/30 p-3 text-xs sm:grid-cols-4">
                      <span className="text-slate-400">Dönem<br /><b className="text-slate-200">{tarihTR(donem.kiraBaslangic)} - {tarihTR(donem.kiraBitis)}</b></span>
                      <span className="text-slate-400">Net<br /><b className="text-slate-200">{paraTR(donem.netKira)} TL</b></span>
                      <span className="text-slate-400">Brüt<br /><b className="text-slate-200">{paraTR(donem.brutKira)} TL</b></span>
                      <span className="text-slate-400">Kayıt<br /><b className="text-slate-200">{tarihTR(donem.kayitTarihi)}</b></span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {talep ? (
              <div className="mt-4 bg-blue-500/10 border border-blue-500/30 rounded-xl p-3.5 flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-blue-200/80 text-xs">
                  <b className="text-white">Onay bekliyor:</b> {paraTR(talep.yeniNetKira)} TL —
                  {' '}{tarihTR(talep.yeniBaslangic)} - {tarihTR(talep.yeniBitis)}.
                  Mali müşaviriniz onayladığında bilgiler güncellenecek.
                </p>
              </div>
            ) : kb.yenilemeTalebi?.durum === 'onaylandi' ? (
              <div className="mt-4 bg-green-500/10 border border-green-500/30 rounded-xl p-3.5 flex items-start gap-2.5">
                <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                <p className="text-green-200/80 text-xs">
                  Son kira yenilemeniz {tarihTR(kb.yenilemeTalebi.onayTarihi)} tarihinde onaylandı.
                </p>
              </div>
            ) : null}

            {!talep && (
              <button
                onClick={() => setModalAcik(true)}
                className={`mt-4 w-full sm:w-auto text-sm font-semibold px-5 py-2.5 rounded-lg flex items-center justify-center gap-2 ${
                  uyariVar
                    ? 'bg-yellow-500 text-blue-950 hover:bg-yellow-400'
                    : 'bg-blue-800/50 text-blue-100 hover:bg-blue-700/60 border border-blue-600/40'
                }`}
              >
                <Send className="w-4 h-4" />
                Yeni Kirayı Muhasebeye Bildir
              </button>
            )}
          </>
        )}
      </div>
      {modal}
    </>
  )
}
