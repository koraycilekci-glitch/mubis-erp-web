import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useClients } from '../hooks/useClients'
import { clientDisplayName, sortClients } from '../utils/clientDisplay'
import {
  Inbox, RefreshCw, Search, Download, Eye, EyeOff,
  MessageCircle, Mail, AlertTriangle, Loader2, Trash2, Users, Clock, X
} from 'lucide-react'
import { gibYardimciDurumu } from '../utils/gibOdemeHelper'
import {
  etebligatlariGetir, etebligatlariSorgula, etebligatlariTopluBelgeIndir, sgkEtebligatlariSorgula,
  etebligatBelgesiAl, okunduAyarla, kullaniciOkunduSeti, gonderimKaydet, etebligatSil, tebligatPdfGetir, yeniTebligatlariTemizle
} from '../services/etebligatService'
import { sendDocumentViaWhatsAppChannel, sendEmail } from '../services/whatsappService'
import { getSettings } from '../services/settingsService'
import { supabase } from '../lib/supabase'

// Tebligat tarihi filtreleri icin yardimci: "18.09.2026" / "2026-09-18" gibi
// metinleri Date'e cevirir; cozemezse null dondurur.
function tarihCoz(metin) {
  if (!metin) return null
  const s = String(metin).trim()
  let m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3])
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

// file_url → gerçek belge mi? (liste çıktısı değil) — oturum boyu önbellek
const hazirKontrolOnbellek = new Map()

export default function Tebligatlar() {
  const { clients } = useClients()
  // 2.7.521: admin ana ekrandaki uyaridan gelinirse (?musteri=<id>&yeni=1)
  // ilgili musteri secilir ve "Yeni Gelen Tebligatlar" listesi acilir
  const [aramaParams, setAramaParams] = useSearchParams()
  const uyariMusteriId = aramaParams.get('musteri') || ''
  const uyariYeni = aramaParams.get('yeni') === '1'
  const musteriler = useMemo(
    () => [...(clients || [])].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'tr')),
    [clients]
  )

  const [seciliId, setSeciliId] = useState(uyariMusteriId)
  // 2.8.7: bildirim rozetinden ?musteri= ile gelindiginde (bilesen zaten acikken
  // parametre degisse bile) secim guncellenir — gelen kisi secili acilir.
  useEffect(() => {
    if (uyariMusteriId) setSeciliId(String(uyariMusteriId))
  }, [uyariMusteriId])
  const [satirlar, setSatirlar] = useState([])
  const [durum, setDurum] = useState('') // yardimci durumu: ok | kurulu-degil | ...
  const [kaynakSecim, setKaynakSecim] = useState('vergi') // 'vergi' | 'sgk'
  const [sgkAsama, setSgkAsama] = useState('') // SGK sorgu asamasi metni
  const [filtreOkundu, setFiltreOkundu] = useState('') // '' | false | true
  const [filtreZaman, setFiltreZaman] = useState('hepsi') // hepsi | 4gun
  const [arama, setArama] = useState('')
  const [yukleniyor, setYukleniyor] = useState(false)
  const [topluIndiriliyor, setTopluIndiriliyor] = useState(false)
  const [islem, setIslem] = useState({ belgeNo: null, tip: null }) // satir ici islem gostergesi
  const [seciliSet, setSeciliSet] = useState(new Set()) // toplu gonderim secimi (belge_no)
  const [toplu, setToplu] = useState({ aktif: false, toplam: 0, bitti: 0 })
  const [mesaj, setMesaj] = useState(null) // {tip: 'ok'|'hata', metin}
  const [settings, setSettings] = useState(null)

  // 2.7.472: "Görüntülemeye hazır" doğrulaması — kayıtlı PDF gerçek belge mi
  // (JasperReports liste çıktısı DEĞİL mi)? Sonuç URL bazında önbelleklenir;
  // hazır olmayan belgelerin göz ikonu soluktur ve tıklanamaz (GİB'e tekrar
  // bağlanıp liste çıktısını indirmeye çalışmaz).
  const [hazirMap, setHazirMap] = useState({})

  // Toplu sorgulama durumu
  const [topluPanel, setTopluPanel] = useState(false)
  const [topluSecim, setTopluSecim] = useState(new Set())
  const [topluArama, setTopluArama] = useState('')
  const [topluSorgu, setTopluSorgu] = useState({ aktif: false, toplam: 0, bitti: 0, suAn: '' })

  // Otomatik sorgu planlari (gun + saat; yardimci program vadesi gelen
  // planlari kendi basina calistirir)
  const [cronPanel, setCronPanel] = useState(false)
  const [cronPlanlar, setCronPlanlar] = useState([])
  const [cronSecim, setCronSecim] = useState(new Set())
  const [cronGunler, setCronGunler] = useState(new Set())
  const [cronSaat, setCronSaat] = useState('09:00')
  const [cronTekrar, setCronTekrar] = useState(true)
  const [cronKaydediliyor, setCronKaydediliyor] = useState(false)
  // 2.8.2: Kayitli planlarda toplu silme icin secim
  const [cronPlanSecim, setCronPlanSecim] = useState(new Set())
  // 2.8.320: Otomatik GONDERIM plani
  const [gonderimPanel, setGonderimPanel] = useState(false)
  const [gonderimPlan, setGonderimPlan] = useState(null)
  const [gonderimAktif, setGonderimAktif] = useState(false)
  const [gonderimGunler, setGonderimGunler] = useState(new Set())
  const [gonderimAyGunler, setGonderimAyGunler] = useState(new Set())
  const [gonderimSaat, setGonderimSaat] = useState('09:00')
  const [gonderimKanal, setGonderimKanal] = useState('tercih')
  const [gonderimMusteriler, setGonderimMusteriler] = useState(new Set())
  const [gonderimMusteriAcik, setGonderimMusteriAcik] = useState(false)
  const [gonderimKaydediliyor, setGonderimKaydediliyor] = useState(false)
  const [gonderimMesaj, setGonderimMesaj] = useState(null)

  const gonderimYukle = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/etebligat-gonderim', { headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} })
      const j = await r.json().catch(() => null)
      if (j?.ok && j.plan) {
        const p = j.plan
        setGonderimPlan(p)
        setGonderimAktif(p.aktif !== false)
        setGonderimGunler(new Set((p.gunler || []).filter(n => n >= 0 && n <= 6)))
        setGonderimAyGunler(new Set((p.gunler || []).filter(n => n >= 101 && n <= 131).map(n => n - 100)))
        setGonderimSaat(p.saat || '09:00')
        setGonderimKanal(p.kanal || 'tercih')
        setGonderimMusteriler(new Set((p.musteriler || []).map(Number)))
        setGonderimMusteriAcik((p.musteriler || []).length > 0)
      } else {
        setGonderimPlan(null)
      }
    } catch { /* yoksay */ }
  }, [])

  const gonderimPlanKaydet = async (aktifTercihi = gonderimAktif) => {
    const oncekiAktif = gonderimAktif
    const tumGunler = [...gonderimGunler, ...[...gonderimAyGunler].map(d => 100 + d)]
    if (aktifTercihi && !tumGunler.length) { setGonderimMesaj({ ok: false, t: 'En az bir gün seçin.' }); return }
    setGonderimAktif(aktifTercihi)
    setGonderimKaydediliyor(true)
    setGonderimMesaj(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/etebligat-gonderim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({
          aktif: aktifTercihi,
          gunler: tumGunler,
          saat: gonderimSaat,
          kanal: gonderimKanal,
          musteriler: gonderimMusteriAcik && gonderimMusteriler.size ? [...gonderimMusteriler] : []
        })
      })
      const j = await r.json()
      if (j.ok) {
        setGonderimPlan(j.plan)
        await gonderimYukle()
        setGonderimMesaj({ ok: true, t: aktifTercihi ? 'Otomatik gönderim planı kaydedildi. Seçilen gün/saatte seçili müşterilerin gönderilmemiş tebligatları otomatik gönderilecek.' : 'Otomatik gönderim kapatıldı.' })
      } else {
        setGonderimAktif(oncekiAktif)
        setGonderimMesaj({ ok: false, t: j.error || 'Kaydedilemedi.' })
      }
    } catch {
      setGonderimAktif(oncekiAktif)
      setGonderimMesaj({ ok: false, t: 'Bağlantı hatası.' })
    } finally { setGonderimKaydediliyor(false) }
  }

  const gonderimIptal = async () => {
    if (!window.confirm('Otomatik gönderim planı silinecek. Emin misiniz?')) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/etebligat-gonderim', { method: 'DELETE', headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} })
      const j = await r.json()
      if (j.ok) { setGonderimPlan(null); setGonderimMesaj({ ok: true, t: 'Plan iptal edildi.' }) }
    } catch { /* yoksay */ }
  }

  useEffect(() => {
    gibYardimciDurumu().then(setDurum).catch(() => setDurum('kurulu-degil'))
    getSettings().then(setSettings).catch(() => {})
    gonderimYukle().catch(() => {})
  }, [])

  // Musteri degisince kayitli listeyi yukle
  useEffect(() => {
    if (!seciliId) { setSatirlar([]); return }
    setSeciliSet(new Set())
    let iptal = false
    if (seciliId === 'hepsi') {
      // Tum musterilerin tebligatlarini birlestir, tarihe gore azalan sirala
      const istekler = musteriler.map(c =>
        etebligatlariGetir(c.id).then(s => (s || []).map(t => ({ ...t, _musteri: c.name || c.company || ('Müşteri #' + c.id) }))).catch(() => [])
      )
      Promise.all(istekler).then(listeler => {
        if (iptal) return
        const birlesik = listeler.flat()
        birlesik.sort((a, b) => {
          const da = tarihCoz(a.teblig_tarihi)
          const db = tarihCoz(b.teblig_tarihi)
          if (da && db) return db - da
          return String(b.teblig_tarihi || '').localeCompare(String(a.teblig_tarihi || ''), 'tr')
        })
        setSatirlar(birlesik)
        setOkunduSetim(new Set())
      })
      return () => { iptal = true }
    }
    etebligatlariGetir(seciliId).then(s => { if (!iptal) setSatirlar(s || []) })
    // 2.8.5: bu kullaniciya ozel okundu isaretleri (kim okuduysa onda okundu)
    kullaniciOkunduSeti(seciliId).then(s => { if (!iptal) setOkunduSetim(s || new Set()) }).catch(() => {})
    return () => { iptal = true }
  }, [seciliId, musteriler])

  // 2.8.5: KISIYE OZEL OKUNDU — paylasilan okundu kolonu + bu kullanicinin
  // kendi isaretleri birlesik degerlendirilir. Baska birisi (diger admin,
  // personel veya musteri) okusa bile bu kullanici okuyana kadar kendi
  // tarafinda "okunmamis" gorur.
  const [okunduSetim, setOkunduSetim] = useState(new Set())
  const effOkundu = useCallback((s) => !!(s?.okundu || okunduSetim.has(s?.belge_no)), [okunduSetim])

  const hepsiSecili = seciliId === 'hepsi'
const seciliMusteri = hepsiSecili ? null : musteriler.find(m => String(m.id) === String(seciliId))
  // 2.7.521: "Yeni Gelen Tebligatlar" listesi — onceki sorgudan sonra gelenler
  const yeniSatirlar = useMemo(() => satirlar.filter(s => s.yeni), [satirlar])

  // Görüntülemeye hazır belgeleri belirle: file_url'i olan satırların PDF'i
  // arka planda doğrulanır (liste çıktısı olanlar "hazır değil" sayılır).
  useEffect(() => {
    let iptal = false
    const tumunuGuncelle = () => {
      setHazirMap(prev => {
        const yeni = {}
        for (const s of satirlar) yeni[s.belge_no] = hazirKontrolOnbellek.get(s.file_url) === true
        return yeni
      })
    }
    tumunuGuncelle()
    const adaylar = satirlar.filter(s => s.file_url && !hazirKontrolOnbellek.has(s.file_url))
    ;(async () => {
      for (let i = 0; i < adaylar.length; i += 4) {
        const grup = adaylar.slice(i, i + 4)
        await Promise.all(grup.map(async s => {
          const belge = await tebligatPdfGetir(s.file_url)
          hazirKontrolOnbellek.set(s.file_url, belge.ok)
        }))
        if (iptal) return
        tumunuGuncelle()
      }
    })()
    return () => { iptal = true }
  }, [satirlar])

  const sorgula = useCallback(async () => {
    if (!seciliMusteri) return
    setYukleniyor(true)
    setMesaj(null)
    setSgkAsama('')
    try {
      // SGK: e-Devlet uzerinden (yardimci e-Tebligatlarim sayfasini acar,
      // kullanici guvenlik kodunu girer, PDF'ler otomatik iner)
      if (kaynakSecim === 'sgk') {
        setMesaj({ tip: 'ok', metin: 'e-Devlet penceresi açılıyor — TC, şifre ve güvenlik kodu otomatik doldurulacak, tebligatlar otomatik indirilecek. Sayfayı kapatmayın.' })
        const res = await sgkEtebligatlariSorgula(seciliMusteri, (asama) => {
          const asamalar = {
            'edevlet-aciliyor': 'e-Devlet giriş ekranı açılıyor…',
            'captcha-bekleniyor': 'Güvenlik kodu otomatik dolduruluyor; gerekirse yardımcı programın penceresinde elle girip GİRİŞ\'e basın…',
            'dosya-bekleniyor': 'Giriş yapıldı — SGK tebligatları indiriliyor, bekleyin…'
          }
          setSgkAsama(asamalar[asama] || '')
        })
        if (!res.ok) {
          const nedenler = {
            'edevlet-bilgi-eksik': 'Müşteri kaydında e-Devlet TC + şifresi eksik (veya işaretli ortak yok).',
            'kurulu-degil': 'Yardımcı program çalışmıyor. Bilgisayarınızdan mubis-gib-yardimci.exe ile başlatın.',
            'erisim-engelli': 'Yardımcı programın eski bir sürümü çalışıyor. Güncelleyin.',
            'servis-yanit-vermedi': 'Yardımcı program yanıt vermedi, tekrar deneyin.',
            'sgk-belge-yok': res.not || 'Yeni SGK tebligatı inmedi. Yardımcı programın penceresinde e-Devlet girişi tamamlandı mı?'
          }
          setMesaj({ tip: 'hata', metin: nedenler[res.reason] || 'Sorgu başarısız: ' + (res.reason || res.hata || 'bilinmeyen') })
        } else {
          setSatirlar(res.tebligatlar || [])
          setMesaj({ tip: 'ok', metin: res.not || `${res.toplam} SGK tebligatı indirildi.` })
        }
        setSgkAsama('')
        setYukleniyor(false)
        return
      }
      // Vergi: Dijital Vergi Dairesi (DVS) uzerinden — tam otomatik
      const res = await etebligatlariSorgula(seciliMusteri)
      if (!res.ok) {
        const nedenler = {
          'dvs-sifre-eksik': 'Müşteri kaydında Dijital Vergi Dairesi kullanıcı adı/şifresi eksik.',
          'kurulu-degil': 'Yardımcı program çalışmıyor. Bilgisayarınızdan mubis-gib-yardimci.exe ile başlatın.',
          'erisim-engelli': 'Yardımcı programın eski bir sürümü çalışıyor. Güncelleyin.',
          'servis-yanit-vermedi': 'Yardımcı program yanıt vermedi, tekrar deneyin.'
        }
        setMesaj({ tip: 'hata', metin: nedenler[res.reason] || 'Sorgu başarısız: ' + (res.reason || res.hata || 'bilinmeyen') })
      } else {
        // 2.7.387: Sorgulama sonrasi belgeleri OTOMATIK indir — kullanicinin
        // ekstra "Toplu Tebligat" tiklamasına gerek kalmasin.
        const bulunan = res.tebligatlar || []
        setSatirlar(bulunan)
        // 2.7.454: yardimci her sorguda SADECE en yeni 10 belgeyi indirir
        // (122 belge icin ~37 dk suruyordu); mesajda bunu yansit.
        const eksikOlan = bulunan.filter(s => !s.file_url).length
        const indirilecek = Math.min(eksikOlan, 10)
        if (indirilecek > 0) {
          setTopluIndiriliyor(true)
          const kalan = eksikOlan - indirilecek
          setMesaj({ tip: 'ok', metin: `${res.toplam} tebligat bulundu (${res.okunmamis} okunmamış). En yeni ${indirilecek} belge otomatik indiriliyor (~${Math.ceil(indirilecek * 0.3)} dk)${kalan > 0 ? `; kalan ${kalan} belge için Toplu Sorgu'yu tekrar çalıştırın` : ''}… Bu sekme açık kalmalı; kapanırsa inen belgeler buluta yüklenmez.` })
          try {
            const resI = await etebligatlariTopluBelgeIndir(seciliMusteri)
            if (resI.ok) {
              setSatirlar(resI.tebligatlar || bulunan)
              setMesaj({ tip: 'ok', metin: `${res.toplam} tebligat bulundu; ${resI.indirilenSayi || 0} belge otomatik indirildi. Listeden Görüntüle ile açabilirsiniz.` })
            } else {
              const nedenler = {
                'dvs-sifre-eksik': 'DVS şifresi eksik',
                'kurulu-degil': 'Yardımcı program çalışmıyor',
                'erisim-engelli': 'Yardımcı program eski sürüm (2.7.387 gerekli)',
                'servis-yanit-vermedi': 'Yardımcı program yanıt vermedi'
              }
              setMesaj({ tip: 'ok', metin: `${res.toplam} tebligat listelendi. Otomatik indirme başarısız (${nedenler[resI.reason] || resI.reason || resI.hata || 'bilinmeyen'}); Görüntüle ile tek tek indirebilirsiniz.` })
            }
          } catch (e) {
            setMesaj({ tip: 'ok', metin: `${res.toplam} tebligat listelendi. Otomatik indirme hatası: ${e?.message || e}` })
          }
          setTopluIndiriliyor(false)
          if (seciliId) etebligatlariGetir(seciliId).then(s => setSatirlar(s || []))
        } else {
          setMesaj({ tip: 'ok', metin: `${res.toplam} tebligat listelendi (${res.okunmamis} okunmamış). Tüm belgeler indirilmiş durumda.` })
        }
      }
    } catch (e) {
      setMesaj({ tip: 'hata', metin: 'Sorgu hatası: ' + (e?.message || e) })
    }
    setYukleniyor(false)
  }, [seciliMusteri, kaynakSecim])

  // "Vergi Dairesi Toplu Tebligat": listelenen tebligatlarin PDF'lerini ayni
  // DVS oturumunda tek tek indirir (belge basina ~10-20 sn; 30 belge siniri).
  const vergiTopluIndir = useCallback(async () => {
    if (!seciliMusteri || topluIndiriliyor) return
    const indirilecek = satirlar.filter(s => !s.file_url).length
    if (!indirilecek) {
      setMesaj({ tip: 'ok', metin: 'Tüm tebligat belgeleri zaten indirilmiş.' })
      return
    }
    if (!window.confirm(
      `${indirilecek} tebligat belgesi indirilecek. Bu işlem belge başına ~10-20 sn sürer ve pencere boyunca bilgisayarınızı kapatmamanız gerekir. Devam edilsin mi?`
    )) return
    setTopluIndiriliyor(true)
    setMesaj({ tip: 'ok', metin: `Toplu tebligat indiriliyor (${indirilecek} belge)… Bu sekme açık kalmalı; kapanırsa inen belgeler buluta yüklenmez.` })
    try {
      const res = await etebligatlariTopluBelgeIndir(seciliMusteri)
      if (!res.ok) {
        const nedenler = {
          'dvs-sifre-eksik': 'Müşteri kaydında Dijital Vergi Dairesi kullanıcı adı/şifresi eksik.',
          'kurulu-degil': 'Yardımcı program çalışmıyor.',
          'erisim-engelli': 'Yardımcı programın eski bir sürümü çalışıyor. Güncelleyin (2.7.386+).',
          'servis-yanit-vermedi': 'Yardımcı program yanıt vermedi, tekrar deneyin.'
        }
        setMesaj({ tip: 'hata', metin: nedenler[res.reason] || 'Toplu indirme başarısız: ' + (res.reason || res.hata || 'bilinmeyen') })
      } else {
        setSatirlar(res.tebligatlar || [])
        const sayi = res.indirilenSayi || 0
        setMesaj({ tip: 'ok', metin: `Toplu tebligat tamamlandı: ${sayi} belge indirildi. Listeden Görüntüle ile açabilirsiniz.` })
      }
    } catch (e) {
      setMesaj({ tip: 'hata', metin: 'Toplu indirme hatası: ' + (e?.message || e) })
    }
    setTopluIndiriliyor(false)
    // Kayitli listeyi tazele (file_url'ler guncellendi)
    if (seciliId) etebligatlariGetir(seciliId).then(s => setSatirlar(s || []))
  }, [seciliMusteri, seciliId, satirlar, topluIndiriliyor])

  // Toplu sorgulama: secili musteriler sirayla sorgulanir (hizli — sadece
  // liste; belgeler Görüntüle ile tek tek veya Toplu Tebligat ile indirilir).
  const topluSorgula = useCallback(async () => {
    const secilen = musteriler.filter(m => topluSecim.has(String(m.id)))
    if (!secilen.length) return
    setTopluPanel(false)
    setTopluSorgu({ aktif: true, toplam: secilen.length, bitti: 0, suAn: secilen[0].name || '' })
    const hatalar = []
    for (let i = 0; i < secilen.length; i++) {
      const m = secilen[i]
      setTopluSorgu(t => ({ ...t, bitti: i, suAn: m.name || m.company || '' }))
      try {
        const r = await etebligatlariSorgula(m)
        if (!r.ok) hatalar.push(`${m.name || m.id}: ${r.reason === 'dvs-sifre-eksik' ? 'DVS şifresi eksik' : (r.reason || r.hata || 'hata')}`)
      } catch (e) {
        hatalar.push(`${m.name || m.id}: ${e?.message || e}`)
      }
    }
    setTopluSorgu({ aktif: false, toplam: 0, bitti: secilen.length, suAn: '' })
    setTopluSecim(new Set())
    if (hatalar.length) {
      setMesaj({ tip: 'hata', metin: `${secilen.length - hatalar.length} müşteri sorgulandı, ${hatalar.length} hatalı: ` + hatalar.slice(0, 3).join(' | ') + (hatalar.length > 3 ? ' …' : '') })
    } else {
      setMesaj({ tip: 'ok', metin: `${secilen.length} müşteri için tebligatlar listelendi. Belgeler "Görüntüle" ile tek tek indirilir.` })
    }
    // Secili musterinin listesini tazele
    if (seciliId) etebligatlariGetir(seciliId).then(s => setSatirlar(s || []))
  }, [topluSecim, musteriler, seciliId])

  const topluFiltreliMusteriler = useMemo(() => {
    if (!topluArama.trim()) return musteriler
    const a = topluArama.toLocaleLowerCase('tr')
    return musteriler.filter(m => String(m.name || m.company || '').toLocaleLowerCase('tr').includes(a))
  }, [musteriler, topluArama])

  // ===== Otomatik sorgu planlari =====
  const cronPlanlariYukle = useCallback(async () => {
    try {
      const r = await fetch('/api/etebligat-cron?ui=1')
      const j = await r.json()
      if (j.ok) setCronPlanlar(j.planlar || [])
    } catch { /* yoksay */ }
  }, [])
  useEffect(() => { if (cronPanel) cronPlanlariYukle() }, [cronPanel, cronPlanlariYukle])

  // 2.8.1: TUM otomatik sorgu planlarini tek tusla iptal et
  const cronTumunuIptal = useCallback(async () => {
    if (!window.confirm('Tüm otomatik sorgu planları iptal edilecek. Emin misiniz?')) return
    try {
      const r = await fetch('/api/etebligat-cron', { method: 'DELETE' })
      const j = await r.json()
      if (j.ok) {
        setMesaj({ tip: 'ok', metin: 'Tüm otomatik sorgu planları iptal edildi. Artık otomatik sorgu yapılmayacak.' })
        await cronPlanlariYukle()
      } else {
        setMesaj({ tip: 'hata', metin: 'İptal edilemedi: ' + (j.error || 'bilinmeyen hata') })
      }
    } catch (e) {
      setMesaj({ tip: 'hata', metin: 'İptal edilemedi: ' + (e?.message || e) })
    }
  }, [cronPlanlariYukle])

  const cronPlanKaydet = useCallback(async () => {
    setCronKaydediliyor(true)
    try {
      const r = await fetch('/api/etebligat-cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_ids: [...cronSecim].map(Number), gunler: [...cronGunler], saat: cronSaat, tekrar: cronTekrar })
      })
      const j = await r.json()
      if (!j.ok) {
        setMesaj({ tip: 'hata', metin: 'Plan kaydedilemedi: ' + (j.error || 'bilinmeyen hata') })
        return
      }
      setMesaj({ tip: 'ok', metin: `Otomatik sorgu planı kaydedildi (${j.eklenen} müşteri). Seçilen günlerde saat ${cronSaat}'te sunucu otomatik sorgular — ilk çalışma bir sonraki seçilen günde olur. Yeni tebligat gelince MUBiS bildirim düşer.` })
      setCronSecim(new Set())
      await cronPlanlariYukle()
    } catch (e) {
      setMesaj({ tip: 'hata', metin: 'Plan kaydedilemedi: ' + (e?.message || e) })
    } finally {
      setCronKaydediliyor(false)
    }
  }, [cronSecim, cronGunler, cronSaat, cronTekrar, cronPlanlariYukle])

  const cronPlanSil = useCallback(async (id) => {
    try { await fetch('/api/etebligat-cron?id=' + id, { method: 'DELETE' }) } catch { /* yoksay */ }
    await cronPlanlariYukle()
  }, [cronPlanlariYukle])

  // 2.8.2: Secili planlari toplu sil (checkbox ile isaretlenenler)
  const cronPlanlariSecilenleriSil = useCallback(async () => {
    const ids = [...cronPlanSecim]
    if (!ids.length) return
    if (!window.confirm(`${ids.length} plan silinecek. Emin misiniz?`)) return
    try {
      const r = await fetch('/api/etebligat-cron?ids=' + ids.join(','), { method: 'DELETE' })
      const j = await r.json()
      if (j.ok) {
        setMesaj({ tip: 'ok', metin: `${ids.length} plan silindi.` })
        setCronPlanSecim(new Set())
        await cronPlanlariYukle()
      } else {
        setMesaj({ tip: 'hata', metin: 'Silinemedi: ' + (j.error || 'bilinmeyen hata') })
      }
    } catch (e) {
      setMesaj({ tip: 'hata', metin: 'Silinemedi: ' + (e?.message || e) })
    }
  }, [cronPlanSecim, cronPlanlariYukle])

  // Belgeyi indir + ac + Storage'a yukle
  // yenidenIndir=true: kayitli PDF olsa bile DVS'ten yeniden indirilir.
  const belgeAc = useCallback(async (satir, yenidenIndir = false) => {
    const musteri = seciliMusteri || musteriler.find(m => String(m.id) === String(satir.client_id))
    if (!musteri) return
    // 2.7.466: Toplu indirme surerken tek belge tıklaması yardımcının
    // tarayıcı pencerisini kapatıp toplu indirmeyi bozuyordu — engelle.
    if (!yenidenIndir && topluIndiriliyor) {
      setMesaj({ tip: 'hata', metin: 'Toplu indirme sürüyor; bitince görüntüleyebilirsiniz.' })
      return
    }
    setIslem({ belgeNo: satir.belge_no, tip: 'indir' })
    setMesaj(null)
    try {
      if (satir.file_url && !yenidenIndir) {
        const belge = await tebligatPdfGetir(satir.file_url)
        hazirKontrolOnbellek.set(satir.file_url, belge.ok)
        setHazirMap(prev => ({ ...prev, [satir.belge_no]: belge.ok }))
        if (belge.ok) {
          const objeUrl = URL.createObjectURL(belge.blob)
          window.open(objeUrl, '_blank', 'noopener')
          setTimeout(() => URL.revokeObjectURL(objeUrl), 5 * 60 * 1000)
          // 2.8.5: belgeyi ACAN kullanicida okundu isaretlenir (kisiye ozel)
          try {
            await okunduAyarla(seciliId, satir.belge_no, true)
            setOkunduSetim(prev => new Set(prev).add(satir.belge_no))
          } catch { /* okundu isareti kritik degil */ }
          setIslem({ belgeNo: null, tip: null })
          return
        }
        if (belge.reason === 'liste-ciktisi') {
          setMesaj({ tip: 'hata', metin: 'Bu kaydın PDF’i tebligat LİSTESİ çıktısı — görüntülemeye hazır değil. Yanındaki İndir tuşuyla DVS’ten belgeyi yeniden indirin.' })
          setIslem({ belgeNo: null, tip: null })
          return
        }
      }
      // SGK satirlarinda PDF sorgu sirasinda iner; sonradan DVS'ten
      // indirilemeyecegi icin yardimciya gitmek anlamsizdir.
      if ((satir.kaynak || 'vergi') === 'sgk') {
        setMesaj({ tip: 'hata', metin: 'Bu SGK tebligatının PDF’i bulunamadı. SGK tebligatlarını yeniden sorgulayın.' })
        setIslem({ belgeNo: null, tip: null })
        return
      }
      const res = await etebligatBelgesiAl(musteri, satir)
      if (!res.ok) {
        setMesaj({ tip: 'hata', metin: res.reason === 'liste-ciktisi'
          ? 'İndirilen dosya tebligat LİSTESİ çıktısı (belgenin kendisi değil). Yardımcı programı güncelleyip tekrar deneyin; sorun sürerse bu tebligatı bize bildirin.'
          : 'Belge indirilemedi: ' + (res.reason || res.hata || 'bilinmeyen') })
      } else {
        const objeUrl = URL.createObjectURL(res.blob)
        window.open(objeUrl, '_blank', 'noopener')
        setTimeout(() => URL.revokeObjectURL(objeUrl), 5 * 60 * 1000)
        setSatirlar(prev => prev.map(s => s.belge_no === satir.belge_no ? { ...s, file_url: res.url } : s))
        // 2.8.5: belgeyi ACAN kullanicida okundu isaretlenir (kisiye ozel)
        try {
          await okunduAyarla(seciliId, satir.belge_no, true)
          setOkunduSetim(prev => new Set(prev).add(satir.belge_no))
        } catch { /* okundu isareti kritik degil */ }
        setMesaj({ tip: 'ok', metin: 'Belge indirildi ve görüntülendi.' })
      }
    } catch (e) {
      setMesaj({ tip: 'hata', metin: 'Belge indirme hatası: ' + (e?.message || e) })
    }
    setIslem({ belgeNo: null, tip: null })
  }, [seciliMusteri, musteriler, seciliId, topluIndiriliyor])

  // Filtreler (toplu gonderim ve secim yardimcilari bunu kullanir; ustte tanimli olmali)
  const gorunenSatirlar = useMemo(() => {
    // Kaynak ayrimi: eski kayitlarda kaynak yoksa 'vergi' kabul edilir
    let liste = satirlar.filter(s => (s.kaynak || 'vergi') === kaynakSecim)
    if (filtreOkundu !== '') liste = liste.filter(s => String(effOkundu(s)) === filtreOkundu)
    if (filtreZaman === '4gun') {
      const sinir = Date.now() - 4 * 24 * 60 * 60 * 1000
      liste = liste.filter(s => {
        const d = tarihCoz(s.teblig_tarihi || s.gonderme_tarihi)
        return d && d.getTime() >= sinir
      })
    }
    if (arama.trim()) {
      const a = arama.toLocaleLowerCase('tr')
      liste = liste.filter(s =>
        [s.kurum, s.belge_turu, s.belge_no, s.teblig_tarihi]
          .some(x => String(x || '').toLocaleLowerCase('tr').includes(a)))
    }
    // Yeniden eskiye sirala (teblig tarihi + saati)
    return [...liste].sort((x, y) => {
      const dx = tarihCoz(x.teblig_tarihi || x.gonderme_tarihi)
      const dy = tarihCoz(y.teblig_tarihi || y.gonderme_tarihi)
      return (dy ? dy.getTime() : -Infinity) - (dx ? dx.getTime() : -Infinity)
    })
  }, [satirlar, kaynakSecim, filtreOkundu, filtreZaman, arama, effOkundu])

  const okunmamisSayisi = gorunenSatirlar.filter(s => !effOkundu(s)).length

  // Gonderim cekirdegi: gerekirse belgeyi indirir, secilen kanala gonderir,
  // gonderim zamanini kaydeder. Sonuc dondurur ({ok, hata}) - mesaj göstermez,
  // boylece tekil ve toplu gonderim ayni cekirdegi kullanir.
  const gonderCekirdek = useCallback(async (satir, kanal) => {
    const musteri = seciliMusteri || musteriler.find(m => String(m.id) === String(satir.client_id))
    if (!musteri) return { ok: false, hata: 'Müşteri bulunamadı' }
    let url = satir.file_url
    if (url && !(await tebligatPdfGetir(url)).ok) url = null
    if (!url) {
      if ((satir.kaynak || 'vergi') === 'sgk') {
        return { ok: false, hata: 'SGK tebligatının PDF’i bulunamadı. SGK tebligatlarını yeniden sorgulayın.' }
      }
      const res = await etebligatBelgesiAl(musteri, satir)
      if (!res.ok) return { ok: false, hata: 'Belge indirilemedi: ' + (res.reason || res.hata || 'bilinmeyen') }
      url = res.url
      setSatirlar(prev => prev.map(s => s.belge_no === satir.belge_no ? { ...s, file_url: res.url } : s))
    }
    const baslik = `e-Tebligat: ${satir.kurum || ''} (${satir.belge_turu || 'Belge'})`.trim()
    const notMetni = `${baslik}\nTebliğ Tarihi: ${satir.teblig_tarihi || '-'}\nBelge No: ${satir.belge_no || '-'}`

    try {
      if (kanal === 'whatsapp') {
        const telefon = musteri.whatsapp || musteri.phone || ''
        if (!telefon) return { ok: false, hata: 'Müşteri kaydında telefon numarası yok' }
        const waSonuc = await sendDocumentViaWhatsAppChannel({
          phone: telefon,
          documentUrl: url,
          documentName: `etebligat_${satir.belge_no}.pdf`,
          caption: notMetni,
          clientId: musteri.id,
          documentType: 'etebligat',
          settings
        })
        if (waSonuc?.ok === false) return { ok: false, hata: waSonuc?.not || waSonuc?.reason || 'WhatsApp gönderilemedi' }
        await gonderimKaydet(musteri.id, satir.belge_no, 'whatsapp')
        setSatirlar(prev => prev.map(s => s.belge_no === satir.belge_no
          ? { ...s, whatsapp_gonderim_ts: new Date().toISOString() } : s))
        return { ok: true }
      } else {
        const adres = musteri.email || ''
        if (!adres) return { ok: false, hata: 'Müşteri kaydında e-posta adresi yok' }
        await sendEmail({
          toEmail: adres,
          subject: baslik,
          message: notMetni,
          documentUrl: url,
          clientId: musteri.id,
          documentType: 'etebligat',
          settings
        })
        await gonderimKaydet(musteri.id, satir.belge_no, 'email')
        setSatirlar(prev => prev.map(s => s.belge_no === satir.belge_no
          ? { ...s, email_gonderim_ts: new Date().toISOString() } : s))
        return { ok: true }
      }
    } catch (e) {
      return { ok: false, hata: e?.message || String(e) }
    }
  }, [seciliMusteri, musteriler, settings])

  // Tekil gonderim (satir butonlari)
  const gonder = useCallback(async (satir, kanal) => {
    setIslem({ belgeNo: satir.belge_no, tip: kanal })
    setMesaj(null)
    const r = await gonderCekirdek(satir, kanal)
    if (r.ok) {
      setMesaj({ tip: 'ok', metin: kanal === 'whatsapp' ? 'WhatsApp ile gönderim tamamlandı.' : `E-posta gönderildi.` })
    } else {
      setMesaj({ tip: 'hata', metin: 'Gönderim hatası: ' + r.hata })
    }
    setIslem({ belgeNo: null, tip: null })
  }, [gonderCekirdek])

  // Toplu gonderim: secili tebligatlar sirayla gonderilir
  const topluGonder = useCallback(async (kanal) => {
    const liste = gorunenSatirlar.filter(s => seciliSet.has(s.belge_no))
    if (!liste.length || !seciliMusteri) return
    setToplu({ aktif: true, toplam: liste.length, bitti: 0 })
    setMesaj(null)
    let basarili = 0
    const hatalar = []
    for (const s of liste) {
      setIslem({ belgeNo: s.belge_no, tip: kanal })
      const r = await gonderCekirdek(s, kanal)
      if (r.ok) basarili++
      else hatalar.push(`${s.belge_no || '?'}: ${r.hata}`)
      setIslem({ belgeNo: null, tip: null })
      setToplu(t => ({ ...t, bitti: t.bitti + 1 }))
    }
    setToplu({ aktif: false, toplam: 0, bitti: 0 })
    setSeciliSet(new Set())
    if (hatalar.length) {
      setMesaj({ tip: 'hata', metin: `${basarili} gönderildi, ${hatalar.length} başarısız: ` + hatalar.slice(0, 3).join(' | ') + (hatalar.length > 3 ? ' …' : '') })
    } else {
      setMesaj({ tip: 'ok', metin: `${basarili} tebligat ${kanal === 'whatsapp' ? 'WhatsApp ile' : 'e-posta ile'} gönderildi.` })
    }
  }, [gorunenSatirlar, seciliSet, seciliMusteri, gonderCekirdek])

  // Secim yardimcilari
  const tumSeciliMi = gorunenSatirlar.length > 0 && gorunenSatirlar.every(s => seciliSet.has(s.belge_no))
  const secimDegistir = (belgeNo) => {
    setSeciliSet(prev => {
      const yeni = new Set(prev)
      if (yeni.has(belgeNo)) yeni.delete(belgeNo)
      else yeni.add(belgeNo)
      return yeni
    })
  }
  const tumunuSec = () => {
    setSeciliSet(prev => tumSeciliMi ? new Set() : new Set(gorunenSatirlar.map(s => s.belge_no)))
  }

  // 2.8.5: okundu isareti KISIYE OZEL — yerel durum + kullanicinin kendi kaydi
  const okunduTikla = useCallback(async (satir) => {
    const yeni = !effOkundu(satir)
    setOkunduSetim(prev => {
      const n = new Set(prev)
      if (yeni) n.add(satir.belge_no)
      else n.delete(satir.belge_no)
      return n
    })
    await okunduAyarla(seciliId, satir.belge_no, yeni)
  }, [seciliId, effOkundu])

  // Tekil silme: MUBiS kaydini siler (GIB kayitlari etkilenmez)
  const silTikla = useCallback(async (satir) => {
    if (!seciliId) return
    if (!window.confirm(`"${satir.kurum || 'Tebligat'}" (${satir.belge_no}) MUBiS kaydından silinsin mi?\n\nNot: GİB / Dijital Vergi Dairesi kayıtları etkilenmez.`)) return
    setSatirlar(prev => prev.filter(s => s.belge_no !== satir.belge_no))
    setSeciliSet(prev => { const n = new Set(prev); n.delete(satir.belge_no); return n })
    await etebligatSil(seciliId, satir.belge_no)
    setMesaj({ tip: 'ok', metin: 'Tebligat MUBiS kaydından silindi.' })
  }, [seciliId])

  // Toplu silme: secili tebligatlari MUBiS kaydindan siler
  const secilileriSil = useCallback(async () => {
    if (!seciliId || !seciliSet.size) return
    if (!window.confirm(`${seciliSet.size} tebligat MUBiS kaydından silinsin mi?\n\nNot: GİB / Dijital Vergi Dairesi kayıtları etkilenmez.`)) return
    const silinecek = [...seciliSet]
    setSatirlar(prev => prev.filter(s => !seciliSet.has(s.belge_no)))
    setSeciliSet(new Set())
    for (const b of silinecek) await etebligatSil(seciliId, b)
    setMesaj({ tip: 'ok', metin: `${silinecek.length} tebligat MUBiS kaydından silindi.` })
  }, [seciliId, seciliSet])

  const yardimciTamam = durum === 'ok'

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Baslik */}
      <div className="flex items-center gap-3 mb-2">
        <div className="bg-blue-600/20 p-3 rounded-xl">
          <Inbox className="w-7 h-7 text-yellow-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">e-Tebligatlar</h1>
          <p className="text-gray-400 text-sm">Vergi Dairesi ve SGK tebligatları — sorgula, görüntüle, WhatsApp veya e-posta ile ilet</p>
        </div>
      </div>

      {/* Musteri secimi + sorgu */}
      <div className="bg-blue-950/40 border border-blue-800/30 rounded-2xl p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-gray-400 text-xs mb-1">Müşteri</label>
            <select
              value={seciliId}
              onChange={(e) => setSeciliId(e.target.value)}
              className="w-full bg-blue-900/30 border border-blue-700/40 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
            >
              <option value="">Müşteri seçin…</option>
              <option value="hepsi">Tüm müşteriler (Hepsi)</option>
              {sortClients(musteriler).map(c => (
                <option key={c.id} value={c.id}>{clientDisplayName(c)}</option>
              ))}
            </select>
          </div>
          {/* Kaynak secimi: Vergi Dairesi / SGK */}
          <div>
            <label className="block text-gray-400 text-xs mb-1">Tebligat Kaynağı</label>
            <div className="inline-flex rounded-lg border border-blue-700/40 overflow-hidden">
              <button
                onClick={() => setKaynakSecim('vergi')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${kaynakSecim === 'vergi' ? 'bg-yellow-500 text-blue-950' : 'bg-blue-900/30 text-gray-300 hover:bg-blue-900/50'}`}
              >
                Vergi Dairesi
              </button>
              <button
                onClick={() => setKaynakSecim('sgk')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${kaynakSecim === 'sgk' ? 'bg-yellow-500 text-blue-950' : 'bg-blue-900/30 text-gray-300 hover:bg-blue-900/50'}`}
              >
                SGK
              </button>
            </div>
          </div>
          <button
            onClick={sorgula}
            disabled={!seciliId || seciliId === 'hepsi' || yukleniyor}
            className="inline-flex items-center gap-2 bg-yellow-500 text-blue-950 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {yukleniyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {yukleniyor ? 'Sorgulanıyor…' : (kaynakSecim === 'sgk' ? 'SGK Tebligatlarını Al' : 'Güncel Tebligatları Al')}
          </button>
          {kaynakSecim === 'vergi' && (
            <button
              onClick={vergiTopluIndir}
              disabled={!seciliId || seciliId === 'hepsi' || yukleniyor || topluIndiriliyor}
              className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Listelenen tebligatların PDF'lerini tek oturumda toplu indirir"
            >
              {topluIndiriliyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {topluIndiriliyor ? 'Toplu İndiriliyor…' : 'Vergi Dairesi Toplu Tebligat'}
            </button>
          )}
          <button
            onClick={() => setTopluPanel(true)}
            disabled={topluSorgu.aktif}
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-blue-500 disabled:opacity-40"
          >
            <Users className="w-4 h-4" />
            Toplu Sorgu
          </button>
          <button
            onClick={() => setCronPanel(true)}
            className="inline-flex items-center gap-2 bg-blue-800/70 border border-blue-600/50 text-blue-100 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-blue-700/70"
            title="Seçilen müşterileri belirlediğiniz gün ve saatte otomatik sorgula"
          >
            <Clock className="w-4 h-4" />
            Otomatik Sorgu
          </button>
          <span className={`text-xs px-2 py-1 rounded-full ${yardimciTamam ? 'bg-green-600/20 text-green-300' : 'bg-red-600/20 text-red-300'}`}>
            {yardimciTamam ? 'Yardımcı program çalışıyor' : 'Yardımcı program kapalı'}
          </span>
        </div>
        {!yardimciTamam && (
          <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
            Sorgulama ve indirme için bilgisayarınızda MUBiS GIB Yardımcı Programı çalışmalı.
          </p>
        )}
        {kaynakSecim === 'sgk' && yardimciTamam && (
          <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
            SGK tebligatları e-Devlet üzerinden alınır: güvenlik kodu otomatik doldurulur; gerekirse pencerede elle girebilirsiniz.
          </p>
        )}
        {sgkAsama && (
          <div className="mt-3 bg-blue-900/40 border border-yellow-600/40 rounded-lg px-3 py-2 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-yellow-400" />
            <span className="text-yellow-300 text-sm">{sgkAsama}</span>
          </div>
        )}
      </div>

      {/* 2.7.521: Yeni Gelen Tebligatlar — onceki sorgudan SONRA gelen tebligatlar.
          Admin ana ekrandaki uyarıya tıklayınca bu listeye gelinir. */}
      {seciliMusteri && yeniSatirlar.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-2xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-white font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Yeni Gelen Tebligatlar
              </h2>
              <p className="text-gray-400 text-xs mt-0.5">
                {seciliMusteri.name || seciliMusteri.company} — son sorgudan sonra gelen {yeniSatirlar.length} tebligat
              </p>
            </div>
            <button
              onClick={async () => {
                try { await yeniTebligatlariTemizle(seciliId) } catch { /* yoksay */ }
                setSatirlar(s => s.map(x => ({ ...x, yeni: false })))
                setAramaParams({}, { replace: true })
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-900/40 border border-blue-700/40 text-gray-300 text-xs hover:bg-blue-900/60"
              title="Listeyi temizler — bir sonraki sorguda yeniden oluşur"
            >
              <X className="w-3.5 h-3.5" /> Listeyi Temizle
            </button>
          </div>
          <div className="divide-y divide-blue-800/30">
            {yeniSatirlar.map(s => (
              <div key={s.belge_no} className="py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-gray-300 min-w-[90px]">{s.teblig_tarihi || s.gonderme_tarihi || '—'}</span>
                <span className="text-white font-medium flex-1 min-w-[180px] truncate" title={s.kurum}>{s.kurum || '—'}</span>
                <span className="text-blue-300 text-xs">{s.belge_turu || 'Tebligat'}</span>
                <span className="text-gray-500 text-xs font-mono">{s.belge_no}</span>
                {s.file_url
                  ? <span className="text-green-400 text-xs flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> Görüntülemeye hazır</span>
                  : <span className="text-gray-500 text-xs">PDF indirilmedi</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toplu sorgu ilerlemesi */}
      {topluSorgu.aktif && (
        <div className="bg-blue-900/50 border border-yellow-600/40 rounded-xl px-4 py-3 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-yellow-400" />
          <div className="flex-1">
            <div className="text-yellow-300 text-sm font-medium">
              Toplu sorgu: {topluSorgu.bitti}/{topluSorgu.toplam} müşteri tamamlandı
            </div>
            <div className="text-gray-400 text-xs mt-0.5">
              Şu an: {topluSorgu.suAn || '…'} — her müşteri için giriş + liste + belge indirme yapıldığından uzun sürebilir. Sayfadan ayrılmayın.
            </div>
            <div className="w-full h-1.5 bg-blue-950 rounded-full mt-2 overflow-hidden">
              <div
                className="h-full bg-yellow-500 transition-all"
                style={{ width: `${topluSorgu.toplam ? Math.round((topluSorgu.bitti / topluSorgu.toplam) * 100) : 0}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Toplu sorgu musteri secim paneli */}
      {topluPanel && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setTopluPanel(false)}>
          <div className="bg-blue-950 border border-blue-700/50 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-blue-800/40">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold">Toplu Sorgulama — Müşteri Seçin</h3>
                <button onClick={() => setTopluPanel(false)} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
              </div>
              <input
                value={topluArama}
                onChange={e => setTopluArama(e.target.value)}
                placeholder="Müşteri ara…"
                className="w-full bg-blue-900/30 border border-blue-700/40 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => setTopluSecim(new Set(topluFiltreliMusteriler.map(m => String(m.id))))}
                  className="text-xs text-yellow-400 hover:text-yellow-300 underline"
                >
                  Tümünü Seç
                </button>
                <button
                  onClick={() => setTopluSecim(new Set())}
                  className="text-xs text-gray-400 hover:text-white underline"
                >
                  Temizle
                </button>
                <span className="text-xs text-gray-500 ml-auto self-center">{topluSecim.size} seçili</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {topluFiltreliMusteriler.map(m => (
                <label
                  key={m.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-blue-900/30 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={topluSecim.has(String(m.id))}
                    onChange={() => setTopluSecim(prev => {
                      const n = new Set(prev)
                      if (n.has(String(m.id))) n.delete(String(m.id))
                      else n.add(String(m.id))
                      return n
                    })}
                    className="w-4 h-4 accent-yellow-500"
                  />
                  <span className="text-gray-200 text-sm">{m.name || m.company}</span>
                </label>
              ))}
              {topluFiltreliMusteriler.length === 0 && (
                <div className="text-center text-gray-500 py-6 text-sm">Müşteri bulunamadı.</div>
              )}
            </div>
            <div className="p-4 border-t border-blue-800/40">
              <button
                onClick={topluSorgula}
                disabled={!topluSecim.size}
                className="w-full bg-yellow-500 text-blue-950 py-2.5 rounded-lg font-semibold text-sm hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {topluSecim.size} Müşteri için Sorgula
              </button>
              <p className="text-[11px] text-gray-500 mt-2 text-center">
                Seçilen her müşteri için DVS'e giriş yapılıp tebligatlar ve belgeler indirilir.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Otomatik sorgu paneli */}
      {cronPanel && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setCronPanel(false)}>
          <div className="bg-blue-950 border border-blue-700/50 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-blue-800/40">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-white font-semibold flex items-center gap-2"><Clock className="w-4 h-4 text-yellow-400" /> Otomatik Sorgu Planı</h3>
                <button onClick={() => setCronPanel(false)} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
              </div>
              <p className="text-[11px] text-gray-400">
                Seçilen müşteriler, seçilen günlerde belirtilen saatte sunucu tarafından otomatik sorgulanır (Vergi Dairesi) — bilgisayarınız kapalıyken bile. SGK tebligatları e-Devlet güvenlik kodu gerektirdiğinden otomatik sorguya dahil değildir.
              </p>
              {cronPlanlar.length > 0 && (
                <button
                  onClick={cronTumunuIptal}
                  className="mt-2 w-full border border-red-500/50 bg-red-500/10 text-red-300 hover:bg-red-500/20 rounded-lg py-1.5 text-xs font-medium"
                >
                  Otomatik Sorguyu Tamamen İptal Et ({cronPlanlar.length} plan)
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Gunler */}
              <div>
                <div className="text-xs text-gray-400 mb-1.5">Günler</div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { v: 1, l: 'Pzt' }, { v: 2, l: 'Sal' }, { v: 3, l: 'Çar' }, { v: 4, l: 'Per' },
                    { v: 5, l: 'Cum' }, { v: 6, l: 'Cmt' }, { v: 0, l: 'Paz' }
                  ].map(g => (
                    <button
                      key={g.v}
                      onClick={() => setCronGunler(prev => {
                        const n = new Set(prev)
                        if (n.has(g.v)) n.delete(g.v)
                        else n.add(g.v)
                        return n
                      })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${cronGunler.has(g.v) ? 'bg-yellow-500 text-blue-950 border-yellow-500' : 'bg-blue-900/40 text-gray-300 border-blue-700/40 hover:bg-blue-900/70'}`}
                    >
                      {g.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Saat + tekrar */}
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <div className="text-xs text-gray-400 mb-1.5">Saat</div>
                  <input
                    type="time"
                    value={cronSaat}
                    onChange={e => setCronSaat(e.target.value)}
                    className="bg-blue-900/40 border border-blue-700/40 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none"
                  />
                </div>
                <label className="flex items-center gap-2 mt-5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cronTekrar}
                    onChange={e => setCronTekrar(e.target.checked)}
                    className="w-4 h-4 accent-yellow-500"
                  />
                  <span className="text-sm text-gray-300">Her hafta tekrarla</span>
                </label>
              </div>
              <p className="text-[11px] text-gray-500 -mt-2">
                {cronTekrar ? 'Seçili günlerin her haftasında çalışır.' : 'Bir kez çalışır; sorgu sonrası plan pasifleşir.'}
              </p>

              {/* Musteri secimi */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-xs text-gray-400">Müşteriler</div>
                  <div className="flex gap-2">
                    <button onClick={() => setCronSecim(new Set(topluFiltreliMusteriler.map(m => String(m.id))))} className="text-xs text-yellow-400 hover:text-yellow-300 underline">Tümünü Seç</button>
                    <button onClick={() => setCronSecim(new Set())} className="text-xs text-gray-400 hover:text-white underline">Temizle</button>
                    <span className="text-xs text-gray-500">{cronSecim.size} seçili</span>
                  </div>
                </div>
                <input
                  value={topluArama}
                  onChange={e => setTopluArama(e.target.value)}
                  placeholder="Müşteri ara…"
                  className="w-full bg-blue-900/30 border border-blue-700/40 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none mb-1.5"
                />
                <div className="max-h-40 overflow-y-auto border border-blue-800/30 rounded-lg p-1">
                  {topluFiltreliMusteriler.map(m => (
                    <label key={m.id} className="flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-blue-900/30 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cronSecim.has(String(m.id))}
                        onChange={() => setCronSecim(prev => {
                          const n = new Set(prev)
                          if (n.has(String(m.id))) n.delete(String(m.id))
                          else n.add(String(m.id))
                          return n
                        })}
                        className="w-4 h-4 accent-yellow-500"
                      />
                      <span className="text-gray-200 text-sm">{m.name || m.company}</span>
                    </label>
                  ))}
                  {topluFiltreliMusteriler.length === 0 && (
                    <div className="text-center text-gray-500 py-4 text-sm">Müşteri bulunamadı.</div>
                  )}
                </div>
              </div>

              {/* Mevcut planlar */}
              {cronPlanlar.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-xs text-gray-400">Kayıtlı Planlar</div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCronPlanSecim(cronPlanSecim.size === cronPlanlar.length ? new Set() : new Set(cronPlanlar.map(p => String(p.id))))}
                        className="text-xs text-yellow-400 hover:text-yellow-300 underline"
                      >
                        {cronPlanSecim.size === cronPlanlar.length ? 'Seçimi Kaldır' : 'Tümünü Seç'}
                      </button>
                      {cronPlanSecim.size > 0 && (
                        <button
                          onClick={cronPlanlariSecilenleriSil}
                          className="text-xs text-red-400 hover:text-red-300 underline font-medium"
                        >
                          Seçilenleri Sil ({cronPlanSecim.size})
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {cronPlanlar.map(p => (
                      <div key={p.id} className="flex items-center gap-2 bg-blue-900/30 border border-blue-800/30 rounded-lg px-3 py-2">
                        <input
                          type="checkbox"
                          checked={cronPlanSecim.has(String(p.id))}
                          onChange={() => setCronPlanSecim(prev => {
                            const n = new Set(prev)
                            if (n.has(String(p.id))) n.delete(String(p.id))
                            else n.add(String(p.id))
                            return n
                          })}
                          className="w-4 h-4 accent-yellow-500 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-200 truncate">{p.client_name || `Müşteri #${p.client_id}`}</div>
                          <div className="text-[11px] text-gray-500">
                            {(p.gunler || []).map(g => ({ 0: 'Paz', 1: 'Pzt', 2: 'Sal', 3: 'Çar', 4: 'Per', 5: 'Cum', 6: 'Cmt' }[g])).join(', ')} · {p.saat} · {p.tekrar ? 'her hafta' : 'tek seferlik'}{!p.aktif ? ' · pasif' : ''}
                            {p.son_calisma && ` · son: ${String(p.son_calisma).slice(0, 10)}`}
                          </div>
                        </div>
                        <button onClick={() => cronPlanSil(p.id)} className="p-1.5 text-red-400 hover:text-red-300" title="Planı sil">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-blue-800/40">
              <button
                onClick={cronPlanKaydet}
                disabled={cronKaydediliyor || !cronSecim.size || !cronGunler.size || !cronSaat}
                className="w-full bg-yellow-500 text-blue-950 py-2.5 rounded-lg font-semibold text-sm hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {cronKaydediliyor ? 'Kaydediliyor…' : `Planı Kaydet (${cronSecim.size} müşteri)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Durum mesaji */}
      {mesaj && (
        <div className={`rounded-xl px-4 py-3 text-sm ${mesaj.tip === 'ok' ? 'bg-green-600/15 text-green-300 border border-green-600/30' : 'bg-red-600/15 text-red-300 border border-red-600/30'}`}>
          {mesaj.metin}
        </div>
      )}

      {/* Filtreler */}
      {seciliId && (
        <div className="bg-blue-950/40 border border-blue-800/30 rounded-2xl p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                value={arama}
                onChange={(e) => setArama(e.target.value)}
                placeholder="Kurum, belge no, tarih ara…"
                className="w-full bg-blue-900/30 border border-blue-700/40 rounded-lg py-2 pl-9 pr-3 text-white text-sm placeholder-gray-500 focus:outline-none"
              />
            </div>
            <div className="flex rounded-lg overflow-hidden border border-blue-700/40">
              {[
                { v: '', l: 'Tümü' },
                { v: 'false', l: `Okunmamış (${okunmamisSayisi})` },
                { v: 'true', l: 'Okunmuş' }
              ].map(o => (
                <button
                  key={o.l}
                  onClick={() => setFiltreOkundu(o.v)}
                  className={`px-3 py-2 text-xs font-medium ${filtreOkundu === o.v ? 'bg-yellow-500 text-blue-950' : 'bg-blue-900/30 text-gray-300 hover:text-white'}`}
                >
                  {o.l}
                </button>
              ))}
            </div>
            <div className="flex rounded-lg overflow-hidden border border-blue-700/40">
              {[
                { v: 'hepsi', l: 'Tüm Zamanlar' },
                { v: '4gun', l: 'Son 4 Gün' }
              ].map(o => (
                <button
                  key={o.v}
                  onClick={() => setFiltreZaman(o.v)}
                  className={`px-3 py-2 text-xs font-medium ${filtreZaman === o.v ? 'bg-yellow-500 text-blue-950' : 'bg-blue-900/30 text-gray-300 hover:text-white'}`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Liste */}
      {seciliId && (
        <div className="bg-blue-950/40 border border-blue-800/30 rounded-2xl p-4 md:p-6">
          {/* Toplu gonderim cubugu */}
          {(seciliSet.size > 0 || toplu.aktif) && (
            <div className="mb-4 bg-blue-900/40 border border-yellow-600/30 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
              {toplu.aktif ? (
                <span className="text-yellow-300 text-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Gönderiliyor… {toplu.bitti}/{toplu.toplam}
                </span>
              ) : (
                <>
                  <span className="text-yellow-300 text-sm font-medium">{seciliSet.size} tebligat seçili</span>
                  <button
                    onClick={() => topluGonder('whatsapp')}
                    disabled={!yardimciTamam}
                    className="inline-flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-green-500 disabled:opacity-40"
                  >
                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp ile Gönder
                  </button>
                  <button
                    onClick={() => topluGonder('email')}
                    disabled={!yardimciTamam}
                    className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-500 disabled:opacity-40"
                  >
                    <Mail className="w-3.5 h-3.5" /> E-posta ile Gönder
                  </button>
                  <button
                    onClick={secilileriSil}
                    className="inline-flex items-center gap-1.5 bg-red-600/80 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Seçilenleri Sil
                  </button>
                  <button
                    onClick={() => setSeciliSet(new Set())}
                    className="text-gray-400 text-xs hover:text-white underline"
                  >
                    Seçimi temizle
                  </button>
                </>
              )}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-blue-800/30">
                  <th className="py-3 px-1 w-8">
                    <input
                      type="checkbox"
                      checked={tumSeciliMi}
                      onChange={tumunuSec}
                      className="w-4 h-4 accent-yellow-500 cursor-pointer"
                      title="Tümünü seç / kaldır"
                    />
                  </th>
                  {hepsiSecili && <th className="text-left py-3 px-2 font-medium">Müşteri</th>}
                  <th className="text-left py-3 px-2 font-medium">Kurum / Belge</th>
                  <th className="text-left py-3 px-2 font-medium">Belge No</th>
                  <th className="text-left py-3 px-2 font-medium">Tebliğ Tarihi</th>
                  <th className="text-left py-3 px-2 font-medium">Durum</th>
                  <th className="text-left py-3 px-2 font-medium">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-800/20">
                {gorunenSatirlar.length === 0 && (
                  <tr>
                    <td colSpan={hepsiSecili ? 7 : 6} className="py-8 text-center text-gray-500">
                      {satirlar.length === 0
                        ? 'Henüz tebligat yok. "Güncel Tebligatları Al" ile sorgulayın.'
                        : 'Filtreye uyan tebligat yok.'}
                    </td>
                  </tr>
                )}
                {gorunenSatirlar.map(s => (
                  <tr
                    key={s.belge_no || s.id}
                    className={`hover:bg-blue-900/10 ${!effOkundu(s) ? 'bg-blue-900/20' : ''}`}
                  >
                    <td className="py-3 px-1">
                      <input
                        type="checkbox"
                        checked={seciliSet.has(s.belge_no)}
                        onChange={() => secimDegistir(s.belge_no)}
                        className="w-4 h-4 accent-yellow-500 cursor-pointer"
                      />
                    </td>
                    {hepsiSecili && (
                      <td className="py-3 px-2 text-gray-300 text-xs font-medium">{s._musteri || '-'}</td>
                    )}
                    <td className="py-3 px-2">
                      <button
                        onClick={() => belgeAc(s)}
                        title="Belgeyi aç / indir"
                      >
                        <div className="font-medium">{s.kurum || '-'}</div>
                        <div className="text-xs text-gray-400">{s.belge_turu || ''} {s.okuma_tarihi ? `· Okuma: ${s.okuma_tarihi}` : ''}</div>
                      </button>
                    </td>
                    <td className="py-3 px-2 text-gray-300 text-xs">{s.belge_no || '-'}</td>
                    <td className="py-3 px-2 text-gray-400 text-xs">
                      {s.teblig_tarihi || '-'}
                      {s.gonderme_tarihi && <div className="text-[11px] text-gray-500">Gönderme: {s.gonderme_tarihi}</div>}
                    </td>
                    <td className="py-3 px-2">
                      <button onClick={() => okunduTikla(s)} title={effOkundu(s) ? 'Benim için okunmadı işaretle' : 'Benim için okundu işaretle'}>
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${effOkundu(s) ? 'bg-green-600/20 text-green-300' : 'bg-yellow-600/20 text-yellow-300'}`}>
                          {effOkundu(s) ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          {effOkundu(s) ? 'Okunmuş' : 'Okunmamış'}
                        </span>
                      </button>
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => belgeAc(s)}
                          disabled={islem.belgeNo === s.belge_no}
                          className={`p-1.5 rounded-lg text-cyan-400 hover:text-cyan-300 hover:bg-cyan-700/20 disabled:opacity-40`}
                          title={hazirMap[s.belge_no]
                            ? 'Belge hazır — tek tıkla görüntüle'
                            : 'Belge sunucudan indirilip görüntülenecek'}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => belgeAc(s, true)}
                          disabled={islem.belgeNo === s.belge_no}
                          className="p-1.5 text-gray-300 hover:text-white hover:bg-blue-700/30 rounded-lg disabled:opacity-40"
                          title="Belgeyi Dijital Vergi Dairesi'nden indir ve görüntüle"
                        >
                          {islem.belgeNo === s.belge_no && islem.tip === 'indir'
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Download className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => gonder(s, 'whatsapp')}
                          disabled={islem.belgeNo === s.belge_no || !yardimciTamam}
                          className="p-1.5 text-green-400 hover:text-green-300 hover:bg-green-700/20 rounded-lg disabled:opacity-40"
                          title={s.whatsapp_gonderim_ts ? 'Tekrar WhatsApp ile gönder' : 'WhatsApp ile müşteriye gönder'}
                        >
                          {islem.belgeNo === s.belge_no && islem.tip === 'whatsapp'
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <MessageCircle className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => gonder(s, 'email')}
                          disabled={islem.belgeNo === s.belge_no || !yardimciTamam}
                          className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-700/30 rounded-lg disabled:opacity-40"
                          title={s.email_gonderim_ts ? 'Tekrar e-posta ile gönder' : 'E-posta ile müşteriye gönder'}
                        >
                          {islem.belgeNo === s.belge_no && islem.tip === 'email'
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Mail className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => silTikla(s)}
                          className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-700/20 rounded-lg"
                          title="MUBiS kaydından sil (GİB kayıtları etkilenmez)"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {(s.whatsapp_gonderim_ts || s.email_gonderim_ts) && (
                        <div className="text-[10px] text-gray-500 mt-1">
                          {s.whatsapp_gonderim_ts && <div>WhatsApp: {new Date(s.whatsapp_gonderim_ts).toLocaleString('tr-TR')}</div>}
                          {s.email_gonderim_ts && <div>E-posta: {new Date(s.email_gonderim_ts).toLocaleString('tr-TR')}</div>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}


      {/* Otomatik Gonderim Planı */}
      <div className="bg-blue-950/40 border border-blue-800/30 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold text-sm">Otomatik Gönderim Planı</h3>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => gonderimPlanKaydet(!gonderimAktif)}
              disabled={gonderimKaydediliyor}
              className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 shrink-0 ${gonderimAktif ? 'bg-green-500' : 'bg-blue-800/80'}`}
              title={gonderimAktif ? 'Otomatik gönderim açık' : 'Otomatik gönderim kapalı'}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${gonderimAktif ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
            <span className={`text-xs font-medium ${gonderimAktif ? 'text-green-300' : 'text-red-300'}`}>{gonderimAktif ? 'Açık' : 'Kapalı'}</span>
            <button
              type="button"
              onClick={() => setGonderimPanel(v => !v)}
              className="text-xs text-cyan-300 hover:text-cyan-200 px-2 py-1.5"
            >{gonderimPanel ? 'Gizle' : 'Göster'}</button>
          </div>
        </div>
        {gonderimPanel && (
          <>

            <div>
              <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">Gönderim Kanalı</label>
              <div className="inline-flex rounded-lg overflow-hidden border border-blue-700/50">
                {[{ v: 'tercih', ad: 'Tercih' }, { v: 'whatsapp', ad: 'WhatsApp' }, { v: 'email', ad: 'E-posta' }, { v: 'ikisi', ad: 'İkisi' }].map(o => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setGonderimKanal(o.v)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${gonderimKanal === o.v ? 'bg-emerald-500 text-white' : 'bg-blue-900/50 text-gray-400 hover:text-gray-200'}`}
                  >{o.ad}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">Haftanın Günleri</label>
              <div className="flex flex-wrap gap-1.5">
                {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((ad, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setGonderimGunler(prev => { const y = new Set(prev); if (y.has(i)) y.delete(i); else y.add(i); return y })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${gonderimGunler.has(i) ? 'bg-cyan-500/25 border-cyan-500/50 text-cyan-200' : 'bg-blue-900/60 border-blue-700/50 text-gray-400 hover:text-gray-200'}`}
                  >{ad}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">Ayın Günleri (1-31)</label>
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setGonderimAyGunler(prev => { const y = new Set(prev); if (y.has(d)) y.delete(d); else y.add(d); return y })}
                    className={`w-7 h-7 rounded text-[10px] font-medium border transition-colors ${gonderimAyGunler.has(d) ? 'bg-amber-500/25 border-amber-500/50 text-amber-200' : 'bg-blue-900/60 border-blue-700/50 text-gray-400 hover:text-gray-200'}`}
                  >{d}</button>
                ))}
              </div>
            </div>
            <div className="w-24">
              <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">Saat</label>
              <input
                type="time"
                value={gonderimSaat}
                onChange={e => setGonderimSaat(e.target.value)}
                className="w-full bg-blue-900/60 border border-blue-700/50 rounded-xl px-2.5 py-2 text-white text-sm"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer select-none mb-2">
                <input
                  type="checkbox"
                  checked={gonderimMusteriAcik}
                  onChange={(e) => setGonderimMusteriAcik(e.target.checked)}
                  className="w-4 h-4 rounded border-blue-700/50 bg-blue-900/40 text-cyan-500"
                />
                Müşteri seç (işaretli değilse tüm aktif müşteriler)
              </label>
              {gonderimMusteriAcik && (
                <div className="max-h-40 overflow-y-auto border border-blue-700/30 rounded-lg p-2 space-y-1">
                  {musteriler.map(m => (
                    <label key={m.id} className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={gonderimMusteriler.has(m.id)}
                        onChange={() => setGonderimMusteriler(prev => { const y = new Set(prev); if (y.has(m.id)) y.delete(m.id); else y.add(m.id); return y })}
                        className="w-3.5 h-3.5 rounded border-blue-700/50 bg-blue-900/40 text-cyan-500"
                      />
                      {m.name || m.company_name || `#${m.id}`}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => gonderimPlanKaydet(true)}
                disabled={gonderimKaydediliyor}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium disabled:opacity-50"
              >
                {gonderimKaydediliyor ? 'Kaydediliyor…' : (gonderimPlan ? 'Planı Güncelle' : 'Kaydet')}
              </button>
              {gonderimPlan && (
                <button
                  type="button"
                  onClick={gonderimIptal}
                  className="px-4 py-2 rounded-xl bg-blue-900/60 border border-blue-700/50 text-gray-300 hover:text-white text-sm"
                >İptal Et</button>
              )}
              <button
                type="button"
                onClick={() => gonderimPlanKaydet(false)}
                disabled={gonderimKaydediliyor}
                className="px-4 py-2 rounded-xl bg-blue-900/60 border border-blue-700/50 text-gray-300 hover:text-white text-sm disabled:opacity-50"
              >Kapat</button>
            </div>
            <p className="text-[11px] text-gray-500">
              Not: Plan aktifken cron sırasında otomatik gönderim devre dışı kalır; gönderim yalnızca bu planın zamanlamasına göre yapılır. Kanal “Tercih” ise müşterinin iletişim bilgilerindeki Tahakkuk Gönderim Şekli kullanılır.
            </p>
          </>
        )}
        {gonderimMesaj && (
          <div className={`text-xs px-3 py-2 rounded-xl border ${gonderimMesaj.ok ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-200' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
            {gonderimMesaj.t}
          </div>
        )}
      </div>


      {/* Bos durum: musteri secilmemis */}
      {!seciliId && (
        <div className="bg-blue-950/40 border border-blue-800/30 rounded-2xl p-12 text-center">
          <Inbox className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">Tebligatları görmek için müşteri seçin.</p>
        </div>
      )}
    </div>
  )
}
