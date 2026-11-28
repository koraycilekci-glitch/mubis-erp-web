// Musterinin e-Fatura / e-Arsiv faturalari listesi + sorgulama (admin tarafinda
// ClientDetail icinde kullanilir; musteri portalindaki "Faturalarim"
// sekmesiyle ayni veriyi okur ve yazar).
import { useState, useEffect, useMemo, useRef, Fragment, useCallback } from 'react'
import { Eye, Download, Upload, RefreshCw, Receipt, Search, Trash2, Loader2, CreditCard, X, Square, Archive } from 'lucide-react'
import { dosyaIndir } from '../utils/dosyaIndir'
import { fetchDocument, openDocument } from '../utils/storageUrl'
import { faturalariGetir, kdvDetaylariGetir, efaturaSorgula, faturaGruplari, faturaTuruAdi, faturaTurEslesir, faturaTurEtiketi, belgeTuruAdi, sorguYonleri, manuelFaturaYukle, faturalariSil, dosyalariMubisYukle, edefterTopluKopyala, faturaKopyalamaDosyalari, efaturaTutarlariOnar, efaturaKdvOranlariOnar, afaDokumuYukle, edefterDokumleriniYukle, fisKdvDetayUret, aracKdvMatrahaEkle, lucaDurumMetni, faturaIlerlemeMetni } from '../services/efaturaService'
import { yardimciIsSunucu, gibLucaSorguDurdur } from '../utils/gibOdemeHelper'
import { krediKartiHasilatGetir, dvsSorgula } from '../services/dvsSorguService'
import { formatDateTR } from '../utils/dateUtils'
import { supabase } from '../lib/supabase'
import { ublAyikla, faturaHtmlOlustur, gomuluXsltGorunumu } from '../utils/faturaGorunum'
import FisModal from './FisModal'
import FisDokumTablosu from './FisDokumTablosu'
import { fisKaydiMi } from '../utils/fisDetay'

// 2.7.497: matrah/kdv tutarlilik onarimi oturum basina musteri basina 1 kez
const onarimYapilanClientlar = new Set()

// 2.7.542: XML'i olmayan (PDF / elle yuklenen) faturalar icin KDV oranini
// matrah + kdv'den hesaplar. Yalnizca standart oranlardan birine yakin cikiyorsa
// dondurur — coklu oranli bir faturada yanlis rozet gosterilmesin diye.
const STANDART_KDV_ORANLARI = [1, 5, 8, 10, 18, 20]
function hesaplaKdvOrani(f) {
  const m = Number(f?.matrah), k = Number(f?.kdv)
  if (!isFinite(m) || !isFinite(k) || m <= 0 || k <= 0) return null
  const oranHam = (k / m) * 100
  const enYakin = STANDART_KDV_ORANLARI.reduce((a, s) => Math.abs(s - oranHam) < Math.abs(a - oranHam) ? s : a, STANDART_KDV_ORANLARI[0])
  return Math.abs(m * enYakin / 100 - k) <= 0.02 ? enYakin : null
}
// 2.7.575: Rozet degerleri — kdv_detay kayitlarinda gecersiz/eksik oran varsa
// (null, NaN, 0'a yuvarlanan) onlari at; hic gecerli oran yoksa matrah+KDV'den
// hesaplanan yedek orani kullan. Boylece cogu faturada yesil rozet gorunur.
function gecerliOranlar(detaylar) {
  // 2.7.632: oran null/undefined ise 0 olarak kabul et (istisna/muaf satirlar
  // bazi XML'lerde Percent elementi yazmaz; oran null olarak kaydedilir).
  return (detaylar || []).map(detay => {
    if (detay?.oran == null || detay.oran === '') {
      return (Number(detay?.kdv) === 0) ? 0 : null
    }
    return Number(detay.oran)
  }).filter(o => o != null && isFinite(o) && o >= 0 && o <= 100)
}
function oranEtiket(o) {
  const n = Number(o)
  return isFinite(n) ? String(Math.round(n * 10) / 10).replace('.', ',') : ''
}

function unvanYok(fatura) {
  const unvan = String(fatura.karsi_unvan || '').trim()
  if (!unvan) return true
  if (unvan === String(fatura.karsi_vkn || '').trim()) return true
  // 2.8.75: eski UTTS kayitlarinda unvan yerine "UTTS" (fatura turu) yazilmis
  // olabiliyor — bu yer tutucu gercek unvan sayilmaz, GIB sorgusuyla doldurulur.
  if (fatura.tur === 'utts' && /^utts$/i.test(unvan)) return true
  return false
}

function uttsUnvanlariBirlestir(faturalar) {
  const unvanlar = new Map()
  for (const fatura of faturalar) {
    if (fatura.tur === 'utts') continue
    const vkn = String(fatura.karsi_vkn || '').trim()
    const unvan = String(fatura.karsi_unvan || '').trim()
    if (!/^\d{10,11}$/.test(vkn) || !unvan || /^\d+$/.test(unvan)) continue
    const onceki = unvanlar.get(vkn)
    if (onceki === undefined) unvanlar.set(vkn, unvan)
    else if (onceki && onceki.toLocaleLowerCase('tr') !== unvan.toLocaleLowerCase('tr')) unvanlar.set(vkn, null)
  }
  return faturalar.map(fatura => {
    if (fatura.tur !== 'utts' || !unvanYok(fatura)) return fatura
    const unvan = unvanlar.get(String(fatura.karsi_vkn || '').trim())
    return unvan ? { ...fatura, karsi_unvan: unvan } : fatura
  })
}

// 2.8.51: Karşi taraf, musterinin KENDISI ise gosterilmez. Giden (kesilen)
// faturalarda bir donem yanlislikla satici (musterinin kendi unvani) yazilmis
// kayitlar icin savunma katmani.
function karsiTarafMetni(fatura, client = null) {
  const unvan = String(fatura.karsi_unvan || '').trim()
  const vkn = String(fatura.karsi_vkn || '').trim()
  if (client) {
    // 2.8.52: noktalama/bicim farkina dayanikli karsilastirma — "ELEKTRO-AK
    // LTD. ŞTİ." ile "ELEKTRO AK" ayni kisi sayilir; satis faturasinda
    // saticinin (musterinin kendi) adi gorunmez.
    const sadeles = (s) => String(s || '')
      .toLocaleUpperCase('tr')
      .replace(/[İI]/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G')
      .replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C')
      .replace(/[^A-Z0-9]/g, '')
    const mv = String(client.vkn || client.tc || '').replace(/\s/g, '')
    const ad = sadeles(client.name || client.company || '')
    const ayniVkn = !!(mv && vkn && vkn.replace(/\s/g, '') === mv)
    const su = sadeles(unvan)
    const ayniAd = !!(ad && su && (su === ad || ((su.includes(ad) || ad.includes(su)) && su.slice(0, 8) === ad.slice(0, 8))))
    if (ayniVkn || ayniAd) return '-'
  }
  if (fatura.tur === 'utts' && unvan) return unvan
  return unvan || vkn || '-'
}

export default function FaturaListesiKarti({ clientId, client, disDonem, sorguSecimi = 'yeni', sorguPeriyod = '30gun', yonFiltre = 'all', belgeTurFiltre = '', disFiltre = null, disEylem = null, onSorguDurumDegis }) {
  const [faturalar, setFaturalar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(false)
  const [listeHatasi, setListeHatasi] = useState('')
  const [sorguYili, setSorguYili] = useState(() => String(new Date().getFullYear()))
  const [sorguAyi, setSorguAyi] = useState(() => String(new Date().getMonth() + 1))
  const sorguMod = 'sorgula'
  // 2.7.400: kredi karti tahsilati
  const [krediKarti, setKrediKarti] = useState(null)
  const [krediKartiYukleniyor, setKrediKartiYukleniyor] = useState(false)
  // Sorgu kapsami: tur (hepsi/efatura/earsiv/esmm/utts) + yon (alis/satis/hepsi)
  // 'hepsi' = e-Fatura + e-Arşiv + e-SMM + UTTS SIRAYLA sorgulanir
  const [sorguTip, setSorguTip] = useState('hepsi')
  const [sorguluyor, setSorguluyor] = useState(false)
  const sorguBaslangicRef = useRef(null)
  const [sorguSuresi, setSorguSuresi] = useState(null)
  useEffect(() => {
    if (!sorguluyor) return
    const zamanlayici = setInterval(() => {
      if (sorguBaslangicRef.current !== null) setSorguSuresi(Math.floor((performance.now() - sorguBaslangicRef.current) / 1000))
    }, 1000)
    return () => clearInterval(zamanlayici)
  }, [sorguluyor])
  const sorguSureMetni = sorguSuresi === null ? '' : [Math.floor(sorguSuresi / 3600), Math.floor(sorguSuresi / 60) % 60, sorguSuresi % 60].map(deger => String(deger).padStart(2, '0')).join(':')
  // 2.7.574: Sorgulamayi Durdur — web tarafindaki adimlar arasi bayrak +
  // yardimciya /is-durdur (GIB bekleme donguleri bayragi kontrol eder).
  // 2.8.23: tumu=true — kullanicinin istegi: Durdur'a basinca KUYRUKTA
  // BEKLEYEN ve CALISAN tum sorgular (VPS + yerel) durdurulur, calisan isin
  // sekmeleri kapatilir. Aksi halde "Onceki Luca isleminin bitmesi
  // bekleniyor..." ekraninda takili kaliniyordu.
  const durdurRef = useRef(false)
  const iptalKontrol = useCallback(() => durdurRef.current, [])
  const handleSorguDurdur = async () => {
    durdurRef.current = true
    setMesaj('Tüm sorgulamalar durduruluyor — çalışan ve kuyrukta bekleyen işler iptal ediliyor...')
    try {
      const iletildi = await gibLucaSorguDurdur('sunucu', true)
      if (!sorguluyor) setMesaj(iletildi ? 'Durdurma isteği yardımcıya iletildi.' : mesaj + ' Durdurma isteği iletilemedi; yardımcı bağlantısını kontrol edin.')
    } catch {
      if (!sorguluyor) setMesaj(mesaj + ' Durdurma isteği iletilemedi; yardımcı bağlantısını kontrol edin.')
    }
  }
  const [mesaj, setMesaj] = useState('')
  // 2.7.541: Bolum 4 — tablo arama + sayfalama (sayfa basina 25)
  const [aramaMetni, setAramaMetni] = useState('')
  const [sayfaNo, setSayfaNo] = useState(1)
  // Manuel yükleme (klasör / dosya seç): dosyalar once "bekleyen" listesine
  // alınır, kullanıcı YÜKLE'ye basınca yükleme başlar — yükleme yapıldı mı
  // yapılmadı mı açıkça görünür.
  const [bekleyenDosyalar, setBekleyenDosyalar] = useState(null)
  const [dosyaYukleniyor, setDosyaYukleniyor] = useState(false)
  // Toplu/tek tek silme
  const [seciliIds, setSeciliIds] = useState(new Set())
  const [siliniyor, setSiliniyor] = useState(false)
  const [fisGoster, setFisGoster] = useState(null) // UTTS fiş görüntüleyici
  // Coklu KDV'li faturalarin oran bazli satirlari (fatura_id -> [{oran, matrah, kdv}])
  const [kdvDetaylar, setKdvDetaylar] = useState({})
  const klasorInputRef = useRef(null)

  // 2.7.443: Luca AFA dökümü yükleme (Gümrük/İthalat, Gider fiş/fatura, Z Raporu)
  // 2.7.521: liste araçları satırına taşındı (ayrı kart yerine)
  const gumrukInputRef = useRef(null)
  const giderInputRef = useRef(null)
  const zRaporuInputRef = useRef(null)
  const [dokumYukleniyor, setDokumYukleniyor] = useState(false)
  const [dokumMesaj, setDokumMesaj] = useState('')
  const [dokumHata, setDokumHata] = useState('')
  // 2.8.60: Filtrelenmiş fatura listesinin PDF/XML dosyalarını tek ZIP'te indir
  const [zipDurum, setZipDurum] = useState(null) // { calisiyor, toplam, tamamlanan, hatalar, mesaj }

  const dokumYukle = async (dosya, tip) => {
    if (!dosya || !client) return
    setDokumHata(''); setDokumMesaj('')
    setDokumYukleniyor(true)
    try {
      const res = await afaDokumuYukle({ client, dosya, tip })
      if (res.ok) {
        setDokumMesaj(res.not || `${res.sayi} kayıt eklendi.`)
        await yukle()
      } else setDokumHata(res.not || 'Döküm yüklenemedi.')
    } catch (e) {
      setDokumHata(e?.message || 'Döküm yüklenemedi.')
    } finally {
      setDokumYukleniyor(false)
      if (gumrukInputRef.current) gumrukInputRef.current.value = ''
      if (giderInputRef.current) giderInputRef.current.value = ''
      if (zRaporuInputRef.current) zRaporuInputRef.current.value = ''
    }
  }
  const dosyaInputRef = useRef(null)

  // 2.7.571 HIZ: yalniz secili donemin kayitlari cekilir (1 istek). Tam
  // liste cekimi (binlerce satir, 4+ sayfa + onarım taramalari) listeyi
  // cok gecistiriyordu. Onarim islemleri arka planda calisir; duzeltme
  // yaparsa liste sessizce tazelenir.
  const sonCekilenRef = useRef('')
  const listeIstekRef = useRef(0)
  const aktifClientRef = useRef(clientId)
  const uttsSorgulananRef = useRef(new Set())
  const [uttsUnvanMesaj, setUttsUnvanMesaj] = useState('')
  aktifClientRef.current = clientId

  const uttsUnvanlariniSorgula = async (liste, hedefClientId) => {
    // Ünvanı eksik tüm faturalar (UTTS dahil) için VKN'den GİB sorgusu
    const adaylar = uttsUnvanlariBirlestir(liste).filter(f => unvanYok(f))
    const numaralar = [...new Set(adaylar.map(f => String(f.karsi_vkn || '').trim()).filter(vkn => /^\d{10,11}$/.test(vkn)))]
      .filter(vkn => !uttsSorgulananRef.current.has(`${hedefClientId}:${vkn}`))
    const vknEksik = adaylar.filter(f => f.tur === 'utts' && !/^\d{10,11}$/.test(String(f.karsi_vkn || '').trim())).length
    if (!numaralar.length) {
      if (vknEksik) setUttsUnvanMesaj(`${vknEksik} UTTS kaydının vergi numarası kaynak dosyadan doğrulanamadı; ünvan sorgulanamıyor.`)
      return
    }
    numaralar.forEach(vkn => uttsSorgulananRef.current.add(`${hedefClientId}:${vkn}`))
    const tamamlanan = new Set()
    setUttsUnvanMesaj('Ünvanlar vergi numarasından GİB üzerinden sorgulanıyor...')
    try {
      const { data, error } = await supabase.auth.getSession()
      if (error || !data?.session?.access_token) throw new Error('GİB sorgusu için oturum açın')
      let bulunan = 0
      let kayitHatasi = false
      for (let offset = 0; offset < numaralar.length; offset += 10) {
        if (aktifClientRef.current !== hedefClientId) return
        const grup = numaralar.slice(offset, offset + 10)
        const response = await fetch('/api/vkn-sorgula', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
          body: JSON.stringify({ clientId: hedefClientId, vknler: grup }),
          signal: AbortSignal.timeout(120000)
        })
        const result = await response.json().catch(() => null)
        if (!response.ok || !result?.success || !result.data || typeof result.data !== 'object' || Array.isArray(result.data)) throw new Error(result?.error || 'GİB unvan sorgusu başarısız')
        if (aktifClientRef.current !== hedefClientId) return
        const unvanlar = {}
        const kaydedilemeyen = new Set()
        for (const vkn of grup) {
          const unvan = typeof result.data[vkn] === 'string' ? result.data[vkn].trim() : ''
          if (!unvan || /^\d+$/.test(unvan)) {
            kaydedilemeyen.add(vkn)
            continue
          }
          unvanlar[vkn] = unvan
          const ids = adaylar.filter(f => String(f.karsi_vkn || '').trim() === vkn).map(f => f.id)
          const { data: kayitlar, error: kayitError } = await supabase.from('efatura_faturalar')
            .update({ karsi_unvan: unvan }).eq('client_id', hedefClientId).eq('karsi_vkn', vkn).in('id', ids)
            .select('id')
          if (kayitError || !kayitlar?.length) {
            kayitHatasi = true
            kaydedilemeyen.add(vkn)
          } else bulunan++
        }
        if (aktifClientRef.current !== hedefClientId) return
        grup.filter(vkn => !kaydedilemeyen.has(vkn)).forEach(vkn => tamamlanan.add(vkn))
        setFaturalar(onceki => onceki.map(f => unvanYok(f) && unvanlar[String(f.karsi_vkn || '').trim()]
          ? { ...f, karsi_unvan: unvanlar[String(f.karsi_vkn || '').trim()] } : f))
      }
      if (aktifClientRef.current === hedefClientId) setUttsUnvanMesaj(`Ünvan sorgusu tamamlandı: ${bulunan}/${numaralar.length} ünvan bulunup kaydedildi.${kayitHatasi ? ' Bazı ünvanlar kaydedilemedi.' : ''}${vknEksik ? ` ${vknEksik} UTTS kaydının vergi numarası kaynak dosyadan doğrulanamadı.` : ''}`)
    } catch (error) {
      if (aktifClientRef.current === hedefClientId) setUttsUnvanMesaj(`Ünvan sorgusu yapılamadı: ${error?.message || 'GİB bağlantı hatası'}`)
    } finally {
      numaralar.filter(vkn => !tamamlanan.has(vkn)).forEach(vkn => uttsSorgulananRef.current.delete(`${hedefClientId}:${vkn}`))
    }
  }

  const yukle = async (yilAy) => {
    if (!clientId) return
    const istek = ++listeIstekRef.current
    const yil = String(yilAy?.yil || disDonem?.yil || '')
    const ay = String(yilAy?.ay || disDonem?.ay || '')
    const donemQ = { yil, ay, hataFirlat: true }
    setYukleniyor(true)
    setListeHatasi('')
    try {
      let liste = await faturalariGetir(clientId, donemQ)
      if (istek !== listeIstekRef.current) return
      setFaturalar(liste)
      void uttsUnvanlariniSorgula(liste, clientId)
      // DB detayı olmayan fiş/Z raporu kayıtlarına sentetik detay ekle
      const birlestir = (h) => {
        if (istek !== listeIstekRef.current) return
        const b = { ...h }
        for (const f of liste) {
          const detay = fisKdvDetayUret(f)
          if (detay && !b[f.id]?.length) b[f.id] = detay
        }
        setKdvDetaylar(b)
      }
      await kdvDetaylariGetir(liste.map(f => f.id)).then(birlestir).catch(() => birlestir({}))
      if (istek !== listeIstekRef.current) return
      // Onarim (oturum basina musteri basina 1) — listeyi bekletmez
      if (!onarimYapilanClientlar.has(clientId)) {
        onarimYapilanClientlar.add(clientId)
        ;(async () => {
          let yenile = false
          try {
            const sonuc = await efaturaTutarlariOnar(clientId)
            yenile = sonuc?.duzeltilen > 0
          } catch { onarimYapilanClientlar.delete(clientId) }
          try {
            const sonuc = await efaturaKdvOranlariOnar(clientId)
            yenile = yenile || sonuc?.yazilan > 0
          } catch { onarimYapilanClientlar.delete(clientId) }
          if (!yenile || istek !== listeIstekRef.current) return
          try {
            const taze = await faturalariGetir(clientId, donemQ)
            const detaylar = await kdvDetaylariGetir(taze.map(f => f.id))
            if (istek !== listeIstekRef.current) return
            liste = taze
            setFaturalar(taze)
            birlestir(detaylar)
          } catch { onarimYapilanClientlar.delete(clientId) }
        })()
      }
    } catch {
      if (istek === listeIstekRef.current) {
        setFaturalar([])
        setListeHatasi('Fatura listesi yüklenemedi. Oturumunuzu ve bağlantınızı kontrol edip yenileyin.')
      }
    } finally {
      if (istek === listeIstekRef.current) setYukleniyor(false)
    }
  }

  // Donem degistikce (musteri/yil/ay) yeniden cek — ayni donem tekrar
  // cekilmez (musteri degisimi key remount ile zaten yeni bileSen acar)
  useEffect(() => {
    const anahtar = clientId + '|' + String(disDonem?.yil || '') + '|' + String(disDonem?.ay || '')
    if (sonCekilenRef.current === anahtar) return
    sonCekilenRef.current = anahtar
    yukle({ yil: disDonem?.yil, ay: disDonem?.ay })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, disDonem?.yil, disDonem?.ay])

  // 2.7.522: üst şeritteki "Sorgula ve Yükle" düğmesi burayı tetikler
  const disSiraRef = useRef(0)
  useEffect(() => {
    if (!disDonem) return
    // Müşteri/yıl/ay/belge seçimi her değiştiğinde liste filtresini eşitle —
    // yüklü faturalar sorgu yapmadan anında görünsün (sorgu yalnız sira ile).
    setSorguYili(String(disDonem.yil))
    setSorguAyi(String(disDonem.ay))
    setSorguTip(disDonem.tip || 'hepsi')
    if (!disDonem.sira || disDonem.sira === disSiraRef.current) return
    disSiraRef.current = disDonem.sira
    handleSorgula({ yil: disDonem.yil, ay: disDonem.ay, tip: disDonem.tip || 'hepsi' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disDonem?.yil, disDonem?.ay, disDonem?.tip, disDonem?.sira])

  // 2.7.541: Bolum 2 "Islemler" kartindan tetiklenen eylemler
  // (dosya yukleme penceresi / Excel'e aktar)
  const disEylemSiraRef = useRef(disEylem?.sira || 0)
  useEffect(() => {
    if (!disEylem || !disEylem.sira || disEylem.sira === disEylemSiraRef.current) return
    disEylemSiraRef.current = disEylem.sira
    if (disEylem.tur === 'dosya') dosyaInputRef.current?.click()
    else if (disEylem.tur === 'klasor') klasorInputRef.current?.click()
    else if (disEylem.tur === 'dokum-gumruk') gumrukInputRef.current?.click()
    else if (disEylem.tur === 'dokum-gider') giderInputRef.current?.click()
    else if (disEylem.tur === 'dokum-zraporu') zRaporuInputRef.current?.click()
    else if (disEylem.tur === 'excel') excelAktar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disEylem?.sira])

  // 2.7.541: gorunen listeyi Excel (CSV) olarak disa aktar — Excel dogrudan acar
  const excelAktar = () => {
    const satirlar = [['Tarih', 'Yön', 'Tür', 'Fatura Türü', 'Fatura No', 'Karşı Taraf', 'VKN', 'Matrah', 'KDV', 'Toplam']]
    gorunen.forEach(f => satirlar.push([
      f.tarih ? formatDateTR(f.tarih) : '',
      f.yon === 'giden' ? 'Kesilen' : 'Alınan',
      belgeTuruAdi(f),
      faturaTurEtiketi(f) || '',
      f.fatura_no || '',
      f.karsi_unvan || '',
      f.karsi_vkn || '',
      f.matrah != null ? Number(f.matrah) : '',
      f.kdv != null ? Number(f.kdv) : '',
      f.tutar != null ? Number(f.tutar) : ''
    ]))
    const csv = '\uFEFF' + satirlar.map(r => r.map(h => `"${String(h).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `Fatura_Listesi_${sorguYili}_${sorguAyi}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // 2.8.60: Filtrelenmiş listedeki tüm PDF/XML dosyalarını ZIP arşivine
  // paketler. Tek tek indirme yerine toplu arşiv isteyen kullanıcı için.
  // Dosyalar "Alinan"/"Kesilen" klasörlerine, tarih + fatura no ile yazılır.
  const zipIndir = async () => {
    if (zipDurum?.calisiyor) return
    const belgeler = gorunen.filter(f => f.pdf_url || f.xml_url)
    if (!belgeler.length) {
      setMesaj('ZIP arşivi için indirilebilir PDF/XML belgesi yok.')
      return
    }
    const isler = []
    for (const f of belgeler) {
      if (f.pdf_url) isler.push({ f, url: f.pdf_url, uzanti: 'pdf' })
      if (f.xml_url) isler.push({ f, url: f.xml_url, uzanti: (f.tur === 'utts' || f.tur === 'gumruk') ? 'xlsx' : 'xml' })
    }
    if (!window.confirm(`${belgeler.length} fatura için ${isler.length} dosya indirilip ZIP arşivi oluşturulacak. Devam edilsin mi?`)) return
    setZipDurum({ calisiyor: true, toplam: isler.length, tamamlanan: 0, hatalar: [], mesaj: 'ZIP arşivi hazırlanıyor…' })
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      const temiz = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 90)
      const kullanilan = new Set()
      const hazir = isler.map((is) => {
        const f = is.f
        const tarih = String(f.tarih || '').slice(0, 10) || 'tarihsiz'
        const taban = `${tarih}_${temiz(f.fatura_no) || temiz(f.fatura_uuid) || 'fatura'}`
        let ad = `${taban}.${is.uzanti}`
        let sayac = 2
        while (kullanilan.has(ad)) ad = `${taban}_${sayac++}.${is.uzanti}`
        kullanilan.add(ad)
        const klasor = f.yon === 'giden' ? 'Kesilen' : 'Alinan'
        return { ...is, yol: `${klasor}/${ad}` }
      })

      let sira = 0
      let tamamlanan = 0
      const hatalar = []
      const isci = async () => {
        while (sira < hazir.length) {
          const is = hazir[sira++]
          try {
            const yanit = await fetchDocument(is.url)
            if (!yanit.ok) throw new Error(`HTTP ${yanit.status}`)
            const blob = await yanit.blob()
            if (!blob.size) throw new Error('Boş dosya')
            zip.file(is.yol, blob)
            tamamlanan++
          } catch (e) {
            hatalar.push(`${is.yol}: ${e?.message || 'indirilemedi'}`)
          }
          setZipDurum({ calisiyor: true, toplam: hazir.length, tamamlanan, hatalar: [...hatalar], mesaj: 'Dosyalar indiriliyor…' })
        }
      }
      await Promise.all(Array.from({ length: Math.min(4, hazir.length) }, () => isci()))

      setZipDurum({ calisiyor: true, toplam: hazir.length, tamamlanan, hatalar: [...hatalar], mesaj: 'ZIP arşivi oluşturuluyor…' })
      const blob = await zip.generateAsync(
        { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } },
        (meta) => setZipDurum({ calisiyor: true, toplam: hazir.length, tamamlanan, hatalar: [...hatalar], mesaj: `ZIP arşivi oluşturuluyor… %${Math.round(meta.percent)}` })
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Fatura_Arsivi_${sorguYili}_${sorguAyi}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      setZipDurum({
        calisiyor: false,
        toplam: hazir.length,
        tamamlanan,
        hatalar,
        mesaj: `${tamamlanan} dosya ZIP arşivine eklendi.` + (hatalar.length ? ` ${hatalar.length} dosya indirilemedi.` : '')
      })
    } catch (e) {
      setZipDurum({ calisiyor: false, toplam: 0, tamamlanan: 0, hatalar: [], mesaj: 'ZIP hatası: ' + (e?.message || 'arşiv oluşturulamadı') })
    }
  }

  // 2.7.541: arama degisince 1. sayfaya don (liste uzunlugu degisimi asagida)


  // 2.7.400: kredi karti tahsilatini yukle (secili ay varsa)
  useEffect(() => {
    if (!clientId || !sorguYili || !sorguAyi) { setKrediKarti(null); return }
    let iptal = false
    setKrediKartiYukleniyor(true)
    krediKartiHasilatGetir({ clientId, yil: Number(sorguYili), ay: Number(sorguAyi) })
      .then(d => { if (!iptal) setKrediKarti(d) })
      .catch(() => { if (!iptal) setKrediKarti(null) })
      .finally(() => { if (!iptal) setKrediKartiYukleniyor(false) })
    return () => { iptal = true }
  }, [clientId, sorguYili, sorguAyi])

  // 2.7.400: kredi karti tahsilati DVS'den sorgula
  const krediKartiSorgula = async () => {
    if (!clientId || !sorguYili || !sorguAyi || krediKartiYukleniyor) return
    setKrediKartiYukleniyor(true)
    try {
      await dvsSorgula({ clientId, yil: Number(sorguYili), ay: Number(sorguAyi), tur: 'pos' })
      const d = await krediKartiHasilatGetir({ clientId, yil: Number(sorguYili), ay: Number(sorguAyi) })
      setKrediKarti(d)
    } catch (e) {
      alert(e.message || 'Kredi kartı sorgusu başarısız')
    } finally {
      setKrediKartiYukleniyor(false)
    }
  }

  // Admin (muhasebeci) tarafindan sorgulama: musteri portalindaki ayni servis.
  // Sonuc efatura_faturalar tablosuna yazilir -> iki taraf da gorur.
  // 2.7.461: UC ASAMALI akis (toplu sorgudakiyle ayni) —
  //   1) GIB->Luca: tum parçalar (7/30 gun secimi) art arda sorgulanip
  //      indirilir; MUBiS yuklemesi ve klasor kopyalamasi YOK
  //   2) MUBiS: indirilen TUM dosyalar tur+yon bazinda KOMPLE yuklenir
  //   3) Klasor: dosyalar musteri\yil\ay\GELEN|GIDEN klasorune toplu kopyalanir
  // 2.7.522: A düzeni — sorgu üst şeritten tetiklenir; yıl/ay/tip override
  // ile geçilir ki state gecikmesi olmasın.
  const handleSorgula = async (override = {}) => {
    if (!clientId || sorguluyor || sorguBaslangicRef.current !== null) return
    // 2.7.574: Sorgulamayi Durdur bayragi — her adim arasinda ve yardimci
    // GIB bekleme dongulerinde (is-durdur) kontrol edilir.
    durdurRef.current = false
    const sorguTipEff = override.tip || sorguTip
    sorguBaslangicRef.current = performance.now()
    setSorguSuresi(0)
    setSorguluyor(true)
    onSorguDurumDegis?.(true, handleSorguDurdur)
    const sorguYiliEff = override.yil != null ? String(override.yil) : sorguYili
    const sorguAyiEff = override.ay != null ? String(override.ay) : sorguAyi
    // 'Tümü': belge turlerini SIRAYLA sorgula (her tur alis + satis); tek tur
    // secildiyse sadece o. Kismi hata olsa bile diger turlere devam edilir.
    // 2.7.432: GIB kaynagi kaldirildi — tum sorgular Luca kanalindan gider.
    const turlar = sorguTipEff === 'hepsi'
      ? ['efatura', 'earsiv', 'esmm', 'utts']
      : ['zrapor', 'giderfisi'].includes(sorguTipEff) ? [] : [sorguTipEff]
    const turAdlari = { efatura: 'e-Fatura', earsiv: 'e-Arşiv', esmm: 'e-SMM', utts: 'UTTS' }
    // 7/30 günlük parçalama — yalnizca GIB->Luca sorgu adiminda uygulanir
    const donemParcalari = (yil, ay, gun = 7) => {
      const y = parseInt(yil, 10), a = parseInt(ay, 10)
      if (!(y >= 2000) || !(a >= 1 && a <= 12)) return null
      const iki = n => String(n).padStart(2, '0')
      const son = new Date(y, a, 0).getDate()
      const bugun = new Date()
      const bugunDD = (y === bugun.getFullYear() && a === bugun.getMonth() + 1) ? bugun.getDate() : null
      const dilimler = gun >= 30 ? [[1, son]] : [[1, 7], [8, 14], [15, 21], [22, 28], [29, 31]]
      const parc = []
      for (const [b, e] of dilimler) {
        if (b > son) break
        const bit = Math.min(e, son, bugunDD != null ? bugunDD : e)
        if (b > bit) continue
        parc.push({
          bas: `${iki(b)}/${iki(a)}/${y}`,
          bit: `${iki(bit)}/${iki(a)}/${y}`,
          etiket: `${iki(b)}.${iki(a)} - ${iki(bit)}.${iki(a)}`
        })
      }
      return parc.length ? parc : null
    }
    const gun = sorguPeriyod === '30gun' ? 30 : 7
    const parcalar = donemParcalari(sorguYiliEff, sorguAyiEff, gun) || [null]
    // "Alış (Alınan)"/"Satış (Kesilen)" filtresi seciliyse sorgu da yalniz o
    // yonde yapilir; diger turler (IADE, IHRACAT...) icin iki yon de taranir.
    const yonlar = yonFiltre === 'ALIS' ? ['alis']
      : yonFiltre === 'SATIS' ? ['satis']
      : ['alis', 'satis']
    // 2.7.462: her tur+yon icin SIRALI tam dongu —
    //   sorgula (tum periyotlar, sadeceSorgu) -> Luca'dan indir ->
    //   MUBiS'e yukle -> klasore kopyala; BITINCE siradaki tur+yon.
    // (Kullanici tercihi: "efatura alis sorgula -> gibden indir -> mubis,
    //  sonra efatura satis ayni sekilde... hepsi bu sekilde ilerlesin")
    // 2.7.485: 'eksik' seciliyse GİB sorgusu ATLANIR — Luca'daki hazir
    // faturalar dogrudan indirilip yuklenir; 'onarim' seciliyse tum
    // dosyalar yeniden islenir (oncekiSet/onarim).
    const eksikMod = sorguSecimi === 'eksik'
    const onarimMod = sorguSecimi === 'onarim'
    const toplamAdim = turlar.length * yonlar.length * ((eksikMod ? 1 : parcalar.length) + 3)
    let adim = 0
    let durdur = false
    let durdurNedeni = ''
    setMesaj('Faturalar sorgulaniyor (1/' + toplamAdim + '), birkac dakika surebilir.')
    try {
      const clientArg = { ...(client || {}), id: clientId, vkn: client?.vkn || client?.tc || '' }
      let toplam = 0
      const boslar = []
      const oncedenYukluler = []
      const hatalar = []
      const notlar = []
      const dokumler = await edefterDokumleriniYukle({
        client: clientArg, yil: sorguYiliEff, ay: sorguAyiEff,
        onDurum: metin => { if (!durdurRef.current) setMesaj(metin) }, iptalKontrol
      })
      toplam += dokumler.sayi
      notlar.push(...dokumler.notlar)
      hatalar.push(...dokumler.hatalar)
      for (const tur of turlar) {
        if (durdur || durdurRef.current) { durdur = true; break }
        // UTTS'te satis yok (yalniz SATIS secildiyse UTTS tamamen atlanir);
        // serbest meslek mükellefi olmayan firmanin e-SMM (Satış) sorgusu yok.
        const turYonleri = sorguYonleri(tur, yonlar, clientArg)
        for (const yon of turYonleri) {
          if (durdur || durdurRef.current) { durdur = true; break }
          const turAd = turAdlari[tur] || tur
          const yonEtiket = yon === 'alis' ? ' (Alış)' : ' (Satış)'
          const indirilenler = []
          const hataBaslangic = hatalar.length
          let zipYoluIle = false
          let indirmeKaynak = null
          let dosyaFotografi = null
          let sorguHatasi = false
          // 1a: tum periyotlar Luca'da SADECE SORGULANIR (GİB'den Getir,
          // indirme YOK; yardimci 'sona erdi' sinyalini bekler — 2.7.462).
          // 'Eksikleri tamamla' modunda bu adim atlanir (GIB sorgusu yapilmaz).
          for (const parca of (eksikMod ? [] : parcalar)) {
            adim++
            const parcaEtiket = parca ? ' (' + parca.etiket + ')' : ''
            const onEk = '(' + adim + '/' + toplamAdim + ') ' + turAd + yonEtiket + parcaEtiket + ': '
            try {
              await efaturaSorgula({
                client: clientArg,
                yil: sorguYiliEff,
                ay: sorguAyiEff || '',
                sorguTip: tur,
                yon,
                mod: sorguMod,
                baslangicTarih: parca?.bas,
                bitisTarih: parca?.bit,
                sadeceIndir: true,
                sadeceSorgu: true,
                iptalKontrol,
                onDurum: (d) => {
                  const metin = lucaDurumMetni(d)
                  if (metin && !durdurRef.current) setMesaj(onEk + metin)
                }
              })
            } catch (err) {
              if ((err.message || '').includes('KULLANICI_DURDURDU')) { durdur = true; break }
              if ((err.message || '').includes('mevcut-sorgu-devam-ediyor')) {
                hatalar.push(turAd + yonEtiket + parcaEtiket + ': Luca önceki sorgunun hâlâ sürdüğünü bildirdi; kalan aralıklar durduruldu.')
                durdur = true
                break
              }
              const msg = err.message || 'bilinmeyen hata'
              hatalar.push(turAd + yonEtiket + parcaEtiket + ': ' + msg)
              sorguHatasi = true
              if (/islem takibi suresinde tamamlanmadi/i.test(msg)) {
                durdurNedeni = 'Luca işlemi devam ediyor olabilir; kalan sorgular güvenlik için durduruldu.'
                durdur = true
              }
              break
            }
          }
          if (durdur || durdurRef.current) { durdur = true; break }
          if (sorguHatasi) continue
          // 1b: tum sorgular bitti — ayin TUM faturalari tek geciste indirilir
          adim++
          const onEkD = '(' + adim + '/' + toplamAdim + ') ' + turAd + yonEtiket + ': '
          try {
            const res = await efaturaSorgula({
              client: clientArg,
              yil: sorguYiliEff,
              ay: sorguAyiEff || '',
              sorguTip: tur,
              yon,
              mod: 'indir',
              sadeceIndir: true,
              iptalKontrol,
              onDurum: (d) => {
                const metin = lucaDurumMetni(d)
                if (metin && !durdurRef.current) setMesaj(onEkD + metin)
              }
            })
            if (res.zipYoluIle) zipYoluIle = true
            indirmeKaynak = res.yardimciKaynak
            dosyaFotografi = res.oncekiSet
            if (res.yerelYedek) notlar.push('Sunucu Luca bağlantısı başarısız oldu; işlem yerel yardımcıda çalıştı.')
            if (res.ok === false && res.not) hatalar.push(turAd + yonEtiket + ' indirme: ' + res.not)
            if (res.sayi > 0 && res.not) notlar.push(res.not)
            if (!(res.sayi > 0) && res.not && res.ok !== false) notlar.push(turAd + yonEtiket + ': ' + res.not)
            for (const d of (res.dosyalar || [])) {
              if (!indirilenler.some(x => x.ad === d.ad)) indirilenler.push(d)
            }
          } catch (err) {
            if ((err.message || '').includes('KULLANICI_DURDURDU')) { durdur = true }
            else if ((err.message || '').includes('mevcut-sorgu-devam-ediyor')) {
              hatalar.push(turAd + yonEtiket + ' indirme: Luca önceki sorgunun hâlâ sürdüğünü bildirdi; kalan işlemler durduruldu.')
              durdur = true
            } else {
              const msg = err.message || 'bilinmeyen hata'
              hatalar.push(turAd + yonEtiket + ' indirme: ' + msg)
              if (/islem takibi suresinde tamamlanmadi/i.test(msg)) {
                durdurNedeni = 'Luca işlemi devam ediyor olabilir; kalan sorgular güvenlik için durduruldu.'
                durdur = true
              }
            }
          }
          if (durdur || durdurRef.current) { durdur = true; break }
          // 2 + 3: MUBiS'e yukle, ardindan klasore kopyala (bu tur+yon bitmeden
          // siradaki tur+yon'a gecilmez)
          if (indirilenler.length) {
            const tabanlar = new Set(indirilenler.map(d => String(d.ad).replace(/\.(pdf|xml|xlsx|xls|html?)$/i, '').toLowerCase()))
            try {
              setMesaj(turAd + yonEtiket + ': İndirilen ' + indirilenler.length + ' dosya kontrol ediliyor...')
              const yuk = await dosyalariMubisYukle({
                client: clientArg,
                yardimciKaynak: indirmeKaynak,
                yil: sorguYiliEff,
                ay: sorguAyiEff || '',
                sorguTip: tur,
                yon,
                // Onarim: zaten yuklu faturalar da yeniden islenir
                oncekiSet: onarimMod ? new Set() : dosyaFotografi,
                zipYoluIle,
                ilgiliTabanlar: tabanlar,
                onarim: onarimMod,
                onDurum: () => {},
                onIlerleme: (p) => {
                  const metin = faturaIlerlemeMetni(p)
                  if (metin && !durdurRef.current) setMesaj(turAd + yonEtiket + ': ' + metin)
                }
              })
              if (yuk.ok === false) throw new Error(yuk.not || 'Faturalar MUBİS’e yüklenemedi.')
              toplam += yuk.sayi || 0
              const hataliDosyalar = (yuk.dosyalar || []).filter(d => d.hata)
              if (hataliDosyalar.length) hatalar.push(turAd + yonEtiket + ': ' + hataliDosyalar.length + ' dosya yüklenemedi (' + hataliDosyalar[0].hata + ')')
              if (!(yuk.sayi > 0) && hatalar.length === hataBaslangic) {
                // 2.8.346: "Belge bulunamadi" YANILTICI olabiliyordu — belgeler
                // indirildi fakat daha once MUBiS'e yuklendigi icin upsert
                // sayisi 0 cikiyor. Bu durumda "onceden yuklu" bilgisi verilir.
                const onceden = Number(yuk.atlandi || 0)
                if (onceden > 0 || indirilenler.length > 0) {
                  oncedenYukluler.push(turAd + yonEtiket + (onceden > 0 ? ` (${onceden} dosya önceden yüklü)` : ' (indirilen dosyalar zaten kayıtlı)'))
                } else {
                  boslar.push(turAd + yonEtiket + (yuk.not ? ' (' + yuk.not + ')' : ''))
                }
              }
              setMesaj(turAd + yonEtiket + ': klasörlere kopyalanıyor...')
              const kp = await edefterTopluKopyala({ client: clientArg, yardimciKaynak: indirmeKaynak, yil: sorguYiliEff, ay: sorguAyiEff, yon, dosyalar: faturaKopyalamaDosyalari(indirilenler, yuk.dosyalar) })
              if (kp?.atlandi) { if (!notlar.includes(kp.not)) notlar.push(kp.not) }
              else if (!kp?.ok) hatalar.push(turAd + yonEtiket + ' klasor kopyalama: ' + (kp?.error || 'basarisiz'))
            } catch (err) {
              hatalar.push(turAd + yonEtiket + ' yükleme: ' + (err.message || 'bilinmeyen hata'))
            }
          } else if (hatalar.length === hataBaslangic) {
            boslar.push(turAd + yonEtiket)
          }
        }
      }
      // Sorgu bitti — acik Luca oturumunu kapat (best-effort)
      if (turlar.length && !durdurNedeni && !durdur && !durdurRef.current) {
        try { await yardimciIsSunucu('luca-oturumu-kapat', {}, 10 * 60 * 1000, undefined, { yerelYedek: false }) } catch { /* yoksay */ }
      }
      const ozet = []
      if (toplam > 0) ozet.push(toplam + ' fatura indirildi ve kaydedildi (musteri portalinda da gorunur).')
      if (notlar.length) ozet.push(notlar.join(' '))
      if (oncedenYukluler.length) ozet.push('Yeni belge yok (önceden yüklü): ' + oncedenYukluler.join(', '))
      if (boslar.length) ozet.push('İndirilen belge yok: ' + boslar.join(', ') + ' (belge bulunmamış veya indirme tamamlanmamış olabilir).')
      if (durdur || durdurRef.current) { durdur = true; ozet.push(durdurNedeni || 'Sorgulama kullanıcı tarafından durduruldu — kalan tür/yonler atlandı.') }
      if (hatalar.length) ozet.push('Hatalar: ' + hatalar.join(' | '))
      setMesaj((durdur ? '⏹ ' : hatalar.length ? (toplam > 0 ? 'Kısmen tamamlandı: ' : '❌ ') : '✅ ') + (ozet.join(' ') || 'Sorgulama tamamlandi.'))
      await yukle()
    } catch (err) {
      const msg = err.message || 'Bilinmeyen hata'
      if (msg.includes('calismiyor')) {
        setMesaj('Yardimci program bu bilgisayarda calismiyor. Once MUBiS Yardimci Programini baslatin.')
      } else if (msg.includes('giris bilgisi yok')) {
        setMesaj('Sorgulama icin giris bilgisi yok: Ayarlar > Luca Baglanti bolumunden Luca kullanici kodu/sifresi girin.')
      } else {
        setMesaj('Sorgulama tamamlanamadi: ' + msg)
      }
    } finally {
      if (sorguBaslangicRef.current !== null) setSorguSuresi(Math.floor((performance.now() - sorguBaslangicRef.current) / 1000))
      sorguBaslangicRef.current = null
      setSorguluyor(false)
      onSorguDurumDegis?.(false)
    }
  }

  const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

  // Faturayı aç: önce resmî e-Belge HTML'i, sonra PDF; yalnızca XML varsa
  // ham XML yerine UBL'den okunabilir fatura HTML'i üretip açar.
  // UTTS kayıtları fiş modalında açılır.
  const faturaAc = async (f) => {
    if (fisKaydiMi(f) || f.tur === 'utts' || f.tur === 'gumruk') { setFisGoster({ ...f, kdvDetaylari: f.kdvDetaylari?.length ? f.kdvDetaylari : kdvDetaylar[f.id] || [] }); return }
    // Supabase Storage HTML'i text/plain olarak sunar (guvenlik politikasi);
    // metni cekip blob URL ile acarsak tarayici gercek HTML render eder.
    if (f.html_url) {
      try {
        setMesaj('Fatura hazırlanıyor...')
        const metin = await (await fetchDocument(f.html_url)).text()
        const blobUrl = URL.createObjectURL(new Blob([metin], { type: 'text/html;charset=utf-8' }))
        window.open(blobUrl, '_blank', 'noreferrer')
        setMesaj('')
      } catch {
        setMesaj('')
        openDocument(f.html_url)
      }
      return
    }
    // 2.7.241: once XML'e gomulu RESMI XSLT gorunumu (gondericinin/GIB
    // resmi fatura gorunumu) — varolan tasarim PDF'ler yerine orijinal acilir.
    if (f.xml_url && f.tur !== 'utts' && f.tur !== 'gumruk') {
      try {
        const metin2 = await (await fetchDocument(f.xml_url)).text()
        const resmi = gomuluXsltGorunumu(metin2)
        if (resmi) {
          window.open(URL.createObjectURL(new Blob([resmi], { type: 'text/html;charset=utf-8' })), '_blank', 'noreferrer')
          return
        }
      } catch { /* asagi dus */ }
    }
    if (f.pdf_url) { openDocument(f.pdf_url); return }
    if (f.xml_url) {
      if (f.tur !== 'utts') {
        try {
          setMesaj('Orijinal e-Belge (PDF/HTML) bulunamadı — MUBiS görünümü hazırlanıyor...')
          const metin = await (await fetchDocument(f.xml_url)).text()
          const ayik = ublAyikla(metin)
          ayik.uyari = 'Bu faturada orijinal e-Belge (PDF veya GİB e-Belge HTML) bulunamadı. Aşağıdaki görünüm MUBiS tarafından XML verisinden üretilmiştir — resmî belgenin birebir kopyası değildir.'
          const html = faturaHtmlOlustur(ayik)
          const objUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
          window.open(objUrl, '_blank', 'noreferrer')
          return
        } catch { /* okunamadıysa ham XML'e düşer */ }
      }
      setMesaj('')
      openDocument(f.xml_url)
    }
  }

  // 1. Aşama: dosya/klasör seçildi — hemen yükleme YAPILMAZ, onay bandında
  // "Yükle" butonu çıkar (yükleme yapıldı mı belli olsun diye).
  const dosyaSecildi = (e) => {
    // ÖNCE dosyalari gercek diziye kopyala — input.value='' FileList'i
    // bosaltir, canli referans uzerinden length okunursa 0 gelir ve
    // yukleme sessizce atlanir (hata belirtisi yok).
    const liste = Array.from(e.target.files || [])
    e.target.value = ''
    if (!liste.length || dosyaYukleniyor) return
    setBekleyenDosyalar(liste)
    setMesaj('')
  }

  // 2. Aşama: Yükle — ilerleme mesajlarıyla yükler, sonucu net bildirir.
  const yuklemeBaslat = async () => {
    if (!bekleyenDosyalar?.length || dosyaYukleniyor) return
    setDosyaYukleniyor(true)
    try {
      setMesaj(`Yükleniyor... (${bekleyenDosyalar.length} dosya hazırlanıyor)`)
      const sonuc = await manuelFaturaYukle({
        client: { ...(client || {}), id: clientId, vkn: client?.vkn || client?.tc || '' },
        yil: sorguYili || new Date().getFullYear(),
        dosyalar: bekleyenDosyalar,
        onDurum: setMesaj
      })
      if (sonuc.ok) {
        setMesaj(sonuc.sayi > 0
          ? `✅ Tamamlandı: ${sonuc.sayi} belge yüklendi ve listeye eklendi. ${sonuc.not || ''}`
          : `⚠️ ${sonuc.not || 'Yüklenecek belge bulunamadı.'}`)
        if (sonuc.sayi > 0) await yukle()
      } else {
        setMesaj('❌ Yükleme başarısız: ' + sonuc.not)
      }
    } catch (err) {
      setMesaj('❌ Yükleme hatası: ' + (err.message || err))
    } finally {
      setDosyaYukleniyor(false)
      setBekleyenDosyalar(null)
    }
  }

  // Tek tek + toplu silme
  const tekSil = async (e, f) => {
    e.stopPropagation()
    if (!confirm(`"${f.fatura_no || f.fatura_uuid}" kaydı silinsin mi?`)) return
    setSiliniyor(true)
    try {
      const sonuc = await faturalariSil([f.id])
      if (sonuc.ok) {
        setMesaj(`${sonuc.silinen} kayıt silindi.`)
        setSeciliIds(new Set())
        await yukle()
      } else setMesaj('Silme başarısız: ' + sonuc.not)
    } catch (err) {
      setMesaj('Silme hatası: ' + (err.message || err))
    } finally { setSiliniyor(false) }
  }

  const secilenleriSil = async () => {
    if (!seciliIds.size || siliniyor) return
    if (!confirm(`${seciliIds.size} kayıt silinsin mi? Bu işlem geri alınamaz.`)) return
    setSiliniyor(true)
    try {
      const sonuc = await faturalariSil([...seciliIds])
      if (sonuc.ok) {
        setMesaj(`${sonuc.silinen} kayıt silindi.`)
        setSeciliIds(new Set())
        await yukle()
      } else setMesaj('Silme başarısız: ' + sonuc.not)
    } catch (err) {
      setMesaj('Silme hatası: ' + (err.message || err))
    } finally { setSiliniyor(false) }
  }

  const secimDegistir = (e, id) => {
    e.stopPropagation()
    setSeciliIds(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  // 2.7.572: Araç KDV+ÖTV matraha ilave — seçili kayıtlarda KDV matraha
  // eklenir, KDV sütunu 0'a çekilir (KDV hesaplamasından çıkar)
  const [kdvEkleniyor, setKdvEkleniyor] = useState(false)
  const aracKdvIlave = async () => {
    if (!seciliIds.size || kdvEkleniyor) return
    if (!confirm(`${seciliIds.size} kayıtta KDV tutarı matraha ilave edilecek ve KDV sütunundan çıkarılacak (araç KDV+ÖTV). Onaylıyor musunuz?`)) return
    setKdvEkleniyor(true)
    try {
      const sonuc = await aracKdvMatrahaEkle([...seciliIds])
      if (sonuc.ok) {
        setMesaj(sonuc.not)
        setSeciliIds(new Set())
        await yukle()
      } else setMesaj('İşlem başarısız: ' + sonuc.not)
    } catch (err) {
      setMesaj('KDV matraha ilave hatası: ' + (err.message || err))
    } finally { setKdvEkleniyor(false) }
  }

  // Tarihi dolmamış indirmeler (XML metadata okunamadi) varsayilan yil/ay
  // filtresinde GIZLENMESIN — her zaman göster ("Tarihsiz" grubunda cizilir)
  // Belge türü seçimi (efatura/earsiv/esmm/utts) listeyi de filtreler;
  // "hepsi" (Tümü) tüm kayıtları gösterir.
  // 2.7.541: Bolum 1 "Ek Filtreler" (tarih araligi, belge no, tutar, VKN)
  const df = disFiltre || {}
  // Fiş kayıtları (Elle Ekle + döküm): Z RAPORU (kesilen), GİDER FİŞİ / GİDER DÖKÜMÜ (alınan)
  const fiTurNorm = (f) => String(f?.fatura_turu || '').toLocaleUpperCase('tr')
    .replace(/[İIı]/g, 'I').replace(/Ç/g, 'C').replace(/Ğ/g, 'G').replace(/Ö/g, 'O').replace(/Ş/g, 'S').replace(/Ü/g, 'U')
  const unvanliFaturalar = useMemo(() => uttsUnvanlariBirlestir(faturalar), [faturalar])
  const gorunen = unvanliFaturalar.filter(f => {
    const ft = fiTurNorm(f)
    const fisKayit = ft === 'Z RAPORU' || ft === 'GIDER FISI' || ft === 'GIDER DOKUMU'
    const turOk = sorguTip === 'hepsi'
      ? true
      : sorguTip === 'zrapor' ? ft === 'Z RAPORU'
      : sorguTip === 'giderfisi' ? (ft === 'GIDER FISI' || ft === 'GIDER DOKUMU')
      : (f.tur === sorguTip && !fisKayit)
    return turOk &&
    faturaTurEslesir(f, yonFiltre) &&
    (!belgeTurFiltre || faturaTurEslesir(f, belgeTurFiltre)) &&
    (!f.tarih ||
    ((!sorguYili || String(f.tarih).startsWith(String(sorguYili))) &&
    (!sorguAyi || String(f.tarih).substring(5, 7) === sorguAyi.padStart(2, '0')))) &&
    (!df.tarihBas || !f.tarih || String(f.tarih) >= df.tarihBas) &&
    (!df.tarihBit || !f.tarih || String(f.tarih) <= df.tarihBit) &&
    (!df.belgeNo || String(f.fatura_no || '').toLowerCase().includes(String(df.belgeNo).toLowerCase())) &&
    (!df.vkn || String(f.karsi_vkn || '').includes(String(df.vkn)) || String(f.karsi_unvan || '').toLowerCase().includes(String(df.vkn).toLowerCase())) &&
    (df.tutarMin == null || (Number(f.tutar) >= df.tutarMin)) &&
    (df.tutarMax == null || (Number(f.tutar) <= df.tutarMax))
  })

  // 2.7.541: tablo arama + sayfalama (sayfa basina 25)
  const arama = aramaMetni.trim().toLowerCase()
  const filtreliSonuc = arama
    ? gorunen.filter(f => [f.fatura_no, f.karsi_unvan, f.karsi_vkn, faturaTurEtiketi(f), f.tur].some(x => String(x || '').toLowerCase().includes(arama)))
    : gorunen
  const sayfaBasina = 25
  const toplamSayfa = Math.max(1, Math.ceil(filtreliSonuc.length / sayfaBasina))
  const sayfaGuvence = Math.min(sayfaNo, toplamSayfa)
  const kesit = filtreliSonuc.slice((sayfaGuvence - 1) * sayfaBasina, sayfaGuvence * sayfaBasina)

  // Filtrelenmiş listeye ait sütun toplamları (matrah/kdv/tutar) —
  // her filtre seçiminde (ay, tür, fatura türü) otomatik yeniden hesaplanır.
  // "Tümü" seçiliyken Alınan/Kesilen kırılımı da ayrı ayrı tutulur.
  const toplamlar = useMemo(() => {
    const hesap = (liste) => {
      let matrah = 0, kdv = 0, tutar = 0
      liste.forEach(f => {
        if (f.matrah != null && isFinite(Number(f.matrah))) matrah += Number(f.matrah)
        if (f.kdv != null && isFinite(Number(f.kdv))) kdv += Number(f.kdv)
        if (f.tutar != null && isFinite(Number(f.tutar))) tutar += Number(f.tutar)
      })
      return { matrah, kdv, tutar }
    }
    return {
      ...hesap(gorunen),
      alinan: hesap(gorunen.filter(f => f.yon !== 'giden')),
      kesilen: hesap(gorunen.filter(f => f.yon === 'giden'))
    }
  }, [gorunen])

  // 2.7.541: liste uzunlugu degistiginde (ay/tur/filtre degisimi) 1. sayfaya don
  useEffect(() => { setSayfaNo(1) }, [gorunen.length])

  if (!clientId) return null

  return (
    <div className="flex flex-col gap-6">
      {/* ============ BOLUM 3: SORGULAMA SONUCLARI ============ */}
      <div className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-5 border border-blue-800/30">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-7 h-7 shrink-0 rounded-full bg-yellow-500 text-blue-950 font-bold text-sm flex items-center justify-center">3</span>
          <div>
            <h3 className="text-base font-semibold text-white">Sorgulama Sonuçları</h3>
            <p className="text-xs text-gray-500">Seçilen kriterlere göre bulunan faturalar.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-blue-900/40 border border-blue-700/30 rounded-xl p-3.5">
            <span className="text-[11px] text-gray-400 flex items-center gap-1.5"><Receipt className="w-3.5 h-3.5 text-blue-400" /> Toplam Fatura</span>
            <div className="text-xl font-bold text-white mt-1">{gorunen.length}</div>
            <div className="text-[10px] text-gray-500">seçili dönem/tür</div>
          </div>
          <div className="bg-blue-900/40 border border-blue-700/30 rounded-xl p-3.5">
            <span className="text-[11px] text-gray-400 flex items-center gap-1.5"><Receipt className="w-3.5 h-3.5 text-yellow-400" /> Toplam Matrah</span>
            <div className="text-xl font-bold text-white mt-1">{toplamlar.matrah.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</div>
            <div className="text-[10px] text-gray-500">Alınan {toplamlar.alinan.matrah.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} · Kesilen {toplamlar.kesilen.matrah.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
          </div>
          <div className="bg-blue-900/40 border border-blue-700/30 rounded-xl p-3.5">
            <span className="text-[11px] text-gray-400 flex items-center gap-1.5"><Receipt className="w-3.5 h-3.5 text-green-400" /> Toplam KDV</span>
            <div className="text-xl font-bold text-white mt-1">{toplamlar.kdv.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</div>
            <div className="text-[10px] text-gray-500">Alınan {toplamlar.alinan.kdv.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} · Kesilen {toplamlar.kesilen.kdv.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
          </div>
          <div className="bg-blue-900/40 border border-blue-700/30 rounded-xl p-3.5">
            <span className="text-[11px] text-gray-400 flex items-center gap-1.5"><Receipt className="w-3.5 h-3.5 text-violet-400" /> Genel Toplam</span>
            <div className="text-xl font-bold text-white mt-1">{toplamlar.tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</div>
            <div className="text-[10px] text-gray-500">matrah + KDV</div>
          </div>
        </div>
        {/* Alınan / Kesilen / Kredi Kartı özet tablosu */}
        <div className="mt-4 bg-blue-900/20 border border-blue-800/30 rounded-lg px-4 py-2 text-sm overflow-x-auto">
          <table className="w-full min-w-[440px]">
            <thead>
              <tr className="text-xs text-gray-400">
                <th className="text-left font-medium py-1 pr-4"></th>
                <th className="text-right font-medium py-1 px-3">Matrah</th>
                <th className="text-right font-medium py-1 px-3">KDV</th>
                <th className="text-right font-medium py-1 pl-3">Toplam</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-1.5 pr-4 text-blue-300 whitespace-nowrap">Alınan ({gorunen.filter(f => f.yon !== 'giden').length} fatura)</td>
                <td className="py-1.5 px-3 text-right text-blue-100 whitespace-nowrap">{toplamlar.alinan.matrah.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                <td className="py-1.5 px-3 text-right text-blue-100 whitespace-nowrap">{toplamlar.alinan.kdv.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                <td className="py-1.5 pl-3 text-right text-blue-200 whitespace-nowrap">{toplamlar.alinan.tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-4 text-green-300 whitespace-nowrap">Kesilen ({gorunen.filter(f => f.yon === 'giden').length} fatura)</td>
                <td className="py-1.5 px-3 text-right text-green-100 whitespace-nowrap">{toplamlar.kesilen.matrah.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                <td className="py-1.5 px-3 text-right text-green-100 whitespace-nowrap">{toplamlar.kesilen.kdv.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                <td className="py-1.5 pl-3 text-right text-green-200 whitespace-nowrap">{toplamlar.kesilen.tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-4 text-yellow-300 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    Kredi Kartı Tahsilatı
                    <button
                      onClick={krediKartiSorgula}
                      disabled={krediKartiYukleniyor || !sorguAyi}
                      title="Dijital Vergi Dairesi'nden sorgula"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 disabled:opacity-50 text-[10px]"
                    >
                      {krediKartiYukleniyor ? <Loader2 className="w-3 h-3 animate-spin" /> : <CreditCard className="w-3 h-3" />}
                      Sorgula
                    </button>
                  </div>
                </td>
                <td className="py-1.5 px-3 text-right text-gray-400 whitespace-nowrap" colSpan={2}>Banka POS + Ödeme/e-Para</td>
                <td className="py-1.5 pl-3 text-right text-yellow-200 whitespace-nowrap">
                  {krediKartiYukleniyor ? '...' : (krediKarti ? krediKarti.toplam_tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : (sorguAyi ? '0,00' : '-'))} TL
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ============ BOLUM 4: FATURA LISTESI ============ */}
      <div className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-5 border border-blue-800/30">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 shrink-0 rounded-full bg-yellow-500 text-blue-950 font-bold text-sm flex items-center justify-center">4</span>
            <h3 className="text-base font-semibold text-white">
              Fatura Listesi
              <span className="text-sm text-gray-400 font-normal ml-2">({filtreliSonuc.length} kayıt)</span>
            </h3>
            {sorguluyor && (
              <span className="px-2.5 py-1.5 rounded-lg bg-yellow-500/15 border border-yellow-500/30 text-yellow-300 text-xs flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Sorgulanıyor...
              </span>
            )}
            {sorguSuresi !== null && (
              <span role="timer" aria-label="Sorgulama süresi" className="text-sm text-yellow-200 tabular-nums whitespace-nowrap">
                {sorguluyor ? 'Geçen süre' : 'Toplam süre'}: {sorguSureMetni}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={zipIndir}
              disabled={!!zipDurum?.calisiyor || filtreliSonuc.length === 0}
              title="Filtrelenmiş listedeki tüm PDF/XML dosyalarını ZIP olarak indir"
              className="px-2.5 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-xs flex items-center gap-1.5 hover:bg-cyan-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {zipDurum?.calisiyor ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
              ZIP İndir
            </button>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                value={aramaMetni}
                onChange={e => setAramaMetni(e.target.value)}
                placeholder="Tabloda ara: fatura no, ünvan, VKN..."
                className="bg-blue-900/40 border border-blue-700/40 rounded-lg pl-8 pr-3 py-1.5 text-xs text-gray-200 w-56 focus:outline-none focus:border-yellow-500/50"
              />
            </div>
            <button onClick={yukle} disabled={yukleniyor} className="p-1.5 bg-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/30 disabled:opacity-50" title="Yenile">
              <RefreshCw className={`w-4 h-4 ${yukleniyor ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      {/* LISTE ARAÇLARI: yükleme düğmeleri Bölüm 2 (İşlemler) kartına taşındı;
          burada yalnızca seçim silme kalır. Gizli dosya girişleri tetik için durur. */}
      <div className={`flex items-center gap-2 flex-wrap mb-4 ${seciliIds.size > 0 ? 'justify-end' : ''}`}>
        <input
          ref={gumrukInputRef}
          type="file"
          accept=".csv,.xls,.xlsx"
          className="hidden"
          onChange={e => dokumYukle(e.target.files?.[0], 'gumruk')}
        />
        <input
          ref={giderInputRef}
          type="file"
          accept=".csv,.xls,.xlsx"
          className="hidden"
          onChange={e => dokumYukle(e.target.files?.[0], 'gider')}
        />
        <input
          ref={zRaporuInputRef}
          type="file"
          accept=".csv,.xls,.xlsx"
          className="hidden"
          onChange={e => dokumYukle(e.target.files?.[0], 'zraporu')}
        />
        {seciliIds.size > 0 && (
          <>
            <button onClick={aracKdvIlave} disabled={kdvEkleniyor} className="px-3 py-1.5 bg-yellow-500/20 border border-yellow-500/40 rounded-lg text-yellow-300 text-xs flex items-center gap-1.5 disabled:opacity-50 hover:bg-yellow-500/30" title="Araç alımı: KDV+ÖTV tutarını matraha ekler, KDV sütunundan çıkarır ve KDV hesaplamasına dahil etmez">
              {kdvEkleniyor ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
              Araç KDV+ÖTV Matraha İlave ({seciliIds.size})
            </button>
            <button onClick={secilenleriSil} disabled={siliniyor} className="px-3 py-1.5 bg-red-500/20 border border-red-500/40 rounded-lg text-red-400 text-xs flex items-center gap-1.5 disabled:opacity-50 hover:bg-red-500/30" title="Seçili kayıtları sil">
              {siliniyor ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Sil ({seciliIds.size})
            </button>
          </>
        )}
      </div>
      {/* Excel/CSV döküm yükleme durumu */}
      {(dokumYukleniyor || dokumMesaj || dokumHata) && (
        <div className="flex flex-col gap-1.5 mb-4">
          {dokumYukleniyor && <div className="px-3 py-2 bg-blue-900/60 border border-blue-700/50 rounded-lg text-xs text-gray-300">Döküm işleniyor...</div>}
          {dokumMesaj && (
            <div className="px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-300 flex items-start justify-between gap-3">
              <span>{dokumMesaj}</span>
              <button onClick={() => setDokumMesaj('')}><X className="w-3.5 h-3.5 text-emerald-400/60 hover:text-emerald-300" /></button>
            </div>
          )}
          {dokumHata && (
            <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-300 flex items-start justify-between gap-3">
              <span>{dokumHata}</span>
              <button onClick={() => setDokumHata('')}><X className="w-3.5 h-3.5 text-red-400/60 hover:text-red-300" /></button>
            </div>
          )}
        </div>
      )}

      {/* Dosya seçildi → onay bandı (Yükle/İptal) */}
      {bekleyenDosyalar && !dosyaYukleniyor && (
        <div className="bg-yellow-500/10 border border-yellow-500/40 rounded-lg p-3 mb-3 flex flex-col md:flex-row md:items-center gap-2">
          <div className="text-xs text-yellow-300 flex-1 min-w-0">
            <span className="font-semibold">{bekleyenDosyalar.length} dosya seçildi:</span>
            <span className="text-yellow-200/70 truncate block md:inline md:ml-1">{bekleyenDosyalar.slice(0, 3).map(d => d.name).join(', ')}{bekleyenDosyalar.length > 3 ? ` +${bekleyenDosyalar.length - 3} daha` : ''}</span>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={yuklemeBaslat} className="px-4 py-1.5 bg-yellow-500 text-blue-950 rounded-lg text-xs font-bold hover:bg-yellow-400 flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" /> Yükle
            </button>
            <button onClick={() => setBekleyenDosyalar(null)} className="px-3 py-1.5 bg-blue-900/40 border border-blue-700/40 rounded-lg text-gray-300 text-xs hover:bg-blue-900/60">
              İptal
            </button>
          </div>
        </div>
      )}

      {/* Yükleme sürüyor → ilerleme bandı */}
      {dosyaYukleniyor && (
        <div className="bg-yellow-500/10 border border-yellow-500/40 rounded-lg p-3 mb-3 flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-yellow-400 animate-spin shrink-0" />
          <span className="text-xs text-yellow-300 font-medium">{mesaj || 'Yükleniyor...'}</span>
        </div>
      )}

      {mesaj && !dosyaYukleniyor && (
        <div className={`rounded-lg p-2.5 mb-3 text-xs flex items-center justify-between gap-2 ${sorguluyor ? 'bg-blue-500/10 border border-blue-500/30 text-blue-300' : mesaj.startsWith('Kısmen tamamlandı:') ? 'bg-amber-500/10 border border-amber-500/30 text-amber-300' : mesaj.startsWith('✅') ? 'bg-green-500/10 border border-green-500/30 text-green-300' : mesaj.startsWith('❌') || mesaj.startsWith('⏹') ? 'bg-red-500/10 border border-red-500/30 text-red-300' : 'bg-blue-900/20 border border-blue-700/30 text-gray-300'}`}>
          <span>{mesaj}</span>
          {/* 2.7.574: sorgulama sürerken Durdur */}
          {(sorguluyor || mesaj.includes('islem takibi suresinde tamamlanmadi')) && (
            <button onClick={handleSorguDurdur}
              className="shrink-0 px-2.5 py-1 rounded-lg bg-red-600/80 border border-red-500/50 text-white text-[11px] font-semibold hover:bg-red-600 flex items-center gap-1.5"
              title="Mevcut adım tamamlanınca sorgulamayı keser">
              <Square className="w-3 h-3" /> Durdur
            </button>
          )}
        </div>
      )}

      {zipDurum && (
        <div className={`rounded-lg p-2.5 mb-3 text-xs flex flex-col gap-1 ${zipDurum.calisiyor ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-200' : zipDurum.hatalar?.length ? 'bg-amber-500/10 border border-amber-500/30 text-amber-200' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'}`}>
          <div className="flex items-center gap-2">
            {zipDurum.calisiyor && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
            <span className="font-medium">{zipDurum.mesaj}</span>
            {zipDurum.toplam > 0 && <span className="text-gray-400">({zipDurum.tamamlanan}/{zipDurum.toplam} dosya)</span>}
            {!zipDurum.calisiyor && (
              <button onClick={() => setZipDurum(null)} className="ml-auto p-1 rounded hover:bg-white/10" title="Kapat"><X className="w-3.5 h-3.5" /></button>
            )}
          </div>
          {!zipDurum.calisiyor && zipDurum.hatalar?.length > 0 && (
            <details className="text-[11px] text-amber-300/90">
              <summary className="cursor-pointer">İndirilemeyen dosyalar ({zipDurum.hatalar.length})</summary>
              <div className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap">{zipDurum.hatalar.slice(0, 50).join('\n')}{zipDurum.hatalar.length > 50 ? `\n… +${zipDurum.hatalar.length - 50} daha` : ''}</div>
            </details>
          )}
        </div>
      )}

      {listeHatasi && (
        <div role="alert" className="rounded-lg p-2.5 mb-3 text-xs bg-red-500/10 border border-red-500/30 text-red-300">{listeHatasi}</div>
      )}
      {uttsUnvanMesaj && <p role="status" className="mb-3 text-xs text-gray-400">{uttsUnvanMesaj}</p>}

      {yukleniyor ? (
        <p className="text-gray-500 text-sm py-4 text-center">Faturalar yükleniyor...</p>
      ) : listeHatasi ? null : gorunen.length === 0 ? (
        <p className="text-gray-500 text-sm py-4 text-center">{faturalar.length ? 'Seçili filtrelere uyan fatura yok. Tür, yön ve diğer filtreleri kontrol edin.' : 'Seçili müşteri ve dönemde kayıtlı fatura bulunmuyor.'}</p>
      ) : filtreliSonuc.length === 0 ? (
        <p className="text-gray-500 text-sm py-4 text-center">Arama/filtre ölçütüne uyan fatura yok.</p>
      ) : (
        <>
        <div className="overflow-x-auto">
          {[
            { baslik: 'Gelen Faturalar (Alınan)', renk: 'text-blue-400', ogeler: kesit.filter(f => f.yon !== 'giden') },
            { baslik: 'Giden Faturalar (Kesilen)', renk: 'text-green-400', ogeler: kesit.filter(f => f.yon === 'giden') }
          ].filter(b => b.ogeler.length > 0).map(bolum => (
            <div key={bolum.baslik} className="mb-8">
              <h3 className={`text-sm font-semibold ${bolum.renk} mb-3 flex items-center gap-2`}>
                {bolum.baslik}
                <span className="text-gray-500 font-normal">({bolum.ogeler.length} fatura · Toplam: {bolum.ogeler.reduce((s, f) => s + (f.tutar != null && isFinite(Number(f.tutar)) ? Number(f.tutar) : 0), 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL)</span>
              </h3>
              {faturaGruplari(bolum.ogeler).map(grup => (
              <div key={grup.anahtar} className="mb-6">
                <h4 className="text-xs font-semibold text-yellow-400 mb-2">
                  {grup.ayAd ? `${grup.ayAd} ${grup.yil}` : 'Tarihsiz'}
                  <span className="ml-2 text-gray-500 font-normal">({grup.ogeler.length} fatura)</span>
                </h4>
              <FisDokumTablosu faturalar={grup.ogeler.filter(fisKaydiMi)} detaylar={kdvDetaylar} onAc={setFisGoster} seciliIds={seciliIds} onSec={secimDegistir} onTumunuSec={sec => setSeciliIds(prev => { const next = new Set(prev); grup.ogeler.filter(fisKaydiMi).forEach(fatura => sec ? next.add(fatura.id) : next.delete(fatura.id)); return next })} onSil={tekSil} siliniyor={siliniyor} />
              {grup.ogeler.some(fatura => !fisKaydiMi(fatura)) && <table className="w-full">
                <thead>
                  <tr className="text-left text-gray-400 text-xs border-b border-blue-800/30">
                    <th className="pb-2 w-8">
                      <input
                        type="checkbox"
                        checked={grup.ogeler.length > 0 && grup.ogeler.every(f => seciliIds.has(f.id))}
                        onChange={(e) => {
                          setSeciliIds(prev => {
                            const n = new Set(prev)
                            if (e.target.checked) grup.ogeler.forEach(f => n.add(f.id))
                            else grup.ogeler.forEach(f => n.delete(f.id))
                            return n
                          })
                        }}
                        className="accent-yellow-500 cursor-pointer"
                        title="Bu gruptaki tümünü seç/seçme"
                      />
                    </th>
                    <th className="pb-2">Tarih</th>
                    <th className="pb-2">Yön</th>
                    <th className="pb-2">Tür</th>
                    <th className="pb-2">Fatura Türü</th>
                    <th className="pb-2">Fatura No</th>
                    <th className="pb-2">Karşı Taraf</th>
                    <th className="pb-2 text-right">Matrah</th>
                    <th className="pb-2 text-right">KDV</th>
                    <th className="pb-2 text-right">Toplam</th>
                    <th className="pb-2">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {grup.ogeler.filter(fatura => !fisKaydiMi(fatura)).map(f => {
                    const gorunUrl = f.html_url || f.pdf_url || f.xml_url
                    return (
                    <Fragment key={f.id}>
                    {/* Coklu KDV: sadece parca satirlari — basinda onay kutusu, sonunda islemler */}
                    {(() => {
                      // 2.7.575: coklu KDV satirlari — gecersiz oranli detaylar atilir
                      const orans = gecerliOranlar(kdvDetaylar[f.id])
                      return orans.length > 1 ? kdvDetaylar[f.id].filter(d => (d?.oran != null && d.oran !== '' ? isFinite(Number(d.oran)) && Number(d.oran) >= 0 && Number(d.oran) <= 100 : (Number(d?.kdv) === 0 || d?.matrah != null))).map((d, detaySira) => (
                        <tr
                          key={`${f.id}-kdv-${d.oran}`}
                          onClick={() => { if (gorunUrl) faturaAc(f) }}
                          className="border-b border-blue-800/20 text-gray-300 text-sm cursor-pointer hover:bg-blue-900/20"
                          title={gorunUrl ? 'Faturayı açmak için tıklayın' : ''}
                        >
                          <td className="py-2" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={seciliIds.has(f.id)}
                              onChange={(e) => secimDegistir(e, f.id)}
                              className="accent-yellow-500 cursor-pointer"
                            />
                          </td>
                          <td className="py-2 whitespace-nowrap">{f.tarih ? formatDateTR(f.tarih) : '-'}</td>
                          <td className="py-2">
                            <span className={`px-2 py-0.5 rounded text-xs ${f.yon === 'giden' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                              {f.yon === 'giden' ? 'Kesilen' : 'Alınan'}
                            </span>
                          </td>
                          <td className="py-2 whitespace-nowrap">{belgeTuruAdi(f) || '-'}</td>
                          <td className="py-2 whitespace-nowrap">{faturaTurEtiketi(f) || '-'}</td>
                          <td className="py-2">{f.fatura_no || '-'}</td>
                          <td className="py-2 max-w-[200px] truncate" title={karsiTarafMetni(f, client)}>{karsiTarafMetni(f, client)}</td>
                          <td className="py-2 whitespace-nowrap text-right">{d.matrah != null ? (f.para_birimi && f.para_birimi !== 'TRY' && f.doviz_kur ? (Number(d.matrah) * Number(f.doviz_kur)).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : d.matrah.toLocaleString('tr-TR', { minimumFractionDigits: 2 })) : '-'}</td>
                          <td className="py-2 whitespace-nowrap">
                            {d.kdv != null ? (
                              <div className="flex items-center justify-between gap-2">
                                <span className="inline-flex items-center justify-center min-w-[2rem] bg-green-500/20 text-green-400 rounded-full px-1.5 py-0.5 text-xs font-medium text-center">{oranEtiket(d.oran != null ? d.oran : (Number(d?.kdv) === 0 ? 0 : null))}</span>
                                <span>{(f.para_birimi && f.para_birimi !== 'TRY' && f.doviz_kur ? (Number(d.kdv) * Number(f.doviz_kur)) : d.kdv).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                              </div>
                            ) : '-'}
                          </td>
                        <td className="py-2 whitespace-nowrap text-white font-medium text-right">
                          {(d.matrah != null && d.kdv != null) ? `${(f.para_birimi && f.para_birimi !== 'TRY' && f.doviz_kur ? ((Number(d.matrah) + Number(d.kdv)) * Number(f.doviz_kur)) : (d.matrah + d.kdv)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${(f.para_birimi && f.para_birimi !== 'TRY' && f.doviz_kur) ? 'TRY' : (f.para_birimi || 'TRY')}` : '-'}
                        </td>
                        <td className="py-2">
                          <div className="flex space-x-1.5">
                            {gorunUrl && (
                              <button onClick={(e) => { e.stopPropagation(); faturaAc(f) }} title={f.html_url ? 'Resmî e-Belge Görüntüle' : 'Faturayı Görüntüle'} className="p-1.5 bg-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/30">
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {f.pdf_url && !f.xml_url && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const ad = `${(f.fatura_uuid || 'fatura').replace(/[^\w-]/g, '_')}.pdf`
                                  dosyaIndir(f.pdf_url, ad)
                                }}
                                title="PDF İndir"
                                className="p-1.5 bg-purple-500/20 rounded-lg text-purple-400 hover:bg-purple-500/30"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {f.xml_url && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const ad = (f.tur === 'utts' || f.tur === 'gumruk')
                                    ? `${(f.fatura_uuid || 'rapor').replace(/[^\w-]/g, '_')}.xlsx`
                                    : `${(f.fatura_uuid || 'fatura').replace(/[^\w-]/g, '_')}.xml`
                                  dosyaIndir(f.xml_url, ad)
                                }}
                                title={f.tur === 'utts' || f.tur === 'gumruk' ? 'Excel İndir' : 'XML İndir'}
                                className="p-1.5 bg-green-500/20 rounded-lg text-green-400 hover:bg-green-500/30"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button onClick={(e) => tekSil(e, f)} disabled={siliniyor} title="Kaydı Sil" className="p-1.5 bg-red-500/20 rounded-lg text-red-400 hover:bg-red-500/30 disabled:opacity-50">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )) : (
                    <tr
                      onClick={() => { if (gorunUrl) faturaAc(f) }}
                      className={`border-b border-blue-800/20 text-gray-300 text-sm ${gorunUrl ? 'cursor-pointer hover:bg-blue-900/20' : ''}`}
                      title={gorunUrl ? 'Faturayı açmak için tıklayın' : ''}
                    >
                      <td className="py-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={seciliIds.has(f.id)}
                          onChange={(e) => secimDegistir(e, f.id)}
                          className="accent-yellow-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-2 whitespace-nowrap">{f.tarih ? formatDateTR(f.tarih) : '-'}</td>
                      <td className="py-2">
                        <span className={`px-2 py-0.5 rounded text-xs ${f.yon === 'giden' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                          {f.yon === 'giden' ? 'Kesilen' : 'Alınan'}
                        </span>
                      </td>
                      <td className="py-2 whitespace-nowrap">{belgeTuruAdi(f) || '-'}</td>
                      <td className="py-2 whitespace-nowrap">{faturaTurEtiketi(f) || '-'}</td>
                      <td className="py-2">{f.fatura_no || '-'}</td>
                      <td className="py-2 max-w-[200px] truncate" title={karsiTarafMetni(f, client)}>{karsiTarafMetni(f, client)}</td>
                      <td className="py-2 whitespace-nowrap text-right">{f.matrah != null ? (f.para_birimi && f.para_birimi !== 'TRY' && f.doviz_kur ? (Number(f.matrah) * Number(f.doviz_kur)).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : Number(f.matrah).toLocaleString('tr-TR', { minimumFractionDigits: 2 })) : '-'}</td>
                      <td className="py-2 whitespace-nowrap">
                        {f.kdv != null ? (
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1">
                              {(() => {
                                // 2.7.575: gecerli oran yoksa matrah+KDV'den hesaplanan yedek oran
                                const orans = gecerliOranlar(kdvDetaylar[f.id])
                                if (orans.length > 1) return orans.map(o => (
                                  <span key={o} className="inline-block bg-green-500/20 text-green-400 rounded-full px-1.5 py-0.5 text-xs font-medium">{oranEtiket(o)}</span>
                                ))
                                if (!orans.length && ['Z RAPORU', 'GİDER FİŞİ', 'GİDER DÖKÜMÜ'].includes(f.fatura_turu)) return <span className="text-amber-400 text-xs" title={f.fisDetayUyari || 'Kaynak belgeden KDV kırılımı doğrulanamadı.'}>Bilinmiyor</span>
                                if (!orans.length) { const yedek = hesaplaKdvOrani(f); if (yedek != null) return <span className="inline-flex items-center justify-center min-w-[2rem] bg-amber-500/20 text-amber-400 rounded-full px-1.5 py-0.5 text-xs font-medium text-center" title="KDV kırılımı XML'den doğrulanamadı; toplam tutardan oran tahmin edildi.">{oranEtiket(yedek)}</span>; if (f.xml_url) return <span className="text-amber-400 text-xs" title="KDV kırılımı XML kaynağından doğrulanamadı; toplam tutardan oran tahmin edilemedi.">Doğrulanmadı</span> }
                                const tek = orans.length === 1 ? orans[0] : hesaplaKdvOrani(f)
                                return tek != null ? (
                                  <span className="inline-flex items-center justify-center min-w-[2rem] bg-green-500/20 text-green-400 rounded-full px-1.5 py-0.5 text-xs font-medium text-center">{oranEtiket(tek)}</span>
                                ) : null
                              })()}
                            </span>
                            <span>{(f.para_birimi && f.para_birimi !== 'TRY' && f.doviz_kur ? (Number(f.kdv) * Number(f.doviz_kur)) : Number(f.kdv)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                          </div>
                        ) : '-'}
                      </td>
                      <td className="py-2 whitespace-nowrap text-white font-medium text-right">
                        {f.tutar != null ? (f.para_birimi && f.para_birimi !== 'TRY' && f.doviz_kur ? `${(Number(f.tutar) * Number(f.doviz_kur)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TRY` : `${Number(f.tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${f.para_birimi || 'TRY'}`) : '-'}
                      </td>
                      <td className="py-2">
                        <div className="flex space-x-1.5">
                          {gorunUrl && (
                            <button onClick={(e) => { e.stopPropagation(); faturaAc(f) }} title={f.html_url ? 'Resmî e-Belge Görüntüle' : 'Faturayı Görüntüle'} className="p-1.5 bg-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/30">
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {f.pdf_url && !f.xml_url && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                const ad = `${(f.fatura_uuid || 'fatura').replace(/[^\w-]/g, '_')}.pdf`
                                dosyaIndir(f.pdf_url, ad)
                              }}
                              title="PDF İndir"
                              className="p-1.5 bg-purple-500/20 rounded-lg text-purple-400 hover:bg-purple-500/30"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {f.xml_url && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                const ad = (f.tur === 'utts' || f.tur === 'gumruk')
                                  ? `${(f.fatura_uuid || 'rapor').replace(/[^\w-]/g, '_')}.xlsx`
                                  : `${(f.fatura_uuid || 'fatura').replace(/[^\w-]/g, '_')}.xml`
                                dosyaIndir(f.xml_url, ad)
                              }}
                              title={f.tur === 'utts' || f.tur === 'gumruk' ? 'Excel İndir' : 'XML İndir'}
                              className="p-1.5 bg-green-500/20 rounded-lg text-green-400 hover:bg-green-500/30"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button onClick={(e) => tekSil(e, f)} disabled={siliniyor} title="Kaydı Sil" className="p-1.5 bg-red-500/20 rounded-lg text-red-400 hover:bg-red-500/30 disabled:opacity-50">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    ) })()}
                    </Fragment>
                    )
                  })}
                </tbody>
              </table>}
              </div>
              ))}
            </div>
          ))}
        </div>
        {/* Sayfalama */}
        <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
          <span className="text-xs text-gray-500">
            {(sayfaGuvence - 1) * sayfaBasina + 1}-{Math.min(sayfaGuvence * sayfaBasina, filtreliSonuc.length)} / {filtreliSonuc.length} kayıt
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSayfaNo(Math.max(1, sayfaGuvence - 1))}
              disabled={sayfaGuvence <= 1}
              className="px-2.5 py-1 rounded-lg bg-blue-900/40 border border-blue-700/40 text-gray-300 text-xs disabled:opacity-40 hover:bg-blue-900/70"
            >
              ‹
            </button>
            {Array.from({ length: toplamSayfa }, (_, i) => i + 1).filter(s => s === 1 || s === toplamSayfa || Math.abs(s - sayfaGuvence) <= 2).map((s, i, arr) => (
              <Fragment key={s}>
                {i > 0 && arr[i - 1] !== s - 1 && <span className="px-1 text-gray-600 text-xs">…</span>}
                <button
                  onClick={() => setSayfaNo(s)}
                  className={`min-w-[28px] px-2 py-1 rounded-lg text-xs ${s === sayfaGuvence ? 'bg-yellow-500 text-blue-950 font-semibold' : 'bg-blue-900/40 border border-blue-700/40 text-gray-300 hover:bg-blue-900/70'}`}
                >
                  {s}
                </button>
              </Fragment>
            ))}
            <button
              onClick={() => setSayfaNo(Math.min(toplamSayfa, sayfaGuvence + 1))}
              disabled={sayfaGuvence >= toplamSayfa}
              className="px-2.5 py-1 rounded-lg bg-blue-900/40 border border-blue-700/40 text-gray-300 text-xs disabled:opacity-40 hover:bg-blue-900/70"
            >
              ›
            </button>
          </div>
        </div>
        </>
      )}

      {/* Gizli klasör/dosya seçim girişleri */}
      <input ref={klasorInputRef} type="file" multiple className="hidden" onChange={dosyaSecildi} {...{ webkitdirectory: '' }} />
      <input ref={dosyaInputRef} type="file" multiple accept=".zip,.xlsx,.xls,.pdf,.xml,.html,.htm" className="hidden" onChange={dosyaSecildi} />

      {/* UTTS fiş görüntüleyici */}
      {fisGoster && <FisModal f={fisGoster} onClose={() => setFisGoster(null)} />}
      </div>
    </div>
  )
}
