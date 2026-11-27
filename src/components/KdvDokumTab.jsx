import { useEffect, useState, useRef, useId } from 'react'
import {
  CreditCard, Receipt, RefreshCw, Loader2, Calendar, ArrowRightLeft, ChevronDown, ChevronUp, Ship, FileText, Download, Copy
} from 'lucide-react'
import {
  dvsSorgula,
  dvsSorguDurumGetir,
  krediKartiHasilatGetir,
  kdvDokumGetir,
  faturaKdvToplamlari,
  faturaKdvOranDokumu,
  kdvDokumEtiket,
  kdvDurumKartiGuncelle,
  gumrukKdvDokumu
} from '../services/dvsSorguService'
import { kdvOzelDokumler, tevkifatDurumOku, tevkifatOdendiYaz } from '../services/tevkifatService'
import { okcBildirimGetir } from '../services/okcSorguService'
import { okcHasilatOzeti } from '../utils/okcHasilat'

function paraYaz(v) {
  const n = Number(v)
  return (isFinite(n) ? n : 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })
}

// Sayıya çevir (geçersiz/boş -> 0)
function sayi(v) {
  const n = Number(v)
  return isFinite(n) ? n : 0
}

function okcDonemOku(anahtar, varsayilan) {
  try {
    const { y, m } = JSON.parse(sessionStorage.getItem(anahtar)) || {}
    if (Number.isInteger(y) && y >= 2000 && y <= 2100 && Number.isInteger(m) && m >= 1 && m <= 12) return { y, m }
  } catch { /* sessionStorage may be unavailable */ }
  return varsayilan
}

export default function KdvDokumTab({ clientId, oranDokumuGoster = false }) {
  const bugun = new Date()
  // Varsayilan donem: ana ekranla ayni — KDV beyan donemi (bir onceki ay).
  // Ayin 28'inden once onceki ay, 28 ve sonrasi bu ay.
  const oncekiAy = (y, m) => { m -= 1; if (m < 1) { m = 12; y -= 1 } return { y, m } }
  const varsayilanDonem = bugun.getDate() < 28
    ? oncekiAy(bugun.getFullYear(), bugun.getMonth() + 1)
    : { y: bugun.getFullYear(), m: bugun.getMonth() + 1 }

  const [yil, setYil] = useState(varsayilanDonem.y)
  const [ay, setAy] = useState(varsayilanDonem.m)
  const [pos, setPos] = useState(null)
  const [kdv109, setKdv109] = useState(null)
  const [kdv110, setKdv110] = useState(null)
  const [gumruk, setGumruk] = useState(null)
  const [ozelDokum, setOzelDokum] = useState(null)
  const [tevkifatOdendi, setTevkifatOdendi] = useState(false)
  const [tevkifatKaydediliyor, setTevkifatKaydediliyor] = useState(false)
  const [acikAylar, setAcikAylar] = useState(() => new Set())
  const [faturaKdv, setFaturaKdv] = useState(null)
  const [oranDokumu, setOranDokumu] = useState(null)
  const [oranHatasi, setOranHatasi] = useState('')
  const [oranYenileme, setOranYenileme] = useState(0)
  const [kdvDurum, setKdvDurum] = useState(null)
  const [yukleniyor, setYukleniyor] = useState({})
  const [hata, setHata] = useState('')
  const [mesaj, setMesaj] = useState('')
  const [posDetayAcik, setPosDetayAcik] = useState(false)
  const [gumrukDetayAcik, setGumrukDetayAcik] = useState(false)
  const [ozetYenileniyor, setOzetYenileniyor] = useState(false)
  const pollingRef = useRef(null)

  // OKC bildirimleri
  const okcDonemAnahtari = `mubis:okc-donem:${clientId}`
  const [okcDonem, setOkcDonem] = useState(() => ({ anahtar: okcDonemAnahtari, ...okcDonemOku(okcDonemAnahtari, varsayilanDonem) }))
  const { y: okcYil, m: okcAy } = okcDonem.anahtar === okcDonemAnahtari ? okcDonem : okcDonemOku(okcDonemAnahtari, varsayilanDonem)
  const [okcKayitlar, setOkcKayitlar] = useState([])
  const [okcYukleniyor, setOkcYukleniyor] = useState(false)
  const [okcHata, setOkcHata] = useState('')
  const [okcMesaj, setOkcMesaj] = useState('')
  const [okcDetayAcik, setOkcDetayAcik] = useState(false)
  const okcDetayId = useId()
  const okcIstek = useRef(0)

  useEffect(() => {
    setOkcKayitlar([])
    setOkcDetayAcik(false)
    setOkcMesaj('')
    setOkcHata('')
    setOkcYukleniyor(false)
    return () => { okcIstek.current += 1 }
  }, [clientId])

  useEffect(() => {
    if (!clientId) return
    let iptal = false
    const istek = okcIstek.current
    kdvDokumGetir({ clientId, yil: okcYil, ay: okcAy, tur: 'okc' }).then(dokum => {
      if (iptal || istek !== okcIstek.current || !dokum.sorgu_tarihi) return
      const kayitlar = Array.isArray(dokum.detaylar) ? dokum.detaylar : []
      setOkcKayitlar(kayitlar)
      const sorguTarihi = dokum.sorgu_tarihi.split('-').reverse().join('.')
      setOkcMesaj(kayitlar.length ? `Kayıtlı ÖKC sorgusu · ${sorguTarihi}` : `Kayıtlı ÖKC sorgusu · ${sorguTarihi} · Bildirim bulunamadı.`)
    }).catch(() => {
      if (!iptal && istek === okcIstek.current) setOkcHata('Kayıtlı ÖKC sonuçları okunamadı. Dönemi yeniden sorgulayabilirsiniz.')
    })
    return () => { iptal = true }
  }, [clientId, okcYil, okcAy])

  const okcDonemDegistir = (yeniYil, yeniAy) => {
    const donem = { y: yeniYil, m: yeniAy }
    try { sessionStorage.setItem(okcDonemAnahtari, JSON.stringify(donem)) } catch { /* sessionStorage may be unavailable */ }
    if (yeniYil === okcYil && yeniAy === okcAy) return
    setOkcDonem({ anahtar: okcDonemAnahtari, ...donem })
    setOkcKayitlar([])
    setOkcDetayAcik(false)
    setOkcMesaj('')
    setOkcHata('')
  }

  const okcSorgula = async (sorguYili = okcYil, sorguAyi = okcAy) => {
    if (okcYukleniyor) return
    const istek = ++okcIstek.current
    okcDonemDegistir(sorguYili, sorguAyi)
    setOkcYukleniyor(true)
    setOkcHata('')
    setOkcMesaj('ÖKC bildirimleri ve ayrıntıları okunuyor...')
    try {
      const res = await okcBildirimGetir({ clientId, yil: sorguYili, ay: sorguAyi, detay: true })
      if (istek !== okcIstek.current) return
      const kayitlar = res.kayitlar
      if (res.kayitHatasi) {
        setOkcKayitlar(mevcut => mevcut.length ? mevcut : kayitlar)
        setOkcMesaj('')
        setOkcHata(res.kayitHatasi)
        return
      }
      setOkcKayitlar(kayitlar)
      setOkcMesaj(kayitlar.length
        ? `${kayitlar.length} ÖKC bildirimi ayrıntılarıyla kaydedildi.`
        : 'Seçilen dönem için bildirim bulunmadığı kaydedildi.')
    } catch (e) {
      if (istek !== okcIstek.current) return
      setOkcHata(e?.message || 'ÖKC bildirimleri alınamadı')
      setOkcMesaj('')
    } finally {
      if (istek === okcIstek.current) setOkcYukleniyor(false)
    }
  }

  // Basliklar: Excel formatina yakin (ekrandaki tablo sutunlari)
  const OKC_BASLIKLAR = [
    ['firmaKodu', 'Firma Kodu'],
    ['firmaAdi', 'Firma Adı'],
    ['okcMarkasi', 'ÖKC Markası'],
    ['okcModeli', 'ÖKC Modeli'],
    ['cihazSicilNo', "Cihaz Sicil No'su"],
    ['bildirimZamani', 'Bildirim Zamanı'],
    ['bildirimYontemi', 'Bildirim Yöntemi']
  ]

  const okcTabloyuKopyala = async () => {
    const satirlar = [
      ['Dönem', 'Sıra', ...OKC_BASLIKLAR.map(([, b]) => b)].join('\t'),
      ...okcKayitlar.map((k, i) => [
        `${String(okcAy).padStart(2, '0')}.${okcYil}`,
        i + 1,
        ...OKC_BASLIKLAR.map(([a]) => k[a] || '')
      ].join('\t'))
    ]
    try {
      await navigator.clipboard.writeText(satirlar.join('\n'))
      setOkcMesaj('Tablo panoya kopyalandı.')
    } catch {
      setOkcHata('Panoya kopyalanamadı.')
    }
  }

  // Excel (CSV, noktali virgul — Turkce Excel uyumlu)
  const okcExcelIndir = () => {
    const kacis = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'
    const satirlar = [
      ['Dönem', 'Sıra', ...OKC_BASLIKLAR.map(([, b]) => b)].map(kacis).join(';'),
      ...okcKayitlar.map((k, i) => [
        `${String(okcAy).padStart(2, '0')}.${okcYil}`,
        i + 1,
        ...OKC_BASLIKLAR.map(([a]) => k[a] || '')
      ].map(kacis).join(';'))
    ]
    const blob = new Blob(['\uFEFF' + satirlar.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `okc-bildirim-${okcYil}-${String(okcAy).padStart(2, '0')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setOkcMesaj('CSV indirildi (Excel ile açabilirsiniz).')
  }

  const okcDetayKopyala = async (okcDetay) => {
    const d = okcDetay.detay || {}
    const satirlar = [
      `ÖKC Aylık Satış Rapor Bildirimi — ${String(okcAy).padStart(2, '0')}.${okcYil}`,
      ...OKC_BASLIKLAR.map(([a, b]) => `${b}: ${okcDetay[a] || '-'}`),
      ...(Object.keys(d).length ? ['', 'Detay:', ...Object.entries(d).map(([k, v]) => `${k}: ${v}`)] : [])
    ]
    try {
      await navigator.clipboard.writeText(satirlar.join('\n'))
      setOkcMesaj('Detay bilgileri panoya kopyalandı.')
    } catch {
      setOkcHata('Panoya kopyalanamadı.')
    }
  }

  const yukle = async () => {
    setHata('')
    try {
      // KDV durum kartını taze hesapla ve dogrudan kullan
      const kd = await kdvDurumKartiGuncelle(clientId, null, yil, ay)
      const [p, k109, k110, gm, fk, ozel] = await Promise.all([
        krediKartiHasilatGetir({ clientId, yil, ay }),
        kdvDokumGetir({ clientId, yil, ay, tur: '109' }),
        kdvDokumGetir({ clientId, yil, ay, tur: '110' }),
        gumrukKdvDokumu({ clientId, yil, ay }),
        faturaKdvToplamlari({ clientId, yil, ay }),
        kdvOzelDokumler({ clientId, yil: Number(yil), ay: Number(ay) }).catch(() => null)
      ])
      // Ham durum: null = kullanıcı hiç seçmedi, true/false = açık seçim
      const tvHam = await tevkifatDurumOku({ clientId, yil, ay }).catch(() => null)
      // GİB 109 (sorumlu sıfatıyla ödenen KDV) tutarı doluysa bu tutar
      // gerçekten ödenmiş demektir — Tevkifat Alış otomatik "Ödendi" olur.
      // Kullanıcı bilerek "Ödenmedi" seçtiyse üzerine yazılmaz.
      const gib109Tutar = Number(k109?.toplam_tutar) || 0
      const otomatikOdendi = tvHam === null && gib109Tutar > 0
        && (ozel?.tevkifatAlis?.toplam?.tevkifatKdv || 0) > 0
      let odendiSon = tvHam === true || otomatikOdendi
      if (otomatikOdendi) {
        try { await tevkifatOdendiYaz({ clientId, yil, ay, odendi: true }) } catch { /* yoksay */ }
      }
      console.log('[KdvDokumTab] yukle:', { yil, ay, fk, kd, gm, ozel, gib109Tutar, otomatikOdendi })
      setPos(p)
      setKdv109(k109)
      setKdv110(k110)
      setGumruk(gm)
      setFaturaKdv(fk)
      setOzelDokum(ozel)
      setTevkifatOdendi(odendiSon)
      setKdvDurum(kd)
    } catch (e) {
      setHata(e?.message || 'Veriler yüklenemedi')
    }
  }

  // Tevkifat KDV ödendi/ödenmedi. "Ödendi" ise tutar Sorumlu Sıfatıyla KDV
  // (109) kutusuna yazılır ve indirilebilir KDV toplamına EKLENİR.
  const tevkifatOdemeDegistir = async (odendi) => {
    if (tevkifatKaydediliyor) return
    setTevkifatKaydediliyor(true)
    setHata('')
    try {
      await tevkifatOdendiYaz({ clientId, yil, ay, odendi })
      setTevkifatOdendi(odendi)
      // KDV durum kartını yeniden hesapla — 109 kutusu ve indirilebilir
      // toplam anında güncellensin
      const kd = await kdvDurumKartiGuncelle(clientId, null, yil, ay)
      setKdvDurum(kd)
      setMesaj(odendi
        ? 'Tevkifat KDV "Ödendi" işaretlendi — indirilebilir KDV toplamına eklendi.'
        : 'Tevkifat KDV "Ödenmedi" işaretlendi — indirilebilir KDV toplamından çıkarıldı.')
    } catch (e) {
      setHata(e?.message || 'Ödeme durumu kaydedilemedi')
    } finally {
      setTevkifatKaydediliyor(false)
    }
  }

  const ayAcKapa = (anahtar) => setAcikAylar(prev => {
    const y = new Set(prev)
    if (y.has(anahtar)) y.delete(anahtar)
    else y.add(anahtar)
    return y
  })

  const indirilecekIlave = (tevkifatOdendi ? (ozelDokum?.tevkifatAlis?.toplam?.tevkifatKdv || 0) : 0)
    - Math.abs(ozelDokum?.satistanIade?.toplam?.kdv || 0)

  const hesaplanandanDusulecek = Math.abs(ozelDokum?.tevkifatSatis?.toplam?.tevkifatKdv || 0)
    + Math.abs(ozelDokum?.alistanIade?.toplam?.kdv || 0)

  useEffect(() => {
    if (!clientId) return
    yukle()
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [clientId, yil, ay])

  useEffect(() => {
    if (!clientId || !oranDokumuGoster) return
    let aktif = true
    setOranDokumu(null)
    setOranHatasi('')
    faturaKdvOranDokumu({ clientId, yil, ay })
      .then(sonuc => { if (aktif) setOranDokumu(sonuc) })
      .catch(error => { if (aktif) setOranHatasi(error?.message || 'Fatura KDV oranları yüklenemedi') })
    return () => { aktif = false }
  }, [clientId, yil, ay, oranDokumuGoster, oranYenileme])

  const sorgula = async (tur) => {
    setYukleniyor(prev => ({ ...prev, [tur]: true }))
    setHata('')
    setMesaj('')
    try {
      const res = await dvsSorgula({ clientId, yil, ay, tur })
      if (res?.status === 'isleniyor') {
        setMesaj(res.message || 'Sorgu arka planda çalışıyor...')
        baslatPolling(tur)
      } else {
        await yukle()
      }
    } catch (e) {
      setHata(e?.message || `${kdvDokumEtiket(tur)} sorgulanamadı`)
    } finally {
      setYukleniyor(prev => ({ ...prev, [tur]: false }))
    }
  }

  const baslatPolling = (tur) => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    setMesaj('Sorgu arka planda çalışıyor...')
    pollingRef.current = setInterval(async () => {
      try {
        const durum = await dvsSorguDurumGetir({ clientId, yil, ay, tur })
        if (durum.adim) setMesaj('Sorgu: ' + durum.adim)
        if (durum.status === 'basarili' || durum.status === 'sifir') {
          clearInterval(pollingRef.current)
          pollingRef.current = null
          setMesaj('')
          await yukle()
        } else if (durum.status === 'hata') {
          clearInterval(pollingRef.current)
          pollingRef.current = null
          setMesaj('')
          setHata(durum.hata || 'Sorgu sırasında hata oluştu')
        }
      } catch (e) {
        // polling hatalarini yoksay
      }
    }, 3000)
  }

  const aylar = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']

  return (
    <div className="space-y-6">
      {hata && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">
          {hata}
        </div>
      )}
      {mesaj && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-sm text-blue-300 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          {mesaj}
        </div>
      )}

      {/* Dönem + butonlar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-blue-950/30 border border-blue-800/30 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-blue-400" />
          <div className="flex gap-2">
            <select
              value={yil}
              onChange={(e) => setYil(Number(e.target.value))}
              className="bg-blue-950/50 border border-blue-800/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              {[...Array(5)].map((_, i) => {
                const y = bugun.getFullYear() - 2 + i
                return <option key={y} value={y}>{y}</option>
              })}
            </select>
            <select
              value={ay}
              onChange={(e) => setAy(Number(e.target.value))}
              className="bg-blue-950/50 border border-blue-800/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              {aylar.map((a, i) => (
                <option key={i + 1} value={i + 1}>{a}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <SorguBtn tur="pos" label="POS Sorgula" icon={<CreditCard className="w-4 h-4" />} yukleniyor={yukleniyor} onClick={() => sorgula('pos')} />
          <SorguBtn tur="109" label="KDV 109 Sorgula" icon={<Receipt className="w-4 h-4" />} yukleniyor={yukleniyor} onClick={() => sorgula('109')} />
          <SorguBtn tur="110" label="Gümrük Sorgula" icon={<Ship className="w-4 h-4" />} yukleniyor={yukleniyor} onClick={() => sorgula('110')} />
          <button
            onClick={() => okcSorgula(yil, ay)}
            disabled={okcYukleniyor}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-50 transition-colors"
            title="ÖKC Aylık Satış Rapor Bildirimlerini (hasılat) sorgular"
          >
            {okcYukleniyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
            ÖKC Hasılat Sorgula
          </button>
        </div>
      </div>

      {/* POS Özeti */}
      <div className="bg-blue-950/30 border border-blue-800/30 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-yellow-400" />
            Kredi Kartı Hasılatı (POS)
            {pos?.sorgu_tarihi && <span className="text-xs font-normal text-gray-400">· Son sorgu: {pos.sorgu_tarihi}</span>}
          </h3>
          <button
            onClick={() => setPosDetayAcik(a => !a)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 transition-colors"
          >
            {posDetayAcik ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {posDetayAcik ? 'Detayı Gizle' : 'Detay'}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* 2.8.37: GİB "Banka POS" tutarı ödeme/e-para kuruluşu tahsilatını da
              içerebilir. Net Banka POS = GİB banka POS − Ödeme/e-Para (negatife
              düşmez). Toplam = Banka POS + Ödeme/e-Para. Banka POS 0 ise
              (tahsilatın tamamı ödeme kuruluşundan geldiyse) Toplam doğrudan
              Ödeme/e-Para tutarıdır. Kredi Kartı Hasılatı (POS) sayfasıyla aynı kural. */}
          <Kutu baslik="Banka POS" deger={Math.max(0, sayi(pos?.banka_pos_tutar) - sayi(pos?.odeme_para_tutar))} renk="text-blue-300" />
          <Kutu baslik="Ödeme/e-Para Kuruluşu" deger={pos?.odeme_para_tutar} renk="text-purple-300" />
          <Kutu
            baslik="Toplam"
            deger={sayi(pos?.banka_pos_tutar) > 0
              ? Math.max(0, sayi(pos?.banka_pos_tutar) - sayi(pos?.odeme_para_tutar)) + sayi(pos?.odeme_para_tutar)
              : sayi(pos?.odeme_para_tutar)}
            renk="text-yellow-300"
            vurgu
          />
        </div>
        {posDetayAcik && (
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PosDetayListe baslik="Banka POS Detayı" liste={pos?.metadata?.banka_detay} renk="text-blue-300" />
            <PosDetayListe baslik="Ödeme/e-Para Kuruluşu Detayı" liste={pos?.metadata?.odeme_detay} renk="text-purple-300" />
          </div>
        )}
      </div>

      {/* KDV 109 */}
      <KdvTablo
        baslik={kdvDokumEtiket('109')}
        data={kdv109}
        renk="text-orange-300"
      />

      {/* Gümrük İşlemleri KDV — GİB'ten sorgulanan KDV 110 */}
      <KdvTablo
        baslik={kdvDokumEtiket('110') + ' — GİB sorgusu'}
        data={kdv110}
        renk="text-pink-300"
        not="GİB listesi belge tarihine göre değil, KDV'nin tahakkuk ettiği döneme göre döner. Örneğin 31/08 tarihli bir gümrük beyannamesinin KDV'si Eylül başında tahakkuk ettiyse Eylül sorgusunda listelenir."
      />

      {/* İthalde Ödenen KDV — yüklenen ithalat faturalarından */}
      <div className="bg-blue-950/30 border border-blue-800/30 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Ship className="w-4 h-4 text-cyan-400" />
            İthalde Ödenen KDV
            <span className="text-xs font-normal text-gray-400">
              {(gumruk?.sayisi || 0) > 0 ? '(yüklenen ithalat faturalarından)' : '(ithalat faturası yüklenmedi — GİB gümrük sorgusu kullanılır)'}
            </span>
          </h3>
          <button
            onClick={() => setGumrukDetayAcik(a => !a)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 transition-colors"
          >
            {gumrukDetayAcik ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {gumrukDetayAcik ? 'Detayı Gizle' : 'Detay'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-2">
          <div className="bg-blue-950/50 rounded-lg p-3 border border-cyan-500/30">
            <div className="text-xs text-gray-400 mb-1">
              Hesaba Dahil KDV {(gumruk?.sayisi || 0) > 0 ? '(yüklenen faturalardan)' : '(GİB sorgusundan)'}
            </div>
            <div className="text-xl font-bold text-cyan-300">
              {paraYaz(kdvDurum?.kdv_110)} <span className="text-sm font-normal text-gray-500">TL</span>
            </div>
          </div>
          <div className="bg-blue-950/50 rounded-lg p-3 border border-blue-800/30">
            <div className="text-xs text-gray-400 mb-1">İthalat Faturası Sayısı</div>
            <div className="text-xl font-bold text-white">{gumruk?.sayisi ?? 0}</div>
          </div>
        </div>

        {gumrukDetayAcik && (
          (gumruk?.kayitlar?.length > 0) ? (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-blue-950">
                  <tr className="text-left text-gray-400 border-b border-blue-800/30">
                    <th className="pb-2 pr-2">#</th>
                    <th className="pb-2 pr-2">Tarih</th>
                    <th className="pb-2 pr-2">Fatura No</th>
                    <th className="pb-2 pr-2">Ünvan</th>
                    <th className="pb-2 pr-2 text-right">Matrah</th>
                    <th className="pb-2 pr-2 text-right">KDV</th>
                    <th className="pb-2 text-right">Toplam</th>
                  </tr>
                </thead>
                <tbody>
                  {gumruk.kayitlar.map((r, i) => (
                    <tr key={i} className="border-b border-blue-800/20 last:border-0">
                      <td className="py-1.5 pr-2 text-gray-500">{i + 1}</td>
                      <td className="py-1.5 pr-2 text-gray-300 whitespace-nowrap">{r.tarih ? String(r.tarih).slice(0, 10).split('-').reverse().join('.') : '-'}</td>
                      <td className="py-1.5 pr-2 text-gray-300 whitespace-nowrap">{r.fatura_no || '-'}</td>
                      <td className="py-1.5 pr-2 text-gray-400">{r.karsi_unvan || '-'}</td>
                      <td className="py-1.5 pr-2 text-right text-gray-300 whitespace-nowrap">{paraYaz(r.matrah)}</td>
                      <td className="py-1.5 pr-2 text-right text-pink-200 whitespace-nowrap">{paraYaz(r.kdv)}</td>
                      <td className="py-1.5 text-right text-gray-200 whitespace-nowrap">{paraYaz(r.tutar)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-blue-800/40 text-gray-300">
                    <td colSpan={5} className="py-2 font-medium">Toplam KDV</td>
                    <td className="py-2 text-right font-semibold text-pink-300 whitespace-nowrap">{paraYaz(gumruk.toplam)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="text-sm text-gray-500 py-4 text-center">
              Bu dönemde yüklenmiş ithalat faturası yok. Dosya adında "Gümrük" veya "İthalat" geçen Excel'i Fatura Yükleme bölümünden yükleyin; satırlardaki KDV'ler otomatik okunur.
            </div>
          )
        )}
      </div>

      {/* Tevkifat / İade kalemleri — HER BİRİ AYRI PENCERE, ay ay gruplu.
          Bu tutarlar KDV Oranları tablosunda da görünür; burada beyan
          satırlarına etkisi ayrı ayrı izlenir. */}
      {OZEL_KATEGORILER.map(k => (
        <OzelKalemBolumu
          key={k.anahtar}
          kategori={ozelDokum?.[k.anahtar]}
          baslik={k.baslik}
          altBaslik={k.altBaslik}
          renk={k.renk}
          ikon={k.ikon}
          etkiMetni={k.etkiMetni}
          acikAylar={acikAylar}
          ayAcKapa={ayAcKapa}
          tevkifatOdendi={tevkifatOdendi}
          tevkifatKaydediliyor={tevkifatKaydediliyor}
          odemeDegistir={k.anahtar === 'tevkifatAlis' ? tevkifatOdemeDegistir : null}
        />
      ))}

      {/* ÖKC Aylık Satış Rapor Bildirimleri */}
      <div className="bg-blue-950/30 border border-blue-800/30 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Receipt className="w-4 h-4 text-yellow-400" />
            Yeni Nesil ÖKC Aylık Satış Rapor Bildirimleri
          </h3>
          <button
            type="button"
            onClick={() => setOkcDetayAcik(acik => !acik)}
            aria-expanded={okcDetayAcik}
            aria-controls={okcDetayId}
            disabled={!okcKayitlar.length || okcYukleniyor}
            title={!okcKayitlar.length ? 'Önce dönem sorgulaması yapın' : 'Seçili dönemin ÖKC hasılat ayrıntılarını aç'}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 disabled:opacity-50 transition-colors"
          >
            {okcDetayAcik ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {okcDetayAcik ? 'Detayı Gizle' : 'Detay'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2 items-center mb-3">
          <span className="text-xs text-gray-400">Dönem:</span>
          <select
            value={okcAy}
            disabled={okcYukleniyor}
            onChange={(e) => okcDonemDegistir(okcYil, Number(e.target.value))}
            className="bg-blue-950/50 border border-blue-800/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            {aylar.map((a, i) => (
              <option key={i + 1} value={i + 1}>{a}</option>
            ))}
          </select>
          <select
            value={okcYil}
            disabled={okcYukleniyor}
            onChange={(e) => okcDonemDegistir(Number(e.target.value), okcAy)}
            className="bg-blue-950/50 border border-blue-800/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            {[...Array(7)].map((_, i) => {
              const y = bugun.getFullYear() - 3 + i
              return <option key={y} value={y}>{y}</option>
            })}
          </select>
          <button
            onClick={() => okcSorgula()}
            disabled={okcYukleniyor}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 disabled:opacity-50 transition-colors"
          >
            {okcYukleniyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Durum Sorgula
          </button>
          {okcKayitlar.length > 0 && (
            <>
              <button
                onClick={okcExcelIndir}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 transition-colors"
              >
                <Download className="w-4 h-4" /> Excel'e Çıkar
              </button>
              <button
                onClick={okcTabloyuKopyala}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 transition-colors"
              >
                <FileText className="w-4 h-4" /> Tabloyu Kopyala
              </button>
            </>
          )}
          {okcMesaj && <span className="text-xs text-gray-300">{okcMesaj}</span>}
        </div>
        {okcHata && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-300 mb-3">{okcHata}</div>
        )}
        {okcKayitlar.length === 0 ? (
          <div className="bg-blue-950/50 rounded-lg p-4 border border-blue-800/30">
            <p className="text-sm text-gray-400">
              ÖKC bildirimleri burada listelenir. Dönem seçip <b>Durum Sorgula</b> deyin
              (GİB Dijital Vergi Dairesi → İnternet Vergi Dairesi → ÖKC İşlemleri → Yeni Nesil ÖKC Aylık
              Satış Rapor Bildirimleri → ÖKC Bildirim Görüntüleme).
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <OkcHasilatTablosu kayitlar={okcKayitlar} baslik="Kesilen ÖKC Fişleri" />
            <div id={okcDetayId} hidden={!okcDetayAcik}>
              {okcDetayAcik && (
                <ul className="space-y-2" aria-label="ÖKC bildirim detayları">
                  {okcKayitlar.map((kayit, index) => (
                    <li key={kayit.sira ?? index}>
                      <details className="rounded-lg border border-blue-800/30 bg-blue-950/50 p-3">
                        <summary className="cursor-pointer text-sm text-blue-300">
                          Bildirim {index + 1}{kayit.raporNo && ` · Rapor No: ${kayit.raporNo}`}{kayit.bildirimZamani && ` · ${kayit.bildirimZamani}`}
                        </summary>
                        <div className="mt-3 space-y-3 text-xs">
                          <dl className="grid gap-2 sm:grid-cols-2">
                            {OKC_BASLIKLAR.filter(([alan]) => kayit[alan]).map(([alan, etiket]) => (
                              <div key={alan} className="flex flex-wrap gap-2">
                                <dt className="text-gray-400">{etiket}:</dt>
                                <dd className="text-gray-200">{kayit[alan]}</dd>
                              </div>
                            ))}
                          </dl>
                          {Object.keys(kayit.detay || {}).length > 0 ? (
                            <>
                              <OkcHasilatTablosu kayitlar={[kayit]} baslik="Bildirim Hasılatı" />
                              <dl className="divide-y divide-blue-800/30">
                                {Object.entries(kayit.detay).map(([alan, deger]) => (
                                  <div key={alan} className="flex justify-between gap-4 py-2">
                                    <dt className="text-gray-400">{alan}</dt>
                                    <dd className="text-right text-gray-200">{String(deger ?? '—')}</dd>
                                  </div>
                                ))}
                              </dl>
                            </>
                          ) : (
                            <p className="text-yellow-300">{kayit.detayHatasi || 'Bu bildirimin ayrıntısı aktarılamadı.'}</p>
                          )}
                          <button type="button" onClick={() => okcDetayKopyala(kayit)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600/20 text-blue-300 hover:bg-blue-600/30">
                            <Copy className="w-3.5 h-3.5" /> Bilgileri Kopyala
                          </button>
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {/* KDV Beyanına Etkisi */}
      <div className="bg-blue-950/30 border border-blue-800/30 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
          <ArrowRightLeft className="w-4 h-4 text-teal-400" />
          KDV Beyanına Etkisi
          <span className="text-xs font-normal text-gray-400">({String(ay).padStart(2, '0')}.{yil} dönemi)</span>
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-blue-950/50 rounded-lg p-3 border border-blue-500/30">
            <div className="text-xs font-semibold text-blue-300 mb-2">İndirilecek KDV tarafı</div>
            <SatirEtki etiket="Tevkifat Alış (sorumlu sıfatıyla ödenen)" deger={ozelDokum?.tevkifatAlis?.toplam?.tevkifatKdv || 0} onEk="+" pasif={!tevkifatOdendi} />
            <SatirEtki etiket="Satıştan İade (bize kesilen)" deger={Math.abs(ozelDokum?.satistanIade?.toplam?.kdv || 0)} onEk="−" />
            <div className="mt-2 pt-2 border-t border-blue-800/40 flex justify-between text-sm gap-3">
              <span className="text-gray-300">İndirilecek KDV'ye net ilave</span>
              <span className="font-semibold text-blue-200 whitespace-nowrap">{paraYaz(indirilecekIlave)} TL</span>
            </div>
          </div>
          <div className="bg-blue-950/50 rounded-lg p-3 border border-green-500/30">
            <div className="text-xs font-semibold text-green-300 mb-2">Hesaplanan (tahsil edilen) KDV tarafı</div>
            <SatirEtki etiket="Tevkifat Satış (tevkif edilen)" deger={Math.abs(ozelDokum?.tevkifatSatis?.toplam?.tevkifatKdv || 0)} onEk="−" />
            <SatirEtki etiket="Alıştan İade (bizim kestiğimiz)" deger={Math.abs(ozelDokum?.alistanIade?.toplam?.kdv || 0)} onEk="−" />
            <div className="mt-2 pt-2 border-t border-blue-800/40 flex justify-between text-sm gap-3">
              <span className="text-gray-300">Hesaplanan KDV'den net düşülecek</span>
              <span className="font-semibold text-green-200 whitespace-nowrap">{paraYaz(hesaplanandanDusulecek)} TL</span>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-gray-500 mt-3">
          Tevkifat Alış tutarı yalnızca "Ödendi" işaretliyse indirilecek KDV'ye eklenir. İade tutarları ilgili taraftan düşülür.
        </p>
      </div>

      {/* KDV Hesap Özeti (Devreden / Ödeme) */}
      <div className="bg-blue-950/30 border border-blue-800/30 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-indigo-400" />
            KDV Hesap Özeti
          </h3>
          <button
            onClick={async () => {
              setOzetYenileniyor(true)
              try { await yukle() } finally { setOzetYenileniyor(false) }
            }}
            disabled={ozetYenileniyor}
            title="Özeti yeniden hesapla"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 disabled:opacity-60 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${ozetYenileniyor ? 'animate-spin' : ''}`} />
            {ozetYenileniyor ? 'Yenileniyor...' : 'Yenile'}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Kutu baslik="Önceki Aydan Devreden" deger={kdvDurum?.devreden_giris} renk="text-indigo-300" />
          <Kutu baslik="İndirilebilir Toplam KDV" deger={kdvDurum?.indirilebilir_toplam} renk="text-blue-300" />
          <Kutu baslik="Ödenecek KDV" deger={kdvDurum?.odeme} renk="text-red-300" />
          <Kutu baslik="Sonraki Aya Devreden" deger={kdvDurum?.devreden_sonraki} renk="text-green-300" />
        </div>
      </div>

      {oranDokumuGoster && (
        <div className="bg-blue-950/30 border border-blue-800/30 rounded-xl p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Receipt className="w-4 h-4 text-teal-400" />
              Fatura KDV Oranları
            </h3>
            <button onClick={() => setOranYenileme(sayi => sayi + 1)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600/20 text-blue-300 hover:bg-blue-600/30">
              <RefreshCw className="w-3.5 h-3.5" /> Yenile
            </button>
          </div>
          {oranHatasi ? (
            <p className="text-sm text-red-300">Fatura KDV oranları yüklenemedi: {oranHatasi}</p>
          ) : !oranDokumu ? (
            <p className="text-sm text-gray-400">Fatura oranları yükleniyor...</p>
          ) : (
            <>
              <p className="text-xs text-gray-400 mb-4">e-Fatura, e-Arşiv ve e-SMM kayıtları ile alınan UTTS fişleri dahildir. Oran detayı bulunmayan kayıtlarda oran sırayla %20 → %10 → %1 denenerek belirlenir, matrah KDV üzerinden hesaplanır (matrah = KDV ÷ oran). ÖTV ve diğer vergiler matraha eklenmez. Hiçbir orana uymayan kayıtlar “Oran belirlenemedi” satırında gösterilir.</p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <FaturaOranTablosu baslik="Alınan Faturalar" data={oranDokumu.alinan} />
                <FaturaOranTablosu baslik="Kesilen Faturalar" data={oranDokumu.kesilen} />
              </div>
            </>
          )}
        </div>
      )}

      {/* Fatura KDV Karşılaştırma */}
      <div className="bg-blue-950/30 border border-blue-800/30 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4 text-teal-400" />
          Fatura KDV Karşılaştırması
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Kutu baslik="Alınan Fatura KDV" deger={faturaKdv?.alinan} renk="text-blue-300" />
          <Kutu baslik="Kesilen Fatura KDV" deger={faturaKdv?.kesilen} renk="text-green-300" />
          <Kutu
            baslik="Sorumlu Sıfatıyla KDV (109)"
            deger={kdvDurum?.kdv_109_etkin ?? kdvDurum?.kdv_109 ?? kdv109?.toplam_tutar}
            renk="text-orange-300"
            not={kdvDurum?.kdv_109_kaynak === 'tevkifat-alis-odendi'
              ? `Tevkifat Alış "Ödendi" — indirilebilir KDV'ye dahil edildi`
              : undefined}
          />
          <Kutu
            baslik={(gumruk?.sayisi || 0) > 0 ? 'İthalde Ödenen KDV (Yüklenen İthalat Faturaları)' : 'İthalde Ödenen KDV (GİB Gümrük Sorgusu)'}
            deger={kdvDurum?.kdv_110}
            renk="text-cyan-300"
          />
        </div>
      </div>
    </div>
  )
}

function OkcHasilatTablosu({ kayitlar, baslik }) {
  const ozet = okcHasilatOzeti(kayitlar)
  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-blue-800/30 bg-blue-950/50 p-3">
        <h4 className="text-sm font-semibold text-white">{baslik} · GİB Bildirim Toplamları</h4>
        <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[[ 'satis', 'Toplam Satış (KDV dâhil)' ], [ 'kdv', 'Bildirilen Toplam KDV' ], [ 'matrah', 'Matrah (Satış − Bildirilen KDV)' ]].map(([alan, etiket]) => (
            <div key={alan}>
              <dt className="text-xs text-gray-400">{etiket}</dt>
              <dd className="mt-1 text-sm font-semibold text-white">{ozet.bildirilen[alan] === null ? 'Bilgi alınamadı' : `${paraYaz(ozet.bildirilen[alan])} TL`}</dd>
            </div>
          ))}
        </dl>
      </div>
      {ozet.satirlar.length ? (
        <>
          <FaturaOranTablosu baslik="KDV Oranlarına Göre Satışlar" data={ozet} brutGoster />
          <p className="text-xs text-gray-400">
            Satış tutarları GİB bildiriminden alınır; oran bazındaki matrah ve KDV hesaplanır.
            {ozet.kdvFarki !== null && ozet.kdvFarki !== 0 && ` Hesaplanan KDV ile bildirilen toplam KDV arasındaki fark: ${paraYaz(Math.abs(ozet.kdvFarki))} TL. Fark oranlara dağıtılmadı.`}
          </p>
        </>
      ) : (
        <p className="text-xs text-yellow-300">KDV oranlarına göre hasılat bilgisi alınamadı.</p>
      )}
      {ozet.oranliKayit > 0 && ozet.oranliKayit < kayitlar.length && (
        <p className="text-xs text-yellow-300">KDV dökümü kısmi: {ozet.oranliKayit}/{kayitlar.length} bildirim hesaplamaya dâhil edildi.</p>
      )}
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {[[ 'nakit', 'Toplam Nakit' ], [ 'kart', 'Toplam Banka / Kredi Kartı' ]].map(([tur, etiket]) => {
          const { tutar, sayi } = ozet.odemeler[tur]
          return (
            <div key={tur} className="rounded-lg border border-blue-800/30 bg-blue-950/50 p-3">
              <dt className="text-xs text-gray-400">{etiket}</dt>
              <dd className="mt-1 text-sm font-semibold text-white">{tutar === null ? 'Bilgi alınamadı' : `${paraYaz(tutar)} TL`}</dd>
              {sayi > 0 && sayi < kayitlar.length && <p className="mt-1 text-xs text-yellow-300">Kısmi toplam · {sayi}/{kayitlar.length} bildirim</p>}
            </div>
          )
        })}
      </dl>
    </div>
  )
}

function FaturaOranTablosu({ baslik, data, brutGoster = false }) {
  return (
    <div className="bg-blue-950/50 rounded-lg p-3 border border-blue-800/30">
      <h4 className="text-sm font-semibold text-white mb-3">{baslik}</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-400 border-b border-blue-800/30">
              <th className="pb-2 pr-2">KDV Oranı</th>
              {brutGoster && <th className="pb-2 pr-2 text-right">KDV Dâhil Satış</th>}
              <th className="pb-2 pr-2 text-right">{brutGoster ? 'Hesaplanan Matrah' : 'Matrah'}</th>
              <th className="pb-2 text-right">{brutGoster ? 'Hesaplanan KDV' : 'KDV'}</th>
            </tr>
          </thead>
          <tbody>
            {data.satirlar.length ? data.satirlar.map(satir => (
              <tr key={satir.oran ?? 'bilinmiyor'} className="border-b border-blue-800/20">
                <td className="py-2 pr-2 text-gray-300">{satir.oran === null ? 'Oran belirlenemedi' : `%${satir.oran.toLocaleString('tr-TR')}`}</td>
                {brutGoster && <td className="py-2 pr-2 text-right text-gray-200 whitespace-nowrap">{paraYaz(satir.matrah + satir.kdv)} TL</td>}
                <td className="py-2 pr-2 text-right text-gray-200 whitespace-nowrap">{paraYaz(satir.matrah)} TL</td>
                <td className="py-2 text-right text-gray-200 whitespace-nowrap">{paraYaz(satir.kdv)} TL</td>
              </tr>
            )) : (
              <tr><td colSpan={brutGoster ? 4 : 3} className="py-3 text-gray-500 text-center">Bu dönemde kayıt yok.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-blue-800/40 font-semibold text-white">
              <td className="pt-2 pr-2">{brutGoster ? 'Oran Satırları Toplamı' : 'Toplam'}</td>
              {brutGoster && <td className="pt-2 pr-2 text-right whitespace-nowrap">{paraYaz(data.toplam.matrah + data.toplam.kdv)} TL</td>}
              <td className="pt-2 pr-2 text-right whitespace-nowrap">{paraYaz(data.toplam.matrah)} TL</td>
              <td className="pt-2 text-right whitespace-nowrap">{paraYaz(data.toplam.kdv)} TL</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {data.eksikTutar > 0 && <p className="text-xs text-yellow-300 mt-2">{data.eksikTutar} kayıtta matrah veya KDV eksik; toplamlar yalnızca kayıtlı tutarları içerir.</p>}
      {(data.cozulemeyenler?.length || 0) > 0 && (
        <p className="text-xs text-orange-300 mt-1">
          {data.cozulemeyenler.length} kaydın KDV oranı doğrulanamadı; bu kayıtların tutarları toplamda yer alır.
        </p>
      )}
    </div>
  )
}

function SorguBtn({ tur, label, icon, yukleniyor, onClick }) {
  const busy = yukleniyor[tur]
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 disabled:opacity-50 transition-colors"
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {label}
    </button>
  )
}

function Kutu({ baslik, deger, renk, vurgu, not }) {
  return (
    <div className={`bg-blue-950/50 rounded-lg p-3 border ${vurgu ? 'border-yellow-500/30' : 'border-blue-800/30'}`}>
      <div className="text-xs text-gray-400 mb-1">{baslik}</div>
      <div className={`text-lg font-semibold ${renk}`}>
        {paraYaz(deger)} <span className="text-xs font-normal text-gray-500">TL</span>
      </div>
      {not && <div className="text-[10px] text-gray-500 mt-1 leading-tight">{not}</div>}
    </div>
  )
}

function PosDetayListe({ baslik, liste, renk }) {
  const satirlar = Array.isArray(liste) ? liste : []
  const toplam = satirlar.reduce((s, d) => s + (Number(d?.tutar) || 0), 0)
  return (
    <div className="bg-blue-950/50 rounded-lg p-3 border border-blue-800/30">
      <div className="flex items-center justify-between mb-2">
        <h4 className={`text-xs font-semibold flex items-center gap-1.5 ${renk}`}>
          <CreditCard className="w-3.5 h-3.5" />
          {baslik}
        </h4>
        <span className="text-xs text-gray-400">{satirlar.length} kayıt</span>
      </div>
      {satirlar.length > 0 ? (
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

function KdvTablo({ baslik, data, renk, not }) {
  const [detayAcik, setDetayAcik] = useState(false)
  const detaylar = Array.isArray(data?.detaylar) ? data.detaylar : []
  return (
    <div className="bg-blue-950/30 border border-blue-800/30 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h3 className={`text-sm font-semibold flex items-center gap-2 ${renk}`}>
          <Receipt className="w-4 h-4" />
          {baslik}
          {data?.sorgu_tarihi && <span className="text-xs font-normal text-gray-400">· {data.sorgu_tarihi}</span>}
        </h3>
        <button
          onClick={() => setDetayAcik(a => !a)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 transition-colors"
        >
          {detayAcik ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {detayAcik ? 'Detayı Gizle' : 'Detay'}
        </button>
      </div>

      <div className="mb-3">
        <div className="text-xs text-gray-400">Toplam</div>
        <div className="text-xl font-bold text-white">{paraYaz(data?.toplam_tutar)} <span className="text-sm font-normal text-gray-500">TL</span></div>
      </div>

      {not && <p className="text-[11px] text-yellow-300/80 mb-3">{not}</p>}

      {detayAcik && (
        detaylar.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 border-b border-blue-800/30">
                  <th className="pb-2">#</th>
                  <th className="pb-2">İçerik</th>
                  <th className="pb-2 text-right">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {detaylar.map((d, i) => (
                  <tr key={i} className="border-b border-blue-800/20 last:border-0">
                    <td className="py-2 text-gray-500">{d.sira || i + 1}</td>
                    <td className="py-2 text-gray-300">
                      {Array.isArray(d.metinler) ? d.metinler.filter(Boolean).join(' · ') : JSON.stringify(d)}
                    </td>
                    <td className="py-2 text-right text-gray-200 whitespace-nowrap">{paraYaz(d.tutar)} TL</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-gray-500 py-4 text-center">Henüz detay kaydı yok.</div>
        )
      )}
    </div>
  )
}

// Tevkifat / iade bölümleri — her biri ayrı pencere, ay ay gruplu.
const OZEL_KATEGORILER = [
  { anahtar: 'tevkifatAlis', baslik: 'Tevkifat Alış', altBaslik: 'sorumlu sıfatıyla ödenen KDV', renk: 'text-teal-400', ikon: 'tevkifat', etkiMetni: 'İndirilecek KDV tarafı' },
  { anahtar: 'tevkifatSatis', baslik: 'Tevkifat Satış', altBaslik: 'tevkif edilen KDV', renk: 'text-amber-400', ikon: 'tevkifat', etkiMetni: 'Hesaplanan KDV tarafı' },
  { anahtar: 'alistanIade', baslik: 'Alıştan İade', altBaslik: 'bizim kestiğimiz iade faturaları', renk: 'text-sky-400', ikon: 'iade', etkiMetni: 'Hesaplanan KDV tarafı' },
  { anahtar: 'satistanIade', baslik: 'Satıştan İade', altBaslik: 'bize kesilen iade faturaları', renk: 'text-rose-400', ikon: 'iade', etkiMetni: 'İndirilecek KDV tarafı' }
]

function OzelKalemBolumu({ kategori, baslik, altBaslik, renk, ikon, etkiMetni, acikAylar, ayAcKapa, tevkifatOdendi, tevkifatKaydediliyor, odemeDegistir }) {
  const aylar = Array.isArray(kategori?.aylar) ? kategori.aylar : []
  const t = kategori?.toplam || { matrah: 0, kdv: 0, tevkifatKdv: 0, sayisi: 0 }
  const tevkifatBolumu = ikon === 'tevkifat'
  const Ikon = ikon === 'iade' ? ArrowRightLeft : FileText
  return (
    <div className="bg-blue-950/30 border border-blue-800/30 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Ikon className={`w-4 h-4 ${renk}`} />
          {baslik} <span className="text-xs font-normal text-gray-400">({altBaslik} · {etkiMetni})</span>
        </h3>
        {odemeDegistir && (
          <div className="inline-flex rounded-lg overflow-hidden border border-blue-700/50" title="Ödendi seçilirse bu tutar KDV Beyanına Etkisi bölümünde indirilecek KDV tarafına eklenir">
            <button
              onClick={() => odemeDegistir(true)}
              disabled={tevkifatKaydediliyor || tevkifatOdendi}
              className={`px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-default ${tevkifatOdendi ? 'bg-green-500/30 text-green-200' : 'bg-blue-900/60 text-gray-400 hover:text-white'}`}
            >
              Ödendi
            </button>
            <button
              onClick={() => odemeDegistir(false)}
              disabled={tevkifatKaydediliyor || !tevkifatOdendi}
              className={`px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-default ${!tevkifatOdendi ? 'bg-red-500/25 text-red-200' : 'bg-blue-900/60 text-gray-400 hover:text-white'}`}
            >
              Ödenmedi
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <MiniKutu baslik="Fatura" deger={t.sayisi} tamSayi />
        <MiniKutu baslik="Matrah" deger={t.matrah} />
        <MiniKutu baslik={tevkifatBolumu ? 'Faturada KDV' : 'KDV'} deger={t.kdv} />
        {tevkifatBolumu && <MiniKutu baslik="Tevkifat KDV" deger={t.tevkifatKdv} renk="text-teal-300" />}
      </div>

      {aylar.length ? (
        <div className="rounded-lg border border-blue-800/30 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-blue-900/40 text-[11px] uppercase tracking-wide text-gray-400">
            <span className="col-span-3">Ay</span>
            <span className="col-span-1 text-right">Adet</span>
            <span className="col-span-3 text-right">Matrah</span>
            <span className="col-span-2 text-right">KDV</span>
            <span className="col-span-3 text-right">{tevkifatBolumu ? 'Tevkifat KDV' : 'Toplam'}</span>
          </div>
          {aylar.map(a => {
            const anahtar = `${baslik}-${a.ay}`
            const acik = acikAylar?.has(anahtar)
            return (
              <div key={a.ay} className="border-t border-blue-800/20">
                <button onClick={() => ayAcKapa(anahtar)} className="w-full grid grid-cols-12 gap-2 px-3 py-2 text-left hover:bg-blue-900/30 transition-colors">
                  <span className="col-span-3 text-xs text-gray-200 flex items-center gap-1">
                    {acik ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {a.ayAd}
                  </span>
                  <span className="col-span-1 text-xs text-right text-gray-400">{a.sayisi}</span>
                  <span className="col-span-3 text-xs text-right text-gray-300 whitespace-nowrap">{paraYaz(a.matrah)}</span>
                  <span className="col-span-2 text-xs text-right text-gray-300 whitespace-nowrap">{paraYaz(a.kdv)}</span>
                  <span className="col-span-3 text-xs text-right font-medium text-white whitespace-nowrap">
                    {paraYaz(tevkifatBolumu ? a.tevkifatKdv : a.kdv + 0)}
                  </span>
                </button>
                {acik && (
                  <div className="px-3 pb-2 overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="text-left text-gray-500 border-b border-blue-800/30">
                          <th className="py-1 pr-2">Tarih</th>
                          <th className="py-1 pr-2">Fatura No</th>
                          <th className="py-1 pr-2">Ünvan</th>
                          <th className="py-1 pr-2 text-right">Oran</th>
                          <th className="py-1 pr-2 text-right">Matrah</th>
                          <th className="py-1 pr-2 text-right">KDV</th>
                          {tevkifatBolumu && <th className="py-1 text-right">Tevkifat</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {a.satirlar.map((r, i) => (
                          <tr key={r.id ?? i} className="border-b border-blue-800/10 last:border-0">
                            <td className="py-1 pr-2 text-gray-400 whitespace-nowrap">{r.tarih ? String(r.tarih).slice(0, 10).split('-').reverse().join('.') : '-'}</td>
                            <td className="py-1 pr-2 text-gray-300 whitespace-nowrap">{r.fatura_no || '-'}</td>
                            <td className="py-1 pr-2 text-gray-400 max-w-56 truncate" title={r.unvan}>{r.unvan || '-'}</td>
                            <td className="py-1 pr-2 text-right text-gray-400 whitespace-nowrap">{r.oran != null ? `%${String(r.oran).replace('.', ',')}` : '-'}</td>
                            <td className="py-1 pr-2 text-right text-gray-300 whitespace-nowrap">{paraYaz(r.matrah)}</td>
                            <td className="py-1 pr-2 text-right text-gray-300 whitespace-nowrap">{paraYaz(r.kdv)}</td>
                            {tevkifatBolumu && (
                              <td className="py-1 text-right font-medium text-teal-300 whitespace-nowrap" title={r.detayYok ? 'KDV dökümü yok — tevkifat hesaplanamadı' : `Hesaplanan ${paraYaz(r.hesaplananKdv)} − faturada ${paraYaz(r.kdv)}`}>
                                {paraYaz(r.tevkifatKdv)}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-sm text-gray-500 py-4 text-center">Bu yıl için {baslik.toLowerCase()} kaydı yok.</div>
      )}
    </div>
  )
}

function MiniKutu({ baslik, deger, renk = 'text-white', tamSayi = false }) {
  return (
    <div className="bg-blue-950/50 rounded-lg px-3 py-2 border border-blue-800/30">
      <div className="text-[10px] text-gray-500 mb-0.5">{baslik}</div>
      <div className={`text-sm font-semibold ${renk} whitespace-nowrap`}>
        {tamSayi ? deger : `${paraYaz(deger)} TL`}
      </div>
    </div>
  )
}

function SatirEtki({ etiket, deger, onEk = '', pasif = false }) {
  return (
    <div className={`flex justify-between gap-3 py-1 text-xs ${pasif ? 'text-gray-600' : 'text-gray-300'}`}>
      <span className="min-w-0 truncate">{etiket}{pasif ? ' (ödenmedi — eklenmez)' : ''}</span>
      <span className="whitespace-nowrap shrink-0">{onEk}{paraYaz(Math.abs(deger))} TL</span>
    </div>
  )
}
