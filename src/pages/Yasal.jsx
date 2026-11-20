import { Link } from 'react-router-dom'
import { OFIS } from '../data/ofisBilgi'
import { ShieldCheck } from 'lucide-react'

// 2.7.523: KVKK uyum yasal sayfalari — Aydinlatma Metni, Gizlilik Politikasi,
// Cerez Politikasi, Kullanim Kosullari. Tum icerik tek dosyada; veri sorumlusu
// bilgileri ofisBilgi'den gelir.

function YasalKapsayici({ baslik, guncelleme, children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-950">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-yellow-400 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-blue-950" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">{baslik}</h1>
            <p className="text-xs text-gray-400">Son güncelleme: {guncelleme}</p>
          </div>
        </div>
        <div className="bg-blue-900/30 border border-blue-700/30 rounded-2xl p-6 sm:p-8 space-y-5 text-gray-300 text-sm leading-relaxed">
          {children}
        </div>
        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs">
          <Link to="/kvkk-aydinlatma" className="text-gray-400 hover:text-yellow-400">KVKK Aydınlatma Metni</Link>
          <Link to="/gizlilik-politikasi" className="text-gray-400 hover:text-yellow-400">Gizlilik Politikası</Link>
          <Link to="/cerez-politikasi" className="text-gray-400 hover:text-yellow-400">Çerez Politikası</Link>
          <Link to="/kullanim-kosullari" className="text-gray-400 hover:text-yellow-400">Kullanım Koşulları</Link>
          <Link to="/" className="text-gray-400 hover:text-yellow-400">Ana Sayfa</Link>
        </div>
      </div>
    </div>
  )
}

const SORUMLU = `${OFIS.unvan} — ${OFIS.adres}, Tel: ${OFIS.telefon}, E-posta: ${OFIS.email}`

const HAKLAR = (
  <ul className="list-disc pl-5 space-y-1">
    <li>Kişisel verilerinin işlenip işlenmediğini öğrenme,</li>
    <li>İşlenmişse buna ilişkin bilgi talep etme,</li>
    <li>İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme,</li>
    <li>Yurt içinde veya yurt dışında verilerin aktarıldığı üçüncü kişileri bilme,</li>
    <li>Eksik veya yanlış işlenmiş verilerin düzeltilmesini isteme,</li>
    <li>KVKK md. 7'de öngörülen şartlar çerçevesinde silinmesini veya yok edilmesini isteme,</li>
    <li>Bu işlemlerin aktarıldığı üçüncü kişilere bildirilmesini isteme,</li>
    <li>Münhasıran otomatik sistemlerle işlenmesi nedeniyle aleyhe bir sonucun ortaya çıkmasına itiraz etme,</li>
    <li>Kanuna aykırı işlenme sebebiyle zarara uğraması hâlinde zararın giderilmesini talep etme.</li>
  </ul>
)

const BASVURU = (
  <p>
    Başvurularınızı kimliğinizi tespit edici bilgilerle birlikte <strong className="text-white">{OFIS.email}</strong> adresine
    veya <strong className="text-white">{OFIS.adres}</strong> adresine yazılı olarak iletebilirsiniz. Talepler en geç 30 gün
    içinde ücretsiz olarak yanıtlanır.
  </p>
)

export function KVCCAydinlatma() {
  return (
    <YasalKapsayici baslik="KVKK Aydınlatma Metni" guncelleme="27.10.2026">
      <p>
        6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca veri sorumlusu:{' '}
        <strong className="text-white">{SORUMLU}</strong>
      </p>
      <div>
        <h2 className="text-white font-semibold mb-1">1. İşlenen Kişisel Veriler ve İşleme Amaçları</h2>
        <p>
          MUBiS ERP platformuna üye olan kullanıcılarımızdan (muhasebe meslek mensupları ve personelleri ile müşteri
          portalı kullanıcıları) kimlik (ad-soyad, TCKN/VKN), iletişim (e-posta, telefon), kullanıcı işlemi (giriş
          kayıtları, sistem logları) ve platformun işleyişi için gerekli veriler toplanır. Bu veriler yalnızca
          hizmetin sunulması, kullanıcı hesaplarının yönetimi, destek ve güvenliğin sağlanması amacıyla işlenir.
        </p>
        <p>
          Ayrıca platform üzerinden kaydedilen müşteri ve işveren bilgileri (Beyanname, SGK, Vergi Dairesi vb. portal
          şifreleri dahil) <strong className="text-white">kullanıcı adına, hizmetin ifası amacıyla</strong> saklanır;
          bu veriler asla hiçbir koşulda pazarlama veya üçüncü kişi paylaşımları için kullanılmaz.
        </p>
      </div>
      <div>
        <h2 className="text-white font-semibold mb-1">2. Hukuki Sebep ve Toplama Yöntemi</h2>
        <p>
          Verileriniz; KVKK md. 5/2-(c) (sözleşmenin kurulması/ifası), md. 5/2-(ç) (veri sorumlusunun hukuki
          yükümlülüğü), md. 5/2-(e) (hak kurulması, kullanılması veya korunması) ve md. 5/2-(f) (meşru menfaat)
          sebeplerine dayanılarak; web sitesi formları, üyelik/giriş ekranları ve platform kullanımı sırasında
          elektronik ortamda toplanır.
        </p>
      </div>
      <div>
        <h2 className="text-white font-semibold mb-1">3. Aktarım</h2>
        <p>
          Verileriniz; barındırma (Supabase/Cloudflare), ödeme altyapısı ve yasal yükümlülük gereği yetkili kamu
          kurumları dışında hiçbir üçüncü tarafa paylaşılmaz. Platform üzerinden saklanan müşteri verileri, ilgili
          kullanıcı hesabından başka kimse tarafından erişilemez.
        </p>
      </div>
      <div>
        <h2 className="text-white font-semibold mb-1">4. İlgili Kişinin Hakları (KVKK md. 11)</h2>
        {HAKLAR}
      </div>
      {BASVURU}
    </YasalKapsayici>
  )
}

export function GizlilikPolitikasi() {
  return (
    <YasalKapsayici baslik="Gizlilik Politikası" guncelleme="27.10.2026">
      <p>
        İşbu politika, MUBiS ERP platformunun veri güvenliği ve gizlilik esaslarını düzenler. Veri sorumlusu:{' '}
        <strong className="text-white">{SORUMLU}</strong>
      </p>
      <div>
        <h2 className="text-white font-semibold mb-1">Toplanan Veriler</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong className="text-white">Hesap verileri:</strong> ad-soyad, e-posta, telefon, rol, işletme bilgileri.</li>
          <li><strong className="text-white">Portal şifreleri:</strong> müşteri kartlarına girilen Vergi Dairesi, SGK, e-Devlet, Ticaret Odası kullanıcı adı/şifreleri; yalnızca otomasyon işlemleri için kullanılır ve şifreli olarak saklanır.</li>
          <li><strong className="text-white">Mali belgeler:</strong> faturalar, beyannameler, fişler ve benzeri belgeler yalnızca hesabınıza özel erişimle saklanır.</li>
          <li><strong className="text-white">Teknik kayıtlar:</strong> oturum logları, IP, cihaz/tarayıcı bilgisi (güvenlik ve hata ayıklama amacıyla).</li>
        </ul>
      </div>
      <div>
        <h2 className="text-white font-semibold mb-1">Veri Güvenliği</h2>
        <p>
          Tüm veri trafiği TLS ile şifrelenir; veritabanı erişim yetkileri rol bazlıdır (RLS). Şifre alanlarına
          yalnızca yetkili otomasyon süreci erişebilir. Veriler Supabase ve Cloudflare altyapısında, KVKK ve ilgili
          mevzuatın gerektirdiği özenle saklanır.
        </p>
      </div>
      <div>
        <h2 className="text-white font-semibold mb-1">Veri İşleyen Sıfatı</h2>
        <p>
          Platformda saklanan müşteri/mükellef verileri bakımından MUBiS ERP, kullanıcı hesabı sahibinin
          talimatı ve adına hareket eden <strong className="text-white">veri işleyen</strong> konumundadır; bu verileri
          kendi amaçları doğrultusunda işlemez ve saklamaz.
        </p>
      </div>
      <div>
        <h2 className="text-white font-semibold mb-1">Saklama ve İmha</h2>
        <p>
          Veriler, hizmet süresince ve yasal saklama süreleri boyunca tutulur; üyeliğin sona ermesi halinde yasal
          yükümlülükler dışında silinir/yok edilir veya anonimleştirilir.
        </p>
      </div>
      {BASVURU}
    </YasalKapsayici>
  )
}

export function CerezPolitikasi() {
  return (
    <YasalKapsayici baslik="Çerez Politikası" guncelleme="27.10.2026">
      <div>
        <h2 className="text-white font-semibold mb-1">1. Çerez Nedir?</h2>
        <p>
          Çerezler, ziyaret ettiğiniz internet siteleri tarafından tarayıcınıza kaydedilen küçük metin dosyalarıdır.
          Oturumunuzu açık tutmak ve siteyi çalıştırmak için gereklidir.
        </p>
      </div>
      <div>
        <h2 className="text-white font-semibold mb-1">2. Kullandığımız Çerez Türleri</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong className="text-white">Zorunlu çerezler:</strong> Oturum güvenliği, kullanıcı girişi ve site işleyişi için gereklidir; onay gerektirmez, devre dışı bırakılamaz.</li>
          <li><strong className="text-white">Tercih çerezleri:</strong> Tema, dil gibi tercihlerinizi hatırlar (tarayıcı yerel depolaması kullanılır).</li>
          <li><strong className="text-white">Analitik çerezler (isteğe bağlı):</strong> Yalnızca çerez banner'ında <strong className="text-white">onay verdiğinizde</strong> devreye girer. Google Analytics 4 aracılığıyla sayfa görüntüleme sayısı, oturum süresi, cihaz tipi (mobil/masaüstü) ve ziyaret edilen sayfalar gibi <strong className="text-white">anonim</strong> istatistikler toplanır. Bu kapsamda ad-soyad, T.C. kimlik numarası, vergi numarası, e-posta, telefon veya müşteri bilgisi gönderilmez. Onay vermezseniz analitik betiği hiç yüklenmez.</li>
          <li><strong className="text-white">Pazarlama/reklam çerezleri:</strong> MUBiS ERP'de kullanılmamaktadır.</li>
        </ul>
      </div>
      <div>
        <h2 className="text-white font-semibold mb-1">2.1. Yurt Dışına Aktarım</h2>
        <p>
          Analitik çerezleri onaylamanız hâlinde toplanan anonim kullanım verileri, hizmet sağlayıcı Google LLC
          (Google Analytics 4) altyapısında işlenir ve yurt dışında sunucularda saklanabilir. KVKK md. 9 kapsamında
          bu aktarım yalnızca açık rızanıza dayanılarak yapılır; onay vermemeniz hâlinde aktarım gerçekleşmez.
          Google'ın IP anonimleştirme ve reklam kişiselleştirme ayarları devre dışı bırakılmış şekilde yapılandırılmıştır.
        </p>
      </div>
      <div>
        <h2 className="text-white font-semibold mb-1">3. Onay Yönetimi</h2>
        <p>
          Siteye ilk girişinizde zorunlu olmayan çerezler için onay banner'ı gösterilir. Tercihinizi dilediğiniz
          zaman tarayıcı ayarlarından çerezleri silerek veya tercih butonlarını yeniden kullanarak
          değiştirebilirsiniz.
        </p>
      </div>
      <div>
        <h2 className="text-white font-semibold mb-1">4. Tarayıcıdan Çerezleri Kapatma</h2>
        <p>
          Tüm tarayıcılar çerezleri silme, engelleme veya belirli siteler için istisna tanımlama imkânı sunar.
          Zorunlu çerezlerin engellenmesi hâlinde platforma giriş yapamayabilirsiniz.
        </p>
      </div>
    </YasalKapsayici>
  )
}

export function KullanimKosullari() {
  return (
    <YasalKapsayici baslik="Kullanım Koşulları" guncelleme="27.10.2026">
      <div>
        <h2 className="text-white font-semibold mb-1">1. Hizmetin Konusu</h2>
        <p>
          MUBiS ERP; muhasebe meslek mensuplarına ve müşterilerine yönelik dijital ofis, beyan, belge ve otomasyon
          yönetimi hizmetidir. Platforma abonelik yoluyla erişilir.
        </p>
      </div>
      <div>
        <h2 className="text-white font-semibold mb-1">2. Kullanıcı Yükümlülükleri</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Hesap bilgilerinin (özellikle şifrelerin) güvenliğinden kullanıcı sorumludur.</li>
          <li>Platforma yüklenen verilerin hukuka uygunluğundan ve kayıtlı veri sahiplerinin izinlerinin bulunmasından kullanıcı sorumludur.</li>
          <li>Platform, 5070 sayılı Elektronik İmza Kanunu ve 213 sayılı VUK kapsamındaki işlemlerde kullanıcı adına hareket eder; işlem onayları kullanıcı sorumluluğundadır.</li>
          <li>Hizmetin kötüye kullanılması, tersine mühendislik veya yetkisiz erişim girişimleri yasaktır; tespiti halinde hesap askıya alınır.</li>
        </ul>
      </div>
      <div>
        <h2 className="text-white font-semibold mb-1">3. Fikri Mülkiyet</h2>
        <p>
          Platformun yazılımı, arayüzü, markası ve içerikleri MUBiS ERP'ye aittir; izinsiz kopyalanamaz ve
          dağıtılamaz.
        </p>
      </div>
      <div>
        <h2 className="text-white font-semibold mb-1">4. Sorumluluğun Sınırlanması</h2>
        <p>
          Hizmet "olduğu gibi" sunulur. İnternet kesintileri, üçüncü taraf altyapı hataları veya kullanıcının
          kaynaklanan veri girişi hatalarından doğan zararlarda sorumluluk, kusur oranına ve ödenen abonelik
          tutarıyla sınırlıdır.
        </p>
      </div>
      <div>
        <h2 className="text-white font-semibold mb-1">5. Uyuşmazlık Çözümü</h2>
        <p>
          İşbu koşullardan doğan uyuşmazlıklarda İstanbul Merkez Mahkemeleri ve İcra Daireleri yetkilidir; Türk
          hukuku uygulanır.
        </p>
      </div>
    </YasalKapsayici>
  )
}
