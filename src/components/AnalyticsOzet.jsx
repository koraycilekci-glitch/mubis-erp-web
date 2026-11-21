// MUBiS - Yonetici paneli GA4 raporu (durum + secim + ozet)
//
// Veri /api/analytics ucundan, baglanti durumu /api/drive-auth uclarindan gelir.
// Baglanti kurulmamissa kullanici tek tikla Google izni verir; mulk numarasi
// olcum kimliginden otomatik bulunur, bulunamazsa listeden secilir.
import { useCallback, useEffect, useState } from 'react'
import { BarChart3, Loader2, RefreshCw, Info, Link2, AlertTriangle } from 'lucide-react'
import { analyticsRaporu } from '../services/analyticsService'
import { supabase } from '../lib/supabase'

const GUN_ETIKETI = { 7: 'Son 7 gün', 30: 'Son 30 gün', 90: 'Son 90 gün' }

function tarihAraligi(gun) {
  const bitis = new Date()
  const bas = new Date(bitis.getTime() - (gun - 1) * 24 * 60 * 60 * 1000)
  const bicim = (d) => d.toISOString().slice(0, 10)
  return { baslangic: bicim(bas), bitis: bicim(bitis) }
}

async function yetkiliFetch(yol, secenek) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Oturum bulunamadı; yeniden giriş yapın.')
  const r = await fetch(yol, {
    ...secenek,
    headers: { ...(secenek?.headers || {}), Authorization: `Bearer ${session.access_token}` }
  })
  return await r.json().catch(() => ({}))
}

export default function AnalyticsOzet({ gun = 30 }) {
  const [durum, setDurum] = useState('bekliyor')
  const [veri, setVeri] = useState(null)
  const [hata, setHata] = useState('')
  const [meslek, setMeslek] = useState('')

  const [baglanti, setBaglanti] = useState(null)   // { bagli, mulk, mulkAd, adaylar, hata }
  const [baglaniyor, setBaglaniyor] = useState(false)
  const [baglantiHata, setBaglantiHata] = useState('')
  const [seciliyor, setSeciliyor] = useState(false)
  const [elleMulk, setElleMulk] = useState('')
  const [apiKapali, setApiKapali] = useState(null)

  // 1) Baglanti durumunu sor (mulk otomatik secilebilir)
  const baglantiSor = useCallback(async () => {
    try {
      const j = await yetkiliFetch('/api/drive-auth?action=analytics-status')
      if (j.ok) {
        setBaglanti(j)
        if (j.hata) setBaglantiHata(j.hata)
        return j
      }
      setBaglantiHata(j.error || 'Durum alınamadı.')
    } catch (e) {
      setBaglantiHata(e?.message || String(e))
    }
    return null
  }, [])

  // 2) Rapor
  const yukle = useCallback(async () => {
    setDurum('yukleniyor')
    setHata('')
    setApiKapali(null)
    const aralik = tarihAraligi(Number(gun) || 30)
    const istek = {
      ...aralik,
      metrikler: ['activeUsers', 'sessions', 'screenPageViews'],
      boyutlar: ['date'],
      limit: 400
    }
    // 2.8.359: ilk deneme basarisiz olursa bir kez daha dene (soguk baslangic /
    // gecici ag hatasi kullanicinin Yenile'ye basmasini gerektirmesin).
    let sonuc = await analyticsRaporu(istek)
    if (!sonuc.ok && ['ag-hatasi', 'zaman-asimi', 'sunucu-hatasi'].includes(String(sonuc.reason))) {
      await new Promise((r) => setTimeout(r, 1200))
      sonuc = await analyticsRaporu(istek)
    }
    if (!sonuc.ok) {
      setVeri(null)
      setDurum(sonuc.reason === 'yapilandirilmadi' || sonuc.reason === 'yetki-yok' ? 'yapilandirilmadi' : 'hata')
      setHata(sonuc.error || '')
      setApiKapali(sonuc.reason === 'api-kapali' ? { link: sonuc.link, api: sonuc.api } : null)
      // Rapor alinamadiysa baglanti durumunu tazele (mulk secimi gerekiyor olabilir)
      if (sonuc.reason === 'yapilandirilmadi' || sonuc.reason === 'yetki-yok') await baglantiSor()
      return
    }
    setVeri(sonuc)
    setApiKapali(null)
    setDurum('hazir')
  }, [gun, baglantiSor])

  useEffect(() => { void yukle() }, [yukle])

  // Google izin akisindan donuste (?ga4=...) durumu yenile
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search)
      if (p.get('ga4')) {
        setMeslek(p.get('ga4') === 'ok' ? 'Google bağlantısı kuruldu.' : 'Google bağlantısı kuruldu ancak mülk otomatik bulunamadı; listeden seçin.')
        const yeni = new URLSearchParams(p)
        yeni.delete('ga4'); yeni.delete('mulk')
        window.history.replaceState({}, '', window.location.pathname + (yeni.toString() ? '?' + yeni.toString() : ''))
        void baglantiSor().then(() => yukle())
      }
    } catch { /* yoksay */ }
  }, [baglantiSor, yukle])

  const baglantiBaslat = async () => {
    setBaglaniyor(true)
    setBaglantiHata('')
    try {
      const j = await yetkiliFetch('/api/drive-auth?action=analytics-start')
      if (!j.ok || !j.url) throw new Error(j.error || 'Bağlantı başlatılamadı.')
      window.location.href = j.url
    } catch (e) {
      setBaglantiHata(e?.message || String(e))
      setBaglaniyor(false)
    }
  }

  const mulkSec = async (aday) => {
    setSeciliyor(true)
    setBaglantiHata('')
    try {
      const j = await yetkiliFetch('/api/drive-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'analytics-property', mulk: aday.id, ad: aday.ad })
      })
      if (!j.ok) throw new Error(j.error || 'Mülk kaydedilemedi.')
      await baglantiSor()
      await yukle()
    } catch (e) {
      setBaglantiHata(e?.message || String(e))
    } finally {
      setSeciliyor(false)
    }
  }

  const toplam = veri?.toplamlar || {}
  const adaylar = baglanti?.adaylar || []
  const mulkYok = baglanti?.bagli && !baglanti?.mulk

  return (
    <div className="rounded-xl border border-blue-400/20 bg-blue-950/50 p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-300" />
          <h3 className="font-semibold text-white">Site İstatistikleri</h3>
          <span className="text-xs text-blue-300">({GUN_ETIKETI[gun] || `Son ${gun} gün`})</span>
          {baglanti?.mulk && (
            <span className="text-[11px] text-blue-300/70">
              mülk {baglanti.mulk}{baglanti.mulkAd ? ` · ${baglanti.mulkAd}` : ''}
            </span>
          )}
        </div>
        <button
          onClick={() => void yukle()}
          className="text-blue-300 hover:text-white inline-flex items-center gap-1 text-xs"
          disabled={durum === 'yukleniyor'}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${durum === 'yukleniyor' ? 'animate-spin' : ''}`} /> Yenile
        </button>
      </div>

      {meslek && <div className="mb-3 text-xs text-emerald-300">{meslek}</div>}

      {durum === 'yukleniyor' && (
        <div className="text-sm text-blue-200 inline-flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Yükleniyor…
          <span className="text-xs text-blue-300/70">(Google Analytics verisi alınıyor)</span>
        </div>
      )}

      {(durum === 'yapilandirilmadi' || mulkYok) && (
        <div className="text-xs text-blue-200 flex flex-col gap-3">
          <div className="flex gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {!baglanti?.bagli
                ? 'Henüz bağlantı kurulmadı. Google hesabınızla salt okunur izin verin.'
                : 'Google bağlantısı kuruldu. Aşağıdaki listeden raporunu görmek istediğiniz Analytics mülkünü seçin.'}
            </span>
          </div>

          {baglantiHata && (
            <div className="text-amber-200 flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{baglantiHata}</span>
            </div>
          )}

          {!baglanti?.bagli && (
            <button
              onClick={baglantiBaslat}
              disabled={baglaniyor}
              className="self-start inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
            >
              {baglaniyor ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              Analytics Bağla
            </button>
          )}

          {baglanti?.bagli && adaylar.length > 0 && (
            <div className="rounded-lg border border-blue-400/20 bg-blue-900/30 divide-y divide-blue-400/10">
              <div className="px-3 py-2 text-[11px] text-blue-300">
                Erişilebilen mülkler ({adaylar.length})
              </div>
              {adaylar.map((a) => (
                <button
                  key={a.id}
                  onClick={() => void mulkSec(a)}
                  disabled={seciliyor}
                  className={`w-full text-left px-3 py-2 hover:bg-blue-800/30 disabled:opacity-50 ${a.eslesir ? 'bg-cyan-500/10' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white font-medium">{a.ad || '(isimsiz mülk)'}</span>
                    {a.eslesir && <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/25 text-cyan-200">ölçüm kimliği eşleşiyor</span>}
                  </div>
                  <div className="text-[11px] text-blue-300/80">
                    mülk {a.id}{a.hesap ? ` · ${a.hesap}` : ''}{a.kimlikler.length ? ` · ${a.kimlikler.join(', ')}` : ''}
                  </div>
                </button>
              ))}
            </div>
          )}

          {baglanti?.bagli && adaylar.length === 0 && (
            <div className="text-amber-200 text-[11px]">
              Bu Google hesabında erişilebilen Analytics mülkü bulunamadı. Mülk numarasını aşağıya elle girebilirsiniz
              (Google Analytics → Yönetici → Mülk ayarları sayfasındaki <strong>Mülk Kimliği</strong>).
            </div>
          )}

          {baglanti?.bagli && (
            <div className="flex flex-wrap items-end gap-2 pt-1">
              <div>
                <label className="block text-[11px] text-blue-300 mb-1">Mülk numarası (elle)</label>
                <input
                  value={elleMulk}
                  onChange={(e) => setElleMulk(e.target.value.replace(/\D/g, ''))}
                  placeholder="örn. 456123789"
                  inputMode="numeric"
                  className="w-40 bg-blue-900/40 border border-blue-700/50 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <button
                onClick={() => void mulkSec({ id: elleMulk, ad: 'Elle girildi' })}
                disabled={seciliyor || !/^\d{4,20}$/.test(elleMulk)}
                className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-40"
              >
                {seciliyor ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          )}
        </div>
      )}

      {durum === 'hata' && (
        <div className="text-xs text-amber-200 flex flex-col gap-2">
          <div className="flex gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Rapor alınamadı: {hata || 'bilinmeyen hata'}</span>
          </div>
          {apiKapali?.link && (
            <a
              href={apiKapali.link}
              target="_blank"
              rel="noreferrer"
              className="self-start rounded-lg bg-amber-500/20 border border-amber-400/40 px-3 py-1.5 text-amber-100 hover:bg-amber-500/30"
            >
              {apiKapali.api} API'sini etkinleştir →
            </a>
          )}
        </div>
      )}

      {durum === 'hazir' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { ad: 'Aktif kullanıcı', deger: toplam.activeUsers },
            { ad: 'Oturum', deger: toplam.sessions },
            { ad: 'Sayfa görüntüleme', deger: toplam.screenPageViews }
          ].map((k) => (
            <div key={k.ad} className="rounded-lg bg-blue-900/40 border border-blue-400/10 px-3 py-3">
              <div className="text-xs text-blue-300">{k.ad}</div>
              <div className="text-xl font-semibold text-white">
                {Number(k.deger || 0).toLocaleString('tr-TR')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
