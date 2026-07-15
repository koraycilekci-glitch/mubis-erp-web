import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { Link, useNavigate } from 'react-router-dom'
import { 
  Plus, Search, Filter, MapPin, Trash2, X, Eye, ListChecks, FileText,
  Brain, Calendar, Clock, AlertTriangle, CheckCircle, ChevronRight,
  Users, Building2, UserCheck, TrendingUp, Bell, Shield, Mail,
  FileCheck, FolderOpen, Landmark, PenTool, BarChart3, ArrowRight,
  Zap, Star, CircleDot, Timer, CalendarDays, BookOpen, Receipt,
  ShieldCheck, FileSearch, Briefcase, Settings, Activity
} from 'lucide-react'
import { getMonthName } from '../utils/dateUtils'

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
  if (hour < 12) return 'Gunaydin'
  if (hour < 18) return 'Iyi gunler'
  return 'Iyi aksamlar'
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

// ── Ana Dashboard Bileşeni ──
export default function AdminDashboard() {
  const { user, getClients } = useAuth()
  const navigate = useNavigate()
  const [clients, setClients] = useState([])
  const [currentTime, setCurrentTime] = useState(new Date())
  const [showAllDeadlines, setShowAllDeadlines] = useState(false)
  const [showAllTasks, setShowAllTasks] = useState(false)

  useEffect(() => {
    setClients(getClients())
  }, [getClients])

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

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

        // Son tarih hesapla
        const deadlineDate = new Date(currentYear, currentMonth, beyanType.day)
        const daysLeft = getDaysUntil(deadlineDate)

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
          clients: []
        }
      }
      groupedDeadlines[d.typeId].count++
      groupedDeadlines[d.typeId].clients.push(d.client)
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

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400"></div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

      {/* ═══════════════════════════════════════════ */}
      {/* MUBİS AI KARŞILAMA */}
      {/* ═══════════════════════════════════════════ */}
      <div className="relative overflow-hidden bg-gradient-to-r from-blue-900/60 via-blue-800/40 to-indigo-900/60 rounded-2xl border border-blue-700/30 p-6 md:p-8 mb-6">
        {/* Dekoratif arka plan */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-400/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-400/5 rounded-full translate-y-1/2 -translate-x-1/2" />
        
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-xl flex items-center justify-center shadow-lg shadow-yellow-500/20">
                <Brain className="w-5 h-5 text-blue-950" />
              </div>
              <div>
                <div className="text-gray-400 text-xs font-medium tracking-wider uppercase">MUBİS AI</div>
                <div className="text-gray-500 text-[11px]">{getTurkishDate()}</div>
              </div>
            </div>
            
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
              {getGreeting()}, {user?.name || user?.username || 'Admin'}
            </h1>
            
            {totalTasks > 0 ? (
              <p className="text-gray-300 text-sm md:text-base leading-relaxed">
                Bugun yapmaniz gereken <span className="text-yellow-400 font-semibold">{totalTasks} is</span> var.
                {dashboardData.gecmisBeyanlar > 0 && (
                  <span className="text-red-400 font-semibold"> {dashboardData.gecmisBeyanlar} beyanin suresi gecmis!</span>
                )}
                {dashboardData.todaysTasks.length > 0 && dashboardData.gecmisBeyanlar === 0 && (
                  <span> Oncelik sirasina gore birlikte tamamlayalim.</span>
                )}
              </p>
            ) : (
              <p className="text-gray-300 text-sm md:text-base">
                {clients.length > 0 
                  ? 'Tum isler guncel gorunuyor. Harika bir gun olacak!'
                  : 'Hendi musteri eklenmemis. Yeni musteri ekleyerek baslayabilirsiniz.'
                }
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <div className="text-right hidden md:block">
              <div className="text-3xl font-bold text-white tabular-nums">
                {currentTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="text-gray-500 text-xs">
                {getMonthName(currentTime.getMonth())} {currentTime.getFullYear()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* OZET KARTLARI */}
      {/* ═══════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4 mb-6">
        {/* Bekleyen Beyanlar */}
        <Link 
          to="/admin/aylik-beyan-takip"
          className="group bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 hover:border-red-500/50 hover:bg-red-500/5 transition-all duration-300 cursor-pointer"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 bg-red-500/20 rounded-lg flex items-center justify-center">
              <FileText className="w-4.5 h-4.5 text-red-400" />
            </div>
            <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-red-400 transition-colors" />
          </div>
          <div className="text-2xl font-bold text-red-400">{dashboardData.bekleyenBeyanlar}</div>
          <div className="text-gray-400 text-xs mt-0.5">Bekleyen Beyan</div>
          {dashboardData.gecmisBeyanlar > 0 && (
            <div className="mt-2 text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full inline-block font-medium">
              {dashboardData.gecmisBeyanlar} suresi gecmis
            </div>
          )}
        </Link>

        {/* Tamamlanan Beyanlar */}
        <Link 
          to="/admin/all-beyan"
          className="group bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 hover:border-green-500/50 hover:bg-green-500/5 transition-all duration-300 cursor-pointer"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 bg-green-500/20 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-4.5 h-4.5 text-green-400" />
            </div>
            <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-green-400 transition-colors" />
          </div>
          <div className="text-2xl font-bold text-green-400">{dashboardData.tamamlananBeyanlar}</div>
          <div className="text-gray-400 text-xs mt-0.5">Tamamlanan Beyan</div>
        </Link>

        {/* Mali Muhur Uyarilari */}
        <div className="group bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 hover:border-yellow-500/50 hover:bg-yellow-500/5 transition-all duration-300 cursor-pointer">
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 bg-yellow-500/20 rounded-lg flex items-center justify-center">
              <Shield className="w-4.5 h-4.5 text-yellow-400" />
            </div>
            {dashboardData.maliMuhurUyari > 0 && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-400"></span>
              </span>
            )}
          </div>
          <div className="text-2xl font-bold text-yellow-400">{dashboardData.maliMuhurUyari}</div>
          <div className="text-gray-400 text-xs mt-0.5">Mali Muhur / e-Imza</div>
        </div>

        {/* Musteri Sayisi */}
        <Link 
          to="/admin/musteriler"
          className="group bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all duration-300 cursor-pointer"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <Users className="w-4.5 h-4.5 text-blue-400" />
            </div>
            <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-blue-400 transition-colors" />
          </div>
          <div className="text-2xl font-bold text-blue-400">{dashboardData.clientStats.total}</div>
          <div className="text-gray-400 text-xs mt-0.5">Toplam Musteri</div>
          <div className="mt-2 text-[10px] text-gray-500">
            {dashboardData.clientStats.active} aktif
          </div>
        </Link>

        {/* Toplam Is */}
        <div className="col-span-2 lg:col-span-1 bg-gradient-to-br from-yellow-500/10 to-orange-500/10 rounded-xl p-4 border border-yellow-500/20">
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-lg flex items-center justify-center shadow-lg shadow-yellow-500/20">
              <Zap className="w-4.5 h-4.5 text-blue-950" />
            </div>
            <Activity className="w-4 h-4 text-yellow-500/50" />
          </div>
          <div className="text-3xl font-bold text-white">{totalTasks}</div>
          <div className="text-yellow-400/80 text-xs mt-0.5 font-medium">Toplam Bekleyen Is</div>
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
                  <p className="text-gray-500 text-[11px]">Oncelik sirasina gore</p>
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
                          Son tarih: {group.deadline.toLocaleDateString('tr-TR')}
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
                  <h2 className="text-white font-semibold text-sm">Mali Muhur / e-Imza Uyarilari</h2>
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
                      <span className="text-gray-500 text-[11px]">{item.type} - Bitis: {new Date(item.endDate).toLocaleDateString('tr-TR')}</span>
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
                  <p className="text-gray-500 text-sm">Henuz musteri eklenmemis</p>
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
          
          {/* HIZLI ERİŞİM */}
          <div className="bg-blue-800/20 rounded-2xl border border-blue-700/30 overflow-hidden">
            <div className="px-5 py-4 border-b border-blue-700/30 flex items-center gap-2.5">
              <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
                <Zap className="w-4 h-4 text-purple-400" />
              </div>
              <h2 className="text-white font-semibold text-sm">Hizli Erisim</h2>
            </div>
            <div className="p-3 grid grid-cols-2 gap-2">
              {[
                { to: '/admin/musteriler', icon: Users, label: 'Musteriler', color: 'from-blue-500 to-blue-600' },
                { to: '/admin/clients/new', icon: Plus, label: 'Yeni Musteri', color: 'from-yellow-400 to-yellow-600' },
                { to: '/admin/aylik-beyan-takip', icon: CalendarDays, label: 'Aylik Beyan', color: 'from-emerald-500 to-emerald-600' },
                { to: '/admin/beyan-takip', icon: FileCheck, label: 'Beyan Takip', color: 'from-teal-500 to-teal-600' },
                { to: '/admin/all-beyan', icon: BarChart3, label: 'Beyan Rapor', color: 'from-cyan-500 to-cyan-600' },
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
    </div>
  )
}
