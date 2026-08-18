import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import {
  Phone, Mail, ChevronDown, Menu, X,
  UserCircle2, Calculator, FileText, Users, BarChart3, Shield, CalendarDays,
  FileArchive, FileCheck, Building2
} from 'lucide-react'

const SosyalIkon = ({ d }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d={d} /></svg>
)
const FACEBOOK_D = 'M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06C2 17.08 5.66 21.24 10.44 22v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.49-3.92 3.77-3.92 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.44 2.91h-2.34V22C18.34 21.24 22 17.08 22 12.06z'
const INSTAGRAM_D = 'M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zm0 3.29A6.55 6.55 0 1 0 18.55 12 6.55 6.55 0 0 0 12 5.45zm0 10.8A4.25 4.25 0 1 1 16.25 12 4.25 4.25 0 0 1 12 16.25zm8.34-11.06a1.53 1.53 0 1 1-1.53-1.53 1.53 1.53 0 0 1 1.53 1.53z'
const LINKEDIN_D = 'M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05a3.74 3.74 0 0 1 3.37-1.85c3.6 0 4.27 2.37 4.27 5.46zM5.34 7.43a2.07 2.07 0 1 1 2.06-2.07 2.07 2.07 0 0 1-2.06 2.07zM7.12 20.45H3.55V9h3.57zM22.22 0H1.77A1.75 1.75 0 0 0 0 1.73v20.54A1.75 1.75 0 0 0 1.77 24h20.45A1.76 1.76 0 0 0 24 22.27V1.73A1.76 1.76 0 0 0 22.22 0z'

const MENU = [
  { label: 'Ana Sayfa', to: '/' },
  {
    label: 'Hizmetlerimiz',
    items: [
      { label: 'Beyanname Takibi', to: '/ozellikler', icon: FileText },
      { label: 'Müşteri Yönetimi', to: '/ozellikler', icon: Users },
      { label: 'Raporlama', to: '/ozellikler', icon: BarChart3 },
      { label: 'Vergi Takvimi', to: '/ozellikler', icon: CalendarDays }
    ]
  },
  {
    label: 'Çözümlerimiz',
    items: [
      { label: 'Mali Müşavir Paneli', to: '/ozellikler', icon: Building2 },
      { label: 'Müşteri Portalı', to: '/ozellikler', icon: UserCircle2 },
      { label: 'Güvenli Altyapı', to: '/ozellikler', icon: Shield }
    ]
  },
  {
    label: 'e-Belgeler',
    items: [
      { label: 'e-Fatura', to: '/ozellikler', icon: FileText },
      { label: 'e-Arşiv', to: '/ozellikler', icon: FileArchive },
      { label: 'e-İrsaliye', to: '/ozellikler', icon: FileCheck },
      { label: 'e-Defter', to: '/ozellikler', icon: FileArchive }
    ]
  },
  { label: 'Hesaplamalar', to: '/hesaplamalar' },
  { label: 'İletişim', to: '/iletisim' }
]

export default function PublicHeader() {
  const location = useLocation()
  const navigate = useNavigate()
  const [mobilAcik, setMobilAcik] = useState(false)
  const [acikMenu, setAcikMenu] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    function disariTikla(e) {
      if (ref.current && !ref.current.contains(e.target)) setAcikMenu(null)
    }
    document.addEventListener('mousedown', disariTikla)
    return () => document.removeEventListener('mousedown', disariTikla)
  }, [])

  useEffect(() => {
    setMobilAcik(false)
    setAcikMenu(null)
  }, [location.pathname])

  const aktif = (to) => location.pathname === to

  return (
    <header className="sticky top-0 z-50">
      {/* Ust ince bar */}
      <div className="hidden lg:block bg-[#0b1d3a] border-b border-blue-800/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-10 flex items-center justify-between text-[13px]">
          <div className="flex items-center gap-6 text-blue-200">
            <a href="tel:+902122606667" className="flex items-center gap-2 hover:text-white transition-colors">
              <Phone className="w-3.5 h-3.5" />
              0 (212) 260 66 67
            </a>
            <a href="mailto:info@mubiserp.com" className="flex items-center gap-2 hover:text-white transition-colors">
              <Mail className="w-3.5 h-3.5" />
              info@mubiserp.com
            </a>
          </div>
          <div className="flex items-center gap-5 text-blue-200">
            <div className="flex items-center gap-3">
              <a href="https://facebook.com" target="_blank" rel="noreferrer" className="hover:text-white transition-colors"><SosyalIkon d={FACEBOOK_D} /></a>
              <a href="https://instagram.com" target="_blank" rel="noreferrer" className="hover:text-white transition-colors"><SosyalIkon d={INSTAGRAM_D} /></a>
              <a href="https://linkedin.com" target="_blank" rel="noreferrer" className="hover:text-white transition-colors"><SosyalIkon d={LINKEDIN_D} /></a>
            </div>
            <span className="w-px h-4 bg-blue-700/60" />
            <Link to="/iletisim" className="hover:text-white transition-colors">Destek</Link>
            <Link to="/ozellikler" className="hover:text-white transition-colors">Hakkımızda</Link>
          </div>
        </div>
      </div>

      {/* Ana bar */}
      <nav className="bg-[#0a1930]/95 backdrop-blur-md border-b border-blue-800/40" ref={ref}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-[74px] gap-4">
            <Link to="/" className="flex-shrink-0">
              <img src="/logo-text.png" alt="MUBiS ERP" className="h-12 lg:h-14 w-auto object-contain" />
            </Link>

            {/* Masaustu menu */}
            <div className="hidden lg:flex items-center gap-1">
              {MENU.map(m => (
                m.items ? (
                  <div key={m.label} className="relative">
                    <button
                      onClick={() => setAcikMenu(acikMenu === m.label ? null : m.label)}
                      className="flex items-center gap-1 px-4 py-2 text-[15px] font-medium text-blue-100 hover:text-white transition-colors"
                    >
                      {m.label}
                      <ChevronDown className={`w-4 h-4 transition-transform ${acikMenu === m.label ? 'rotate-180' : ''}`} />
                    </button>
                    {acikMenu === m.label && (
                      <div className="absolute top-full left-0 mt-1 w-60 bg-[#0f2547] rounded-xl shadow-2xl border border-blue-700/50 py-2 z-50">
                        {m.items.map(it => (
                          <Link
                            key={it.label}
                            to={it.to}
                            onClick={() => setAcikMenu(null)}
                            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-blue-100 hover:bg-blue-800/50 hover:text-white transition-colors"
                          >
                            <it.icon className="w-4 h-4 text-yellow-400" />
                            {it.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <Link
                    key={m.label}
                    to={m.to}
                    className={`relative px-4 py-2 text-[15px] font-medium transition-colors ${
                      aktif(m.to) ? 'text-white' : 'text-blue-100 hover:text-white'
                    }`}
                  >
                    {m.label}
                    {aktif(m.to) && <span className="absolute left-4 right-4 -bottom-[18px] h-[3px] bg-blue-400 rounded-full" />}
                  </Link>
                )
              ))}
            </div>

            <div className="hidden lg:flex items-center gap-3">
              <Link
                to="/giris"
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-semibold text-[15px] shadow-lg shadow-blue-900/40 transition-colors"
              >
                <UserCircle2 className="w-5 h-5" />
                Müşteri Girişi
              </Link>
            </div>

            {/* Mobil buton */}
            <div className="flex lg:hidden items-center gap-2">
              <Link
                to="/hesaplamalar"
                className="p-2.5 rounded-lg bg-orange-600/80 text-white"
                title="Hesaplamalar"
              >
                <Calculator className="w-5 h-5" />
              </Link>
              <button
                onClick={() => setMobilAcik(v => !v)}
                className="p-2.5 rounded-lg text-white hover:bg-blue-800/40 transition-colors"
              >
                {mobilAcik ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>

          {/* Mobil menu */}
          {mobilAcik && (
            <div className="lg:hidden pb-4 border-t border-blue-800/40 pt-3 space-y-1">
              {MENU.map(m => (
                m.items ? (
                  <div key={m.label}>
                    <button
                      onClick={() => setAcikMenu(acikMenu === m.label ? null : m.label)}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-blue-100 font-medium"
                    >
                      {m.label}
                      <ChevronDown className={`w-4 h-4 transition-transform ${acikMenu === m.label ? 'rotate-180' : ''}`} />
                    </button>
                    {acikMenu === m.label && (
                      <div className="pl-4 space-y-1 pb-1">
                        {m.items.map(it => (
                          <Link key={it.label} to={it.to} className="flex items-center gap-2 px-3 py-2 text-sm text-blue-200 hover:text-white">
                            <it.icon className="w-4 h-4 text-yellow-400" />
                            {it.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <Link key={m.label} to={m.to} className="block px-3 py-2.5 text-blue-100 font-medium hover:text-white">
                    {m.label}
                  </Link>
                )
              ))}
              <button
                onClick={() => navigate('/giris')}
                className="w-full mt-2 flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-xl font-semibold"
              >
                <UserCircle2 className="w-5 h-5" />
                Müşteri Girişi
              </button>
            </div>
          )}
        </div>
      </nav>
    </header>
  )
}
