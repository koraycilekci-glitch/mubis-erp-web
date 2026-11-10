import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { Mic, Send, X, RotateCcw, Volume2, VolumeX, ChevronRight, Sparkles, MessageSquareText, Megaphone, Paperclip, Calendar, Reply, ArrowLeft, ExternalLink } from 'lucide-react'
import { getSettings } from '../services/settingsService'
import { konus, sesAyariCoz, VARSAYILAN_SES_AYARI } from '../utils/speechUtils'
import { resolveClientId } from '../utils/clientResolver'
import { buildClientAiContext } from '../utils/clientAiContext'
import { buildAdminAiContext } from '../utils/adminAiContext'
import { getMessages, markAllAsRead, replyFromClient } from '../services/messageService'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { asistanHitapAdi, asistanKarsilama } from '../utils/assistantGreeting'

const SES_CACHE_KEY = 'mubis_ai_voice_setting'

const SIK_SORULAR = [
  '2026 yılı KDV oranları nelerdir?',
  'SGK işe giriş bildirgesi nasıl verilir?',
  'Bağ-Kur primi ne kadar oldu?',
  'Vergi takviminde bugün hangi işlem var?',
  'e-Fatura başvurusu nasıl yapılır?'
]

// Giris yapmis musteriye kendi verileriyle ilgili oneriler
const MUSTERI_SORULARI = [
  'Bu ay toplam ne kadar ödeme yapacağım?',
  'Cari hesabımdaki bakiyem ne kadar?',
  'Bu ay tahsilat yapılacak çeklerim var mı?',
  'KDV ödemem ne kadar?',
  'SGK primim ne kadar, son ödeme günü ne zaman?',
  'Muhasebe ücreti borcum ne kadar?'
]

// Admin/personel icin mevzuat odakli oneriler
const PERSONEL_SORULARI = [
  'Bu ay tahsilat yapılacak çekleri listele',
  'Vadesi geçen alacağı olan carileri sayar mısın?',
  'KDV tevkifat oranları ve uygulanacağı işlemler nelerdir?',
  'Geçici vergi beyan ve ödeme süreleri nedir?',
  'Muhtasar ve prim hizmet beyannamesi hangi hallerde 3 aylık verilir?',
  'e-Defter berat yükleme süreleri nasıl hesaplanır?'
]

const MISAFIR_LIMIT = 10
const LIMIT_KEY = 'mubis_ai_guest_usage'

function bugununAnahtari() {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function misafirKullanim() {
  try {
    const raw = JSON.parse(localStorage.getItem(LIMIT_KEY) || '{}')
    if (raw.gun !== bugununAnahtari()) return 0
    return Number(raw.adet) || 0
  } catch {
    return 0
  }
}

function misafirKullanimArtir() {
  const yeni = misafirKullanim() + 1
  localStorage.setItem(LIMIT_KEY, JSON.stringify({ gun: bugununAnahtari(), adet: yeni }))
  return yeni
}

function saatBiçimi(d) {
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

// Markdown link [Ad](url) ve duz http adreslerini tiklanabilir hale getirir
const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"']+)/g

function MesajMetni({ text }) {
  const parcalar = []
  let son = 0
  let m
  LINK_RE.lastIndex = 0
  while ((m = LINK_RE.exec(text)) !== null) {
    if (m.index > son) parcalar.push(text.slice(son, m.index))
    const etiket = m[1] || m[3]
    const url = m[2] || m[3]
    parcalar.push(
      <a
        key={`${m.index}-${url}`}
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-blue-700 font-semibold underline decoration-blue-300 underline-offset-2 hover:text-blue-900 break-all"
      >
        {etiket}
        <ExternalLink className="w-3 h-3 flex-shrink-0" />
      </a>
    )
    son = m.index + m[0].length
  }
  if (son < text.length) parcalar.push(text.slice(son))
  return <>{parcalar}</>
}

export default function MubisAssistant() {
  const { user } = useAuth()
  // 2.7.575: personelMi ustte tanimli — asagida teblig rozet hesaplarinda kullaniliyor
  const personelMi = ['admin', 'super_admin', 'personel'].includes(user?.role)
  const [clientProfile, setClientProfile] = useState(null)
  const [acik, setAcik] = useState(false)
  const [balon, setBalon] = useState(false)
  const [sesli, setSesli] = useState(false)
  const [dinliyor, setDinliyor] = useState(false)
  const [yaziyor, setYaziyor] = useState(false)
  const [input, setInput] = useState('')
  const [okunmamis, setOkunmamis] = useState(0)

  // 2.7.542: Yonetici icin "yeni tebligat" bildirimi — son 2 gunde gelen
  // tebligatlar musteri bazinda gruplanir; kalem balonu uyarir, tiklayinca
  // panel acilir, oradan e-Tebligat sayfasina gidilir.
  const [tebligGruplar, setTebligGruplar] = useState([])
  const [tebligPanel, setTebligPanel] = useState(false)
  const [tebligDetay, setTebligDetay] = useState(null)
  const [musteriAdlari, setMusteriAdlari] = useState({})
  // 2.7.579: X ile kapatilan tebligatlar "goruldu" isaretlenir (localStorage'da
  // kalici). Ayni tebligat bir daha uyari vermez; yalnizca YENI gelen tebligat
  // (daha once gorulmemis belge) uyarıyı yeniden tetikler. Eskisi gibi zaman
  // karsilastirmasi yerine belge kimligi kullanilir — yenileme/oturum kapansa
  // bile uyari geri donmez.
  const TEKRIL_GORULEN_KEY = 'mubis_teblig_gorulen'
  const tebligSatirId = (s) => String(s.belge_no || s.file_url || (s.client_id || '') + '|' + (s.created_at || ''))
  const [tebligGorulen, setTebligGorulen] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(TEKRIL_GORULEN_KEY) || '[]')) } catch { return new Set() }
  })
  const tebligUyariKapat = () => {
    const tum = new Set(tebligGorulen)
    tebligGruplar.forEach(g => g.tebligatlar.forEach(s => tum.add(tebligSatirId(s))))
    musteriTebligatlar.forEach(s => tum.add(tebligSatirId(s)))
    try { localStorage.setItem(TEKRIL_GORULEN_KEY, JSON.stringify([...tum])) } catch { /* yoksay */ }
    setTebligGorulen(tum)
    setTebligPanel(false)
  }
  // 2.7.575: Musteri modu — yalnizca KENDINE gelen tebligatlar (admin verisi degil)
  const [musteriTebligatlar, setMusteriTebligatlar] = useState([])
  const musteriTebligYeni = musteriTebligatlar.filter(s => !tebligGorulen.has(tebligSatirId(s)))
  const musteriTebligAdet = musteriTebligYeni.length
  const tebligGorunurGruplar = tebligGruplar
    .map(g => {
      const yeni = g.tebligatlar.filter(s => !tebligGorulen.has(tebligSatirId(s)))
      return yeni.length ? { ...g, adet: yeni.length, tebligatlar: yeni } : null
    })
    .filter(Boolean)
  const tebligToplam = tebligGorunurGruplar.reduce((t, g) => t + g.adet, 0)
  // 2.7.575: rozet/balon/panelde kullanilacak adet — personel: tum musteriler,
  // musteri: yalnizca kendine gelenler
  const tebligUyariAdet = personelMi ? tebligToplam : musteriTebligAdet
  const tebligUyariVar = personelMi ? tebligGorunurGruplar.length > 0 : musteriTebligAdet > 0

  // 2.7.543: ustbardaki zil dugmesi paneli acar/kapatir; adet degisince zile haber verilir
  useEffect(() => {
    const toggle = () => { if (!acik) setTebligPanel(v => !v) }
    window.addEventListener('mubis-teblig-panel-toggle', toggle)
    return () => window.removeEventListener('mubis-teblig-panel-toggle', toggle)
  }, [acik])
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('mubis-teblig-adet', { detail: tebligToplam }))
  }, [tebligToplam])
  const [mesajlar, setMesajlar] = useState([])
  const karsilama = asistanKarsilama(clientProfile, user)
  const [sesAyari, setSesAyari] = useState(() => {
    try {
      const raw = localStorage.getItem(SES_CACHE_KEY)
      return raw ? { ...VARSAYILAN_SES_AYARI, ...JSON.parse(raw) } : VARSAYILAN_SES_AYARI
    } catch {
      return VARSAYILAN_SES_AYARI
    }
  })

  // Admin ayarlarindaki ses tercihini yukle (erisilemezse yerel onbellek kullanilir)
  useEffect(() => {
    let iptal = false
    getSettings()
      .then(s => {
        if (iptal) return
        const ayar = sesAyariCoz(s)
        setSesAyari(ayar)
        try { localStorage.setItem(SES_CACHE_KEY, JSON.stringify(ayar)) } catch { /* yoksay */ }
      })
      .catch(() => { /* misafir kullanicida erisim olmayabilir */ })
    return () => { iptal = true }
  }, [])

  const listeRef = useRef(null)
  const inputRef = useRef(null)
  const recognitionRef = useRef(null)

  const misafir = !user

  // Admin/personel asistandan mevzuat destegi alir; musteriye ozel
  // mali ozet, mali musavir mesajlasmasi ve kisisel oneriler gosterilmez.
  // 2.7.575: personelMi tanimi bilesenin en basina tasindi (TDZ duzeltmesi).

  // ── Mali musavir mesajlari ──
  const navigate = useNavigate()
  const [clientId, setClientId] = useState(null)
  const [adminMesajlari, setAdminMesajlari] = useState([])
  const [musavireYaz, setMusavireYaz] = useState(false)
  const [replyToId, setReplyToId] = useState(null)
  const [mesajUyari, setMesajUyari] = useState(null) // yeni gelen admin mesaji popup'i
  const okunanIdler = useRef(new Set())

  useEffect(() => {
    if (!user || personelMi) { setClientId(null); return }
    let iptal = false
    resolveClientId(user).then(id => { if (!iptal) setClientId(id) }).catch(() => {})
    return () => { iptal = true }
  }, [user, personelMi])

  // 2.7.542: Tebligat bildirimi verisi — yonetici/personel: tum musteriler;
  // 2.7.575: musteri ise YALNIZCA kendine gelen tebligatlar; 60 sn'de bir tazelenir
  // 2.7.622: "son 2 gunde gelen" artık belgenin GERCEK tebligat tarihine gore
  // hesaplanir. Daha once created_at (yukleme zamani) kullaniliyordu; toplu
  // tebligat sorgusu arsivdeki eski belgeleri (2023-2024) de tabloya ilk kez
  // yazdigi icin hepsi "yeni" sayiliyor ve her giriste 999 tebligat uyarisi
  // cikiyordu. DB penceresi 7 gun (son yuklemeler), tarayici tarafinda teblig
  // tarihi 2 gun filtresi uygulanir.
  useEffect(() => {
    if (!personelMi && !clientId) return
    let canli = true
    const tarihCoz = (metin) => {
      if (!metin) return null
      const s = String(metin).trim()
      let m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
      if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))
      m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (m) return new Date(+m[1], +m[2] - 1, +m[3])
      const d = new Date(s)
      return isNaN(d.getTime()) ? null : d
    }
    const yukle = async () => {
      try {
        const yediGunOnce = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        let q = supabase
          .from('etebligatlar')
          .select('client_id, belge_no, teblig_tarihi, gonderme_tarihi, kurum, file_url, created_at')
          .gte('created_at', yediGunOnce)
        if (!personelMi) q = q.eq('client_id', clientId)
        const { data, error } = await q.order('created_at', { ascending: false })
        if (error) throw error
        if (!canli) return
        // Gercek teblig tarihi son 2 gun icinde olanlar (arsiv yuklemleri haric)
        const ikiGunOnceMs = Date.now() - 2 * 24 * 60 * 60 * 1000
        const son2Gun = (data || []).filter(s => {
          const t = tarihCoz(s.teblig_tarihi) || tarihCoz(s.gonderme_tarihi)
          return t ? t.getTime() >= ikiGunOnceMs : false
        })
        if (!personelMi) { setMusteriTebligatlar(son2Gun); return }
        const harita = new Map()
        for (const s of son2Gun) {
          const k = String(s.client_id)
          if (!harita.has(k)) harita.set(k, { clientId: s.client_id, adet: 0, tebligatlar: [] })
          const g = harita.get(k)
          g.adet++
          g.tebligatlar.push(s)
        }
        setTebligGruplar([...harita.values()].sort((a, b) => b.adet - a.adet))
      } catch { /* tablo yoksa sessiz gec */ }
    }
    yukle()
    const timer = setInterval(yukle, 60000)
    return () => { canli = false; clearInterval(timer) }
  }, [personelMi, clientId])

  // Musteri adlarini tek istekte getir (liste gorselinde gosterilir)
  useEffect(() => {
    const idler = [...new Set(tebligGruplar.map(g => String(g.clientId)))]
    if (!idler.length) { setMusteriAdlari({}); return }
    let canli = true
    supabase.from('clients').select('id, name, short_name').in('id', idler)
      .then(({ data }) => {
        if (!canli || !data) return
        const m = {}
        for (const c of data) m[String(c.id)] = c.name || c.short_name || ''
        setMusteriAdlari(m)
      }).catch(() => {})
    return () => { canli = false }
  }, [tebligGruplar])

  useEffect(() => {
    if (!clientId) {
      setClientProfile(null)
      return
    }

    let iptal = false
    supabase
      .from('clients')
      .select('name, short_name, company, phonenumbers')
      .eq('id', clientId)
      .maybeSingle()
      .then(({ data }) => {
        if (!iptal) setClientProfile(data || null)
      })
      .catch(() => {})

    return () => { iptal = true }
  }, [clientId])

  const mesajlariYukle = useCallback(async (sessiz = true) => {
    if (!clientId) return
    const data = await getMessages(clientId)
    // Asistan yalnizca okunmamis admin mesajlarini gosterir; okunan/cevaplanan
    // mesajlar ve musterinin kendi gonderdikleri buradan kalkar,
    // "Mesajlarim" sekmesinde arsiv olarak kalir.
    // Pencere acikken okunurken aninda kaybolmasinlar diye ekranda olanlar korunur,
    // pencere kapaninca temizlenir.
    setAdminMesajlari(prev => {
      if (!acik) return data.filter(m => m.sender === 'admin' && !m.is_read)
      const gorunenAdminIdler = new Set(prev.filter(m => m.sender === 'admin').map(m => m.id))
      return data.filter(m => m.sender === 'admin' && (!m.is_read || gorunenAdminIdler.has(m.id)))
    })

    // Rozeti her yuklemede veritabanindaki gercek okunmamis sayisina esitle
    const gercekOkunmamis = data.filter(m => m.sender === 'admin' && !m.is_read)
    setOkunmamis(gercekOkunmamis.length)

    // Yalnizca bu oturumda ilk kez gorulen mesajlar icin uyar
    const yeniOkunmamis = gercekOkunmamis.filter(m => !okunanIdler.current.has(m.id))
    if (yeniOkunmamis.length > 0 && sessiz) {
      setBalon(true)
      setTimeout(() => setBalon(false), 8000)
      yeniOkunmamis.forEach(m => okunanIdler.current.add(m.id))
      // Son gelen mesaji uyari penceresinde goster
      setMesajUyari(yeniOkunmamis[yeniOkunmamis.length - 1])
    }
  }, [clientId, acik])

  // Uyari penceresi 20 sn sonra kendiliginden kapansin
  useEffect(() => {
    if (!mesajUyari) return
    const t = setTimeout(() => setMesajUyari(null), 20000)
    return () => clearTimeout(t)
  }, [mesajUyari])

  // Asistan acilinca uyari penceresini kapat
  useEffect(() => {
    if (acik) setMesajUyari(null)
  }, [acik])

  useEffect(() => {
    if (!clientId) return
    mesajlariYukle()
    const t = setInterval(() => mesajlariYukle(), 60000)
    return () => clearInterval(t)
  }, [clientId, mesajlariYukle])

  // Pencere acilinca admin mesajlarini okundu isaretle ve sesli oku
  useEffect(() => {
    if (!acik || !clientId) return
    const okunmamisAdmin = adminMesajlari.filter(m => m.sender === 'admin' && !m.is_read)
    if (okunmamisAdmin.length === 0) return
    const sonu = okunmamisAdmin[okunmamisAdmin.length - 1]
    if (sesli && sonu?.assistant_message) konus(sonu.assistant_message, sesAyari)
    markAllAsRead(clientId, 'admin').then(() => {
      setAdminMesajlari(prev => prev.map(m => m.sender === 'admin' ? { ...m, is_read: true } : m))
      setOkunmamis(0)
    })
  }, [acik, clientId, adminMesajlari, sesli, sesAyari])

  // Pencere kapaninca okunmus admin mesajlarini listeden temizle
  useEffect(() => {
    if (!acik) setAdminMesajlari(prev => prev.filter(m => m.sender === 'admin' && !m.is_read))
  }, [acik])

  const musavireGonder = useCallback(async (metin) => {
    const soru = (metin ?? input).trim()
    if (!soru || !clientId) return
    setInput('')
    try {
      await replyFromClient({ clientId, message: soru, clientName: user?.name || clientProfile?.name || '', parentId: replyToId })
      await markAllAsRead(clientId, 'admin')
      // Cevaplanan/okunan mesajlar ve musterinin kendi mesajlari asistandan hemen kaldirilir
      setAdminMesajlari(prev => prev.filter(m => m.sender === 'admin' && !m.is_read))
      setOkunmamis(0)
      await mesajlariYukle(false)
      setMesajlar(prev => [...prev, {
        role: 'assistant',
        content: 'Mesajınız mali müşavirinize iletildi. En kısa sürede size dönüş yapılacaktır.',
        ts: new Date()
      }])
    } catch (e) {
      setMesajlar(prev => [...prev, {
        role: 'assistant',
        content: 'Mesajınız gönderilemedi: ' + e.message,
        ts: new Date()
      }])
    } finally {
      setMusavireYaz(false)
      setReplyToId(null)
    }
  }, [input, clientId, user, clientProfile, replyToId, mesajlariYukle])

  function handleSend() {
    const metin = input.trim()
    if (!metin || yaziyor) return
    if (musavireYaz && clientId) {
      musavireGonder(metin)
    } else {
      gonder(metin)
    }
  }

  const aksiyonaGit = useCallback((url) => {
    if (!url) return
    setAcik(false)
    navigate(url)
  }, [navigate])

  useEffect(() => {
    if (listeRef.current) {
      listeRef.current.scrollTop = listeRef.current.scrollHeight
    }
  }, [mesajlar, yaziyor])

  useEffect(() => {
    if (acik) {
      setOkunmamis(0)
      setMesajlar([{ role: 'assistant', content: karsilama, ts: new Date() }])
      setInput('')
      setMusavireYaz(false)
      setTimeout(() => inputRef.current?.focus(), 200)
    }
  }, [acik, karsilama])

  // Ilk ziyarette dikkat cekmek icin balon
  useEffect(() => {
    if (sessionStorage.getItem('mubis_ai_greeted')) return
    const t = setTimeout(() => {
      setBalon(true)
      setOkunmamis(1)
      sessionStorage.setItem('mubis_ai_greeted', '1')
      setTimeout(() => setBalon(false), 6000)
    }, 3500)
    return () => clearTimeout(t)
  }, [])

  function seslendir(metin) {
    if (!sesli) return
    // Linkleri okumasin: [Ad](url) -> Ad, ciplak url -> kaldir
    const temiz = String(metin || '')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
      .replace(/https?:\/\/[^\s]+/g, '')
    konus(temiz, sesAyari)
  }

  const gonder = useCallback(async (metin) => {
    const soru = (metin ?? input).trim()
    if (!soru || yaziyor) return
    if (misafir && misafirKullanim() >= MISAFIR_LIMIT) {
      setMesajlar(prev => [...prev, {
        role: 'assistant',
        content: `Günlük ${MISAFIR_LIMIT} soru hakkınız doldu. Sınırsız soru sormak ve kendi vergi/SGK verilerinize ulaşmak için MUBİS hesabınızla giriş yapabilirsiniz.`,
        ts: new Date()
      }])
      return
    }

    setInput('')
    setYaziyor(true)
    const yeniMesajlar = [...mesajlar, { role: 'user', content: soru, ts: new Date() }]
    setMesajlar(yeniMesajlar)

    try {
      let kisisel = ''
      if (clientId) {
        const ozet = await buildClientAiContext(clientId).catch(e => {
          console.warn('Kisisel AI ozeti olusturulamadi:', e)
          return ''
        })
        kisisel = ozet
          ? `\n\nKULLANICININ MUBIS VERILERI:\n${ozet}`
          : '\n\nMÜŞTERİNİN GÜNCEL MALİ VERİLERİ ALINAMADI. Kişisel ödeme veya borç tutarlarını tahmin etme; verilere şu anda erişilemediğini belirt.'
      }

      // Admin/personel musteri+evrak sorgusu yapıyorsa baglam uret
      let adminCtx = ''
      if (personelMi) {
        try {
          adminCtx = await buildAdminAiContext(user, soru)
        } catch (e) {
          console.warn('Admin AI baglami olusturulamadi:', e)
        }
      }

      // Admin/personel meslek mensubudur: teknik ve mevzuat odakli cevap ister
      const rolNotu = personelMi
        ? '\n\nNOT: Bu kullanici mali musavir ofisinde calisan bir meslek mensubudur. ' +
          'Cevaplarini mevzuat odakli ver; ilgili kanun, madde, teblig ve sirku numaralarini belirt. ' +
          'Kisisel borc/odeme bilgisi verme, musteriye yonelik basitlestirilmis anlatim kullanma.' +
          (adminCtx ? '\n\nEger asagida YONETICI TALEBI varsa, o musteri ve evrak bilgilerini kullan.' : '')
        : ''

      const resp = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: yeniMesajlar
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({ role: m.role, content: m.content })),
          context: user
            ? `Kullanici: ${asistanHitapAdi(clientProfile, user) || user.username}, rol: ${user.role}${kisisel}${adminCtx ? '\n\n' + adminCtx : ''}${rolNotu}`
            : ''
        })
      })
      const data = await resp.json()
      const cevap = data.reply || 'Şu anda cevap veremiyorum, lütfen biraz sonra tekrar deneyin.'
      setMesajlar(prev => [...prev, { role: 'assistant', content: cevap, ts: new Date() }])
      if (misafir) misafirKullanimArtir()
      seslendir(cevap)
    } catch (err) {
      console.error('AI asistan hatasi', err)
      setMesajlar(prev => [...prev, {
        role: 'assistant',
        content: 'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.',
        ts: new Date()
      }])
    } finally {
      setYaziyor(false)
    }
  }, [input, mesajlar, misafir, user, yaziyor, clientId, personelMi])

  function mikrofon() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      alert('Tarayıcınız sesli girişi desteklemiyor. Chrome veya Edge deneyebilirsiniz.')
      return
    }
    if (dinliyor) {
      recognitionRef.current?.stop()
      setDinliyor(false)
      return
    }
    const rec = new SR()
    rec.lang = 'tr-TR'
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.onresult = (e) => {
      const metin = e.results[0][0].transcript
      setInput(metin)
      setTimeout(() => gonder(metin), 250)
    }
    rec.onerror = () => setDinliyor(false)
    rec.onend = () => setDinliyor(false)
    recognitionRef.current = rec
    setDinliyor(true)
    rec.start()
  }

  const sifirla = () => {
    window.speechSynthesis?.cancel()
    setMesajlar([{ role: 'assistant', content: karsilama, ts: new Date() }])
    setInput('')
  }

  const kapat = () => {
    window.speechSynthesis?.cancel()
    setAcik(false)
  }

  return (
    <>
      {/* Yeni mesaj uyari penceresi */}
      {mesajUyari && !acik && (
        <div className="fixed bottom-[110px] md:bottom-32 right-4 md:right-6 z-[65] w-[calc(100vw-2rem)] max-w-[340px] bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.35)] border border-blue-100 overflow-hidden animate-fade-in-up">
          <div className={`px-4 py-2.5 flex items-center justify-between ${
            mesajUyari.priority === 'acil' ? 'bg-gradient-to-r from-red-600 to-red-700'
            : mesajUyari.priority === 'onemli' ? 'bg-gradient-to-r from-amber-500 to-amber-600'
            : 'bg-gradient-to-r from-blue-700 to-blue-800'
          }`}>
            <div className="flex items-center gap-2 text-white text-sm font-bold">
              <Megaphone className="w-4 h-4" />
              {mesajUyari.priority === 'acil' ? 'Acil Mesajınız Var' : 'Yeni Mesajınız Var'}
            </div>
            <button onClick={() => setMesajUyari(null)} className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-4 py-3">
            <p className="text-[11px] text-gray-500 mb-1">
              {mesajUyari.sender_name ? `${mesajUyari.sender_name} (SMMM)` : 'Mali Müşaviriniz'}
              {' · '}
              {new Date(mesajUyari.created_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </p>
            <p className="text-sm text-blue-950 leading-snug line-clamp-3">
              {mesajUyari.assistant_message || mesajUyari.message}
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { setAcik(true); setMesajUyari(null) }}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
              >
                Oku / Cevapla
              </button>
              <button
                onClick={() => setMesajUyari(null)}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-semibold rounded-lg transition-colors"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2.7.542: Tebligat bildirim paneli — 3. resimdeki tasarim.
          Top balona tiklaninca acilir; satirdaki dugme e-Tebligat sayfasina goturur. */}
      {tebligPanel && !acik && !personelMi && (
        /* 2.7.575: Musteri paneli — yalnizca KENDINE gelen tebligatlar */
        <div className="fixed bottom-[112px] md:bottom-[118px] right-4 md:right-6 z-[65] w-[calc(100vw-2rem)] max-w-[430px] bg-blue-950/95 backdrop-blur-md border border-amber-500/40 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden animate-fade-in-up">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-blue-800/50 bg-amber-500/5">
            <div className="flex-1 min-w-0">
              <h2 className="text-white font-semibold text-sm leading-tight">Gelen e-Tebligatlarınız</h2>
              <p className="text-amber-300/80 text-xs">Son 2 günde size {musteriTebligAdet} yeni tebligat geldi</p>
            </div>
            <button
              type="button"
              onClick={() => { setTebligPanel(false); navigate('/portal?tab=tebligatlarim') }}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500/90 hover:bg-amber-400 text-blue-950 text-xs font-bold transition"
            >
              e-Tebligatlarım
            </button>
            <button
              type="button"
              onClick={tebligUyariKapat}
              aria-label="Uyariyi kapat"
              title="Kapat (yeni tebligat gelene kadar uyarı gösterilmez)"
              className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="divide-y divide-blue-800/40 max-h-72 overflow-y-auto">
            {musteriTebligYeni.length === 0 && (
              <div className="px-4 py-6 text-center text-gray-400 text-sm">Son 2 günde yeni tebligatınız yok.</div>
            )}
            {musteriTebligYeni.map((s, si) => (
              <div key={(s.belge_no || '') + si} className="px-4 py-2.5 flex flex-wrap items-center gap-2.5">
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold shrink-0">{s.teblig_tarihi || s.gonderme_tarihi || '—'}</span>
                <span className="text-white text-sm font-medium flex-1 min-w-[130px] truncate" title={s.kurum || ''}>{s.kurum || 'Kurum belirtilmemiş'}</span>
                {s.file_url
                  ? <span className="text-green-400 text-xs shrink-0">PDF hazır</span>
                  : <span className="text-gray-500 text-xs shrink-0">PDF indirilmedi</span>}
              </div>
            ))}
          </div>
          <div className="px-4 py-2 border-t border-blue-800/50 flex justify-end">
            <button
              type="button"
              onClick={() => { setTebligPanel(false); setAcik(true) }}
              className="text-[11px] text-gray-400 hover:text-white transition"
            >
              Sohbete geç
            </button>
          </div>
        </div>
      )}
      {tebligPanel && !acik && personelMi && (
        <div className="fixed bottom-[112px] md:bottom-[118px] right-4 md:right-6 z-[65] w-[calc(100vw-2rem)] max-w-[430px] bg-blue-950/95 backdrop-blur-md border border-amber-500/40 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden animate-fade-in-up">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-blue-800/50 bg-amber-500/5">
            <div className="flex-1 min-w-0">
              <h2 className="text-white font-semibold text-sm leading-tight">Son 2 Günde Gelen Tebligatlar</h2>
              <p className="text-amber-300/80 text-xs">{tebligGorunurGruplar.length} müşteri · {tebligToplam} tebligat</p>
            </div>
            <button
              type="button"
              onClick={() => { setTebligPanel(false); navigate('/admin/etebligatlar') }}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500/90 hover:bg-amber-400 text-blue-950 text-xs font-bold transition"
            >
              Tümü
            </button>
            <button
              type="button"
              onClick={tebligUyariKapat}
              aria-label="Uyariyi kapat"
              title="Kapat (yeni tebligat gelene kadar uyarı gösterilmez)"
              className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="divide-y divide-blue-800/40 max-h-72 overflow-y-auto">
            {tebligGorunurGruplar.map(g => (
              <div key={String(g.clientId)}>
                <div className="px-4 py-2.5 flex flex-wrap items-center gap-2.5">
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold shrink-0">{g.adet} yeni</span>
                  <span className="text-white text-sm font-medium flex-1 min-w-[130px] truncate" title={musteriAdlari[String(g.clientId)] || `Müşteri #${g.clientId}`}>
                    {musteriAdlari[String(g.clientId)] || `Müşteri #${g.clientId}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setTebligPanel(false); navigate(`/admin/etebligatlar?musteri=${g.clientId}&yeni=1`) }}
                    className="shrink-0 px-2.5 py-1 rounded-md bg-amber-500/90 hover:bg-amber-400 text-blue-950 text-[11px] font-bold transition"
                  >
                    e-Tebligat'a Git
                  </button>
                  <button
                    type="button"
                    onClick={() => setTebligDetay(d => d === String(g.clientId) ? null : String(g.clientId))}
                    className="shrink-0 px-2 py-1 rounded-md bg-blue-900/40 border border-blue-700/40 text-gray-300 text-[11px] hover:bg-blue-900/60 transition"
                  >
                    {tebligDetay === String(g.clientId) ? 'Gizle' : 'Detay'}
                  </button>
                </div>
                {tebligDetay === String(g.clientId) && (
                  <div className="px-4 pb-2.5">
                    {g.tebligatlar.slice(0, 12).map((s, si) => (
                      <div key={(s.belge_no || '') + si} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1 text-xs pl-2">
                        <span className="text-gray-400 min-w-[86px]">{s.teblig_tarihi || s.gonderme_tarihi || '—'}</span>
                        <span className="text-gray-200 flex-1 min-w-[130px] truncate">{s.kurum || '—'}</span>
                        {s.file_url
                          ? <span className="text-green-400">PDF hazır</span>
                          : <span className="text-gray-500">PDF indirilmedi</span>}
                      </div>
                    ))}
                    {g.tebligatlar.length > 12 && (
                      <div className="text-gray-500 text-xs pl-2 pt-1">+ {g.tebligatlar.length - 12} tebligat daha</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="px-4 py-2 border-t border-blue-800/50 flex justify-end">
            <button
              type="button"
              onClick={() => { setTebligPanel(false); setAcik(true) }}
              className="text-[11px] text-gray-400 hover:text-white transition"
            >
              Sohbete geç
            </button>
          </div>
        </div>
      )}

      {/* Yuzen kalem karakteri */}
      {!acik && (
        <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-[60] flex items-end gap-3">
          {balon && (
            <div className={`hidden sm:block relative rounded-2xl rounded-br-sm px-4 py-3 shadow-2xl max-w-[240px] animate-fade-in-up ${tebligUyariVar ? 'bg-amber-400 text-blue-950' : 'bg-white text-blue-950'}`}>
              {tebligUyariVar ? (
                personelMi ? (
                  <>
                    <p className="text-sm font-bold leading-snug">{tebligToplam} yeni tebligat geldi!</p>
                    <p className="text-xs text-blue-900/80 leading-snug mt-0.5">{tebligGorunurGruplar.length} müşteriye — görmek için tıklayın</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold leading-snug">Size {musteriTebligAdet} yeni e-Tebligat geldi!</p>
                    <p className="text-xs text-blue-900/80 leading-snug mt-0.5">görmek için tıklayın</p>
                  </>
                )
              ) : (
                <>
                  <p className="text-sm font-semibold leading-snug">MUBİS Asistan'a sorun,</p>
                  <p className="text-sm text-blue-700 leading-snug">anında cevap alın!</p>
                </>
              )}
              <div className={`absolute -bottom-1.5 right-5 w-3 h-3 rotate-45 ${tebligUyariVar ? 'bg-amber-400' : 'bg-white'}`} />
            </div>
          )}

          <button
            onClick={() => {
              setBalon(false)
              if (tebligUyariVar) { setTebligPanel(v => !v); return }
              setAcik(true)
            }}
            onMouseEnter={() => setBalon(true)}
            onMouseLeave={() => setBalon(false)}
            aria-label="MUBİS Asistan"
            className="group relative w-[76px] h-[76px] md:w-24 md:h-24 rounded-full bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 border-2 border-blue-300/40 shadow-[0_10px_35px_rgba(30,64,175,0.55)] hover:scale-110 transition-transform duration-300"
          >
            <span className="absolute inset-0 rounded-full bg-blue-400/30 animate-ping-slow" />
            <img
              src="/mascot-kalem.png"
              alt="MUBİS Asistan"
              className="absolute left-1/2 -translate-x-1/2 bottom-1 w-[95%] object-contain animate-mascot-idle group-hover:animate-mascot-wave drop-shadow-[0_6px_10px_rgba(0,0,0,0.35)]"
            />
            <span className="absolute bottom-1.5 right-1.5 w-4 h-4 rounded-full bg-emerald-400 border-2 border-blue-900" />
            {tebligUyariAdet > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1 rounded-full bg-amber-400 text-blue-950 text-[11px] font-bold flex items-center justify-center border-2 border-blue-950 animate-pulse">
                {tebligUyariAdet > 99 ? '99+' : tebligUyariAdet}
              </span>
            ) : (okunmamis > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center border-2 border-blue-950">
                {okunmamis}
              </span>
            ))}
          </button>
        </div>
      )}

      {/* Sohbet penceresi */}
      {acik && (
        <div className="fixed inset-0 md:inset-auto md:bottom-6 md:right-6 z-[70] md:w-[420px] md:h-[640px] flex flex-col bg-white md:rounded-2xl overflow-hidden shadow-[0_25px_70px_rgba(0,0,0,0.45)] animate-fade-in-up">
          {/* Baslik */}
          <div className="bg-gradient-to-r from-blue-700 to-blue-800 px-4 py-3 flex items-center gap-3 flex-shrink-0">
            <div className="w-16 h-16 rounded-full bg-blue-900/50 border border-blue-400/40 flex items-center justify-center overflow-hidden flex-shrink-0">
              <img src="/mascot-avatar.png" alt="" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white font-bold leading-tight">MUBİS Asistan</div>
              <div className="flex items-center gap-1.5 text-emerald-300 text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Çevrimiçi
              </div>
            </div>
            <button
              onClick={() => { setSesli(s => !s); if (sesli) window.speechSynthesis?.cancel() }}
              title={sesli ? 'Sesi kapat' : 'Sesli cevap'}
              className={`p-2 rounded-lg transition-colors ${sesli ? 'text-yellow-300 bg-white/10' : 'text-blue-200 hover:text-white hover:bg-white/10'}`}
            >
              {sesli ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>
            <button onClick={sifirla} title="Sohbeti temizle" className="p-2 rounded-lg text-blue-200 hover:text-white hover:bg-white/10 transition-colors">
              <RotateCcw className="w-5 h-5" />
            </button>
            <button onClick={kapat} title="Kapat" className="p-2 rounded-lg text-blue-200 hover:text-white hover:bg-white/10 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mesajlar */}
          <div ref={listeRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50">
            {/* Mali musavir mesajlari */}
            {adminMesajlari.length > 0 && (
              <div className="space-y-3 pb-1">
                <div className="flex items-center gap-1.5 text-gray-500 text-xs font-semibold">
                  <Megaphone className="w-3.5 h-3.5" />
                  Mali Müşavirinizden Mesajlar
                </div>

                {adminMesajlari.map(m => {
                  if (m.sender === 'client') {
                    return (
                      <div key={m.id} className="flex justify-end">
                        <div className="max-w-[85%]">
                          <div className="bg-emerald-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line">
                            {m.message}
                          </div>
                          <div className="text-[11px] text-gray-400 mt-1 text-right">
                            Mali müşavire gönderildi · {saatBiçimi(new Date(m.created_at))}
                          </div>
                        </div>
                      </div>
                    )
                  }

                  const renk = m.priority === 'acil'
                    ? 'border-red-300 bg-red-50'
                    : m.priority === 'onemli'
                      ? 'border-amber-300 bg-amber-50'
                      : 'border-blue-200 bg-white'
                  const nokta = m.priority === 'acil' ? 'bg-red-500' : m.priority === 'onemli' ? 'bg-amber-500' : 'bg-emerald-500'

                  return (
                    <div key={m.id} className={`border rounded-2xl p-3.5 ${renk}`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`w-2 h-2 rounded-full ${nokta}`} />
                        <span className="text-blue-950 text-sm font-bold">
                          {m.priority === 'acil' ? 'Acil bildiriminiz var' : 'Muhasebe\'den yeni mesajınız var'}
                        </span>
                      </div>
                      <p className="text-blue-950/80 text-[13px] leading-relaxed whitespace-pre-line">
                        {m.assistant_message || m.message}
                      </p>

                      {m.due_date && (
                        <div className="mt-2 inline-flex items-center gap-1.5 bg-white/70 border border-gray-200 rounded-lg px-2.5 py-1 text-[11px] text-blue-950 font-medium">
                          <Calendar className="w-3 h-3" />
                          Son tarih: {new Date(m.due_date).toLocaleDateString('tr-TR')}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 mt-3">
                        {m.action_url && m.action_label && (
                          <button
                            onClick={() => aksiyonaGit(m.action_url)}
                            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
                          >
                            <Paperclip className="w-3.5 h-3.5" />
                            {m.action_label}
                          </button>
                        )}
                        <button
                          onClick={() => { setMusavireYaz(true); setTimeout(() => inputRef.current?.focus(), 100) }}
                          className="flex items-center gap-1.5 bg-white border border-gray-300 hover:border-blue-400 text-blue-950 text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
                        >
                          <Reply className="w-3.5 h-3.5" />
                          Mali müşavire mesaj gönder
                        </button>
                      </div>

                      <div className="text-[11px] text-gray-400 mt-2">
                        {m.sender_name ? `${m.sender_name} (SMMM) · ` : ''}
                        {new Date(m.created_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  )
                })}

                <div className="border-t border-gray-200 pt-1" />
              </div>
            )}

            {mesajlar.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={`max-w-[85%] ${m.role === 'user' ? '' : ''}`}>
                  <div
                    className={
                      m.role === 'user'
                        ? 'bg-blue-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line'
                        : 'bg-blue-50 border border-blue-100 text-blue-950 rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-line'
                    }
                  >
                    {m.role === 'user' ? m.content : <MesajMetni text={m.content} />}
                  </div>
                  <div className={`text-[11px] text-gray-400 mt-1 ${m.role === 'user' ? 'text-right' : ''}`}>
                    {saatBiçimi(m.ts)}
                  </div>
                </div>
              </div>
            ))}

            {yaziyor && (
              <div className="flex justify-start">
                <div className="bg-blue-50 border border-blue-100 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}

            {mesajlar.length === 1 && (
              <div className="pt-1">
                <div className="flex items-center gap-1.5 text-gray-500 text-xs font-semibold mb-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  {personelMi ? 'Mevzuat Soruları' : clientId ? 'Size Özel Sorular' : 'Sık Sorulan Sorular'}
                </div>
                <div className="space-y-2">
                  {(personelMi ? PERSONEL_SORULARI : clientId ? MUSTERI_SORULARI : SIK_SORULAR).map((s, i) => (
                    <button
                      key={i}
                      onClick={() => gonder(s)}
                      className="w-full flex items-center gap-2.5 bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-xl px-3 py-2.5 text-left transition-colors group"
                    >
                      <MessageSquareText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      <span className="flex-1 text-sm text-blue-950">{s}</span>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Giris alani */}
          <div className="border-t border-gray-200 bg-white px-3 pt-3 pb-3 flex-shrink-0">
            <div className="flex items-center gap-2 bg-slate-100 rounded-full pl-4 pr-1.5 py-1.5">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder={dinliyor ? 'Dinliyorum...' : musavireYaz ? 'Mali müşavirinize cevabınızı yazın...' : 'Sorunuzu yazın...'}
                className="flex-1 bg-transparent text-sm text-blue-950 placeholder-gray-400 outline-none py-1.5"
              />
              <button
                onClick={mikrofon}
                title="Sesli sor"
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${
                  dinliyor ? 'bg-red-500 text-white animate-pulse' : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                <Mic className="w-4 h-4" />
              </button>
              <button
                onClick={handleSend}
                disabled={!input.trim() || yaziyor}
                title={musavireYaz ? 'Mali müşavire gönder' : 'Gönder'}
                className="w-9 h-9 rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center transition-colors flex-shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-between mt-2.5 px-1">
              <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
                <Volume2 className="w-3.5 h-3.5" />
                Sesli görüşme
                <span
                  onClick={() => setSesli(s => !s)}
                  className={`w-9 h-5 rounded-full transition-colors relative ${sesli ? 'bg-blue-600' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${sesli ? 'left-[18px]' : 'left-0.5'}`} />
                </span>
              </label>
              {misafir && (
                <span className="text-[11px] text-gray-400">
                  {Math.max(0, MISAFIR_LIMIT - misafirKullanim())}/{MISAFIR_LIMIT} soru
                </span>
              )}
            </div>

            <p className="text-center text-[11px] text-gray-400 mt-2">
              MUBİS Yapay Zekâ ile güvenli şekilde çalışıyorsunuz.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
