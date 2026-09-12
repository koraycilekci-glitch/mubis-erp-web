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
  'KDV ödemem ne kadar?',
  'SGK primim ne kadar, son ödeme günü ne zaman?',
  'Muhasebe ücreti borcum ne kadar?',
  'Bu ayki ödemelerimi tek tek sayar mısın?'
]

// Admin/personel icin mevzuat odakli oneriler
const PERSONEL_SORULARI = [
  'KDV tevkifat oranları ve uygulanacağı işlemler nelerdir?',
  'Geçici vergi beyan ve ödeme süreleri nedir?',
  'Muhtasar ve prim hizmet beyannamesi hangi hallerde 3 aylık verilir?',
  'e-Defter berat yükleme süreleri nasıl hesaplanır?',
  'Amortisman ayırma şartları ve faydalı ömür nasıl belirlenir?',
  'Asgari ücret desteği ve 5510 sayılı Kanun teşviklerinden kimler yararlanır?'
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
  const [clientProfile, setClientProfile] = useState(null)
  const [acik, setAcik] = useState(false)
  const [balon, setBalon] = useState(false)
  const [sesli, setSesli] = useState(false)
  const [dinliyor, setDinliyor] = useState(false)
  const [yaziyor, setYaziyor] = useState(false)
  const [input, setInput] = useState('')
  const [okunmamis, setOkunmamis] = useState(0)
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
  const personelMi = ['admin', 'super_admin', 'personel'].includes(user?.role)

  // ── Mali musavir mesajlari ──
  const navigate = useNavigate()
  const [clientId, setClientId] = useState(null)
  const [kisiselOzet, setKisiselOzet] = useState('')
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

  useEffect(() => {
    if (!clientId) {
      setClientProfile(null)
      return
    }

    let iptal = false
    supabase
      .from('clients')
      .select('name, shortName, short_name, company, phonenumbers')
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

  // ── Musteriye ozel mali ozet (AI'ya baglam olarak gonderilir) ──
  useEffect(() => {
    if (!clientId) { setKisiselOzet(''); return }
    let iptal = false
    buildClientAiContext(clientId)
      .then(metin => { if (!iptal) setKisiselOzet(metin || '') })
      .catch(e => console.warn('Kisisel AI ozeti olusturulamadi:', e))
    return () => { iptal = true }
  }, [clientId])

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
      // Musteri girisi varsa kisisel mali ozet (borc, tahakkuk, son tarihler) eklenir
      let kisisel = ''
      if (kisiselOzet) {
        kisisel = `\n\nKULLANICININ MUBIS VERILERI:\n${kisiselOzet}`
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
  }, [input, mesajlar, misafir, user, yaziyor, kisiselOzet, personelMi])

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

      {/* Yuzen kalem karakteri */}
      {!acik && (
        <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-[60] flex items-end gap-3">
          {balon && (
            <div className="hidden sm:block relative bg-white text-blue-950 rounded-2xl rounded-br-sm px-4 py-3 shadow-2xl max-w-[230px] animate-fade-in-up">
              <p className="text-sm font-semibold leading-snug">MUBİS Asistan'a sorun,</p>
              <p className="text-sm text-blue-700 leading-snug">anında cevap alın!</p>
              <div className="absolute -bottom-1.5 right-5 w-3 h-3 bg-white rotate-45" />
            </div>
          )}

          <button
            onClick={() => { setAcik(true); setBalon(false) }}
            onMouseEnter={() => setBalon(true)}
            onMouseLeave={() => setBalon(false)}
            aria-label="MUBİS Asistan'ı aç"
            className="group relative w-[76px] h-[76px] md:w-24 md:h-24 rounded-full bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 border-2 border-blue-300/40 shadow-[0_10px_35px_rgba(30,64,175,0.55)] hover:scale-110 transition-transform duration-300"
          >
            <span className="absolute inset-0 rounded-full bg-blue-400/30 animate-ping-slow" />
            <img
              src="/mascot-kalem.png"
              alt="MUBİS Asistan"
              className="absolute left-1/2 -translate-x-1/2 bottom-1 w-[95%] object-contain animate-mascot-idle group-hover:animate-mascot-wave drop-shadow-[0_6px_10px_rgba(0,0,0,0.35)]"
            />
            <span className="absolute bottom-1.5 right-1.5 w-4 h-4 rounded-full bg-emerald-400 border-2 border-blue-900" />
            {okunmamis > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center border-2 border-blue-950">
                {okunmamis}
              </span>
            )}
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
                  {personelMi ? 'Mevzuat Soruları' : kisiselOzet ? 'Size Özel Sorular' : 'Sık Sorulan Sorular'}
                </div>
                <div className="space-y-2">
                  {(personelMi ? PERSONEL_SORULARI : kisiselOzet ? MUSTERI_SORULARI : SIK_SORULAR).map((s, i) => (
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
