import { Link } from 'react-router-dom'
import { useEffect } from 'react'
import { recordSiteVisit } from '../services/statsService'
import {
  ArrowRight, Shield, Zap, Users, BarChart3, Clock, Star, Calculator,
  FileText, ClipboardCheck, UserCog, ShieldCheck, Headphones, Bot
} from 'lucide-react'

const HERO_OZELLIKLER = [
  { icon: FileText, title: 'e-Belge Çözümleri', desc: 'e-Fatura, e-Arşiv, e-Defter ve daha fazlası' },
  { icon: ClipboardCheck, title: 'Vergi Takibi', desc: 'Vergi takvimi, beyanname ve bildirimlerinizi takip edin' },
  { icon: UserCog, title: 'Müşteri Yönetimi', desc: 'Tüm müşteri bilgilerinize tek ekrandan ulaşın' },
  { icon: ShieldCheck, title: 'Güvenli Altyapı', desc: 'Verileriniz 256 bit şifreleme ile korunur' },
  { icon: Headphones, title: '7/24 Destek', desc: 'Uzman ekibimiz her zaman yanınızda' }
]

function DashboardOnizleme() {
  const noktalar = [40, 38, 34, 30, 31, 26, 24, 20, 18, 12, 10, 6]
  const noktalar2 = [46, 45, 43, 44, 41, 42, 39, 40, 36, 34, 33, 30]
  const cizgi = (dizi) => dizi.map((y, i) => `${(i / (dizi.length - 1)) * 100},${y}`).join(' ')

  return (
    <div className="relative w-full">
      {/* Laptop govdesi */}
      <div className="rounded-t-2xl border-[10px] border-slate-700 bg-slate-900 shadow-[0_30px_70px_rgba(0,0,0,0.55)] overflow-hidden">
        <div className="bg-[#0e1f3d] flex text-[8px] sm:text-[10px]">
          {/* Sol menu */}
          <div className="w-[22%] bg-[#0a1730] p-2 sm:p-3 space-y-1.5 hidden sm:block">
            <div className="flex items-center gap-1.5 mb-3">
              <img src="/logo-icon.png" alt="" className="w-5 h-5 object-contain" />
              <span className="text-white font-bold">MUBiS</span>
            </div>
            {['Dashboard', 'Müşteriler', 'Beyanlar', 'Yükleme', 'Gönderim', 'Otomasyon', 'Ödeme', 'Ayarlar'].map((m, i) => (
              <div key={m} className={`px-2 py-1.5 rounded-md ${i === 0 ? 'bg-blue-600 text-white' : 'text-blue-300/70'}`}>
                {m}
              </div>
            ))}
          </div>

          {/* Icerik */}
          <div className="flex-1 p-2 sm:p-3 space-y-2">
            <div className="h-4 sm:h-5 bg-white/5 rounded-md" />
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
              {[
                { v: '245', l: 'Aktif Müşteri' },
                { v: '18', l: 'Bekleyen Beyan' },
                { v: '37', l: 'Bugünkü İşlem' },
                { v: '12', l: 'Yaklaşan Vade' }
              ].map(k => (
                <div key={k.l} className="bg-white/5 border border-white/10 rounded-md p-1.5 sm:p-2">
                  <div className="text-blue-300/70 truncate">{k.l}</div>
                  <div className="text-white text-sm sm:text-lg font-bold">{k.v}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
              <div className="col-span-3 bg-white/5 border border-white/10 rounded-md p-2">
                <div className="text-blue-200 mb-1">Beyanname Durumu</div>
                <svg viewBox="0 0 100 50" preserveAspectRatio="none" className="w-full h-14 sm:h-20">
                  <polyline points={cizgi(noktalar2)} fill="none" stroke="#22c55e" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
                  <polyline points={cizgi(noktalar)} fill="none" stroke="#60a5fa" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
                </svg>
              </div>
              <div className="col-span-2 bg-white/5 border border-white/10 rounded-md p-2 space-y-1.5">
                <div className="text-blue-200 mb-0.5">Hatırlatmalar</div>
                {[
                  ['KDV Beyannamesi', '#3b82f6'],
                  ['Muhtasar Beyanname', '#f59e0b'],
                  ['Geçici Vergi Dönemi', '#22c55e']
                ].map(([t, c]) => (
                  <div key={t} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c }} />
                    <span className="text-blue-100/80 truncate">{t}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
              {['e-Fatura Oluştur', 'e-Arşiv Oluştur', 'Müşteri Ekle', 'Beyanname Oluştur'].map(t => (
                <div key={t} className="bg-white/5 border border-white/10 rounded-md p-1.5 text-blue-100/70 text-center truncate">
                  {t}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Laptop taban */}
      <div className="h-3 bg-slate-600 rounded-b-xl" />
      <div className="h-1.5 w-[55%] mx-auto bg-slate-700 rounded-b-2xl" />
    </div>
  )
}

export default function Home() {
  // Site ziyaretci sayaci: ana sayfa acildiginda oturum basina bir kez kaydedilir
  useEffect(() => { recordSiteVisit('/') }, [])

  // Canlı asistan (Inter Reception) yalnızca ana sayfada: mount'ta yükle,
  // sayfadan ayrılınca script + widget'ın eklediği düğme/iframe'i temizle.
  // Widget id/class koymadan body'ye fixed button + iframe eklediği için
  // mount öncesi gövde anlık görüntüsüyle fark tespiti yapılır.
  useEffect(() => {
    const once = new Set(Array.from(document.body.children))
    // Önceki temizlikten kalan kurulum bayrağını sıfırla (ana sayfaya dönüşte tekrar yüklenebilsin)
    try { delete window.__irAvatarWidgetInstalled } catch { window.__irAvatarWidgetInstalled = false }
    const script = document.createElement('script')
    script.src = 'https://interreception.com/avatar-widget.js'
    script.dataset.id = 'jAafnmjomqLh1BZjLemcASFY'
    script.dataset.position = 'left'
    script.defer = true
    document.body.appendChild(script)
    return () => {
      script.remove()
      Array.from(document.body.children).forEach(el => {
        if (once.has(el) || el === script) return
        const tag = el.tagName
        const sabit = el.style?.position === 'fixed'
        if (tag === 'IFRAME' || (tag === 'BUTTON' && sabit) || (tag === 'DIV' && sabit && el.querySelector?.('iframe[title*="Inter Reception" i]'))) {
          el.remove()
        }
      })
    }
  }, [])

  const features = [
    { icon: Shield, title: 'Güvenli', description: 'E-İmza ve Mali Mühür entegrasyonu' },
    { icon: Zap, title: 'Hızlı', description: 'AI destekli otomasyon sistemi' },
    { icon: Users, title: 'Müşteri Odaklı', description: 'Özel müşteri portalı' },
    { icon: BarChart3, title: 'Raporlama', description: 'Detaylı analiz ve raporlar' },
    { icon: Clock, title: 'Zaman Tasarrufu', description: 'Otomatik iş takibi' },
    { icon: Star, title: 'Akıllı Asistan', description: 'MUBİS AI günlük yardımcı' },
  ]

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0a1930] via-[#0d2a55] to-[#0a1930]">
        <div className="absolute inset-0 opacity-40 bg-[radial-gradient(ellipse_at_70%_35%,rgba(37,99,235,0.45),transparent_60%)]" />
        <div className="absolute -right-20 top-10 w-[520px] h-[520px] rounded-full bg-blue-600/10 blur-3xl" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-8 items-center pt-12 lg:pt-16 pb-10">
            {/* Sol metin */}
            <div>
              <div className="inline-flex items-center gap-2 bg-blue-900/60 rounded-full px-4 py-2 mb-7 border border-blue-600/50">
                <span>🚀</span>
                <span className="text-blue-100 text-sm">Yeni Nesil ERP Sistemi</span>
              </div>

              <h1 className="text-4xl sm:text-5xl xl:text-6xl font-black text-white mb-6 leading-[1.08]">
                Mali Müşavirin
                <span className="block bg-gradient-to-r from-sky-300 via-blue-200 to-amber-300 bg-clip-text text-transparent">
                  Dijital Çalışma Masası
                </span>
              </h1>

              <p className="text-lg text-slate-300/90 mb-9 max-w-xl leading-relaxed">
                MUBİS ERP ile tüm mali müşavirlik süreçlerinizi tek platformdan yönetin.
                Beyanlardan tahakkuklara, e-defterden e-tebligata kadar her şey parmaklarınızın ucunda.
              </p>

              {/* Birincil aksiyon (gold) tek basina one cikar; ikincil aksiyon disari cizgili */}
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  to="/giris"
                  className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-yellow-400 to-amber-500 text-blue-950 px-9 py-4 rounded-xl font-bold text-lg shadow-lg shadow-amber-900/30 hover:shadow-amber-500/40 hover:-translate-y-0.5 transition-all"
                >
                  Hemen Başla
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  to="/ozellikler"
                  className="btn-outline text-lg px-8 py-4"
                >
                  Özellikleri Keşfet
                </Link>
              </div>
            </div>

            {/* Sag gorsel */}
            <div className="relative lg:pl-6 animate-float-soft">
              <DashboardOnizleme />
            </div>
          </div>

          {/* Ozellik seridi */}
          <div className="border-t border-blue-700/40 py-8 lg:py-10">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-y-8 divide-x divide-blue-700/30">
              {HERO_OZELLIKLER.map(o => (
                <div key={o.title} className="px-4 text-center">
                  <o.icon className="w-8 h-8 text-blue-300 mx-auto mb-3" strokeWidth={1.6} />
                  <div className="text-white font-semibold text-sm mb-1.5">{o.title}</div>
                  <p className="text-slate-300/70 text-xs leading-relaxed">{o.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Ozellikler Grid — hero'dan ayrisan ikinci bir yuzey katmani */}
      <section className="section-py surface-alt">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Neden MUBİS ERP?</h2>
            <p className="text-muted text-lg">Mali müşavirlik süreçlerinizi dönüştüren özellikler</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="panel card-hover">
                <feature.icon className="w-12 h-12 text-yellow-500 mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-muted">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MUBIS AI Tanitim */}
      <section className="section-py border-y border-blue-800/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-blue-600/20 border border-blue-500/40 rounded-full px-4 py-1.5 mb-4">
              <Bot className="w-4 h-4 text-blue-300" />
              <span className="text-blue-200 text-sm font-medium">Yapay Zeka Destekli</span>
            </div>
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">MUBİS AI Asistan</h2>
            <p className="text-muted text-lg max-w-2xl mx-auto">
              7/24 yanınızda dijital mali müşavir asistanı. Vergi, SGK ve muhasebe konularında
              anında, güvenilir cevaplar alın.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="panel">
              <div className="flex items-center gap-3 mb-5">
                <div className="bg-emerald-500/20 p-3 rounded-xl">
                  <Users className="w-7 h-7 text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold text-white">Müşteriler İçin</h3>
              </div>
              <ul className="space-y-3 text-slate-200/90">
                {[
                  'Bu ay ne kadar vergi/SGK ödeyeceğimi öğren',
                  'KDV, muhtasar ve SGK tahakkuk tutarlarımı gör',
                  'Tahakkuk fişlerime ve hizmet listelerime tek tıkla ulaş',
                  'Vergi takvimindeki son ödeme tarihlerini takip et',
                  'Mali müşavirime hızlıca mesaj gönder'
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-emerald-400 mt-1">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="panel">
              <div className="flex items-center gap-3 mb-5">
                <div className="bg-yellow-500/20 p-3 rounded-xl">
                  <UserCog className="w-7 h-7 text-yellow-400" />
                </div>
                <h3 className="text-xl font-bold text-white">Mali Müşavirler İçin</h3>
              </div>
              <ul className="space-y-3 text-slate-200/90">
                {[
                  'Mevzuata uygun, kaynaklı teknik cevaplar al',
                  'Müşteri adı + ay + evrak tipi ile belgeyi anında bul',
                  'Güncel vergi oranları, tarifeler ve son tarihleri sorgula',
                  'Kira artışı, SGK, teşvik hesaplamalarını doğru yap',
                  'Riskli müşteriler ve yaklaşan beyanlar hakkında uyarı al'
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-yellow-400 mt-1">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Ucretsiz Hesaplama Araclari */}
      <section className="section-py">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="panel !p-10 lg:!p-14 flex flex-col lg:flex-row items-center gap-10">
            <div className="flex-1 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 bg-orange-500/20 border border-orange-500/40 rounded-full px-4 py-1.5 mb-5">
                <Calculator className="w-4 h-4 text-orange-400" />
                <span className="text-orange-300 text-sm font-medium">Ücretsiz - Üyelik Gerektirmez</span>
              </div>
              <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">Pratik Hesaplama Araçları</h2>
              <p className="text-slate-200/90 text-lg mb-3">
                Kıdem ve ihbar tazminatı, kira artışı (güncel TÜİK oranıyla), gelir/kurumlar vergisi,
                GMSİ, SSK primleri, tevkifatlı fatura, borçlanma ve daha fazlası.
              </p>
              <p className="text-muted text-sm">
                Giriş yapmadan hemen kullanın.
              </p>
            </div>
            <div className="flex-shrink-0">
              <Link to="/hesaplamalar" className="btn-gold text-lg px-10 py-4 inline-flex items-center justify-center">
                Hesaplamaya Başla
                <ArrowRight className="w-5 h-5 inline ml-2" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-py bg-gradient-to-r from-blue-900 to-blue-950">
        <div className="max-w-4xl mx-auto text-center px-4">
          <h2 className="text-4xl font-bold text-white mb-6">MUBİS ERP ile Tanışmaya Hazır mısınız?</h2>
          <p className="text-slate-200/90 text-lg mb-10">
            Hemen ücretsiz denemeye başlayın, mali müşavirlik süreçlerinizi dijitale taşıyın.
          </p>
          <Link to="/giris" className="btn-gold text-xl px-12 py-5 inline-flex items-center">
            Hemen Başla - Ücretsiz
            <ArrowRight className="w-6 h-6 inline ml-3" />
          </Link>
        </div>
      </section>
    </div>
  )
}
