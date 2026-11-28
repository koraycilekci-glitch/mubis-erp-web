import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Calculator, FileSpreadsheet, CheckCircle2, RefreshCw, Search, Loader2, ChevronDown, Undo2, Building2, Upload, Download } from 'lucide-react'
import { useClients } from '../hooks/useClients'
import { clientDisplayName } from '../utils/clientDisplay'
import {
  hesapPlaniGetir, kurallariGetir, kuralKaydet,
  faturalariGetir, faturaHesapKaydet, faturaOnayKaldir, faturaDurumGuncelle, lucaExcelIndir,
  lucaHesapPlaniEkIndir, lucaFisNoUret, ensureCariHesabi,
  kdvOraniTespit, faturaHesapKodu, kdvHesapKodu, oranHesaplari,
  hesaplarTopluEkle, hesapPlaniDosyadanOku, hesapPlaniCsvIndir
} from '../services/muhasebeService'
import { kdvDetaylariGetir, lucaHesapEkle } from '../services/efaturaService'

const tl = (n) => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
// Client kayitlarinda ünvan alani "name"/"company"/"shortName" — "unvan" yoktu,
// secenekler bos metinle render oluyordu (acilir liste bos gorunuyordu).
const musteriAdi = clientDisplayName

// Kod yazarak arama + açılır liste hesap seçici (2.7.463 muhasebe akışı).
// onMouseDown kullanilir: blur önce tetiklenip secim tikini diye.
function HesapSecici({ hesapPlani, deger, onSec, yerTutucu }) {
  const [q, setQ] = useState('')
  const [acik, setAcik] = useState(false)
  const kutuRef = useRef(null)
  const sonuclar = useMemo(() => {
    const s = q.trim().toLocaleLowerCase('tr')
    let l = hesapPlani
    if (s) l = l.filter(h => String(h.kod || '').toLocaleLowerCase('tr').includes(s) || String(h.ad || '').toLocaleLowerCase('tr').includes(s))
    // 2.7.496: acilir liste ALFABETIK siralanir (hesap adi, Turkce locale)
    return [...l].sort((a, b) => String(a.ad || '').localeCompare(String(b.ad || ''), 'tr') || String(a.kod || '').localeCompare(String(b.kod || ''), 'tr')).slice(0, 30)
  }, [hesapPlani, q])
  useEffect(() => {
    const disa = (e) => { if (kutuRef.current && !kutuRef.current.contains(e.target)) setAcik(false) }
    document.addEventListener('mousedown', disa)
    return () => document.removeEventListener('mousedown', disa)
  }, [])
  return (
    <div ref={kutuRef} className="relative">
      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={acik ? q : (deger ? `${deger.kod}${deger.ad ? ' — ' + deger.ad : ''}` : q)}
          onChange={e => { setQ(e.target.value); setAcik(true) }}
          onFocus={() => { setAcik(true); setQ('') }}
          placeholder={yerTutucu}
          className="w-full bg-blue-900/60 border border-yellow-500/40 rounded-xl pl-9 pr-8 py-2.5 text-sm text-white placeholder-gray-500"
        />
        <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
      {acik && (
        <div className="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto bg-blue-950 border border-blue-700/60 rounded-xl shadow-xl">
          {!sonuclar.length && <div className="px-3 py-2 text-xs text-gray-500">Eşleşen hesap yok</div>}
          {sonuclar.map(h => (
            <button
              key={h.kod}
              type="button"
              onMouseDown={() => { onSec(h); setAcik(false); setQ('') }}
              className="w-full text-left px-3 py-2 text-sm text-white hover:bg-blue-800/70 flex items-center justify-between gap-2"
            >
              <span className="font-mono text-yellow-300/90 whitespace-nowrap">{h.kod}</span>
              <span className="text-gray-300 truncate text-xs">{h.ad}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MuhasebeKayit() {
  const navigate = useNavigate()
  const { clients } = useClients()
  const [clientId, setClientId] = useState('')
  const [yil, setYil] = useState(new Date().getFullYear())
  const [ay, setAy] = useState(new Date().getMonth() + 1)
  const [yon, setYon] = useState('')
  const [arama, setArama] = useState('')

  const [faturalar, setFaturalar] = useState([])
  const [hesapPlani, setHesapPlani] = useState([])
  const [kurallar, setKurallar] = useState([])
  const [yeniHesaplar, setYeniHesaplar] = useState([]) // otomatik acilan cariler (Luca ek dosyasi icin)
  const [yukleniyor, setYukleniyor] = useState(false)
  const [kaydediliyor, setKaydediliyor] = useState({})
  const [mesaj, setMesaj] = useState(null)

  // 2.7.463 akışı: hesap seçimi paneli + fatura onay kutulari
  const [anaHesap, setAnaHesap] = useState(null) // {kod, ad} — gider/gelir hesabi
  const [kapanisKok, setKapanisKok] = useState('') // kapanis hesabi kökü ('320'/'120'/alt kök)
  // 2.7.466: KDV hesabı TEK seçici — seçilen kod yönüne göre kullanılır:
  // 191'li kod alış satırına, 391'li kod satış satırına yazılır; seçim
  // yoksa 191/391 kökleri kullanılır.
  const [kdvHesap, setKdvHesap] = useState(null) // örn. {kod:'191.01'} veya {kod:'391.01'}
  const [secimler, setSecimler] = useState({}) // faturaId -> bool
  const [ataCalisiyor, setAtaCalisiyor] = useState(false)

  // Şirket seçimi ZORUNLU: otomatik ilk-müşteri seçimi kaldırıldı.
  const musteri = useMemo(() => clients.find(c => String(c.id) === String(clientId)), [clients, clientId])
  // 2.7.497: şirket seçim listesi alfabetik (Türkçe harf duyarlı)
  const siraliMusteriler = useMemo(() =>
    [...clients].sort((a, b) => musteriAdi(a).toLocaleLowerCase('tr').localeCompare(musteriAdi(b).toLocaleLowerCase('tr'), 'tr')),
    [clients])

  // Kapanış hesabı kökü yönle uyumlu olsun (alış->320, satış->120)
  useEffect(() => {
    setKapanisKok(yon === 'giden' ? '120' : '320')
  }, [yon])

  const yukle = useCallback(async () => {
    if (!clientId) return
    setYukleniyor(true)
    setMesaj(null)
    setSecimler({})
    try {
      const [plan, kur, fat] = await Promise.all([
        hesapPlaniGetir(clientId),
        kurallariGetir(clientId),
        faturalariGetir(clientId, { yil: Number(yil), ay: Number(ay), yon: yon || null })
      ])
      setHesapPlani(plan)
      setKurallar(kur)
      setFaturalar(fat)
    } catch (e) {
      setMesaj({ tip: 'hata', metin: 'Yükleme hatası: ' + (e.message || e) })
    }
    setYukleniyor(false)
  }, [clientId, yil, ay, yon])

  useEffect(() => { yukle() }, [yukle])

  const gorunen = useMemo(() => {
    let liste = faturalar
    if (arama.trim()) {
      const a = arama.toLocaleLowerCase('tr')
      liste = liste.filter(f => [f.karsi_unvan, f.fatura_no, f.karsi_vkn].some(x => String(x || '').toLocaleLowerCase('tr').includes(a)))
    }
    return liste
  }, [faturalar, arama])

  // Seçilen ana hesabın KDV oran alt kodları (bilgi amaçlı önizleme)
  const oranOzeti = useMemo(() => {
    if (!anaHesap) return []
    const harita = oranHesaplari(hesapPlani, anaHesap.kod)
    return Object.keys(harita).sort((a, b) => a - b).map(o => ({ oran: o, kod: harita[o] }))
  }, [anaHesap, hesapPlani])
  // KDV oran alt kodları önizlemesi — tek seçiciden (2.7.466): seçim 191'liyse
  // 191 ailesi, 391'liyse 391 ailesi gösterilir.
  const kdvOzeti = useMemo(() => {
    const kok = kdvHesap?.kod?.startsWith('391') ? '391' : '191'
    const harita = oranHesaplari(hesapPlani, kok)
    return Object.keys(harita).sort((a, b) => a - b).map(o => ({ oran: o, kod: harita[o] }))
  }, [hesapPlani, kdvHesap])

  const tumSecili = gorunen.length > 0 && gorunen.filter(f => f.durum !== 'luca').every(f => secimler[f.id])
  const toggleTumu = () => {
    const yeni = {}
    if (!tumSecili) for (const f of gorunen) { if (f.durum !== 'luca') yeni[f.id] = true }
    setSecimler(yeni)
  }
  const seciliSayi = gorunen.filter(f => secimler[f.id] && f.durum !== 'luca').length

  // 2.7.466: Aynı firmanın (aynı VKN; VKN yoksa aynı ünvan) Luca dışındaki
  // faturalarının id listesi — checkbox'ta grup seçimi için.
  const ayniFirmaIdler = (f) => {
    const vkn = String(f.karsi_vkn || '').replace(/\D/g, '')
    return faturalar
      .filter(x => x.id !== f.id && x.durum !== 'luca' && (
        (vkn && String(x.karsi_vkn || '').replace(/\D/g, '') === vkn) ||
        (!vkn && x.karsi_unvan && x.karsi_unvan === f.karsi_unvan)
      ))
      .map(x => x.id)
  }

  const tekKaydet = async (f, hesapKodu) => {
    setKaydediliyor(p => ({ ...p, [f.id]: true }))
    try {
      // Cari hesap (kapanış kökü): planda ünvanla varsa kullan, yoksa son kod +1 ile ac
      const cariSonuc = await ensureCariHesabi(clientId, f, hesapPlani, kapanisKok || null)
      if (cariSonuc.yeni) {
        setHesapPlani(prev => [...prev, { kod: cariSonuc.kod, ad: cariSonuc.ad }].sort((a, b) => a.kod.localeCompare(b.kod)))
        setYeniHesaplar(prev => prev.some(h => h.kod === cariSonuc.kod) ? prev : [...prev, { kod: cariSonuc.kod, ad: cariSonuc.ad }])
      }
      await faturaHesapKaydet(f.id, hesapKodu, cariSonuc.kod)
      // VKN kurali ogren: bu saticiyi bundan sonra ayni hesaba ata
      const vkn = String(f.karsi_vkn || '').replace(/\D/g, '')
      if (vkn && !kurallar.some(k => k.vkn === vkn)) {
        try { await kuralKaydet(clientId, { vkn, hesapKodu }) } catch { /* kural zorunlu degil */ }
      }
      // 2.7.466: Aynı firmanın (aynı VKN; VKN yoksa aynı ünvan) diğer
      // bekleyen faturalarına da aynı ana hesabı uygula — her faturanın
      // kendi KDV oranına göre alt kod faturaHesapKodu ile hesaplanır,
      // kapanış carisi aynı VKN geçmişinden bulunur.
      const ayniFirma = faturalar.filter(x =>
        x.id !== f.id && x.durum === 'bekliyor' && (
          (vkn && String(x.karsi_vkn || '').replace(/\D/g, '') === vkn) ||
          (!vkn && x.karsi_unvan && x.karsi_unvan === f.karsi_unvan)
        )
      )
      let calismaPlan = [...hesapPlani]
      if (cariSonuc.yeni && !calismaPlan.some(h => h.kod === cariSonuc.kod)) {
        calismaPlan = [...calismaPlan, { kod: cariSonuc.kod, ad: cariSonuc.ad }]
      }
      let ekstra = 0
      const onaylananlar = new Map([[f.id, { kod: hesapKodu, cari: cariSonuc.kod }]])
      for (const x of ayniFirma) {
        try {
          const { kod: xKod } = faturaHesapKodu(hesapKodu, calismaPlan, x)
          const xCari = await ensureCariHesabi(clientId, x, calismaPlan, kapanisKok || null)
          if (xCari.yeni && !calismaPlan.some(h => h.kod === xCari.kod)) {
            calismaPlan = [...calismaPlan, { kod: xCari.kod, ad: xCari.ad }]
            setYeniHesaplar(prev => prev.some(h => h.kod === xCari.kod) ? prev : [...prev, { kod: xCari.kod, ad: xCari.ad }])
          }
          await faturaHesapKaydet(x.id, xKod, xCari.kod)
          onaylananlar.set(x.id, { kod: xKod, cari: xCari.kod })
          ekstra++
        } catch { /* tek faturadaki hata diğerlerini durdurmasın */ }
      }
      if (calismaPlan.length !== hesapPlani.length) {
        setHesapPlani(calismaPlan.sort((a, b) => a.kod.localeCompare(b.kod)))
      }
      setFaturalar(prev => prev.map(x => onaylananlar.has(x.id)
        ? { ...x, durum: 'onayli', hesap_kodu: onaylananlar.get(x.id).kod, cari_hesabi: onaylananlar.get(x.id).cari }
        : x))
      setSecimler(p => {
        const yeni = { ...p }
        for (const id of onaylananlar.keys()) delete yeni[id]
        return yeni
      })
      if (ekstra) {
        setMesaj({ tip: 'ok', metin: `Fatura onaylandı. Aynı firmanın ${ekstra} diğer faturasına da aynı hesap kodu otomatik uygulandı ve onaylandı.` })
      }
    } catch (e) {
      setMesaj({ tip: 'hata', metin: 'Kaydedilemedi: ' + (e.message || e) })
    }
    setKaydediliyor(p => ({ ...p, [f.id]: false }))
  }

  // 2.7.463 ana akış: seçilen hesap + kapanış carisi -> işaretli tüm faturalar
  // KDV oranı matrah/KDV'den tespit edilir; ana hesabın çocuklarında oran kodu
  // varsa o kullanılır (153.01 + %20 -> 153.01.5), KDV satırı 191/391 alt koduyla.
  const secilenlereAta = async () => {
    if (!anaHesap?.kod) { setMesaj({ tip: 'hata', metin: 'Önce hesap kodu seçin (örn. 153.01).' }); return }
    const secilen = gorunen.filter(f => secimler[f.id] && f.durum !== 'luca')
    if (!secilen.length) { setMesaj({ tip: 'hata', metin: 'Önce listeden fatura işaretleyin (onay kutucukları).' }); return }
    setAtaCalisiyor(true)
    setMesaj(null)
    // Dongu boyunca yerel plan kopyasi kullan: ard isik +1 kodlar cakismasin
    let calismaPlan = [...hesapPlani]
    const acilanYeniler = []
    const karmaKdvler = []
    let atanan = 0
    let hataSayi = 0
    // 2.7.464: firma hafizasi — atanan her firmanin VKN'sine kural yazilir;
    // ayni firmanin sonraki faturalari ayni hesap kodunu otomatik alir.
    const yazilanVknler = new Set()
    for (const f of secilen) {
      try {
        const { kod: gercekKod } = faturaHesapKodu(anaHesap.kod, calismaPlan, f)
        const oran = kdvOraniTespit(f)
        if (oran === -1 && (Number(f.kdv) || 0) > 0) karmaKdvler.push(f.fatura_no || f.karsi_unvan || f.id)
        const cari = await ensureCariHesabi(clientId, f, calismaPlan, kapanisKok || null)
        if (cari.yeni) {
          calismaPlan = [...calismaPlan, { kod: cari.kod, ad: cari.ad }]
          if (!acilanYeniler.some(h => h.kod === cari.kod)) acilanYeniler.push({ kod: cari.kod, ad: cari.ad })
        }
        await faturaHesapKaydet(f.id, gercekKod, cari.kod)
        const vkn = String(f.karsi_vkn || '').replace(/\D/g, '')
        if (vkn && !yazilanVknler.has(vkn)) {
          yazilanVknler.add(vkn)
          try {
            await kuralKaydet(clientId, { vkn, hesapKodu: anaHesap.kod })
            setKurallar(prev => [...prev.filter(k => k.vkn !== vkn), { vkn, hesap_kodu: anaHesap.kod }])
          } catch { /* kural zorunlu degil */ }
        }
        atanan++
      } catch (e) {
        hataSayi++
        setMesaj({ tip: 'hata', metin: 'Atama hatası (' + (f.fatura_no || f.id) + '): ' + (e.message || e) })
        break
      }
    }
    if (acilanYeniler.length) {
      setHesapPlani(calismaPlan.sort((a, b) => a.kod.localeCompare(b.kod)))
      setYeniHesaplar(prev => {
        const ekle = acilanYeniler.filter(h => !prev.some(x => x.kod === h.kod))
        return [...prev, ...ekle]
      })
    }
    // Satirlari tazele (kayit sonrasi durumlar)
    const taze = await faturalariGetir(clientId, { yil: Number(yil), ay: Number(ay), yon: yon || null })
    setFaturalar(prev => prev.map(x => taze.find(t => t.id === x.id) || x))
    setSecimler({})
    setAtaCalisiyor(false)
    if (atanan) {
      setMesaj({
        tip: 'ok',
        metin: `${atanan} fatura "${anaHesap.kod}" hesabına atandı ve onaylandı.`
          + (acilanYeniler.length ? ` ${acilanYeniler.length} yeni cari hesap açıldı (son kod +1) — Luca Excel Fişi üretirken ek hesap planı dosyası da inecek.` : '')
          + (karmaKdvler.length ? ` UYARI: ${karmaKdvler.length} faturada birden fazla KDV oranı görünüyor (matrah/KDV oranı tutmuyor): ${karmaKdvler.slice(0, 5).join(', ')}${karmaKdvler.length > 5 ? '…' : ''} — bu faturalar genel kodla işlendi, Excel'de kontrol edin.` : '')
          + (hataSayi ? ` ${hataSayi} faturada hata.` : '')
      })
    }
  }

  const excelUret = async () => {
    const onayli = gorunen.filter(f => f.durum === 'onayli' || f.durum === 'luca')
    if (!onayli.length) {
      setMesaj({ tip: 'hata', metin: 'Onaylı fatura yok. Önce hesap kodlarını onaylayın.' })
      return
    }
    // Luca fis numaralari henüz atanmamışsa ata ve kaydet
    // 2.8.6b: coklu KDV parcalari da baglanir — her oran ayri fiş satırı olur
    const detayHarita = await kdvDetaylariGetir(onayli.map(f => f.id))
    const guncel = onayli.map((f, i) => ({ ...f, luca_fis_no: f.luca_fis_no || lucaFisNoUret(f, i + 1), kdvParcalari: detayHarita[f.id] || [] }))
    for (const f of guncel) {
      await faturaDurumGuncelle(f.id, 'luca', f.luca_fis_no)
    }
    const sonuc = lucaExcelIndir(guncel, `Luca_Fis_${musteriAdi(musteri)}_${yil}_${String(ay).padStart(2, '0')}.xlsx`, hesapPlani, {
      alis: kdvHesap?.kod?.startsWith('191') ? kdvHesap.kod : '191',
      satis: kdvHesap?.kod?.startsWith('391') ? kdvHesap.kod : '391'
    })
    if (!sonuc.ok) {
      setMesaj({ tip: 'hata', metin: 'Excel üretilemedi: atanmış hesap kodlu fatura yok.' })
      return
    }
    // Bu oturumda otomatik açılan yeni cariler varsa Luca hesap planı ek dosyası da iner
    const ekVar = yeniHesaplar.length ? lucaHesapPlaniEkIndir(yeniHesaplar) : false
    setMesaj({
      tip: 'ok',
      metin: `${sonuc.fisSayisi} fiş üretildi ve indirildi (${sonuc.eksikSayisi} fatura hesapsız, dahil edilmedi).`
        + (sonuc.karmaKdvler?.length ? ` UYARI: ${sonuc.karmaKdvler.length} faturada karışık KDV oranı — satırları kontrol edin.` : '')
        + (ekVar ? ` Ayrıca ${yeniHesaplar.length} yeni cari hesap için Luca_Hesap_Plani_Ek dosyası indirildi — önce bunu Luca'da Hesap Kodları Excel aktarımıyla açın, sonra fiş dosyasını yükleyin.` : ' Dosyayı Luca → Muhasebe → Excel Veri Aktarımı\'ndan yükleyin.')
    })
    setFaturalar(prev => prev.map(x => {
      const b = guncel.find(g => g.id === x.id)
      return b ? { ...x, durum: 'luca', luca_fis_no: b.luca_fis_no } : x
    }))
  }

  // 2.7.464: Onayi geri al — fatura tekrar bekliyor durumuna doner, kodlar
  // temizlenir; kullanici yeni kod yazip yeniden onaylayabilir.
  const onayKaldir = async (f) => {
    setKaydediliyor(p => ({ ...p, [f.id]: true }))
    try {
      await faturaOnayKaldir(f.id)
      setFaturalar(prev => prev.map(x => x.id === f.id ? { ...x, hesap_kodu: null, cari_hesabi: null, durum: 'bekliyor', luca_fis_no: null } : x))
    } catch (e) {
      setMesaj({ tip: 'hata', metin: 'Onay kaldırılamadı: ' + (e.message || e) })
    }
    setKaydediliyor(p => ({ ...p, [f.id]: false }))
  }

  // 2.7.465: MUBiS'te +1 ile acilan yeni carileri LUCA'DA otomatik ac
  // (Muhasebe > Hesap Planı Listesi > Yeni Hesap diyaloğu yardimciyla doldurulur)
  const [lucaHesapYukleniyor, setLucaHesapYukleniyor] = useState(false)
  const lucaHesaplariAc = async () => {
    if (!yeniHesaplar.length || !clientId) return
    setLucaHesapYukleniyor(true)
    setMesaj(null)
    try {
      const r = await lucaHesapEkle({ client: musteri, yil: Number(yil), hesaplar: yeniHesaplar })
      if (r?.ok) {
        setMesaj({
          tip: 'ok',
          metin: `Luca'da ${r.acilan || yeniHesaplar.length}/${r.toplam || yeniHesaplar.length} yeni hesap açıldı (${(r.kodlar || yeniHesaplar.map(h => h.kod)).join(', ')}).`
            + (r.hatalar?.length ? ` Hatalar: ${r.hatalar.join(' | ')}` : '')
        })
        if (!r.hatalar?.length) setYeniHesaplar([])
        else setYeniHesaplar(prev => prev.filter(h => !(r.kodlar || []).includes(h.kod)))
      } else {
        setMesaj({ tip: 'hata', metin: 'Luca hesap açma başarısız: ' + (r?.error || r?.not || 'bilinmeyen') })
      }
    } catch (e) {
      setMesaj({ tip: 'hata', metin: 'Luca hesap açma hatası: ' + (e.message || e) })
    }
    setLucaHesapYukleniyor(false)
  }

  // 2.7.466: Ünvana tıklayınca fatura dosyası (PDF/XML) yeni sekmede açılır —
  // hesap kodunu seçerken faturayı görmek için.
  const faturaAc = (f) => {
    const u = f.pdf_url || f.xml_url || f.html_url
    if (!u) {
      setMesaj({ tip: 'hata', metin: 'Bu fatura için kayıtlı dosya (PDF/XML) bulunamadı.' })
      return
    }
    window.open(u, '_blank', 'noreferrer')
  }

  // 2.7.466: Excel/CSV'den toplu hesap planı aktarımı (Luca şablonu birebir)
  const dosyaRef = useRef(null)
  const [aktariliyor, setAktariliyor] = useState(false)
  const hesapDosyasiSecildi = async (e) => {
    const dosya = e.target.files?.[0]
    e.target.value = ''
    if (!dosya) return
    setAktariliyor(true)
    setMesaj(null)
    try {
      const hesaplar = await hesapPlaniDosyadanOku(dosya)
      const r = await hesaplarTopluEkle(clientId, hesaplar)
      const plan = await hesapPlaniGetir(clientId)
      setHesapPlani(plan.sort((a, b) => a.kod.localeCompare(b.kod)))
      setMesaj({ tip: 'ok', metin: `Hesap planı aktarıldı: ${r.eklenen} yeni hesap açıldı, ${r.guncellenen} mevcut hesap güncellendi (toplam ${hesaplar.length} satır).` })
    } catch (err) {
      setMesaj({ tip: 'hata', metin: 'Aktarma hatası: ' + (err.message || err) })
    }
    setAktariliyor(false)
  }
  const yeniHesaplariExcelIndir = () => {
    if (!lucaHesapPlaniEkIndir(yeniHesaplar)) return
    setMesaj({ tip: 'ok', metin: `${yeniHesaplar.length} yeni hesap Luca aktarım şablonu olarak indirildi (CSV) — Luca > Muhasebe > Hesap Kodları > Excel Aktarım'dan yükleyin.` })
  }

  const durumRengi = (d) => d === 'luca' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
    : d === 'onayli' ? 'text-sky-400 bg-sky-500/10 border-sky-500/30'
      : 'text-amber-400 bg-amber-500/10 border-amber-500/30'

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Ust bar */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg bg-blue-900/40 hover:bg-blue-800/60 text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Calculator className="w-7 h-7 text-yellow-400" />
        <div>
          <h1 className="text-xl font-bold text-white">Fatura Muhasebeleştime</h1>
          <p className="text-xs text-gray-400">Hesap kodu ata, onayla, Luca Excel fiş dosyası üret</p>
        </div>
      </div>

      {/* 1. ŞİRKET + dönem + yön seçimi */}
      <div className="bg-blue-950/40 border border-blue-800/30 rounded-2xl p-4 mb-4">
        <label className="block text-[11px] uppercase tracking-wide text-yellow-400/80 font-semibold mb-1.5">1. Şirket seçimi</label>
        <select value={clientId} onChange={e => setClientId(e.target.value)} className="w-full md:w-96 bg-blue-900/60 border border-yellow-500/40 rounded-xl px-3 py-2.5 text-sm text-white font-medium">
          <option value="" disabled>— Şirket seçin —</option>
          {siraliMusteriler.map(c => <option key={c.id} value={c.id}>{musteriAdi(c)}{c.vkn ? ` · ${c.vkn}` : ''}</option>)}
        </select>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <select value={yil} onChange={e => setYil(e.target.value)} className="bg-blue-900/60 border border-blue-700/40 rounded-xl px-3 py-2.5 text-sm text-white">
            {Array.from({ length: 7 }, (_, i) => new Date().getFullYear() + 1 - i).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={ay} onChange={e => setAy(e.target.value)} className="bg-blue-900/60 border border-blue-700/40 rounded-xl px-3 py-2.5 text-sm text-white">
            {['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'].map((a, i) => <option key={i + 1} value={i + 1}>{a}</option>)}
          </select>
          <select value={yon} onChange={e => setYon(e.target.value)} className="bg-blue-900/60 border border-blue-700/40 rounded-xl px-3 py-2.5 text-sm text-white">
            <option value="">Alış + Satış</option>
            <option value="gelen">Alış (Gelen / Alınan)</option>
            <option value="giden">Satış (Giden / Kesilen)</option>
          </select>
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={arama} onChange={e => setArama(e.target.value)} placeholder="Satıcı / fatura no ara" className="w-full bg-blue-900/60 border border-blue-700/40 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-gray-500" />
          </div>
        </div>
      </div>

      {/* 2. HESAP KODU SEÇİMİ — tek pencere: ana hesap + kapanış + KDV alış/satış */}
      <div className="bg-blue-950/40 border border-yellow-500/20 rounded-2xl p-4 mb-4">
        <label className="block text-[11px] uppercase tracking-wide text-yellow-400/80 font-semibold mb-2">2. Hesap kodu seçimi</label>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          <div className="flex flex-col">
            <div className="text-[11px] text-gray-400 mb-1 h-[30px] overflow-hidden">Hesap kodu (gider/gelir) — 600, 153, 632, 770…; sonu KDV oranına göre eklenir (%20 → 153.01.5)</div>
            <HesapSecici hesapPlani={hesapPlani} deger={anaHesap} onSec={setAnaHesap} yerTutucu="Kod veya ad yazın: 153.01, 600, 770…" />
            {anaHesap && oranOzeti.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {oranOzeti.map(o => (
                  <span key={o.kod} className="px-2 py-0.5 rounded-lg bg-blue-900/60 border border-blue-700/40 text-[10px] text-blue-200">
                    %{o.oran} → {o.kod}
                  </span>
                ))}
                <span className="text-[10px] text-gray-500 self-center">KDV oranına göre otomatik</span>
              </div>
            )}
          </div>
          <div className="flex flex-col">
            <div className="text-[11px] text-gray-400 mb-1 h-[30px] overflow-hidden">KDV hesabı — 191 (alış) / 391 (satış); sonu orana göre eklenir (%20 → 191.01.4 / 391.01.7)</div>
            <HesapSecici hesapPlani={hesapPlani} deger={kdvHesap} onSec={setKdvHesap} yerTutucu="Kod yazın: 191, 191.01 veya 391, 391.01…" />
            {kdvOzeti.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {kdvOzeti.map(o => (
                  <span key={o.kod} className="px-2 py-0.5 rounded-lg bg-blue-900/60 border border-blue-700/40 text-[10px] text-blue-200">
                    %{o.oran} → {o.kod}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col">
            <div className="text-[11px] text-gray-400 mb-1 h-[30px] overflow-hidden">Kapanış hesabı — 120, 320 ve diğer fiş kapanış hesapları; ünvanla eşleşir, yoksa +1 açılır</div>
            <HesapSecici hesapPlani={hesapPlani} deger={kapanisKok ? hesapPlani.find(h => h.kod === kapanisKok) || { kod: kapanisKok, ad: '' } : null} onSec={(h) => setKapanisKok(h.kod)} yerTutucu="Kod yazın: 320, 120, 320.01…" />
          </div>
        </div>
      </div>

      {/* Aksiyon bar — tek satır, kompakt */}
      <div className="flex flex-nowrap items-center gap-2 mb-4 overflow-x-auto">
        <button onClick={yukle} disabled={!clientId || yukleniyor} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-900/60 hover:bg-blue-800/70 text-white text-xs font-medium whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">
          {yukleniyor ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Yenile
        </button>
        <button onClick={secilenlereAta} disabled={!clientId || ataCalisiyor || !seciliSayi} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed" title="İşaretli faturalara yukarıdaki hesap kodunu ata ve onayla">
          {ataCalisiyor ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Seçilenlere Ata{seciliSayi ? ` (${seciliSayi})` : ''}
        </button>
        <button onClick={excelUret} disabled={!clientId} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-xs font-medium whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">
          <FileSpreadsheet className="w-3.5 h-3.5" /> Luca Excel Fişi
        </button>
        <button onClick={() => hesapPlaniCsvIndir([])} disabled={!clientId} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-900/60 hover:bg-blue-800/70 text-white text-xs whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed" title="Luca'nın Hesap Kodları Excel aktarım şablonunu (CSV) indirir">
          <Download className="w-3.5 h-3.5" /> Şablon
        </button>
        <button onClick={() => dosyaRef.current?.click()} disabled={!clientId || aktariliyor} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-900/60 hover:bg-blue-800/70 text-white text-xs whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed" title="Luca şablonu formatındaki Excel/CSV hesap planını MUBiS'e aktarır — yeni kodlar açılır, mevcut kodlar güncellenir">
          {aktariliyor ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Excel/CSV Aktar
        </button>
        <input ref={dosyaRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={hesapDosyasiSecildi} />
        <button onClick={yeniHesaplariExcelIndir} disabled={!clientId || !yeniHesaplar.length} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-900/60 hover:bg-blue-800/70 text-white text-xs whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed" title="Otomatik açılan yeni 120/320 carilerini Luca'nın aktarım şablonu formatında (CSV) indirir — Luca > Muhasebe > Hesap Kodları > Excel Aktarım'dan yüklenir. Yeni hesap açılınca aktifleşir.">
          <Download className="w-3.5 h-3.5" /> Excel'e Hazırla{yeniHesaplar.length ? ` (${yeniHesaplar.length})` : ''}
        </button>
        <button onClick={lucaHesaplariAc} disabled={lucaHesapYukleniyor || !clientId || !yeniHesaplar.length} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          title="Otomatik açılan yeni 120/320 carilerini LUCA'DA otomatik açar: Muhasebe > Hesap Planı Listesi > Yeni Hesap diyaloğu yardımcı programla doldurulur. Yeni hesap açılınca aktifleşir.">
          {lucaHesapYukleniyor ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Building2 className="w-3.5 h-3.5" />}
          Luca'ya Aktar{yeniHesaplar.length ? ` (${yeniHesaplar.length})` : ''}
        </button>
        <div className="text-xs text-gray-400 ml-auto whitespace-nowrap">
          {gorunen.length} fatura · {hesapPlani.length} hesap kodu · {kurallar.length} kural
        </div>
      </div>

      {mesaj && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm border ${mesaj.tip === 'ok' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
          {mesaj.metin}
        </div>
      )}

      {/* Liste */}
      {!clientId ? (
        <div className="text-center py-20">
          <Calculator className="w-10 h-10 text-yellow-500/40 mx-auto mb-3" />
          <p className="text-gray-300 text-sm font-medium">Devam etmek için önce yukarıdan bir şirket seçin.</p>
          <p className="text-gray-500 text-xs mt-1">Seçilen şirketin faturaları, hesap planı ve kuralları yüklenecek.</p>
        </div>
      ) : yukleniyor ? (
        <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Yükleniyor…</div>
      ) : !gorunen.length ? (
        <div className="text-center py-20 text-gray-400">Bu ay sorgulanmış fatura bulunamadı. Önce Fatura Sorgulama'dan indirin.</div>
      ) : (
        <div className="space-y-2">
          {/* Tümünü seç satırı */}
          <div className="flex items-center gap-3 px-3 py-1.5">
            <input
              type="checkbox"
              checked={tumSecili}
              onChange={toggleTumu}
              className="w-4 h-4 accent-yellow-500"
              title="Tümünü seç / bırak"
            />
            <span className="text-[11px] text-gray-400">Tümünü seç (Luca'ya aktarılanlar hariç) — fatura başına onay kutucuğuyla seçin</span>
          </div>
          {gorunen.map(f => {
            const oran = kdvOraniTespit(f)
            // 2.8.6: Yabanci para faturasi TL kur ile gosterilir (isleme TL)
            const kurG = f.para_birimi && f.para_birimi !== 'TRY' ? (Number(f.doviz_kur) || 0) : 0
            const gMatrah = kurG ? Math.round((Number(f.matrah) || 0) * kurG * 100) / 100 : (Number(f.matrah) || 0)
            const gKdv = kurG ? Math.round((Number(f.kdv) || 0) * kurG * 100) / 100 : (Number(f.kdv) || 0)
            const gTutar = kurG ? Math.round((Number(f.tutar) || 0) * kurG * 100) / 100 : (Number(f.tutar) || 0)
            const gPb = kurG ? 'TRY' : (f.para_birimi || 'TRY')
            const lucada = f.durum === 'luca'
            const onayli = f.durum === 'onayli'
            return (
              <div key={f.id} className={`bg-blue-950/40 border border-blue-800/30 rounded-xl p-3 flex flex-wrap items-center gap-3 ${secimler[f.id] ? 'ring-1 ring-yellow-500/40' : ''}`}>
                {!lucada && (
                  <input
                    type="checkbox"
                    checked={!!secimler[f.id]}
                    onChange={e => setSecimler(p => {
                      const yeni = { ...p, [f.id]: e.target.checked }
                      // Aynı firmanın diğer faturaları da birlikte işaretlenir/bırakılır
                      for (const id of ayniFirmaIdler(f)) yeni[id] = e.target.checked
                      return yeni
                    })}
                    className="w-4 h-4 accent-yellow-500"
                    title="Bu faturayı seç — aynı firmanın diğer faturaları da otomatik seçilir"
                  />
                )}
                <span className={`px-2 py-0.5 rounded-lg border text-[11px] font-medium ${durumRengi(f.durum)}`}>
                  {lucada ? `Luca ${f.luca_fis_no || '✓'}` : onayli ? 'Onaylı' : 'Bekliyor'}
                </span>
                <div className="min-w-0 flex-1">
                  <button
                    onClick={() => faturaAc(f)}
                    className="text-sm text-white truncate text-left hover:text-yellow-300 hover:underline"
                    title="Faturayı görüntüle (PDF/XML) — yeni sekmede açılır"
                  >
                    {f.karsi_unvan || '(ünvan yok)'}
                  </button>
                  {f.karsi_vkn ? <span className="text-gray-500 text-sm"> · {f.karsi_vkn}</span> : null}
                  <div className="text-[11px] text-gray-500 truncate">
                    {String(f.tarih || '').slice(0, 10)} · {f.fatura_no || '-'} · {f.yon === 'giden' ? 'Satış' : 'Alış'} · {tl(gMatrah)} + {oran > 0 ? <span className="text-yellow-400/90 font-medium">%{oran}</span> : null} KDV {tl(gKdv)} = <b className="text-gray-300">{tl(gTutar)} {gPb}</b>
                    {kurG ? <span className="text-gray-500"> (kur {tl(kurG)} · {f.para_birimi} {tl(Number(f.tutar) || 0)})</span> : null}
                    {oran === -1 ? <span className="text-amber-500/90" title="Matrah/KDV oranı standart değil — birden fazla oran olabilir"> · KDV karışık</span> : null}
                    {f.hesap_kodu ? <span className="text-sky-300/90"> · Hesap: {f.hesap_kodu}</span> : null}
                    {f.cari_hesabi ? <span className="text-emerald-400/80"> · Cari: {f.cari_hesabi}</span> : null}
                  </div>
                </div>
                {onayli || lucada ? (
                  // Luca'ya aktarılan fişlerin onayı da geri alınabilir (2.7.466):
                  // kullanıcı istegi — kodu düzeltip yeniden onaylayabilsin.
                  <button
                    onClick={() => onayKaldir(f)}
                    disabled={kaydediliyor[f.id]}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600/80 hover:bg-amber-500 text-white text-xs font-medium disabled:opacity-40"
                    title="Onayı geri al — yeniden atayabilirsiniz"
                  >
                    {kaydediliyor[f.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />} Onayı Kaldır
                  </button>
                ) : (
                  <button
                    onClick={() => tekKaydet(f, anaHesap?.kod)}
                    disabled={!anaHesap?.kod || kaydediliyor[f.id]}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white text-xs font-medium disabled:opacity-40"
                    title="Yukarıda seçtiğiniz hesap kodunu bu faturaya atar — aynı firmanın diğer faturalarına da otomatik uygulanır"
                  >
                    {kaydediliyor[f.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Onayla
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
