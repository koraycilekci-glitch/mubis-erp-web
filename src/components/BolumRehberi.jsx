// BolumRehberi — Müşteri portalı sekmeleri için "?" kullanım kılavuzu.
// CariHesapModul'deki kılavuzla aynı desen: sağ üstte ? düğmesi, tıklayınca
// bölüm adımları + örnek ekran (mock) gösteren modal açılır.
import { useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CircleHelp, X, FolderOpen, FileSearch, Receipt, FileText, DollarSign,
  Inbox, Calculator, Camera, Users, ChevronRight
} from 'lucide-react'

// RehberMock / RehberBolum — müşteri portalı (BolumRehberi) ve admin
// (SayfaKilavuzu) kılavuzlarında ortak kullanılır.
export function RehberMock({ baslik, icerik, vurgu = -1 }) {
  return (
    <div className="w-full md:w-64 shrink-0 bg-[#0a1730] border border-blue-700/50 rounded-lg overflow-hidden shadow-lg">
      <div className="flex items-center gap-1.5 px-3 py-2 bg-blue-900/60 border-b border-blue-800/40">
        <span className="w-2 h-2 rounded-full bg-red-400/70" />
        <span className="w-2 h-2 rounded-full bg-yellow-400/70" />
        <span className="w-2 h-2 rounded-full bg-green-400/70" />
        <span className="text-[10px] text-gray-400 ml-1 truncate">{baslik}</span>
      </div>
      <div className="p-3 space-y-1.5">
        {icerik.map((satir, i) => (
          <div key={i} className={`rounded-md px-2.5 py-1.5 text-[10px] ${vurgu === i ? 'bg-yellow-400/20 border border-yellow-400/50 text-yellow-100 font-medium' : 'bg-blue-900/40 text-gray-400'}`}>
            {satir}
          </div>
        ))}
      </div>
    </div>
  )
}

export function RehberBolum({ no, baslik, aciklama, adimlar, mock }) {
  return (
    <div className="flex flex-col md:flex-row gap-4 bg-blue-950/40 border border-blue-800/30 rounded-xl p-4">
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-white mb-1.5 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-yellow-400 text-blue-950 text-[11px] font-bold flex items-center justify-center shrink-0">{no}</span>
          {baslik}
        </h4>
        <p className="text-xs text-gray-400 mb-2">{aciklama}</p>
        <ul className="space-y-1">
          {adimlar.map((a, i) => (
            <li key={i} className="text-[11px] text-gray-300 flex gap-1.5"><span className="text-yellow-400 shrink-0">›</span>{a}</li>
          ))}
        </ul>
      </div>
      <div className="flex md:justify-end">{mock}</div>
    </div>
  )
}

// ==================== BÖLÜM İÇERİKLERİ ====================
const REHBERLER = {
  documents: {
    baslik: 'Evraklarım — Kullanım Kılavuzu',
    ikon: FolderOpen,
    bolumler: [
      {
        baslik: 'Evrakları Görüntüleme',
        aciklama: 'Muhasebecinizin paylaştığı tüm evraklar (beyanname, tahakkuk, bordro, defter, belge) yıl/ay şeklinde klasör ağacında listelenir.',
        adimlar: [
          'Klasörlerin yanındaki oka basarak yıl/ay alt klasörlerini açın.',
          'Evrak adına tıklayın — PDF/Excel belgesi yeni sekmede açılır, oradan indirebilirsiniz.',
          'Arama kutusuyla evrak adına göre hızlı arama yapabilirsiniz.',
          'Evrak görünmüyorsa muhasebeciniz henüz paylaşmamıştır; Mesajlarım sekmesinden talep edebilirsiniz.'
        ],
        mock: <RehberMock baslik="Evraklarım" icerik={['📁 2026', '  📁 Ekim (4)', '    📄 KDV2 Beyannamesi.pdf', '    📄 Muhtasar Tahakkuk.pdf', '  📁 Eylül (6)']} vurgu={3} />
      },
      {
        baslik: 'Evrak Seçme ve Gönderme',
        aciklama: 'Birden fazla evrağı seçip tek tıkla WhatsApp veya e-posta ile paylaşabilirsiniz (bankaya, kredi başvurusuna vb.).',
        adimlar: [
          'Listede her evrağın yanındaki kutucuğu işaretleyin (veya "Tümünü Seç").',
          '"Seçili Evrakları Gönder" butonuna basın.',
          'Açılan pencerede WhatsApp veya E-posta yolunu seçin.',
          'WhatsApp seçerseniz numara girin; e-posta seçerseniz adres girin — belgeler otomatik hazırlanıp gönderilir.'
        ],
        mock: <RehberMock baslik="Evrak Paylaş" icerik={['☑ KDV2 Beyannamesi.pdf', '☑ Muhtasar Tahakkuk.pdf', '2 / 14 seçili', '[WhatsApp] [E-posta]', 'Gönderilecek numara: 5xx xxx xx xx']} vurgu={4} />
      }
    ]
  },

  beyannamelerim: {
    baslik: 'Beyannamelerim — Kullanım Kılavuzu',
    ikon: FileSearch,
    bolumler: [
      {
        baslik: 'Beyanname / Tahakkuk Listeleme',
        aciklama: 'Vergi dairesine verilen beyannameler ve ödeme emri tahakkukları dönem bazında listelenir.',
        adimlar: [
          'Üstteki menülerden beyan tipini seçin: KDV, KDV2, Muhtasar, Geçici Vergi, Damga vb.',
          'Yıl ve ay seçin — boş bırakırsanız tüm dönemler listelenir.',
          'Belge türü filtresiyle sadece "Beyanname" veya "Tahakkuk" listeleyebilirsiniz.',
          'Satıra tıklayın: beyanname/tahakkuk PDF\'i açılır; oradan yazdırıp bankaya ödeme için kullanabilirsiniz.'
        ],
        mock: <RehberMock baslik="Beyannamelerim" icerik={['Tip: KDV ▼  |  Yıl: 2026 ▼  |  Ay: Ekim ▼', 'KDV  ·  Ekim 2026  ·  [Beyanname]', 'KDV  ·  Ekim 2026  ·  [Tahakkuk]', 'KDV2 · Eylül 2026 · [Beyanname]', 'Satıra tıkla → PDF açılır']} vurgu={2} />
      },
      {
        baslik: 'Liste Boş Görünüyorsa',
        aciklama: 'Beyannameler muhasebeciniz dönem işlemini tamamladıkça buraya düşer.',
        adimlar: [
          'Dönem filtrelerini "Tümü" yapıp tekrar bakın.',
          'Hâlâ boşsa muhasebeciniz henüz paylaşmamıştır — Mesajlarım sekmesinden yazarak isteyebilirsiniz.',
          'Ödemesi yapılan tahakkuklar "Muhasebe Borcum" sekmesindeki ödeme geçmişinde de görünür.'
        ],
        mock: <RehberMock baslik="Henüz yok" icerik={['Filtre: Tümü', 'Henüz paylaşılan beyanname', 'veya tahakkuk bulunmuyor.', '→ Mesajlarım ile isteyebilirsiniz']} vurgu={3} />
      }
    ]
  },

  invoices: {
    baslik: 'Faturalarım — Kullanım Kılavuzu',
    ikon: Receipt,
    bolumler: [
      {
        baslik: 'Fatura Listesi ve Filtreler',
        aciklama: 'GİB\'ten sorgulanan e-Fatura, e-Arşiv, e-SMM ve gümrük faturalarınız ay ay gruplanmış şekilde listelenir.',
        adimlar: [
          'Yıl, ay, belge türü (e-Fatura/e-Arşiv/e-SMM/UTTS/İthalat) ve fatura türü (Satış, Alış, İade, Tevkifat...) filtrelerini kullanın.',
          'Liste ay başlıkları altında gruplanır; her satırda tarih, tür, fatura no, karşı taraf, matrah, KDV ve toplam görünür.',
          '"İşlem" sütunundan faturanın PDF/XML\'ini indirip görüntüleyebilirsiniz.',
          'Faturalar mali müşaviriniz GİB sorgusu yaptığında otomatik listelenir; kendi sorgulayamazsınız.'
        ],
        mock: <RehberMock baslik="Ekim 2026 (12 fatura)" icerik={['15.10 | e-Fatura | SATIS | FT-2026-081', 'ABC A.Ş. | 50.000 | 10.000 | 60.000', '17.10 | e-Arşiv | ALIS  | VS-3341', 'DEF Ltd. | 12.500 | 2.500 | 15.000', '[PDF] [XML]  ← İşlem sütunu']} vurgu={4} />
      },
      {
        baslik: 'Özet Tablo ve Kredi Kartı Tahsilatı',
        aciklama: 'Liste üstündeki özet, dönem içi alınan/kesilen fatura toplamlarını ve POS kredi kartı tahsilatını gösterir.',
        adimlar: [
          '"Alınan" satırı size kesilen alış faturalarınızın, "Kesilen" satırı müşterilerinize kestiğiniz satış faturalarınızın matrah/KDV/toplam toplamıdır.',
          'Ay seçtiğinizde "Kredi Kartı Tahsilatı" satırında banka POS + ödeme/e-para cironuz görünür.',
          '"Sorgula" düğmesi bu tutarı Dijital Vergi Dairesi\'nden çeker — yardımcı programın çalışıyor olması gerekir.',
          'Bu özet KDV beyanınızla karşılaştırma yapmanız içindir; ayrıntı için "KDV Dökümleri" sekmesine bakın.'
        ],
        mock: <RehberMock baslik="Özet — Ekim 2026" icerik={['Alınan (8)   |  250.000 | 50.000 | 300.000', 'Kesilen (12) | 180.000 | 36.000 | 216.000', 'Kredi Kartı Tahsilatı [Sorgula]', 'POS + Ödeme/e-Para: 84.500,00 TL']} vurgu={3} />
      }
    ]
  },

  kdvdokum: {
    baslik: 'KDV Dökümleri — Kullanım Kılavuzu',
    ikon: Receipt,
    bolumler: [
      {
        baslik: 'Sorgulama Yapma',
        aciklama: 'Dijital Vergi Dairesi\'nden POS, KDV 109 (sorumlu sıfatıyla) ve KDV 110 (gümrük işlemleri) tutarları dönem bazında sorgulanır.',
        adimlar: [
          'Yıl ve ay seçin, ardından istediğiniz sorgunun "Sorgula" butonuna basın.',
          'Sorgu yardımcı programınız (MUBiS Yardımcı Programı) üzerinden çalışır; program açık değilse kurulum uyarısı görürsünüz.',
          'Sonuç kartında dönem toplamı görünür; "Detay" butonuna basınca belge bazlı alt liste (tarih, belge no, tutar) açılır.',
          'Aynı dönem için tekrar sorgulama son sonucu günceller.'
        ],
        mock: <RehberMock baslik="KDV Dökümleri — Ekim 2026" icerik={['POS KDV           [Sorgula]  [Detay]', 'KDV 109 (sorumlu) [Sorgula]  [Detay]', 'KDV 110 (gümrük)  [Sorgula]  [Detay]', 'Toplam: 46.230,00 TL', 'Detay: 03.10 ... 12.500,00 TL']} vurgu={4} />
      },
      {
        baslik: 'Tahakkuk Dönemi Notu',
        aciklama: 'GİB listeleri belge tarihine değil, KDV\'nin tahakkuk ettiği döneme göre döner.',
        adimlar: [
          'Örnek: 31/08 tarihli bir gümrük beyannamesinin KDV\'si Eylül başında tahakkuk ettiyse Eylül sorgusunda listelenir.',
          'Bu bir hata değildir; GİB\'in resmi dönemlendirmesidir.',
          'Fatura tarihine göre bakmak isterseniz "Faturalarım" sekmesindeki ay filtresini kullanın.'
        ],
        mock: <RehberMock baslik="Örnek" icerik={['Belge: 31/08/2026 gümrük beyannamesi', 'Sorgu: Eylül 2026', '→ Listede göründü ✓', '(KDV Eylül\'de tahakkuk etti)']} vurgu={2} />
      },
      {
        baslik: 'Gümrük / İthalat KDV\'leri',
        aciklama: 'Gümrük işlemleri KDV\'si (110) iki kaynaktan beslenir: GİB sorgusu ve sisteme yüklenen ithalat faturaları.',
        adimlar: [
          '"Gümrük İşlemleri KDV — GİB sorgusu" kartı: vergi dairesindeki resmi tahakkuk kayıtları.',
          '"İthalde Ödenen KDV" kartı: sizin yüklediğiniz ithalat faturalarından hesaplanan KDV.',
          'İthalat faturalarını yüklemek için "Belge Yükle" veya mali müşavirinizin Luca dökümü yüklemesi gerekir.',
          'İki kart arasındaki farkı dönem kapanışında mali müşavirinizle mutabık kalın.'
        ],
        mock: <RehberMock baslik="Gümrük KDV" icerik={['GİB sorgusu:      193.708,23 TL', 'İthalde Ödenen:  187.940,00 TL', 'Fark (mutabakat): 5.768,23 TL', 'Kaynak: yüklenen ithalat', 'faturaları + GİB 110 listesi']} vurgu={2} />
      }
    ]
  },

  'fatura-kesim': {
    baslik: 'e-Arşiv / e-Fatura / e-SMM Kesimi — Kullanım Kılavuzu',
    ikon: FileText,
    bolumler: [
      {
        baslik: 'Fatura / Makbuz Doldurma',
        aciklama: 'Profilinizde e-Arşiv, e-Fatura veya e-SMM yetkisi varsa bu sekmeden fatura kesebilirsiniz.',
        adimlar: [
          'Üstten belge türünü seçin: e-Arşiv, e-Fatura veya e-SMM Makbuzu.',
          'Alıcının VKN/TCKN\'sini girin — ünvan ve vergi dairesi GİB\'ten otomatik gelir; önceki kesimlerden adres otomatik taşınır.',
          'Kalem satırlarını doldurun: miktar, birim fiyat, KDV oranı — tutarlar ve tevkifat otomatik hesaplanır.',
          '"Kaydet" ile taslak olarak saklar, "Kaydet & GİB\'e Gönder" ile doğrudan gönderim kuyruğuna alırsınız.'
        ],
        mock: <RehberMock baslik="e-Arşiv Fatura Kesimi" icerik={['VKN/TCKN: 1234567890', 'Ünvan: ABC TİC. LTD. ŞTİ. (GİB\'ten)', 'Kalem: Danışmanlık | 1 | 50.000 | %20', 'Ara Toplam 50.000 | KDV 10.000', '[Kaydet] [Kaydet & GİB\'e Gönder]']} vurgu={4} />
      },
      {
        baslik: 'GİB Gönderimi (Otomatik Doldurma)',
        aciklama: 'Gönderim, bilgisayarınızdaki MUBiS Yardımcı Programı ile GİB portalini otomatik doldurarak yapılır.',
        adimlar: [
          'Gönderim başlayınca yardımcı program GİB e-Arşiv Portal\'ını açıp taslağı tek tek forma doldurur.',
          'GİB ekranında (Oluştur)\'a bastıktan sonra MUBiS\'teki "Devam Et" butonuna basın — sıradaki faturaya geçilir.',
          'e-Fatura ve e-SMM gönderimi e-İmza ister: müşteri kartında "Kart Şifresi (PIN)" tanımlı olmalı ve e-İmza bilgisayara takılmalı.',
          'Göndermek istemezseniz "İptal" ile diziyi durdurabilirsiniz; kalan taslaklar saklanır.'
        ],
        mock: <RehberMock baslik="GİB gönderimi sürüyor" icerik={['3 fatura sırayla doldurulacak', 'Fatura 2/3 — ABC TİC. LTD.', '2/3 dolduruldu', 'GİB\'de (Oluştur) → [Devam Et]', 'İstemezsen: [İptal]']} vurgu={3} />
      },
      {
        baslik: 'Kayıtlı Taslaklar',
        aciklama: 'Kaydettiğiniz taslaklar listede bekler; sonra gönderir veya düzenlersiniz.',
        adimlar: [
          '"Kayıtlı Taslaklar" bölümünü açın — toplamları ve tarihleriyle listelenir.',
          '"GİB\'e Gönder": tek taslağı gönderim kuyruğuna alır.',
          '"Yükle": taslağı forma geri yükler (düzenleme modu — Kaydet aynı taslağın üzerine yazar).',
          '"Tümünü GİB\'e Gönder": birden fazla taslağı sırayla gönderir. "Sil" ile geri alırsınız.'
        ],
        mock: <RehberMock baslik="Kayıtlı Taslaklar (2)" icerik={['e-Arşiv | ABC TİC. | 60.000 TL', '[GİB\'e Gönder] [Yükle] [Sil]', 'e-Arşiv | DEF LTD. | 11.800 TL', '[GİB\'e Gönder] [Yükle] [Sil]', '[Tümünü GİB\'e Gönder (2)]']} vurgu={4} />
      }
    ]
  },

  borc: {
    baslik: 'Muhasebe Borcum — Kullanım Kılavuzu',
    ikon: DollarSign,
    bolumler: [
      {
        baslik: 'Borç Özeti',
        aciklama: 'Muhasebe hizmet bedelinizin hesap dökümü tek kartta görünür; kalan borç otomatik hesaplanır.',
        adimlar: [
          'Kartta satır satır dökümü görürsünüz: Önceki Dönem Borcu + Defter Tasdik + Aylık Ücret (geçen ay sayısı × aylık ücret) = Toplam Borç.',
          'Yaptığınız ödemeler ve borçtan düşülen tutarlar bu toplamdan düşülür.',
          'En altta kırmızı veya yeşil renkli KALAN BORC görünür — 0 ise borcunuz yoktur.',
          'Ödemeniz "Alındı" durumunda ama borçtan henüz düşülmediyse "Alınan Ödeme (Borç Düşülümü Bekliyor)" satırında görünür.'
        ],
        mock: <RehberMock baslik="Borç Durumunuz" icerik={['Önceki Dönem:        2.400,00 TL', 'Defter Tasdik:       1.200,00 TL', 'Aylık Ücret (8 × 2.000): 16.000,00', 'TOPLAM BORÇ:        19.600,00 TL', 'KALAN BORC:          4.100,00 TL']} vurgu={4} />
      },
      {
        baslik: 'Ödeme Yapma',
        aciklama: 'Kredi kartıyla online veya havale/EFT ile ödeme yapabilirsiniz.',
        adimlar: [
          '"Kredi Kartı ile Öde" butonuna basın, tutarı girip güvenli ödeme formunu doldurun.',
          'Havale/EFT için banka bilgileri kartında (IBAN) görünür; açıklamaya firma adınızı yazın.',
          'Ödemeniz önce "Onay Bekliyor" durumuna düşer; muhasebeciniz onaylayınca "Borçtan Düşüldü" olur.',
          'Ödeme geçmişi tablosunda tüm ödemelerinizi tarih, tutar ve durum ile izleyebilirsiniz.'
        ],
        mock: <RehberMock baslik="Ödeme Geçmişi" icerik={['01.10.2026 | 5.500,00 TL | Borçtan Düşüldü', '28.09.2026 | 4.100,00 TL | Onay Bekliyor', 'Kredi Kartı: [Öde]', 'Havale: IBAN TRxx ... xxxx', 'Açıklamaya firma adı yazın']} vurgu={1} />
      }
    ]
  },

  'kira-stopaj': {
    baslik: 'Kira Stopaj Listesi — Kullanım Kılavuzu',
    ikon: FileText,
    bolumler: [
      {
        baslik: 'Stopaj Listesini Oluşturma',
        aciklama: 'Profilinizdeki kira bilgilerine göre aylık brüt kira / stopaj / net kira dökümü hazırlanır; mal sahibine ödenecek stopajı gösterir.',
        adimlar: [
          'Yıl ve ay aralığı seçin (örn. Ocak–Aralık).',
          'Birden fazla mal sahibi varsa üstteki menüden mal sahibini seçin.',
          'Tabloda her ay için Brüt Kira, Stopaj (%20) ve Net Kira kolonları; en altta dönem toplamı görünür.',
          'Kira bilgisi eksikse "Profilim" sekmesinden kira tutarı ve mal sahibi bilgilerini ekleyin.'
        ],
        mock: <RehberMock baslik="2026 Kira Stopaj Listesi" icerik={['Mal Sahibi: Ahmet Yılmaz ▼', 'Ocak | 20.000 | 4.000 | 16.000', 'Şubat | 20.000 | 4.000 | 16.000', 'Mart  | 20.000 | 4.000 | 16.000', 'Toplam stopaj: 12.000,00 TL']} vurgu={4} />
      },
      {
        baslik: 'Paylaşım ve Arşiv',
        aciklama: 'Listeyi Excel/PDF olarak indirir veya doğrudan mal sahibine gönderirsiniz.',
        adimlar: [
          '"Excel" ile ham dökümü, "PDF" ile yazdırılabilir resmi listeyi indirin.',
          '"Gönder" ile liste e-posta veya WhatsApp üzerinden mal sahibine iletilir.',
          'Muhtasar beyanınızı yaparken bu listedeki stopaj tutarlarını kullanabilirsiniz.'
        ],
        mock: <RehberMock baslik="Paylaşım" icerik={['[Excel]  [PDF]', '[E-posta Gönder] [WhatsApp]', 'Alıcı: Ahmet Yılmaz', 'Konu: 2026 Kira Stopaj Listesi']} vurgu={1} />
      }
    ]
  },

  tebligatlarim: {
    baslik: 'e-Tebligatlarım — Kullanım Kılavuzu',
    ikon: Inbox,
    bolumler: [
      {
        baslik: 'Tebligatları Görüntüleme',
        aciklama: 'Vergi Dairesi ve SGK\'ya tebliğ edilen resmi yazışmalarınız burada listelenir; okunmamışlar işaretlidir.',
        adimlar: [
          'Üstteki "Vergi Dairesi" / "SGK" sekmeleriyle kaynağı seçin; butonlarda okunmamış sayısı görünür.',
          'Tebligat satırına (kurum/belge adına) tıklayın: PDF indirilir ve açılır. Kayıtlıysa anında açılır.',
          '"Durum" sütunu tebligatı okuyup okumadığınızı gösterir — açtığınız tebligat otomatik "Okunmuş" olur.',
          '"Yenile" butonu tebligat listesini Vergi Dairesi/SGK\'dan yeniden sorgular.'
        ],
        mock: <RehberMock baslik="e-Tebligatlarım" icerik={['[Vergi Dairesi (2 yeni)] [SGK]', 'Gelir İdaresi | Haciz | 12.10', '● Okunmamış', 'SGK      | Tahakkuk | 05.10', '✓ Okunmuş  [Görüntüle]']} vurgu={2} />
      },
      {
        baslik: 'Belge Açılmıyorsa',
        aciklama: 'İndirme, bilgisayarınızdaki MUBiS Yardımcı Programı üzerinden yapılır.',
        adimlar: [
          '"İndir ve Görüntüle" yazan satır için yardımcı programın çalışıyor olması gerekir.',
          'Hata alırsanız mesajda yazan nedeni kontrol edin: DVS kullanıcı adı/şifre eksikse Profilinize ekleyin.',
          'Yardımcı program kurulu değilse MUBiS ayarlar sayfasından kurun; eski sürüm çalışıyorsa güncelleyin.',
          'İndirilen belge Storage\'a kaydedilir; sonraki açışlarda doğrudan görüntülenir.'
        ],
        mock: <RehberMock baslik="Hata mesajı örneği" icerik={['"Belge indirilemedi: dvs-sifre-eksik"', '→ Profilim > DVS kullanıcı adı/şifre', '→ Yardımcı program çalışıyor mu?', '→ Sorgulayınca PDF kaydedilir ✓']} vurgu={2} />
      }
    ]
  },

  hesaplamalar: {
    baslik: 'Hesaplamalar — Kullanım Kılavuzu',
    ikon: Calculator,
    bolumler: [
      {
        baslik: 'Hesap Seçme ve Kullanma',
        aciklama: 'Sık kullanılan bordro, vergi ve gayrimenkul hesaplamaları kategorilere ayrılmıştır; sonuçlar anında hesaplanır.',
        adimlar: [
          'Kategori kartına tıklayın: Personel (Brüt/Net, Kıdem-İhbar, İzin, Emeklilik, Borçlanma, SSK Hissesi), KDV/Fatura (KDV Dahil-Hariç, Tevkifat/Stopajlı Fatura), Gayrimenkul (GMS İradi, Kira Artışı, Değer Artış Kazancı), Damga Vergisi.',
          'Açılan formda alanları doldurun — sonuç altta anında güncellenir, "Hesapla" beklemenize gerek yok.',
          'Net maaş girerseniz brüt karşılığı otomatik geri hesaplanır (ve tersi).',
          'Kıdem/İhbar hesabında çıktıyı PDF olarak alabilir, personel bilgisini kaydedebilirsiniz.'
        ],
        mock: <RehberMock baslik="Brüt/Net Ücret" icerik={['Yön: Brütten Nete ▼', 'Brüt Ücret: 30.000 TL', 'SGK İşçi Payı:  -4.425,00', 'Gelir Vergisi:  -3.922,50', 'NET ÜCRET:     21.652,50 TL']} vurgu={4} />
      },
      {
        baslik: 'Örnek: KDV / Tevkifatlı Fatura',
        aciklama: 'Fatura kesmeden önce tutar kontrolü için kullanılır.',
        adimlar: [
          '"KDV Dahil / Hariç" hesabında tutarı ve oranı girin; KDV dahil/hariç karşılıkları listelenir.',
          '"Tevkifat / Stopajlı Fatura" hesabında tevkifat oranı (%50, %70...) veya stopaj oranını seçin.',
          'Ödenecek KDV, kesilen stopaj ve net ödenecek tutar ayrı satırlarda gösterilir.'
        ],
        mock: <RehberMock baslik="Tevkifatlı Fatura" icerik={['Tutar: 10.000 TL | KDV %20', 'Tevkifat: %50 ▼', 'KDV: 2.000,00', 'KDV Tevkifatı: -1.000,00', 'Ödenecek KDV: 1.000,00 TL']} vurgu={4} />
      }
    ]
  },

  upload: {
    baslik: 'Belge Yükle — Kullanım Kılavuzu',
    ikon: Camera,
    bolumler: [
      {
        baslik: 'Belge Türü Seçme',
        aciklama: 'Yükleyeceğiniz belge türünü seçin; okunan veriler muhasebe kayıtlarına otomatik işlenir.',
        adimlar: [
          '"Z Raporu": yazarkasa günlük Z raporunun fotoğrafını/PDF\'ini yükleyin — satış, KDV ve ödeme kalemleri OCR ile okunur.',
          '"Gider Fişi": gider fişi/faturanızın fotoğrafını yükleyin — tarih, VKN, tutar ve KDV okunur.',
          'Fotoğraf çekerken belgeyi düz zeminde, köşeleri görünecek şekilde ve titremeden çekin.'
        ],
        mock: <RehberMock baslik="Belge Yükle" icerik={['[📷 Z Raporu]  [🧾 Gider Fişi]', 'Z Raporu seçili', '[Fotoğraf Çek] [Dosya Seç]', 'OCR okuma başlıyor...']} vurgu={2} />
      },
      {
        baslik: 'Okunan Verileri Kontrol Etme',
        aciklama: 'OCR okuması bittikten sonra alanlar ekranda listelenir; yanlış okunan alanları düzeltip kaydedersiniz.',
        adimlar: [
          'Tarih, evrak no, tutar ve KDV alanlarını kontrol edin — hatalıysa alana tıklayıp düzeltin.',
          'Z Raporu\'nda satış oranları (KDV %1/%10/%20) ayrı ayrı okunur; toplamlar fişle eşleşmeli.',
          '"Kaydet" deyince belge dönem kayıtlarına işlenir; mali müşaviriniz tarafında da görünür.',
          'Aynı Z raporunu/fişi iki kez yüklemeyin — mükerrer kayıt uyarısı alırsınız.'
        ],
        mock: <RehberMock baslik="OCR Sonucu" icerik={['Tarih: 15.10.2026 ✓', 'Satış %20: 12.400,00  KDV: 2.480,00', 'Nakit: 8.000  Kredi Kartı: 6.880', '[Düzelt] [Kaydet ✓]']} vurgu={3} />
      }
    ]
  },

  personel: {
    baslik: 'Personel — Kullanım Kılavuzu',
    ikon: Users,
    bolumler: [
      {
        baslik: 'Personel ve İzin Takibi',
        aciklama: 'Personel kayıtlarınız, yıllık izin bakiyeleri, izin girişleri ve sağlık raporları tek ekranda takip edilir.',
        adimlar: [
          '"Personel Kayıtları"ndan personel ekleyin: ad-soyad, TC, işe giriş tarihi, brüt ücret.',
          'Yıllık izin hakkı, işe giriş tarihine göre kıdeme göre otomatik hesaplanır (14/20/26 gün).',
          '"İzin Girişi" ile kullanılan izinleri tarih aralığıyla girin — bakiye anında güncellenir.',
          '"Sağlık Raporu" ile raporlu günleri girin; SGK rapor sorgulaması da bu ekrandan yapılır.'
        ],
        mock: <RehberMock baslik="Personel İzin Takibi" icerik={['Ali Veli | İşe giriş: 01.03.2022', 'Hak: 20 gün | Kullanılan: 8', 'Kalan: 12 gün', 'Raporlu: 3 gün (Ekim)', '[İzin Girişi] [Sağlık Raporu]']} vurgu={2} />
      },
      {
        baslik: 'SGK Rapor Sorgulama',
        aciklama: 'SGK\'dan raporlarınız sorgulanır; onaylı ve onay bekleyen raporlar karşılaştırılarak listelenir.',
        adimlar: [
          'Moddan "Onaylı Raporlar" veya "Onay Bekleyen Raporlar" seçin, ay seçin.',
          'Sorgu yardımcı program üzerinden yapılır; SGK aynı kullanıcıyla 1 dakikada 1 sorguya izin verir — onay bekleyen sorgusu yaklaşık 1 dakika sürer.',
          'Onay bekleyen rapor yoksa "Onay bekleyen rapor yok" uyarısı görürsünüz.',
          'Raporlar ay süzgeciyle listelenir: rapor aralığı seçtiğiniz aya değiyorsa o ayda gösterilir.'
        ],
        mock: <RehberMock baslik="SGK Rapor Sorgusu" icerik={['Mod: Onay Bekleyen ▼ | Ay: Ekim ▼', '[Sorgula]', '~1 dakika sürer (SGK limiti)', '22.09–01.10 raporu → Ekim\'de ✓', 'Onay bekleyen rapor yok ✓']} vurgu={4} />
      }
    ]
  }
}

// ==================== BUTON + MODAL ====================
export default function BolumRehberi({ bolum }) {
  const [acik, setAcik] = useState(false)
  const rehber = REHBERLER[bolum]
  if (!rehber) return null
  return (
    <>
      <button
        onClick={() => setAcik(true)}
        title="Kullanım Kılavuzu"
        className="fixed top-4 right-4 z-40 w-9 h-9 rounded-full bg-blue-600/40 border border-blue-400/40 text-yellow-300 hover:bg-yellow-400 hover:text-blue-950 hover:border-yellow-400 flex items-center justify-center shadow-lg shadow-blue-950/50 transition-colors"
      >
        <CircleHelp className="w-5 h-5" />
      </button>

      {acik && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setAcik(false)}>
          <div className="bg-[#0a1730] border border-blue-700/40 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-blue-800/40 shrink-0">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <CircleHelp className="w-5 h-5 text-yellow-400" /> {rehber.baslik}
              </h3>
              <button onClick={() => setAcik(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              {rehber.bolumler.map((b, i) => (
                <RehberBolum key={i} no={String(i + 1)} baslik={b.baslik} aciklama={b.aciklama} adimlar={b.adimlar} mock={b.mock} />
              ))}
              <div className="text-[11px] text-gray-500 text-center pt-1 flex items-center justify-center gap-1.5">
                <ChevronRight className="w-3 h-3" /> Sorunuz olursa sağ alttaki MUBİS Asistan'a yazabilir veya Mesajlarım sekmesinden muhasebecinize ulaşabilirsiniz.
              </div>
            </div>
            <div className="flex justify-end px-5 py-4 border-t border-blue-800/40 shrink-0">
              <button onClick={() => setAcik(false)} className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-blue-950 px-4 py-2 rounded-lg text-sm font-semibold">Anladım</button>
            </div>
          </div>
        </div>, document.body
      )}
    </>
  )
}
