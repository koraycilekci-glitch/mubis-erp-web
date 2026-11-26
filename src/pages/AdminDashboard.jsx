import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import { Link, useNavigate } from 'react-router-dom'
import { 
  Plus, Search, Filter, MapPin, Trash2, X, Eye, ListChecks, FileText,
  Brain, Calendar, Clock, AlertTriangle, CheckCircle, ChevronRight,
  Users, Building2, UserCheck, TrendingUp, Bell, Shield, Mail,
  FileCheck, FolderOpen, Landmark, PenTool, BarChart3, ArrowRight,
  Zap, Star, CircleDot, Timer, CalendarDays, BookOpen, Receipt,
  ShieldCheck, FileSearch, Briefcase, Settings, Activity, Send,
  Megaphone, DollarSign, Menu as MenuIcon, ChevronLeft, LayoutDashboard,
  Calculator, MessageSquareText, Inbox
} from 'lucide-react'
import { getMonthName, getFormattedBeyanDeadline, getBeyanDeadline, getFormattedSgkOdemeGunu, getSgkOdemeGunu, formatDateTR } from '../utils/dateUtils'
import { yardimciIsYerel } from '../utils/gibOdemeHelper'
import { getNotifications, markNotificationRead, subscribeToNotifications } from '../services/notificationService'
import { supabase } from '../lib/supabase'
import HavaSaatKarti from '../components/HavaSaatKarti'
import KurAltinBandi from '../components/KurAltinBandi'
import NamazVakitleri from '../components/NamazVakitleri'
import RadioUstBant from '../components/RadioUstBant'
import YouTubeMuzik from '../components/YouTubeMuzik'
import SpotifyUstBant from '../components/SpotifyUstBant'
import AnalyticsOzet from '../components/AnalyticsOzet'
import TevkifatKdv2Uyarisi from '../components/TevkifatKdv2Uyarisi'

// ── Beyan tipleri ve son tarih gunleri ──
const BEYAN_TYPES = [
  { id: 'kdv', label: 'KDV', day: 28, color: 'red' },
  { id: 'kdv2', label: 'KDV2', day: 25, color: 'rose' },
  { id: 'muhtasar', label: 'Muhtasar', day: 26, color: 'orange' },
  { id: 'sgk', label: 'SGK', day: 26, color: 'blue' },
  { id: 'gecici_vergi', label: 'Gecici Vergi', day: 17, color: 'purple', months: [1, 4, 7, 10] },
  { id: 'kurumlar_vergi', label: 'Kurumlar Vergisi', day: 30, color: 'indigo', months: [3] },
  { id: 'gelir_vergi', label: 'Gelir Vergisi', day: 31, color: 'teal', months: [2] },
  { id: 'edefter', label: 'e-Defter', day: 30, color: 'cyan' },
  { id: 'damga', label: 'Damga Vergisi', day: 26, color: 'pink' },
]

// ── Zaman bazli karsilama ──
function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 6) return 'Iyi geceler'
  if (hour < 12) return 'Günaydın'
  if (hour < 18) return 'İyi günler'
  return 'İyi akşamlar'
}

function getTurkishDate() {
  const now = new Date()
  const gunler = ['Pazar', 'Pazartesi', 'Sali', 'Carsamba', 'Persembe', 'Cuma', 'Cumartesi']
  const aylar = ['Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran', 'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik']
  return `${gunler[now.getDay()]}, ${now.getDate()} ${aylar[now.getMonth()]} ${now.getFullYear()}`
}

function getDaysUntil(targetDate) {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const target = new Date(targetDate)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24))
}

function getUrgencyColor(daysLeft) {
  if (daysLeft < 0) return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', badge: 'bg-red-500', label: 'Gecmis!' }
  if (daysLeft === 0) return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', badge: 'bg-red-500', label: 'BUGUN!' }
  if (daysLeft <= 3) return { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20', badge: 'bg-red-500', label: `${daysLeft} gun` }
  if (daysLeft <= 7) return { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20', badge: 'bg-orange-500', label: `${daysLeft} gun` }
  if (daysLeft <= 15) return { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20', badge: 'bg-yellow-500', label: `${daysLeft} gun` }
  return { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', badge: 'bg-blue-500', label: `${daysLeft} gun` }
}

// ── Resmi vergi takvimi: bir ayin son tarihleri ──
// month: 0-based. SGK odemesi ayin son gunu, gecici vergi 17'si (Sub/May/Agu/Kas)
function getAyinSonTarihleri(yil, ay) {
  const ayinSonGunu = new Date(yil, ay + 1, 0).getDate()
  // 2.7.266: SGK prim odemesi ayin son gunudur; hafta sonu/resmi tatile denk
  // gelirse TAKIP EDEN ilk is gunune ILERI ertelenir (Ekim 2026: 31 Cumartesi
  // -> 2 Kasim Pazartesi). Erteleme sonraki aya tasarsa ayin son gununde,
  // yanina tasinan tarih yazilarak gosterilir.
  const sgkOdeme = getSgkOdemeGunu(yil, ay)
  const kalemler = [
    { gun: 25, ad: 'KDV2 (tevkifat)' },
    { gun: 26, ad: 'Muhtasar ve Prim Hizmet' },
    { gun: 26, ad: 'Damga Vergisi' },
    { gun: 28, ad: 'KDV' },
    sgkOdeme.getMonth() === ay
      ? { gun: sgkOdeme.getDate(), ad: 'SGK Prim Ödemesi' }
      : { gun: ayinSonGunu, ad: `SGK Prim Ödemesi (${formatDateTR(getFormattedSgkOdemeGunu(yil, ay))})` }
  ]

  const geciciDonem = { 1: '4. Dönem', 4: '1. Dönem', 7: '2. Dönem', 10: '3. Dönem' }[ay]
  if (geciciDonem) kalemler.push({ gun: 17, ad: `Geçici Vergi (${geciciDonem})` })
  if (ay === 2) kalemler.push({ gun: 31, ad: 'Gelir Vergisi Beyannamesi' })
  if (ay === 3) kalemler.push({ gun: 30, ad: 'Kurumlar Vergisi Beyannamesi' })

  // Hafta sonu / resmi tatil ertelemesi uygula, gune gore grupla
  const map = new Map()
  kalemler.forEach(k => {
    const iso = getFormattedBeyanDeadline(yil, ay, k.gun)
    const d = new Date(iso + 'T00:00:00')
    // Erteleme sonraki aya tasarsa ayin son is gununde goster
    if (d.getMonth() !== ay) return
    const gun = d.getDate()
    if (!map.has(gun)) map.set(gun, [])
    map.get(gun).push(k.ad)
  })
  return map
}

// ── Mini vergi takvimi ──
function MiniTakvim({ isaretliGunler = [] }) {
  const bugun = new Date()
  const [gosterilen, setGosterilen] = useState(new Date(bugun.getFullYear(), bugun.getMonth(), 1))

  const yil = gosterilen.getFullYear()
  const ay = gosterilen.getMonth()
  const ilkGun = new Date(yil, ay, 1)
  const gunSayisi = new Date(yil, ay + 1, 0).getDate()
  const basSirasi = (ilkGun.getDay() + 6) % 7 // Pazartesi = 0

  const hucreler = []
  for (let i = 0; i < basSirasi; i++) hucreler.push(null)
  for (let g = 1; g <= gunSayisi; g++) hucreler.push(g)

  // Resmi vergi takvimi + musteri beyan son tarihleri birlikte isaretlenir
  const resmiTarihler = useMemo(() => getAyinSonTarihleri(yil, ay), [yil, ay])

  const isaretli = new Set(resmiTarihler.keys())
  isaretliGunler
    .filter(d => d.getFullYear() === yil && d.getMonth() === ay)
    .forEach(d => isaretli.add(d.getDate()))

  const listelenecek = [...resmiTarihler.entries()].sort((a, b) => a[0] - b[0])

  return (
    <div className="bg-blue-800/20 rounded-2xl border border-blue-700/30 overflow-hidden">
      <div className="px-5 py-4 border-b border-blue-700/30 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
            <Calendar className="w-4 h-4 text-blue-400" />
          </div>
          <h2 className="text-white font-semibold text-sm">Vergi Takvimi</h2>
        </div>
        <Link to="/admin/tax-calendar" className="text-xs text-yellow-400 hover:text-yellow-300 font-medium">
          Tüm takvim
        </Link>
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setGosterilen(new Date(yil, ay - 1, 1))}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-blue-800/40"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-white text-sm font-semibold">{getMonthName(ay)} {yil}</span>
          <button
            onClick={() => setGosterilen(new Date(yil, ay + 1, 1))}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-blue-800/40"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(g => (
            <div key={g} className="text-center text-[10px] text-gray-500 font-medium py-1">{g}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {hucreler.map((g, i) => {
            if (!g) return <div key={i} />
            const buGun = g === bugun.getDate() && ay === bugun.getMonth() && yil === bugun.getFullYear()
            const sonTarih = isaretli.has(g)
            const aciklama = resmiTarihler.get(g)
            return (
              <div
                key={i}
                title={aciklama ? `${g} ${getMonthName(ay)}: ${aciklama.join(', ')}` : undefined}
                className={`h-8 flex items-center justify-center rounded-lg text-xs font-medium relative ${
                  buGun
                    ? 'bg-blue-500 text-white font-bold'
                    : sonTarih
                      ? 'bg-red-500/15 text-red-300'
                      : 'text-gray-400'
                }`}
              >
                {g}
                {sonTarih && !buGun && (
                  <span className="absolute bottom-1 w-1 h-1 rounded-full bg-red-400" />
                )}
              </div>
            )
          })}
        </div>

        {/* Bu ayin resmi son tarihleri */}
        {listelenecek.length > 0 && (
          <div className="mt-4 pt-3 border-t border-blue-700/30 space-y-1.5">
            {listelenecek.map(([gun, adlar]) => {
              const tarih = new Date(yil, ay, gun)
              const kalan = getDaysUntil(tarih)
              return (
                <div key={gun} className="flex items-start gap-2.5 text-xs">
                  <span className={`flex-shrink-0 w-7 h-6 rounded-md flex items-center justify-center font-bold ${
                    kalan < 0 ? 'bg-gray-700/50 text-gray-500'
                      : kalan <= 3 ? 'bg-red-500/20 text-red-300'
                        : kalan <= 10 ? 'bg-orange-500/20 text-orange-300'
                          : 'bg-blue-500/15 text-blue-300'
                  }`}>{gun}</span>
                  <span className={`flex-1 leading-6 ${kalan < 0 ? 'text-gray-500' : 'text-gray-300'}`}>
                    {adlar.join(' • ')}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── 2.7.522: Son 2 günde gelen e-Tebligatlar — müşteri başına adet listesi.
// Uyarı bandındaki "Kimlere Geldi?" düğmesi bu bölüme kaydırır; satırdaki
// düğme ilgili müşterinin e-Tebligat sayfasını açar. ──
export function SonIkiGunTebligatlar() {
  const { clients } = useClients()
  const navigate = useNavigate()
  const [gruplar, setGruplar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)

  useEffect(() => {
    let canli = true
    const yukle = async () => {
      try {
        const ikiGunOnce = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
        const { data, error } = await supabase
          .from('etebligatlar')
          .select('client_id, belge_no, teblig_tarihi, gonderme_tarihi, kurum, file_url, created_at')
          .gte('created_at', ikiGunOnce)
          .order('created_at', { ascending: false })
        if (error) throw error
        if (!canli) return
        const harita = new Map()
        for (const s of data || []) {
          const k = String(s.client_id)
          if (!harita.has(k)) harita.set(k, { clientId: s.client_id, adet: 0, tebligatlar: [] })
          const g = harita.get(k)
          g.adet++
          g.tebligatlar.push(s)
        }
        setGruplar([...harita.values()].sort((a, b) => b.adet - a.adet))
      } catch { /* tablo yoksa sessiz gec */ }
      if (canli) setYukleniyor(false)
    }
    yukle()
    const abonelik = subscribeToNotifications(() => yukle())
    return () => { canli = false; try { abonelik?.() } catch { /* yoksay */ } }
  }, [])

  const isim = (cid) => {
    const c = (clients || []).find(x => String(x.id) === String(cid))
    return c ? (c.company_name || c.name || `Müşteri #${cid}`) : `Müşteri #${cid}`
  }

  if (yukleniyor) return null // 2.7.542: yukleme bandi cizmiyoruz — bolum sonradan buyuyup alttaki kartlari kaydiriyor (yanlis tiklanmaya yol aciyor)

  if (!gruplar.length) return null

  const toplam = gruplar.reduce((t, g) => t + g.adet, 0)

  return (
    // 2.7.542: tam genislik bant kaldirildi — e-Tebligat simgesi (rozetli)
    // uzerine gelince asagiya acilan profesyonel panel haline getirildi.
    <div id="son-iki-gun-tebligatlar" className="relative inline-block group scroll-mt-24 mb-6 align-top">
      <button
        type="button"
        onClick={() => navigate('/admin/etebligatlar')}
        className="relative block w-14 h-14 md:w-16 md:h-16 rounded-2xl overflow-hidden shadow-lg shadow-black/40 ring-2 ring-amber-400/50 hover:ring-amber-400 transition-all duration-300 hover:scale-105 cursor-pointer"
        title="Son 2 günde gelen tebligatlar — üstünde bekleyin"
      >
        <img src="/etebligat-simge.png" alt="e-Tebligat" className="w-full h-full object-cover" draggable="false" />
        <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center ring-2 ring-blue-950 shadow-lg">
          {toplam > 99 ? '99+' : toplam}
        </span>
      </button>
      {/* Uzerine gelince acilan panel */}
      <div className="absolute left-0 top-full z-50 pt-2 opacity-0 translate-y-1 invisible transition-all duration-200 group-hover:opacity-100 group-hover:translate-y-0 group-hover:visible">
        <div className="w-[430px] max-w-[calc(100vw-3rem)] bg-blue-950/95 backdrop-blur-md border border-amber-500/40 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-blue-800/50 bg-amber-500/5">
            <img src="/etebligat-simge.png" alt="" className="w-9 h-9 rounded-xl object-cover ring-1 ring-amber-400/40" draggable="false" />
            <div className="flex-1 min-w-0">
              <h2 className="text-white font-semibold text-sm leading-tight">Son 2 Günde Gelen Tebligatlar</h2>
              <p className="text-amber-300/80 text-xs">{gruplar.length} müşteri · {toplam} tebligat</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/admin/etebligatlar')}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500/90 hover:bg-amber-400 text-blue-950 text-xs font-bold transition"
            >
              Tümü
            </button>
          </div>
          <div className="divide-y divide-blue-800/40 max-h-72 overflow-y-auto">
            {gruplar.map((g, gi) => (
              <div key={String(g.clientId)}>
                <div className="px-4 py-2.5 flex flex-wrap items-center gap-2.5">
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold shrink-0">{g.adet} yeni</span>
                  <span className="text-white text-sm font-medium flex-1 min-w-[140px] truncate" title={isim(g.clientId)}>{isim(g.clientId)}</span>
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/etebligatlar?musteri=${g.clientId}&yeni=1`)}
                    className="shrink-0 px-2.5 py-1 rounded-md bg-amber-500/90 hover:bg-amber-400 text-blue-950 text-[11px] font-bold transition"
                  >
                    e-Tebligat'a Git
                  </button>
                  <button
                    type="button"
                    onClick={() => setGruplar(list => list.map((x, i) => i === gi ? { ...x, acik: !x.acik } : x))}
                    className="shrink-0 px-2 py-1 rounded-md bg-blue-900/40 border border-blue-700/40 text-gray-300 text-[11px] hover:bg-blue-900/60 transition"
                  >
                    {g.acik ? 'Gizle' : 'Detay'}
                  </button>
                </div>
                {g.acik && (
                  <div className="px-4 pb-2.5">
                    {g.tebligatlar.slice(0, 12).map((s, si) => (
                      <div key={(s.belge_no || '') + si} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1 text-xs pl-2">
                        <span className="text-gray-400 min-w-[86px]">{s.teblig_tarihi || s.gonderme_tarihi || '—'}</span>
                        <span className="text-gray-200 flex-1 min-w-[140px] truncate">{s.kurum || '—'}</span>
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
        </div>
      </div>
    </div>
  )
}

// ── e-Tebligat uyarisi: okunmamis "etebligat" bildirimlerini sari bantla goster ──
function EtebligatUyari() {
  const [uyarilar, setUyarilar] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    let canli = true
    const yukle = async () => {
      try {
        const liste = await getNotifications({ limit: 30, audience: 'admin' })
        if (canli) setUyarilar(liste.filter(n => n.type === 'etebligat' && !n.read))
      } catch { /* bildirim tablosu yoksa sessiz gec */ }
    }
    yukle()
    const abonelik = subscribeToNotifications(() => yukle())
    return () => { canli = false; try { abonelik?.() } catch { /* yoksay */ } }
  }, [])

  if (!uyarilar.length) return null

  const kapat = async (id) => {
    setUyarilar(u => u.filter(x => x.id !== id))
    try { await markNotificationRead(id) } catch { /* yoksay */ }
  }

  return (
    <div className="mb-6 space-y-2">
      {uyarilar.map(u => (
        <div key={u.id} className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/40 rounded-xl px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-amber-300 font-semibold text-sm">{u.message}</span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/admin/etebligatlar')}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-blue-950 text-xs font-bold transition"
          >
            Kimlere Geldi?
          </button>
          <button
            type="button"
            onClick={() => kapat(u.id)}
            aria-label="Uyarıyı kapat"
            title="Uyarıyı kapat"
            className="shrink-0 p-1.5 rounded-lg text-amber-300/70 hover:text-white hover:bg-amber-500/20 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Ana Dashboard Bileşeni ──
export default function AdminDashboard() {
  const { user, logout } = useAuth()
  const { clients, loading: clientsLoading, error: clientsError, refresh: refreshClients } = useClients()
  const navigate = useNavigate()
  // 2.7.542: ana ekran asistani cinsiyeti (Ayarlar > Ana Ekran Asistani'ndan)
  const [adminCinsiyet, setAdminCinsiyet] = useState(() => localStorage.getItem('admin_cinsiyet_v1') || 'erkek')
  const [namazGoster, setNamazGoster] = useState(() => localStorage.getItem('admin_namaz_v1') === '1')
  const [radyoGoster, setRadyoGoster] = useState(() => localStorage.getItem('admin_radio_v1') === '1')
  const [kurlarGoster, setKurlarGoster] = useState(() => localStorage.getItem('admin_kurlar_v1') !== '0')
  const [ytMuzikGoster, setYtMuzikGoster] = useState(() => localStorage.getItem('admin_ytmusic_v1') === '1')
  const [spotifyGoster, setSpotifyGoster] = useState(() => localStorage.getItem('admin_spotify_v1') === '1')
  // Tek bir interval ile tum ayar okumalarini birlestir (5 yerine 1 timer)
  useEffect(() => {
    const yenile = () => {
      setAdminCinsiyet(localStorage.getItem('admin_cinsiyet_v1') || 'erkek')
      setNamazGoster(localStorage.getItem('admin_namaz_v1') === '1')
      setRadyoGoster(localStorage.getItem('admin_radio_v1') === '1')
      setKurlarGoster(localStorage.getItem('admin_kurlar_v1') !== '0')
      setYtMuzikGoster(localStorage.getItem('admin_ytmusic_v1') === '1')
      setSpotifyGoster(localStorage.getItem('admin_spotify_v1') === '1')
    }
    window.addEventListener('storage', yenile)
    const iv = setInterval(yenile, 5000)
    return () => { window.removeEventListener('storage', yenile); clearInterval(iv) }
  }, [])
  // 2.7.543: saat + tarih + hava durumu ortak HavaSaatKarti komponentinde
  const [showAllDeadlines, setShowAllDeadlines] = useState(false)
  const [showAllTasks, setShowAllTasks] = useState(false)

  // ── Beyan istatistikleri hesapla ──
  const dashboardData = useMemo(() => {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    let bekleyenBeyanlar = 0
    let tamamlananBeyanlar = 0
    let gecmisBeyanlar = 0
    let toplamBeyanlar = 0
    const deadlines = []
    const todaysTasks = []

    // e-Imza / Mali Muhur uyarilari
    let maliMuhurUyari = 0
    const maliMuhurList = []

    clients.forEach(client => {
      // e-Imza bitis tarih kontrol
      if (client.eimzaEnd) {
        const endDate = new Date(client.eimzaEnd)
        const daysLeft = getDaysUntil(endDate)
        if (daysLeft <= 60 && daysLeft > 0) {
          maliMuhurUyari++
          maliMuhurList.push({
            client: client.name || client.company,
            clientId: client.id,
            daysLeft,
            endDate: client.eimzaEnd,
            type: 'e-Imza'
          })
        }
      }

      // Beyan profili kontrol
      const profile = client.beyanProfile || {}
      const durumlari = client.beyanDurumlari || {}

      BEYAN_TYPES.forEach(beyanType => {
        // Beyan profili kontrol - SADECE profilde aktif olanlari say
        const profile = client.beyanProfile || {}
        const monthConfig = profile[beyanType.id]?.[currentMonth]
        
        // Ozel aylar icin kontrol (gecici, kurumlar, gelir)
        if (beyanType.months && !beyanType.months.includes(currentMonth)) return

        // Profilde tanimli degilse beyanSettings'e bak
        const settings = client.beyanSettings || {}
        const settingVal = settings[beyanType.id]

        // Aktiflik kontrol - profilde varsa profilden, yoksa ayarlardan
        let isActive = false
        if (monthConfig) {
          isActive = monthConfig.active === true
        } else if (settingVal === true || settingVal === 'monthly' || settingVal === '3monthly') {
          isActive = true
        }
        // Profil veya ayar yoksa aktif DEGIL (varsayilan kapali)

        if (!isActive) return

        toplamBeyanlar++

        // Durum kontrol
        const statusKey = `${currentYear}_${currentMonth}_${beyanType.id}`
        const status = durumlari[statusKey] || 'yapilmadi'

        // Son tarih hesapla — hafta sonu / resmi tatile denk gelirse takip eden
        // ilk iş gününe ertelenir (örn. 26 Eylül 2026 Cumartesi → 28 Pazartesi).
        // SGK: BEYAN son günü muhtasarla birlikte 26 (ertelenmiş),
        // ÖDENEcek prim son günü ayin son gunudur; hafta sonu/tatile denk
        // gelirse TAKIP EDEN ilk is gunune ertelenir — ayrı gösterilir.
        const deadlineDate = getBeyanDeadline(currentYear, currentMonth, beyanType.day)
        const daysLeft = getDaysUntil(deadlineDate)
        // SGK odeme tarihi (son gunden ILERI ertelenmis is gunu) — kartta "Odeme:" olarak yazilir
        const odemeTarihi = beyanType.id === 'sgk'
          ? getFormattedSgkOdemeGunu(currentYear, currentMonth)
          : null

        if (status === 'yapilmadi' || status === 'yapilamadi') {
          bekleyenBeyanlar++
          if (daysLeft < 0) {
            gecmisBeyanlar++
          }
        } else {
          tamamlananBeyanlar++
        }

        // Son tarih listesine ekle (sadece bekleyenler)
        if (status === 'yapilmadi' || status === 'yapilamadi') {
          deadlines.push({
            client: client.name || client.company,
            clientId: client.id,
            type: beyanType.label,
            typeId: beyanType.id,
            deadline: deadlineDate,
            daysLeft,
            color: beyanType.color,
            odemeTarihi,
            status
          })
        }

        // Bugunku isler (7 gun icindekiler)
        if ((status === 'yapilmadi' || status === 'yapilamadi') && daysLeft >= 0 && daysLeft <= 7) {
          todaysTasks.push({
            client: client.name || client.company,
            clientId: client.id,
            type: beyanType.label,
            typeId: beyanType.id,
            deadline: deadlineDate,
            daysLeft,
            urgency: daysLeft <= 3 ? 'critical' : 'warning'
          })
        }
      })

      // Standalone localStorage beyan kontrol (System A fallback)
      BEYAN_TYPES.forEach(beyanType => {
        const key = `beyan_${client.id}_${beyanType.id}_${currentMonth}_${currentYear}`
        const val = localStorage.getItem(key)
        if (val === 'overdue') {
          gecmisBeyanlar = Math.max(gecmisBeyanlar, 1)
        }
      })
    })

    // Son tarihleri beyan turune gore grupla
    const groupedDeadlines = {}
    deadlines.forEach(d => {
      if (!groupedDeadlines[d.typeId]) {
        groupedDeadlines[d.typeId] = {
          type: d.type,
          typeId: d.typeId,
          color: d.color,
          count: 0,
          deadline: d.deadline,
          daysLeft: d.daysLeft,
          odemeTarihi: d.odemeTarihi || null,
          clients: []
        }
      }
      groupedDeadlines[d.typeId].count++
      groupedDeadlines[d.typeId].clients.push(d.client)
      if (d.odemeTarihi) groupedDeadlines[d.typeId].odemeTarihi = d.odemeTarihi
      // En yakin son tarihi al
      if (d.daysLeft < groupedDeadlines[d.typeId].daysLeft) {
        groupedDeadlines[d.typeId].daysLeft = d.daysLeft
        groupedDeadlines[d.typeId].deadline = d.deadline
      }
    })
    const groupedDeadlineList = Object.values(groupedDeadlines).sort((a, b) => a.daysLeft - b.daysLeft)

    todaysTasks.sort((a, b) => a.daysLeft - b.daysLeft)
    maliMuhurList.sort((a, b) => a.daysLeft - b.daysLeft)

    return {
      bekleyenBeyanlar,
      tamamlananBeyanlar,
      gecmisBeyanlar,
      toplamBeyanlar,
      deadlines,
      groupedDeadlines: groupedDeadlineList,
      todaysTasks,
      maliMuhurUyari,
      maliMuhurList,
      clientStats: {
        total: clients.length,
        active: clients.filter(c => c.status === 'active').length,
        inactive: clients.filter(c => c.status === 'inactive').length,
        companies: clients.filter(c => c.type === 'company').length,
        individuals: clients.filter(c => c.type === 'individual').length,
        kurumlar: clients.filter(c => c.taxType === 'Kurumlar Vergisi').length,
        gelir: clients.filter(c => c.taxType === 'Gelir Vergisi').length,
      }
    }
  }, [clients])

  const totalTasks = dashboardData.bekleyenBeyanlar + dashboardData.maliMuhurUyari
  const veriBekleniyor = !clients.length && (clientsLoading || !!clientsError)
  const ozetDeger = (deger) => veriBekleniyor ? '—' : deger

  // Yardimci program admin bayragi (yesil ADMIN AKTIF / kirmizi KAPALI):
  // Bu ayar YEREL registry'de tutulur (HKCU AppCompatFlags). Sunucu modu
  // acik olsa bile VPS'e degil, daima yerel yardimciya sorulmalidir.
  const [yardimciAdmin, setYardimciAdmin] = useState(null)
  useEffect(() => {
    let canli = true
    const oku = async () => {
      try {
        const s = await yardimciIsYerel('admin-durum', {}, 8000)
        if (canli) setYardimciAdmin(s?.ok ? !!s.ata : null)
      } catch { if (canli) setYardimciAdmin(null) }
    }
    oku()
    window.addEventListener('mubis-admin-ata-degisti', oku)
    const iv = setInterval(oku, 30000)
    return () => { canli = false; window.removeEventListener('mubis-admin-ata-degisti', oku); clearInterval(iv) }
  }, [])

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400"></div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      {/* ═══════════ ICERIK (sol menu global AdminSidebar'da) ═══════════ */}
      <div className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 pt-16 lg:pt-6">

      {/* ═══════════════════════════════════════════ */}
      {/* KARSILAMA SERIDI + ASISTAN (2.7.542) */}
      {/* ═══════════════════════════════════════════ */}
      <div className="relative bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-950 rounded-2xl border border-blue-700/30 px-6 md:px-8 pt-6 pb-8 mb-6">
        {/* Filigran + dekorlar kendi kivrilma katmaninda — ustbandin kendisi acik
            (overflow-hidden) degil, cunku namaz/imsakiye acilir paneli banda tasmaali */}
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          <img
            src="/ustbar-ataturk.png"
            alt=""
            aria-hidden="true"
            draggable="false"
            className="hidden md:block absolute top-1/2 left-[27%] -translate-y-1/2 w-[30%] max-w-[440px] h-[150%] object-cover select-none opacity-30"
            style={{
              mixBlendMode: 'luminosity',
              WebkitMaskImage: 'radial-gradient(ellipse 75% 65% at 50% 50%, black 40%, transparent 98%)',
              maskImage: 'radial-gradient(ellipse 75% 65% at 50% 50%, black 40%, transparent 98%)'
            }}
          />
          <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-400/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-400/5 rounded-full translate-y-1/2 -translate-x-1/2" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-4">
          {/* Sol: karsilama */}
          <div className="flex-1 min-w-0">
            <div className="text-gray-300 text-lg md:text-xl">{getGreeting()},</div>
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3 flex-wrap">
              <span>{user?.name || user?.username || 'Admin'}</span>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                yardimciAdmin === null ? 'bg-gray-500/20 text-gray-400' : yardimciAdmin ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
              }`} title={yardimciAdmin === null ? 'MUBiS yardımcı programı bu bilgisayarda çalışmıyor' : yardimciAdmin ? 'Yardımcı program Yönetici olarak çalıştırılacak' : 'Yardımcı program yönetici olarak atanmadı — Ayarlar > Ana Ekran Asistanı'}>
                <span className={`w-2 h-2 rounded-full ${yardimciAdmin ? 'bg-green-400' : 'bg-red-400'}`}></span>
                {yardimciAdmin === null ? 'YARDIMCI KAPALI' : yardimciAdmin ? 'ADMIN AKTİF' : 'ADMIN KAPALI'}
              </span>
              <span aria-hidden="true">👋</span>
            </h1>
            {totalTasks > 0 ? (
              <p className="text-gray-300 text-sm md:text-base leading-relaxed mt-1.5">
                Bugün yapmanız gereken <span className="text-yellow-400 font-semibold">{totalTasks} iş</span> var. Öncelik sırasına göre birlikte tamamlayalım.
              </p>
            ) : (
              <p className="text-gray-300 text-sm md:text-base mt-1.5">
                {clientsLoading && !clients.length
                  ? 'Müşteri verileri yükleniyor…'
                  : clientsError && !clients.length
                    ? 'Müşteri verileri şu anda doğrulanamıyor.'
                    : clients.length > 0
                      ? 'Tüm işler güncel görünüyor. Harika bir gün olacak!'
                      : 'Henüz müşteri eklenmemiş. Yeni müşteri ekleyerek başlayabilirsiniz.'}
              </p>
            )}
          </div>
          {/* Orta: tarih + saat + hava, altinda yan yana radyo + namaz vakitleri (Ayarlar'dan acilir) */}
          <div className="flex flex-col items-center gap-3 shrink-0">
            <HavaSaatKarti />
            {kurlarGoster && <KurAltinBandi />}
            <div className="flex flex-wrap items-center justify-center gap-3">
              {radyoGoster && <RadioUstBant />}
              {ytMuzikGoster && <YouTubeMuzik />}
              {spotifyGoster && <SpotifyUstBant />}
              {namazGoster && <NamazVakitleri />}
            </div>
          </div>
          {/* Sag: asistan modeli + konusma balonu */}
          <div className="hidden lg:flex items-end gap-2 shrink-0">
            <div className="relative mb-8">
              <div className="bg-white/95 text-blue-950 rounded-xl rounded-br-sm px-3 py-2 text-xs font-semibold shadow-lg whitespace-nowrap">
                "Doğru veri, sağlam gelecek."
                <span className="absolute -bottom-1 right-5 h-2.5 w-2.5 rotate-45 bg-white/95" />
              </div>
            </div>
            <img
              src={adminCinsiyet === 'kadin' ? '/mascot-admin-kadin.png' : adminCinsiyet === 'erkek2' ? '/mascot-admin-erkek2-v4.png' : adminCinsiyet === 'kadin2' ? '/mascot-admin-kadin2-v2.png' : adminCinsiyet === 'kadin3' ? '/mascot-admin-kadin3-v2.png' : '/mascot-admin-erkek.png'}
              alt={adminCinsiyet === 'kadin' || adminCinsiyet === 'kadin2' || adminCinsiyet === 'kadin3' ? 'Kadın asistan' : 'Erkek asistan'}
              className="h-36 w-auto object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]"
            />
          </div>
        </div>
      </div>

      {clientsError && (
        <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <span>{clientsError}</span>
          <button type="button" onClick={() => refreshClients()} disabled={clientsLoading} className="rounded-lg bg-red-500/20 px-3 py-1.5 font-semibold text-red-100 hover:bg-red-500/30 disabled:opacity-50">
            {clientsLoading ? 'Yeniden deneniyor…' : 'Yeniden dene'}
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/* TEVKİFATLI ALIŞ → KDV2 BEYAN UYARISI */}
      {/* ═══════════════════════════════════════════ */}
      <TevkifatKdv2Uyarisi />

      {/* ═══════════════════════════════════════════ */}
      {/* E-TEBLIGAT UYARISI */}
      {/* ═══════════════════════════════════════════ */}
      <EtebligatUyari />
      {/* 2.7.542: e-Tebligat bildirim simgesi kaldirildi — MUBiS asistan balonu
          uyarir, panel acar ve e-Tebligat sayfasina goturur (MubisAssistant.jsx) */}

      {/* ═══════════════════════════════════════════ */}
      {/* OZET KARTLARI (2.7.542: beyaz kart tasarimi) */}
      {/* ═══════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4 mb-6">
        {/* Bekleyen Beyanlar */}
        <Link
          to="/admin/aylik-beyan-takip"
          className="group bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 bg-red-500 rounded-lg flex items-center justify-center shadow-md shadow-red-500/30">
              <FileText className="w-4.5 h-4.5 text-white" />
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-red-500 group-hover:translate-x-0.5 transition-all" />
          </div>
          <div className="text-2xl font-bold text-white">{ozetDeger(dashboardData.bekleyenBeyanlar)}</div>
          <div className="text-red-500 text-xs font-medium mt-0.5">Bekleyen Beyan</div>
          <div className="text-gray-400 text-[10px]">Son 7 gün</div>
          {dashboardData.gecmisBeyanlar > 0 && (
            <div className="mt-2 text-[10px] bg-red-500/10 text-red-500 px-2 py-0.5 rounded-full inline-block font-medium">
              {dashboardData.gecmisBeyanlar} süresi geçmiş
            </div>
          )}
        </Link>

        {/* Tamamlanan Beyanlar */}
        <Link
          to="/admin/aylik-beyan-takip"
          className="group bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 bg-green-500 rounded-lg flex items-center justify-center shadow-md shadow-green-500/30">
              <CheckCircle className="w-4.5 h-4.5 text-white" />
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-green-500 group-hover:translate-x-0.5 transition-all" />
          </div>
          <div className="text-2xl font-bold text-white">{ozetDeger(dashboardData.tamamlananBeyanlar)}</div>
          <div className="text-green-600 text-xs font-medium mt-0.5">Tamamlanan Beyan</div>
          <div className="text-gray-400 text-[10px]">Bu hafta</div>
        </Link>

        {/* Mali Muhur Uyarlari */}
        <div className="group bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer">
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 bg-amber-500 rounded-lg flex items-center justify-center shadow-md shadow-amber-500/30">
              <Shield className="w-4.5 h-4.5 text-white" />
            </div>
            {dashboardData.maliMuhurUyari > 0 && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400"></span>
              </span>
            )}
          </div>
          <div className="text-2xl font-bold text-white">{ozetDeger(dashboardData.maliMuhurUyari)}</div>
          <div className="text-amber-600 text-xs font-medium mt-0.5">Mali Mühür / e-İmza</div>
          <div className="text-gray-400 text-[10px]">Kontrol gerekli</div>
        </div>

        {/* Musteri Sayisi */}
        <Link
          to="/admin/musteriler"
          className="group bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 bg-blue-500 rounded-lg flex items-center justify-center shadow-md shadow-blue-500/30">
              <Users className="w-4.5 h-4.5 text-white" />
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
          </div>
          <div className="text-2xl font-bold text-white">{ozetDeger(dashboardData.clientStats.total)}</div>
          <div className="text-blue-600 text-xs font-medium mt-0.5">Toplam Müşteri</div>
          <div className="text-gray-400 text-[10px]">{ozetDeger(dashboardData.clientStats.active)} aktif</div>
        </Link>

        {/* Toplam Is */}
        <div className="col-span-2 lg:col-span-1 bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 hover:-translate-y-0.5 transition-all duration-300">
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 bg-violet-500 rounded-lg flex items-center justify-center shadow-md shadow-violet-500/30">
              <Zap className="w-4.5 h-4.5 text-white" />
            </div>
            <Activity className="w-4 h-4 text-violet-300" />
          </div>
          <div className="text-2xl font-bold text-white">{ozetDeger(totalTasks)}</div>
          <div className="text-violet-600 text-xs font-medium mt-0.5">Toplam Bekleyen İş</div>
          <div className="text-gray-400 text-[10px]">Süresi yaklaşan</div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* ANA İÇERİK - 2 KOLON */}
      {/* ═══════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* ── SOL KOLON (2/3) ── */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* YAKLASAN SON TARİHLER */}
          <div className="bg-blue-800/20 rounded-2xl border border-blue-700/30 overflow-hidden">
            <div className="px-5 py-4 border-b border-blue-700/30 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-red-500/20 rounded-lg flex items-center justify-center">
                  <Timer className="w-4 h-4 text-red-400" />
                </div>
                <div>
                  <h2 className="text-white font-semibold text-sm">Yaklasan Son Tarihler</h2>
                  <p className="text-gray-500 text-[11px]">Öncelik sırasına göre</p>
                </div>
              </div>
              {dashboardData.groupedDeadlines.length > 5 && (
                <button
                  onClick={() => setShowAllDeadlines(!showAllDeadlines)}
                  className="text-xs text-yellow-400 hover:text-yellow-300 transition-colors font-medium"
                >
                  {showAllDeadlines ? 'Daralt' : `Tumunu Gor (${dashboardData.groupedDeadlines.length})`}
                </button>
              )}
            </div>

            <div className="divide-y divide-blue-700/20">
              {dashboardData.groupedDeadlines.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <CheckCircle className="w-10 h-10 text-green-500/40 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">Bekleyen beyan bulunmuyor</p>
                  <p className="text-gray-500 text-xs mt-1">Tum beyanlar guncel!</p>
                </div>
              ) : (
                dashboardData.groupedDeadlines.map((group) => {
                  const urgency = getUrgencyColor(group.daysLeft)
                  return (
                    <div
                      key={group.typeId}
                      onClick={() => navigate('/admin/aylik-beyan-takip')}
                      className={`px-5 py-3.5 flex items-center gap-3 hover:bg-blue-800/20 transition-colors cursor-pointer ${
                        group.daysLeft <= 0 ? 'bg-red-500/5' : ''
                      }`}
                    >
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${urgency.badge}`} />
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${urgency.bg} ${urgency.text}`}>
                            {group.type}
                          </span>
                          <span className="text-white text-sm font-semibold">
                            {group.count} musteri
                          </span>
                        </div>
                        <div className="text-gray-500 text-[11px] mt-0.5">
                          {group.odemeTarihi ? (
                            <>Beyan: {formatDateTR(group.deadline)} • Ödeme: {formatDateTR(group.odemeTarihi)}</>
                          ) : (
                            <>Son tarih: {formatDateTR(group.deadline)}</>
                          )}
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <div className={`text-xs font-bold ${urgency.text}`}>
                          {urgency.label}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {dashboardData.deadlines.length > 0 && (
              <div className="px-5 py-3 border-t border-blue-700/30 bg-blue-900/20">
                <Link
                  to="/admin/aylik-beyan-takip"
                  className="text-xs text-yellow-400 hover:text-yellow-300 transition-colors font-medium flex items-center gap-1"
                >
                  <span>Aylik Beyan Takip'e Git</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            )}
          </div>

          {/* MALİ MUHUR / e-IMZA UYARILARI */}
          {dashboardData.maliMuhurList.length > 0 && (
            <div className="bg-yellow-500/5 rounded-2xl border border-yellow-500/20 overflow-hidden">
              <div className="px-5 py-4 border-b border-yellow-500/20 flex items-center gap-2.5">
                <div className="w-8 h-8 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                  <Shield className="w-4 h-4 text-yellow-400" />
                </div>
                <div>
                  <h2 className="text-white font-semibold text-sm">Mali Mühür / e-İmza Uyarıları</h2>
                  <p className="text-yellow-500/60 text-[11px]">60 gun icinde suresi dolacaklar</p>
                </div>
              </div>
              <div className="divide-y divide-yellow-500/10">
                {dashboardData.maliMuhurList.map((item, i) => (
                  <div
                    key={i}
                    onClick={() => navigate(`/admin/client/${item.clientId}`)}
                    className="px-5 py-3 flex items-center gap-3 hover:bg-yellow-500/5 transition-colors cursor-pointer"
                  >
                    <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${
                      item.daysLeft <= 15 ? 'text-red-400' : item.daysLeft <= 30 ? 'text-orange-400' : 'text-yellow-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <span className="text-white text-sm font-medium truncate block">{item.client}</span>
                       <span className="text-gray-500 text-[11px]">{item.type} - Bitis: {formatDateTR(item.endDate)}</span>
                    </div>
                    <div className={`text-xs font-bold ${
                      item.daysLeft <= 15 ? 'text-red-400' : item.daysLeft <= 30 ? 'text-orange-400' : 'text-yellow-400'
                    }`}>
                      {item.daysLeft} gun
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MÜŞTERİ LİSTESİ OZET */}
          <div className="bg-blue-800/20 rounded-2xl border border-blue-700/30 overflow-hidden">
            <div className="px-5 py-4 border-b border-blue-700/30 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                  <Users className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-white font-semibold text-sm">Musteriler</h2>
                  <p className="text-gray-500 text-[11px]">{dashboardData.clientStats.total} kayitli musteri</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to="/admin/clients/new"
                  className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-3 py-1.5 rounded-lg font-semibold text-xs hover:shadow-lg hover:shadow-yellow-500/30 transition-all duration-300 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Yeni</span>
                </Link>
                <Link
                  to="/admin/musteriler"
                  className="text-xs text-yellow-400 hover:text-yellow-300 transition-colors font-medium flex items-center gap-1"
                >
                  <span>Tumu</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>

            {/* Mini musteri istatistikleri */}
            <div className="grid grid-cols-3 sm:grid-cols-6 divide-x divide-blue-700/20 border-b border-blue-700/20">
              {[
                { label: 'Toplam', value: dashboardData.clientStats.total, color: 'text-white' },
                { label: 'Aktif', value: dashboardData.clientStats.active, color: 'text-green-400' },
                { label: 'Pasif', value: dashboardData.clientStats.inactive, color: 'text-red-400' },
                { label: 'Sirket', value: dashboardData.clientStats.companies, color: 'text-yellow-400' },
                { label: 'Kurumlar', value: dashboardData.clientStats.kurumlar, color: 'text-blue-400' },
                { label: 'Gelir', value: dashboardData.clientStats.gelir, color: 'text-orange-400' },
              ].map((stat, i) => (
                <div key={i} className="px-3 py-2.5 text-center">
                  <div className={`text-lg font-bold ${stat.color}`}>{stat.value}</div>
                  <div className="text-gray-500 text-[10px]">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Son eklenen musteriler */}
            <div className="divide-y divide-blue-700/20">
              {clients.length === 0 ? (
                <div className="px-5 py-6 text-center">
                  <Users className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">{clientsLoading ? 'Müşteriler yükleniyor…' : clientsError ? 'Müşteri verileri alınamadı' : 'Henuz musteri eklenmemis'}</p>
                </div>
              ) : (
                [...clients]
                  .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
                  .slice(0, 5)
                  .map(client => (
                    <div
                      key={client.id}
                      onClick={() => navigate(`/admin/client/${client.id}`)}
                      className="px-5 py-3 flex items-center gap-3 hover:bg-blue-800/20 transition-colors cursor-pointer"
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                        client.type === 'company'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-purple-500/20 text-purple-400'
                      }`}>
                        {client.type === 'company' ? (
                          <Building2 className="w-4 h-4" />
                        ) : (
                          <UserCheck className="w-4 h-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-sm font-medium truncate">{client.name}</div>
                        <div className="text-gray-500 text-[11px] truncate">
                          {client.company || client.taxOffice || client.city || '-'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                          client.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {client.status === 'active' ? 'Aktif' : 'Pasif'}
                        </span>
                        <ChevronRight className="w-4 h-4 text-gray-600" />
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>

        {/* ── SAĞ KOLON (1/3) ── */}
        <div className="space-y-6">

          {/* VERGİ TAKVİMİ (mini) */}
          <MiniTakvim isaretliGunler={dashboardData.groupedDeadlines.map(g => g.deadline)} />

          {/* HIZLI ERİŞİM */}
          <div className="bg-blue-800/20 rounded-2xl border border-blue-700/30 overflow-hidden">
            <div className="px-5 py-4 border-b border-blue-700/30 flex items-center gap-2.5">
              <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
                <Zap className="w-4 h-4 text-purple-400" />
              </div>
              <h2 className="text-white font-semibold text-sm">Hızlı Erişim</h2>
            </div>
            <div className="p-3 grid grid-cols-2 gap-2">
              {[
                { to: '/admin/musteriler', icon: Users, label: 'Müşteriler', color: 'from-blue-500 to-blue-600' },
                { to: '/admin/clients/new', icon: Plus, label: 'Yeni Müşteri', color: 'from-yellow-400 to-yellow-600' },
                { to: '/admin/aylik-beyan-takip', icon: CalendarDays, label: 'Aylık Beyan', color: 'from-emerald-500 to-emerald-600' },
                { to: '/admin/aylik-beyan-takip', icon: FileCheck, label: 'Beyan Takip', color: 'from-teal-500 to-teal-600' },
                { to: '/admin/gonderim-merkezi', icon: Send, label: 'Gönderim Merkezi', color: 'from-pink-500 to-pink-600' },
                { to: '/admin/duyuru-merkezi', icon: Megaphone, label: 'Duyuru Merkezi', color: 'from-purple-500 to-purple-600' },
                { to: '/admin/borc-bildirim', icon: DollarSign, label: 'Borç Bildirim', color: 'from-red-500 to-red-600' },
                { to: '/admin/smart-import', icon: Brain, label: 'AI Import', color: 'from-purple-500 to-purple-600' },
                { to: '/admin/e-invoice', icon: Receipt, label: 'e-Fatura', color: 'from-indigo-500 to-indigo-600' },
                { to: '/admin/documents', icon: FolderOpen, label: 'Evrak Merkezi', color: 'from-pink-500 to-pink-600' },
                { to: '/admin/tax-calendar', icon: Calendar, label: 'Vergi Takvimi', color: 'from-red-500 to-red-600' },
                { to: '/admin/tax-center', icon: Landmark, label: 'Vergi Merkezi', color: 'from-amber-500 to-amber-600' },
                { to: '/admin/institutions', icon: Building2, label: 'Kurumlar', color: 'from-slate-500 to-slate-600' },
                { to: '/admin/notifications', icon: Bell, label: 'Bildirimler', color: 'from-rose-500 to-rose-600' },
              ].map((item, i) => (
                <Link
                  key={i}
                  to={item.to}
                  className="group flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-blue-800/30 transition-all duration-200"
                >
                  <div className={`w-8 h-8 bg-gradient-to-br ${item.color} rounded-lg flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow flex-shrink-0`}>
                    <item.icon className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="text-gray-300 text-xs font-medium group-hover:text-white transition-colors">{item.label}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* BU AYDAKİ DURUM */}
          <div className="bg-blue-800/20 rounded-2xl border border-blue-700/30 overflow-hidden">
            <div className="px-5 py-4 border-b border-blue-700/30 flex items-center gap-2.5">
              <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-white font-semibold text-sm">{getMonthName(new Date().getMonth())} Durumu</h2>
                <p className="text-gray-500 text-[11px]">{new Date().getFullYear()}</p>
              </div>
            </div>
            <div className="p-5">
              {/* Progress bar */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-gray-400">Tamamlanma</span>
                  <span className="text-white font-semibold">
                    {dashboardData.toplamBeyanlar > 0 
                      ? Math.round((dashboardData.tamamlananBeyanlar / dashboardData.toplamBeyanlar) * 100)
                      : 0
                    }%
                  </span>
                </div>
                <div className="w-full bg-blue-900/50 rounded-full h-2.5">
                  <div
                    className="bg-gradient-to-r from-emerald-400 to-green-500 h-2.5 rounded-full transition-all duration-500"
                    style={{ 
                      width: `${dashboardData.toplamBeyanlar > 0 
                        ? (dashboardData.tamamlananBeyanlar / dashboardData.toplamBeyanlar) * 100 
                        : 0}%` 
                    }}
                  />
                </div>
              </div>

              {/* Detay */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-400" />
                    <span className="text-gray-400 text-xs">Tamamlanan</span>
                  </div>
                  <span className="text-green-400 text-sm font-bold">{dashboardData.tamamlananBeyanlar}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-yellow-400" />
                    <span className="text-gray-400 text-xs">Bekleyen</span>
                  </div>
                  <span className="text-yellow-400 text-sm font-bold">{dashboardData.bekleyenBeyanlar}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-400" />
                    <span className="text-gray-400 text-xs">Suresi Gecmis</span>
                  </div>
                  <span className="text-red-400 text-sm font-bold">{dashboardData.gecmisBeyanlar}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-blue-700/30">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-white" />
                    <span className="text-gray-300 text-xs font-medium">Toplam Beyan</span>
                  </div>
                  <span className="text-white text-sm font-bold">{dashboardData.toplamBeyanlar}</span>
                </div>
              </div>
            </div>
          </div>

          {/* BEYAN TİPLERİNE GORE DAĞILIM */}
          {dashboardData.deadlines.length > 0 && (
            <div className="bg-blue-800/20 rounded-2xl border border-blue-700/30 overflow-hidden">
              <div className="px-5 py-4 border-b border-blue-700/30 flex items-center gap-2.5">
                <div className="w-8 h-8 bg-indigo-500/20 rounded-lg flex items-center justify-center">
                  <BarChart3 className="w-4 h-4 text-indigo-400" />
                </div>
                <h2 className="text-white font-semibold text-sm">Bekleyen Beyan Dagilimi</h2>
              </div>
              <div className="p-4 space-y-2">
                {(() => {
                  const typeCounts = {}
                  dashboardData.deadlines.forEach(d => {
                    typeCounts[d.type] = (typeCounts[d.type] || 0) + 1
                  })
                  const maxCount = Math.max(...Object.values(typeCounts))
                  return Object.entries(typeCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => (
                      <div key={type}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-gray-400">{type}</span>
                          <span className="text-white font-semibold">{count}</span>
                        </div>
                        <div className="w-full bg-blue-900/50 rounded-full h-1.5">
                          <div
                            className="bg-gradient-to-r from-indigo-400 to-purple-500 h-1.5 rounded-full transition-all duration-500"
                            style={{ width: `${(count / maxCount) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))
                })()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SITE İSTATİSTİKLERİ (Google Analytics 4) — ana ekranın en altında */}
      {['admin', 'super_admin'].includes(user?.role) && (
        <div className="mt-6">
          <AnalyticsOzet gun={30} />
        </div>
      )}
      </div>
    </div>
  )
}


