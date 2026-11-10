// SayfaKilavuzu — admin/personel sayfalari icin "?" kullanım kılavuzu.
// Müşteri portalındaki BolumRehberi ile AYNI desen ve palet:
// numaralı bölümler + örnek ekran (RehberMock) + sarı ipucu kutusu.
// RehberMock / RehberBolum BolumRehberi.jsx'ten alınır (tek kaynak).
import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { CircleHelp, X, Lightbulb, ChevronRight } from 'lucide-react'
import { RehberMock, RehberBolum } from './BolumRehberi'

// ==================== SAYFA KILAVUZLARI ====================
const KILAVUZLAR = {
  '/admin': {
    baslik: 'Ana Sayfa — Kullanım Kılavuzu',
    bolumler: [
      {
        baslik: 'Genel Durum',
        aciklama: 'Ofisin anlık özeti kartlarda görünür.',
        adimlar: ['Bekleyen beyan sayısı, müşteri sayısı ve dönem özetini buradan takip edin.'],
        mock: <RehberMock baslik="MUBiS — Genel Durum" icerik={['Bekleyen Beyan: 12', 'Müşteri: 86', 'Dönem: Ekim 2026', 'Bu Ay Gelen Evrak: 34']} vurgu={0} />
      },
      {
        baslik: 'Yaklaşan Görevler ve Hızlı Erişim',
        aciklama: 'Vergi takvimi hatırlatmaları alttaki kısayol kutularıyla birlikte gelir.',
        adimlar: ['Kartlardaki tarihe tıklayınca Vergi Takvimi açılır.', 'Kısayol kutuları sık kullanılan sayfalara tek tıkla götürür.'],
        mock: <RehberMock baslik="Yaklaşan" icerik={['🗓 KDV2 — son gün 28.10.2026', '🗓 Muhtasar — 26.10.2026', '[Fatura Sorgulama] [Fişler] [Taramalar]']} vurgu={1} />
      }
    ],
    ipucu: 'Sol menüdeki tüm bölümler bu sayfadan başlayarak düzenlenmiştir; aradığınız bölümü menüden seçin.'
  },

  '/admin/fatura-sorgulama': {
    baslik: 'Fatura Sorgulama — Kullanım Kılavuzu',
    bolumler: [
      {
        baslik: 'Kriterleri Seç',
        aciklama: 'Sorgu üst barda müşteri + dönem ile yapılır.',
        adimlar: ['Müşteri, yıl, ay, belge türü ve işlem yönünü seçin.', '"Tek Müşteri" ya da "Toplu Müşteri" modunda çalışabilirsiniz.'],
        mock: <RehberMock baslik="Fatura Sorgulama" icerik={['Müşteri: ABC Ltd. ▼ | Yıl: 2026 | Ay: Ekim', '(•) Tek Müşteri   ( ) Toplu Müşteri', '[Sorgula]  [Luca\'dan İndir]']} vurgu={0} />
      },
      {
        baslik: 'Listeyi Kullan',
        aciklama: 'Fatura listesi seçilen dönemin kayıtlarını anında getirir.',
        adimlar: ['Göz simgesiyle fatura detayını açın.', 'Excel/PDF döküm alın, satır işaretleyip Sil ile kaldırın.', '"Araç KDV+ÖTV Matraha İlave" seçili faturalarda KDV\'yi matraha ekler.'],
        mock: <RehberMock baslik="Ekim 2026 (138 fatura)" icerik={['15.10 | SATIS | ABC A.Ş. | 50.000 | 60.000', '17.10 | ALIS  | DEF Ltd. | 12.500 | 15.000', '[👁] [Excel] [PDF] [Sil] [Araç KDV+ÖTV]']} vurgu={2} />
      },
      {
        baslik: 'Ek Filtreler',
        aciklama: 'Listeyi daraltmak için ek filtre panelini açın.',
        adimlar: ['Tarih aralığı, belge no, tutar ve VKN filtreleri kullanın.', '"Filtreleri Temizle" tüm filtreleri sıfırlar.'],
        mock: <RehberMock baslik="Ek Filtreler" icerik={['Tarih: 01.10.2026 → 31.10.2026', 'Belge No: ______  VKN: ______', '[Filtrele]  [Filtreleri Temizle]']} vurgu={2} />
      }
    ],
    ipucu: 'Liste seçilen yıl+ayın kayıtlarını anında getirir; dönem değişince liste kendini tazeler.'
  },

  '/admin/fisler': {
    baslik: 'Fişler — Kullanım Kılavuzu',
    bolumler: [
      {
        baslik: 'Müşteri ve Dönem Seç',
        aciklama: 'Üst bardaki seçimlere göre fiş ve Z raporları listelenir.',
        adimlar: ['Müşteri, yıl ve ay seçin; listeye o dönemin kayıtları gelir.'],
        mock: <RehberMock baslik="Fişler" icerik={['Müşteri: ABC Ltd. ▼ | 2026 | Ekim', 'Sekmeler: [Z Raporu (4)] [Gider Fişi (12)]']} vurgu={1} />
      },
      {
        baslik: 'Kayıt Türleri ve Elle Giriş',
        aciklama: 'OCR ile okunan kayıtlar rozetli gelir; eksikleri elle girebilirsiniz.',
        adimlar: ['"Yeni Kayıt" düğmesiyle Z raporu ya da gider fişi elle eklenir.', 'Birden fazla satırı işaretleyip toplu silebilirsiniz.'],
        mock: <RehberMock baslik="Z Raporu — Ekim" icerik={['Z-128 | 15.10 | Brüt 48.200 | Net 42.900 | ✓okundu', 'Z-129 | 16.10 | Brüt 51.300 | Net 45.600 | ✓okundu', '[Yeni Kayıt]  [Seçilenleri Sil]']} vurgu={0} />
      },
      {
        baslik: 'Dökümler',
        aciklama: 'Luca-uyumlu CSV dosyaları indirin.',
        adimlar: ['Luca İşletme Z Rapor CSV ve Luca İşletme Gider CSV düğmelerini kullanın.'],
        mock: <RehberMock baslik="Döküm Al" icerik={['[Luca İşletme Z Rapor CSV]', '[Luca İşletme Gider CSV]']} vurgu={0} />
      }
    ],
    ipucu: 'Tarayıcıdan tarama yapıyorsanız "Tarama Klasörünü Bağla" paneli bu sayfadadır.'
  },

  '/admin/taramalar': {
    baslik: 'Taramalar — Kullanım Kılavuzu',
    bolumler: [
      {
        baslik: 'Gelen Taramalar',
        aciklama: 'Telefondan veya tarayıcıdan gönderilen belgeler "yeni" durumda listelenir.',
        adimlar: ['Her kartta müşteri, dönem, tip ve önizleme görünür.'],
        mock: <RehberMock baslik="Taramalar" icerik={['📱 ABC Ltd | Ekim | Fiş | 1.250,00 TL | [Yeni]', '📱 ABC Ltd | Ekim | Z Raporu | Z-128 | [Yeni]', '[İşle]  [Sil]']} vurgu={0} />
      },
      {
        baslik: 'Ön Okuma ve İşleme',
        aciklama: 'Ön okuma verisi kartta gösterilir; "İşle" kayda dönüştürür.',
        adimlar: ['Fişte VKN/tarih/tutar, Z raporunda Z No/brüt-net okunur.', '"İşle" ile Z raporu ya da gider fişi kaydı oluşur; fotoğraf arşivde kalır.'],
        mock: <RehberMock baslik="İşle" icerik={['VKN: 1234567890 | 15.10.2026 | 1.250,00 TL', 'Tip: (•) Gider Fişi  ( ) Z Raporu', '[Kaydet] → Fişler bölümünde görünür']} vurgu={1} />
      }
    ],
    ipucu: 'İşlenen kayıtlar Fişler bölümünde görünür; tarama listesinden düşer.'
  },

  '/admin/musteriler': {
    baslik: 'Müşteriler — Kullanım Kılavuzu',
    bolumler: [
      {
        baslik: 'Liste ve Arama',
        aciklama: 'Tüm müşteriler alfabetik listelenir.',
        adimlar: ['Üstteki arama kutusuyla unvan/VKN filtreleyin.'],
        mock: <RehberMock baslik="Müşteriler (86)" icerik={['🔍 ara...', 'ABC TASARIM LTD. ŞTİ. | 1234567890 | [✏]', 'ELEKTRO-AK SAN. TİC. | 9876543210 | [✏]']} vurgu={1} />
      },
      {
        baslik: 'Yeni Müşteri ve Detay',
        aciklama: 'Kayıt açınca portal giriş hesabı otomatik oluşur.',
        adimlar: ['"Yeni Müşteri" ile kayıt açın — kullanıcı adı VKN/TC, şifre 123456.', 'Kalem simgesiyle detaya girin: Modüller, Yetkiler, Luca ayarları.', 'Müşteri sınıfı (2. sınıf / serbest meslek) beyan listelerini etkiler.'],
        mock: <RehberMock baslik="ABC TASARIM — Detay" icerik={['Modüller: ☑ KDV  ☑ Fişler  ☐ Cari', 'Luca Firma Kodu: ABC2026', '[Kaydet]']} vurgu={2} />
      }
    ],
    ipucu: 'Luca\'dan firma yüklerken var olan firmalar tekrar eklenmez, güncellenir.'
  },

  '/admin/aylik-beyan-takip': {
    baslik: 'Aylık Beyan Takip — Kullanım Kılavuzu',
    bolumler: [
      {
        baslik: 'Dönem Seç ve Matris',
        aciklama: 'Matris müşteri x beyan türü hücrelerinden oluşur.',
        adimlar: ['Yıl ve ay seçin; hücreler o dönemin durumlarını gösterir.'],
        mock: <RehberMock baslik="Ekim 2026" icerik={['           | KDV1 | KDV2 | Muht.', 'ABC Ltd.  |  ✅  | E.Al | 🔵', 'ELEKTRO-AK | Hazır| ✅   | ✅', '[Hücreye tıkla → durum değişir]']} vurgu={2} />
      },
      {
        baslik: 'Durumlar ve Sıfırlama',
        aciklama: 'Durum seçenekleri: Yapılmadı, E.Alındı, Hazır, Onaylandı, Gönderildi.',
        adimlar: ['"Matrisi Sıfırla" seçilen dönemdeki tüm işaretlemeleri kaldırır.', 'GİB\'e yüklenen beyannameler otomatik "Onaylandı" işaretlenir.'],
        mock: <RehberMock baslik="Durum Menüsü" icerik={['( ) Yapılmadı   ( ) E.Alındı', '(•) Hazır       ( ) Onaylandı', '( ) Gönderildi', '[Matrisi Sıfırla]']} vurgu={1} />
      }
    ],
    ipucu: 'Beyanname Kontrol Listesi\'ndeki "Aylık Beyan Takip\'e Aktar" düğmesi gönderilenleri buraya işaretler.'
  },

  '/admin/beyanname-kontrol': {
    baslik: 'Beyanname Kontrol Listesi — Kullanım Kılavuzu',
    bolumler: [
      {
        baslik: 'GİB\'den Sorgula',
        aciklama: 'Seçilen dönemde yüklenen beyannameleri GİB\'den çeker.',
        adimlar: ['Yıl + dönem seçip sorgulayın; yardımcı program açık olmalı.'],
        mock: <RehberMock baslik="Beyanname Kontrol" icerik={['Yıl: 2026 ▼  Dönem: Ekim ▼', '[GİB\'den Sorgula]', 'Sorgulanan: 12 beyanname']} vurgu={1} />
      },
      {
        baslik: 'Matris ve Aktarım',
        aciklama: 'Gönderilenler yeşil "Gönderildi" hücresiyle görünür.',
        adimlar: ['"Aylık Beyan Takip\'e Aktar" gönderilenleri takip matrisinde Onaylandı yapar.', 'Yapıldı/Onaylandı hücreleri koruma gereği düşürülmez.'],
        mock: <RehberMock baslik="Matris" icerik={['ABC Ltd.  | KDV1 ✓ | KDV2 ✓ | Muh ✓', 'ELEKTRO-AK | KDV1 ✓ | —     | —', '[Aylık Beyan Takip\'e Aktar]']} vurgu={2} />
      }
    ],
    ipucu: 'Aktarım yalnız müşteriyle eşleşen kayıtları işler.'
  },

  '/admin/beyanname-gonderim': {
    baslik: 'Beyanname Gönderim — Kullanım Kılavuzu',
    bolumler: [
      {
        baslik: 'Klasördeki Sayfalar',
        aciklama: 'Bu bölüm iki alt sayfadan oluşur.',
        adimlar: ['e-Beyanname: Defter beyan portalına giriş ve gönderim.', 'Beyan Hazırlama: Geçici vergi hesap özeti hazırlama.'],
        mock: <RehberMock baslik="Beyanname Gönderim" icerik={['📁 e-Beyanname → portal giriş / gönderim', '📁 Beyan Hazırlama → hesap özeti', 'Yardımcı program: çalışıyor ✓']} vurgu={2} />
      }
    ],
    ipucu: 'Yardımcı program açık olmalı — MUBiS yardımcısı çalışıyorsa portal otomatik açılır.'
  },

  '/admin/beyan-hazirlama': {
    baslik: 'Beyan Hazırlama — Kullanım Kılavuzu',
    bolumler: [
      {
        baslik: 'Müşteri ve Kar Oranı',
        aciklama: 'Listede 2. sınıf işletme ve serbest meslek mükellefleri birlikte görünür.',
        adimlar: ['Mükellefi seçin, kar oranını yazın.', 'Hesap özeti hasılat üzerinden brüt kar, satılan mal maliyeti, net kar ve geçici vergiyi hesaplar.'],
        mock: <RehberMock baslik="Beyan Hazırlama" icerik={['Müşteri: ABC Ltd (2. sınıf) ▼', 'Kar Oranı: %15', 'Brüt Kar 75.000 | SMK 60.000 | Net Kar 15.000', 'Ödenecek Geçici Vergi: 2.250 TL']} vurgu={2} />
      },
      {
        baslik: 'Portala Gönder',
        aciklama: '"Onayla ve Portala Gönder" akışı portalı otomatik doldurur.',
        adimlar: ['Hesap özeti defter beyana yazılır, Kaydet+Tamam\'a basılır.', 'Dönem sonu devri girilir, beyanname ekranı açılır.', 'Ortaklıkta "Diğer Ortağa Geç" ile sıradaki ortağa geçersiniz.'],
        mock: <RehberMock baslik="Portal Akışı" icerik={['[Onayla ve Portala Gönder]', '→ hesap özeti yazıldı ✓', '→ Kaydet + Tamam basıldı ✓', '→ beyanname ekranı açık', '[Devam] [Sonraki Beyan] [Bitti]']} vurgu={0} />
      }
    ],
    ipucu: 'Önceki dönem ödenen geçici vergi, müşterinin beyanname klasöründeki PDF\'ten otomatik okunur.'
  },

  '/admin/kdv-dokumleri': {
    baslik: 'KDV Dökümleri — Kullanım Kılavuzu',
    bolumler: [
      {
        baslik: 'Müşteri + Dönem Seç',
        aciklama: 'Sol menüden taşındı: burada müşteri, yıl ve ay seçip döküm alırsınız.',
        adimlar: ['Seçimi yaptıktan sonra döküm düğmesini kullanın.'],
        mock: <RehberMock baslik="KDV Dökümleri" icerik={['Müşteri: ABC Ltd ▼ | 2026 | Ekim', '[Excel Döküm]']} vurgu={0} />
      },
      {
        baslik: 'Excel Döküm Formatı',
        aciklama: 'Elle girdiğiniz formatta dosya üretilir.',
        adimlar: ['Tarihler gg.aa.yyyy yazılır (01.10.2026).', 'Çok oranlı faturalar her oran için ayrı satırda listelenir.'],
        mock: <RehberMock baslik="fisler_2026_10.xlsx" icerik={['15.10.2026 | %20 | 10.000,00 | 2.000,00', '15.10.2026 | %10 |  5.000,00 |   500,00', '17.10.2026 | %20 | 12.500,00 | 2.500,00']} vurgu={0} />
      }
    ],
    ipucu: 'Döküm, Fişler sayfasındaki kayıtları esas alır.'
  },

  '/admin/efatura-islemleri': {
    baslik: 'E-Fatura İşlemleri — Kullanım Kılavuzu',
    bolumler: [
      {
        baslik: 'XML Yükleme',
        aciklama: 'e-Fatura/e-Arşiv XML veya ZIP dosyalarını toplu yükleyin.',
        adimlar: ['Dosyaları sürükleyip bırakın veya seçin.'],
        mock: <RehberMock baslik="XML Yükle" icerik={['[Dosya Seç] veya buraya bırak', 'faturalar_ekim.zip | 24 dosya', '[Yükle]']} vurgu={2} />
      },
      {
        baslik: 'Doğrulama',
        aciklama: 'Yüklenen faturalar ayrıştırılır, tutar/KDV kontrolleri yapılır.',
        adimlar: ['Aynı belge tekrar yüklenirse var olan kayıt güncellenir, çoğaltılmaz.'],
        mock: <RehberMock baslik="Sonuç" icerik={['FT-2026-081 | 60.000 | KDV 10.000 ✓', 'FT-2026-082 | 12.500 | KDV 2.500 ✓', '24 / 24 fatura işlendi']} vurgu={0} />
      }
    ],
    ipucu: 'GİB\'ten sorgulama da bu sayfadadır (efatura-gib).'
  },

  '/admin/etebligatlar': {
    baslik: 'e-Tebligat — Kullanım Kılavuzu',
    bolumler: [
      {
        baslik: 'Liste ve Görüntüleme',
        aciklama: 'Gelen tebligatlar tarihe göre listelenir.',
        adimlar: ['Okunmayanlar vurgulanır; süresi önemli olanları önce kontrol edin.', 'Göz simgesiyle içeriği açın, PDF indirebilirsiniz.'],
        mock: <RehberMock baslik="e-Tebligat" icerik={['📬 28.10 | GİB | Mukim Yazısı | (yeni)', '📭 21.10 | Dilekce | okundu', '[👁 Aç]  [PDF İndir]']} vurgu={0} />
      }
    ],
    ipucu: 'Tebligat çekme işlemi yardımcı program üzerinden yapılır.'
  },

  '/admin/odeme-takip': {
    baslik: 'Ödeme Takip — Kullanım Kılavuzu',
    bolumler: [
      {
        baslik: 'Müşteri Bakiyeleri',
        aciklama: 'Müşteri bazlı ödeme durumları ve bekleyen tutarlar listelenir.',
        adimlar: ['Tahsilat girişi yapıp bakiyeyi güncelleyin.'],
        mock: <RehberMock baslik="Ödeme Takip" icerik={['ABC Ltd.    | Bakiye 2.500,00 | [+ Tahsilat]', 'ELEKTRO-AK | Bakiye    0,00  | ✓', 'Tarih: 01.10 → 31.10']} vurgu={0} />
      }
    ],
    ipucu: 'Tarih aralığı seçerek dönem tahsilatlarını görebilirsiniz.'
  },

  '/admin/izin-takip': {
    baslik: 'Personel / İzin — Kullanım Kılavuzu',
    bolumler: [
      {
        baslik: 'Personel Kayıtları',
        aciklama: 'Müşteri seçip personel kartı açın.',
        adimlar: ['İzin ve sağlık raporu kayıtları burada tutulur.', 'Müşteri listesi alfabetik sıralıdır.'],
        mock: <RehberMock baslik="Personel / İzin" icerik={['Müşteri: ABC Ltd ▼ (alfabetik)', 'Ahmet Yılmaz | Yıllık İzin 14 gün', '[Kayıt Ekle]']} vurgu={1} />
      },
      {
        baslik: 'Kıdem / İhbar',
        aciklama: 'Kıdem-ihbar hesabı sekmesinden hesaplama yapın.',
        adimlar: ['Giriş/çıkış tarihlerini girip hesaplatın.'],
        mock: <RehberMock baslik="Kıdem-İhbar" icerik={['Giriş: 01.03.2020  Çıkış: 15.10.2026', 'Kıdem: 6 yıl 7 ay', 'Brüt Kıdem Tazminatı: 78.500,00 TL']} vurgu={2} />
      }
    ],
    ipucu: 'Personel kartları müşteriye bağlıdır; müşteri değiştirince liste tazelenir.'
  },

  '/admin/tax-calendar': {
    baslik: 'Vergi Takvimi — Kullanım Kılavuzu',
    bolumler: [
      {
        baslik: 'Ay Görünümü',
        aciklama: 'Seçilen ayın beyanname ve ödeme son tarihleri listelenir.',
        adimlar: ['Yaklaşan görevler ana sayfada da görünür.'],
        mock: <RehberMock baslik="Ekim 2026" icerik={['26.10 | Muhtasar | son gün 🔴 geçti', '28.10 | KDV2 | son gün', '31.10 | Geçici Vergi | son gün']} vurgu={1} />
      }
    ],
    ipucu: 'Süresi geçmiş görevler kırmızı işaretlenir.'
  },

  '/admin/hesaplamalar': {
    baslik: 'Hesaplamalar — Kullanım Kılavuzu',
    bolumler: [
      {
        baslik: 'Araç Seç ve Hesapla',
        aciklama: 'Hesaplama araçları kart olarak dizilidir.',
        adimlar: ['Kira zammı, veraset, damga vergisi vb. araçları kullanın.', 'Alanları doldurup sonucu anında görün.'],
        mock: <RehberMock baslik="Hesaplamalar" icerik={['[Kira Zammı] [Veraset] [Damga Vergisi]', 'Vergi: [SMYB Listesi Sorgula]', 'Kira zammı: TÜFE %25.49 → 12.500 → 15.686 TL']} vurgu={2} />
      }
    ],
    ipucu: 'Sahte/Muhteviyatı listesi sorgusu Vergi başlığı altındadır.'
  },

  '/admin/ayarlar': {
    baslik: 'Ayarlar — Kullanım Kılavuzu',
    bolumler: [
      {
        baslik: 'Kullanıcı Yönetimi',
        aciklama: 'Hesap türlerine dikkat edin.',
        adimlar: ['"Personel Ekle" personel hesabı açar (yetkileri kısıtlı).', '"Yeni Kullanıcı Ekle" genel hesap açar.', 'Roller: admin / personel / müşteri.'],
        mock: <RehberMock baslik="Kullanıcılar" icerik={['koray   | admin    | ✓', 'sinem   | personel | ✓', '[Personel Ekle] [Yeni Kullanıcı Ekle]']} vurgu={2} />
      },
      {
        baslik: 'Kurum Ayarları',
        aciklama: 'Banka, Luca ve GİB bilgileri buradan girilir.',
        adimlar: ['Bu bölüm yalnız admin içindir; personelde menü gizlidir.'],
        mock: <RehberMock baslik="Kurum" icerik={['Luca Kullanıcı: ______', 'Banka Hesap: ______', 'GİB Giriş: ✓ kayıtlı', '[Kaydet]']} vurgu={2} />
      }
    ],
    ipucu: 'Kayıt Klasörleri bölümündeki Beyanname Klasörü, geçici vergi önceki dönem okumasında kullanılır.'
  },

  '/admin/ofisler': {
    baslik: 'Ofis Yönetimi — Kullanım Kılavuzu',
    bolumler: [
      {
        baslik: 'Ofisler',
        aciklama: 'Kira yönetimi ofislerini listeleyin, yeni ofis açın.',
        adimlar: ['Ofis kartından detaya girin.'],
        mock: <RehberMock baslik="Ofisler" icerik={['Merkez Ofis | 3 daire | [Detay]', '[Yeni Ofis]']} vurgu={0} />
      },
      {
        baslik: 'Personel Menü Yetkileri',
        aciklama: 'Personelin görebileceği sol menü bölümlerini seçin.',
        adimlar: ['Ofis detayındaki panelde aç/kapa yapın.', 'Tümünü Aç / Tümünü Kapat kısayollarını kullanın.'],
        mock: <RehberMock baslik="Personel Yetkileri" icerik={['☑ Fatura İşlemleri  ☑ Beyan Takip', '☐ Ayarlar  ☐ Ofis Yönetimi', '[Tümünü Aç] [Tümünü Kapat] [Kaydet]']} vurgu={0} />
      }
    ],
    ipucu: 'AnaSayfa her zaman açıktır; kaydedilmeden önce varsayılan yalnız mali müşavir bölümüdür.'
  },

  '/admin/kira-stopaj': {
    baslik: 'Kira Stopaj Listesi — Kullanım Kılavuzu',
    bolumler: [
      {
        baslik: 'Müşteri ve Mal Sahibi Seç',
        aciklama: 'Rapor seçtiğiniz tek mal sahibine göre hazırlanır.',
        adimlar: ['Müşteri listesi alfabetik sıralıdır.', 'Mal sahibi seçilince dönem aralığıyla rapor oluşur.'],
        mock: <RehberMock baslik="Kira Stopaj Listesi" icerik={['Müşteri: ABC Ltd ▼ (alfabetik)', 'Mal Sahibi: Ahmet V. ▼', 'Dönem: Ocak 2026 → Ekim 2026', '[PDF] [Excel]']} vurgu={1} />
      }
    ],
    ipucu: 'Raporlar bölümündedir; kira bilgileri müşteri kartındaki kira kaydından alınır.'
  },

  '/admin/kurum-sifreleri': {
    baslik: 'Kurum Şifreleri — Kullanım Kılavuzu',
    bolumler: [
      {
        baslik: 'GİB Şifreleri',
        aciklama: 'Vergi dairesi kullanıcı kodu ve şifreleri burada tutulur.',
        adimlar: ['Beyan hazırlama portal girişinde bu şifreleri kullanır.', 'Göz simgesiyle şifreyi açıp doğrulayın.'],
        mock: <RehberMock baslik="Vergi Dairesi Şifreleri" icerik={['Dijitaş VD | Kod: digital | Şifre: •••••• [👁]', 'Beykoz VD  | Kod: ______  | Şifre: ______', '[Kaydet]']} vurgu={0} />
      }
    ],
    ipucu: 'Şifreler beyan hazırlama portal girişinde otomatik doldurulur.'
  },

  '/admin/giris-takip': {
    baslik: 'Giriş Takibi — Kullanım Kılavuzu',
    bolumler: [
      {
        baslik: 'Oturum Kayıtları',
        aciklama: 'Kim, ne zaman, hangi IP\'den giriş yapmış görürsünüz.',
        adimlar: ['Şüpheli girişleri buradan takip edin.'],
        mock: <RehberMock baslik="Giriş Takibi" icerik={['koray | 30.10 09:12 | 88.xx.xx.xx ✓', 'sinem | 30.10 08:45 | 78.xx.xx.xx ✓', 'musteri:abc | 29.10 17:03 | ...']} vurgu={0} />
      }
    ],
    ipucu: 'Kayıtlar tarih sırasına göre listelenir.'
  },

  '/admin/kontrol-merkezi': {
    baslik: 'Kontrol Merkezi — Kullanım Kılavuzu',
    bolumler: [
      {
        baslik: 'Veri Kontrolleri',
        aciklama: 'Tutarlılık kontrollerini çalıştırın.',
        adimlar: ['Eksik/uyumsuz kayıtlar listelenir; bulgulara göre düzeltme yapın.'],
        mock: <RehberMock baslik="Kontrol Merkezi" icerik={['[Kontrolleri Çalıştır]', 'Fişsiz KDV: yok ✓', 'Eksik dönem: Eylül 2026 ✗', 'Mükerrer fatura: yok ✓']} vurgu={2} />
      }
    ],
    ipucu: 'Beyan Takip klasörü içindedir.'
  },

  '/admin/muhasebe-kayit': {
    baslik: 'Fatura Muhasebeleştime — Kullanım Kılavuzu',
    bolumler: [
      {
        baslik: 'Dönem Seç ve Kayıt',
        aciklama: 'Müşteri ve dönem seçip fatura kayıtlarını muhasebeleştirin.',
        adimlar: ['Luca işletme defteri formatında çıktı alın.'],
        mock: <RehberMock baslik="Muhasebeleştime" icerik={['Müşteri: ABC Ltd ▼ | 2026 | Ekim', '138 fatura hazır', '[Muhasbeleştir] [Luca Çıktısı]']} vurgu={2} />
      }
    ],
    ipucu: 'Fatura İşlemleri klasörü içindedir.'
  }
}

export default function SayfaKilavuzu() {
  const { pathname } = useLocation()
  const [acik, setAcik] = useState(false)

  useEffect(() => { setAcik(false) }, [pathname])

  const kilavuz = KILAVUZLAR[pathname] || {
    baslik: 'Bu Sayfa — Kullanım Kılavuzu',
    bolumler: [
      {
        baslik: 'Kullanım',
        aciklama: 'Bu sayfanın özel kılavuzu henüz hazırlanmadı.',
        adimlar: ['Sol menüden ilgili bölümü seçtiğinizde o bölümün kılavuzu açılır.'],
        mock: <RehberMock baslik="MUBiS" icerik={['Sol menü:', '📁 Beyan Takip', '📁 Fatura İşlemleri', '📁 ...']} vurgu={1} />
      }
    ],
    ipucu: 'Soru işareti düğmesi her sayfada zil simgesinin yanında durur.'
  }

  return (
    <>
      {/* Zilin solunda sabit ? düğmesi — müşteri portalındakiyle aynı görünüm */}
      <button
        onClick={() => setAcik(true)}
        title={`${kilavuz.baslik.split(' — ')[0]} — Kullanım Kılavuzu`}
        className="fixed right-16 top-4 z-[60] w-9 h-9 rounded-full bg-blue-600/40 border border-blue-400/40 text-yellow-300 hover:bg-yellow-400 hover:text-blue-950 hover:border-yellow-400 flex items-center justify-center shadow-lg shadow-blue-950/50 transition-colors"
      >
        <CircleHelp className="w-5 h-5" />
      </button>

      {acik && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60" onClick={() => setAcik(false)}>
          <div className="bg-[#0a1730] border border-blue-700/40 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-blue-800/40 shrink-0">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <CircleHelp className="w-5 h-5 text-yellow-400" /> {kilavuz.baslik}
              </h3>
              <button onClick={() => setAcik(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              {kilavuz.bolumler.map((b, i) => (
                <RehberBolum key={i} no={String(i + 1)} baslik={b.baslik} aciklama={b.aciklama} adimlar={b.adimlar} mock={b.mock} />
              ))}
              <div className="flex items-start gap-2.5 bg-yellow-500/10 border border-yellow-600/40 rounded-xl p-3.5">
                <Lightbulb className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <p className="text-yellow-200/90 text-xs leading-relaxed"><span className="font-semibold">İpucu: </span>{kilavuz.ipucu}</p>
              </div>
              <div className="text-[11px] text-gray-500 text-center pt-1 flex items-center justify-center gap-1.5">
                <ChevronRight className="w-3 h-3" /> Sorunuz olursa sağ alttaki MUBiS Asistan'a yazabilirsiniz.
              </div>
            </div>
            <div className="flex justify-end px-5 py-4 border-t border-blue-800/40 shrink-0">
              <button onClick={() => setAcik(false)} className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-blue-950 px-4 py-2 rounded-lg text-sm font-semibold">Anladım</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
