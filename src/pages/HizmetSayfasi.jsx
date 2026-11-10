import { Link, useParams, Navigate } from 'react-router-dom'
import {
  FileText, Users, BarChart3, CalendarDays, Building2, UserCircle2, Shield, Wallet,
  FileArchive, FileCheck, BookOpenCheck, ArrowRight, CheckCircle2, Phone, ArrowLeft
} from 'lucide-react'
const ICERIKLER = [
  // ===== HİZMETLERİMİZ =====
  {
    slug: 'beyanname-takibi',
    grup: 'Hizmetlerimiz',
    baslik: 'Beyanname Takibi',
    ikon: FileText,
    kisa: 'Tüm vergi beyannameleriniz tek ekrandan hazırlanır, kontrol edilir ve süreli olarak gönderilir.',
    paragraflar: [
      'MUBiS, kdv, gelir vergisi, kurumlar vergisi, muhtasar ve damga vergisi başta olmak üzere tüm beyannamelerinizin hazırlanma, kontrol ve gönderim süreçlerini tek bir sistemde toplar. Her beyanname; müşteri bazında dönem bazında takip edilir, hangi aşamada olduğu (evrak alındı, hazır, onaylandı, gönderildi) anlık olarak görüntülenir.',
      'Aylık beyan takip matrisi sayesinde hangi müşterinin hangi beyannamesinin hangi aşamada olduğu saniyeler içinde görülebilir. Süre yaklaştıkça sistem uyarı üretir, böylece hiçbir beyanname gündeme gelmez.'
    ],
    ozellikler: [
      { b: 'Aylık Beyan Takip Matrisi', m: 'Tüm müşterilerin beyannamelerini tek ekranda dönem bazında izleyin; durumları işaretleyin ve takip edin.' },
      { b: 'Durum Takibi', m: 'Yapılmadı → Evrak Alındı → Hazır → Onaylandı → Gönderildi aşamalarını her beyan için kaydedin.' },
      { b: 'Süre Uyarıları', m: 'Beyanname verme süreleri yaklaştığında sistem hatırlatır; gecikme riski ortadan kalkar.' },
      { b: 'e-Beyanname Entegrasyonu', m: 'Hazırlanan beyannameler doğrudan e-Beyanname sistemi üzerinden gönderilir.' }
    ]
  },
  {
    slug: 'musteri-yonetimi',
    grup: 'Hizmetlerimiz',
    baslik: 'Müşteri Yönetimi',
    ikon: Users,
    kisa: 'Mükellef bilgilerinden vergi levhalarına kadar tüm müşteri kayıtları merkezî olarak yönetilir.',
    paragraflar: [
      'MUBiS müşteri yönetimi modülü; şirket ve gerçek kişi mükelleflerinizin kimlik, vergi no, vergi dairesi, faaliyet kodu, adres ve iletişim bilgilerini tek bir merkezî havuzda tutar. Luca veya başka kaynaklardan gelen firma listeleri içe aktarılabilir; var olan firmalar tekrar yüklenmez, güncellenir.',
      'Vergi türü seçimine göre müşteri tipi otomatik belirlenir (kurumlar vergisi → şirket, gelir vergisi → gerçek kişi). KDV dökümleri, beyan takibi ve belge arşivi her müşterinin kendi kaydına bağlanır.'
    ],
    ozellikler: [
      { b: 'Merkezî Mükellef Kartı', m: 'Vergi no, vergi dairesi, faaliyet konusu ve iletişim bilgileri tek kartta toplanır.' },
      { b: 'Toplu Firma Aktarımı', m: 'Luca ve benzeri kaynaklardan firma listelerini içe aktarın; mevcut firmalar tekrar eklenmez.' },
      { b: 'Vergi Levhası Arşivi', m: 'Müşteri vergi levhalarını sisteme yükleyin, her yerden erişin.' },
      { b: 'Rol Bazlı Erişim', m: 'Her müşteri yalnızca kendi verilerini görür; personel yetkileri ayrı ayrı atanır.' }
    ]
  },
  {
    slug: 'raporlama',
    grup: 'Hizmetlerimiz',
    baslik: 'Raporlama',
    ikon: BarChart3,
    kisa: 'Alınan/kesilen faturalar, KDV analizleri ve dönemsel dökümler anında rapora dönüşür.',
    paragraflar: [
      'MUBiS raporlama altyapısı; e-Fatura, e-Arşiv, e-SMM ve Z raporu/gider fişi kayıtlarını birleştirerek dönemsel analizler üretir. Alınan ve kesilen faturalar KDV oranı bazında ayrıştırılır, %1/%10/%20 hesaplamaları otomatik yapılır.',
      'Luca uyumlu CSV çıktıları (Z raporu ve gider fişi şablonlarıyla birebir) tek düğmeyle indirilebilir. Excel dökümlerinde tarih formatı, KDV matrah/tutar kolonları ve evrak numaraları aktarma için hazır gelir.'
    ],
    ozellikler: [
      { b: 'KDV Oranı Analizi', m: 'Faturalar KDV oranlarına göre ayrıştırılır; matrah ve KDV tutarları otomatik hesaplanır.' },
      { b: 'Luca Uyumlu Dökümler', m: 'Z raporu ve gider fişi CSV şablonlarıyla birebir uyumlu çıktılar alın.' },
      { b: 'Excel Raporları', m: 'Dönemsel fiş ve fatura listelerini tek düğmeyle Excel olarak indirin.' },
      { b: 'Dönem Bazlı Filtre', m: 'Müşteri + yıl + ay seçimiyle yalnızca ilgili dönemin raporlarını oluşturun.' }
    ]
  },
  {
    slug: 'vergi-takvimi',
    grup: 'Hizmetlerimiz',
    baslik: 'Vergi Takvimi',
    ikon: CalendarDays,
    kisa: 'Beyanname ve bildirim süreleri otomatik takip edilir, kritik tarihlerde uyarı alırsınız.',
    paragraflar: [
      'Vergi takvimi modülü, dönem içindeki tüm yasal yükümlülükleri (beyanname verme, ödeme, bildirim) müşteri bazında listeler. Aylık beyan takip matrisiyle birlikte çalışır; bir beyannamenin gönderildiği işaretlendiğinde takvim kaydı otomatik güncellenir.',
      'Yaklaşan süreler MUBiS AI asistanı üzerinden de hatırlatılır; böylece hem büro içi iş akışı hem müşteri bilgilendirmesi tek sistemde yürür.'
    ],
    ozellikler: [
      { b: 'Otomatik Süre Hesabı', m: 'Beyanname ve ödeme süreleri mevzuata göre otomatik hesaplanır.' },
      { b: 'Müşteri Bazlı Görünüm', m: 'Her müşterinin kendi yükümlülüklerini kendi portalında görmesini sağlar.' },
      { b: 'AI Hatırlatma', m: 'Yaklaşan süreler MUBiS AI konuşma bandı üzerinden bildirilir.' },
      { b: 'Beyan Matrisi Entegrasyonu', m: 'Aylık beyan takip matrisiyle çift yönlü senkronize çalışır.' }
    ]
  },
  // ===== ÇÖZÜMLERİMİZ =====
  {
    slug: 'mali-musavir-paneli',
    grup: 'Çözümlerimiz',
    baslik: 'Mali Müşavir Paneli',
    ikon: Building2,
    kisa: 'Büronuzun tüm iş akışı: müşteriler, beyanlar, belgeler ve gönderim merkezleri tek panelde.',
    paragraflar: [
      'Mali müşavir paneli, büronuzun operasyon merkeziidir. Dashboard üzerinden yeni tebligatları, bekleyen beyanları, son yüklenen belgeleri ve müşteri hareketlerini anlık izlersiniz. Müşteri yönetimi, beyan takibi, fiş/z raporu işleme, hesaplamalar ve gönderim merkezleri aynı çatı altında çalışır.',
      'Personel yetkileri rol bazlı atanır; hangi çalışanın hangi müşteriye erişeceği sizin kontrolünüzdedir. Tüm modüller birbirine bağlıdır: yüklenen bir Z raporu fiş kaydına, fiş kaydı KDV analizine ve Luca çıktısına akar.'
    ],
    ozellikler: [
      { b: 'Akıllı Dashboard', m: 'Yeni tebligatlar, bekleyen işler ve dönem özetleri açılışta karşınızda.' },
      { b: 'Fiş Tarama Hattı', m: 'Telefon veya tarayıcıdan gelen Z raporu/fiş fotoğraflarını işleyin, kayıtlara dönüştürün.' },
      { b: 'Gönderim Merkezleri', m: 'Duyuru, mesaj ve borç bildirimlerini müşterilerinize tek yerden iletin.' },
      { b: 'Rol Bazlı Personel Yetkisi', m: 'Her çalışanın erişim alanını sınırlayın; işlemler kayıt altında tutulur.' }
    ]
  },
  {
    slug: 'musteri-portali',
    grup: 'Çözümlerimiz',
    baslik: 'Müşteri Portalı',
    ikon: UserCircle2,
    kisa: 'Müşterileriniz beyanlarını, belgelerini ve bildirimlerini kendi hesabından takip eder.',
    paragraflar: [
      'Müşteri portalı, mükelleflerinizin MUBiS hesabına giriş yaptıklarında gördükleri kişisel paneldir. Kendi beyanname durumlarını, yüklenen belgeleri, gönderilen tebligatları ve borç bildirimlerini yalnızca kendilerine ait veriler üzerinden izlerler.',
      'Müşteriler portaldan el ile Z raporu ve gider fişi girişi yapabilir; girdikleri kayıtlar onayınız için büro tarafına düşer. Cari hesap modülü sayesinde müşteriniz kendi cari kartlarını, borç/alacak bakiyesini, tahsilatlarını ve çek/senet durumunu da portal üzerinden anlık izler. Yeni gelen e-Tebligatlar için üst barda uyarı gösterilir, tek tıkla kendi tebligat sayfasına ulaşır.'
    ],
    ozellikler: [
      { b: 'Kişisel Beyan Paneli', m: 'Beyanname durumları ve dönem takibi yalnızca kendi verileriyle.' },
      { b: 'Fiş/Z Raporu Girişi', m: 'Müşteri kendi fişlerini girer; kayıt onayınızdan sonra faturalara işlenir.' },
      { b: 'Cari Hesap Takibi', m: 'Cari kartlar, borç/alacak bakiyesi, tahsilatlar ve çek/senet durumu portalda.' },
      { b: 'e-Tebligat Uyarısı', m: 'Yeni tebligat geldiğinde üst barda sayı rozetli uyarı görünür.' },
      { b: 'Güvenli Giriş', m: 'Rol bazlı yetkilendirme: müşteri yalnızca kendi kayıtlarına erişir.' }
    ]
  },
  {
    slug: 'guvenli-altyapi',
    grup: 'Çözümlerimiz',
    baslik: 'Güvenli Altyapı',
    ikon: Shield,
    kisa: 'KVKK uyumlu, şifreli ve yedekli bulut altyapısıyla verileriniz güvende.',
    paragraflar: [
      'MUBiS tüm verileri KVKK uyumlu, şifreli bulut altyapısında saklar. Kimlik doğrulama ve veritabanı işlemleri satır seviyesi güvenlik kurallarıyla (RLS) korunur: her kullanıcı yalnızca yetkili olduğu kayıtlara erişir, müşteri verileri birbirinden tamamen ayrı tutulur.',
      'Belge arşivi erişim yetkisi olmayan hiçbir kullanıcıya açılmaz; fotoğraf ve PDF belgeleri imzalı, süreli erişim bağlantılarıyla sunulur. Sistem 7/24 erişilebilir; internet bağlantısı olan her yerden çalışır.'
    ],
    ozellikler: [
      { b: 'Satır Seviyesi Güvenlik', m: 'Her satır sahibine bağlıdır; yetkisiz erişim veritabanı düzeyinde engellenir.' },
      { b: 'Şifreli Veri Saklama', m: 'Kimlik ve mali veriler TLS ile taşınır, güvenli depoda saklanır.' },
      { b: 'İmzalı Belge Erişimi', m: 'Belgeler geçerlilik süresi sınırlı özel bağlantılarla görüntülenir.' },
      { b: 'KVKK Uyumlu Süreçler', m: 'Aydınlatma metni ve çerez politikası dahil yasal uyum bileşenleri.' }
    ]
  },
  {
    slug: 'cari-hesap',
    grup: 'Çözümlerimiz',
    baslik: 'Cari Hesap Takibi',
    ikon: Wallet,
    kisa: 'Cari kartlar, borç/alacak hareketleri, çek/senet takibi, yaşlandırma raporu ve ekstre — müşterinizin kendi portalından.',
    paragraflar: [
      'MUBiS cari hesap modülü, müşteriye ait cari kartları ve tüm borç/alacak hareketlerini tek ekranda yönetir. Müşteri portalına entegre olan modül sayesinde müşteriniz kendi cari bakiyesini, tahsilatlarını ve vadesi gelen ödemelerini anlık olarak görür.',
      'Çoklu para birimi (TL, USD, EUR, GBP) desteği, cari kartlar arası virman, çek/senet durum takibi ve vade bazlı yaşlandırma raporu ile alacakların risk dağılımı görünür hale gelir. Dönem ekstreleri PDF olarak saklanır ve her zaman erişilebilir.'
    ],
    ozellikler: [
      { b: 'Cari Kartlar', m: 'Firma bazlı cari kartları oluşturun; döviz bazlı (TL/USD/EUR/GBP) bakiyeleri izleyin.' },
      { b: 'Borç / Alacak Hareketleri', m: 'Tahsilat, ödeme, cari virman ve çek/senet hareketlerini kaydedin ve güncelleyin.' },
      { b: 'Yaşlandırma Raporu', m: 'Vadesi geçen alacakları 0-30 / 31-60 / 61-90 / 90+ gün kırılımında görün.' },
      { b: 'Ekstre ve Özet', m: 'Dönem ekstresi, toplam borç/alacak ve vadesi geçen alacak özetini anlık alın.' }
    ]
  },
  // ===== e-BELGELER =====
  {
    slug: 'e-fatura',
    grup: 'e-Belgeler',
    baslik: 'e-Fatura',
    ikon: FileText,
    kisa: 'e-Fatura sorgulama, içerik okuma ve Excel/XML aktarımı tek ekranda.',
    paragraflar: [
      'MUBiS e-Fatura modülü, müşterilerinizin GİB ve özel entegratör sistemlerindeki e-Fatura/e-Arşiv akışını sorgular; alınan ve kesilen faturaları döneme göre listeler. XML içerikleri okunur, fatura satırları KDV oranı bazında ayrıştırılır ve hesaplamalarda kullanılır.',
      'Fatura sorgu ekranında müşteri, yıl ve ay seçimiyle dönemin tüm faturaları görüntülenir; birden fazla KDV oranına sahip faturalar her oran için ayrı satır olarak listelenir.'
    ],
    ozellikler: [
      { b: 'GİB / Entegratör Sorgusu', m: 'Alınan ve kesilen e-Faturaları dönem bazında çekin.' },
      { b: 'XML İçerik Okuma', m: 'Fatura satırları, KDV oranları ve tutarlar otomatik ayrıştırılır.' },
      { b: 'Excel / CSV Aktarımı', m: 'Fatura listelerini Luca ve Excel uyumlu formatta indirin.' },
      { b: 'KDV Otomatik Hesap', m: '%1/%10/%20 oranlarına göre matrah ve KDV tutarları hesaplanır.' }
    ]
  },
  {
    slug: 'e-arsiv',
    grup: 'e-Belgeler',
    baslik: 'e-Arşiv',
    ikon: FileArchive,
    kisa: 'e-Arşiv faturalarınız sorgulanır, arşivlenir ve raporlara dahil edilir.',
    paragraflar: [
      'e-Arşiv modülü, nihai tüketiciye düzenlenen e-Arşiv faturalarının sorgulanması ve dönemsel olarak listelenmesini sağlar. e-Fatura akışıyla aynı sorgu ekranında çalışır; kesilen ve alınan belgeler tek listede birleştirilir.',
      'Tüm e-Arşiv kayıtları KDV analizlerine otomatik dahil olur; dönem sonu dökümlerinde ayrı bir işlem yapmanıza gerek kalmaz.'
    ],
    ozellikler: [
      { b: 'Dönemsel Sorgulama', m: 'Müşteri + yıl + ay seçimiyle e-Arşiv faturaları listelenir.' },
      { b: 'e-Fatura ile Birleşik Liste', m: 'e-Fatura ve e-Arşiv kayıtları aynı ekranda tek akışta.' },
      { b: 'KDV Analizine Dahil', m: 'Tüm belgeler dönem KDV hesaplamalarına otomatik yansır.' },
      { b: 'Arşiv Depolama', m: 'Belge içerikleri güvenli bulutta saklanır, her zaman erişilebilir.' }
    ]
  },
  {
    slug: 'e-irsaliye',
    grup: 'e-Belgeler',
    baslik: 'e-İrsaliye',
    ikon: FileCheck,
    kisa: 'Sevk irsaliyeleriniz elektronik olarak izlenir, teslim süreçleri takip edilir.',
    paragraflar: [
      'e-İrsaliye modülü, mal sevkiyatlarınızın elektronik irsaliyelerini sorgular ve dönemsel olarak listeler. Nakliye/teslim süreçlerindeki belge trafiği kağıt yükü olmadan takip edilir.',
      'e-Fatura ile eşleştirme sayesinde aynı işleme ait fatura ve irsaliye kayıtları birlikte görülebilir; dökümler raporlamaya hazır çıktı olarak alınır.'
    ],
    ozellikler: [
      { b: 'Elektronik Sevk Takibi', m: 'e-İrsaliyeleri dönem ve müşteri bazında sorgulayın.' },
      { b: 'Fatura Eşleştirme', m: 'İlgili fatura ile irsaliyeyi aynı kayıtta birleştirin.' },
      { b: 'Kağıtsız Süreç', m: 'Matbu irsaliye yükünü tamamen ortadan kaldırın.' },
      { b: 'Rapor Çıktıları', m: 'Sevk kayıtlarını Excel/CSV olarak indirin.' }
    ]
  },
  {
    slug: 'e-defter',
    grup: 'e-Belgeler',
    baslik: 'e-Defter',
    ikon: BookOpenCheck,
    kisa: 'Yevmiye ve kebir beratları yönetilir, defter kayıtları sistemle uyumlu tutulur.',
    paragraflar: [
      'e-Defter modülü, yevmiye ve kebir defterlerinizin beratlarını yönetmenizi ve kayıtların MUBiS verileriyle tutarlı kalmasını sağlar. Luca işletme defteri çıktılarıyla birebir uyumlu CSV akışları sayesinde defter kayıtları fiş ve fatura verileriyle aynı formatta üretilir.',
      'Defter beratları güvenli bulutta arşivlenir; dönem kapanışlarında GİB süreçleri için hazır dosyalar elde edilir.'
    ],
    ozellikler: [
      { b: 'Yevmiye / Kebir Berat', m: 'Berat dosyalarını yükleyin, arşivleyin ve dönemlere göre erişin.' },
      { b: 'Luca Uyumlu Kayıt Akışı', m: 'Z raporu ve gider fişi kayıtları defter formatına birebir uyumlu.' },
      { b: 'Tutarlılık Kontrolü', m: 'Defter kayıtları ile fatura/fiş verileri arasındaki tutarlılık korunur.' },
      { b: 'Güvenli Arşiv', m: 'Defter belgeleri imzalı erişimle bulutta saklanır.' }
    ]
  }
]

const ILGILI = (slug) => {
  const aktif = ICERIKLER.find(i => i.slug === slug)
  return ICERIKLER.filter(i => i.grup === aktif.grup && i.slug !== slug).slice(0, 3)
}

export default function HizmetSayfasi() {
  const { slug } = useParams()
  const icerik = ICERIKLER.find(i => i.slug === slug)
  if (!icerik) return <Navigate to="/ozellikler" replace />

  const Ikon = icerik.ikon
  const oz = icerik.paragraflar
  const ilgili = ILGILI(icerik.slug)

  return (
    <div className="min-h-screen bg-[#0a1730] text-gray-200 overflow-x-hidden">
      {/* Hero */}
      <div className="relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_15%_0%,rgba(59,130,246,0.25),transparent),radial-gradient(ellipse_50%_45%_at_90%_10%,rgba(250,204,21,0.12),transparent)]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-16">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-blue-300 hover:text-white transition-colors mb-6">
            <ArrowLeft className="w-4 h-4" /> Ana Sayfa
          </Link>
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-400/30 rounded-full px-4 py-1.5 text-xs font-semibold text-blue-300 mb-5">
            <Ikon className="w-3.5 h-3.5 text-yellow-400" />
            {icerik.grup}
          </div>
          <div className="flex items-start gap-5">
            <div className="hidden sm:flex w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-400/30 items-center justify-center flex-shrink-0">
              <Ikon className="w-8 h-8 text-yellow-400" />
            </div>
            <div>
              <h1 className="text-4xl sm:text-5xl font-black text-white leading-tight tracking-tight">{icerik.baslik}</h1>
              <p className="mt-3 text-lg text-blue-200/90 max-w-2xl leading-relaxed">{icerik.kisa}</p>
            </div>
          </div>
        </div>
      </div>

      {/* İçerik */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="grid lg:grid-cols-[1.5fr_1fr] gap-10">
          <div>
            <div className="space-y-5 text-blue-100/90 leading-relaxed text-[17px]">
              {oz.map((p, i) => <p key={i}>{p}</p>)}
            </div>

            <div className="mt-10 grid sm:grid-cols-2 gap-4">
              {icerik.ozellikler.map(o => (
                <div key={o.b} className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 hover:border-blue-400/40 transition-colors">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-white text-sm">{o.b}</div>
                      <div className="text-sm text-blue-200/80 mt-1 leading-relaxed">{o.m}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Yan sütun: CTA + ilgili sayfalar */}
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-blue-600/20 to-cyan-500/10 border border-blue-400/30 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-white">Bu hizmeti denemek ister misiniz?</h3>
              <p className="text-sm text-blue-200/85 mt-2 leading-relaxed">
                Tüm MUBiS ERP olanakları — hesaplama araçları, müşteri portalı, cari hesap takibi, belge yönetimi ve tebligat uyarıları — müşterilerimiz için <strong className="text-yellow-300">tamamen ücretsizdir</strong>. Size en uygun çözümü birlikte belirleyelim.
              </p>
              <div className="mt-4 flex flex-col gap-2.5">
                <Link to="/iletisim" className="group inline-flex items-center justify-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-blue-950 font-bold rounded-xl px-5 py-3 transition-all">
                  İletişime Geç
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                <a href="tel:+902122606667" className="inline-flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold rounded-xl px-5 py-3 transition-colors">
                  <Phone className="w-4 h-4" /> 0 (212) 260 66 67
                </a>
              </div>
            </div>

            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6">
              <div className="text-xs font-semibold text-blue-300 uppercase tracking-wide mb-3">{icerik.grup} — Diğer Konular</div>
              <div className="space-y-2">
                {ilgili.map(i => (
                  <Link
                    key={i.slug}
                    to={`/hizmet/${i.slug}`}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-blue-100 hover:bg-blue-800/40 hover:text-white transition-colors"
                  >
                    <i.ikon className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                    {i.baslik}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
