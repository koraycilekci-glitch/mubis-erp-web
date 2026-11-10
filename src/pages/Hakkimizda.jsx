import { Link } from 'react-router-dom'
import { Award, Briefcase, ShieldCheck, Laptop, ArrowRight, Quote, BookOpen, Landmark, ScrollText, Users } from 'lucide-react'

const ZAMAN_CIZGELI = [
  { yil: '1972', baslik: 'İstanbul\'da doğdum', metin: 'Eğitim hayatıma Burakreis İlkokulunda başladım; Kabataş Erkek Lisesinden sonra Anadolu Üniversitesi İktisat Fakültesinden mezun oldum.', icon: BookOpen },
  { yil: '1990', baslik: 'Mesleğe başlangıç', metin: 'Aileden gelen mesleki birikimi devralarak ikinci kuşak muhasebe meslek mensubu olarak çalışma hayatıma başladım.', icon: Landmark },
  { yil: '2015', baslik: 'SMMM unvanı', metin: 'Serbest Muhasebeci Mali Müşavir unvanımı alarak mesleki faaliyetlerime bu çerçevede devam etmeye başladım.', icon: ScrollText },
  { yil: 'Bugün', baslik: 'MUBiS ERP', metin: '35 yılı aşkın tecrübemi teknolojiyle buluşturarak muhasebeyi dijitalleştiren MUBiS platformunu geliştirdim.', icon: Laptop },
]

const HIZMETLER = [
  { baslik: 'Muhasebe Hizmetleri', metin: 'Yasal defterlerin tutulması, muhasebe kayıtlarının düzenlenmesi ve mali işlemlerin takibi.', renk: 'from-blue-500/20 to-cyan-500/10', ikonRenk: 'text-blue-400' },
  { baslik: 'Vergi Mevzuatı ve Beyanname', metin: 'Beyannamelerin hazırlanması, kontrolü ve yasal süreleri içerisinde gönderilmesi.', renk: 'from-amber-500/20 to-yellow-500/10', ikonRenk: 'text-amber-400' },
  { baslik: 'SGK Danışmanlığı', metin: 'Sosyal güvenlik mevzuatı, sigortalı işlemleri ve ilgili bildirim süreçlerinde destek.', renk: 'from-emerald-500/20 to-teal-500/10', ikonRenk: 'text-emerald-400' },
  { baslik: 'Mali Danışmanlık', metin: 'Mevzuattaki gelişmelerin takibi ve yükümlülükleriniz konusunda aktif bilgilendirme.', renk: 'from-violet-500/20 to-purple-500/10', ikonRenk: 'text-violet-400' },
  { baslik: 'Dijital Muhasebe', metin: 'Muhasebe süreçlerinin teknolojiyle daha hızlı, düzenli ve verimli yürütülmesi.', renk: 'from-rose-500/20 to-pink-500/10', ikonRenk: 'text-rose-400' },
]

export default function Hakkimizda() {
  return (
    <div className="min-h-screen bg-[#0a1730] text-gray-200 overflow-x-hidden">
      {/* ===== HERO ===== */}
      <div className="relative">
        {/* Mesh gradient arka plan */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_15%_0%,rgba(59,130,246,0.25),transparent),radial-gradient(ellipse_50%_45%_at_90%_10%,rgba(250,204,21,0.12),transparent),radial-gradient(ellipse_45%_40%_at_50%_100%,rgba(14,165,233,0.15),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.04)_1px,transparent_1px)] bg-[size:44px_44px]" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-20">
          <div className="grid lg:grid-cols-[1.2fr_1fr] gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-400/30 rounded-full px-4 py-1.5 text-xs font-semibold text-blue-300 mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Hakkımızda · 2. Kuşak Meslek Mensubu
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-[1.08] tracking-tight">
                Güvenin ve tecrübenin
                <span className="block bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500 bg-clip-text text-transparent">dijital yüzü.</span>
              </h1>
              <p className="mt-5 text-lg text-blue-200/90 leading-relaxed max-w-xl">
                <strong className="text-white">SMMM Aziz Koray Çilekci</strong> — 1990'dan bu yana aile geçmişi olan
                mesleği sürdüren, 35 yılı aşkın deneyimini MUBiS platformuyla teknolojiyle buluşturan mali müşavir.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/iletisim" className="group inline-flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-blue-950 font-bold rounded-2xl px-6 py-3.5 shadow-[0_8px_30px_rgba(250,204,21,0.25)] transition-all hover:-translate-y-0.5">
                  İletişime Geç
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link to="/ozellikler" className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold rounded-2xl px-6 py-3.5 transition-colors">
                  MUBiS'i Keşfet
                </Link>
              </div>
            </div>

            {/* Fotoğraf + rozetler */}
            <div className="relative mx-auto lg:mx-0 lg:justify-self-end">
              <div className="absolute -inset-6 bg-gradient-to-tr from-blue-500/30 via-cyan-400/20 to-yellow-400/20 rounded-[2.5rem] blur-2xl opacity-70" />
              <img
                src="/koray-cilekci.jpg"
                alt="SMMM Aziz Koray Çilekci"
                className="relative w-64 sm:w-72 h-80 sm:h-96 object-cover object-top rounded-[2rem] border border-white/15 shadow-2xl"
              />
              <div className="absolute -left-8 top-8 bg-[#0e1f3d]/90 backdrop-blur border border-blue-700/50 rounded-2xl px-4 py-3 shadow-xl">
                <div className="text-2xl font-black text-white">35<span className="text-yellow-400">+</span></div>
                <div className="text-[11px] text-blue-300 font-medium">Yıllık Deneyim</div>
              </div>
              <div className="absolute -right-6 bottom-16 bg-[#0e1f3d]/90 backdrop-blur border border-blue-700/50 rounded-2xl px-4 py-3 shadow-xl">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-yellow-400" />
                  <div>
                    <div className="text-sm font-bold text-white">SMMM</div>
                    <div className="text-[11px] text-blue-300">2015'ten beri</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== BENTO: öykü + değerler ===== */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-4">
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5">
          <div className="bg-gradient-to-br from-blue-900/50 to-[#0e1f3d] border border-blue-800/40 rounded-3xl p-8 sm:p-10">
            <h2 className="text-2xl font-bold text-white mb-5">Mesleki Tecrübe, Güven ve Dijital Muhasebe</h2>
            <div className="space-y-4 leading-relaxed text-gray-300">
              <p>
                <strong className="text-white">09 Ekim 1972 tarihinde İstanbul'da doğdum.</strong> Eğitim hayatıma
                Burakreis İlkokulunda başladım. Gaziosmanpaşa Ortaokulunun ardından Kabataş Erkek Lisesinde
                eğitimimi sürdürdüm. Üniversite eğitimimi Anadolu Üniversitesi İktisat Fakültesinde tamamladım.
              </p>
              <p>
                <strong className="text-white">1990 yılından bu yana</strong>, aileden gelen mesleki birikimi ve
                tecrübeyi devam ettiren ikinci kuşak bir muhasebe meslek mensubu olarak çalışma hayatımı
                sürdürüyorum. 2015 yılından itibaren Serbest Muhasebeci Mali Müşavir (SMMM) unvanıyla mesleki
                faaliyetlerime devam ediyorum.
              </p>
              <p>
                Otuz yılı aşkın mesleki deneyimim boyunca edindiğim bilgi ve birikimle, işletmelerin mali
                süreçlerini doğru, düzenli ve mevzuata uygun şekilde yürütmelerine destek olmayı amaçlıyorum.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            {[
              { icon: Award, sayi: '35+', metin: 'Yıl tecrübe' },
              { icon: Users, sayi: '2.', metin: 'Kuşak meslek mensubu' },
              { icon: ShieldCheck, sayi: '100%', metin: 'Mevzuata uygunluk' },
              { icon: Laptop, sayi: '7/24', metin: 'Dijital erişim' },
            ].map(k => (
              <div key={k.metin} className="bg-blue-900/30 border border-blue-800/40 rounded-3xl p-6 flex flex-col items-center justify-center text-center hover:border-yellow-400/40 hover:bg-blue-900/50 transition-all">
                <k.icon className="w-6 h-6 text-yellow-400 mb-3" />
                <div className="text-3xl font-black text-white">{k.sayi}</div>
                <div className="text-xs text-blue-300 mt-1 font-medium">{k.metin}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== ZAMAN ÇİZGELİSİ ===== */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <p className="text-yellow-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Yolculuk</p>
        <h2 className="text-3xl font-bold text-white mb-10">1990'dan Günümüze</h2>
        <div className="relative">
          <div className="absolute left-[19px] lg:left-0 lg:right-0 top-6 lg:top-[26px] h-full lg:h-px w-px lg:w-full bg-gradient-to-b lg:bg-gradient-to-r from-blue-600/60 via-blue-500/40 to-yellow-400/50" />
          <div className="grid lg:grid-cols-4 gap-8 lg:gap-5">
            {ZAMAN_CIZGELI.map((z, i) => (
              <div key={z.yil} className="relative pl-14 lg:pl-0 lg:pt-16">
                <div className="absolute left-0 lg:left-0 top-0 w-10 h-10 rounded-full bg-[#0e1f3d] border-2 border-yellow-400/60 flex items-center justify-center shadow-[0_0_20px_rgba(250,204,21,0.15)]">
                  <z.icon className="w-4.5 h-4.5 w-5 h-5 text-yellow-400" />
                </div>
                <div className="text-yellow-400 font-black text-lg">{z.yil}</div>
                <div className="text-white font-bold mb-1.5">{z.baslik}</div>
                <p className="text-sm text-gray-400 leading-relaxed">{z.metin}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== HİZMETLER ===== */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <p className="text-yellow-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">Hizmetler</p>
        <h2 className="text-3xl font-bold text-white mb-3">Sunduğumuz Hizmetler</h2>
        <p className="text-gray-400 mb-8 max-w-2xl">
          İşletmelerinizin ihtiyaçlarını ve yürürlükteki mevzuatı esas alarak aşağıdaki alanlarda hizmet sunuyoruz.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {HIZMETLER.map((h, i) => (
            <div key={h.baslik}
              className={`group relative rounded-3xl border border-blue-800/40 bg-gradient-to-br ${h.renk} p-6 hover:-translate-y-1 hover:border-blue-500/50 transition-all duration-300 ${i === 0 ? 'lg:col-span-2' : ''}`}>
              <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                <Briefcase className={`w-5 h-5 ${h.ikonRenk}`} />
              </div>
              <h3 className="text-white font-bold text-lg mb-2">{h.baslik}</h3>
              <p className="text-sm text-gray-300 leading-relaxed">{h.metin}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ===== MUBİS + ALINTI ===== */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="relative rounded-[2.5rem] overflow-hidden border border-blue-700/40 bg-gradient-to-br from-[#10254a] via-[#0e1f3d] to-[#0a1730] p-8 sm:p-14">
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-yellow-400/10 rounded-full blur-3xl" />
          <div className="relative grid lg:grid-cols-[1fr_auto] gap-10 items-center">
            <div>
              <Quote className="w-8 h-8 text-yellow-400/60 mb-4" />
              <h2 className="text-3xl sm:text-4xl font-black text-white leading-tight mb-4">
                MUBİS <span className="text-yellow-400">— Muhasebe Bizim İşimiz</span>
              </h2>
              <p className="text-gray-300 leading-relaxed mb-4 max-w-2xl">
                Mesleki tecrübemizi teknolojiyle birleştirerek muhasebe hizmetlerini daha erişilebilir, daha
                anlaşılır ve daha verimli hâle getirmeyi hedefliyoruz. Geliştirdiğimiz <strong className="text-white">MUBİS ERP</strong>,
                bu vizyonun somut çıktısıdır: beyanlardan tahakkuklara, e-defterden e-tebligata tüm süreçler tek platformda.
              </p>
              <p className="text-gray-400 leading-relaxed max-w-2xl border-l-2 border-yellow-400/50 pl-4">
                Mesleğimizin temelinde güven, doğruluk, mevzuata uygunluk ve sürdürülebilir iş ilişkileri yer alır.
                Deneyimimizi müşterilerimizin başarısı için kullanmayı; değişen mevzuat ve teknolojiye uyumla hizmet
                kalitemizi sürekli geliştirmeyi önemsiyoruz.
              </p>
              <p className="mt-6 text-yellow-400 font-bold">SMMM Aziz Koray Çilekci</p>
              <p className="text-blue-300 text-sm italic">Muhasebe Bizim İşimiz.</p>
            </div>
            <div className="flex lg:flex-col gap-4">
              <Link to="/iletisim" className="group inline-flex items-center justify-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-blue-950 font-bold rounded-2xl px-7 py-4 shadow-[0_8px_30px_rgba(250,204,21,0.3)] transition-all hover:-translate-y-0.5 whitespace-nowrap">
                Randevu Al
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link to="/giris" className="inline-flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold rounded-2xl px-7 py-4 transition-colors whitespace-nowrap">
                MUBiS'e Giriş
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
