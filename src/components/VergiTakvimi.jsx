import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Calendar, AlertTriangle, CheckCircle, Clock, Download, MessageCircle, Mail, X, FileText, RefreshCw, CreditCard } from 'lucide-react'
import { getFormattedBeyanDeadline, getFormattedSgkOdemeGunu, getMonthName, getBeyanStorageKey } from '../utils/dateUtils'
import { getTahakkukList, sumTahakkukTutar, oluTahakkukTemizle } from '../utils/tahakkukUtils'
import { tahakkuklariKesfet, tahakkukDonemi } from '../services/documentService'
import { supabase } from '../lib/supabase'
import { sendEmail, sendDocumentViaWhatsAppChannel, getWhatsAppChannel } from '../services/whatsappService'
import { getSettings } from '../services/settingsService'
import { analyzeDocument } from '../services/documentIntelligenceEngine'
import { useAuth } from '../context/AuthContext'
import { gibYardimciIleDoldur, gibYardimciIs, musteriGirisBilgileriGetir } from '../utils/gibOdemeHelper'
import { tecilliPlanGetir, tecilliPlanPdfIndir, tecilliTaksitOdendi } from '../services/tecilliService'
import { YARDIMCI_EXE_URL } from '../config/indirmeLinkleri'

const GIB_ODEME_URL = 'https://dijital.gib.gov.tr/hizliOdemeler/belgeNumarasiIleOdeme'

export default function VergiTakvimi({ clientId, beyanDurumlari: propBeyanDurumlari, onBeyanDurumlariUpdate }) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const { user } = useAuth()

  const [beyanDurumlari, setBeyanDurumlari] = useState(propBeyanDurumlari || {})
  const [loading, setLoading] = useState(true)
  const [selectedTahakkuk, setSelectedTahakkuk] = useState(null)
  const [odemeKaydediliyor, setOdemeKaydediliyor] = useState(false)
  const [odemeHatasi, setOdemeHatasi] = useState('')
  const odemeKayitRef = useRef(false)
  const [showModal, setShowModal] = useState(false)
  const [modalLoading, setModalLoading] = useState(false)
  const [settings, setSettings] = useState(null)
  const [documentUrl, setDocumentUrl] = useState(null)
  const [showGibPanel, setShowGibPanel] = useState(false)
  const [gibBilgi, setGibBilgi] = useState({ vkn: '', tahakkukNo: '', il: '', vergiDairesi: '' })
  const [gibHelperDurum, setGibHelperDurum] = useState('')
  const [gibRapor, setGibRapor] = useState(null)
  // Tecilli Tahsilat odeme plani (admin yukler; musteri burada taksitleri oder)
  const [tecilli, setTecilli] = useState(null)
  const [tecilliDurum, setTecilliDurum] = useState(null) // { tip, metin }
  const [tecilliYukleniyorBelge, setTecilliYukleniyorBelge] = useState('')
  const [tecilliTumGoster, setTecilliTumGoster] = useState({})
  const analyzingRef = useRef(new Set())
  const attemptedAnalysisRef = useRef(new Set())
  const persistQueueRef = useRef(Promise.resolve())
  const [kayitHatasi, setKayitHatasi] = useState(false)
  // Storage keşfi: kayıt listesi boş ama belge klasörde yüklü olabilir
  // (admin/otomasyon toplu yüklemeleri). Bir kez taranır, bulunan belgeler
  // _tahakkuklar listesine persist edilir — birden fazla SGK tahakkuku
  // (farklı siciller) hepsi listeye girer, her biri ayrı analiz edilir.
  // Ayrıca dönem-dışı kayıtlar temizlenir (eski deplo yanlış aylara yazmış
  // olabilir): dosya adından dönem çıkarılıp uyuşmayanlar listeden çıkarılır.
  const kesifRef = useRef(new Set())
  const temizlikRef = useRef(new Set())
  const oluTemizlikRef = useRef(new Set())
  const [musteriNesne, setMusteriNesne] = useState(null)

  useEffect(() => {
    setBeyanDurumlari(propBeyanDurumlari || {})
    setLoading(false)
    attemptedAnalysisRef.current = new Set()

    // TANI: SGK ile ilgili tum anahtarlari konsola dok (coklu tahakkuk sorunu tespiti)
    const map = propBeyanDurumlari || {}
    const sgkKeys = Object.keys(map).filter(k => k.includes('sgk'))
    if (sgkKeys.length > 0) {
      console.log('=== SGK TANI ===')
      sgkKeys.forEach(k => {
        const v = map[k]
        if (Array.isArray(v)) {
          console.log(k, `(${v.length} kayit):`, v.map(i => i?.url || i))
        } else {
          console.log(k, ':', v)
        }
      })
      console.log('================')
    }
  }, [propBeyanDurumlari])

  useEffect(() => {
    if (clientId) {
      loadSettings()
      // Tecilli tahsilat planini yukle (admin "Var" secip PDF yuklemisse)
      let iptal = false
      tecilliPlanGetir(clientId).then(p => { if (!iptal) setTecilli(p) }).catch(() => {})
      return () => { iptal = true }
    }
  }, [clientId])

  const loadSettings = async () => {
    try {
      const s = await getSettings()
      setSettings(s)
    } catch (e) {
      console.error('Ayarlar yuklenemedi:', e)
    }
  }

  const resolveStatusKey = useCallback((item) => {
    const filingMonth = item.filingMonth != null ? item.filingMonth : month
    const filingYear = item.filingYear != null ? item.filingYear : year
    const storage = getBeyanStorageKey(item.type, filingYear, filingMonth)
    return storage?.statusKey || `${filingYear}_${filingMonth}_${item.type}`
  }, [month, year])

  const getTahakkukStatus = useCallback((item) => {
    const statusKey = resolveStatusKey(item)
    const durum = beyanDurumlari[statusKey] || 'yapilamadi'
    const tahakkuklar = getTahakkukList(beyanDurumlari, statusKey)
    const tahakkukUrl = tahakkuklar.length > 0 ? tahakkuklar[tahakkuklar.length - 1].url : null
    // Toplam tutar: liste varsa listedeki tutarlarin toplami, yoksa tek tutar alani
    const tutar = tahakkuklar.length > 0
      ? sumTahakkukTutar(tahakkuklar)
      : (Number(beyanDurumlari[`${statusKey}_tutar`]) || 0)
    const analizDurumu = beyanDurumlari[`${statusKey}_analiz_durumu`] || ''
    const sonOdeme = beyanDurumlari[`${statusKey}_son_odeme`] || ''
    const odendi = beyanDurumlari[`${statusKey}_odendi`] === true
    const odemeTarihi = beyanDurumlari[`${statusKey}_odeme_tarihi`] || ''
    const hasTahakkuk = tahakkuklar.length > 0 || tutar > 0

    return {
      tutar,
      durum,
      hasTahakkuk,
      analizDurumu,
      tahakkukUrl,
      tahakkuklar,
      sonOdeme,
      odendi,
      odemeTarihi,
      isHazirlaniyor: !hasTahakkuk && (durum === 'hazir' || durum === 'onaylandi'),
      isTamamlandi: durum === 'tahakkuk_gonderildi',
      statusKey
    }
  }, [beyanDurumlari, resolveStatusKey])

  const sortedTum = useMemo(() => {
    const current = new Date()
    const calendarItems = [
      { id: 'kdv', name: 'KDV', day: 28, type: 'kdv' },
      { id: 'kdv2', name: 'KDV2', day: 25, type: 'kdv2' },
      { id: 'muhtasar', name: 'Muhtasar', day: 26, type: 'muhtasar' },
      { id: 'sgk', name: 'SGK', type: 'sgk', lastBusinessDay: true },
    ]

    const specialItems = []
    if (month === 1) {
      specialItems.push({ id: 'gecici_vergi', name: 'Gecici Vergi (4. Donem)', day: 17, type: 'gecici_vergi' })
    }
    if (month === 2) {
      specialItems.push({ id: 'gelir_vergi', name: 'Gelir Vergisi', day: 31, type: 'gelir_vergi' })
    }
    if (month === 3) {
      specialItems.push({ id: 'kurumlar_vergi', name: 'Kurumlar Vergisi', day: 30, type: 'kurumlar_vergi' })
    }
    if (month === 4) {
      specialItems.push({ id: 'gecici_vergi', name: 'Gecici Vergi (1. Donem)', day: 17, type: 'gecici_vergi' })
    }
    if (month === 7) {
      specialItems.push({ id: 'gecici_vergi', name: 'Gecici Vergi (2. Donem)', day: 17, type: 'gecici_vergi' })
    }
    if (month === 10) {
      specialItems.push({ id: 'gecici_vergi', name: 'Gecici Vergi (3. Donem)', day: 17, type: 'gecici_vergi' })
    }

    const allItems = [...calendarItems, ...specialItems].map(i => {
      const dl = i.lastBusinessDay
        // 2.7.266: SGK odemesi hafta sonu/resmi tatile denk gelirse takip eden
        // ilk is gunune ILERI ertelenir (Ekim 2026: 31 Cumartesi -> 2 Kasim)
        ? getFormattedSgkOdemeGunu(year, month)
        : getFormattedBeyanDeadline(year, month, i.day)
      const tahakkukInfo = getTahakkukStatus({ ...i, filingMonth: month, filingYear: year })

      return {
        ...i,
        filingMonth: month,
        filingYear: year,
        deadline: dl,
        deadlineDate: new Date(dl),
        gecmi: new Date(dl) < current,
        daysUntil: Math.ceil((new Date(dl) - current) / (1000 * 60 * 60 * 24)),
        ...tahakkukInfo,
        // Son odeme tarihi her zaman takvimden hesaplanan resmi tarih olsun
        // (DB'deki eski kayitlarda PDF'ten okunmus yanlis tarih kalabiliyor)
        sonOdeme: dl,
        // 2.7.163: SGK bildirgesi MUHTASAR ile birlikte verilir — beyan zamanı
        // her ayin en gec 26'si (tatil/hafta sonunda ilk is gunu); odeme zamanı
        // ayin son is gunu (buyuk tarih olarak gosterilir)
        beyanTarihi: i.type === 'sgk' ? getFormattedBeyanDeadline(year, month, 26) : ''
      }
    })

    return allItems.sort((a, b) => {
      if (a.gecmi && !b.gecmi) return 1
      if (!a.gecmi && b.gecmi) return -1
      return a.deadlineDate - b.deadlineDate
    })
  }, [year, month, getTahakkukStatus])

  // patch: sadece bu bilesenin degistirdigi alanlar.
  // DB'den en guncel kaydi okuyup uzerine uygulariz; aksi halde admin
  // panelinden yapilan eszamanli degisiklikler (yeni tahakkuk) ezilir.
  const persistBeyanDurumlari = useCallback(async (patch) => {
    if (!clientId || !patch) return false

    const kaydet = async () => {
      try {
        const { data: latest, error: readError } = await supabase
          .from('clients')
          .select('beyan_durumlari')
          .eq('id', clientId)
          .single()

        if (readError) throw readError

        const mevcut = latest?.beyan_durumlari || {}
        const degisiklik = typeof patch === 'function' ? patch(mevcut) : patch
        if (!degisiklik || Object.keys(degisiklik).length === 0) return false
        const merged = { ...mevcut, ...degisiklik }
        const { data, error } = await supabase
          .from('clients')
          .update({ beyan_durumlari: merged })
          .eq('id', clientId)
          .select('beyan_durumlari')
          .single()

        if (error) throw error
        setBeyanDurumlari(data.beyan_durumlari)
        onBeyanDurumlariUpdate?.(data.beyan_durumlari)
        return true
      } catch (err) {
        console.error('Beyan durumlari kayit hatasi:', err)
        setKayitHatasi(true)
        return false
      }
    }

    const sonuc = persistQueueRef.current.then(kaydet, kaydet)
    persistQueueRef.current = sonuc
    return sonuc
  }, [clientId, onBeyanDurumlariUpdate])

  // OLU KAYIT TEMIZLIGI (self-heal): silinen tahakkuk dosyalarinin kalintisi
  // olan `_tutar` / `_tahakkuk_url` kayitlari musteriya hatali tutar gosterir
  // ve keşfi bloklar. Veri yuklendiginde bir kez: Storage'da olmayan dosyalarin
  // kayitlari cikarilir, tutar yeniden hesaplanir, tamamen bosalan donemler
  // sifirlanir (keşif dogru dosyayi yeniden bulabilir).
  useEffect(() => {
    if (!clientId) return
    const eski = propBeyanDurumlari || {}
    if (!Object.keys(eski).length) return
    if (oluTemizlikRef.current.has(clientId)) return
    oluTemizlikRef.current.add(clientId)
    ;(async () => {
      try {
        const { yeniMap, degisti } = await oluTahakkukTemizle(eski)
        if (!degisti) return
        const patch = {}
        Object.keys(yeniMap).forEach(k => {
          if (yeniMap[k] !== eski[k]) patch[k] = yeniMap[k]
        })
        if (Object.keys(patch).length) await persistBeyanDurumlari(patch)
        console.log('Olu tahakkuk kayitlari temizlendi:', Object.keys(patch))
      } catch (e) {
        console.warn('Olu kayit temizligi atlandi:', e?.message || e)
      }
    })()
  }, [clientId, propBeyanDurumlari, persistBeyanDurumlari])

  // Müşteri kaydını bir kez çek (Storage klasör adı için vkn/tc + name)
  useEffect(() => {
    let iptal = false
    if (!clientId) return
    supabase.from('clients').select('*').eq('id', clientId).single()
      .then(({ data }) => { if (!iptal && data) setMusteriNesne(data) })
    return () => { iptal = true }
  }, [clientId])

  // Storage keşfi: hasTahakkuk=false dönemlerde müşteri klasörünü tara;
  // tahakkuk PDF'leri varsa (birden fazla sicil dahil) _tahakkuklar
  // listesine bir kez ekle. Analiz useEffect yeni eklenenleri otomatik okur.
  // ÖNCE dönem-dışı kayıtlar temizlenir (dosya adı ↔ dönem uyuşmazlığı).
  useEffect(() => {
    console.log('VergiTakvimi discovery effect', { musteriId: musteriNesne?.id, sorted: sortedTum.map(i => i.id + ':' + i.type) })
    if (!musteriNesne || !persistBeyanDurumlari) return
    const dosyaAdi = (url) => {
      try {
        const s = String(url || '').split('?')[0]
        return decodeURIComponent(s.substring(s.lastIndexOf('/') + 1))
      } catch { return '' }
    }
    ;(async () => {
      for (const item of sortedTum) {
        const key = item.statusKey
        // --- Temizlik (her item icin bir kez) ---
        if (!temizlikRef.current.has(key)) {
          temizlikRef.current.add(key)
          const listeKey = `${key}_tahakkuklar`
          const liste = beyanDurumlari?.[listeKey]
          if (Array.isArray(liste) && liste.length) {
            let temiz = liste.filter(t => {
              const ad = dosyaAdi(t?.url)
              if (/beyan|mizan/i.test(ad)) return false
              const donem = tahakkukDonemi(ad)
              if (!donem) return true
              if (donem.ay && donem.ay !== item.filingMonth) return false
              if (donem.yil && donem.yil !== item.filingYear) return false
              return true
            })
            // Gecici vergide birden fazla kayit varsa yalnizca son (gercek tahakkuk) tutulur
            if (item.type === 'gecici_vergi' && temiz.length > 1) {
              temiz = [temiz[temiz.length - 1]]
            }
            if (temiz.length !== liste.length) {
              await persistBeyanDurumlari({ [listeKey]: temiz, [`${key}_tutar`]: sumTahakkukTutar(temiz) })
              continue
            }
          }
        }
        if (item.hasTahakkuk) continue
        if (kesifRef.current.has(key)) continue
        try {
          const kesifSonuc = await tahakkuklariKesfet(musteriNesne, item.filingYear, item.type, item.filingMonth)
          const bulunan = kesifSonuc.files || []
          console.log('VergiTakvimi kesif:', item.type, item.filingYear, item.filingMonth, bulunan.length, bulunan.map(b => b.name), 'hadError:', kesifSonuc.hadError)
          if (!kesifSonuc.hadError) kesifRef.current.add(key)
          if (!bulunan.length) { await new Promise(r => setTimeout(r, 250)); continue }
          if (bulunan.some(b => b.url)) {
            await persistBeyanDurumlari(mevcut => {
              const listeKey = `${key}_tahakkuklar`
              const liste = Array.isArray(mevcut[listeKey]) ? mevcut[listeKey] : []
              const yeni = bulunan
                .filter(b => b.url && !liste.some(t => t?.url === b.url))
                .map(b => ({
                  url: b.url,
                  name: b.name,
                  uploadedAt: b.uploadedAt || new Date().toISOString(),
                  tutar: 0,
                  analiz_durumu: ''
                }))
              return yeni.length ? { [listeKey]: [...liste, ...yeni] } : null
            })
          }
        } catch (e) { /* keşif hatası sessiz */ }
        await new Promise(r => setTimeout(r, 250))
      }
    })()
  }, [musteriNesne, sortedTum, persistBeyanDurumlari, beyanDurumlari])

  const runTahakkukAnalysis = useCallback(async (item, tahakkukUrl) => {
    if (!tahakkukUrl || analyzingRef.current.has(tahakkukUrl)) return

    analyzingRef.current.add(tahakkukUrl)

    setBeyanDurumlari(prev => ({
      ...prev,
      [`${item.statusKey}_analiz_durumu`]: 'analiz_ediliyor'
    }))

    try {
      const result = await analyzeDocument(tahakkukUrl)
      const kaydedildi = await persistBeyanDurumlari(mevcut => {
        const listKey = `${item.statusKey}_tahakkuklar`
        const list = getTahakkukList(mevcut, item.statusKey)
        if (!list.some(t => t.url === tahakkukUrl)) return null

        const basarili = result.success && Number(result.amount) > 0
        const newList = list.map(t => {
          if (t.url !== tahakkukUrl) return t
          return basarili
            ? { ...t, tutar: Number(result.amount), analiz_durumu: 'tamamlandi', son_odeme: item.deadline || result.due_date || '', vergi_turu: result.tax_type || '', tahakkuk_no: result.accrual_no || t.tahakkuk_no || '' }
            : { ...t, analiz_durumu: 'basarisiz' }
        })
        const patch = {
          [listKey]: newList,
          [`${item.statusKey}_tutar`]: sumTahakkukTutar(newList),
          [`${item.statusKey}_analiz_durumu`]: basarili ? 'tamamlandi' : 'basarisiz'
        }
        if (basarili) {
          patch[`${item.statusKey}_son_odeme`] = item.deadline || result.due_date || ''
          patch[`${item.statusKey}_vergi_turu`] = result.tax_type || ''
          patch[`${item.statusKey}_analiz_url`] = tahakkukUrl
          if (result.accrual_no) patch[`${item.statusKey}_tahakkuk_no`] = result.accrual_no
        } else {
          patch[`${item.statusKey}_analiz_hata`] = result.error || 'Belge analiz edilemedi'
        }
        return patch
      })
      if (!kaydedildi) {
        setKayitHatasi(true)
        setBeyanDurumlari(prev => ({ ...prev, [`${item.statusKey}_analiz_durumu`]: '' }))
      }
    } catch (err) {
      console.error('Tahakkuk analiz hatasi:', err)
      const failPatch = {
        [`${item.statusKey}_analiz_durumu`]: 'basarisiz',
        [`${item.statusKey}_analiz_hata`]: err.message || 'Bilinmeyen hata'
      }
      setBeyanDurumlari(prev => ({ ...prev, ...failPatch }))
      await persistBeyanDurumlari(failPatch)
    } finally {
      analyzingRef.current.delete(tahakkukUrl)
    }
  }, [persistBeyanDurumlari])

  useEffect(() => {
    if (!clientId || loading) return

    sortedTum.forEach(item => {
      const list = item.tahakkuklar || []
      list.forEach(t => {
        if (!t.url) return
        // Bu dosya zaten basariyla analiz edildiyse atla.
        // Istisna: tutar okunmus ama tahakkuk (belge) numarasi yoksa ve tur
        // SGK degilse bir kez daha analiz et — eski kayitlardaki eksik
        // tahakkuk numarasi boylece backfill edilir (odeme ekraninda gerekli).
        const tamamVeNoVar = Number(t.tutar) > 0 && t.analiz_durumu === 'tamamlandi'
          && (t.tahakkuk_no || item.type === 'sgk')
        if (tamamVeNoVar) return
        if (t.analiz_durumu === 'analiz_ediliyor') return
        if (attemptedAnalysisRef.current.has(t.url)) return

        attemptedAnalysisRef.current.add(t.url)
        runTahakkukAnalysis(item, t.url)
      })
    })
  }, [clientId, loading, propBeyanDurumlari, runTahakkukAnalysis, sortedTum])

  const handleTahakkukClick = async (item) => {
    if (!item.hasTahakkuk) return

    setSelectedTahakkuk(item)
    setOdemeHatasi('')
    setShowModal(true)
    setShowGibPanel(false)
    setModalLoading(false)
    // Son tahakkuku varsayilan dokuman olarak sec (WhatsApp/mail gonderimi icin)
    const list = item.tahakkuklar || []
    setDocumentUrl(list.length > 0 ? list[list.length - 1].url : item.tahakkukUrl || null)
  }

  const handleDownload = () => {
    if (documentUrl) {
      window.open(documentUrl, '_blank')
    }
  }

  const handleWhatsAppSend = async () => {
    if (!documentUrl || !selectedTahakkuk) return

    try {
      const { data: client } = await supabase
        .from('clients')
        .select('phone')
        .eq('id', clientId)
        .single()

      const caption = `${selectedTahakkuk.name} tahakkuk dokumaniniz hazirdir.\n\nSaygilarimizla,\nMUBiS ERP`
      const documentName = `${selectedTahakkuk.name || 'tahakkuk'}.pdf`

      await sendDocumentViaWhatsAppChannel({
        phone: client.phone,
        documentUrl,
        documentName,
        caption,
        clientId,
        documentType: 'tahakkuk',
        settings
      })

      alert(getWhatsAppChannel(settings) === 'web' ? 'WhatsApp penceresi acildi. Mesaji WhatsApp uzerinden gonderin.' : 'WhatsApp mesaji gonderildi.')
    } catch (err) {
      alert('Gonderim hatasi: ' + err.message)
    }
  }

  const handleEmailSend = async () => {
    if (!documentUrl || !selectedTahakkuk) return;

    try {
      const { data: client } = await supabase
        .from('clients')
        .select('email')
        .eq('id', clientId)
        .single()

      await sendEmail({
        to: client.email,
        subject: `${selectedTahakkuk.name} Tahakkuk Dokumani`,
        body: `${selectedTahakkuk.name} tahakkuk dokumani ekte sunulmustur.`,
        smtpConfig: settings
      })

      alert('E-posta ile gonderildi!')
    } catch (err) {
      alert('Gonderim hatasi: ' + err.message)
    }
  }

  // GIB Dijital Vergi Dairesi - belge numarasi ile odeme
  // 1) Yerel yardimci servis kuruluysa (baslat.bat) Chrome/Edge'i acip
  //    formu OTOMATIK doldurur (guvenlik kodu haric).
  // 2) Kurulu degilse GIB sayfasini yeni sekmede acar, bilgiler panelde
  //    kopyalanabilir olarak sunulur.
  const handleGibOdeme = async () => {
    const statusKey = selectedTahakkuk?.statusKey || ''
    // Panelde elle yazilmis degerler oncelikli (kullanici il/vergi dairesi
    // girip tekrar basabilir); eksikler musteri kaydindan tamamlanir
    const bilgi = {
      vkn: gibBilgi.vkn || user?.vkn || user?.tc || '',
      tahakkukNo: beyanDurumlari[`${statusKey}_tahakkuk_no`] || '',
      il: gibBilgi.il || user?.city || '',
      vergiDairesi: gibBilgi.vergiDairesi || user?.taxOffice || ''
    }
    // MUBiS'te kayitli kurum erisim bilgilerini de ekle (VKN/vergi dairesi
    // eksikse tamamlanir; giris gerektiren islerde sifreler buradan gider)
    try {
      const giris = await musteriGirisBilgileriGetir(clientId)
      if (giris) {
        bilgi.vkn = bilgi.vkn || giris.vkn || giris.tc || ''
        bilgi.il = bilgi.il || giris.il || ''
        bilgi.vergiDairesi = bilgi.vergiDairesi || giris.vergiDairesi || ''
        bilgi.kullaniciKodu = giris.dvs_username || ''
        bilgi.parola = giris.dvs_password || ''
      }
    } catch (e) { /* bilgi eksikse de devam */ }

    setGibBilgi(bilgi)
    setShowGibPanel(true)
    setGibHelperDurum('deniyor')

    const sonuc = await gibYardimciIleDoldur(bilgi)
    if (sonuc.ok) {
      setGibHelperDurum('ok')
      setGibRapor(sonuc.rapor || null)
      return
    }
    // Yardimci program yok/calistirilamiyor: GIB sayfasini acma, kurulum
    // uyari goster. Kurulum servisi hemen baslattigi icin bu uyari bir
    // daha cikmaz; "Ode" butonu odeme sayfasini dogrudan acar.
    setGibHelperDurum('kurulu-degil')
  }

  // Yardimci program olmadan elle devam etmek isteyen icin
  const handleGibManuelAc = () => {
    const url = selectedTahakkuk?.type === 'sgk'
      ? 'https://www.turkiye.gov.tr/sosyal-guvenlik-sosyal-guvenlik-kurumu-kart-ile-prim-odeme-uygulamasi'
      : GIB_ODEME_URL
    window.open(url, '_blank', 'noopener')
  }

  // SGK prim odemesi: e-Devlet uzerinden (turkiye.gov.tr). Yardimci program
  // TC + e-Devlet sifresini doldurur, kullanici guvenlik kodunu girer;
  // giris sonrasi uygulama acilir, sorgu secimleri yapilip Borc Sorgula'ya basilir.
  const handleSgkOdeme = async () => {
    setShowGibPanel(true)
    setGibHelperDurum('deniyor')
    let tc = user?.vkn || user?.tc || ''
    let edevletSifre = ''
    try {
      const giris = await musteriGirisBilgileriGetir(clientId)
      if (giris) {
        tc = giris.vkn || giris.tc || tc
        edevletSifre = giris.edevlet_pass || ''
      }
    } catch (e) { /* bilgi yoksa asagida uyarilir */ }
    if (!edevletSifre) {
      setGibHelperDurum('edevlet-sifre-yok')
      return
    }
    const sonuc = await gibYardimciIs('sgk-odeme', { tc, edevletSifre })
    if (sonuc.ok) {
      setGibHelperDurum('ok')
      return
    }
    setGibHelperDurum(['kurulu-degil', 'erisim-engelli', 'servis-yanit-vermedi'].includes(sonuc.reason) ? sonuc.reason : 'kurulu-degil')
  }

  const handleOdendiIsaretle = async () => {
    if (!selectedTahakkuk?.statusKey || odemeKayitRef.current) return
    odemeKayitRef.current = true
    setOdemeKaydediliyor(true)
    setOdemeHatasi('')
    const statusKey = selectedTahakkuk.statusKey
    const odendi = !selectedTahakkuk.odendi
    const bugun = new Date()
    const tarih = odendi ? `${bugun.getFullYear()}-${String(bugun.getMonth() + 1).padStart(2, '0')}-${String(bugun.getDate()).padStart(2, '0')}` : ''
    try {
      const kaydedildi = await persistBeyanDurumlari({
        [`${statusKey}_odendi`]: odendi,
        [`${statusKey}_odeme_tarihi`]: tarih
      })
      if (!kaydedildi) {
        setOdemeHatasi('Ödeme işareti kaydedilemedi. Lütfen tekrar deneyin.')
        return
      }
      setSelectedTahakkuk(prev => prev?.statusKey === statusKey ? { ...prev, odendi, odemeTarihi: tarih } : prev)
    } catch {
      setOdemeHatasi('Ödeme işareti kaydedilemedi. Lütfen tekrar deneyin.')
    } finally {
      odemeKayitRef.current = false
      setOdemeKaydediliyor(false)
    }
  }

  // Tecilli tahsilat taksit odemesi: yardimci program GIB "Belge Numarasi
  // Ile Odeme" sayfasini acar, belge no + il + vergi dairesi + guvenlik
  // kodunu doldurur, TAKSITLI ODEME'yi secer ve ilk taksit kutusunu isaretler.
  const handleTecilliOde = async (belge) => {
    if (!belge) return
    setTecilliYukleniyorBelge(belge.belgeNo)
    setTecilliDurum({ tip: 'deniyor', metin: 'GIB ödeme sayfası hazırlanıyor...' })
    try {
      const sonuc = await gibYardimciIs('tecilli-odeme', {
        vkn: tecilli?.vkn || user?.vkn || user?.tc || '',
        belgeNo: belge.belgeNo,
        il: tecilli?.il || user?.city || '',
        vergiDairesi: belge.vergiDairesi || tecilli?.vergiDairesi || ''
      })
      if (sonuc.ok) {
        setTecilliDurum({ tip: 'ok', metin: sonuc.not || 'Ödeme sayfası hazır; ekrandan ödemeyi tamamlayın.' })
        return
      }
      if (['kurulu-degil', 'erisim-engelli', 'servis-yanit-vermedi', 'servis-hatasi'].includes(sonuc.reason) || /bilinmeyen/i.test(sonuc.reason || '')) {
        // Yardimci kurulu degil ya da eski surumde (is tanimsiz): GIB sayfasini
        // yeni sekmede ac; belge numarasi el ile girilebilir.
        setTecilliDurum({
          tip: 'yardimci-yok',
          metin: 'Yardımcı program çalışmıyor veya eski sürümde. GIB ödeme sayfası yeni sekmede açıldı; belge numarası: ' + belge.belgeNo
        })
        window.open(GIB_ODEME_URL, '_blank', 'noopener')
      } else {
        setTecilliDurum({ tip: 'hata', metin: 'Ödeme sayfası hazırlanamadı: ' + (sonuc.reason || 'bilinmeyen hata') })
      }
    } catch (e) {
      setTecilliDurum({ tip: 'hata', metin: 'Hata: ' + (e?.message || e) })
    } finally {
      setTecilliYukleniyorBelge('')
    }
  }

  // Taksiti odenmis olarak isaretle: DB'de odenen=true yazilir, listeden silinir.
  const handleTecilliOdendi = async (belge, t) => {
    if (!window.confirm(`${t.no}/${belge.taksitSayisi} taksit (${t.toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL) ödendi olarak işaretlenecek ve listeden kaldırılacak. Onaylıyor musunuz?`)) return
    try {
      const yeniBelgeler = await tecilliTaksitOdendi(clientId, belge.belgeNo, t.no)
      setTecilli(p => p ? { ...p, belgeler: yeniBelgeler } : p)
    } catch (e) {
      setTecilliDurum({ tip: 'hata', metin: 'Taksit işaretlenemedi: ' + (e?.message || e) })
    }
  }

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-blue-900/50 to-blue-800/30 rounded-2xl p-6 border border-blue-700/30">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-yellow-400" />
            {getMonthName(month)} {year} Vergi Takvimi
          </h3>
        </div>
        <div className="text-center py-8 text-gray-400">Yukleniyor...</div>
      </div>
    )
  }

  // Bulunan ayin odenmemis tecilli taksitleri: kart + odeme ozeti icin
  const ayBasi = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const aySonu = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`
  const tecilliAylik = []
  ;(tecilli?.belgeler || []).forEach(b => {
    ;(b.taksitler || []).forEach(t => {
      if (!t.odenen && t.vade >= ayBasi && t.vade <= aySonu) tecilliAylik.push({ belge: b, taksit: t })
    })
  })
  const tecilliAyToplam = tecilliAylik.reduce((a, x) => a + (Number(x.taksit.toplam) || 0), 0)

  return (
    <>
      <div className="bg-gradient-to-br from-blue-900/50 to-blue-800/30 rounded-2xl p-6 border border-blue-700/30">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-yellow-400" />
            {getMonthName(month)} {year} Vergi Takvimi
          </h3>
        </div>
        
        {kayitHatasi && (
          <div role="alert" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
            Tahakkuk bilgileri kaydedilemedi. Sayfayı yenileyip tekrar deneyin; sorun sürerse mali müşavirinize bildirin.
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sortedTum.map(item => (
            <div 
              key={item.id + item.filingMonth} 
              onClick={() => item.hasTahakkuk && handleTahakkukClick(item)}
              className={`rounded-xl p-4 border transition-all ${
                item.gecmi && !item.odendi
                  ? 'bg-blue-900/10 border-blue-800/20 opacity-60'
                  : item.isTamamlandi || item.odendi
                    ? 'bg-green-900/20 border-green-500/30'
                    : item.hasTahakkuk
                      ? 'bg-blue-800/30 border-blue-500/40 cursor-pointer hover:bg-blue-700/30 hover:border-blue-400/50'
                      : 'bg-blue-800/20 border-blue-700/30'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-white">{item.name}</div>
                {item.isTamamlandi && (
                  <CheckCircle className="w-4 h-4 text-green-400" />
                )}
                {item.isHazirlaniyor && !item.isTamamlandi && (
                  <Clock className="w-4 h-4 text-blue-400" />
                )}
                {!item.isHazirlaniyor && !item.isTamamlandi && (
                  <AlertTriangle className="w-4 h-4 text-yellow-400" />
                )}
              </div>
              
              <div className={`text-lg font-bold ${item.gecmi ? 'text-gray-500' : 'text-white'}`}>
                {item.deadline.split('-').reverse().join('.')}
              </div>

              {!item.gecmi && (
                <div className="text-xs text-gray-400 mt-1">
                  {item.daysUntil === 0 ? 'Bugun son gun!' : 
                   item.daysUntil < 0 ? `${Math.abs(item.daysUntil)} gun gecti` :
                   `${item.daysUntil} gun kaldi`}
                </div>
              )}
              
              <div className="mt-2">
                {item.hasTahakkuk ? (
                  <div className="space-y-1">
                    {/* Coklu tahakkuk: her biri ayri satirda */}
                    {(item.tahakkuklar || []).length > 1 ? (
                      <div className="space-y-1">
                        {item.tahakkuklar.map((t, idx) => (
                          <div key={t.url} className="text-xs flex items-center justify-between gap-2">
                            <span className="text-gray-400 truncate">Tahakkuk {idx + 1}</span>
                            <span className={Number(t.tutar) > 0 ? 'text-green-400 font-medium' : t.analiz_durumu === 'analiz_ediliyor' ? 'text-blue-400' : 'text-orange-400'}>
                              {Number(t.tutar) > 0
                                ? `${Number(t.tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
                                : t.analiz_durumu === 'analiz_ediliyor'
                                  ? 'Analiz ediliyor...'
                                  : 'Okunamadi'}
                            </span>
                          </div>
                        ))}
                        {item.tutar > 0 && (
                          <div className="text-xs text-green-400 font-bold border-t border-blue-700/40 pt-1 mt-1">
                            💰 Toplam: {item.tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                          </div>
                        )}
                      </div>
                    ) : item.tutar > 0 ? (
                      <div className="text-xs text-green-400 font-medium">
                        💰 {item.tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                      </div>
                    ) : item.analizDurumu === 'analiz_ediliyor' ? (
                      <div className="text-xs text-blue-400 font-medium flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Tahakkuk analiz ediliyor...
                      </div>
                    ) : item.analizDurumu === 'basarisiz' ? (
                      <div className="text-xs text-orange-400 font-medium">
                        Tahakkuk okunamadi - Indirmek icin tiklayin
                      </div>
                    ) : (
                      <div className="text-xs text-green-400 font-medium">
                        Tahakkuk Hazir - Analiz bekleniyor
                      </div>
                    )}
                    {item.tutar > 0 && item.sonOdeme && (
                      <div className="text-xs text-gray-400">
                        Son Odeme: {item.sonOdeme}
                      </div>
                    )}
                    {item.isTamamlandi && (
                      <div className="text-xs text-green-500">Tahakkuk gonderildi</div>
                    )}
                    {item.odendi && (
                      <div className="text-xs text-green-400 font-semibold flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Odendi{item.odemeTarihi ? ` - ${item.odemeTarihi.split('-').reverse().join('.')}` : ''}
                      </div>
                    )}
                    {item.isHazirlaniyor && !item.isTamamlandi && (
                      <div className="text-xs text-blue-400">Hazirlaniyor</div>
                    )}
                    {!item.isTamamlandi && item.analizDurumu !== 'analiz_ediliyor' && item.tutar <= 0 && (
                      <div className="text-xs text-yellow-400">Indirmek icin tiklayin</div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">
                    {item.gecmi ? 'Son tarih gecti' : 'Tahakkuk hazirlaniyor'}
                  </div>
                )}
              </div>
            </div>
          ))}
          {/* Tecilli Odeme kartlari: bulunan ayin odenmemis taksitleri (KDV/Muhtasar kartlari gibi) */}
          {tecilliAylik.map(({ belge, taksit }) => {
            const vadeTarih = new Date(taksit.vade + 'T00:00:00')
            const gunFarki = Math.round((vadeTarih - new Date(new Date().toDateString())) / 86400000)
            return (
              <div
                key={belge.belgeNo + '-' + taksit.no}
                onClick={() => handleTecilliOde(belge)}
                className="rounded-xl p-4 border bg-blue-800/20 border-blue-700/30 cursor-pointer hover:bg-blue-700/30 hover:border-blue-400/50 transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-white">Tecilli Ödeme</div>
                  <CreditCard className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-lg font-bold text-white">
                  {taksit.vade.split('-').reverse().join('.')}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {gunFarki === 0 ? 'Bugun son gun!' :
                    gunFarki < 0 ? `${Math.abs(gunFarki)} gun gecti` :
                      `${gunFarki} gun kaldi`}
                </div>
                <div className="mt-2 space-y-1">
                  <div className="text-xs text-white font-medium">
                    {taksit.no}/{belge.taksitSayisi} taksit
                  </div>
                  <div className="text-xs text-green-400 font-medium">
                    💰 {Number(taksit.toplam).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                  </div>
                  <div className="text-xs text-yellow-400">Ödeme icin tiklayin</div>
                </div>
              </div>
            )
          })}
        </div>
        
        {(sortedTum.some(item => item.hasTahakkuk) || tecilliAyToplam > 0) && (
          <div className="mt-4 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
            <div className="text-sm text-yellow-400 font-medium mb-1">Odeme Ozeti</div>
            <div className="text-xs text-gray-400">
              Toplam Odeme: {' '}
              <span className="text-white font-medium">
                {(sortedTum
                  .filter(item => item.hasTahakkuk)
                  .reduce((toplam, item) => toplam + item.tutar, 0) + tecilliAyToplam)
                  .toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
              </span>
            </div>
            {tecilliAyToplam > 0 && (
              <div className="text-xs text-amber-300 mt-1">
                Tecilli taksit: {tecilliAylik.map(x => `${x.taksit.no}/${x.belge.taksitSayisi}`).join(', ')} —{' '}
                {tecilliAyToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
              </div>
            )}
          </div>
        )}

        {/* Tecilli Tahsilat: admin yuklemisse aylik taksitler ayri odeme kutulari.
            Odendigi isaretlenen taksitler listeden silinir (veri PDF icin korunur). */}
        {tecilli?.acik && (tecilli.belgeler || []).length > 0 && (
          <div className="mt-4 rounded-xl p-4 border border-amber-500/30 bg-gradient-to-br from-amber-900/30 to-yellow-800/20">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="text-sm font-semibold text-amber-200 flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                Tecilli Tahsilat
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => tecilliPlanPdfIndir(tecilli).catch(e => setTecilliDurum({ tip: 'hata', metin: 'PDF indirilemedi: ' + (e?.message || e) }))}
                  className="flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/25 border border-amber-500/30 text-amber-200 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Ödeme Planını İndir (PDF)
                </button>
                <span className="text-xs text-amber-300/70">{tecilli.belgeler.length} belge</span>
              </div>
            </div>
            {tecilli.belgeler.map(belge => {
              const bugunISO = new Date().toISOString().slice(0, 10)
              const odenen = (belge.taksitler || []).filter(t => t.odenen)
              const aktif = (belge.taksitler || []).filter(t => !t.odenen)
              const guncel = aktif.filter(t => t.vade >= bugunISO)
              const gecmis = aktif.filter(t => t.vade < bugunISO)
              const tumu = !!tecilliTumGoster[belge.belgeNo]
              const gorunen = tumu ? aktif : guncel.slice(0, 3)
              return (
                <div key={belge.belgeNo} className="bg-blue-950/40 rounded-lg p-3 mb-2 last:mb-0 border border-amber-500/20">
                  <div className="text-xs text-gray-300 mb-2 flex items-center justify-between flex-wrap gap-1">
                    <span className="font-mono">{belge.belgeNo}</span>
                    <span>{belge.vergiDairesi || tecilli.vergiDairesi || ''} Vergi Dairesi</span>
                  </div>
                  {odenen.length > 0 && (
                    <div className="text-xs text-green-400/80 mb-1">{odenen.length} taksit ödendi</div>
                  )}
                  {!tumu && gecmis.length > 0 && (
                    <div className="text-xs text-gray-500 mb-1">{gecmis.length} taksit vadesi gecti</div>
                  )}
                  {aktif.length === 0 ? (
                    <div className="text-sm text-green-300 bg-green-500/10 rounded-lg px-3 py-2 border border-green-500/20">
                      Tüm taksitler ödendi
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1">
                        {gorunen.map(t => (
                          <div key={t.no} className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 ${t.vade < bugunISO ? 'bg-blue-900/10 opacity-60' : 'bg-blue-900/20'}`}>
                            <div className="text-sm">
                              <span className="text-white font-medium">{t.no}/{belge.taksitSayisi}</span>
                              <span className="text-gray-400 text-xs ml-2">{t.vade.split('-').reverse().join('.')}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-green-400 font-medium text-sm">
                                {t.toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                              </span>
                              <button
                                onClick={() => handleTecilliOdendi(belge, t)}
                                title="Ödendi olarak işaretle ve listeden kaldır"
                                className="bg-green-500/10 hover:bg-green-500/30 border border-green-500/30 text-green-300 text-xs px-2 py-1.5 rounded-lg transition-colors"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleTecilliOde(belge)}
                                disabled={tecilliYukleniyorBelge === belge.belgeNo}
                                className="bg-amber-500/20 hover:bg-amber-500/40 border border-amber-500/40 text-amber-200 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                              >
                                {tecilliYukleniyorBelge === belge.belgeNo ? 'Aciliyor...' : 'Öde'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      {(guncel.length > 3 || gecmis.length > 0) && (
                        <button
                          onClick={() => setTecilliTumGoster(p => ({ ...p, [belge.belgeNo]: !p[belge.belgeNo] }))}
                          className="text-xs text-blue-400 hover:text-blue-300 mt-2"
                        >
                          {tumu ? 'Yalnızca yakın taksitleri göster' : `Tüm taksitleri göster (${aktif.length})`}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )
            })}
            {tecilliDurum && (
              <div className={`mt-2 rounded-lg p-3 text-xs border ${
                tecilliDurum.tip === 'ok' ? 'bg-green-500/10 border-green-500/20 text-green-300'
                  : tecilliDurum.tip === 'hata' ? 'bg-red-500/10 border-red-500/20 text-red-300'
                    : 'bg-blue-500/10 border-blue-500/20 text-blue-300'
              }`}>
                {tecilliDurum.metin}
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && selectedTahakkuk && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="bg-blue-900 rounded-2xl border border-blue-700/50 max-w-md w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-5 pb-3 border-b border-blue-700/40 shrink-0">
              <h3 className="text-lg font-semibold text-white">
                {selectedTahakkuk.name} - Tahakkuk
              </h3>
              <button
                onClick={() => setShowModal(false)}
                title="Kapat"
                className="text-gray-400 hover:text-white shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 p-5 overflow-y-auto">
              <div className="bg-blue-800/30 rounded-xl p-4 border border-blue-700/30">
                <div className="text-sm text-gray-400">Odeme Tutari</div>
                <div className="text-2xl font-bold text-green-400">
                  {selectedTahakkuk.tutar > 0
                    ? `${selectedTahakkuk.tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
                    : selectedTahakkuk.analizDurumu === 'analiz_ediliyor'
                      ? 'Analiz ediliyor...'
                      : 'Okunamadi'}
                </div>
                <div className="text-sm text-gray-400 mt-1">
                  Son Tarih: {selectedTahakkuk.sonOdeme || selectedTahakkuk.deadline.split('-').reverse().join('.')}
                </div>
              </div>

              {/* Tum tahakkuklar listesi */}
              {(selectedTahakkuk.tahakkuklar || []).length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs text-gray-400">Tahakkuk Dosyalari ({selectedTahakkuk.tahakkuklar.length})</div>
                  {selectedTahakkuk.tahakkuklar.map((t, idx) => (
                    <a
                      key={t.url}
                      href={t.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setDocumentUrl(t.url)}
                      className={`flex items-center justify-between gap-2 p-3 rounded-xl border transition-colors ${
                        documentUrl === t.url
                          ? 'bg-blue-600/30 border-blue-500/50 text-white'
                          : 'bg-blue-800/20 border-blue-700/30 text-blue-300 hover:bg-blue-700/30'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 shrink-0" />
                        <span className="text-sm truncate">{t.name || `Tahakkuk ${idx + 1}`}</span>
                      </div>
                      <span className="text-xs text-green-400 shrink-0">
                        {Number(t.tutar) > 0
                          ? `${Number(t.tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`
                          : t.analiz_durumu === 'analiz_ediliyor'
                            ? 'Analiz...'
                            : ''}
                      </span>
                    </a>
                  ))}
                </div>
              )}
              
              {modalLoading ? (
                <div className="text-center py-4 text-gray-400">Dokuman yukleniyor...</div>
              ) : documentUrl ? (
                <div className="space-y-2">
                  <button
                    onClick={handleDownload}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-medium transition-colors"
                  >
                    <Download className="w-5 h-5" />
                    Indir
                  </button>
                  
                  <button
                    onClick={handleWhatsAppSend}
                    className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl font-medium transition-colors"
                  >
                    <MessageCircle className="w-5 h-5" />
                    WhatsApp ile Gonder
                  </button>
                  
                  <button
                    onClick={handleEmailSend}
                    className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-400 text-white py-3 rounded-xl font-medium transition-colors"
                  >
                    <Mail className="w-5 h-5" />
                    E-Posta ile Gonder
                  </button>

                  {/* Odeme butonu: SGK icin e-Devlet (turkiye.gov.tr), diger vergiler icin GIB */}
                  <button
                    onClick={selectedTahakkuk.type === 'sgk' ? handleSgkOdeme : handleGibOdeme}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-400 hover:to-teal-500 text-white py-3 rounded-xl font-semibold transition-colors"
                  >
                    <CreditCard className="w-5 h-5" />
                    {selectedTahakkuk.type === 'sgk' ? 'SGK Primi Öde (e-Devlet)' : 'Dijital Vergi Dairesi&apos;nde Ode'}
                  </button>

                  {/* Odeme geri bildirimi: sade tutulur, sadece Ode + gerekirse kurulum uyari */}
                  {showGibPanel && (
                    <div className="space-y-2">
                      {gibHelperDurum === 'ok' && (
                        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-xs text-green-300">
                          {selectedTahakkuk?.type === 'sgk'
                            ? 'e-Devlet giris ekrani acildi ve bilgiler dolduruldu. Guvenlik kodunu girip GIRIS\'e basin; sonrasinda uygulama acilip sorgu secimleri otomatik yapilir, Borc Sorgula\'ya basilir.'
                            : 'GIB odeme sayfasi acildi ve form otomatik dolduruldu. Guvenlik kodunu girip SORGULA\'ya basin.'}
                        </div>
                      )}
                          {gibHelperDurum === 'deniyor' && (
                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300">
                              GIB odeme sayfasi hazirlaniyor...
                            </div>
                          )}
                          {gibHelperDurum && !['ok', 'deniyor'].includes(gibHelperDurum) && (
                            <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 text-xs text-orange-300 space-y-2">
                              <p className="font-medium">
                                {gibHelperDurum === 'erisim-engelli'
                                  ? 'Yardimci programin surumu eski. Lutfen yeniden kurun.'
                                  : gibHelperDurum === 'edevlet-sifre-yok'
                                    ? 'Musteri kaydinda e-Devlet sifresi bulunamadi. Musteri profilinde "e-Devlet Sifresi" alanini doldurup kaydedin.'
                                    : 'Yardimci program bilgisayarinizda kurulu degil.'}
                              </p>
                              {gibHelperDurum !== 'edevlet-sifre-yok' && (
                                <>
                                  <p className="leading-relaxed">
                                    Odeme formunun otomatik doldurulmasi icin yardimci programi kurun. Kurulumdan sonra bu uyari bir daha cikmaz; &quot;Ode&quot; butonu odeme sayfasini dogrudan acar.
                                  </p>
                                  <a
                                    href={YARDIMCI_EXE_URL}
                                    download
                                    className="w-full flex items-center justify-center gap-2 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 py-2 rounded-lg font-medium text-sm transition-colors"
                                  >
                                    <Download className="w-4 h-4" />
                                    Yardimci Programi Kur (Windows)
                                  </a>
                                  <p className="text-[10px] text-gray-400 leading-relaxed">
                                    Indirdikten sonra cift tiklayin; kurulum kendiliginden yapilir.
                                  </p>
                                </>
                              )}
                              <button
                                onClick={handleGibManuelAc}
                                className="text-[11px] text-blue-300 hover:text-blue-200 underline"
                              >
                                {selectedTahakkuk?.type === 'sgk' ? 'Yardimci program olmadan SGK odeme sayfasini ac' : 'Yardimci program olmadan GIB sayfasini ac'}
                              </button>
                            </div>
                          )}
                    </div>
                  )}

                  {odemeHatasi && (
                    <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-xs text-red-300">{odemeHatasi}</div>
                  )}
                  <button
                    type="button"
                    onClick={handleOdendiIsaretle}
                    disabled={odemeKaydediliyor}
                    className="w-full flex flex-col items-center justify-center gap-1 border border-green-500/40 text-green-300 hover:bg-green-500/10 py-2.5 rounded-xl font-medium text-sm transition-colors disabled:opacity-50"
                  >
                    <span><CheckCircle className="w-4 h-4 inline mr-1 -mt-0.5" />{odemeKaydediliyor ? 'Kaydediliyor...' : selectedTahakkuk.odendi ? `Ödendi olarak işaretlendi${selectedTahakkuk.odemeTarihi ? ` — ${selectedTahakkuk.odemeTarihi.split('-').reverse().join('.')}` : ''}` : 'Ödemeyi Yaptım — Ödendi İşaretle'}</span>
                    {selectedTahakkuk.odendi && !odemeKaydediliyor && <span className="text-xs font-normal">İşareti kaldırmak için dokunun</span>}
                  </button>
                </div>
              ) : (
                <div className="text-center py-4 text-gray-400">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  Dokuman bulunamadi
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
