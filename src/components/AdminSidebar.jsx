import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import { supabase } from '../lib/supabase'
import {
  LayoutDashboard, Users, FileText, Upload, Receipt, DollarSign,
  UserCheck, BarChart3, CalendarDays, Megaphone, MessageSquareText,
  Send, Calculator, Settings, Landmark, FolderOpen, Brain, FileArchive,
  FileCheck, ChevronDown, ChevronRight, Menu as MenuIcon, X, Building2,
  KeyRound, Download, Inbox, Camera, LogOut, ClipboardCheck, TableProperties, ScanLine, FileSpreadsheet, CreditCard, Shield
} from 'lucide-react'
import { kiraArtisBildirimleriniOlustur } from '../services/kiraService'
import { YARDIMCI_EXE_URL } from '../config/indirmeLinkleri'

// Sol menu yapisi. children varsa acilir alt menu olur.
// PERSONEL YETKILERI: her oge bir anahtarla izlenir — üst seviye ogerlerde
// rota yolu, gruplarda grup id; alt ogelerde kendi rota yolu. Anahtarlar
// offices.personel_yetkileri jsonb'sinde saklanir (Ofis Yönetimi > Detay).
export const MENU = [
  { to: '/admin', icon: LayoutDashboard, label: 'AnaSayfa' },
  {
    id: 'beyan-takip', icon: CalendarDays, label: 'Beyan Takip',
    children: [
      { to: '/admin/aylik-beyan-takip', icon: CalendarDays, label: 'Aylık Beyan Takip' },
      { to: '/admin/beyanname-kontrol', icon: ClipboardCheck, label: 'Beyanname Kontrol Listesi' },
      { to: '/admin/kontrol-merkezi', icon: TableProperties, label: 'Kontrol Merkezi' },
      { to: '/admin/defter-turu-gecisi', icon: BarChart3, label: 'Defter Türü Geçişi' }
    ]
  },
  {
    id: 'beyanname-gonderim', icon: Send, label: 'Beyanname Gönderim',
    children: [
      { to: '/admin/beyanname-gonderim', icon: Send, label: 'e-Beyanname' },
      { to: '/admin/beyan-hazirlama', icon: FileSpreadsheet, label: 'Beyan Hazırlama' }
    ]
  },
  { to: '/admin/musteriler', icon: Users, label: 'Müşteriler' },
  {
    id: 'fatura-islemleri', icon: Receipt, label: 'Fatura İşlemleri',
    children: [
      { to: '/admin/fatura-sorgulama', icon: Receipt, label: 'Fatura Sorgulama' },
      { to: '/admin/fisler', icon: Receipt, label: 'Fişler' },
      { to: '/admin/taramalar', icon: ScanLine, label: 'Taramalar' },
      { to: '/admin/muhasebe-kayit', icon: Calculator, label: 'Fatura Muhasebeleştime' }
    ]
  },
  { to: '/admin/kdv-dokumleri', icon: BarChart3, label: 'KDV Dökümleri' },
  { to: '/admin/kredi-karti-hasilat', icon: CreditCard, label: 'Kredi Kartı Hasılatı (POS)' },
  { to: '/admin/mizan-kontrol', icon: Shield, label: 'Mizan (TDHP) Kontrolü' },
  { to: '/admin/beyan-zorunluluk-matrixi', icon: FileText, label: 'Beyan Zorunluluk Matrisi' },
  { to: '/admin/musteri-borc-dokumu', icon: Landmark, label: 'Müşteri Borç Dökümü' },
  { to: '/admin/efatura-islemleri', icon: FileText, label: 'E-Fatura İşlemleri' },
  { to: '/admin/etebligatlar', icon: Inbox, label: 'e-Tebligat' },
  {
    id: 'beyannamelerim', icon: FileCheck, label: 'Beyannamelerim',
    children: [
      { to: '/admin/beyannamelerim/documents', icon: FolderOpen, label: 'Evraklarım' },
      { to: '/admin/beyannamelerim/beyannamelerim', icon: FileCheck, label: 'Beyanname Takibi' },
      { to: '/admin/beyannamelerim/invoices', icon: FileText, label: 'Faturalarım' },
      { to: '/admin/beyannamelerim/tebligatlarim', icon: Inbox, label: 'e-Tebligatlarım' },
      { to: '/admin/beyannamelerim/messages', icon: MessageSquareText, label: 'Mesajlarım' },
      { to: '/admin/beyannamelerim/notifications', icon: CalendarDays, label: 'Vergi Takvimi' },
      { to: '/admin/beyannamelerim/fatura-kesim', icon: FileText, label: 'E-SMM Düzenlemesi' },
      { to: '/admin/beyannamelerim/profile', icon: Settings, label: 'Profilim' }
    ]
  },
  { to: '/admin/odeme-takip', icon: DollarSign, label: 'Ödeme Takip' },
  { to: '/admin/izin-takip', icon: UserCheck, label: 'Personel / İzin' },
  {
    id: 'yukle', icon: Upload, label: 'Yükleme',
    children: [
      { to: '/admin/toplu-beyan-yukle', icon: FileCheck, label: 'Beyan Yükle' },
      { to: '/admin/toplu-ice-aktar', icon: Upload, label: 'Klasörden Aktar' },
      { to: '/admin/smart-import', icon: Brain, label: 'AI Smart Import' },
      { to: '/admin/e-invoice', icon: FileArchive, label: 'e-Fatura XML' },
      { to: '/admin/documents', icon: FolderOpen, label: 'Belge Merkezi' },
      { to: '/admin/z-raporu-yukle', icon: Camera, label: 'Z Raporu Yükle' },
      { to: '/admin/gider-fisi-yukle', icon: Receipt, label: 'Gider Fişi Yükle' }
    ]
  },
  {
    id: 'gonderim', icon: Send, label: 'Gönderim',
    children: [
      { to: '/admin/gonderim-merkezi', icon: Send, label: 'Gönderim Merkezi' },
      { to: '/admin/duyuru-merkezi', icon: Megaphone, label: 'Duyuru Merkezi' },
      { to: '/admin/mesaj-merkezi', icon: MessageSquareText, label: 'Mesaj Merkezi' }
    ]
  },
  {
    id: 'raporlar', icon: FileText, label: 'Raporlar',
    children: [
      { to: '/admin/kira-stopaj', icon: Building2, label: 'Kira Stopaj Listesi' }
    ]
  },
  { to: '/admin/tax-calendar', icon: CalendarDays, label: 'Vergi Takvimi' },
  { to: '/admin/hesaplamalar', icon: Calculator, label: 'Hesaplamalar' },
  {
    id: 'yonetim', icon: Settings, label: 'Yönetim',
    children: [
      { to: '/admin/ayarlar', icon: Settings, label: 'Ayarlar' },
      { to: '/admin/ofisler', icon: Building2, label: 'Ofis Yönetimi', superAdminOnly: true },
      { to: '/admin/kurum-sifreleri', icon: KeyRound, label: 'Kurum Şifreleri', superAdminOnly: true },
      { to: '/admin/giris-takip', icon: UserCheck, label: 'Giriş Takibi' }
    ]
  },
  { href: YARDIMCI_EXE_URL, download: true, icon: Download, label: 'Yardımcı Programı İndir' }
]

// Personel acikken (yetki kaydi yokken) gorunen varsayilan anahtarlar:
// AnaSayfa + mali müşavir bölümü + Beyan Takip + Beyanname Gönderim +
// Fatura İşlemleri + Mesaj Merkezi (müşteri fatura güncelleme talepleri
// personelde de düşsün — adminle aynı)
export const PERSONEL_VARSAYILAN = [
  '/admin', 'beyannamelerim',
  ...(MENU.find(m => m.id === 'beyannamelerim')?.children || []).map(c => c.to),
  'beyan-takip', ...(MENU.find(m => m.id === 'beyan-takip')?.children || []).map(c => c.to),
  'beyanname-gonderim', ...(MENU.find(m => m.id === 'beyanname-gonderim')?.children || []).map(c => c.to),
  'fatura-islemleri', ...(MENU.find(m => m.id === 'fatura-islemleri')?.children || []).map(c => c.to),
  'gonderim', '/admin/mesaj-merkezi',
  // KDV dökümleri + Kredi Kartı Hasılatı (POS) personelde de aktif
  '/admin/kdv-dokumleri', '/admin/kredi-karti-hasilat', '/admin/musteri-borc-dokumu'
]

export default function AdminSidebar() {
  const { user, profile, office, logout } = useAuth()
  const { clients } = useClients()
  const location = useLocation()
  const [acik, setAcik] = useState(false)
  const [acikGrup, setAcikGrup] = useState(null)
  const [hoverAcik, setHoverAcik] = useState(false)

  const path = location.pathname
  const superAdmin = user?.role === 'super_admin'

  // Personel menü yetkileri: offices.personel_yetkileri map'i. Kayıt yoksa
  // (boş) varsayilan: AnaSayfa + mali müşavir bölümü. Kayıt varsa harita
  // yetkilidir; AnaSayfa her zaman açıktir.
  const personel = user?.role === 'personel'
  const yetkiler = office?.personel_yetkileri || null
  const yetkiKayitli = !!(yetkiler && Object.keys(yetkiler).length)
  // 2.7.622: Mukellef klasoru — profilinde mukellef=true olan personelin
  // kendi beyannamelerim bolumu; izin haritasindan bagimsiz acik olmali
  // (admin Kullanici Yonetimi'nden Mükellef=Hayir yaparsa zaten gizlenir).
  const mukellefGorunur = (user?.mukellef ?? profile?.mukellef) === true

  // 2.7.623: Tum mukellef dosyalari — mukellef=true olan admin/super_admin/
  // personel profilleri + client kayitlari. Varsayilan HERKES hepsini gorur;
  // offices.mukellef_yetkileri haritasiyla admin kisiye gore kapatabilir:
  // { <kullaniciId>: { <mukellefProfileId>: false } } — yoksa acik demektir.
  const [mukellefDosyalari, setMukellefDosyalari] = useState([])
  useEffect(() => {
    let canli = true
    const yukle = async () => {
      try {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, name, email, role, office_id, mukellef, created_at')
          .in('role', ['admin', 'super_admin', 'personel'])
        const etkinOfisId = user?.officeId || profile?.office_id || office?.id
        const ofisProfilleri = (profs || []).filter(p => p.office_id === etkinOfisId || p.id === office?.owner_id)
        const siraliAdminler = ofisProfilleri
          .filter(p => p.role === 'admin' || p.role === 'super_admin')
          .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
        const maliMusavirId = office?.owner_id || siraliAdminler[0]?.id
        const liste = ofisProfilleri.filter(p => p.mukellef === true || p.id === maliMusavirId)
        const ids = liste.map(p => p.id)
        const harita = new Map()
        if (ids.length) {
          // 1. dogrudan baglanti: clients.auth_user_id = profile.id
          const { data: cl } = await supabase
            .from('clients')
            .select('id, auth_user_id, company, name')
            .in('auth_user_id', ids)
          for (const c of cl || []) harita.set(c.auth_user_id, c)
        }
        // 2. yedek: auth_user_id baglantisi olmayanlar icin e-posta / kullanici
        // adi eslesmesi (ClientPortal'un cozumleyicisiyle ayni kurallar)
        const kalan = liste.filter(p => !harita.get(p.id))
        if (kalan.length) {
          const kosullar = []
          for (const p of kalan) {
            if (p.email) kosullar.push(`email.eq.${p.email}`)
            const onEk = String(p.email || '').split('@')[0]
            if (onEk) kosullar.push(`username.eq.${onEk}`)
          }
          if (kosullar.length) {
            const { data: cl3 } = await supabase
              .from('clients')
              .select('id, email, username, company, name')
              .or(kosullar.join(','))
            const pMap = new Map()
            for (const p of kalan) {
              if (p.email) pMap.set('e:' + p.email, p.id)
              const onEk = String(p.email || '').split('@')[0]
              if (onEk) pMap.set('u:' + onEk, p.id)
            }
            for (const c of cl3 || []) {
              const pid = pMap.get('e:' + c.email) || pMap.get('u:' + c.username)
              if (pid && !harita.get(pid)) harita.set(pid, c)
            }
          }
        }
        if (!canli) return
        setMukellefDosyalari(liste.map(p => {
          const c = harita.get(p.id)
          return {
            profileId: p.id,
            ad: p.id === maliMusavirId ? p.name || c?.company || c?.name || 'Mali Müşavir' : c?.company || c?.name || p.name || 'Mükellef',
            clientId: c?.id || null,
            maliMusavir: p.id === maliMusavirId
          }
        }))
      } catch { /* sessiz */ }
    }
    yukle()
    return () => { canli = false }
  }, [user?.id, user?.officeId, profile?.office_id, office?.id, office?.owner_id])
  const mukellefYetkiMap = office?.mukellef_yetkileri?.[user?.id] || null

  const izinVar = (anahtar) => {
    if (!personel) return true
    if (anahtar === '/admin') return true
    // 2.7.575: Gönderim grubu personelde her zaman açık — Mesaj Merkezi
    // (müşteri fatura güncelleme talepleri) + Gönderim ve Duyuru Merkezi.
    if (anahtar === 'gonderim' || anahtar === '/admin/mesaj-merkezi' || anahtar === '/admin/gonderim-merkezi' || anahtar === '/admin/duyuru-merkezi') return true
    // 2.8.10: Ayarlar + Kurum Şifreleri personelde her zaman açık —
    // yetki haritasına takılmaz (Ayarlar sayfası personeli zaten kapsıyor).
    if (anahtar === '/admin/ayarlar' || anahtar === '/admin/kurum-sifreleri' || anahtar === '/admin/defter-turu-gecisi') return true
    // 2.8.12: Yönetim grup başlığı personelde de görünsün — çocuklar kendi
    // izinlerinden geçer; tüm alt öğeler kapalıysa grup zaten gizlenir.
    if (anahtar === 'yonetim') return true
    // 2.7.622: mükellef klasörü ve alt sayfaları yetki haritasina takilmaz
    if (anahtar === 'beyannamelerim') return true
    if (mukellefGorunur && String(anahtar).startsWith('/admin/beyannamelerim')) return true
    if (!yetkiKayitli) return PERSONEL_VARSAYILAN.includes(anahtar)
    return !!yetkiler[anahtar]
  }

  // Rol + yetki filtresi uygulanmis menu; admin icin mali musavir bolumu
  // OFIS adiyla gosterilir. Personel mukellef ise klasor KENDI adiyla acilir.
  // 2.7.623: beyannamelerim girdisi artik DIZI dondurur — kendi klasoru +
  // tum diger mukellef dosyalari (varsayilan herkese acik, admin haritadan
  // kapatabilir). Diger dosyalar /admin/beyannamelerim/o/<clientId>/... rotasini
  // kullanir; Profilim sekmesi yalnizca kendi klasorunde vardir.
  const beyanSablon = MENU.find(m => m.id === 'beyannamelerim')
  const beyanAltEtiket = (ad) => ad || 'Mükellef'
  const digerKlasorler = beyanSablon ? mukellefDosyalari
    .filter(d => d.profileId !== user?.id && (d.clientId || d.maliMusavir))
    .filter(d => !mukellefYetkiMap || mukellefYetkiMap[d.profileId] !== false)
    .sort((a, b) => String(a.ad).localeCompare(String(b.ad), 'tr'))
    .map(d => ({
      id: 'beyannamelerim-' + d.profileId,
      icon: beyanSablon.icon,
      label: beyanAltEtiket(d.ad),
      children: beyanSablon.children
        .filter(c => c.to !== '/admin/beyannamelerim/profile')
        .map(c => ({
          ...c,
          to: d.clientId ? c.to.replace('/admin/beyannamelerim/', `/admin/beyannamelerim/o/${d.clientId}/`) : c.to
        }))
    })) : []
  const menu = MENU
    .filter(m => !m.superAdminOnly || superAdmin)
    .filter(m => izinVar(m.id || m.to))
    .flatMap(m => {
      if (m.id === 'beyannamelerim') {
        const kendi = { ...m, label: (personel ? (user?.name || office?.name) : (office?.name || user?.officeName || user?.name)) || 'Beyannamelerim' }
        return [...(mukellefGorunur ? [kendi] : []), ...digerKlasorler]
      }
      if (m.children) {
        // superAdminOnly alt ogeler superAdmin degilse gizlenir (Yönetim grubu vb.);
        // 2.8.13: Kurum Şifreleri istisnasi tum rollere acildi — personel VE
        // admin (super_admin olmayan) hesaplar da gorsun; Ofis Yönetimi
        // yalnizca super_admin'de kalir.
        const cocuklar = m.children.filter(c => !c.superAdminOnly || c.to === '/admin/kurum-sifreleri' || superAdmin)
        if (personel) return [{ ...m, children: cocuklar.filter(c => izinVar(c.to)) }]
        return [{ ...m, children: cocuklar }]
      }
      return [m]
    })
    // Personelde tüm alt ogeleri kapali kalan gruplari gizle
    .filter(m => !(personel && m.children && !m.children.length))

  // Aktif rota hangi gruptaysa o grubu otomatik ac
  useEffect(() => {
    const grup = MENU.find(m => m.children?.some(c => c.to === path))
    if (grup) setAcikGrup(grup.id)
  }, [path])

  // Sayfa degisince mobil menuyu kapat
  useEffect(() => { setAcik(false) }, [path])

  useEffect(() => {
    if (!clients?.length) return
    kiraArtisBildirimleriniOlustur(clients).catch(() => {})
  }, [clients])

  const aktifMi = (to) => to === '/admin' ? path === '/admin' : path.startsWith(to)

  return (
    <>
      {/* Mobil ac/kapa butonu */}
      <button
        onClick={() => setAcik(true)}
        className="lg:hidden fixed top-3 left-3 z-40 bg-blue-800/90 border border-blue-600/40 text-white p-2.5 rounded-xl shadow-lg"
        title="Menü"
      >
        <MenuIcon className="w-5 h-5" />
      </button>

      {acik && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setAcik(false)} />
      )}

      <aside
        onMouseEnter={() => setHoverAcik(true)}
        onMouseLeave={() => setHoverAcik(false)}
        className={`fixed lg:sticky top-0 left-0 z-50 lg:z-10 w-[268px] flex-shrink-0 h-screen bg-[#0a1730] border-r border-blue-800/40 flex flex-col transition-all duration-300 ${
          acik ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${hoverAcik ? 'lg:w-[268px]' : 'lg:w-[68px]'}`}
      >
        {/* Logo */}
        <div className="relative px-4 py-5 border-b border-blue-800/40">
          <Link to="/admin" onClick={() => setAcik(false)} className="block">
            <img
              src={office?.logo_url || '/logo-text.png'}
              alt={office?.name || 'MUBiS ERP'}
              className={`mx-auto object-contain drop-shadow-[0_6px_16px_rgba(0,0,0,0.4)] ${hoverAcik ? 'w-full max-w-[210px]' : 'w-full max-w-[210px] lg:max-w-[40px]'}`}
            />
          </Link>
          <button
            onClick={() => setAcik(false)}
            className="absolute top-3 right-3 p-2 text-gray-400 hover:text-white lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Menu */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-1">{menu.map(item => {
            if (item.children) {
              const grupAcik = acikGrup === item.id
              const grupAktif = item.children.some(c => aktifMi(c.to))
              return (
                <div key={item.id}>
                  <button
                    onClick={() => setAcikGrup(grupAcik ? null : item.id)}
                    title={item.label}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all border ${
                      grupAktif
                        ? 'bg-blue-600/25 border-blue-400/40 text-white'
                        : 'bg-indigo-500/15 border-indigo-400/25 text-indigo-100 hover:bg-indigo-500/25 hover:text-white'
                    } ${hoverAcik ? '' : 'lg:justify-center lg:px-2'}`}
                  >
                    <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                    <span className={`flex-1 text-left whitespace-nowrap ${hoverAcik ? '' : 'lg:hidden'} ${item.id?.startsWith('beyannamelerim') ? 'text-yellow-400' : ''}`}>{item.label}</span>
                    {grupAcik
                      ? <ChevronDown className={`w-4 h-4 text-gray-400 ${hoverAcik ? '' : 'lg:hidden'}`} />
                      : <ChevronRight className={`w-4 h-4 text-gray-500 ${hoverAcik ? '' : 'lg:hidden'}`} />}
                  </button>
                  {grupAcik && (
                    <div className={`mt-1 ml-3 pl-3 border-l border-indigo-400/30 space-y-0.5 bg-indigo-500/5 rounded-lg rounded-tl-none ${hoverAcik ? '' : 'lg:hidden'}`}>
                      {item.children.map(c => (
                        <Link
                          key={c.to}
                          to={c.to}
                          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] transition-all ${
                            aktifMi(c.to)
                              ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                              : 'text-blue-200/70 hover:bg-blue-800/40 hover:text-white'
                          }`}
                        >
                          <c.icon className="w-4 h-4 flex-shrink-0" />
                          <span className="whitespace-nowrap">{c.label}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )
            }

            // href'i olan ogeler (Yardimci Programi Indir gibi) <a> olarak cizilir
            if (item.href) {
              return (
                <a
                  key={item.label}
                  href={item.href}
                  download={item.download}
                  title={item.label}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all bg-green-600/20 text-green-300 hover:bg-green-600/30 hover:text-green-200 ${
                    hoverAcik ? '' : 'lg:justify-center lg:px-2'
                  }`}
                >
                  <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                  <span className={`flex-1 whitespace-nowrap ${hoverAcik ? '' : 'lg:hidden'}`}>{item.label}</span>
                </a>
              )
            }

            return (
              <Link
                key={item.to}
                to={item.to}
                title={item.label}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  aktifMi(item.to)
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                    : 'text-blue-200/80 hover:bg-blue-800/40 hover:text-white'
                } ${hoverAcik ? '' : 'lg:justify-center lg:px-2'}`}
              >
                <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                <span className={`flex-1 whitespace-nowrap ${hoverAcik ? '' : 'lg:hidden'}`}>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Cikis — dar modda yalniz ikon görünür */}
        <div className="p-3 border-t border-blue-800/40">
          <button
            onClick={async () => {
              try { await logout() } finally { window.location.replace('/') }
            }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium bg-red-600/20 text-red-300 hover:bg-red-600/30 hover:text-red-200 transition-all ${hoverAcik ? '' : 'lg:justify-center lg:px-2'}`}
            title="Çıkış Yap"
          >
            <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
            <span className={`flex-1 text-left whitespace-nowrap ${hoverAcik ? '' : 'lg:hidden'}`}>Çıkış Yap</span>
          </button>
        </div>

      </aside>
    </>
  )
}
