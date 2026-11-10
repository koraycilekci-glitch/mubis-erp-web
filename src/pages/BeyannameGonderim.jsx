// e-Beyanname — yeni e-Beyan (ebeyan.gib.gov.tr) düzenine göre çalışma alanı.
// A. Beyanname Seçimi (korunur) + e-Beyan sol menü düzeni:
//    Genel Bilgiler (İdari / Sıfatla Verildiği / Düzenleyen) + Ekler (16 bölüm).
// Sıfat ve Düzenleyen alanları müşteri kaydından / mali müşavir profilinden otomatik dolar.
import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, CheckCircle2, Eye, Send, Search, FileDown, Users, Loader2, KeyRound, PlugZap, Trash2, FileSpreadsheet, Check, Folder, FolderOpen, UserRound, PenLine } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  BEYANNAME_TURLERI, DURUMLAR,
  musterileriGetir, kayitlariGetir, hazirKayitlariOlustur, durumuGuncelle, kontrolSonucu, testGonder,
  ebeyanTokenDurum, ebeyanTokenKaydet, ebeyanTokenSil, ebeyanBaglantiTesti, ebeyanApiGonder, kdvMatrisGetir,
} from '../services/beyannameGonderimService'

const AYLAR = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK']

// Yeni e-Beyan beyanname türleri (YENİ BEYANNAME listesi birebir)
const EBEYAN_TURLERI = [
  { id: 'kdv1', kod: '0015', ad: 'KDV1' },
  { id: 'gecici', kod: '0032', ad: 'GGECICI' },
  { id: 'kdv2', kod: '4017', ad: 'KDV2' },
  { id: 'kdv9015', kod: '9015', ad: 'KDV9015' },
  { id: 'damga', kod: '9047', ad: 'DAMGAKK' },
]
// DB tur kodu → e-Beyan etiketi (takip tablosunda gösterilir)
const TUR_ETIKET = {
  kdv1: '0015 - KDV1',
  'gelir-gecici': '0032 - GGECICI (Gelir)',
  'kurum-gecici': '0032 - GGECICI (Kurum)',
  kdv2: '4017 - KDV2',
  kdv9015: '9015 - KDV9015',
  damga: '9047 - DAMGAKK',
  muhtasar: 'Muhtasar', 'yillik-gelir': 'Yıllık Gelir', kurumlar: 'Kurumlar',
}

// e-Beyan sol menüsü (Genel Bilgiler + Ekler) — ekran görüntülerinden birebir
const MENU_GRUPLAR = [
  {
    id: 'genel', ad: 'Genel Bilgiler', ikon: 'klasor', items: [
      { id: 'idari', ad: 'İdari Bilgiler' },
      { id: 'sifat', ad: 'Beyannamenin Hangi Sıfatla Verildiği' },
      { id: 'duzenleyen', ad: 'Beyannameyi Düzenleyen' },
    ],
  },
  {
    id: 'ekler', ad: 'Ekler', ikon: 'klasor', items: [
      { id: 'tevkifat', ad: 'Tevkifat Uygulaması Kapsamındaki İşlemler' },
      { id: 'indirim107', ad: '107 ve 111 Kodlu İndirim Türleri' },
      { id: 'istisna', ad: 'Tam ve Kısmi İstisnalar' },
      { id: 'teslim13f', ad: '13/f Kapsamındaki Teslimler' },
      { id: 'teslim13i', ad: '13/i Kapsamındaki Teslimler' },
      { id: 'cep', ad: 'Yenilenmiş Cep Telefonu' },
      { id: 'teknoloji', ad: 'Teknoloji Geliştirme Bölgeleri' },
      { id: 'thk', ad: 'THK Katılma Payı' },
      { id: 'sorumlu', ad: 'Sorumlu Sıfatıyla Ödenen KDV ile İlişkin Bildirim' },
      { id: 'tesvik', ad: 'Yatırım Teşvik Belgesi Kapsamındaki İstisnalar' },
      { id: 'devreden', ad: "Önceki Dönemden Devreden KDV'den Çıkarılan Faturalara İlişkin Bilgiler" },
      { id: 'indirimler', ad: 'İndirimler' },
      { id: 'ihracat', ad: 'İhracat Kaydıyla Teslimler' },
      { id: 'matrah', ad: 'Matrah' },
      { id: 'istisnaDiger', ad: 'İstisnalar-Diğer İade Hakkı Doğuran İşlemler' },
      { id: 'sonuc', ad: 'Sonuç Hesapları' },
    ],
  },
]

const bosSifat = () => ({ tckn: '', vkn: '', ad: '', email: '', telefon: '' })
const duzYukle = () => { try { return { ...bosSifat(), ...(JSON.parse(localStorage.getItem('ebeyan_duzenleyen')) || {}) } } catch { return bosSifat() } }

// Sol menü sırası — KAYDET'te bir sonraki bölüme otomatik geçiş için
const BOLUM_SIRASI = [...MENU_GRUPLAR.flatMap(g => g.items.map(i => i.id)), 'gonderim']

// Tevkifat bölümü seçenekleri (GİB ekle formu)
const FATURA_TURLERI_TVK = ['Fatura', 'e-Fatura', 'e-Arşiv Fatura', 'Müstahsil Makbuzu', 'Gider Pusulası', 'Perakende Satış Fişi', 'Diğer']
const ISLEM_TURLERI_TVK = ['Altın, Gümüş ve Platin Teslimleri', 'Ticari Tedarik Zincirinde Mal Teslimi', 'Hal Mukataası Kapsamındaki Teslimler', 'Demir ve Demir Alaşımları Teslimleri', 'İhale Yoluyla Yapılan Yapım İşlemleri', 'Belediyelerce Yapılan Yapım İşlemleri', 'Makine, Cihaz ve Enstrüman Teslimleri', 'Elektrik Enerjisi Teslimleri', 'Doğalgaz Teslimleri', 'Su Ürünleri Teslimleri', 'Organik Tarım Ürünleri Teslimleri', 'Yapı Denetim Hizmetleri', 'Diğer']
const KDV_ORAN_SECENEKLERI = ['1', '10', '20']
const ISTISNA_TURLERI = ['17/4-c Kapsamındaki Teslimler', 'Cumhurbaşkanı Kararı ile İstisna Edilen Teslimler', 'Özel Hukuk Kişilerine Yatırım Bedeli Karşılığı Teslimler', 'Vergi İadesi Kapsamındaki Teslimler', 'Diğer']
const ISTISNA_BOLGELERI = ['Serbest Bölge', 'Teknoloji Geliştirme Bölgesi', 'Organize Sanayi Bölgesi', 'Serbest Bölge İşletici', 'Diğer']
const GUVENLIK_KURULUSLARI = ['Millî Savunma Bakanlığı', 'Emniyet Genel Müdürlüğü', 'Jandarma Genel Komutanlığı', 'Millî İstihbarat Teşkilatı', 'Diğer']
const OLCU_BIRIMLERI = ['Adet', 'Kilogram', 'Litre', 'Metre', 'Metrekare', 'Metreküp', 'Ton', 'Kilovat Saat', 'Çift', 'Takım', 'Diğer']
const KIMLIK_TURLERI = ['T.C. Kimlik No', 'Vergi Kimlik No', 'Yabancı Kimlik No', 'Pasaport No']
const TASINMAZ_NITELIKLERI = ['Arsa', 'Arazi', 'Konut', 'İşyeri', 'Bağ/Bahçe', 'Diğer']
const IL_ADLARI = ['Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Aksaray', 'Amasya', 'Ankara', 'Antalya', 'Ardahan', 'Artvin', 'Aydın', 'Balıkesir', 'Bartın', 'Batman', 'Bayburt', 'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa', 'Çanakkale', 'Çankırı', 'Çorum', 'Denizli', 'Diyarbakır', 'Düzce', 'Edirne', 'Elazığ', 'Erzincan', 'Erzurum', 'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari', 'Hatay', 'Iğdır', 'Isparta', 'İstanbul', 'İzmir', 'Kahramanmaraş', 'Karabük', 'Karaman', 'Kars', 'Kastamonu', 'Kayseri', 'Kırıkkale', 'Kırklareli', 'Kırşehir', 'Kilis', 'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa', 'Mardin', 'Mersin', 'Muğla', 'Muş', 'Nevşehir', 'Niğde', 'Ordu', 'Osmaniye', 'Rize', 'Sakarya', 'Samsun', 'Siirt', 'Sinop', 'Sivas', 'Şanlıurfa', 'Şırnak', 'Tekirdağ', 'Tokat', 'Trabzon', 'Tunceli', 'Uşak', 'Van', 'Yalova', 'Yozgat', 'Zonguldak']
const ULKELER = ['Almanya', 'Azerbaycan', 'Belçika', 'Bulgaristan', 'Fransa', 'Gürcistan', 'Hollanda', 'İngiltere', 'İran', 'Irak', 'Kazakistan', 'Rusya', 'Suriye', 'Türkiye', 'Türkmenistan', 'Ukrayna', 'Özbekistan', 'Diğer']
const SORUMLU_ODEME_TURLERI = ['Ödendi', 'Emanetteki Tuardan Mahsuben Ödendi', 'İade Dosyasından Mahsup Talep Edildi']
const IND_NEDENLERI = ['1 - Birleşme', '2 - Devir', '10 - Vergilendirme Dönemi Değişikliği', '11 - İade Beyanından Vazgeçilmesi', '12 - Alış Faturası Ekleme', '13 - Alış Faturası Çıkarma', '14 - Satış Faturası Ekleme', '15 - Satış Faturası Çıkarma']
const IND_TURLERI = [
  '103 - Satıştan iade Edilen, İşlemi Gerçekleşmeyen veya İşlemden Vazgeçilen Mal ve Hizmetlere Ait KDV',
  "104 - Türkiye'de İkamet Etmeyenlerce Bu Dönemde İade Edilen KDV [KDVGUT:(II/A-5)]",
  '106 - İndirimli Orana Tabi İşlemlere İlgili Yıl İçerisinde Mahsuben İadesi Gerçekleşmeyen KDV',
  '107 - Kanunun (11/1-c) ve Geçici 17. Maddelerinden Doğan İadelerin İndirim Yoluyla Telafisi',
  '108 - Yurtiçi Alımlara İlişkin KDV',
  '109 - Sorumlu Sıfatıyla Beyan Edilerek Ödenen KDV',
  '110 - İthâlde Ödenen KDV',
  '111 - Değersiz Hale Gelen Alacaklara İlişkin İndirilecek KDV',
]
const IHR_ISLEMLERI = [
  '701 - İhracatı Yapılacak Nihai Ürünlerin Kanunun 11/1-C Maddesi Kapsamında Teslimi',
  '702 - Dahilde İşleme VeYa Geçici Kabul Rejimleri Kapsamında İhracatı Yapılacak Ürünün İmali',
]
const TVK_UYGULANMAYAN_TURLERI = ['1100 - Vurtici Teslim ve Hizmetler', '1101 - Yenilenmiş Cep Telefonu Satışları', ...IHR_ISLEMLERI]
const OZEL_MATRAH_TURLERI = [
  '1001 - Alıntıdan Mamul Eşya Teslimleri',
  '1002 - Gümüşten Mamul Eşya Teslimleri',
  '1003 - Kıymetli Taş Teslimleri',
  '1004 - İkinci El Araç Ticareti',
  '1005 - İkinci El Taşınmaz Ticareti',
  '1006 - Gazete, Dergi ve Benzeri Periyodik Yayınlar',
  '1007 - Tütün Mamulleri Teslimleri',
  '1008 - Belediyelerce Yapılan Şehir İçi Yolcu Taşımacılığı',
  '1009 - Ön Ödemeli Elektronik Haberleşme Hizmetleri',
  '1010 - Türkiye Şoförler ve Otomobilciler Federasyonu Tarafından Araç Plakaları ile Basılı Evrak Teslimleri',
  '1011 - Şans Oyunları',
  '1012 - Gümrük Depolarında ve Müzayede Mahallinde Yapılan Satışlar (İcra Yoluyla Yapılan Satışlar)',
  '1013 - Profesyonel Gösteri ve Konser ile Profesyonel Sportif Faaliyetlerin Tertiplenmesi',
]
const DIGER_ISLEM_TURLERI = [
  "501 - Türkiye'de ikamet etmeyenlere KDV Hesaplanarak Yapılan Satışlar (Yolcu Beraberli Eşya)",
  '503 - Amortismana Tabi Sabit Kıymet (Taşınmaz, Taşit Araçları, Demirbaş, Makine ve Teçhizat) Teslimleri',
  '504 - Alınan Malların İadesi, Gerçekleşmeyen İşlemler',
  '505 - VUK 322 Kapsamına Giren Borçlara Ait KDV',
  '506 - Kur Farkı / Yuvarlama Farkı Nedeniyle Oluşan KDV',
  '507 - Zayi Olan Mallara Ait Daha Önce İndirim Konusu Yapılan KDV',
  '508 - Konaklama İşletmelerinde Kullanılan Alkollü İçecekler Dolayısıyla Yüklenen KDV [KDV 58/B]',
]
const KISMİ_ISTISNA_TURLERI = [
  '201 - Kültür ve Eğitim Amaçlı Taşıyan İşlemler (17/1)',
  '202 - Sağlık, Çevre ve Sosyal Yardım Amaçlı İşlemler (17/2-a)',
  '204 - Yabancı Diplomatik Organ ve Hayır Kurumlarının Yapacakları Bağışlarla İlgili Mal ve Hizmet İthalatı (17/2-b)',
  '205 - Taşınmaz Kültür Varlıklarına İlişkin Teslimler ve Mimarlık Hizmetleri (17/2-d)',
  '206 - Mesleki Kuruluşların İşlemleri (17/2-e)',
  '207 - Askeri Fabrika, Tersane ve Atölyelerin İşlemleri (17/3-a)',
  '208 - Birleşme, Devir, Dönüşüm ve Bölünme İşlemleri (17/4-c)',
  '209 - Banka ve Sigorta Muameleleri Vergisi Kapsamına Giren İşlemler (17/4-e)',
  '211 - Zirai Amaçlı Su Teslimleri ile Köy Tüzel Kişiliklerince Yapılan İçme Suyu Teslimleri (17/4-f)',
  '212 - Serbest Bölgelerde Verilen Hizmetler (17/4-i)',
  '213 - Boru Hattı ile Yapılan Petrol ve Gaz Taşımacılığı (17/4-j)',
  '214 - Organize Sanayi Bölgeleri ve Küçük Sanayi Sitelerindeki Arsa ve İşyeri Teslimleri ile Konut Teslimleri (17/4-k)',
  '215 - Varlık Yönetim Şirketlerinin İşlemleri (17/4-l)',
  '216 - Tasarruf Mevduatı Sigorta Fonunun İşlemleri (17/4-m)',
  '217 - Basın-Yayın ve Enformasyon Genel Müdürlüğüne Verilen Haber Hizmetleri (17/4-n)',
  '218 - Gümrük Antrepoları, Geçici Depolama Yerleri ile Gümrüklü Sahalarda Vergisiz Satış Yapılması (17/4-o)',
  '219 - Hazine, Toplu Konut İdaresi Başkanlığı, Belediyeler, Özel İdareler ve Yatırım İzleme ve Düzeltme Fonu Taşınmaz Teslimleri (17/4-p)',
  '220 - İki Tam Yıl Süreyle Sahil Olanak Taşınmaz ve İştirak Hissesi Satışı (17/4-r)',
  '221 - Konut Yapı Kooperatiflerine Verilen İnşaat Taahhüt Hizmeti (Geçici 15)',
  '223 - Teknoloji Geliştirme Bölgesinde ve İhtisas Teknoloji Geliştirme Bölgesinde Yapılan İşlemler (Geçici 8)',
  '225 - Milli Eğitim Bakanlığına Bilgisayar ve Donanımlarının Bedelsiz Teslimleri ile Bunlara İlişkin Hizmetler',
  '226 - Özel Okullar, Üniversite ve Yüksekokullar Tarafından Verilen Bedelsiz Eğitim ve Öğretim Hizmetleri',
  '227 - Kanunların Gösterdiği Gerek Üzerine Bedelsiz Olarak Yapılan Teslim ve Hizmetler (17/2-)',
  '228 - Kanunun (17/1) Maddesinde Sayılan Kurum ve Kuruluşlara Bedelsiz Olarak Yapılan Teslimler',
  '229 - Gıda Bankacılığı Faaliyetinde Bulunan Dernekleşeyler, Dernek ve Vakıflara Bağışlanan Gıda ve Temizlik Ürünleri (17/2-f)',
  '230 - Küçük Altın, Küçük Gümüş, Kıymetli Taş Teslimleri (17/4-g)',
  '231 - Metal, Plastik, Lastik, Kauçuk, Kağıt, Cam Hurda ve Atıkları ile Konfeksiyon Kırpıntılarının Teslimleri (17/4-b)',
  '232 - Dövize, Para, Damga Pulı, Değerli Kağıtlar, Hisse Senedi, Tahvil Teslimleri (17/4-g)',
  '233 - Kamulaştırma Kanunu Kapsamında Taşınmazların Kamulaştırma Yapan Devlet ve Katma Bütçeli İdarelere Teslimi',
  '234 - Konut Finansmanı Amaçlı Teminat Gösterilen ve İpotek Konusu Yapılan Taşınmazların Teslimi (17/4-s)',
  '235 - Transit ve Gümrük Antrepo Rejimleri ile Geçici Depolama ve Serbest Bölge Hükümlerine Tabi İşlemler (17/4-t)',
  '236 - Usulüne Göre Yürürlüğe Girmiş Uluslararası Anlaşmalar Kapsamındaki İstisnalar = İade Hakkı Doğuran İşlemler',
  '237 - 5300 Sayılı Kanuna Göre Düzenlenen Ürün Senetlerinin İhtisas/Ticaret Borsaları Arabuluculuk Ücretine Konu İşlemleri',
  '238 - Varlık ve Hâkim Varlık Kıralama Şirketlerine Devri ile Bu Varlık ve Hâkimların Varlık Kıralamaları (17/4-ç)',
  '239 - Taşınır ve Taşınmazların Finansal Kiralama Şirketleri, Katılım Bankaları ile Kalkınma ve Yatırım Bankalarına Devri (17/4-ç)',
  '240 - Patentli veya Faydalı Model Belgesi Buluşa İlişkin Gayrimaddi Hakların Kıralanması, Devri ve Satışı (Geçici 12)',
  '242 - TürkAkım Gaz Boru Hattı Projesine İlişkin Anlaşmanın (9/b) Maddesinde Yer Alan Hizmetler (17/4-u)',
  '243 - Gümrük Antrepoları, Geçici Depolama Yerleri ile Gümrüklü Sahalarda, İthilat ve İhracat Yoluyla Verilen Hizmetler (17/4-u)',
  '244 - Serbest Bölgelere İlişkin Yük Taşıma İşleri (17/4-i)',
  '250 - Diğerleri',
]
const TAM_ISTISNA_TURLERI = [
  '301 - Mal İhracatı (11/1-a)',
  '302 - Hizmet İhracatı (11/1-a)',
  '303 - Roaming Hizmetleri (11/1-a)',
  '304 - Deniz, Hava ve Demiryolu Taşıma Araçlarının Teslimi ile İade, Tadil Bakım ve Onarımları (13/a)',
  '305 - Deniz ve Hava Taşıma Araçları İçin Liman ve Hava Meydanlarında Yapılan Hizmetler (13/a)',
  '306 - Petrol Aramaları ve Petrol Boru Hattının İnşa ve Modernizasyonuna İlişkin Yapılan Teslimler (13/)',
  '307 - Maden Arama, Altın, Gümüş veya Platin Madenleri için İşletme, Zenginleştirme ve Rafinasyon Faaliyetleri (Geçici 18)',
  '308 - Teşvikli Yatırım Mallarının Teslimi ile Yazılım ve Gayri Maddi Hak Satış ve Kiralama İşlemleri (Geçici 26)',
  '309 - Limanlara Bağlantı Sağlayan Demiryolu Hatları ile Liman ve Hava Meydanlarının İnşası (13/a)',
  '310 - Ulusal Güvenlik Amaçlı Teslim ve Hizmetler (13/f)',
  '311 - Uluslararası Taşımacılık (14/1)',
  '312 - Diplomatik Organ ve Misyonlara Yapılan Teslim ve Hizmetler (15/a)',
  '313 - Uluslararası Kuruluşlara Yapılan Teslim ve Hizmetler (15/b)',
  '314 - Usulüne Göre Yürürlüğe Girmiş Uluslararası Anlaşmalar Kapsamındaki İstisnalar (İade...) (15/c)',
  '315 - İhrac Konusu Eşyayı Taşıyan Kamyon, Çekici ve Yan Römorklara Yapılan Motorun Teslimleri (11/1-a)',
  '316 - Serbest Bölgelerdeki Müşteriler İçin Yapılan Fason Hizmetler (11/1-a)',
  '317 - Engellilerin Eğitimleri, Meslekleri ve Günlük Yaşamlarına İlişkin Araç-Gereç ve Bilgisayar Teslimleri (17/4-b)',
  '318 - 3996 Sayılı Kanuna Göre Yap-İşlet-Devret Modeli Çerçevesinde Gerçekleştirilecek Projelere İlişkin Teslimler (Geçici 21)',
  '319 - 4760 sayılı Kanuna Ekli (II) Sayılı Listede Yer Alan Malların, Cumhurbaşkanlığı Merkez Teşkilatına Teslimleri (13/)',
  '320 - İSMEP Kapsamında, İstanbul İli Özel İdaresine Bağlı Olarak Faaliyet Gösteren İstanbul P... (Geçici 23)',
  '321 - Eş Şahibi Hükümet Anlaşmaları veya Üyelikten Tartar Olduğu Diğer Anlaşmalar Çerçevesinde Yapılan Teslimler',
  "322 - Türkiye'de İkamet Etmeyenlere Özel Fatura ile Yapılan Teslimler [KDVUT-(II/A-1.2)] (11/1-a)",
  '323 - 5300 Sayılı Kanuna Göre Düzenlenen Ürün Senetlerinin İhtisas/Ticaret Borsaları Arabuluculuk Ücretine Konu İşlemleri',
  '324 - Türkiye Kızılay Derneğine Yapılan Teslim ve Hizmetler ile Türkiye Kızılay Derneğinin Teslimleri (Geçici 34)',
  '325 - Yem Teslimleri (13/i)',
  '326 - Gıda, Tarım ve Hayvancılık Bakanlığı Tarafından Tecsil Edilmiş Gübrelerin Teslimi (13/i)',
  '327 - Gıda, Tarım ve Hayvancılık Bakanlığı Tarafından Tecsil Edilmiş Gübrelerin İçeriğinde Bulunan Hammaddelerin Teslimi (13/i)',
  '328 - Konut ve İşyeri Teslimleri (13/j)',
  '329 - FATİH Projesi Kapsamında Milli Eğitim Bakanlığına Yapılacak Mal Teslimi ve Hizmet İfaasine İlişkin Teslimler (Geçici 30)',
  '330 - Organize Sanayi Bölgeleri ile Küçük Sanayi Sitelerinin İnşasına İlişkin Teslim ve Hizmetler (13/k)',
  '331 - Ar-Ge, Yenilik ve Tasarım Faaliyetlerinde Kullanılmak Üzere Yapılan Yeni Makina ve Teçhizat Teslimleri (Geçici 28)',
  '332 - İmalat Sanayiinde Kullanılmak Üzere Yapılan Yeni Makina ve Teçhizat Teslimlerinde İstisna (Geçici 29)',
  '333 - Genel ve Özel Bütçeli Kamu İdarelerine, İl Özel İdarelerine, Belediyelere ve Köylere Bağlı Hizmet Birimlerine Yapılan Teslimler (13/l)',
  '334 - Yabancılar Verilen Sağlık Hizmetlerinde İstisna (13/i)',
  '335 - Basılı Kitap ve Süreli Yayınlara Teslimleri (13/n)',
  '336 - UEFA Müsabakaları Kapsamında Yapılacak Teslim ve Hizmetler (Geçici 46)',
  '337 - TürkAkım Gaz Boru Hattı Projesine İlişkin Anlaşmanın (9/h) Maddesi Kapsamındaki Gazalakala Teslimleri (Geçici 39)',
  '338 - İmalatçıların Mal İhracatları [KDVUT-(II/A-1.4.2)] (32)',
  '339 - İmalat Sanayi ile Turizme Yönelik Yatırım Teşvik Belgesi Kapsamındaki İnşaat İşlerine İlişkin Teslimler (Geçici 43)',
  '340 - Elektrik Motorlu Taşıt Araçların Geliştirilmesine Yönelik Mühendislik Hizmetleri (Geçici 45)',
  '341 - Afetzedelere Bağışlanacak Konutların İnşasına İlişkin İstisna (Geçici 44)',
  '342 - Genel Bütçeli Kamu İdarelerine Bağışlanacak Taşınmazların İnşasına İlişkin İstisna (Geçici 45)',
  '343 - Genel Bütçeli Kamu İdarelerine Bağışlanacak Konutların Yabancı Devlet Kurum ve Kuruluşları tarafından Yapılması (Geçici 47)',
  '344 - Milli Savunma ve İç Güvenlik İhtiyaçlarında Kullanılmak Üzere Taşıt Teslimi (Geçici 48)',
  '350 - Diğerleri',
]
const ID_KISMİ_TVK_TURLERI = [
  '409 - İstisnadan Vazgeçenlerin Hurda ve Atık Tesliminde Tevkifata Tabi Tutulan KDV [KDVGU...]',
  '410 - Yapım İşleri ile Bu İşlerle Birlikte İfa Edilen Mühendislik-Mimarlık ve Etüt-Proje Hizmetle...',
  '411 - Temizlik Hizmetinde Tevkifata Tabi Tutulan KDV [KDVUT-(I/C-2.1.3.2.10)]',
  '412 - Çevre ve Bahçe Bakım Hizmetlerinde Tevkifata Tabi Tutulan KDV [KDVUT-(I/C-2.1.3.2...',
  '413 - Özel Güvenlik Hizmetinde Tevkifata Tabi Tutulan KDV [KDVUT-(I/C-2.1.3.2.5)]',
  '414 - Makine, Teçhizat, Demirbaş ve Taşıtlara Ait Tadil, Bakım ve Onarım Hizmetlerinde Tevki...',
  '415 - Yemek Servis Hizmetinde Tevkifata Tabi Tutulan KDV [KDVUT-(I/C-2.1.3.2.4)]',
  '416 - Etüt, Plan-Proje, Danışmanlık, Denetim ve Benzeri Hizmetlerde Tevkifata Tabi Tutulan K...',
  '418 - Hurda Metalden Elde Edilenler Dışındaki Bakır, Çinko, Demir Çelik, Alüminyum ve Kurşu...',
  '419 - Bakır, Çinko, Alüminyum, Kurşun ve Bunların Alaşımlarından Elde Edilen Ürünlerin Tesli...',
  '420 - Yapı Denetim Hizmetlerinde Tevkifata Tabi Tutulan KDV [KDVUT-(I/C-2.1.3.2.6)]',
  '421 - İsgücü Temin Hizmetinde Tevkifata Tabi Tutulan KDV [KDVUT-(I/C-2.1.3.2.5)]',
  '423 - Fason Tekstil ve Konfeksiyon İşleri, Çanta ve Ayakkabı Dikim İşleri ve Bu İşlere Araçlık ...',
  '428 - Pamuk, Tiftik, Yün Ve Yapağı ile Ham Post ve Deri Tesliminde Tevkifata Tabi Tutulan KD...',
  '430 - Hurda Metalden Elde Edilen Küllenin Tesliminde Tevkifata Tabi Tutulan KDV [KDVUT-(I/C...',
  '431 - Turistik Mağazalara Verilen Müşteri Bulma-Götürme Hizmetlerine Tevkifata Tabi Tutul...',
  '432 - Organizasyon Hizmetlerinde Tevkifata Tabi Tutulan KDV [KDVUT-(I/C-2.1.3.2.4)]',
  '433 - Spor Kulüplerinin Yayın, Reklâm ve İsim Hakkı Gelirlerine Konu İşlemlerinde Tevkifata T...',
  '434 - Servis Taşımacılığı Hizmetinde Tevkifata Tabi Tutulan KDV [KDVUT-(I/C-2.1.3.2.11)]',
  '435 - Her Türü Baskı ve Basım Hizmetlerinde Tevkifata Tabi Tutulan KDV [KDVUT-(I/C-2.1.3...',
  '436 - Diğer Hizmetler [KDVUT-(I/C-2.1.3.2.13)]',
  '437 - Metal, Plastik, Lastik, Kauçuk, Kağıt ve Cam Hurda ve Atıklardan Elde Edilen Hammadde...',
  '438 - Ağaç ve Orman Ürünleri Tesliminde Tevkifata Tabi Tutulan KDV [KDVUT-(I/C-2.1.3.3.6)]',
  '445 - Yük Taşımacılığı Hizmetlerinde Tevkifata Tabi Tutulan KDV [KDVUT-(I/C-2.1.3.2.11)]',
  '446 - Ticari Reklam Hizmetlerinde Tevkifata Tabi Tutulan KDV [KDVUT-(I/C-2.1.3.2.15)]',
  '447 - Diğer Teslimlerde Tevkifata Tabi Tutulan KDV [KDVUT-(I/C-2.1.3.3.7)]',
  '448 - Demir Çelik Ürünlerinin Teslimi [KDVUT-(I/C-2.1.3.3.8)]',
]
const ID_TAM_TVK_TURLERI = [
  '901 - İstisnadan Vazgeçenlerin Hurda ve Atık Tesliminde Tevkifata Tabi Tutulan KDV [KDVGU...]',
  '902 - Yapım İşleri ile Bu İşlerle Birlikte İfa Edilen Mühendislik-Mimarlık ve Etüt-Proje Hizmetle...',
  '903 - Temizlik Hizmetinde Tevkifata Tabi Tutulan KDV [KDVUT-(I/C-2.1.3.2.10)] (9/1)',
  '904 - Çevre ve Bahçe Bakım Hizmetlerinde Tevkifata Tabi Tutulan KDV [KDVUT-(I/C-2.1.3.2...',
  '905 - Özel Güvenlik Hizmetinde Tevkifata Tabi Tutulan KDV [KDVUT-(I/C-2.1.3.2.5)] (9/1)',
  '906 - Makine, Teçhizat, Demirbaş ve Taşıtlara Ait Tadil, Bakım ve Onarım Hizmetlerinde Tevkif...',
  '907 - Yemek Servis Hizmetinde Tevkifata Tabi Tutulan KDV [KDVUT-(I/C-2.1.3.2.4)] (9/1)',
  '909 - Hurda Metalden Elde Edilenler Dışındaki Bakır, Çinko, Demir Çelik, Alüminyum ve Kurşu...',
  '910 - Bakır, Çinko, Alüminyum, Kurşun ve Bunların Alaşımlarından Elde Edilen Ürünlerin Tesli...',
  '911 - Yapı Denetim Hizmetlerinde Tevkifata Tabi Tutulan KDV [KDVUT-(I/C-2.1.3.2.6)] (9/1)',
  '912 - İsgücü Temin Hizmetinde Tevkifata Tabi Tutulan KDV [KDVUT-(I/C-2.1.3.2.5)] (9/1)',
  '913 - Fason Olarak Yaptırılan Tekstil ve Konfeksiyon İşleri, Çanta ve Ayakkabı Dikim İşleri ve ...',
  '914 - Pamuk, Tiftik, Yün ve Yapağı ile Ham Post ve Deri Tesliminde Tevkifata Tabi Tutulan KD...',
  '915 - Hurda Metalden Elde Edilen Küllenin Tesliminde Tevkifata Tabi Tutulan KDV [KDVUT-(I/C...',
  '916 - Turistik Mağazalara verilen Müşteri Bulma/Götürme Hizmetlerinde Tevkifata Tabi Tutul...',
  '917 - Organizasyon Hizmetlerinde Tevkifata Tabi Tutulan KDV [KDVUT-(I/C-2.1.3.2.4)] (9/1)',
  '918 - Spor Kulüplerinin Yayın, Reklâm ve İsim Hakkı Gelirlerine Konu İşlemlerinde Tevkifata T...',
  '919 - Servis Taşımacılığı Hizmetinde Tevkifata Tabi Tutulan KDV [KDVUT-(I/C-2.1.3.2.11)] (9...',
  '920 - Her Türü Baskı ve Basım Hizmetlerinde Tevkifata Tabi Tutulan KDV [KDVUT-(I/C-2.1.3...',
  '921 - Metal, Plastik, Lastik, Kauçuk, Kâğıt, Cam Hurda ve Atıkları ile Konfeksiyon Kırpıntıların...',
  '922 - Ağaç ve Orman Ürünleri Tesliminde Tevkifata Tabi Tutulan KDV [KDVUT-(I/C-2.1.3.3.6)...',
  '923 - Yük Taşımacılığı Hizmetlerinde Tevkifata Tabi Tutulan KDV [KDVUT-(I/C-2.1.3.2.11)] (...',
  '924 - Ticari Reklam Hizmetlerinde Tevkifata Tabi Tutulan KDV [KDVUT-(I/C-2.1.3.2.15)] (9/1)',
  '925 - Demir Çelik Ürünlerinin Teslimi [KDVUT-(I/C-2.1.3.3.8)] (9/2)',
]
const ID_DIGER_IADE_TURLERI = [
  "408 - Türkiye'de İkamet Etmeyenlere Bu Dönemde İade Edilen KDV [KDVUT-(II/A-5)] (11/1-b)",
  '439 - Yıllık İndirimli Orana Tabi İşlemlere İlişkin İade (29/2)',
  '440 - Yatırım Teşvik Belgeleri Kapsamında Asgari 500 Milyon TL Tutarında Sabit Yatırım Öng...',
  '441 - Usulüne Uygun Yürürlüğe Girmiş Uluslararası Anlaşmalar Kapsamında Ödenen ve İadey...',
  '442 - İmalat Sanayiine Yönelik Yatırım Teşvik Belgesi Kapsamındaki İnşaat İşleri (Geçici 37)',
  '443 - TürkAkım Gaz Boru Hattı Projesine İlişkin Anlaşmanın (9/h) Maddesi Kapsamında Alın...',
  '444 - Genel ve Özel Bütçeli Kamu İdarelerine, İl Özel İdarelerine, Belediyelere ve Köylere Bağlı...',
  '450 - Diğerleri',
]
const TEVKIFAT_ORANLARI = ['1/10', '2/10', '3/10', '4/10', '5/10', '6/10', '7/10', '8/10', '9/10', '10/10']
const kesirCoz = (s) => { const m = /^(\d+)\/(\d+)$/.exec(s || ''); return m ? Number(m[1]) / Number(m[2]) : 0 }
const tl = (n) => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })

export default function BeyannameGonderim() {
  const { user, profile } = useAuth()
  const simd = new Date()
  const [yil, setYil] = useState(simd.getFullYear())
  const [ay, setAy] = useState(simd.getMonth() + 1)
  const [donemTipi, setDonemTipi] = useState('aylik') // aylik | 3aylik — e-Beyan İdari Bilgiler
  const [donem, setDonem] = useState(Math.ceil((simd.getMonth() + 1) / 3))
  // 3 aylık seçilirse dönem sonu ayı kullanılır (1→Mart, 2→Haziran, 3→Eylül, 4→Aralık)
  const efektifAy = donemTipi === '3aylik' ? donem * 3 : ay
  const [turId, setTurId] = useState('kdv1')
  const [secimModu, setSecimModu] = useState('tek') // tek | coklu
  const [musteriler, setMusteriler] = useState([])
  const [seciliIdler, setSeciliIdler] = useState([]) // coklu mod — onay kutulu liste
  const [kayitlar, setKayitlar] = useState([])
  const [mesaj, setMesaj] = useState('')
  const [yukleniyor, setYukleniyor] = useState(false)
  const [onizleme, setOnizleme] = useState(null)

  // Sol menü aktif bölümü + bölüm bazlı KAYDET işaretleri
  const [aktifBolum, setAktifBolum] = useState('idari')
  const [kaydedilen, setKaydedilen] = useState({})
  const bolKaydet = (id) => {
    setKaydedilen(k => ({ ...k, [id]: true }))
    // Düzenleyen bilgileri bu bilgisayarda kalıcı saklanır
    if (id === 'duzenleyen') { try { localStorage.setItem('ebeyan_duzenleyen', JSON.stringify(duz)) } catch { /* yoksay */ } }
    // KAYDET'te sıradaki bölüme otomatik geç
    const idx = BOLUM_SIRASI.indexOf(id)
    if (idx >= 0 && idx < BOLUM_SIRASI.length - 1) setAktifBolum(BOLUM_SIRASI[idx + 1])
  }

  // İdari Bilgiler
  const [idariVd, setIdariVd] = useState('')
  const [hzMukellef, setHzMukellef] = useState('') // matrah/sıfat için mükellef (tek görünüm)

  // Sıfatla Verildiği (müşteri kaydından otomatik dolar)
  const [sifatTipi, setSifatTipi] = useState('mukellef')
  const [sifat, setSifat] = useState(bosSifat())

  // Beyannameyi Düzenleyen (mali müşavir — sabit, localStorage'da saklanır)
  const [duz, setDuz] = useState(duzYukle)

  // Ek bölümleri: id -> { bos: true, satirlar: [] }
  const [ekDurum, setEkDurum] = useState({})

  // Tevkifat bölümü — GİB'deki iki bildirim tablosu
  const [tvkKismi, setTvkKismi] = useState([])
  const [tvkTam, setTvkTam] = useState([])
  const [tvkModal, setTvkModal] = useState(null)

  // 107/111 indirim bölümü — değersiz alacak bildirimi + 107 dönemi tablosu
  const [i107Degersiz, setI107Degersiz] = useState([])
  const [i107Donem, setI107Donem] = useState([])
  const [i107Modal, setI107Modal] = useState(null)

  // Tam ve Kısmi İstisnalar bildirimi
  const [istTablo, setIstTablo] = useState([])
  const [istModal, setIstModal] = useState(false)
  const [istForm, setIstForm] = useState({ tur: ISTISNA_TURLERI[0], bolge: ISTISNA_BOLGELERI[0], belgeNo: '', bedel: '', oran: '0', vkn: '', yuklenenKdv: '' })

  // 13/f kapsamındaki teslimler
  const [t13fTablo, setT13fTablo] = useState([])
  const [t13fModal, setT13fModal] = useState(false)
  const [t13fForm, setT13fForm] = useState({ kurulus: GUVENLIK_KURULUSLARI[0], belgeTarih: '', belgeSayi: '', listeTarih: '', listeSayi: '', firmaAd: '', firmaVkn: '', siraNo: '', cinsi: '', olcu: OLCU_BIRIMLERI[0], miktar: '', faturaTuru: FATURA_TURLERI_TVK[0], faturaTarih: '', faturaNo: '', bedel: '' })

  // 13/i kapsamındaki teslimler (taşınmaz)
  const [t13iTablo, setT13iTablo] = useState([])
  const [t13iModal, setT13iModal] = useState(false)
  const [t13iForm, setT13iForm] = useState({ kimlikTuru: KIMLIK_TURLERI[0], kimlikNo: '', ad: '', uyruk: 'Türkiye', calismaUlke: 'Türkiye', merkezUlke: 'Türkiye', ili: 'Ankara', ilcesi: '', niteligi: TASINMAZ_NITELIKLERI[0], adaNo: '', parselNo: '', ulusalNo: '', zeminNo: '', faturaTuru: FATURA_TURLERI_TVK[0], faturaTarih: '', faturaNo: '', tutar: '', yuklenenKdv: '' })

  // Yenilenmiş cep telefonu işlemleri
  const [cepTablo, setCepTablo] = useState([])
  const [cepModal, setCepModal] = useState(false)
  const [cepForm, setCepForm] = useState({ alisTuru: FATURA_TURLERI_TVK[0], alisTarih: '', alisNo: '', saticiTuru: KIMLIK_TURLERI[0], saticiNo: '', saticiAd: '', alisBedel: '', alisKdv: '', marka: '', model: '', imei: '', satisTuru: FATURA_TURLERI_TVK[0], satisTarih: '', satisNo: '', aliciTuru: KIMLIK_TURLERI[0], aliciNo: '', aliciAd: '', satisBedel: '' })

  // Teknoloji geliştirme bölgeleri
  const [tgbTablo, setTgbTablo] = useState([])
  const [tgbModal, setTgbModal] = useState(false)
  const [tgbForm, setTgbForm] = useState({ il: 'Ankara', ilce: '', baslangic: '', belgeNo: '', bedel: '', kdv: '' })

  // THK katılma payı
  const [thkTablo, setThkTablo] = useState([])
  const [thkModal, setThkModal] = useState(false)
  const [thkForm, setThkForm] = useState({ adet: '', birimPay: '0.05' })

  // Sorumlu sıfatıyla ödenen KDV
  const [sorTablo, setSorTablo] = useState([])
  const [sorModal, setSorModal] = useState(false)
  const [sorForm, setSorForm] = useState({ odemeTuru: SORUMLU_ODEME_TURLERI[0], yil: String(simd.getFullYear()), ay: AYLAR[simd.getMonth()], odemeTarih: '', tutar: '', belgeNo: '', iadeNo: '' })

  // Yatırım teşvik belgesi kapsamındaki makine teçhizat istisnası
  const [ytbTablo, setYtbTablo] = useState([])
  const [ytbModal, setYtbModal] = useState(false)
  const [ytbForm, setYtbForm] = useState({ ad: '', kimlikTuru: KIMLIK_TURLERI[0], kimlikNo: '', vd: '', seriNo: '', sayisi: '', listeSira: '', belgeTarih: '', cinsi: '', olcu: OLCU_BIRIMLERI[0], miktar: '', tutar: '', faturaTuru: FATURA_TURLERI_TVK[0], faturaTarih: '', faturaNo: '', sirket: '' })

  // Önceki dönemden devreden KDV'den çıkarılan faturalar
  const [dvrTablo, setDvrTablo] = useState([])
  const [dvrModal, setDvrModal] = useState(false)
  const [dvrForm, setDvrForm] = useState({ kimlikTuru: KIMLIK_TURLERI[0], kimlikNo: '', donemTipi: 'AYLIK', yil: String(simd.getFullYear() - 1), ay: AYLAR[simd.getMonth()], donem: '1', tutar: '', kdv: '' })

  // İndirimler — önceki dönemden devreden indirilecek KDV + diğer indirimler
  const [indTvkTablo, setIndTvkTablo] = useState([])
  const [indTvkModal, setIndTvkModal] = useState(false)
  const [indTvkForm, setIndTvkForm] = useState({ neden: IND_NEDENLERI[0], aciklama: '', kdv: '' })
  const [indDigerTablo, setIndDigerTablo] = useState([])
  const [indDigerModal, setIndDigerModal] = useState(false)
  const [indDigerForm, setIndDigerForm] = useState({ tur: IND_TURLERI[0], kdv: '' })

  // İhracat kaydıyla teslimler
  const [ihrTablo, setIhrTablo] = useState([])
  const [ihrModal, setIhrModal] = useState(false)
  const [ihrForm, setIhrForm] = useState({ islemTuru: IHR_ISLEMLERI[0], bedel: '', oran: '18' })
  const [ihrYurtici, setIhrYurtici] = useState('')
  const [ihrYuklenen, setIhrYuklenen] = useState('')

  // Matrah — GİB tabloları
  const [mUygTablo, setMUygTablo] = useState([])
  const [mUygModal, setMUygModal] = useState(false)
  const [mUygForm, setMUygForm] = useState({ islemTuru: TVK_UYGULANMAYAN_TURLERI[0], matrah: '', oran: '20' })
  const [mOzelTablo, setMOzelTablo] = useState([])
  const [mOzelModal, setMOzelModal] = useState(null) // { sekme, matrahDahilOlmayan, islemTuru, bedel, dusulecek, oran }
  const [m7440Tablo, setM7440Tablo] = useState([])
  const [m7440Modal, setM7440Modal] = useState(false)
  const [m7440Form, setM7440Form] = useState({ matrah: '', oran: '20' })
  const [m7440Odeme, setM7440Odeme] = useState('') // '' | taksit | defaten
  const [mDigerTablo, setMDigerTablo] = useState([])
  const [mDigerModal, setMDigerModal] = useState(false)
  const [mDigerForm, setMDigerForm] = useState({ islemTuru: DIGER_ISLEM_TURLERI[0], matrah: '', vergi: '', aciklama: '' })
  const [mOncedenInd, setMOncedenInd] = useState('')

  // İstisnalar-Diğer İade Hakkı Doğuran İşlemler (4 tablo)
  const [idKismiTablo, setIdKismiTablo] = useState([])
  const [idKismiModal, setIdKismiModal] = useState(false)
  const [idKismiForm, setIdKismiForm] = useState({ tur: KISMİ_ISTISNA_TURLERI[0], tutar: '', kdv: '' })
  const [idTamTablo, setIdTamTablo] = useState([])
  const [idTamModal, setIdTamModal] = useState(false)
  const [idTamForm, setIdTamForm] = useState({ tur: TAM_ISTISNA_TURLERI[0], tutar: '', bedel: '', kdv: '' })
  const [idKtvkTablo, setIdKtvkTablo] = useState([])
  const [idKtvkModal, setIdKtvkModal] = useState(false)
  const [idKtvkForm, setIdKtvkForm] = useState({ islemTuru: ID_KISMİ_TVK_TURLERI[0], tutar: '', kdv: '' })
  const [idTtvkTablo, setIdTtvkTablo] = useState([])
  const [idTtvkModal, setIdTtvkModal] = useState(false)
  const [idTtvkForm, setIdTtvkForm] = useState({ islemTuru: ID_TAM_TVK_TURLERI[0], tutar: '', kdv: '' })
  const [idDigerTablo, setIdDigerTablo] = useState([])
  const [idDigerModal, setIdDigerModal] = useState(false)
  const [idDigerForm, setIdDigerForm] = useState({ islemTuru: ID_DIGER_IADE_TURLERI[0], tutar: '', kdv: '' })

  // Sonuç Hesapları — Diğer Bilgiler girişleri
  const [krediKartiBedel, setKrediKartiBedel] = useState('')

  // Matrah (eski E bölümü — faturalardan doldur)
  const [hzSatis, setHzSatis] = useState([])
  const [hzAlis, setHzAlis] = useState([])
  const [hzDevreden, setHzDevreden] = useState('')
  const [hzMesaj, setHzMesaj] = useState('')
  const [hzGonder, setHzGonder] = useState(null)
  const [hzYukleniyor, setHzYukleniyor] = useState(false)

  // API token (D bölümü)
  const [tokDurum, setTokDurum] = useState(null)
  const [tokOrtam, setTokOrtam] = useState('prod')
  const [tokDeger, setTokDeger] = useState('')
  const [tokVkn, setTokVkn] = useState('')
  const [tokUnvan, setTokUnvan] = useState('')
  const [tokMesaj, setTokMesaj] = useState('')
  const [tokTest, setTokTest] = useState(null)
  const [tokIslem, setTokIslem] = useState(false)

  useEffect(() => {
    musterileriGetir().then(l => setMusteriler(l)).catch(() => {})
    ebeyanTokenDurum().then(d => { setTokDurum(d); if (d?.ortam) setTokOrtam(d.ortam); if (d?.entegratorVkn) setTokVkn(d.entegratorVkn); if (d?.entegratorUnvan) setTokUnvan(d.entegratorUnvan) }).catch(() => {})
  }, [])

  // Düzenleyen: mali müşavir profilinden ilk doldurma (sabit bilgiler)
  useEffect(() => {
    setDuz(d => ({
      ...d,
      ad: d.ad || profile?.name || '',
      email: d.email || user?.email || '',
      telefon: d.telefon || profile?.phone || '',
    }))
  }, [profile?.name, user?.email])

  // Düzenleyen: mali müşavirin kendi müşteri kaydı varsa TCKN/VKN/telefon oradan dolar
  useEffect(() => {
    if (!musteriler.length) return
    const em = (user?.email || '').toLowerCase()
    const ad = (profile?.name || '').toLocaleLowerCase('tr')
    const kendim = musteriler.find(m => m.email && em && String(m.email).toLowerCase() === em)
      || musteriler.find(m => ad && (m.ad || '').toLocaleLowerCase('tr') === ad)
    if (!kendim) return
    setDuz(d => ({
      ...d,
      tckn: d.tckn || kendim.tc || '',
      vkn: d.vkn || kendim.vkn || '',
      ad: d.ad || kendim.ad || '',
      email: d.email || kendim.email || '',
      telefon: d.telefon || kendim.phone || '',
    }))
  }, [musteriler, user?.email, profile?.name])

  // Çoklu seçimde ilk seçili müşteri matrah/sıfat için otomatik atanır
  useEffect(() => {
    if (secimModu === 'coklu' && seciliIdler.length) {
      if (!seciliIdler.includes(Number(hzMukellef))) setHzMukellef(String(seciliIdler[0]))
    }
  }, [seciliIdler, secimModu])

  const mukellefBilgi = useMemo(
    () => musteriler.find(m => String(m.id) === String(hzMukellef)) || null,
    [musteriler, hzMukellef]
  )

  // Sıfat + vergi dairesi: seçili mükellef kaydından otomatik doldur
  useEffect(() => {
    const m = mukellefBilgi
    if (!m) return
    setSifat(s => ({
      ...s,
      tckn: m.tc || s.tckn,
      vkn: m.vkn || s.vkn,
      ad: m.ad || s.ad,
      email: m.email || s.email,
      telefon: m.phone || s.telefon,
    }))
    if (m.tax_office) setIdariVd(m.tax_office)
  }, [mukellefBilgi?.id])

  // ---------- API token (D bölümü — aynen korunur) ----------
  const tokenKaydet = async () => {
    setTokIslem(true); setTokMesaj('')
    try {
      const d = await ebeyanTokenKaydet({ token: tokDeger.trim(), ortam: tokOrtam, entegratorVkn: tokVkn.trim(), entegratorUnvan: tokUnvan.trim() })
      setTokDurum(d); setTokDeger('')
      setTokMesaj(`Token kaydedildi (${d.ortam} ortamı, son 4 hane: ${d.sonDort}). Token bilgisayardaki yardımcı programda saklandı; tarayıcıya kaydedilmez.`)
    } catch (e) {
      setTokMesaj('Hata: ' + (e?.message || e))
    } finally { setTokIslem(false) }
  }
  const tokenSil = async () => {
    setTokIslem(true); setTokMesaj('')
    try { await ebeyanTokenSil(); setTokDurum({ ok: true, kayitli: false }); setTokMesaj('Token silindi.') }
    catch (e) { setTokMesaj('Hata: ' + (e?.message || e)) }
    finally { setTokIslem(false) }
  }
  const baglantiTesti = async () => {
    const vkn = mukellefBilgi?.kimlikNo || kayitlar[0]?.kimlikNo || ''
    if (!/^\d{10,11}$/.test(vkn)) { setTokMesaj('Bağlantı testi için önce Matrah bölümünden bir mükellef seçin (VKN/TCKN gerekli).'); return }
    setTokIslem(true); setTokMesaj(''); setTokTest(null)
    try {
      const d = await ebeyanBaglantiTesti(vkn)
      setTokTest(d)
      setTokMesaj(d.httpStatus === 401
        ? 'HTTP 401 — Token geçersiz veya ortam uyuşmuyor. Yeni token oluşturun (PROD token ile PROD ortamı).'
        : d.httpStatus === 403
          ? 'HTTP 403 — Header/yetki sorunu. Entegratör VKN ve ünvan alanlarını kontrol edin; entegrasyon başvurunuz onaylanmış olmalı.'
          : `HTTP ${d.httpStatus} — Bağlantı kuruldu (son 4 hane: ${d.sonDort}).`)
    } catch (e) {
      setTokMesaj('Test hatası: ' + (e?.message || e))
    } finally { setTokIslem(false) }
  }

  // ---------- Matrah: faturalardan doldur + GİB API gönder ----------
  const faturalardanDoldur = async () => {
    if (!hzMukellef) { setHzMesaj('Önce mükellef seçin.'); return }
    setHzYukleniyor(true); setHzMesaj(''); setHzGonder(null)
    try {
      const m = await kdvMatrisGetir(Number(hzMukellef), yil, efektifAy)
      setHzSatis(m.satis.map(s => ({ ...s })))
      setHzAlis(m.alis.map(a => ({ ...a })))
      setHzMesaj(`Faturalardan dolduruldu: ${m.satis.length} satış + ${m.alis.length} alış satırı. Değerleri düzenleyip gönderebilirsiniz.${m.dövizKarışık ? ` DİKKAT: ${m.dövizAdet} döviz faturası TL'ye çevrilmeden toplandı.` : ''}`)
    } catch (e) {
      setHzMesaj('Hata: ' + (e?.message || e))
    } finally { setHzYukleniyor(false) }
  }

  const satirDuzenle = (liste, setListe, i, alan, deger) => {
    setListe(liste.map((s, j) => (j === i ? { ...s, [alan]: deger } : s)))
  }

  const hazirlaVeGonder = async () => {
    if (!mukellefBilgi) { setHzMesaj('Önce Matrah bölümünden mükellef seçin.'); return }
    if (!hzSatis.length && !hzAlis.length) { setHzMesaj('Beyanname verisi boş — önce "Faturalardan Doldur" kullanın.'); return }
    const kimlik = mukellefBilgi.kimlikNo
    if (!/^\d{10,11}$/.test(kimlik || '')) { setHzMesaj('Mükellefin VKN/TCKN kaydı yok.'); return }
    setHzYukleniyor(true); setHzMesaj(''); setHzGonder(null)
    try {
      const payload = {
        vergiNo: kimlik,
        donemYil: yil,
        donemAy: efektifAy,
        hesaplananKdv: hzSatis.map(s => ({ kdvOrani: Number(s.oran) || 0, matrah: Number(s.matrah) || 0, vergi: Number(s.kdv) || 0 })),
        indirilecekKdv: hzAlis.map(a => ({ kdvOrani: Number(a.oran) || 0, matrah: Number(a.matrah) || 0, vergi: Number(a.kdv) || 0 })),
        devredenKdv: Number(hzDevreden) || 0,
      }
      const d = await ebeyanApiGonder({ tur: 'kdv1', mukellefVkn: kimlik, payload })
      setHzGonder(d)
      if (d.ok) {
        setHzMesaj(`Beyanname gönderildi (${d.ortam} ortamı). Beyanname ID: ${d.beyanId}`)
        const eslesen = kayitlar.find(k => String(k.client_id) === String(hzMukellef) && ['kdv1'].includes(k.beyanname_tur) && k.yil === yil && k.ay === efektifAy)
        if (eslesen) {
          await durumuGuncelle(eslesen.id, { durum: 'gonderildi', gibReferans: String(d.beyanId), mesaj: `e-Beyan API ile gönderildi (${d.ortam}).`, testModu: false })
          await kayitlariYukle()
        }
      } else {
        setHzMesaj(`Gönderim ${d.asama || '?'} aşamasında durdu — GİB yanıtı aşağıda. Alan eşleşmeleri GİB hatasına göre düzeltilip tekrar denenecek.`)
      }
    } catch (e) {
      setHzMesaj('Hata: ' + (e?.message || e))
    } finally { setHzYukleniyor(false) }
  }

  const satirTablo = (baslik, liste, setListe) => (
    <div className="flex-1 min-w-[280px]">
      <div className="text-xs font-semibold text-gray-300 mb-1.5">{baslik}</div>
      <table className="w-full text-xs">
        <thead><tr className="text-gray-400 text-left">
          <th className="py-1 pr-2">KDV %</th><th className="py-1 pr-2">Matrah</th><th className="py-1 pr-2">KDV</th><th className="py-1"></th>
        </tr></thead>
        <tbody>
          {liste.length === 0 && <tr><td colSpan={4} className="py-2 text-gray-500">Satır yok</td></tr>}
          {liste.map((s, i) => (
            <tr key={i}>
              <td className="py-1 pr-2"><input value={s.oran ?? ''} onChange={e => satirDuzenle(liste, setListe, i, 'oran', e.target.value)} className="w-12 bg-blue-900/60 border border-blue-700/60 rounded px-1.5 py-1 text-white tabular-nums" /></td>
              <td className="py-1 pr-2"><input value={s.matrah ?? ''} onChange={e => satirDuzenle(liste, setListe, i, 'matrah', e.target.value)} className="w-24 bg-blue-900/60 border border-blue-700/60 rounded px-1.5 py-1 text-white text-right tabular-nums" /></td>
              <td className="py-1 pr-2"><input value={s.kdv ?? ''} onChange={e => satirDuzenle(liste, setListe, i, 'kdv', e.target.value)} className="w-24 bg-blue-900/60 border border-blue-700/60 rounded px-1.5 py-1 text-white text-right tabular-nums" /></td>
              <td className="py-1"><button onClick={() => setListe(liste.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300" title="Satırı sil">✕</button></td>
            </tr>
          ))}
          <tr className="border-t border-blue-800/40 text-gray-200 font-medium">
            <td className="py-1 pr-2">Toplam</td>
            <td className="py-1 pr-2 text-right tabular-nums">{liste.reduce((t, s) => t + (Number(s.matrah) || 0), 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
            <td className="py-1 pr-2 text-right tabular-nums">{liste.reduce((t, s) => t + (Number(s.kdv) || 0), 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
      <button onClick={() => setListe([...liste, { oran: '', matrah: '', kdv: '' }])} className="mt-1.5 text-xs text-blue-300 hover:text-blue-200">+ Satır ekle</button>
    </div>
  )

  // ---------- Kayıtlar / gönderim işlemleri (B + C blokları) ----------
  const turEtiket = (dbTur) => TUR_ETIKET[dbTur] || dbTur
  const secimEtiketi = turId === 'gecici' ? '0032 - GGECICI' : (EBEYAN_TURLERI.find(t => t.id === turId)?.kod + ' - ' + EBEYAN_TURLERI.find(t => t.id === turId)?.ad)

  const kayitlariYukle = async () => {
    setYukleniyor(true)
    try {
      setKayitlar(await kayitlariGetir(yil, efektifAy, turId))
    } catch (e) {
      setMesaj('Kayıtlar okunamadı: ' + (e?.message || ''))
    } finally {
      setYukleniyor(false)
    }
  }
  useEffect(() => { kayitlariYukle() }, [yil, efektifAy, turId])

  const mukellefleriGetir = async () => {
    setYukleniyor(true)
    setMesaj('')
    try {
      const liste = await musterileriGetir()
      setMusteriler(liste)
      const adet = await hazirKayitlariOlustur({
        musteriler: liste, yil, ay: efektifAy, turId,
        seciliIdler: secimModu === 'coklu' ? seciliIdler : null,
      })
      setMesaj(`${adet} mükellef için ${secimEtiketi} kaydı oluşturuldu (${String(efektifAy).padStart(2, '0')}/${yil}). Mevcut kayıtlar korundu.`)
      await kayitlariYukle()
    } catch (e) {
      setMesaj('Hata: ' + (e?.message || ''))
    } finally {
      setYukleniyor(false)
    }
  }

  const seciliKayitlar = useMemo(() => {
    if (secimModu === 'coklu' && seciliIdler.length) return kayitlar.filter(k => seciliIdler.includes(k.client_id))
    return kayitlar
  }, [kayitlar, secimModu, seciliIdler])

  const beyannameKontrolu = async () => {
    let sorunlu = 0
    for (const k of seciliKayitlar) {
      const s = kontrolSonucu(k)
      await durumuGuncelle(k.id, {
        durum: s.ok ? 'gonderim' : 'kontrol',
        mesaj: s.ok ? 'Kontrol tamam — gönderime hazır.' : 'Eksikler: ' + s.eksikler.join(', '),
      })
      if (!s.ok) sorunlu++
    }
    setMesaj(`Kontrol tamamlandı: ${seciliKayitlar.length - sorunlu} hazır, ${sorunlu} sorunlu.`)
    await kayitlariYukle()
  }

  const gibGonder = async () => {
    let ok = 0, hata = 0
    for (const k of seciliKayitlar) {
      if (k.durum === 'gonderildi_test' || k.durum === 'gonderildi') continue
      const r = await testGonder(k)
      r.ok ? ok++ : hata++
    }
    setMesaj(`TEST gönderimi: ${ok} kayıt işaretlendi, ${hata} reddedildi. GİB entegrasyonu aktif olana kadar gerçek gönderim yapılmaz.`)
    await kayitlariYukle()
  }

  const sonuclariSorgula = () => {
    setMesaj('GİB entegrasyonu henüz aktif değil — sonuç sorgulama gerçek GİB bağlantısı kurulunca açılacak. Test kayıtları olduğu gibi korunur.')
  }

  const tahakkukIndir = () => {
    setMesaj('Tahakkuk indirme, GİB entegrasyonu ve yetkilendirme tamamlandığında açılacak.')
  }

  // ---------- Ek bölümü yardımcıları ----------
  const ekGetir = (id) => ekDurum[id] || { bos: true, satirlar: [] }
  const ekSet = (id, yama) => setEkDurum(d => ({ ...d, [id]: { ...ekGetir(id), ...yama } }))

  const kimlikAlanlari = (deger, setDeger) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
      <label className="text-xs text-gray-400">T.C. Kimlik No
        <input value={deger.tckn} onChange={e => setDeger(d => ({ ...d, tckn: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm tabular-nums" />
      </label>
      <label className="text-xs text-gray-400">Vergi Kimlik No
        <input value={deger.vkn} onChange={e => setDeger(d => ({ ...d, vkn: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm tabular-nums" />
      </label>
      <label className="text-xs text-gray-400 md:col-span-2">Adı Soyadı/Ünvanı
        <input value={deger.ad} onChange={e => setDeger(d => ({ ...d, ad: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm" />
      </label>
      <label className="text-xs text-gray-400">E-posta Adresi
        <input value={deger.email} onChange={e => setDeger(d => ({ ...d, email: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm" />
      </label>
      <label className="text-xs text-gray-400">Telefon No
        <input value={deger.telefon} onChange={e => setDeger(d => ({ ...d, telefon: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm tabular-nums" />
      </label>
    </div>
  )

  const kaydetBtn = (bolumId, not) => (
    <div className="flex items-center justify-end gap-3 mt-3">
      {not && <span className="text-[11px] text-gray-500">{not}</span>}
      <button onClick={() => bolKaydet(bolumId)}
        className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${kaydedilen[bolumId] ? 'bg-emerald-600/80 hover:bg-emerald-600 text-white' : 'bg-teal-600 hover:bg-teal-500 text-white'}`}>
        <Check className="w-4 h-4" /> {kaydedilen[bolumId] ? 'Kaydedildi' : 'KAYDET'}
      </button>
    </div>
  )

  const menuDongu = (grup) => (
    <div key={grup.id} className="mb-1">
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-teal-300 text-xs font-bold">
        <FolderOpen className="w-3.5 h-3.5" /> {grup.ad}
      </div>
      {grup.items.map(it => (
        <button key={it.id} onClick={() => setAktifBolum(it.id)}
          className={`w-full text-left pl-5 pr-2 py-1.5 rounded-lg text-xs flex items-center justify-between gap-1.5 transition ${aktifBolum === it.id ? 'bg-teal-600/30 text-white font-medium' : 'text-gray-300 hover:bg-blue-800/40'}`}>
          <span className="leading-tight">{it.ad}</span>
          {kaydedilen[it.id] ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <span className="w-3 h-3 rounded-full border border-gray-500 shrink-0" />}
        </button>
      ))}
    </div>
  )

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">e-Beyanname</h1>
          <p className="text-gray-400 text-sm mt-0.5">Yeni e-Beyan (ebeyan.gib.gov.tr) düzeni — beyanname hazırlama ve gönderim çalışma alanı</p>
        </div>
        <button onClick={kayitlariYukle} disabled={yukleniyor} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition">
          {yukleniyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Kayıtları Yenile
        </button>
      </div>

      {/* A. Beyanname secimi — aynen korunur (türler yeni e-Beyan listesi, dönem tipi eklendi, çoklu seçim onay kutulu) */}
      <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4 mb-4">
        <h2 className="text-gray-300 text-sm font-semibold mb-3">A. Beyanname Seçimi</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="text-xs text-gray-400">Vergilendirme Dönemi — Yıl
            <select value={yil} onChange={e => setYil(Number(e.target.value))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
              {[simd.getFullYear() + 1, simd.getFullYear(), simd.getFullYear() - 1, simd.getFullYear() - 2].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          {donemTipi === 'aylik' ? (
            <label className="text-xs text-gray-400">Ay
              <select value={ay} onChange={e => setAy(Number(e.target.value))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                {AYLAR.map((a, i) => <option key={a} value={i + 1}>{a}</option>)}
              </select>
            </label>
          ) : (
            <label className="text-xs text-gray-400">Dönem
              <select value={donem} onChange={e => setDonem(Number(e.target.value))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                <option value={1}>1. Dönem (Ocak-Mart)</option>
                <option value={2}>2. Dönem (Nisan-Haziran)</option>
                <option value={3}>3. Dönem (Temmuz-Eylül)</option>
                <option value={4}>4. Dönem (Ekim-Aralık)</option>
              </select>
            </label>
          )}
          <label className="text-xs text-gray-400 md:col-span-2">Beyanname Türü
            <select value={turId} onChange={e => setTurId(e.target.value)} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
              {EBEYAN_TURLERI.map(t => <option key={t.id} value={t.id}>{t.kod} - {t.ad}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-start gap-4 mt-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-gray-400">Dönem Tipi:</span>
            <div className="flex gap-3 text-xs text-gray-200">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={donemTipi === 'aylik'} onChange={() => setDonemTipi('aylik')} className="accent-teal-400" /> Aylık
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={donemTipi === '3aylik'} onChange={() => { setDonemTipi('3aylik'); setDonem(Math.ceil(ay / 3)) }} className="accent-teal-400" /> 3 Aylık
              </label>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-gray-400">Mükellef seçimi:</span>
            <div className="flex rounded-lg overflow-hidden border border-blue-700/60 self-start">
              <button onClick={() => setSecimModu('tek')} className={`px-3 py-1.5 text-xs font-medium transition ${secimModu === 'tek' ? 'bg-blue-600 text-white' : 'bg-blue-900/60 text-gray-300'}`}>Tek müşteri</button>
              <button onClick={() => setSecimModu('coklu')} className={`px-3 py-1.5 text-xs font-medium transition ${secimModu === 'coklu' ? 'bg-blue-600 text-white' : 'bg-blue-900/60 text-gray-300'}`}>Toplu müşteri</button>
            </div>
          </div>
        </div>
        {secimModu === 'coklu' && (
          <div className="mt-3 flex flex-wrap items-start gap-3">
            <div className="w-full max-w-md border border-blue-700/60 rounded-xl bg-blue-900/40 max-h-60 overflow-auto p-2 space-y-0.5">
              {musteriler.length === 0 && <div className="text-xs text-gray-500 px-1.5 py-2">Müşteri listesi boş — "Gönderim ve Takip" bölümünden Mükellefleri Getir çalıştırın.</div>}
              {musteriler.map(m => (
                <label key={m.id} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-blue-800/40 cursor-pointer text-sm">
                  <input type="checkbox" checked={seciliIdler.includes(m.id)}
                    onChange={() => setSeciliIdler(ids => ids.includes(m.id) ? ids.filter(x => x !== m.id) : [...ids, m.id])}
                    className="accent-yellow-400 w-4 h-4 shrink-0" />
                  <span className="text-gray-200 truncate">{m.ad}{m.kimlikNo ? <span className="text-gray-500"> · {m.kimlikNo}</span> : ''}</span>
                </label>
              ))}
            </div>
            <div className="flex flex-col gap-1 text-xs">
              <span className="text-cyan-300">{seciliIdler.length} müşteri seçili</span>
              <button onClick={() => setSeciliIdler(musteriler.map(m => m.id))} className="text-blue-300 hover:text-blue-200 underline text-left">Tümü</button>
              <button onClick={() => setSeciliIdler([])} className="text-gray-400 hover:text-gray-300 underline text-left">Temizle</button>
            </div>
          </div>
        )}
      </div>

      {/* e-Beyan düzeni: sol menü + bölüm panelleri */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 items-start">
        {/* Sol menü — ebeyan.gib.gov.tr birebir */}
        <div className="bg-blue-950/60 border border-blue-800/40 rounded-2xl p-2 lg:sticky lg:top-4 max-h-[75vh] overflow-auto">
          {MENU_GRUPLAR.map(menuDongu)}
          <button onClick={() => setAktifBolum('gonderim')}
            className={`w-full text-left pl-5 pr-2 py-1.5 rounded-lg text-xs flex items-center justify-between gap-1.5 transition ${aktifBolum === 'gonderim' ? 'bg-teal-600/30 text-white font-medium' : 'text-gray-300 hover:bg-blue-800/40'}`}>
            <span>Gönderim ve Takip</span>
            <Send className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>

        {/* Sağ panel — aktif bölüm */}
        <div className="min-w-0">
          {/* ---------- İDARİ BİLGİLER ---------- */}
          {aktifBolum === 'idari' && (
            <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4">
              <h2 className="text-white text-lg font-bold">İdari Bilgiler</h2>
              <p className="text-gray-500 text-xs mb-3">{secimEtiketi} · {yil} — {donemTipi === '3aylik' ? `${donem}. Dönem` : AYLAR[ay - 1]}</p>
              <div className="border border-blue-700/50 rounded-xl p-3.5 mb-3">
                <div className="text-xs text-gray-400 mb-1.5">Dönem Tipi</div>
                <div className="flex gap-4 text-sm text-gray-200">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={donemTipi === 'aylik'} onChange={() => setDonemTipi('aylik')} className="accent-teal-400" /> Aylık
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={donemTipi === '3aylik'} onChange={() => setDonemTipi('3aylik')} className="accent-teal-400" /> 3 Aylık
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="text-xs text-gray-400">Yıl
                  <select value={yil} onChange={e => setYil(Number(e.target.value))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                    {[simd.getFullYear() + 1, simd.getFullYear(), simd.getFullYear() - 1, simd.getFullYear() - 2].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </label>
                {donemTipi === 'aylik' ? (
                  <label className="text-xs text-gray-400">Ay
                    <select value={ay} onChange={e => setAy(Number(e.target.value))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                      {AYLAR.map((a, i) => <option key={a} value={i + 1}>{a}</option>)}
                    </select>
                  </label>
                ) : (
                  <label className="text-xs text-gray-400">Dönem
                    <select value={donem} onChange={e => setDonem(Number(e.target.value))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                      <option value={1}>1. Dönem</option><option value={2}>2. Dönem</option><option value={3}>3. Dönem</option><option value={4}>4. Dönem</option>
                    </select>
                  </label>
                )}
                <label className="text-xs text-gray-400">Vergi Dairesi
                  <input value={idariVd} onChange={e => setIdariVd(e.target.value)} placeholder="müşteri kaydından otomatik" className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm" />
                </label>
              </div>
              <label className="text-xs text-gray-400 block mt-3">Mükellef (sıfat ve matrah bölümlerini doldurur)
                <select value={hzMukellef} onChange={e => setHzMukellef(e.target.value)} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                  <option value="">— mükellef seçin —</option>
                  {musteriler.map(m => <option key={m.id} value={m.id}>{m.ad}{m.kimlikNo ? ` (${m.kimlikNo})` : ''}</option>)}
                </select>
              </label>
              <p className="text-[11px] text-gray-500 mt-2">Çoklu seçimde ilk seçili müşteri otomatik atanır; vergi dairesi müşteri kaydından gelir.</p>
              {kaydetBtn('idari')}
            </div>
          )}

          {/* ---------- SIFATLA VERİLDİĞİ ---------- */}
          {aktifBolum === 'sifat' && (
            <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4">
              <h2 className="text-white text-lg font-bold">Beyannamenin Hangi Sıfatla Verildiği</h2>
              <p className="text-gray-500 text-xs mb-3">Bilgiler mükellef kaydından otomatik doldurulur — gerekirse düzeltebilirsiniz.</p>
              <div className="border border-blue-700/50 rounded-xl p-3.5">
                <div className="text-xs text-gray-400 mb-1.5">Beyannamenin Hangi Sıfatla Verildiği</div>
                <div className="flex flex-wrap gap-4 text-sm text-gray-200">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={sifatTipi === 'mukellef'} onChange={() => setSifatTipi('mukellef')} className="accent-teal-400" /> Mükellef
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={sifatTipi === 'mirasci'} onChange={() => setSifatTipi('mirasci')} className="accent-teal-400" /> Mirasçı
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={sifatTipi === 'temsilci'} onChange={() => setSifatTipi('temsilci')} className="accent-teal-400" /> Kanuni Temsilci (Veli, Vasi Kayyum)
                  </label>
                </div>
                {kimlikAlanlari(sifat, setSifat)}
              </div>
              {mukellefBilgi && <p className="text-[11px] text-gray-500 mt-2">Kaynak: {mukellefBilgi.ad}{mukellefBilgi.kimlikNo ? ` (${mukellefBilgi.kimlikNo})` : ''}</p>}
              {kaydetBtn('sifat')}
            </div>
          )}

          {/* ---------- BEYANNAMEYİ DÜZENLEYEN ---------- */}
          {aktifBolum === 'duzenleyen' && (
            <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4">
              <h2 className="text-white text-lg font-bold">Beyannameyi Düzenleyen</h2>
              <p className="text-gray-500 text-xs mb-3">Mali müşavir bilgileri — bir kez kaydedilir, tüm beyannamelerde sabit kullanılır.</p>
              <div className="border border-blue-700/50 rounded-xl p-3.5">
                {kimlikAlanlari(duz, setDuz)}
              </div>
              {kaydetBtn('duzenleyen', 'Bu bilgisayarda saklanır')}
            </div>
          )}

          {/* ---------- MATRAH ---------- */}
          {aktifBolum === 'matrah' && (() => {
            const uygTutar = mUygTablo.reduce((t, s) => t + (Number(s.matrah) || 0), 0)
            const uygVergi = mUygTablo.reduce((t, s) => t + (Number(s.vergi) || 0), 0)
            const ozTutar = mOzelTablo.reduce((t, s) => t + (Number(s.matrah) || 0), 0)
            const ozVergi = mOzelTablo.reduce((t, s) => t + (Number(s.vergi) || 0), 0)
            const ozBedel = mOzelTablo.reduce((t, s) => t + (Number(s.bedel) || 0), 0)
            const t7440 = m7440Tablo.reduce((t, s) => t + (Number(s.matrah) || 0), 0)
            const v7440 = m7440Tablo.reduce((t, s) => t + (Number(s.vergi) || 0), 0)
            return (
              <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4">
                <h2 className="text-white text-lg font-bold">Matrah</h2>
                <p className="text-gray-500 text-xs mb-3">GİB Matrah bölümündeki bildirim tabloları + faturalardan otomatik doldurulan satış/alış tabloları.</p>

                {/* Tevkifat Uygulanmayan İşlemler */}
                <div className="flex items-center justify-between gap-2 mt-2 mb-1.5">
                  <h3 className="text-sm font-semibold text-gray-200">Tevkifat Uygulanmayan İşlemler</h3>
                  <button onClick={() => setMUygModal(true)} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">+ EKLE</button>
                </div>
                <div className="overflow-x-auto border border-blue-800/40 rounded-xl">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-blue-900/50 text-left text-gray-300">
                      <th className="px-2 py-2">İşlem Türü</th><th className="px-2 py-2 text-right">Matrah</th><th className="px-2 py-2 text-right">KDV Oranı</th><th className="px-2 py-2 text-right">Vergi</th><th className="px-2 py-2"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-blue-800/30">
                      {mUygTablo.length === 0 && <tr><td colSpan={5} className="px-2 py-4 text-center text-gray-500 italic">Gösterilecek Kayıt Yok</td></tr>}
                      {mUygTablo.map((s, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-gray-200 max-w-[420px] truncate" title={s.islemTuru}>{s.islemTuru}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.matrah)}</td>
                          <td className="px-2 py-1.5 text-right text-gray-300">%{s.oran}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.vergi)}</td>
                          <td className="px-2 py-1.5"><button onClick={() => setMUygTablo(mUygTablo.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t-2 border-blue-700/50 bg-blue-900/30 text-gray-200 font-semibold">
                      <td className="px-2 py-2">Toplam</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(uygTutar)}</td>
                      <td></td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(uygVergi)}</td>
                      <td></td>
                    </tr></tfoot>
                  </table>
                </div>

                {/* Kısmi Tevkifat Uygulanan İşlemler — tevkifat bölümünden otomatik */}
                <h3 className="text-sm font-semibold text-gray-200 mt-5 mb-1.5">Kısmi Tevkifat Uygulanan İşlemler</h3>
                <div className="overflow-x-auto border border-blue-800/40 rounded-xl">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-blue-900/50 text-left text-gray-300">
                      <th className="px-2 py-2">İşlem Türü</th><th className="px-2 py-2 text-right">Matrah</th><th className="px-2 py-2 text-right">KDV Oranı</th><th className="px-2 py-2 text-right">Tevkifat Oranı</th><th className="px-2 py-2 text-right">Vergi</th>
                    </tr></thead>
                    <tbody className="divide-y divide-blue-800/30">
                      {tvkKismi.length === 0 && <tr><td colSpan={5} className="px-2 py-4 text-center text-gray-500 italic">Gösterilecek Kayıt Yok</td></tr>}
                      {tvkKismi.map((s, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-gray-200 max-w-[420px] truncate" title={s.islemTuru}>{s.islemTuru}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.tutar)}</td>
                          <td className="px-2 py-1.5 text-right text-gray-300">%{s.kdvOrani}</td>
                          <td className="px-2 py-1.5 text-right text-gray-300">{s.tvkOrani}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.hesapKdv)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t-2 border-blue-700/50 bg-blue-900/30 text-gray-200 font-semibold">
                      <td className="px-2 py-2">Toplam</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(tvkKismi.reduce((t, s) => t + (Number(s.tutar) || 0), 0))}</td>
                      <td colSpan={2}></td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(tvkKismi.reduce((t, s) => t + (Number(s.hesapKdv) || 0), 0))}</td>
                    </tr></tfoot>
                  </table>
                </div>
                <div className="bg-sky-500/10 border border-sky-500/25 text-sky-200 text-xs rounded-lg px-3 py-2 mt-2">
                  ⓘ "Kısmi Tevkifat Uygulanan İşlemler" tablosunda değişiklik yapılmak isteniyorsa "Tevkifat Uygulamaai Kapsamındaki İşlemler" sayfasında yer alan "Kısmi Tevkifat Uygulaması Kapsamındaki İşlemlere Ait Bildirim" tablosunda değişiklik yapılmalıdır.
                </div>

                {/* Özel Matrah Şekli Tespit Edilen İşlemler */}
                <div className="flex items-center justify-between gap-2 mt-5 mb-1.5">
                  <h3 className="text-sm font-semibold text-gray-200">Özel Matrah Şekli Tespit Edilen İşlemler</h3>
                  <button onClick={() => setMOzelModal({ sekme: 'hesaplamaksizin', matrahDahilOlmayan: '', islemTuru: OZEL_MATRAH_TURLERI[0], bedel: '', dusulecek: '', oran: '20' })} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">+ EKLE</button>
                </div>
                <div className="overflow-x-auto border border-blue-800/40 rounded-xl">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-blue-900/50 text-left text-gray-300">
                      <th className="px-2 py-2">Bildirim Türü</th><th className="px-2 py-2">İşlem Türü</th><th className="px-2 py-2 text-right">İşlem Bedeli</th><th className="px-2 py-2 text-right">İşlem Bedelinden Düşülecek Tutar</th>
                      <th className="px-2 py-2 text-right">Matrah</th><th className="px-2 py-2 text-right">KDV Oranı</th><th className="px-2 py-2 text-right">Vergi</th><th className="px-2 py-2"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-blue-800/30">
                      {mOzelTablo.length === 0 && <tr><td colSpan={8} className="px-2 py-4 text-center text-gray-500 italic">Gösterilecek Kayıt Yok</td></tr>}
                      {mOzelTablo.map((s, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-gray-300">{s.bildirimTuru}</td>
                          <td className="px-2 py-1.5 text-gray-200 max-w-[300px] truncate" title={s.islemTuru}>{s.islemTuru}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.bedel)}</td>
                          <td className="px-2 py-1.5 text-right text-gray-300 tabular-nums">{tl(s.dusulecek)}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.matrah)}</td>
                          <td className="px-2 py-1.5 text-right text-gray-300">%{s.oran}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.vergi)}</td>
                          <td className="px-2 py-1.5"><button onClick={() => setMOzelTablo(mOzelTablo.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t-2 border-blue-700/50 bg-blue-900/30 text-gray-200 font-semibold">
                      <td colSpan={2} className="px-2 py-2">Toplam</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(ozBedel)}</td>
                      <td></td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(ozTutar)}</td>
                      <td></td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(ozVergi)}</td>
                      <td></td>
                    </tr></tfoot>
                  </table>
                </div>

                {/* 7440 Sayılı Kanun (6/2-a) */}
                <div className="flex items-center justify-between gap-2 mt-5 mb-1.5">
                  <h3 className="text-sm font-semibold text-gray-200">7440 Sayılı Kanunun (6/2-a) Maddesi Kapsamındaki İşlemler</h3>
                  <button onClick={() => setM7440Modal(true)} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">+ EKLE</button>
                </div>
                <div className="overflow-x-auto border border-blue-800/40 rounded-xl">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-blue-900/50 text-left text-gray-300">
                      <th className="px-2 py-2 text-right">Matrah</th><th className="px-2 py-2 text-right">KDV Oranı</th><th className="px-2 py-2 text-right">Vergi</th><th className="px-2 py-2"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-blue-800/30">
                      {m7440Tablo.length === 0 && <tr><td colSpan={4} className="px-2 py-4 text-center text-gray-500 italic">Gösterilecek Kayıt Yok</td></tr>}
                      {m7440Tablo.map((s, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.matrah)}</td>
                          <td className="px-2 py-1.5 text-right text-gray-300">%{s.oran}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.vergi)}</td>
                          <td className="px-2 py-1.5"><button onClick={() => setM7440Tablo(m7440Tablo.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t-2 border-blue-700/50 bg-blue-900/30 text-gray-200 font-semibold">
                      <td className="px-2 py-2 text-right tabular-nums">{tl(t7440)}</td>
                      <td></td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(v7440)}</td>
                      <td></td>
                    </tr></tfoot>
                  </table>
                </div>

                {/* 7440 ödeme yöntemi */}
                <div className="border border-blue-700/50 rounded-xl p-3.5 mt-3">
                  <div className="text-sm text-gray-300">7440 Sayılı Kanunun (6/2-a) Maddesi kapsamında doğacak ödemelerimi</div>
                  <div className="flex flex-wrap gap-5 text-sm text-gray-200 mt-1.5">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" checked={m7440Odeme === 'taksit'} onChange={() => setM7440Odeme('taksit')} className="accent-teal-400" /> Üç eşit taksitle ödemek istiyorum
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" checked={m7440Odeme === 'defaten'} onChange={() => setM7440Odeme('defaten')} className="accent-teal-400" /> Defaten ödemek istiyorum
                    </label>
                  </div>
                </div>
                <div className="flex justify-end mt-2">
                  <button onClick={() => bolKaydet('matrah')} disabled={!m7440Odeme} className="bg-teal-600/70 hover:bg-teal-500 disabled:opacity-40 text-white rounded-lg px-3.5 py-1.5 text-xs font-semibold transition">ÖDEME YÖNTEMİ KAYDET</button>
                </div>

                {/* Diğer İşlemler */}
                <div className="flex items-center justify-between gap-2 mt-4 mb-1.5">
                  <h3 className="text-sm font-semibold text-gray-200">Diğer İşlemler</h3>
                  <button onClick={() => setMDigerModal(true)} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">+ EKLE</button>
                </div>
                <div className="overflow-x-auto border border-blue-800/40 rounded-xl">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-blue-900/50 text-left text-gray-300">
                      <th className="px-2 py-2">İşlem Türü</th><th className="px-2 py-2 text-right">Matrah</th><th className="px-2 py-2 text-right">Vergi</th><th className="px-2 py-2">Açıklama</th><th className="px-2 py-2"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-blue-800/30">
                      {mDigerTablo.length === 0 && <tr><td colSpan={5} className="px-2 py-4 text-center text-gray-500 italic">Gösterilecek Kayıt Yok</td></tr>}
                      {mDigerTablo.map((s, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-gray-200 max-w-[360px] truncate" title={s.islemTuru}>{s.islemTuru}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.matrah)}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.vergi)}</td>
                          <td className="px-2 py-1.5 text-gray-300 max-w-[220px] truncate" title={s.aciklama}>{s.aciklama || '-'}</td>
                          <td className="px-2 py-1.5"><button onClick={() => setMDigerTablo(mDigerTablo.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t-2 border-blue-700/50 bg-blue-900/30 text-gray-200 font-semibold">
                      <td className="px-2 py-2">Toplam</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(mDigerTablo.reduce((t, s) => t + (Number(s.matrah) || 0), 0))}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(mDigerTablo.reduce((t, s) => t + (Number(s.vergi) || 0), 0))}</td>
                      <td colSpan={2}></td>
                    </tr></tfoot>
                  </table>
                </div>

                {/* İsteğe Bağlı Tam Tevkifat Uygulanan İşlemler — tevkifat bölümünden otomatik */}
                <h3 className="text-sm font-semibold text-gray-200 mt-5 mb-1.5">İsteğe Bağlı Tam Tevkifat Uygulanan İşlemler</h3>
                <div className="overflow-x-auto border border-blue-800/40 rounded-xl">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-blue-900/50 text-left text-gray-300">
                      <th className="px-2 py-2">İşlem Türü</th><th className="px-2 py-2 text-right">Matrah</th><th className="px-2 py-2 text-right">KDV Oranı</th><th className="px-2 py-2 text-right">Vergi</th>
                    </tr></thead>
                    <tbody className="divide-y divide-blue-800/30">
                      {tvkTam.length === 0 && <tr><td colSpan={4} className="px-2 py-4 text-center text-gray-500 italic">Gösterilecek Kayıt Yok</td></tr>}
                      {tvkTam.map((s, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-gray-200 max-w-[420px] truncate" title={s.islemTuru}>{s.islemTuru}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.tutar)}</td>
                          <td className="px-2 py-1.5 text-right text-gray-300">%{s.kdvOrani}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.vergi)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t-2 border-blue-700/50 bg-blue-900/30 text-gray-200 font-semibold">
                      <td className="px-2 py-2">Toplam</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(tvkTam.reduce((t, s) => t + (Number(s.tutar) || 0), 0))}</td>
                      <td></td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(tvkTam.reduce((t, s) => t + (Number(s.vergi) || 0), 0))}</td>
                    </tr></tfoot>
                  </table>
                </div>
                <div className="bg-sky-500/10 border border-sky-500/25 text-sky-200 text-xs rounded-lg px-3 py-2 mt-2">
                  ⓘ "İsteğe Bağlı Tam Tevkifat Uygulanan İşlemler" tablosunda değişiklik yapılmak isteniyorsa "Tevkifat Uygulamaai Kapsamındaki İşlemler" sayfasında yer alan "İsteğe Bağlı Tam Tevkifat Uygulamasına İlişkin Bildirim" tablosunda değişiklik yapılmalıdır.
                </div>

                {/* Alt özet kartı */}
                <div className="flex justify-end mt-4">
                  <div className="bg-blue-900/40 border border-blue-800/40 rounded-xl px-5 py-3 min-w-[340px] space-y-2">
                    <div className="text-sm text-gray-400 flex justify-between">Toplam Matrah<span className="text-white font-semibold tabular-nums">{tl(uygTutar + tvkKismi.reduce((t, s) => t + (Number(s.tutar) || 0), 0) + ozTutar + t7440 + mDigerTablo.reduce((t, s) => t + (Number(s.matrah) || 0), 0) + tvkTam.reduce((t, s) => t + (Number(s.tutar) || 0), 0))}</span></div>
                    <div className="text-sm text-gray-400 flex justify-between">Hesaplanan KDV<span className="text-white font-semibold tabular-nums">{tl(uygVergi + tvkKismi.reduce((t, s) => t + (Number(s.hesapKdv) || 0), 0) + ozVergi + v7440 + mDigerTablo.reduce((t, s) => t + (Number(s.vergi) || 0), 0) + tvkTam.reduce((t, s) => t + (Number(s.vergi) || 0), 0))}</span></div>
                    <label className="text-sm text-gray-400 flex justify-between items-center gap-2">Daha Önce İndirim Konusu Yapılan KDV'nin İlavesi
                      <input type="number" step="0.01" value={mOncedenInd} onChange={e => setMOncedenInd(e.target.value)} className="w-28 bg-blue-900/60 border border-blue-700/60 rounded px-2 py-1 text-white text-right tabular-nums" />
                    </label>
                    <div className="text-sm text-gray-300 flex justify-between border-t border-blue-700/40 pt-2">Toplam KDV<span className="text-teal-200 font-bold tabular-nums">{tl(uygVergi + tvkKismi.reduce((t, s) => t + (Number(s.hesapKdv) || 0), 0) + ozVergi + v7440 + mDigerTablo.reduce((t, s) => t + (Number(s.vergi) || 0), 0) + tvkTam.reduce((t, s) => t + (Number(s.vergi) || 0), 0) + (Number(mOncedenInd) || 0))}</span></div>
                  </div>
                </div>
                <div className="flex justify-end mt-2">
                  <button onClick={() => bolKaydet('matrah')} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-4 py-1.5 text-xs font-semibold transition">KONTROL ET</button>
                </div>

                {kaydetBtn('matrah')}

                {/* --- Ekle modalları --- */}
                {mUygModal && (() => {
                  const vergi = Math.round((Number(mUygForm.matrah) || 0) * (Number(mUygForm.oran) || 0) / 100 * 100) / 100
                  return (
                    <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setMUygModal(false)}>
                      <div className="bg-blue-950 border border-blue-700/50 rounded-2xl shadow-2xl max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
                        <h3 className="text-white font-bold text-base mb-3">Tevkifat Uygulanmayan İşlemler Ekle</h3>
                        <div className="space-y-2.5">
                          <label className="block text-xs text-gray-400">İşlem Türü
                            <select value={mUygForm.islemTuru} onChange={e => setMUygForm(f => ({ ...f, islemTuru: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                              {TVK_UYGULANMAYAN_TURLERI.map(x => <option key={x}>{x}</option>)}
                            </select>
                          </label>
                          <label className="block text-xs text-gray-400">Matrah
                            <input type="number" step="0.01" value={mUygForm.matrah} onChange={e => setMUygForm(f => ({ ...f, matrah: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm text-right tabular-nums" />
                          </label>
                          <label className="block text-xs text-gray-400">KDV Oranı
                            <select value={mUygForm.oran} onChange={e => setMUygForm(f => ({ ...f, oran: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                              {['1', '10', '20'].map(x => <option key={x}>{x}</option>)}
                            </select>
                          </label>
                          <div className="text-xs text-gray-400 bg-blue-900/40 border border-blue-800/40 rounded-lg px-3 py-2">Vergi<span className="float-right text-white tabular-nums">{tl(vergi)}</span></div>
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                          <button onClick={() => setMUygModal(false)} className="bg-red-700/80 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">VAZGEÇ</button>
                          <button onClick={() => { setMUygTablo(l => [...l, { ...mUygForm, matrah: Number(mUygForm.matrah) || 0, vergi }]); setMUygModal(false) }} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">EKLE</button>
                        </div>
                      </div>
                    </div>
                  )
                })()}
                {mOzelModal && (() => {
                  const m = mOzelModal
                  const matrah = Math.round(((Number(m.bedel) || 0) - (Number(m.dusulecek) || 0)) * 100) / 100
                  const vergi = Math.round(matrah * (Number(m.oran) || 0) / 100 * 100) / 100
                  const set = (yama) => setMOzelModal(x => ({ ...x, ...yama }))
                  return (
                    <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setMOzelModal(null)}>
                      <div className="bg-blue-950 border border-blue-700/50 rounded-2xl shadow-2xl max-w-md w-full p-5 max-h-[92vh] overflow-auto" onClick={e => e.stopPropagation()}>
                        <h3 className="text-white font-bold text-base mb-3">Özel Matrah Şekli Tespit Edilen İşlemler Ekle</h3>
                        <div className="flex rounded-lg overflow-hidden border border-blue-700/60 mb-3">
                          <button onClick={() => set({ sekme: 'hesaplamaksizin' })} className={`flex-1 py-2 text-[11px] font-semibold transition ${m.sekme === 'hesaplamaksizin' ? 'bg-teal-600/30 text-teal-200' : 'bg-blue-900/60 text-gray-400'}`}>KDV HESAPLAMAKSIZIN BİLDİRİMDE BULUNMASI GEREKENLER</button>
                          <button onClick={() => set({ sekme: 'hesaplayarak' })} className={`flex-1 py-2 text-[11px] font-semibold transition ${m.sekme === 'hesaplayarak' ? 'bg-teal-600/30 text-teal-200' : 'bg-blue-900/60 text-gray-400'}`}>KDV HESAPLAYARAK BİLDİRİMDE BULUNMASI GEREKENLER</button>
                        </div>
                        {m.sekme === 'hesaplamaksizin' ? (
                          <label className="block text-xs text-gray-400">Özel Matrah Şekline Tabi İşlemlerde Matrah Dahil Olmayan Bedel
                            <input type="number" step="0.01" value={m.matrahDahilOlmayan} onChange={e => set({ matrahDahilOlmayan: e.target.value })} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm text-right tabular-nums" />
                          </label>
                        ) : (
                          <div className="space-y-2.5">
                            <label className="block text-xs text-gray-400">İşlem Türü
                              <select value={m.islemTuru} onChange={e => set({ islemTuru: e.target.value })} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                                {OZEL_MATRAH_TURLERI.map(x => <option key={x}>{x}</option>)}
                              </select>
                            </label>
                            <label className="block text-xs text-gray-400">İşlem Bedeli
                              <input type="number" step="0.01" value={m.bedel} onChange={e => set({ bedel: e.target.value })} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm text-right tabular-nums" />
                            </label>
                            <label className="block text-xs text-gray-400">İşlem Bedelinden Düşülecek Tutar
                              <input type="number" step="0.01" value={m.dusulecek} onChange={e => set({ dusulecek: e.target.value })} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm text-right tabular-nums" />
                            </label>
                            <label className="block text-xs text-gray-400">KDV Oranı
                              <select value={m.oran} onChange={e => set({ oran: e.target.value })} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                                {['1', '10', '20'].map(x => <option key={x}>{x}</option>)}
                              </select>
                            </label>
                            <div className="text-xs text-gray-400 bg-blue-900/40 border border-blue-800/40 rounded-lg px-3 py-2">Matrah<span className="float-right text-white tabular-nums">{tl(matrah)}</span></div>
                            <div className="text-xs text-gray-400 bg-blue-900/40 border border-blue-800/40 rounded-lg px-3 py-2">Vergi<span className="float-right text-white tabular-nums">{tl(vergi)}</span></div>
                          </div>
                        )}
                        <div className="mt-4 flex justify-end gap-2">
                          <button onClick={() => setMOzelModal(null)} className="bg-red-700/80 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">VAZGEÇ</button>
                          <button
                            onClick={() => {
                              if (m.sekme === 'hesaplamaksizin') setMOzelTablo(l => [...l, { bildirimTuru: 'KDV hesaplamaksızın bildirimde bulunması gerekenler', islemTuru: '-', bedel: Number(m.matrahDahilOlmayan) || 0, dusulecek: 0, matrah: Number(m.matrahDahilOlmayan) || 0, oran: '—', vergi: 0 }])
                              else setMOzelTablo(l => [...l, { bildirimTuru: 'KDV hesaplayarak bildirimde bulunması gerekenler', islemTuru: m.islemTuru, bedel: Number(m.bedel) || 0, dusulecek: Number(m.dusulecek) || 0, matrah, oran: m.oran, vergi }])
                              setMOzelModal(null)
                            }}
                            className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">EKLE</button>
                        </div>
                      </div>
                    </div>
                  )
                })()}
                {m7440Modal && (() => {
                  const vergi = Math.round((Number(m7440Form.matrah) || 0) * (Number(m7440Form.oran) || 0) / 100 * 100) / 100
                  return (
                    <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setM7440Modal(false)}>
                      <div className="bg-blue-950 border border-blue-700/50 rounded-2xl shadow-2xl max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
                        <h3 className="text-white font-bold text-base mb-3">7440 Sayılı Kanunun (6/2-a) Maddesi Kapsamındaki İşlemler Ekle</h3>
                        <div className="space-y-2.5">
                          <label className="block text-xs text-gray-400">Matrah
                            <input type="number" step="0.01" value={m7440Form.matrah} onChange={e => setM7440Form(f => ({ ...f, matrah: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm text-right tabular-nums" />
                          </label>
                          <label className="block text-xs text-gray-400">KDV Oranı
                            <select value={m7440Form.oran} onChange={e => setM7440Form(f => ({ ...f, oran: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                              {['1', '10', '20'].map(x => <option key={x}>{x}</option>)}
                            </select>
                          </label>
                          <div className="text-xs text-gray-400 bg-blue-900/40 border border-blue-800/40 rounded-lg px-3 py-2">Vergi<span className="float-right text-white tabular-nums">{tl(vergi)}</span></div>
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                          <button onClick={() => setM7440Modal(false)} className="bg-red-700/80 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">VAZGEÇ</button>
                          <button onClick={() => { setM7440Tablo(l => [...l, { ...m7440Form, matrah: Number(m7440Form.matrah) || 0, vergi }]); setM7440Modal(false) }} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">EKLE</button>
                        </div>
                      </div>
                    </div>
                  )
                })()}
                {mDigerModal && (
                  <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setMDigerModal(false)}>
                    <div className="bg-blue-950 border border-blue-700/50 rounded-2xl shadow-2xl max-w-md w-full p-5 max-h-[92vh] overflow-auto" onClick={e => e.stopPropagation()}>
                      <h3 className="text-white font-bold text-base mb-3">Diğer İşlemler Ekle</h3>
                      <div className="space-y-2.5">
                        <label className="block text-xs text-gray-400">İşlem Türü
                          <select value={mDigerForm.islemTuru} onChange={e => setMDigerForm(f => ({ ...f, islemTuru: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                            {DIGER_ISLEM_TURLERI.map(x => <option key={x}>{x}</option>)}
                          </select>
                        </label>
                        <label className="block text-xs text-gray-400">Matrah
                          <input type="number" step="0.01" value={mDigerForm.matrah} onChange={e => setMDigerForm(f => ({ ...f, matrah: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm text-right tabular-nums" />
                        </label>
                        <label className="block text-xs text-gray-400">Vergi
                          <input type="number" step="0.01" value={mDigerForm.vergi} onChange={e => setMDigerForm(f => ({ ...f, vergi: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm text-right tabular-nums" />
                        </label>
                        <label className="block text-xs text-gray-400">Açıklama
                          <input value={mDigerForm.aciklama} maxLength={255} onChange={e => setMDigerForm(f => ({ ...f, aciklama: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm" />
                          <span className="text-[10px] text-gray-600">{(mDigerForm.aciklama || '').length}/255</span>
                        </label>
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <button onClick={() => setMDigerModal(false)} className="bg-red-700/80 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">VAZGEÇ</button>
                        <button onClick={() => { setMDigerTablo(l => [...l, { ...mDigerForm, matrah: Number(mDigerForm.matrah) || 0, vergi: Number(mDigerForm.vergi) || 0 }]); setMDigerModal(false) }} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">EKLE</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
          {aktifBolum === 'sonuc' && (() => {
            const hesaplanan = hzSatis.reduce((t, s) => t + (Number(s.kdv) || 0), 0)
              + mUygTablo.reduce((t, s) => t + (Number(s.vergi) || 0), 0)
              + tvkKismi.reduce((t, s) => t + (Number(s.hesapKdv) || 0), 0)
              + mOzelTablo.reduce((t, s) => t + (Number(s.vergi) || 0), 0)
              + m7440Tablo.reduce((t, s) => t + (Number(s.vergi) || 0), 0)
              + mDigerTablo.reduce((t, s) => t + (Number(s.vergi) || 0), 0)
              + tvkTam.reduce((t, s) => t + (Number(s.vergi) || 0), 0)
            const v7440 = m7440Tablo.reduce((t, s) => t + (Number(s.vergi) || 0), 0)
            const indirilecek = hzAlis.reduce((t, s) => t + (Number(s.kdv) || 0), 0)
            const devredenOnceki = Number(hzDevreden) || 0
            const odenecek = Math.max(0, hesaplanan - indirilecek - devredenOnceki)
            const toplamMatrah = mUygTablo.reduce((t, s) => t + (Number(s.matrah) || 0), 0)
              + tvkKismi.reduce((t, s) => t + (Number(s.tutar) || 0), 0)
              + mOzelTablo.reduce((t, s) => t + (Number(s.matrah) || 0), 0)
              + m7440Tablo.reduce((t, s) => t + (Number(s.matrah) || 0), 0)
              + mDigerTablo.reduce((t, s) => t + (Number(s.matrah) || 0), 0)
              + tvkTam.reduce((t, s) => t + (Number(s.tutar) || 0), 0)
            const kk = Number(krediKartiBedel) || 0
            return (
            <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4">
              <h2 className="text-white text-lg font-bold">Sonuç Hesapları</h2>
              <p className="text-gray-500 text-xs mb-3">Matrah ve Ekler bölümlerinden otomatik hesaplanır.</p>

              {/* Sonuç satırları — GİB düzeni */}
              <div className="max-w-3xl mx-auto border border-blue-800/40 rounded-xl overflow-hidden">
                {[
                  ['Tecil Edilecek KDV', 0],
                  ['Ödemesi Gereken KDV', odenecek],
                  ['7440 Sayılı Kanunun (6/2-a) Maddesi Kapsamındaki İşlemler Nedeniyle Hesaplanan KDV', v7440],
                  ['Bu Dönemde Ödemesi Gereken KDV', odenecek + v7440],
                  ['İade Edilmesi Gereken KDV', 0],
                  ['Sonraki Döneme Devreden KDV', Math.max(0, (indirilecek + devredenOnceki) - hesaplanan)],
                ].map(([ad, deger]) => (
                  <div key={ad} className="flex justify-between items-center px-4 py-3 bg-blue-900/30 border-b border-blue-800/30 last:border-b-0">
                    <span className="text-gray-300 text-sm">{ad}</span>
                    <span className="text-white font-semibold tabular-nums">₺{tl(deger)}</span>
                  </div>
                ))}
              </div>

              {/* Diğer Bilgiler */}
              <h3 className="text-gray-200 text-base font-semibold text-center mt-6 mb-2">Diğer Bilgiler</h3>
              <div className="max-w-3xl mx-auto border border-blue-800/40 rounded-xl overflow-hidden">
                <div className="flex justify-between items-center px-4 py-3 bg-blue-900/30 border-b border-blue-800/30">
                  <span className="text-gray-300 text-sm">Teslim ve Hizmetlerin Karşılığını Teşkil Eden Bedel (Aylık)</span>
                  <span className="text-white font-semibold tabular-nums">₺{tl(toplamMatrah)}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-3 bg-blue-900/30 border-b border-blue-800/30">
                  <span className="text-gray-300 text-sm">Teslim ve Hizmetlerin Karşılığını Teşkil Eden Bedel (Kümülatif)</span>
                  <span className="text-white font-semibold tabular-nums">₺{tl(toplamMatrah)}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-3 bg-blue-900/30 border-b border-blue-800/30">
                  <span className="text-gray-300 text-sm">Kayıtlarımıza Göre Kredi Kartı İle Tahsil Edilen Teslim ve Hizmetlerin KDV Dahil Karşılığını Teşkil Eden Bedel</span>
                  <span className="text-white font-semibold tabular-nums">₺{tl(kk * 1.2)}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-3 bg-blue-900/30 gap-3">
                  <span className="text-gray-300 text-sm max-w-[440px]">Kredi Kartı ile Tahsil Edilen Teslim ve Hizmetlerin KDV Dahil Karşılığını Teşkil Eden Bedel <span className="text-gray-500">(KDV hariç girilir)</span></span>
                  <input type="number" step="0.01" value={krediKartiBedel} onChange={e => setKrediKartiBedel(e.target.value)} placeholder="₺0,00" className="w-44 bg-blue-900/60 border border-blue-700/60 rounded px-2 py-1.5 text-white text-right tabular-nums text-sm" />
                </div>
              </div>

              {/* Düğmeler — GİB düzeni */}
              <div className="flex flex-wrap justify-end gap-2 mt-4">
                <button onClick={() => bolKaydet('sonuc')} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-4 py-2 text-sm font-bold transition">KONTROL ET VE KAYDET</button>
                <button onClick={() => setAktifBolum('matrah')} className="bg-gray-700/60 hover:bg-gray-600/60 text-gray-300 rounded-lg px-4 py-2 text-sm font-medium transition">DEĞİŞİKLİK YAP</button>
                <button disabled title="GİB'e gönderim sonrası aktif olacak" className="bg-gray-700/40 text-gray-500 rounded-lg px-4 py-2 text-sm font-medium cursor-not-allowed">ONAYLA</button>
                <button disabled title="GİB entegrasyonu sonrası aktif olacak" className="bg-gray-700/40 text-gray-500 rounded-lg px-4 py-2 text-sm font-medium cursor-not-allowed">PDF İNDİR</button>
              </div>

              {/* KDV özeti + API gönder */}
              <div className="max-w-3xl mx-auto mt-6 space-y-2">
                <div className="flex justify-between bg-blue-900/40 border border-blue-800/40 rounded-lg px-3 py-2 text-sm">
                  <span className="text-gray-300">Hesaplanan KDV (Satış + Matrah tabloları)</span>
                  <span className="text-white font-mono tabular-nums">{tl(hesaplanan)}</span>
                </div>
                <div className="flex justify-between bg-blue-900/40 border border-blue-800/40 rounded-lg px-3 py-2 text-sm">
                  <span className="text-gray-300">İndirilecek KDV (Alış toplamı)</span>
                  <span className="text-white font-mono tabular-nums">{tl(indirilecek)}</span>
                </div>
                <div className="flex justify-between items-center bg-blue-900/40 border border-blue-800/40 rounded-lg px-3 py-2 text-sm">
                  <span className="text-gray-300">Önceki Dönemden Devreden KDV</span>
                  <input type="number" step="0.01" value={hzDevreden} onChange={e => setHzDevreden(e.target.value)} className="w-32 bg-blue-900/60 border border-blue-700/60 rounded px-2 py-1 text-white text-right tabular-nums" />
                </div>
                <div className="flex justify-between border-2 border-teal-600/50 bg-teal-900/20 rounded-lg px-3 py-2.5">
                  <span className="text-teal-200 font-bold">Ödenecek KDV</span>
                  <span className="text-teal-200 font-bold font-mono tabular-nums">{tl(odenecek)} TL</span>
                </div>
                <button onClick={hazirlaVeGonder} disabled={hzYukleniyor || !tokDurum?.kayitli} title={!tokDurum?.kayitli ? 'Önce Gönderim ve Takip bölümünden API KEY kaydedin' : 'create → kontrol → gönder akışı'} className="flex items-center gap-1.5 bg-violet-700/80 hover:bg-violet-600 disabled:opacity-50 text-white rounded-lg px-3.5 py-2 text-sm font-medium transition">
                  <Send className="w-4 h-4" /> GİB'e Gönder (API)
                </button>
                {hzGonder && (
                  <div className="bg-gray-900/60 border border-gray-700/50 rounded-lg p-2 max-h-40 overflow-auto">
                    {hzGonder.adimlar?.map((a, i) => (
                      <div key={i} className="text-xs mb-1">
                        <span className={a.status < 400 ? 'text-emerald-400' : 'text-red-400'}>{a.adim}: HTTP {a.status}</span>
                        <pre className="text-gray-300 whitespace-pre-wrap break-all">{typeof a.yanit === 'string' ? a.yanit : JSON.stringify(a.yanit, null, 1).slice(0, 600)}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            )
          })()}

          {/* ---------- TEVKİFAT (GİB iki tablo) ---------- */}
          {aktifBolum === 'tevkifat' && (() => {
            const kTutar = tvkKismi.reduce((t, s) => t + (Number(s.tutar) || 0), 0)
            const kKdv = tvkKismi.reduce((t, s) => t + (Number(s.hesapKdv) || 0), 0)
            const kTvk = tvkKismi.reduce((t, s) => t + (Number(s.tvkTutar) || 0), 0)
            const tTutar = tvkTam.reduce((t, s) => t + (Number(s.tutar) || 0), 0)
            const tVergi = tvkTam.reduce((t, s) => t + (Number(s.vergi) || 0), 0)
            return (
              <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4">
                <h2 className="text-white text-lg font-bold">Tevkifat Uygulaması Kapsamındaki İşlemler</h2>
                <p className="text-gray-500 text-xs mb-3">GİB'deki gibi iki ayrı bildirim tablosu — EKLE ile satır girin; hesaplanan KDV ve tevkifat tutarı otomatik hesaplanır.</p>

                <div className="flex items-center justify-between gap-2 mt-2 mb-1.5">
                  <h3 className="text-sm font-semibold text-gray-200">Kısmi Tevkifat Uygulaması Kapsamındaki İşlemlere Ait Bildirim</h3>
                  <button onClick={() => setTvkModal({ tip: 'kismi', tc: '', vkn: '', ad: '', faturaTuru: FATURA_TURLERI_TVK[0], tarih: '', no: '', islemTuru: ISLEM_TURLERI_TVK[0], tutar: '', kdvOrani: '20', tvkOrani: '4/10' })} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">+ EKLE</button>
                </div>
                <div className="overflow-x-auto border border-blue-800/40 rounded-xl">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-blue-900/50 text-left text-gray-300">
                      <th className="px-2 py-2">Alıcının VKN</th><th className="px-2 py-2">Alıcının T.C. Kimlik No</th><th className="px-2 py-2">Alıcının Adı Soyadı/Ünvanı</th>
                      <th className="px-2 py-2">Fatura Türü</th><th className="px-2 py-2">Fatura Tarihi</th><th className="px-2 py-2">Fatura No</th>
                      <th className="px-2 py-2">İşlem Türü</th><th className="px-2 py-2 text-right">İşlem Tutarı</th><th className="px-2 py-2 text-right">KDV Oranı</th>
                      <th className="px-2 py-2 text-right">Hesaplanan KDV</th><th className="px-2 py-2 text-right">Tevkifat Oranı</th><th className="px-2 py-2 text-right">Tevkifat Tutanı</th><th className="px-2 py-2"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-blue-800/30">
                      {tvkKismi.length === 0 && <tr><td colSpan={13} className="px-2 py-4 text-center text-gray-500 italic">Gösterilecek Kayıt Yok</td></tr>}
                      {tvkKismi.map((s, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-gray-300 tabular-nums">{s.vkn}</td>
                          <td className="px-2 py-1.5 text-gray-300 tabular-nums">{s.tc}</td>
                          <td className="px-2 py-1.5 text-gray-200">{s.ad}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.faturaTuru}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.tarih}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.no}</td>
                          <td className="px-2 py-1.5 text-gray-300 max-w-[180px] truncate" title={s.islemTuru}>{s.islemTuru}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.tutar)}</td>
                          <td className="px-2 py-1.5 text-right text-gray-300">%{s.kdvOrani}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.hesapKdv)}</td>
                          <td className="px-2 py-1.5 text-right text-gray-300">{s.tvkOrani}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.tvkTutar)}</td>
                          <td className="px-2 py-1.5"><button onClick={() => setTvkKismi(tvkKismi.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t-2 border-blue-700/50 bg-blue-900/30 text-gray-200 font-semibold">
                      <td colSpan={7} className="px-2 py-2">Toplam</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(kTutar)}</td>
                      <td></td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(kKdv)}</td>
                      <td></td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(kTvk)}</td>
                      <td></td>
                    </tr></tfoot>
                  </table>
                </div>

                <div className="flex items-center justify-between gap-2 mt-5 mb-1.5">
                  <h3 className="text-sm font-semibold text-gray-200">İsteğe Bağlı Tam Tevkifat Uygulaması Kapsamındaki İşlemlere Ait Bildirim</h3>
                  <button onClick={() => setTvkModal({ tip: 'tam', tc: '', vkn: '', ad: '', faturaTuru: FATURA_TURLERI_TVK[0], tarih: '', no: '', islemTuru: ISLEM_TURLERI_TVK[0], tutar: '', kdvOrani: '20', tvkOrani: '10/10' })} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">+ EKLE</button>
                </div>
                <div className="overflow-x-auto border border-blue-800/40 rounded-xl">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-blue-900/50 text-left text-gray-300">
                      <th className="px-2 py-2">Alıcının VKN</th><th className="px-2 py-2">Alıcının T.C. Kimlik No</th><th className="px-2 py-2">Alıcının Adı Soyadı/Ünvanı</th>
                      <th className="px-2 py-2">Fatura Türü</th><th className="px-2 py-2">Fatura Tarihi</th><th className="px-2 py-2">Fatura No</th>
                      <th className="px-2 py-2">İşlem Türü</th><th className="px-2 py-2 text-right">İşlem Tutarı (KDV Hariç)</th><th className="px-2 py-2 text-right">KDV Oranı</th><th className="px-2 py-2 text-right">Vergi</th><th className="px-2 py-2"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-blue-800/30">
                      {tvkTam.length === 0 && <tr><td colSpan={11} className="px-2 py-4 text-center text-gray-500 italic">Gösterilecek Kayıt Yok</td></tr>}
                      {tvkTam.map((s, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-gray-300 tabular-nums">{s.vkn}</td>
                          <td className="px-2 py-1.5 text-gray-300 tabular-nums">{s.tc}</td>
                          <td className="px-2 py-1.5 text-gray-200">{s.ad}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.faturaTuru}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.tarih}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.no}</td>
                          <td className="px-2 py-1.5 text-gray-300 max-w-[180px] truncate" title={s.islemTuru}>{s.islemTuru}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.tutar)}</td>
                          <td className="px-2 py-1.5 text-right text-gray-300">%{s.kdvOrani}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.vergi)}</td>
                          <td className="px-2 py-1.5"><button onClick={() => setTvkTam(tvkTam.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t-2 border-blue-700/50 bg-blue-900/30 text-gray-200 font-semibold">
                      <td colSpan={7} className="px-2 py-2">Toplam</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(tTutar)}</td>
                      <td></td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(tVergi)}</td>
                      <td></td>
                    </tr></tfoot>
                  </table>
                </div>
                {kaydetBtn('tevkifat')}

                {/* Ekle formu — GİB ekle penceresi */}
                {tvkModal && (() => {
                  const m = tvkModal
                  const hesapKdv = Math.round((Number(m.tutar) || 0) * (Number(m.kdvOrani) || 0) / 100 * 100) / 100
                  const set = (yama) => setTvkModal(x => ({ ...x, ...yama }))
                  return (
                    <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setTvkModal(null)}>
                      <div className="bg-blue-950 border border-blue-700/50 rounded-2xl shadow-2xl max-w-md w-full p-5 max-h-[92vh] overflow-auto" onClick={e => e.stopPropagation()}>
                        <h3 className="text-white font-bold text-base mb-3">{m.tip === 'kismi' ? 'Kısmi Tevkifat Uygulaması' : 'İsteğe Bağlı Tam Tevkifat'} — Satır Ekle</h3>
                        <div className="space-y-2.5">
                          <label className="block text-xs text-gray-400">Alıcının T.C. Kimlik No
                            <input value={m.tc} onChange={e => set({ tc: e.target.value })} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm tabular-nums" />
                          </label>
                          <label className="block text-xs text-gray-400">Alıcının Vergi Kimlik No
                            <input value={m.vkn} onChange={e => set({ vkn: e.target.value })} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm tabular-nums" />
                          </label>
                          <label className="block text-xs text-gray-400">Alıcının Adı Soyadı/Ünvanı
                            <input value={m.ad} maxLength={100} onChange={e => set({ ad: e.target.value })} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm" />
                            <span className="text-[10px] text-gray-600">{(m.ad || '').length}/100</span>
                          </label>
                          <label className="block text-xs text-gray-400">Fatura Türü
                            <select value={m.faturaTuru} onChange={e => set({ faturaTuru: e.target.value })} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                              {FATURA_TURLERI_TVK.map(x => <option key={x}>{x}</option>)}
                            </select>
                          </label>
                          <label className="block text-xs text-gray-400">Fatura ve Benzeri Belgenin Tarihi
                            <input type="date" value={m.tarih} onChange={e => set({ tarih: e.target.value })} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm" />
                          </label>
                          <label className="block text-xs text-gray-400">Fatura ve Benzeri Belgenin Seri / Sıra No
                            <input value={m.no} maxLength={16} onChange={e => set({ no: e.target.value })} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm" />
                            <span className="text-[10px] text-gray-600">{(m.no || '').length}/16</span>
                          </label>
                          <label className="block text-xs text-gray-400">İşlem Türü
                            <select value={m.islemTuru} onChange={e => set({ islemTuru: e.target.value })} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                              {ISLEM_TURLERI_TVK.map(x => <option key={x}>{x}</option>)}
                            </select>
                          </label>
                          <label className="block text-xs text-gray-400">İşlem Tutarı (KDV Hariç)
                            <input type="number" step="0.01" value={m.tutar} onChange={e => set({ tutar: e.target.value })} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm text-right tabular-nums" />
                          </label>
                          <label className="block text-xs text-gray-400">KDV Oranı
                            <select value={m.kdvOrani} onChange={e => set({ kdvOrani: e.target.value })} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                              {KDV_ORAN_SECENEKLERI.map(x => <option key={x}>{x}</option>)}
                            </select>
                          </label>
                          {m.tip === 'kismi' && (
                            <label className="block text-xs text-gray-400">Tevkifat Oranı
                              <select value={m.tvkOrani} onChange={e => set({ tvkOrani: e.target.value })} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                                {TEVKIFAT_ORANLARI.map(x => <option key={x}>{x}</option>)}
                              </select>
                            </label>
                          )}
                          <div className="text-xs text-gray-400 bg-blue-900/40 border border-blue-800/40 rounded-lg px-3 py-2">Hesaplanan KDV
                            <span className="float-right text-white tabular-nums">{tl(hesapKdv)}</span>
                          </div>
                          {m.tip === 'kismi' && (
                            <div className="text-xs text-gray-400 bg-teal-900/20 border border-teal-700/40 rounded-lg px-3 py-2">Tevkifat Tutanı
                              <span className="float-right text-teal-200 tabular-nums">{tl(Math.round(hesapKdv * kesirCoz(m.tvkOrani) * 100) / 100)}</span>
                            </div>
                          )}
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                          <button onClick={() => setTvkModal(null)} className="bg-red-700/80 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">VAZGEÇ</button>
                          <button
                            onClick={() => {
                              const satir = { tc: m.tc, vkn: m.vkn, ad: m.ad, faturaTuru: m.faturaTuru, tarih: m.tarih, no: m.no, islemTuru: m.islemTuru, tutar: Number(m.tutar) || 0, kdvOrani: m.kdvOrani, hesapKdv, tvkOrani: m.tvkOrani, tvkTutar: Math.round(hesapKdv * kesirCoz(m.tvkOrani) * 100) / 100, vergi: hesapKdv }
                              if (m.tip === 'kismi') setTvkKismi(l => [...l, satir])
                              else setTvkTam(l => [...l, satir])
                              setTvkModal(null)
                            }}
                            className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">EKLE</button>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )
          })()}

          {/* ---------- 107 ve 111 KODLU İNDİRİM TÜRLERİ ---------- */}
          {aktifBolum === 'indirim107' && (() => {
            const dTutar = i107Degersiz.reduce((t, s) => t + (Number(s.tutar) || 0), 0)
            const dKdv = i107Degersiz.reduce((t, s) => t + (Number(s.kdv) || 0), 0)
            const pToplamKdv = i107Donem.reduce((t, s) => t + (Number(s.toplamKdv) || 0), 0)
            const pIndirimKdv = i107Donem.reduce((t, s) => t + (Number(s.indirimKdv) || 0), 0)
            return (
              <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4">
                <h2 className="text-white text-lg font-bold">107 ve 111 Kodlu İndirim Türleri</h2>
                <p className="text-gray-500 text-xs mb-3">Değersiz hale gelen alacaklar (111) ve 107 kodlu satırla indirim konusu yapılan KDV alacağının dönem bilgisi — EKLE ile satır girin.</p>

                <div className="flex items-center justify-between gap-2 mt-2 mb-1.5">
                  <h3 className="text-sm font-semibold text-gray-200">Değersiz Hale Gelen Alacaklara İlişkin Bildirim</h3>
                  <button onClick={() => setI107Modal({ tip: 'degersiz', vkn: '', ad: '', faturaTuru: FATURA_TURLERI_TVK[0], tarih: '', no: '', tutar: '', kdv: '', degersizTarih: '' })} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">+ EKLE</button>
                </div>
                <div className="overflow-x-auto border border-blue-800/40 rounded-xl">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-blue-900/50 text-left text-gray-300">
                      <th className="px-2 py-2">Borçlunun Vergi Kimlik No / T.C. Kimlik No</th><th className="px-2 py-2">Borçlunun Adı Soyadı/Ünvanı</th>
                      <th className="px-2 py-2">Fatura Türü</th><th className="px-2 py-2">Fatura Tarihi</th><th className="px-2 py-2">Fatura No</th>
                      <th className="px-2 py-2 text-right">Değersiz Hale Gelen Alacak Tutarı</th><th className="px-2 py-2 text-right">Değersiz Hale Gelen Alacağın KDV'si</th><th className="px-2 py-2">Değersiz Hale Geldiği Tarih</th><th className="px-2 py-2"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-blue-800/30">
                      {i107Degersiz.length === 0 && <tr><td colSpan={9} className="px-2 py-4 text-center text-gray-500 italic">Gösterilecek Kayıt Yok</td></tr>}
                      {i107Degersiz.map((s, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-gray-300 tabular-nums">{s.vkn}</td>
                          <td className="px-2 py-1.5 text-gray-200">{s.ad}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.faturaTuru}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.tarih}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.no}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.tutar)}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.kdv)}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.degersizTarih}</td>
                          <td className="px-2 py-1.5"><button onClick={() => setI107Degersiz(i107Degersiz.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t-2 border-blue-700/50 bg-blue-900/30 text-gray-200 font-semibold">
                      <td colSpan={5} className="px-2 py-2">Toplam</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(dTutar)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(dKdv)}</td>
                      <td colSpan={2}></td>
                    </tr></tfoot>
                  </table>
                </div>

                <div className="flex items-center justify-between gap-2 mt-5 mb-1.5">
                  <h3 className="text-sm font-semibold text-gray-200">107 Kod Numaralı Satır Aracılığıyla İndirim Konusu Yapılan KDV Alacağının Dönemi</h3>
                  <button onClick={() => setI107Modal({ tip: 'donem', ay: 'OCAK', yil: String(yil), toplamKdv: '', indirimKdv: '' })} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">+ EKLE</button>
                </div>
                <div className="overflow-x-auto border border-blue-800/40 rounded-xl">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-blue-900/50 text-left text-gray-300">
                      <th className="px-2 py-2">Faturanın Düzenlendiği Ay</th><th className="px-2 py-2">Faturanın Düzenlendiği Yıl</th>
                      <th className="px-2 py-2 text-right">İlgili Ayda Düzenlenen Faturaların Toplam KDV Tutanı</th><th className="px-2 py-2 text-right">107 Kod Numaralı Satır Aracılığıyla İndirim Konusu Yapılan KDV Tutanı</th><th className="px-2 py-2"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-blue-800/30">
                      {i107Donem.length === 0 && <tr><td colSpan={5} className="px-2 py-4 text-center text-gray-500 italic">Gösterilecek Kayıt Yok</td></tr>}
                      {i107Donem.map((s, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-gray-200">{s.ay}</td>
                          <td className="px-2 py-1.5 text-gray-300 tabular-nums">{s.yil}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.toplamKdv)}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.indirimKdv)}</td>
                          <td className="px-2 py-1.5"><button onClick={() => setI107Donem(i107Donem.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t-2 border-blue-700/50 bg-blue-900/30 text-gray-200 font-semibold">
                      <td colSpan={2} className="px-2 py-2">Toplam</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(pToplamKdv)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(pIndirimKdv)}</td>
                      <td></td>
                    </tr></tfoot>
                  </table>
                </div>
                {kaydetBtn('indirim107')}

                {i107Modal && (() => {
                  const m = i107Modal
                  const set = (yama) => setI107Modal(x => ({ ...x, ...yama }))
                  return (
                    <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setI107Modal(null)}>
                      <div className="bg-blue-950 border border-blue-700/50 rounded-2xl shadow-2xl max-w-md w-full p-5 max-h-[92vh] overflow-auto" onClick={e => e.stopPropagation()}>
                        <h3 className="text-white font-bold text-base mb-3">{m.tip === 'degersiz' ? 'Değersiz Hale Gelen Alacak — Satır Ekle' : '107 Kodlu İndirim Dönemi — Satır Ekle'}</h3>
                        {m.tip === 'degersiz' ? (
                          <div className="space-y-2.5">
                            <label className="block text-xs text-gray-400">Borçlunun Vergi Kimlik No / T.C. Kimlik No
                              <input value={m.vkn} onChange={e => set({ vkn: e.target.value })} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm tabular-nums" />
                            </label>
                            <label className="block text-xs text-gray-400">Borçlunun Adı Soyadı/Ünvanı
                              <input value={m.ad} maxLength={100} onChange={e => set({ ad: e.target.value })} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm" />
                            </label>
                            <label className="block text-xs text-gray-400">Fatura Türü
                              <select value={m.faturaTuru} onChange={e => set({ faturaTuru: e.target.value })} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                                {FATURA_TURLERI_TVK.map(x => <option key={x}>{x}</option>)}
                              </select>
                            </label>
                            <label className="block text-xs text-gray-400">Fatura Tarihi
                              <input type="date" value={m.tarih} onChange={e => set({ tarih: e.target.value })} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm" />
                            </label>
                            <label className="block text-xs text-gray-400">Fatura No
                              <input value={m.no} maxLength={16} onChange={e => set({ no: e.target.value })} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm" />
                            </label>
                            <label className="block text-xs text-gray-400">Değersiz Hale Gelen Alacak Tutarı
                              <input type="number" step="0.01" value={m.tutar} onChange={e => set({ tutar: e.target.value })} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm text-right tabular-nums" />
                            </label>
                            <label className="block text-xs text-gray-400">Değersiz Hale Gelen Alacağın KDV'si
                              <input type="number" step="0.01" value={m.kdv} onChange={e => set({ kdv: e.target.value })} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm text-right tabular-nums" />
                            </label>
                            <label className="block text-xs text-gray-400">Değersiz Hale Geldiği Tarih
                              <input type="date" value={m.degersizTarih} onChange={e => set({ degersizTarih: e.target.value })} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm" />
                            </label>
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            <label className="block text-xs text-gray-400">Faturanın Düzenlendiği Ay
                              <select value={m.ay} onChange={e => set({ ay: e.target.value })} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                                {AYLAR.map(x => <option key={x}>{x}</option>)}
                              </select>
                            </label>
                            <label className="block text-xs text-gray-400">Faturanın Düzenlendiği Yıl
                              <input type="number" value={m.yil} onChange={e => set({ yil: e.target.value })} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm tabular-nums" />
                            </label>
                            <label className="block text-xs text-gray-400">İlgili Ayda Düzenlenen Faturaların Toplam KDV Tutanı
                              <input type="number" step="0.01" value={m.toplamKdv} onChange={e => set({ toplamKdv: e.target.value })} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm text-right tabular-nums" />
                            </label>
                            <label className="block text-xs text-gray-400">107 Kod Numaralı Satırla İndirim Konusu Yapılan KDV Tutanı
                              <input type="number" step="0.01" value={m.indirimKdv} onChange={e => set({ indirimKdv: e.target.value })} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm text-right tabular-nums" />
                            </label>
                          </div>
                        )}
                        <div className="mt-4 flex justify-end gap-2">
                          <button onClick={() => setI107Modal(null)} className="bg-red-700/80 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">VAZGEÇ</button>
                          <button
                            onClick={() => {
                              if (m.tip === 'degersiz') setI107Degersiz(l => [...l, { vkn: m.vkn, ad: m.ad, faturaTuru: m.faturaTuru, tarih: m.tarih, no: m.no, tutar: Number(m.tutar) || 0, kdv: Number(m.kdv) || 0, degersizTarih: m.degersizTarih }])
                              else setI107Donem(l => [...l, { ay: m.ay, yil: m.yil, toplamKdv: Number(m.toplamKdv) || 0, indirimKdv: Number(m.indirimKdv) || 0 }])
                              setI107Modal(null)
                            }}
                            className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">EKLE</button>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )
          })()}

          {/* ---------- TAM VE KISMİ İSTİSNALAR ---------- */}
          {aktifBolum === 'istisna' && (() => {
            const bTutar = istTablo.reduce((t, s) => t + (Number(s.bedel) || 0), 0)
            const bKdv = istTablo.reduce((t, s) => t + (Number(s.yuklenenKdv) || 0), 0)
            return (
              <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div>
                    <h2 className="text-white text-lg font-bold">Tam ve Kısmi İstisnalar</h2>
                    <h3 className="text-sm font-semibold text-gray-300 mt-1">Tam ve Kısmi İstisnalara İlişkin Bildirim</h3>
                  </div>
                  <button onClick={() => setIstModal(true)} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">+ EKLE</button>
                </div>
                <div className="overflow-x-auto border border-blue-800/40 rounded-xl">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-blue-900/50 text-left text-gray-300">
                      <th className="px-2 py-2">İstisna Türü</th><th className="px-2 py-2">Bölge</th><th className="px-2 py-2">Belge No</th>
                      <th className="px-2 py-2 text-right">Teslim Bedeli</th><th className="px-2 py-2 text-right">Tabi Olduğu Oran</th>
                      <th className="px-2 py-2">Belge Sahibinin Vergi Kimlik No</th><th className="px-2 py-2 text-right">Yüklenen KDV</th><th className="px-2 py-2"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-blue-800/30">
                      {istTablo.length === 0 && <tr><td colSpan={8} className="px-2 py-4 text-center text-gray-500 italic">Gösterilecek Kayıt Yok</td></tr>}
                      {istTablo.map((s, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-gray-200 max-w-[220px] truncate" title={s.tur}>{s.tur}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.bolge}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.belgeNo}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.bedel)}</td>
                          <td className="px-2 py-1.5 text-right text-gray-300">%{s.oran}</td>
                          <td className="px-2 py-1.5 text-gray-300 tabular-nums">{s.vkn}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.yuklenenKdv)}</td>
                          <td className="px-2 py-1.5"><button onClick={() => setIstTablo(istTablo.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t-2 border-blue-700/50 bg-blue-900/30 text-gray-200 font-semibold">
                      <td colSpan={3} className="px-2 py-2">Toplam</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(bTutar)}</td>
                      <td colSpan={2}></td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(bKdv)}</td>
                      <td></td>
                    </tr></tfoot>
                  </table>
                </div>
                {kaydetBtn('istisna')}

                {istModal && (
                  <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIstModal(false)}>
                    <div className="bg-blue-950 border border-blue-700/50 rounded-2xl shadow-2xl max-w-md w-full p-5 max-h-[92vh] overflow-auto" onClick={e => e.stopPropagation()}>
                      <h3 className="text-white font-bold text-base mb-3">Tam ve Kısmi İstisnalara İlişkin Bildirim — Satır Ekle</h3>
                      <div className="space-y-2.5">
                        <label className="block text-xs text-gray-400">İstisna Türü
                          <select value={istForm.tur} onChange={e => setIstForm(f => ({ ...f, tur: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                            {ISTISNA_TURLERI.map(x => <option key={x}>{x}</option>)}
                          </select>
                        </label>
                        <label className="block text-xs text-gray-400">Bölge
                          <select value={istForm.bolge} onChange={e => setIstForm(f => ({ ...f, bolge: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                            {ISTISNA_BOLGELERI.map(x => <option key={x}>{x}</option>)}
                          </select>
                        </label>
                        <label className="block text-xs text-gray-400">Belge No
                          <input value={istForm.belgeNo} maxLength={10} onChange={e => setIstForm(f => ({ ...f, belgeNo: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm" />
                          <span className="text-[10px] text-gray-600">{(istForm.belgeNo || '').length}/10</span>
                        </label>
                        <label className="block text-xs text-gray-400">Teslim Bedeli
                          <input type="number" step="0.01" value={istForm.bedel} onChange={e => setIstForm(f => ({ ...f, bedel: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm text-right tabular-nums" />
                        </label>
                        <label className="block text-xs text-gray-400">Tabi Olduğu Oran
                          <select value={istForm.oran} onChange={e => setIstForm(f => ({ ...f, oran: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                            {['0', ...KDV_ORAN_SECENEKLERI].map(x => <option key={x}>{x}</option>)}
                          </select>
                        </label>
                        <label className="block text-xs text-gray-400">Belge Sahibinin Vergi Kimlik No
                          <input value={istForm.vkn} onChange={e => setIstForm(f => ({ ...f, vkn: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm tabular-nums" />
                        </label>
                        <label className="block text-xs text-gray-400">Yüklenen KDV
                          <input type="number" step="0.01" value={istForm.yuklenenKdv} onChange={e => setIstForm(f => ({ ...f, yuklenenKdv: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm text-right tabular-nums" />
                        </label>
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <button onClick={() => setIstModal(false)} className="bg-red-700/80 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">VAZGEÇ</button>
                        <button onClick={() => { setIstTablo(l => [...l, { tur: istForm.tur, bolge: istForm.bolge, belgeNo: istForm.belgeNo, bedel: Number(istForm.bedel) || 0, oran: istForm.oran, vkn: istForm.vkn, yuklenenKdv: Number(istForm.yuklenenKdv) || 0 }]); setIstModal(false) }} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">EKLE</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ---------- 13/F KAPSAMINDAKİ TESLİMLER ---------- */}
          {aktifBolum === 'teslim13f' && (() => {
            const fBedel = t13fTablo.reduce((t, s) => t + (Number(s.bedel) || 0), 0)
            return (
              <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div>
                    <h2 className="text-white text-lg font-bold">13/f Kapsamındaki Teslimler</h2>
                    <h3 className="text-sm font-semibold text-gray-300 mt-1">KDV Kanununun 13/f Maddesi Kapsamında Yüklenici Firmalara Yapılan Teslim ve Hizmetlere Ait Liste</h3>
                  </div>
                  <button onClick={() => setT13fModal(true)} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">+ EKLE</button>
                </div>
                <div className="overflow-x-auto border border-blue-800/40 rounded-xl">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-blue-900/50 text-left text-gray-300">
                      <th className="px-2 py-2">Kuruluş</th>
                      <th className="px-2 py-2">İstisna Belgesinin Tarihi</th><th className="px-2 py-2">Belge Sayısı</th>
                      <th className="px-2 py-2">Onaylanan Listenin Tarihi</th><th className="px-2 py-2">Listenin Sayısı</th>
                      <th className="px-2 py-2">Firma Ünvan</th><th className="px-2 py-2">Firma VKN</th><th className="px-2 py-2">Sıra No</th>
                      <th className="px-2 py-2">Cinsi</th><th className="px-2 py-2">Ölçü</th><th className="px-2 py-2 text-right">Miktar</th>
                      <th className="px-2 py-2">Fatura Türü</th><th className="px-2 py-2">Fatura Tarihi</th><th className="px-2 py-2">Fatura No</th>
                      <th className="px-2 py-2 text-right">Fatura Bedeli</th><th className="px-2 py-2"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-blue-800/30">
                      {t13fTablo.length === 0 && <tr><td colSpan={16} className="px-2 py-4 text-center text-gray-500 italic">Gösterilecek Kayıt Yok</td></tr>}
                      {t13fTablo.map((s, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-gray-200 max-w-[150px] truncate" title={s.kurulus}>{s.kurulus}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.belgeTarih}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.belgeSayi}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.listeTarih}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.listeSayi}</td>
                          <td className="px-2 py-1.5 text-gray-200 max-w-[180px] truncate" title={s.firmaAd}>{s.firmaAd}</td>
                          <td className="px-2 py-1.5 text-gray-300 tabular-nums">{s.firmaVkn}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.siraNo}</td>
                          <td className="px-2 py-1.5 text-gray-300 max-w-[140px] truncate" title={s.cinsi}>{s.cinsi}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.olcu}</td>
                          <td className="px-2 py-1.5 text-right text-gray-200 tabular-nums">{s.miktar}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.faturaTuru}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.faturaTarih}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.faturaNo}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.bedel)}</td>
                          <td className="px-2 py-1.5"><button onClick={() => setT13fTablo(t13fTablo.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t-2 border-blue-700/50 bg-blue-900/30 text-gray-200 font-semibold">
                      <td colSpan={14} className="px-2 py-2">Toplam</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(fBedel)}</td>
                      <td></td>
                    </tr></tfoot>
                  </table>
                </div>
                {kaydetBtn('teslim13f')}

                {t13fModal && (
                  <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setT13fModal(false)}>
                    <div className="bg-blue-950 border border-blue-700/50 rounded-2xl shadow-2xl max-w-md w-full p-5 max-h-[92vh] overflow-auto" onClick={e => e.stopPropagation()}>
                      <h3 className="text-white font-bold text-base mb-3">13/f Kapsamındaki Teslimler — Satır Ekle</h3>
                      <div className="space-y-2.5">
                        <label className="block text-xs text-gray-400">İstisna Belgesini Düzenleyen Ulusal Güvenlik Kuruluşu
                          <select value={t13fForm.kurulus} onChange={e => setT13fForm(f => ({ ...f, kurulus: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                            {GUVENLIK_KURULUSLARI.map(x => <option key={x}>{x}</option>)}
                          </select>
                        </label>
                        <label className="block text-xs text-gray-400">Ulusal Güvenlik Kuruluşu Tarafından Verilen İstisna Belgesinin Tarihi
                          <input type="date" value={t13fForm.belgeTarih} onChange={e => setT13fForm(f => ({ ...f, belgeTarih: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm" />
                        </label>
                        <label className="block text-xs text-gray-400">İstisna Belgesinin Sayısı
                          <input value={t13fForm.belgeSayi} maxLength={15} onChange={e => setT13fForm(f => ({ ...f, belgeSayi: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm" />
                          <span className="text-[10px] text-gray-600">{(t13fForm.belgeSayi || '').length}/15</span>
                        </label>
                        <label className="block text-xs text-gray-400">Ulusal Güvenlik Kuruluşu Tarafından Onaylanan Listenin Tarihi
                          <input type="date" value={t13fForm.listeTarih} onChange={e => setT13fForm(f => ({ ...f, listeTarih: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm" />
                        </label>
                        <label className="block text-xs text-gray-400">Onaylanan Listenin Sayısı
                          <input value={t13fForm.listeSayi} maxLength={15} onChange={e => setT13fForm(f => ({ ...f, listeSayi: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm" />
                          <span className="text-[10px] text-gray-600">{(t13fForm.listeSayi || '').length}/15</span>
                        </label>
                        <label className="block text-xs text-gray-400">Alıcı Firmanın Adı/Ünvanı
                          <input value={t13fForm.firmaAd} maxLength={100} onChange={e => setT13fForm(f => ({ ...f, firmaAd: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm" />
                          <span className="text-[10px] text-gray-600">{(t13fForm.firmaAd || '').length}/100</span>
                        </label>
                        <label className="block text-xs text-gray-400">Alıcı Firmanın Vergi Kimlik No
                          <input value={t13fForm.firmaVkn} onChange={e => setT13fForm(f => ({ ...f, firmaVkn: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm tabular-nums" />
                        </label>
                        <label className="block text-xs text-gray-400">Malın/Hizmetin Liste Sıra No
                          <input value={t13fForm.siraNo} maxLength={10} onChange={e => setT13fForm(f => ({ ...f, siraNo: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm tabular-nums" />
                          <span className="text-[10px] text-gray-600">{(t13fForm.siraNo || '').length}/10</span>
                        </label>
                        <label className="block text-xs text-gray-400">Malın/Hizmetin Cinsi
                          <input value={t13fForm.cinsi} maxLength={100} onChange={e => setT13fForm(f => ({ ...f, cinsi: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm" />
                          <span className="text-[10px] text-gray-600">{(t13fForm.cinsi || '').length}/100</span>
                        </label>
                        <label className="block text-xs text-gray-400">Malın/Hizmetin Ölçü Birimi
                          <select value={t13fForm.olcu} onChange={e => setT13fForm(f => ({ ...f, olcu: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                            {OLCU_BIRIMLERI.map(x => <option key={x}>{x}</option>)}
                          </select>
                        </label>
                        <label className="block text-xs text-gray-400">Malın/Hizmetin Miktarı
                          <input type="number" step="0.01" value={t13fForm.miktar} onChange={e => setT13fForm(f => ({ ...f, miktar: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm text-right tabular-nums" />
                        </label>
                        <label className="block text-xs text-gray-400">Fatura Türü
                          <select value={t13fForm.faturaTuru} onChange={e => setT13fForm(f => ({ ...f, faturaTuru: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                            {FATURA_TURLERI_TVK.map(x => <option key={x}>{x}</option>)}
                          </select>
                        </label>
                        <label className="block text-xs text-gray-400">Fatura Tarihi
                          <input type="date" value={t13fForm.faturaTarih} onChange={e => setT13fForm(f => ({ ...f, faturaTarih: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm" />
                        </label>
                        <label className="block text-xs text-gray-400">Fatura Seri / Sıra No
                          <input value={t13fForm.faturaNo} maxLength={16} onChange={e => setT13fForm(f => ({ ...f, faturaNo: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm" />
                          <span className="text-[10px] text-gray-600">{(t13fForm.faturaNo || '').length}/16</span>
                        </label>
                        <label className="block text-xs text-gray-400">Fatura Bedeli
                          <input type="number" step="0.01" value={t13fForm.bedel} onChange={e => setT13fForm(f => ({ ...f, bedel: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm text-right tabular-nums" />
                        </label>
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <button onClick={() => setT13fModal(false)} className="bg-red-700/80 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">VAZGEÇ</button>
                        <button
                          onClick={() => { setT13fTablo(l => [...l, { ...t13fForm, belgeSayi: t13fForm.belgeSayi, listeSayi: t13fForm.listeSayi, siraNo: t13fForm.siraNo, miktar: Number(t13fForm.miktar) || 0, bedel: Number(t13fForm.bedel) || 0 }]); setT13fModal(false) }}
                          className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">EKLE</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ---------- 13/I KAPSAMINDAKİ TESLİMLER ---------- */}
          {aktifBolum === 'teslim13i' && (() => {
            const iToplam = t13iTablo.reduce((t, s) => t + (Number(s.tutar) || 0), 0)
            const iKdv = t13iTablo.reduce((t, s) => t + (Number(s.yuklenenKdv) || 0), 0)
            const inp = (label, key, opts = {}) => (
              <label key={key} className="block text-xs text-gray-400">{label}
                {opts.sec
                  ? <select value={t13iForm[key]} onChange={e => setT13iForm(f => ({ ...f, [key]: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">{opts.sec.map(x => <option key={x}>{x}</option>)}</select>
                  : <input type={opts.type || 'text'} maxLength={opts.max} value={t13iForm[key]} onChange={e => setT13iForm(f => ({ ...f, [key]: e.target.value }))} className={`mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm ${opts.num ? 'text-right tabular-nums' : ''}`} />}
                {opts.max ? <span className="text-[10px] text-gray-600">{(t13iForm[key] || '').length}/{opts.max}</span> : null}
              </label>
            )
            return (
              <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div>
                    <h2 className="text-white text-lg font-bold">13/i Kapsamındaki Teslimler</h2>
                    <h3 className="text-sm font-semibold text-gray-300 mt-1">3065 Sayılı Kanunun 13/i Maddesindeki İstisna Kapsamında Yapılan Teslimlere İlişkin Bildirim İşlemleri</h3>
                  </div>
                  <button onClick={() => setT13iModal(true)} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">+ EKLE</button>
                </div>
                <div className="overflow-x-auto border border-blue-800/40 rounded-xl">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-blue-900/50 text-left text-gray-300">
                      <th className="px-2 py-2">Alıcının Vergi Kimlik Türü</th><th className="px-2 py-2">Alıcının Kimlik No</th><th className="px-2 py-2">Adı Soyadı/Ünvanı</th>
                      <th className="px-2 py-2">Uyruğu</th><th className="px-2 py-2">Çalışma/Oturma İzni Ülkesi</th><th className="px-2 py-2">Kanuni/Merkez/İş Yeri Ülkesi</th>
                      <th className="px-2 py-2">Taşınmazın İli/İlçesi</th><th className="px-2 py-2">Taşınmazın Niteliği</th><th className="px-2 py-2">Ada No</th><th className="px-2 py-2">Parsel No</th>
                      <th className="px-2 py-2">Ulusal Adres Veritabanı No</th><th className="px-2 py-2">Zemin Katman No</th>
                      <th className="px-2 py-2">Fatura Türü</th><th className="px-2 py-2">Fatura Tarihi</th><th className="px-2 py-2">Fatura No</th>
                      <th className="px-2 py-2 text-right">Tutar</th><th className="px-2 py-2 text-right">Yüklenen KDV</th><th className="px-2 py-2"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-blue-800/30">
                      {t13iTablo.length === 0 && <tr><td colSpan={18} className="px-2 py-4 text-center text-gray-500 italic">Gösterilecek Kayıt Yok</td></tr>}
                      {t13iTablo.map((s, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-gray-300">{s.kimlikTuru}</td>
                          <td className="px-2 py-1.5 text-gray-300 tabular-nums">{s.kimlikNo}</td>
                          <td className="px-2 py-1.5 text-gray-200 max-w-[160px] truncate" title={s.ad}>{s.ad}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.uyruk}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.calismaUlke}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.merkezUlke}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.ili}{s.ilcesi ? ` / ${s.ilcesi}` : ''}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.niteligi}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.adaNo}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.parselNo}</td>
                          <td className="px-2 py-1.5 text-gray-300 tabular-nums">{s.ulusalNo}</td>
                          <td className="px-2 py-1.5 text-gray-300 tabular-nums">{s.zeminNo}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.faturaTuru}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.faturaTarih}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.faturaNo}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.tutar)}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.yuklenenKdv)}</td>
                          <td className="px-2 py-1.5"><button onClick={() => setT13iTablo(t13iTablo.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t-2 border-blue-700/50 bg-blue-900/30 text-gray-200 font-semibold">
                      <td colSpan={15} className="px-2 py-2">Toplam</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(iToplam)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(iKdv)}</td>
                      <td></td>
                    </tr></tfoot>
                  </table>
                </div>
                {kaydetBtn('teslim13i')}

                {t13iModal && (
                  <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setT13iModal(false)}>
                    <div className="bg-blue-950 border border-blue-700/50 rounded-2xl shadow-2xl max-w-md w-full p-5 max-h-[92vh] overflow-auto" onClick={e => e.stopPropagation()}>
                      <h3 className="text-white font-bold text-base mb-3">13/i Kapsamındaki Teslimler — Satır Ekle</h3>
                      <div className="space-y-2.5">
                        {inp('Alıcının Kimlik No Türü', 'kimlikTuru', { sec: KIMLIK_TURLERI })}
                        {inp('Alıcının Kimlik No', 'kimlikNo')}
                        {inp('Alıcının Adı Soyadı/Ünvanı', 'ad', { max: 100 })}
                        {inp('Alıcının Uyruğu', 'uyruk', { sec: ULKELER })}
                        {inp('Alıcının Çalışma veya Oturma İzninin Bulunduğu Ülke', 'calismaUlke', { sec: ULKELER })}
                        {inp('Alıcının Kanuni/Merkez/İş Merkezinin Bulunduğu Ülke', 'merkezUlke', { sec: ULKELER })}
                        {inp('Taşınmazın İli', 'ili', { sec: IL_ADLARI })}
                        {inp('Taşınmazın İlçesi', 'ilcesi')}
                        {inp('Taşınmazın Niteliği', 'niteligi', { sec: TASINMAZ_NITELIKLERI })}
                        {inp('Taşınmazın Ada No', 'adaNo')}
                        {inp('Taşınmazın Parsel No', 'parselNo')}
                        {inp('Taşınmazın Ulusal Adres Veritabanı No', 'ulusalNo')}
                        {inp('Taşınmazın Zemin Katman No', 'zeminNo')}
                        {inp('Fatura Türü', 'faturaTuru', { sec: FATURA_TURLERI_TVK })}
                        {inp('Satış Faturasının Tarihi', 'faturaTarih', { type: 'date' })}
                        {inp('Satış Faturasının Seri / Sıra No', 'faturaNo', { max: 16 })}
                        {inp('Satış Faturasının Tutarı', 'tutar', { type: 'number', num: true })}
                        {inp('Yüklenen KDV', 'yuklenenKdv', { type: 'number', num: true })}
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <button onClick={() => setT13iModal(false)} className="bg-red-700/80 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">VAZGEÇ</button>
                        <button onClick={() => { setT13iTablo(l => [...l, { ...t13iForm, tutar: Number(t13iForm.tutar) || 0, yuklenenKdv: Number(t13iForm.yuklenenKdv) || 0 }]); setT13iModal(false) }} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">EKLE</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ---------- YENİLENMİŞ CEP TELEFONU ---------- */}
          {aktifBolum === 'cep' && (() => {
            const cAlis = cepTablo.reduce((t, s) => t + (Number(s.alisBedel) || 0), 0)
            const cAlisKdv = cepTablo.reduce((t, s) => t + (Number(s.alisKdv) || 0), 0)
            const cSatis = cepTablo.reduce((t, s) => t + (Number(s.satisBedel) || 0), 0)
            const cSatisKdv = cepTablo.reduce((t, s) => t + (Number(s.satisKdv) || 0), 0)
            const inp = (label, key, opts = {}) => (
              <label key={key} className="block text-xs text-gray-400">{label}
                {opts.sec
                  ? <select value={cepForm[key]} onChange={e => setCepForm(f => ({ ...f, [key]: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">{opts.sec.map(x => <option key={x}>{x}</option>)}</select>
                  : <input type={opts.type || 'text'} maxLength={opts.max} value={cepForm[key]} onChange={e => setCepForm(f => ({ ...f, [key]: e.target.value }))} className={`mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm ${opts.num ? 'text-right tabular-nums' : ''}`} />}
                {opts.max ? <span className="text-[10px] text-gray-600">{(cepForm[key] || '').length}/{opts.max}</span> : null}
              </label>
            )
            return (
              <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div>
                    <h2 className="text-white text-lg font-bold">Yenilenmiş Cep Telefonu</h2>
                    <h3 className="text-sm font-semibold text-gray-300 mt-1">Yenilenmiş Cep Telefonu İşlemleri</h3>
                  </div>
                  <button onClick={() => setCepModal(true)} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">+ EKLE</button>
                </div>
                <div className="overflow-x-auto border border-blue-800/40 rounded-xl">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-blue-900/50 text-left text-gray-300">
                      <th className="px-2 py-2">Alış Belgesinin Türü</th><th className="px-2 py-2">Alış Belgesinin Tarihi</th><th className="px-2 py-2">Seri / Sıra No</th>
                      <th className="px-2 py-2">Satıcı Kimlik Türü</th><th className="px-2 py-2">Satıcı Kimlik No</th><th className="px-2 py-2">Satıcı Adı Soyadı/Ünvanı</th>
                      <th className="px-2 py-2 text-right">Alış Bedeli</th><th className="px-2 py-2 text-right">Ödenen KDV</th>
                      <th className="px-2 py-2">Marka</th><th className="px-2 py-2">Model</th><th className="px-2 py-2">IMEI No</th>
                      <th className="px-2 py-2">Satış Belgesinin Türü</th><th className="px-2 py-2">Satış Tarihi</th><th className="px-2 py-2">Seri / Sıra No</th>
                      <th className="px-2 py-2">Alıcı Kimlik Türü</th><th className="px-2 py-2">Alıcı Kimlik No</th><th className="px-2 py-2">Alıcı Adı Soyadı/Ünvanı</th>
                      <th className="px-2 py-2 text-right">Satış Bedeli</th><th className="px-2 py-2 text-right">Hesaplanan KDV</th><th className="px-2 py-2"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-blue-800/30">
                      {cepTablo.length === 0 && <tr><td colSpan={20} className="px-2 py-4 text-center text-gray-500 italic">Gösterilecek Kayıt Yok</td></tr>}
                      {cepTablo.map((s, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-gray-300">{s.alisTuru}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.alisTarih}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.alisNo}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.saticiTuru}</td>
                          <td className="px-2 py-1.5 text-gray-300 tabular-nums">{s.saticiNo}</td>
                          <td className="px-2 py-1.5 text-gray-200 max-w-[150px] truncate" title={s.saticiAd}>{s.saticiAd}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.alisBedel)}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.alisKdv)}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.marka}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.model}</td>
                          <td className="px-2 py-1.5 text-gray-300 tabular-nums">{s.imei}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.satisTuru}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.satisTarih}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.satisNo}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.aliciTuru}</td>
                          <td className="px-2 py-1.5 text-gray-300 tabular-nums">{s.aliciNo}</td>
                          <td className="px-2 py-1.5 text-gray-200 max-w-[150px] truncate" title={s.aliciAd}>{s.aliciAd}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.satisBedel)}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.satisKdv)}</td>
                          <td className="px-2 py-1.5"><button onClick={() => setCepTablo(cepTablo.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t-2 border-blue-700/50 bg-blue-900/30 text-gray-200 font-semibold">
                      <td colSpan={6} className="px-2 py-2">Toplam</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(cAlis)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(cAlisKdv)}</td>
                      <td colSpan={10}></td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(cSatis)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(cSatisKdv)}</td>
                      <td></td>
                    </tr></tfoot>
                  </table>
                </div>
                {kaydetBtn('cep')}

                {cepModal && (() => {
                  const satisKdv = Math.round((Number(cepForm.satisBedel) || 0) * 0.2 * 100) / 100
                  return (
                    <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setCepModal(false)}>
                      <div className="bg-blue-950 border border-blue-700/50 rounded-2xl shadow-2xl max-w-md w-full p-5 max-h-[92vh] overflow-auto" onClick={e => e.stopPropagation()}>
                        <h3 className="text-white font-bold text-base mb-3">Yenilenmiş Cep Telefonu İşlemleri — Satır Ekle</h3>
                        <div className="space-y-2.5">
                          {inp('Alış Belgesinin Türü', 'alisTuru', { sec: FATURA_TURLERI_TVK })}
                          {inp('Alış Belgesinin Tarihi', 'alisTarih', { type: 'date' })}
                          {inp('Alış Belgesinin Seri / Sıra No', 'alisNo', { max: 16 })}
                          {inp('Satıcı Kimlik Türü', 'saticiTuru', { sec: KIMLIK_TURLERI })}
                          {inp('Satıcı Kimlik No', 'saticiNo')}
                          {inp('Satıcı Adı Soyadı/Ünvanı', 'saticiAd', { max: 100 })}
                          {inp('Alış Bedeli', 'alisBedel', { type: 'number', num: true })}
                          {inp('Alış Belgesinde Ödenen KDV', 'alisKdv', { type: 'number', num: true })}
                          {inp('Marka', 'marka', { max: 100 })}
                          {inp('Model', 'model', { max: 100 })}
                          {inp('IMEI No', 'imei')}
                          {inp('Satış Belgesinin Türü', 'satisTuru', { sec: FATURA_TURLERI_TVK })}
                          {inp('Satış Belgesinin Tarihi', 'satisTarih', { type: 'date' })}
                          {inp('Satış Belgesinin Seri/Sıra No', 'satisNo', { max: 16 })}
                          {inp('Alıcı Kimlik Türü', 'aliciTuru', { sec: KIMLIK_TURLERI })}
                          {inp('Alıcı Kimlik No', 'aliciNo')}
                          {inp('Alıcı Adı Soyadı/Ünvanı', 'aliciAd', { max: 100 })}
                          {inp('Satış Bedeli', 'satisBedel', { type: 'number', num: true })}
                          <div className="text-xs text-gray-400 bg-blue-900/40 border border-blue-800/40 rounded-lg px-3 py-2">Satış Belgesinde Hesaplanan KDV (%20)
                            <span className="float-right text-white tabular-nums">{tl(satisKdv)}</span>
                          </div>
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                          <button onClick={() => setCepModal(false)} className="bg-red-700/80 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">VAZGEÇ</button>
                          <button onClick={() => { setCepTablo(l => [...l, { ...cepForm, alisBedel: Number(cepForm.alisBedel) || 0, alisKdv: Number(cepForm.alisKdv) || 0, satisBedel: Number(cepForm.satisBedel) || 0, satisKdv }]); setCepModal(false) }} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">EKLE</button>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )
          })()}

          {/* ---------- TEKNOLOJİ GELİŞTİRME BÖLGELERİ ---------- */}
          {aktifBolum === 'teknoloji' && (() => {
            const gBedel = tgbTablo.reduce((t, s) => t + (Number(s.bedel) || 0), 0)
            const gKdv = tgbTablo.reduce((t, s) => t + (Number(s.kdv) || 0), 0)
            return (
              <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div>
                    <h2 className="text-white text-lg font-bold">Teknoloji Geliştirme Bölgeleri</h2>
                    <h3 className="text-sm font-semibold text-gray-300 mt-1">Teknopark Kapsamındaki Tasarım/Hizmet Bildirimi</h3>
                  </div>
                  <button onClick={() => setTgbModal(true)} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">+ EKLE</button>
                </div>
                <div className="overflow-x-auto border border-blue-800/40 rounded-xl">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-blue-900/50 text-left text-gray-300">
                      <th className="px-2 py-2">Teknopark Kapsamındaki İlçe</th><th className="px-2 py-2">Projenin Başlangıç Tarihi</th><th className="px-2 py-2">Proje Belge No</th>
                      <th className="px-2 py-2 text-right">Tasarım/Hizmet Bedeli</th><th className="px-2 py-2 text-right">Yüklenen KDV</th><th className="px-2 py-2"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-blue-800/30">
                      {tgbTablo.length === 0 && <tr><td colSpan={6} className="px-2 py-4 text-center text-gray-500 italic">Gösterilecek Kayıt Yok</td></tr>}
                      {tgbTablo.map((s, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-gray-200">{s.ilce}{s.il ? <span className="text-gray-500"> ({s.il})</span> : ''}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.baslangic}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.belgeNo}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.bedel)}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.kdv)}</td>
                          <td className="px-2 py-1.5"><button onClick={() => setTgbTablo(tgbTablo.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t-2 border-blue-700/50 bg-blue-900/30 text-gray-200 font-semibold">
                      <td colSpan={3} className="px-2 py-2">Toplam</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(gBedel)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(gKdv)}</td>
                      <td></td>
                    </tr></tfoot>
                  </table>
                </div>
                {kaydetBtn('teknoloji')}

                {tgbModal && (
                  <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setTgbModal(false)}>
                    <div className="bg-blue-950 border border-blue-700/50 rounded-2xl shadow-2xl max-w-md w-full p-5 max-h-[92vh] overflow-auto" onClick={e => e.stopPropagation()}>
                      <h3 className="text-white font-bold text-base mb-3">Teknoloji Geliştirme Bölgeleri — Satır Ekle</h3>
                      <div className="space-y-2.5">
                        <label className="block text-xs text-gray-400">Teknopark Kapsamındaki İl
                          <select value={tgbForm.il} onChange={e => setTgbForm(f => ({ ...f, il: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                            {IL_ADLARI.map(x => <option key={x}>{x}</option>)}
                          </select>
                        </label>
                        <label className="block text-xs text-gray-400">Teknopark Kapsamındaki İlçe
                          <input value={tgbForm.ilce} onChange={e => setTgbForm(f => ({ ...f, ilce: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm" />
                        </label>
                        <label className="block text-xs text-gray-400">Projenin Başlangıç Tarihi
                          <input type="date" value={tgbForm.baslangic} onChange={e => setTgbForm(f => ({ ...f, baslangic: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm" />
                        </label>
                        <label className="block text-xs text-gray-400">Proje Belge No
                          <input value={tgbForm.belgeNo} maxLength={10} onChange={e => setTgbForm(f => ({ ...f, belgeNo: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm" />
                          <span className="text-[10px] text-gray-600">{(tgbForm.belgeNo || '').length}/10</span>
                        </label>
                        <label className="block text-xs text-gray-400">Tasarım Hizmet Bedeli
                          <input type="number" step="0.01" value={tgbForm.bedel} onChange={e => setTgbForm(f => ({ ...f, bedel: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm text-right tabular-nums" />
                        </label>
                        <label className="block text-xs text-gray-400">Yüklenen KDV
                          <input type="number" step="0.01" value={tgbForm.kdv} onChange={e => setTgbForm(f => ({ ...f, kdv: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm text-right tabular-nums" />
                        </label>
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <button onClick={() => setTgbModal(false)} className="bg-red-700/80 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">VAZGEÇ</button>
                        <button onClick={() => { setTgbTablo(l => [...l, { ...tgbForm, bedel: Number(tgbForm.bedel) || 0, kdv: Number(tgbForm.kdv) || 0 }]); setTgbModal(false) }} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">EKLE</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ---------- THK KATILMA PAYI ---------- */}
          {aktifBolum === 'thk' && (() => {
            const tAdet = thkTablo.reduce((t, s) => t + (Number(s.adet) || 0), 0)
            const tToplam = thkTablo.reduce((t, s) => t + (Number(s.toplam) || 0), 0)
            return (
              <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div>
                    <h2 className="text-white text-lg font-bold">THK Katılma Payı</h2>
                    <h3 className="text-sm font-semibold text-gray-300 mt-1">Türk Hava Kuvvetlerinin Güçlendirilmesine Katılma Payı Bildirimi</h3>
                  </div>
                  <button onClick={() => setThkModal(true)} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">+ EKLE</button>
                </div>
                <div className="overflow-x-auto border border-blue-800/40 rounded-xl">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-blue-900/50 text-left text-gray-300">
                      <th className="px-2 py-2 text-right">Satılan Bilet Adedi</th><th className="px-2 py-2 text-right">Bilet Başına Pay Tutarı (TL)</th><th className="px-2 py-2 text-right">Toplam Pay Tutarı (TL)</th><th className="px-2 py-2"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-blue-800/30">
                      {thkTablo.length === 0 && <tr><td colSpan={4} className="px-2 py-4 text-center text-gray-500 italic">Gösterilecek Kayıt Yok</td></tr>}
                      {thkTablo.map((s, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{s.adet}</td>
                          <td className="px-2 py-1.5 text-right text-gray-300 tabular-nums">{tl(s.birimPay)}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.toplam)}</td>
                          <td className="px-2 py-1.5"><button onClick={() => setThkTablo(thkTablo.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t-2 border-blue-700/50 bg-blue-900/30 text-gray-200 font-semibold">
                      <td className="px-2 py-2 text-right tabular-nums">{tAdet}</td>
                      <td></td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(tToplam)}</td>
                      <td></td>
                    </tr></tfoot>
                  </table>
                </div>
                {kaydetBtn('thk')}

                {thkModal && (() => {
                  const toplam = Math.round((Number(thkForm.adet) || 0) * (Number(thkForm.birimPay) || 0) * 100) / 100
                  return (
                    <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setThkModal(false)}>
                      <div className="bg-blue-950 border border-blue-700/50 rounded-2xl shadow-2xl max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
                        <h3 className="text-white font-bold text-base mb-3">Türk Hava Kuvvetlerinin Güçlendirilmesine Katılma Payı Bildirimi — Satır Ekle</h3>
                        <div className="space-y-2.5">
                          <label className="block text-xs text-gray-400">Satılan Bilet Adedi
                            <input type="number" value={thkForm.adet} onChange={e => setThkForm(f => ({ ...f, adet: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm text-right tabular-nums" />
                          </label>
                          <label className="block text-xs text-gray-400">Bilet Başına Pay Tutarı (TL)
                            <input type="number" step="0.01" value={thkForm.birimPay} onChange={e => setThkForm(f => ({ ...f, birimPay: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm text-right tabular-nums" />
                          </label>
                          <div className="text-xs text-gray-400 bg-blue-900/40 border border-blue-800/40 rounded-lg px-3 py-2">Toplam Pay Tutarı (TL)
                            <span className="float-right text-white tabular-nums">{tl(toplam)}</span>
                          </div>
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                          <button onClick={() => setThkModal(false)} className="bg-red-700/80 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">VAZGEÇ</button>
                          <button onClick={() => { setThkTablo(l => [...l, { adet: Number(thkForm.adet) || 0, birimPay: Number(thkForm.birimPay) || 0, toplam }]); setThkModal(false) }} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">EKLE</button>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )
          })()}

          {/* ---------- SORUMLU SIFATIYLA ÖDENEN KDV ---------- */}
          {aktifBolum === 'sorumlu' && (() => {
            const sToplam = sorTablo.reduce((t, s) => t + (Number(s.tutar) || 0), 0)
            return (
              <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div>
                    <h2 className="text-white text-lg font-bold">Sorumlu Sıfatıyla Ödenen KDV</h2>
                    <h3 className="text-sm font-semibold text-gray-300 mt-1">Sorumlu Sıfatıyla Ödenen KDV'ye İlişkin Bildirim</h3>
                  </div>
                  <button onClick={() => setSorModal(true)} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">+ EKLE</button>
                </div>
                <div className="overflow-x-auto border border-blue-800/40 rounded-xl">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-blue-900/50 text-left text-gray-300">
                      <th className="px-2 py-2">Ödeme Türü</th><th className="px-2 py-2">Vergilendirme Dönemi</th><th className="px-2 py-2">Ödeme Tarihi</th>
                      <th className="px-2 py-2 text-right">Tutar</th><th className="px-2 py-2">Belge No</th><th className="px-2 py-2">İade Dosya No</th><th className="px-2 py-2"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-blue-800/30">
                      {sorTablo.length === 0 && <tr><td colSpan={7} className="px-2 py-4 text-center text-gray-500 italic">Gösterilecek Kayıt Yok</td></tr>}
                      {sorTablo.map((s, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-gray-200 max-w-[240px] truncate" title={s.odemeTuru}>{s.odemeTuru}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.ay} {s.yil}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.odemeTarih}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.tutar)}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.belgeNo}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.iadeNo}</td>
                          <td className="px-2 py-1.5"><button onClick={() => setSorTablo(sorTablo.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t-2 border-blue-700/50 bg-blue-900/30 text-gray-200 font-semibold">
                      <td colSpan={3} className="px-2 py-2">Toplam</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(sToplam)}</td>
                      <td colSpan={3}></td>
                    </tr></tfoot>
                  </table>
                </div>
                {kaydetBtn('sorumlu')}

                {sorModal && (
                  <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSorModal(false)}>
                    <div className="bg-blue-950 border border-blue-700/50 rounded-2xl shadow-2xl max-w-md w-full p-5 max-h-[92vh] overflow-auto" onClick={e => e.stopPropagation()}>
                      <h3 className="text-white font-bold text-base mb-3">Sorumlu Sıfatıyla Ödenen KDV'ye İlişkin Bildirim — Satır Ekle</h3>
                      <div className="space-y-2.5">
                        <label className="block text-xs text-gray-400">Ödeme Türü
                          <select value={sorForm.odemeTuru} onChange={e => setSorForm(f => ({ ...f, odemeTuru: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                            {SORUMLU_ODEME_TURLERI.map(x => <option key={x}>{x}</option>)}
                          </select>
                        </label>
                        <div className="grid grid-cols-2 gap-2.5">
                          <label className="block text-xs text-gray-400">Vergilendirme Dönemi — Yıl
                            <input type="number" value={sorForm.yil} onChange={e => setSorForm(f => ({ ...f, yil: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm tabular-nums" />
                          </label>
                          <label className="block text-xs text-gray-400">Ay
                            <select value={sorForm.ay} onChange={e => setSorForm(f => ({ ...f, ay: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                              {AYLAR.map(x => <option key={x}>{x}</option>)}
                            </select>
                          </label>
                        </div>
                        <label className="block text-xs text-gray-400">Ödeme Tarihi
                          <input type="date" value={sorForm.odemeTarih} onChange={e => setSorForm(f => ({ ...f, odemeTarih: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm" />
                        </label>
                        <label className="block text-xs text-gray-400">Tutar
                          <input type="number" step="0.01" value={sorForm.tutar} onChange={e => setSorForm(f => ({ ...f, tutar: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm text-right tabular-nums" />
                        </label>
                        <label className="block text-xs text-gray-400">Belge No
                          <input value={sorForm.belgeNo} onChange={e => setSorForm(f => ({ ...f, belgeNo: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm" />
                        </label>
                        <label className="block text-xs text-gray-400">İade Dosya No
                          <input value={sorForm.iadeNo} onChange={e => setSorForm(f => ({ ...f, iadeNo: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm" />
                        </label>
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <button onClick={() => setSorModal(false)} className="bg-red-700/80 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">VAZGEÇ</button>
                        <button onClick={() => { setSorTablo(l => [...l, { ...sorForm, tutar: Number(sorForm.tutar) || 0 }]); setSorModal(false) }} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">EKLE</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ---------- YATIRIM TEŞVİK BELGESİ KAPSAMINDAKİ İSTİSNA ---------- */}
          {aktifBolum === 'tesvik' && (() => {
            const yTutar = ytbTablo.reduce((t, s) => t + (Number(s.tutar) || 0), 0)
            const inp = (label, key, opts = {}) => (
              <label key={key} className="block text-xs text-gray-400">{label}
                {opts.sec
                  ? <select value={ytbForm[key]} onChange={e => setYtbForm(f => ({ ...f, [key]: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">{opts.sec.map(x => <option key={x}>{x}</option>)}</select>
                  : <input type={opts.type || 'text'} maxLength={opts.max} value={ytbForm[key]} onChange={e => setYtbForm(f => ({ ...f, [key]: e.target.value }))} className={`mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm ${opts.num ? 'text-right tabular-nums' : ''}`} />}
                {opts.max ? <span className="text-[10px] text-gray-600">{(ytbForm[key] || '').length}/{opts.max}</span> : null}
              </label>
            )
            return (
              <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div>
                    <h2 className="text-white text-lg font-bold">Yatırım Teşvik Belgesi Kapsamındaki İstisna</h2>
                    <h3 className="text-sm font-semibold text-gray-300 mt-1">Yatırım Teşvik Belgesi Kapsamındaki Makine Teçhizat İstisnası Bildirimi (Satıcılar için)</h3>
                  </div>
                  <button onClick={() => setYtbModal(true)} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">+ EKLE</button>
                </div>
                <div className="overflow-x-auto border border-blue-800/40 rounded-xl">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-blue-900/50 text-left text-gray-300">
                      <th className="px-2 py-2">Alıcının Adı Soyadı/Ünvanı</th><th className="px-2 py-2">Alıcının VKN / T.C. Kimlik No</th><th className="px-2 py-2">Alıcının Vergi Dairesi</th>
                      <th className="px-2 py-2">YTB Seri No</th><th className="px-2 py-2">YTB Sayısı</th><th className="px-2 py-2">Liste Sıra No</th>
                      <th className="px-2 py-2">YTB Tarihi</th><th className="px-2 py-2">Satılan Malın Cinsi</th><th className="px-2 py-2">Ölçü Birimi</th>
                      <th className="px-2 py-2 text-right">Miktar</th><th className="px-2 py-2 text-right">Satılan Malın Tutarı (TL)</th>
                      <th className="px-2 py-2">Fatura Türü</th><th className="px-2 py-2">Fatura Tarihi</th><th className="px-2 py-2">Fatura No</th><th className="px-2 py-2">Faturayı Düzenleyen</th><th className="px-2 py-2"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-blue-800/30">
                      {ytbTablo.length === 0 && <tr><td colSpan={16} className="px-2 py-4 text-center text-gray-500 italic">Gösterilecek Kayıt Yok</td></tr>}
                      {ytbTablo.map((s, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-gray-200 max-w-[160px] truncate" title={s.ad}>{s.ad}</td>
                          <td className="px-2 py-1.5 text-gray-300 tabular-nums">{s.kimlikNo}</td>
                          <td className="px-2 py-1.5 text-gray-300 max-w-[140px] truncate" title={s.vd}>{s.vd}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.seriNo}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.sayisi}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.listeSira}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.belgeTarih}</td>
                          <td className="px-2 py-1.5 text-gray-300 max-w-[180px] truncate" title={s.cinsi}>{s.cinsi}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.olcu}</td>
                          <td className="px-2 py-1.5 text-right text-gray-200 tabular-nums">{s.miktar}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.tutar)}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.faturaTuru}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.faturaTarih}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.faturaNo}</td>
                          <td className="px-2 py-1.5 text-gray-300 max-w-[160px] truncate" title={s.sirket}>{s.sirket}</td>
                          <td className="px-2 py-1.5"><button onClick={() => setYtbTablo(ytbTablo.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t-2 border-blue-700/50 bg-blue-900/30 text-gray-200 font-semibold">
                      <td colSpan={10} className="px-2 py-2">Toplam</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(yTutar)}</td>
                      <td colSpan={5}></td>
                    </tr></tfoot>
                  </table>
                </div>
                {kaydetBtn('tesvik')}

                {ytbModal && (
                  <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setYtbModal(false)}>
                    <div className="bg-blue-950 border border-blue-700/50 rounded-2xl shadow-2xl max-w-md w-full p-5 max-h-[92vh] overflow-auto" onClick={e => e.stopPropagation()}>
                      <h3 className="text-white font-bold text-base mb-3">Yatırım Teşvik Belgesi Kapsamındaki Makine Teçhizat İstisnası Bildirimi (Satıcılar için) — Satır Ekle</h3>
                      <div className="space-y-2.5">
                        {inp('Alıcının Adı Soyadı/Ünvanı', 'ad', { max: 100 })}
                        {inp('Alıcının Kimlik No Türü', 'kimlikTuru', { sec: KIMLIK_TURLERI })}
                        {inp('Alıcının Kimlik No', 'kimlikNo')}
                        {inp('Alıcının Vergi Dairesi', 'vd')}
                        {inp('Yatırım Teşvik Belgesinin Seri No', 'seriNo', { max: 1 })}
                        {inp('Yatırım Teşvik Belgesinin Sayısı', 'sayisi')}
                        {inp('Satılan Malın Makine ve Teçhizat Liste Sıra No', 'listeSira')}
                        <div className="text-[11px] text-gray-500 bg-blue-900/30 border border-blue-800/40 rounded-lg px-3 py-2">
                          Yatırım Teşvik Belgesinin Sayısı 500.000.000 altındaysa aşağıdaki Yatırım Teşvik Belgesinin Tarihi, Satılan Malın Cinsi ve Ölçü Birim Kodu alanları ticari merkez girin yapılacaktır.
                        </div>
                        {inp('Yatırım Teşvik Belgesinin Tarihi', 'belgeTarih', { type: 'date' })}
                        {inp('Satılan Malın Cinsi', 'cinsi', { max: 400 })}
                        {inp('Satılan Malın Ölçü Birim Kodu', 'olcu', { sec: OLCU_BIRIMLERI })}
                        {inp('Satılan Malın Miktarı', 'miktar', { type: 'number', num: true })}
                        {inp('Satılan Malın Tutarı (TL)', 'tutar', { type: 'number', num: true })}
                        {inp('Satış Faturasının Türü', 'faturaTuru', { sec: FATURA_TURLERI_TVK })}
                        {inp('Satış Faturasının Tarihi', 'faturaTarih', { type: 'date' })}
                        {inp('Satış Faturasının Seri / Sıra No', 'faturaNo', { max: 16 })}
                        {inp('Faturayı Düzenleyen Şirketin Adı/Ünvanı / Vergi No', 'sirket')}
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <button onClick={() => setYtbModal(false)} className="bg-red-700/80 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">VAZGEÇ</button>
                        <button onClick={() => { setYtbTablo(l => [...l, { ...ytbForm, miktar: Number(ytbForm.miktar) || 0, tutar: Number(ytbForm.tutar) || 0 }]); setYtbModal(false) }} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">EKLE</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ---------- ÖNCEKİ DÖNEMDEN DEVREDEN KDV'DEN ÇIKARILAN FATURALAR ---------- */}
          {aktifBolum === 'devreden' && (() => {
            const dTutar = dvrTablo.reduce((t, s) => t + (Number(s.tutar) || 0), 0)
            const dKdv = dvrTablo.reduce((t, s) => t + (Number(s.kdv) || 0), 0)
            return (
              <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div>
                    <h2 className="text-white text-lg font-bold">Önceki Dönemden Devreden KDV</h2>
                    <h3 className="text-sm font-semibold text-gray-300 mt-1">Önceki Dönemden Devreden KDV'den Çıkarılan Faturalara İlişkin Bilgiler</h3>
                  </div>
                  <button onClick={() => setDvrModal(true)} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">+ EKLE</button>
                </div>
                <div className="overflow-x-auto border border-blue-800/40 rounded-xl">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-blue-900/50 text-left text-gray-300">
                      <th className="px-2 py-2">Mükellef VKN / TCKN</th><th className="px-2 py-2">Vergi Dönemi</th>
                      <th className="px-2 py-2 text-right">KDV Hariç Tutar</th><th className="px-2 py-2 text-right">KDV Tutarı</th><th className="px-2 py-2"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-blue-800/30">
                      {dvrTablo.length === 0 && <tr><td colSpan={5} className="px-2 py-4 text-center text-gray-500 italic">Gösterilecek Kayıt Yok</td></tr>}
                      {dvrTablo.map((s, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-gray-300 tabular-nums">{s.kimlikNo}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.donemTipi === '3 AYLIK' ? `${s.donem}. Dönem` : s.ay} / {s.yil}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.tutar)}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.kdv)}</td>
                          <td className="px-2 py-1.5"><button onClick={() => setDvrTablo(dvrTablo.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t-2 border-blue-700/50 bg-blue-900/30 text-gray-200 font-semibold">
                      <td colSpan={2} className="px-2 py-2">Toplam</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(dTutar)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(dKdv)}</td>
                      <td></td>
                    </tr></tfoot>
                  </table>
                </div>
                {kaydetBtn('devreden')}

                {dvrModal && (
                  <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDvrModal(false)}>
                    <div className="bg-blue-950 border border-blue-700/50 rounded-2xl shadow-2xl max-w-md w-full p-5 max-h-[92vh] overflow-auto" onClick={e => e.stopPropagation()}>
                      <h3 className="text-white font-bold text-base mb-3">Önceki Dönemden Devreden KDV'den Çıkarılan Faturalara İlişkin Bilgiler Ekle</h3>
                      <div className="space-y-2.5">
                        <label className="block text-xs text-gray-400">Alış Yapılan Mükellefe Ait Kimlik Türü
                          <select value={dvrForm.kimlikTuru} onChange={e => setDvrForm(f => ({ ...f, kimlikTuru: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                            {KIMLIK_TURLERI.map(x => <option key={x}>{x}</option>)}
                          </select>
                        </label>
                        <label className="block text-xs text-gray-400">Alış Yapılan Mükellefe Ait Kimlik No
                          <input value={dvrForm.kimlikNo} onChange={e => setDvrForm(f => ({ ...f, kimlikNo: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm tabular-nums" />
                        </label>
                        <div className="text-xs text-gray-400">Dönem Tipi</div>
                        <div className="flex rounded-lg overflow-hidden border border-blue-700/60">
                          <button onClick={() => setDvrForm(f => ({ ...f, donemTipi: 'AYLIK' }))} className={`flex-1 py-1.5 text-xs font-semibold transition ${dvrForm.donemTipi === 'AYLIK' ? 'bg-teal-600/30 text-teal-200' : 'bg-blue-900/60 text-gray-400'}`}>AYLIK</button>
                          <button onClick={() => setDvrForm(f => ({ ...f, donemTipi: '3 AYLIK' }))} className={`flex-1 py-1.5 text-xs font-semibold transition ${dvrForm.donemTipi === '3 AYLIK' ? 'bg-teal-600/30 text-teal-200' : 'bg-blue-900/60 text-gray-400'}`}>3 AYLIK</button>
                        </div>
                        <label className="block text-xs text-gray-400">Yıl
                          <select value={dvrForm.yil} onChange={e => setDvrForm(f => ({ ...f, yil: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                            {[simd.getFullYear(), simd.getFullYear() - 1, simd.getFullYear() - 2, simd.getFullYear() - 3, simd.getFullYear() - 4, simd.getFullYear() - 5].map(y => <option key={y}>{y}</option>)}
                          </select>
                        </label>
                        {dvrForm.donemTipi === 'AYLIK' ? (
                          <label className="block text-xs text-gray-400">Ay
                            <select value={dvrForm.ay} onChange={e => setDvrForm(f => ({ ...f, ay: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                              {AYLAR.map(x => <option key={x}>{x}</option>)}
                            </select>
                          </label>
                        ) : (
                          <label className="block text-xs text-gray-400">Dönem
                            <select value={dvrForm.donem} onChange={e => setDvrForm(f => ({ ...f, donem: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                              <option>1</option><option>2</option><option>3</option><option>4</option>
                            </select>
                          </label>
                        )}
                        <label className="block text-xs text-gray-400">KDV Hariç Tutar
                          <input type="number" step="0.01" value={dvrForm.tutar} onChange={e => setDvrForm(f => ({ ...f, tutar: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm text-right tabular-nums" />
                        </label>
                        <label className="block text-xs text-gray-400">KDV Tutarı
                          <input type="number" step="0.01" value={dvrForm.kdv} onChange={e => setDvrForm(f => ({ ...f, kdv: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm text-right tabular-nums" />
                        </label>
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <button onClick={() => setDvrModal(false)} className="bg-red-700/80 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">VAZGEÇ</button>
                        <button onClick={() => { setDvrTablo(l => [...l, { ...dvrForm, tutar: Number(dvrForm.tutar) || 0, kdv: Number(dvrForm.kdv) || 0 }]); setDvrModal(false) }} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">EKLE</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ---------- İNDİRİMLER ---------- */}
          {aktifBolum === 'indirimler' && (() => {
            const t1 = indTvkTablo.reduce((t, s) => t + (Number(s.kdv) || 0), 0)
            const t2 = indDigerTablo.reduce((t, s) => t + (Number(s.kdv) || 0), 0)
            return (
              <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4">
                <h2 className="text-white text-lg font-bold">İndirimler</h2>
                <p className="text-gray-500 text-xs mb-3">Önceki dönemden devreden indirilecek KDV ve diğer indirimler — satırlar iki ayrı tabloda toplanır.</p>

                <div className="flex items-center justify-between gap-2 mt-2 mb-1.5">
                  <h3 className="text-sm font-semibold text-gray-200">Önceki Dönemden Devreden İndirilecek KDV</h3>
                  <button onClick={() => setIndTvkModal(true)} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">+ EKLE</button>
                </div>
                <div className="overflow-x-auto border border-blue-800/40 rounded-xl">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-blue-900/50 text-left text-gray-300">
                      <th className="px-2 py-2">Değişiklik Nedeni</th><th className="px-2 py-2">Devrotunan (Eski Mükellef) Şirket VKN</th>
                      <th className="px-2 py-2">Açıklama</th><th className="px-2 py-2 text-right">KDV Tutarı</th><th className="px-2 py-2"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-blue-800/30">
                      {indTvkTablo.length === 0 && <tr><td colSpan={5} className="px-2 py-4 text-center text-gray-500 italic">Gösterilecek Kayıt Yok</td></tr>}
                      {indTvkTablo.map((s, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-gray-200">{s.neden}</td>
                          <td className="px-2 py-1.5 text-gray-300">{s.vkn || '-'}</td>
                          <td className="px-2 py-1.5 text-gray-300 max-w-[260px] truncate" title={s.aciklama}>{s.aciklama || '-'}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.kdv)}</td>
                          <td className="px-2 py-1.5"><button onClick={() => setIndTvkTablo(indTvkTablo.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t-2 border-blue-700/50 bg-blue-900/30 text-gray-200 font-semibold">
                      <td colSpan={3} className="px-2 py-2">Toplam</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(t1)}</td>
                      <td></td>
                    </tr></tfoot>
                  </table>
                </div>

                <div className="flex items-center justify-between gap-2 mt-5 mb-1.5">
                  <h3 className="text-sm font-semibold text-gray-200">Diğer İndirimler</h3>
                  <button onClick={() => setIndDigerModal(true)} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">+ EKLE</button>
                </div>
                <div className="overflow-x-auto border border-blue-800/40 rounded-xl">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-blue-900/50 text-left text-gray-300">
                      <th className="px-2 py-2">İndirim Türü</th><th className="px-2 py-2 text-right">İndirilecek KDV Tutarı</th><th className="px-2 py-2"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-blue-800/30">
                      {indDigerTablo.length === 0 && <tr><td colSpan={3} className="px-2 py-4 text-center text-gray-500 italic">Gösterilecek Kayıt Yok</td></tr>}
                      {indDigerTablo.map((s, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-gray-200 max-w-[420px] truncate" title={s.tur}>{s.tur}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.kdv)}</td>
                          <td className="px-2 py-1.5"><button onClick={() => setIndDigerTablo(indDigerTablo.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t-2 border-blue-700/50 bg-blue-900/30 text-gray-200 font-semibold">
                      <td className="px-2 py-2">Toplam</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(t2)}</td>
                      <td></td>
                    </tr></tfoot>
                  </table>
                </div>

                <div className="flex justify-end mt-4">
                  <div className="bg-blue-900/40 border border-blue-800/40 rounded-xl px-4 py-2.5 min-w-[280px]">
                    <div className="text-xs text-gray-400">İndirimler Toplamı<span className="float-right text-teal-200 font-bold tabular-nums">{tl(t1 + t2)}</span></div>
                  </div>
                </div>
                {kaydetBtn('indirimler')}

                {indTvkModal && (
                  <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIndTvkModal(false)}>
                    <div className="bg-blue-950 border border-blue-700/50 rounded-2xl shadow-2xl max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
                      <h3 className="text-white font-bold text-base mb-3">Önceki Dönemden Devreden İndirilecek KDV Ekle</h3>
                      <div className="space-y-2.5">
                        <label className="block text-xs text-gray-400">Değişiklik Nedeni
                          <select value={indTvkForm.neden} onChange={e => setIndTvkForm(f => ({ ...f, neden: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                            {IND_NEDENLERI.map(x => <option key={x}>{x}</option>)}
                          </select>
                        </label>
                        <label className="block text-xs text-gray-400">Devrotunan (Eski Mükellef) Şirket VKN
                          <input value={indTvkForm.vkn} onChange={e => setIndTvkForm(f => ({ ...f, vkn: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm tabular-nums" />
                        </label>
                        <label className="block text-xs text-gray-400">Açıklama
                          <input value={indTvkForm.aciklama} maxLength={255} onChange={e => setIndTvkForm(f => ({ ...f, aciklama: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm" />
                          <span className="text-[10px] text-gray-600">{(indTvkForm.aciklama || '').length}/255</span>
                        </label>
                        <label className="block text-xs text-gray-400">KDV Tutarı
                          <input type="number" step="0.01" value={indTvkForm.kdv} onChange={e => setIndTvkForm(f => ({ ...f, kdv: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm text-right tabular-nums" />
                        </label>
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <button onClick={() => setIndTvkModal(false)} className="bg-red-700/80 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">VAZGEÇ</button>
                        <button onClick={() => { setIndTvkTablo(l => [...l, { ...indTvkForm, kdv: Number(indTvkForm.kdv) || 0 }]); setIndTvkModal(false) }} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">EKLE</button>
                      </div>
                    </div>
                  </div>
                )}
                {indDigerModal && (
                  <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIndDigerModal(false)}>
                    <div className="bg-blue-950 border border-blue-700/50 rounded-2xl shadow-2xl max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
                      <h3 className="text-white font-bold text-base mb-3">Diğer İndirimler Ekle</h3>
                      <div className="space-y-2.5">
                        <label className="block text-xs text-gray-400">İndirim Türü
                          <select value={indDigerForm.tur} onChange={e => setIndDigerForm(f => ({ ...f, tur: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                            {IND_TURLERI.map(x => <option key={x}>{x}</option>)}
                          </select>
                        </label>
                        <label className="block text-xs text-gray-400">İndirilecek KDV Tutarı
                          <input type="number" step="0.01" value={indDigerForm.kdv} onChange={e => setIndDigerForm(f => ({ ...f, kdv: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm text-right tabular-nums" />
                        </label>
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <button onClick={() => setIndDigerModal(false)} className="bg-red-700/80 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">VAZGEÇ</button>
                        <button onClick={() => { setIndDigerTablo(l => [...l, { ...indDigerForm, kdv: Number(indDigerForm.kdv) || 0 }]); setIndDigerModal(false) }} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">EKLE</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ---------- İHRACAT KAYDIYLA TESLİMLER ---------- */}
          {aktifBolum === 'ihracat' && (() => {
            const iBedel = ihrTablo.reduce((t, s) => t + (Number(s.bedel) || 0), 0)
            const iKdv = ihrTablo.reduce((t, s) => t + (Number(s.kdv) || 0), 0)
            const yuklenen = Number(ihrYuklenen) || 0
            return (
              <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div>
                    <h2 className="text-white text-lg font-bold">İhracat Kaydıyla Teslimler</h2>
                    <h3 className="text-sm font-semibold text-gray-300 mt-1">İhrac Kaydıyla Teslimlere Ait Bildirim</h3>
                  </div>
                  <button onClick={() => setIhrModal(true)} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">+ EKLE</button>
                </div>
                <div className="overflow-x-auto border border-blue-800/40 rounded-xl">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-blue-900/50 text-left text-gray-300">
                      <th className="px-2 py-2">İşlem Türü</th><th className="px-2 py-2 text-right">Teslim Bedeli</th>
                      <th className="px-2 py-2 text-right">KDV Oranı</th><th className="px-2 py-2 text-right">Hesaplanan KDV</th><th className="px-2 py-2"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-blue-800/30">
                      {ihrTablo.length === 0 && <tr><td colSpan={5} className="px-2 py-4 text-center text-gray-500 italic">Gösterilecek Kayıt Yok</td></tr>}
                      {ihrTablo.map((s, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-gray-200 max-w-[420px] truncate" title={s.islemTuru}>{s.islemTuru}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.bedel)}</td>
                          <td className="px-2 py-1.5 text-right text-gray-300">%{s.oran}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.kdv)}</td>
                          <td className="px-2 py-1.5"><button onClick={() => setIhrTablo(ihrTablo.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t-2 border-blue-700/50 bg-blue-900/30 text-gray-200 font-semibold">
                      <td className="px-2 py-2">Toplam</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(iBedel)}</td>
                      <td></td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(iKdv)}</td>
                      <td></td>
                    </tr></tfoot>
                  </table>
                </div>

                <div className="mt-4 flex justify-end">
                  <div className="bg-blue-900/40 border border-blue-800/40 rounded-xl px-4 py-3 min-w-[380px] space-y-2">
                    <div className="text-xs text-gray-400 flex justify-between">İhrac Kaydıyla Teslim Bedeli Toplamı<span className="text-white tabular-nums">{tl(iBedel)}</span></div>
                    <div className="text-xs text-gray-400 flex justify-between">Tecil Edilebilir KDV<span className="text-white tabular-nums">{tl(iKdv)}</span></div>
                    <div className="text-xs text-gray-400 flex justify-between">İhracatın Gerçekleştiği Dönemde İade Edilecek Tecil Edilemeyen KDV<span className="text-white tabular-nums">{tl(0)}</span></div>
                    <label className="text-xs text-gray-400 flex justify-between items-center gap-2">Yurtiçi ve Yurtdışı KDV Ödenmeksizin Temin Edilen Mal Bedeli
                      <input type="number" step="0.01" value={ihrYurtici} onChange={e => setIhrYurtici(e.target.value)} className="w-32 bg-blue-900/60 border border-blue-700/60 rounded px-2 py-1 text-white text-right tabular-nums" />
                    </label>
                    <div className="text-xs text-gray-400 flex justify-between">İhracatın Gerçekleştiği Dönemde İade Edilecek KDV<span className="text-white tabular-nums">{tl(iKdv)}</span></div>
                    <label className="text-xs text-gray-400 flex justify-between items-center gap-2">Yüklenen KDV
                      <input type="number" step="0.01" value={ihrYuklenen} onChange={e => setIhrYuklenen(e.target.value)} className="w-32 bg-blue-900/60 border border-blue-700/60 rounded px-2 py-1 text-white text-right tabular-nums" />
                    </label>
                    <div className="text-xs text-gray-400 flex justify-between border-t border-blue-700/40 pt-2">İndirimli Orana Tabi Malların İhrac Kaydıyla Tesliminde İade Edilecek Yüklenen Vergi Farkı<span className="text-white tabular-nums">{tl(0)}</span></div>
                  </div>
                </div>
                {kaydetBtn('ihracat')}

                {ihrModal && (() => {
                  const hesapKdv = Math.round((Number(ihrForm.bedel) || 0) * (Number(ihrForm.oran) || 0) / 100 * 100) / 100
                  return (
                    <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIhrModal(false)}>
                      <div className="bg-blue-950 border border-blue-700/50 rounded-2xl shadow-2xl max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
                        <h3 className="text-white font-bold text-base mb-3">İhrac Kaydıyla Teslimlere Ait Bildirim Ekle</h3>
                        <div className="space-y-2.5">
                          <label className="block text-xs text-gray-400">İşlem Türü
                            <select value={ihrForm.islemTuru} onChange={e => setIhrForm(f => ({ ...f, islemTuru: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                              {IHR_ISLEMLERI.map(x => <option key={x}>{x}</option>)}
                            </select>
                          </label>
                          <label className="block text-xs text-gray-400">Teslim Bedeli
                            <input type="number" step="0.01" value={ihrForm.bedel} onChange={e => setIhrForm(f => ({ ...f, bedel: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm text-right tabular-nums" />
                          </label>
                          <label className="block text-xs text-gray-400">KDV Oranı
                            <select value={ihrForm.oran} onChange={e => setIhrForm(f => ({ ...f, oran: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                              {['1', '10', '20'].map(x => <option key={x}>{x}</option>)}
                            </select>
                          </label>
                          <div className="text-xs text-gray-400 bg-blue-900/40 border border-blue-800/40 rounded-lg px-3 py-2">Hesaplanan KDV
                            <span className="float-right text-white tabular-nums">{tl(hesapKdv)}</span>
                          </div>
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                          <button onClick={() => setIhrModal(false)} className="bg-red-700/80 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">VAZGEÇ</button>
                          <button onClick={() => { setIhrTablo(l => [...l, { ...ihrForm, bedel: Number(ihrForm.bedel) || 0, kdv: hesapKdv }]); setIhrModal(false) }} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">EKLE</button>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )
          })()}

          {/* ---------- İSTİSNALAR-DİĞER İADE HAKKI DOĞURAN İŞLEMLER ---------- */}
          {aktifBolum === 'istisnaDiger' && (() => {
            const kTutar = idKismiTablo.reduce((t, s) => t + (Number(s.tutar) || 0), 0)
            const kKdv = idKismiTablo.reduce((t, s) => t + (Number(s.kdv) || 0), 0)
            const tTutar = idTamTablo.reduce((t, s) => t + (Number(s.tutar) || 0), 0)
            const tBedel = idTamTablo.reduce((t, s) => t + (Number(s.bedel) || 0), 0)
            const tKdv = idTamTablo.reduce((t, s) => t + (Number(s.kdv) || 0), 0)
            const kvTutar = idKtvkTablo.reduce((t, s) => t + (Number(s.tutar) || 0), 0)
            const kvKdv = idKtvkTablo.reduce((t, s) => t + (Number(s.kdv) || 0), 0)
            const tvTutar = idTtvkTablo.reduce((t, s) => t + (Number(s.tutar) || 0), 0)
            const tvKdv = idTtvkTablo.reduce((t, s) => t + (Number(s.kdv) || 0), 0)
            const tutarInp = (v, set, key, num = true) => (
              <label className="block text-xs text-gray-400">{key}
                <input type={num ? 'number' : 'text'} step="0.01" value={v} onChange={e => set(e.target.value)} className={`mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm ${num ? 'text-right tabular-nums' : ''}`} />
              </label>
            )
            return (
              <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4">
                <h2 className="text-white text-lg font-bold">İstisnalar-Diğer İade Hakkı Doğuran İşlemler</h2>
                <p className="text-gray-500 text-xs mb-3">GİB'deki dört bildirim tablosu — EKLE ile satır girin.</p>

                {/* Kısmi İstisna */}
                <div className="flex items-center justify-between gap-2 mt-2 mb-1.5">
                  <h3 className="text-sm font-semibold text-gray-200">Kısmi İstisna Kapsamına Giren İşlemler</h3>
                  <button onClick={() => setIdKismiModal(true)} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">+ EKLE</button>
                </div>
                <div className="overflow-x-auto border border-blue-800/40 rounded-xl">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-blue-900/50 text-left text-gray-300">
                      <th className="px-2 py-2">İstisna Türü</th><th className="px-2 py-2 text-right">Teslim ve Hizmet Tutarı</th><th className="px-2 py-2 text-right">Yüklenen KDV</th><th className="px-2 py-2"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-blue-800/30">
                      {idKismiTablo.length === 0 && <tr><td colSpan={4} className="px-2 py-4 text-center text-gray-500 italic">Gösterilecek Kayıt Yok</td></tr>}
                      {idKismiTablo.map((s, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-gray-200 max-w-[420px] truncate" title={s.tur}>{s.tur}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.tutar)}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.kdv)}</td>
                          <td className="px-2 py-1.5"><button onClick={() => setIdKismiTablo(idKismiTablo.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t-2 border-blue-700/50 bg-blue-900/30 text-gray-200 font-semibold">
                      <td className="px-2 py-2">Toplam</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(kTutar)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(kKdv)}</td>
                      <td></td>
                    </tr></tfoot>
                  </table>
                </div>

                {/* Tam İstisna */}
                <div className="flex items-center justify-between gap-2 mt-5 mb-1.5">
                  <h3 className="text-sm font-semibold text-gray-200">Tam İstisna Kapsamına Giren İşlemler</h3>
                  <button onClick={() => setIdTamModal(true)} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">+ EKLE</button>
                </div>
                <div className="overflow-x-auto border border-blue-800/40 rounded-xl">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-blue-900/50 text-left text-gray-300">
                      <th className="px-2 py-2">İstisna Türü</th><th className="px-2 py-2 text-right">Teslim ve Hizmet Tutarı</th><th className="px-2 py-2 text-right">KDV Ödenmeksizin Temin Edilen Mal Bedeli</th><th className="px-2 py-2 text-right">Yüklenen KDV</th><th className="px-2 py-2"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-blue-800/30">
                      {idTamTablo.length === 0 && <tr><td colSpan={5} className="px-2 py-4 text-center text-gray-500 italic">Gösterilecek Kayıt Yok</td></tr>}
                      {idTamTablo.map((s, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-gray-200 max-w-[420px] truncate" title={s.tur}>{s.tur}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.tutar)}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.bedel)}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.kdv)}</td>
                          <td className="px-2 py-1.5"><button onClick={() => setIdTamTablo(idTamTablo.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t-2 border-blue-700/50 bg-blue-900/30 text-gray-200 font-semibold">
                      <td className="px-2 py-2">Toplam</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(tTutar)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(tBedel)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(tKdv)}</td>
                      <td></td>
                    </tr></tfoot>
                  </table>
                </div>

                {/* Toplam özet kartı */}
                <div className="flex justify-end mt-3">
                  <div className="bg-blue-900/40 border border-blue-800/40 rounded-xl px-4 py-2.5 min-w-[320px]">
                    <div className="text-xs text-gray-400">İstisna Kapsamına Giren İşlemlere Ait Toplam Teslim ve Hizmet Tutarı<span className="float-right text-white font-bold tabular-nums">{tl(kTutar + tTutar)}</span></div>
                  </div>
                </div>

                {/* Kısmi Tevkifat Kapsamına Giren İşlemler */}
                <div className="flex items-center justify-between gap-2 mt-5 mb-1.5">
                  <h3 className="text-sm font-semibold text-gray-200">Kısmi Tevkifat Kapsamına Giren İşlemler</h3>
                  <button onClick={() => setIdKtvkModal(true)} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">+ EKLE</button>
                </div>
                <div className="overflow-x-auto border border-blue-800/40 rounded-xl">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-blue-900/50 text-left text-gray-300">
                      <th className="px-2 py-2">İşlem Türü</th><th className="px-2 py-2 text-right">Teslim ve Hizmet Tutarı</th><th className="px-2 py-2 text-right">İadeye Konu Olan KDV</th><th className="px-2 py-2"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-blue-800/30">
                      {idKtvkTablo.length === 0 && <tr><td colSpan={4} className="px-2 py-4 text-center text-gray-500 italic">Gösterilecek Kayıt Yok</td></tr>}
                      {idKtvkTablo.map((s, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-gray-200 max-w-[420px] truncate" title={s.islemTuru}>{s.islemTuru}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.tutar)}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.kdv)}</td>
                          <td className="px-2 py-1.5"><button onClick={() => setIdKtvkTablo(idKtvkTablo.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t-2 border-blue-700/50 bg-blue-900/30 text-gray-200 font-semibold">
                      <td className="px-2 py-2">Toplam</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(kvTutar)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(kvKdv)}</td>
                      <td></td>
                    </tr></tfoot>
                  </table>
                </div>

                {/* İsteğe Bağlı Tam Tevkifat Kapsamına Giren İşlemler */}
                <div className="flex items-center justify-between gap-2 mt-5 mb-1.5">
                  <h3 className="text-sm font-semibold text-gray-200">İsteğe Bağlı Tam Tevkifat Kapsamına Giren İşlemler</h3>
                  <button onClick={() => setIdTtvkModal(true)} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">+ EKLE</button>
                </div>
                <div className="overflow-x-auto border border-blue-800/40 rounded-xl">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-blue-900/50 text-left text-gray-300">
                      <th className="px-2 py-2">İşlem Türü</th><th className="px-2 py-2 text-right">Teslim ve Hizmet Tutarı</th><th className="px-2 py-2 text-right">İadeye Konu Olan KDV</th><th className="px-2 py-2"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-blue-800/30">
                      {idTtvkTablo.length === 0 && <tr><td colSpan={4} className="px-2 py-4 text-center text-gray-500 italic">Gösterilecek Kayıt Yok</td></tr>}
                      {idTtvkTablo.map((s, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-gray-200 max-w-[420px] truncate" title={s.islemTuru}>{s.islemTuru}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.tutar)}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.kdv)}</td>
                          <td className="px-2 py-1.5"><button onClick={() => setIdTtvkTablo(idTtvkTablo.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t-2 border-blue-700/50 bg-blue-900/30 text-gray-200 font-semibold">
                      <td className="px-2 py-2">Toplam</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(tvTutar)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(tvKdv)}</td>
                      <td></td>
                    </tr></tfoot>
                  </table>
                </div>
                {/* Diğer İade Hakkı Doğuran İşlemler */}
                <div className="flex items-center justify-between gap-2 mt-5 mb-1.5">
                  <h3 className="text-sm font-semibold text-gray-200">Diğer İade Hakkı Doğuran İşlemler</h3>
                  <button onClick={() => setIdDigerModal(true)} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition">+ EKLE</button>
                </div>
                <div className="overflow-x-auto border border-blue-800/40 rounded-xl">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-blue-900/50 text-left text-gray-300">
                      <th className="px-2 py-2">İşlem Türü</th><th className="px-2 py-2 text-right">Teslim ve Hizmet Tutarı</th><th className="px-2 py-2 text-right">İadeye Konu Olan KDV</th><th className="px-2 py-2"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-blue-800/30">
                      {idDigerTablo.length === 0 && <tr><td colSpan={4} className="px-2 py-4 text-center text-gray-500 italic">Gösterilecek Kayıt Yok</td></tr>}
                      {idDigerTablo.map((s, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-gray-200 max-w-[420px] truncate" title={s.islemTuru}>{s.islemTuru}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.tutar)}</td>
                          <td className="px-2 py-1.5 text-right text-white tabular-nums">{tl(s.kdv)}</td>
                          <td className="px-2 py-1.5"><button onClick={() => setIdDigerTablo(idDigerTablo.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t-2 border-blue-700/50 bg-blue-900/30 text-gray-200 font-semibold">
                      <td className="px-2 py-2">Toplam</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(idDigerTablo.reduce((t, s) => t + (Number(s.tutar) || 0), 0))}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{tl(idDigerTablo.reduce((t, s) => t + (Number(s.kdv) || 0), 0))}</td>
                      <td></td>
                    </tr></tfoot>
                  </table>
                </div>
                {kaydetBtn('istisnaDiger')}

                {/* --- Ekle modalları --- */}
                {idKismiModal && (
                  <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIdKismiModal(false)}>
                    <div className="bg-blue-950 border border-blue-700/50 rounded-2xl shadow-2xl max-w-md w-full p-5 max-h-[92vh] overflow-auto" onClick={e => e.stopPropagation()}>
                      <h3 className="text-white font-bold text-base mb-3">Kısmi İstisna Kapsamına Giren İşlemler Ekle</h3>
                      <div className="space-y-2.5">
                        <label className="block text-xs text-gray-400">İstisna Türü
                          <select value={idKismiForm.tur} onChange={e => setIdKismiForm(f => ({ ...f, tur: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                            {KISMİ_ISTISNA_TURLERI.map(x => <option key={x}>{x}</option>)}
                          </select>
                        </label>
                        {tutarInp(idKismiForm.tutar, v => setIdKismiForm(f => ({ ...f, tutar: v })), 'Teslim ve Hizmet Tutarı')}
                        {tutarInp(idKismiForm.kdv, v => setIdKismiForm(f => ({ ...f, kdv: v })), 'Yüklenen KDV')}
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <button onClick={() => setIdKismiModal(false)} className="bg-red-700/80 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">VAZGEÇ</button>
                        <button onClick={() => { setIdKismiTablo(l => [...l, { ...idKismiForm, tutar: Number(idKismiForm.tutar) || 0, kdv: Number(idKismiForm.kdv) || 0 }]); setIdKismiModal(false) }} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">EKLE</button>
                      </div>
                    </div>
                  </div>
                )}
                {idTamModal && (
                  <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIdTamModal(false)}>
                    <div className="bg-blue-950 border border-blue-700/50 rounded-2xl shadow-2xl max-w-md w-full p-5 max-h-[92vh] overflow-auto" onClick={e => e.stopPropagation()}>
                      <h3 className="text-white font-bold text-base mb-3">Tam İstisna Kapsamına Giren İşlemler Ekle</h3>
                      <div className="space-y-2.5">
                        <label className="block text-xs text-gray-400">İstisna Türü
                          <select value={idTamForm.tur} onChange={e => setIdTamForm(f => ({ ...f, tur: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                            {TAM_ISTISNA_TURLERI.map(x => <option key={x}>{x}</option>)}
                          </select>
                        </label>
                        {tutarInp(idTamForm.tutar, v => setIdTamForm(f => ({ ...f, tutar: v })), 'Teslim ve Hizmet Tutarı')}
                        {tutarInp(idTamForm.bedel, v => setIdTamForm(f => ({ ...f, bedel: v })), 'KDV Ödenmeksizin Temin Edilen Mal Bedeli')}
                        {tutarInp(idTamForm.kdv, v => setIdTamForm(f => ({ ...f, kdv: v })), 'Yüklenen KDV')}
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <button onClick={() => setIdTamModal(false)} className="bg-red-700/80 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">VAZGEÇ</button>
                        <button onClick={() => { setIdTamTablo(l => [...l, { ...idTamForm, tutar: Number(idTamForm.tutar) || 0, bedel: Number(idTamForm.bedel) || 0, kdv: Number(idTamForm.kdv) || 0 }]); setIdTamModal(false) }} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">EKLE</button>
                      </div>
                    </div>
                  </div>
                )}
                {idKtvkModal && (
                  <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIdKtvkModal(false)}>
                    <div className="bg-blue-950 border border-blue-700/50 rounded-2xl shadow-2xl max-w-md w-full p-5 max-h-[92vh] overflow-auto" onClick={e => e.stopPropagation()}>
                      <h3 className="text-white font-bold text-base mb-3">Kısmi Tevkifat Kapsamına Giren İşlemler Ekle</h3>
                      <div className="space-y-2.5">
                        <label className="block text-xs text-gray-400">İşlem Türü
                          <select value={idKtvkForm.islemTuru} onChange={e => setIdKtvkForm(f => ({ ...f, islemTuru: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                            {ID_KISMİ_TVK_TURLERI.map(x => <option key={x}>{x}</option>)}
                          </select>
                        </label>
                        {tutarInp(idKtvkForm.tutar, v => setIdKtvkForm(f => ({ ...f, tutar: v })), 'Teslim ve Hizmet Tutarı')}
                        {tutarInp(idKtvkForm.kdv, v => setIdKtvkForm(f => ({ ...f, kdv: v })), 'İadeye Konu Olan KDV')}
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <button onClick={() => setIdKtvkModal(false)} className="bg-red-700/80 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">VAZGEÇ</button>
                        <button onClick={() => { setIdKtvkTablo(l => [...l, { ...idKtvkForm, tutar: Number(idKtvkForm.tutar) || 0, kdv: Number(idKtvkForm.kdv) || 0 }]); setIdKtvkModal(false) }} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">EKLE</button>
                      </div>
                    </div>
                  </div>
                )}
                {idTtvkModal && (
                  <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIdTtvkModal(false)}>
                    <div className="bg-blue-950 border border-blue-700/50 rounded-2xl shadow-2xl max-w-md w-full p-5 max-h-[92vh] overflow-auto" onClick={e => e.stopPropagation()}>
                      <h3 className="text-white font-bold text-base mb-3">İsteğe Bağlı Tam Tevkifat Kapsamına Giren İşlemler Ekle</h3>
                      <div className="space-y-2.5">
                        <label className="block text-xs text-gray-400">İşlem Türü
                          <select value={idTtvkForm.islemTuru} onChange={e => setIdTtvkForm(f => ({ ...f, islemTuru: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                            {ID_TAM_TVK_TURLERI.map(x => <option key={x}>{x}</option>)}
                          </select>
                        </label>
                        {tutarInp(idTtvkForm.tutar, v => setIdTtvkForm(f => ({ ...f, tutar: v })), 'Teslim ve Hizmet Tutarı')}
                        {tutarInp(idTtvkForm.kdv, v => setIdTtvkForm(f => ({ ...f, kdv: v })), 'İadeye Konu Olan KDV')}
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <button onClick={() => setIdTtvkModal(false)} className="bg-red-700/80 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">VAZGEÇ</button>
                        <button onClick={() => { setIdTtvkTablo(l => [...l, { ...idTtvkForm, tutar: Number(idTtvkForm.tutar) || 0, kdv: Number(idTtvkForm.kdv) || 0 }]); setIdTtvkModal(false) }} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">EKLE</button>
                      </div>
                    </div>
                  </div>
                )}
                {idDigerModal && (
                  <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIdDigerModal(false)}>
                    <div className="bg-blue-950 border border-blue-700/50 rounded-2xl shadow-2xl max-w-md w-full p-5 max-h-[92vh] overflow-auto" onClick={e => e.stopPropagation()}>
                      <h3 className="text-white font-bold text-base mb-3">Diğer İade Hakkı Doğuran İşlemler Ekle</h3>
                      <div className="space-y-2.5">
                        <label className="block text-xs text-gray-400">İşlem Türü
                          <select value={idDigerForm.islemTuru} onChange={e => setIdDigerForm(f => ({ ...f, islemTuru: e.target.value }))} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                            {ID_DIGER_IADE_TURLERI.map(x => <option key={x}>{x}</option>)}
                          </select>
                        </label>
                        {tutarInp(idDigerForm.tutar, v => setIdDigerForm(f => ({ ...f, tutar: v })), 'Teslim ve Hizmet Tutarı')}
                        {tutarInp(idDigerForm.kdv, v => setIdDigerForm(f => ({ ...f, kdv: v })), 'İadeye Konu Olan KDV')}
                      </div>
                      <div className="mt-3 bg-sky-500/10 border border-sky-500/25 text-sky-200 text-xs rounded-lg px-3 py-2">
                        ⓘ KDV tevkifatından dolayı iade talep ediliyorsa ilgili işlem türüne uygun tevkifat kodu ile iade istenmelidir. Eğer uygun bir kod bulamazsanız 'Diğer'i seçiniz.
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <button onClick={() => setIdDigerModal(false)} className="bg-red-700/80 hover:bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">VAZGEÇ</button>
                        <button onClick={() => { setIdDigerTablo(l => [...l, { ...idDigerForm, tutar: Number(idDigerForm.tutar) || 0, kdv: Number(idDigerForm.kdv) || 0 }]); setIdDigerModal(false) }} className="bg-teal-600 hover:bg-teal-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition">EKLE</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ---------- DİĞER EKLER (genel: tüm özel bloklar bitti, kalan yok) ---------- */}
          {false && (() => {
            const ad = MENU_GRUPLAR.find(g => g.id === 'ekler')?.items.find(i => i.id === aktifBolum)?.ad || aktifBolum
            const st = ekGetir(aktifBolum)
            return (
              <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4">
                <h2 className="text-white text-lg font-bold">{ad}</h2>
                <p className="text-gray-500 text-xs mb-3">Bu dönemde işlem yoksa "Boş" bırakın; varsa satır ekleyin (alan düzenleri ekran görüntülerine göre netleştirilecek).</p>
                <label className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer mb-3">
                  <input type="checkbox" checked={st.bos} onChange={e => ekSet(aktifBolum, { bos: e.target.checked })} className="accent-teal-400 w-4 h-4" />
                  Bu bölüm bu dönemde boş
                </label>
                {!st.bos && (
                  <table className="w-full text-xs">
                    <thead><tr className="text-gray-400 text-left"><th className="py-1 pr-2">Açıklama</th><th className="py-1 pr-2">Tutar (TL)</th><th className="py-1"></th></tr></thead>
                    <tbody>
                      {st.satirlar.length === 0 && <tr><td colSpan={3} className="py-2 text-gray-500">Satır yok</td></tr>}
                      {st.satirlar.map((s, i) => (
                        <tr key={i}>
                          <td className="py-1 pr-2"><input value={s.aciklama ?? ''} onChange={e => ekSet(aktifBolum, { satirlar: st.satirlar.map((x, j) => j === i ? { ...x, aciklama: e.target.value } : x) })} className="w-full bg-blue-900/60 border border-blue-700/60 rounded px-1.5 py-1 text-white" /></td>
                          <td className="py-1 pr-2"><input value={s.tutar ?? ''} onChange={e => ekSet(aktifBolum, { satirlar: st.satirlar.map((x, j) => j === i ? { ...x, tutar: e.target.value } : x) })} className="w-32 bg-blue-900/60 border border-blue-700/60 rounded px-1.5 py-1 text-white text-right tabular-nums" /></td>
                          <td className="py-1"><button onClick={() => ekSet(aktifBolum, { satirlar: st.satirlar.filter((_, j) => j !== i) })} className="text-red-400 hover:text-red-300">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {!st.bos && <button onClick={() => ekSet(aktifBolum, { satirlar: [...st.satirlar, { aciklama: '', tutar: '' }] })} className="mt-1.5 text-xs text-blue-300 hover:text-blue-200">+ Satır ekle</button>}
                {kaydetBtn(aktifBolum)}
              </div>
            )
          })()}

          {/* ---------- GÖNDERİM VE TAKİP ---------- */}
          {aktifBolum === 'gonderim' && (
            <div className="space-y-4">
              {/* B. Gonderim islemleri */}
              <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4">
                <h2 className="text-gray-300 text-sm font-semibold mb-3">Gönderim İşlemleri — {secimEtiketi} · {String(efektifAy).padStart(2, '0')}/{yil}</h2>
                <div className="flex flex-wrap gap-2">
                  <button onClick={mukellefleriGetir} disabled={yukleniyor} className="flex items-center gap-1.5 bg-blue-700/80 hover:bg-blue-600 text-white rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-50">
                    <Users className="w-4 h-4" /> Mükellefleri Getir
                  </button>
                  <button onClick={beyannameKontrolu} disabled={yukleniyor || !seciliKayitlar.length} className="flex items-center gap-1.5 bg-amber-700/80 hover:bg-amber-600 text-white rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-50">
                    <CheckCircle2 className="w-4 h-4" /> Beyanname Kontrolü
                  </button>
                  <button onClick={() => setOnizleme(seciliKayitlar[0] || null)} disabled={!seciliKayitlar.length} className="flex items-center gap-1.5 bg-blue-800/80 hover:bg-blue-700 text-white rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-50">
                    <Eye className="w-4 h-4" /> Beyanname Önizleme
                  </button>
                  <button onClick={gibGonder} disabled={yukleniyor || !seciliKayitlar.length} className="flex items-center gap-1.5 bg-violet-700/80 hover:bg-violet-600 text-white rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-50">
                    <Send className="w-4 h-4" /> GİB'e Gönder (TEST)
                  </button>
                  <button onClick={sonuclariSorgula} className="flex items-center gap-1.5 bg-sky-800/80 hover:bg-sky-700 text-white rounded-lg px-3.5 py-2 text-sm font-medium transition">
                    <Search className="w-4 h-4" /> Sonuçları Sorgula
                  </button>
                  <button onClick={tahakkukIndir} title="GİB entegrasyonu sonrası aktif olacak" className="flex items-center gap-1.5 bg-gray-700/60 hover:bg-gray-600/60 text-gray-300 rounded-lg px-3.5 py-2 text-sm font-medium transition cursor-not-allowed">
                    <FileDown className="w-4 h-4" /> Tahakkukları İndir
                  </button>
                </div>
                {mesaj && <div className="mt-3 bg-blue-500/10 border border-blue-500/25 text-blue-200 text-sm rounded-lg px-4 py-2">{mesaj}</div>}
              </div>

              {/* D. GiB e-Beyan API entegrasyonu */}
              <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h2 className="text-gray-300 text-sm font-semibold flex items-center gap-2"><KeyRound className="w-4 h-4" /> GİB e-Beyan Entegrasyonu (API KEY)</h2>
                  {tokDurum?.kayitli
                    ? <span className="text-xs text-emerald-400">Token kayıtlı — {tokDurum.ortam?.toUpperCase()} ortamı, son 4 hane: {tokDurum.sonDort}{tokDurum.kayitZamani ? ` · ${new Date(tokDurum.kayitZamani).toLocaleString('tr-TR')}` : ''}</span>
                    : <span className="text-xs text-amber-400">Token kayıtlı değil{tokDurum?.yardimciYok ? ' (yardımcı program bağlantısı yok)' : ''}</span>}
                </div>
                <p className="text-xs text-gray-400 mb-3">
                  Token oluşturma: <b>Dijital Vergi Dairesi</b> → <b>e-Beyan</b> uygulaması → sağ üst <b>Profil ikonu</b> → <b>Entegrasyon Yönetimi</b> → <b>Oluştur</b> → Kopyala.
                  Token yalnızca bir kez gösterilir. {" "}
                  <a href="https://ebeyan.gib.gov.tr/entegrator/docs/giris" target="_blank" rel="noreferrer" className="text-blue-300 underline">Resmî API kılavuzu</a>.
                  Token bu bilgisayardaki yardımcı programda şifreli klasörde saklanır; tarayıcıya kaydedilmez.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <label className="text-xs text-gray-400">Ortam
                    <select value={tokOrtam} onChange={e => setTokOrtam(e.target.value)} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm">
                      <option value="prod">PROD (ebeyanapi.gib.gov.tr)</option>
                      <option value="test">TEST (ebeyanpreprodapi.gib.gov.tr)</option>
                    </select>
                  </label>
                  <label className="text-xs text-gray-400 md:col-span-2">API KEY (Token)
                    <input type="password" value={tokDeger} onChange={e => setTokDeger(e.target.value)} placeholder={tokDurum?.kayitli ? `kayıtlı (**${tokDurum.sonDort}) — yeni değer girilirse üzerine yazar` : 'Dijital VD entegrasyon token'} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm" />
                  </label>
                  <label className="text-xs text-gray-400">Entegratör VKN
                    <input value={tokVkn} onChange={e => setTokVkn(e.target.value)} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm tabular-nums" />
                  </label>
                  <label className="text-xs text-gray-400 md:col-span-2">Entegratör Ünvan (alfanumerik, Türkçe karakter yok, max 20)
                    <input value={tokUnvan} onChange={e => setTokUnvan(e.target.value)} maxLength={20} className="mt-1 w-full bg-blue-900/60 border border-blue-700/60 rounded-lg px-3 py-2 text-white text-sm" />
                  </label>
                  <div className="md:col-span-2 flex items-end flex-wrap gap-2">
                    <button onClick={tokenKaydet} disabled={tokIslem || !tokDeger.trim()} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg px-3.5 py-2 text-sm font-medium transition">
                      {tokIslem ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Token Kaydet
                    </button>
                    <button onClick={baglantiTesti} disabled={tokIslem || !tokDurum?.kayitli} className="flex items-center gap-1.5 bg-sky-700/80 hover:bg-sky-600 disabled:opacity-50 text-white rounded-lg px-3.5 py-2 text-sm font-medium transition">
                      <PlugZap className="w-4 h-4" /> Bağlantı Testi
                    </button>
                    {tokDurum?.kayitli && (
                      <button onClick={tokenSil} disabled={tokIslem} className="flex items-center gap-1.5 bg-red-800/70 hover:bg-red-700/70 text-red-200 rounded-lg px-3.5 py-2 text-sm font-medium transition">
                        <Trash2 className="w-4 h-4" /> Sil
                      </button>
                    )}
                  </div>
                </div>
                {tokMesaj && <div className="mt-3 bg-blue-500/10 border border-blue-500/25 text-blue-200 text-sm rounded-lg px-4 py-2">{tokMesaj}</div>}
                {tokTest && (
                  <div className="mt-2 bg-gray-900/60 border border-gray-700/50 rounded-lg p-2 max-h-28 overflow-auto">
                    <div className="text-xs text-gray-400">HTTP {tokTest.httpStatus} — {tokTest.url}</div>
                    <pre className="text-xs text-gray-300 whitespace-pre-wrap break-all">{tokTest.govde}</pre>
                  </div>
                )}
              </div>

              {/* C. Gonderim takip tablosu */}
              <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-blue-800/40 text-gray-300 text-sm font-semibold">Gönderim Takip Tablosu — {secimEtiketi} · {String(efektifAy).padStart(2, '0')}/{yil} · {kayitlar.length} kayıt</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-blue-900/50 text-left text-gray-300">
                        <th className="px-4 py-3 font-semibold">Mükellef</th>
                        <th className="px-4 py-3 font-semibold">VKN/TCKN</th>
                        <th className="px-4 py-3 font-semibold">Beyanname</th>
                        <th className="px-4 py-3 font-semibold">Dönem</th>
                        <th className="px-4 py-3 font-semibold">Durum</th>
                        <th className="px-4 py-3 font-semibold">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-blue-800/30">
                      {kayitlar.length === 0 ? (
                        <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Bu tür/dönem için kayıt yok — "Mükellefleri Getir" ile oluşturun.</td></tr>
                      ) : kayitlar.map(k => {
                        const d = DURUMLAR[k.durum] || DURUMLAR.hazir
                        return (
                          <tr key={k.id} className="hover:bg-blue-900/20 transition-colors">
                            <td className="px-4 py-3 text-white max-w-[280px] truncate" title={k.ad}>{k.ad}</td>
                            <td className="px-4 py-3 text-gray-300 tabular-nums">{k.kimlikNo || '—'}</td>
                            <td className="px-4 py-3 text-gray-300">{turEtiket(k.beyanname_tur)}</td>
                            <td className="px-4 py-3 text-gray-300">{String(k.ay).padStart(2, '0')}/{k.yil}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-medium ${d.renk}`}>{d.ad}</span>
                              {k.mesaj && <div className="text-gray-500 text-xs mt-0.5 max-w-[260px] truncate" title={k.mesaj}>{k.mesaj}</div>}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1.5">
                                <button onClick={() => setOnizleme(k)} className="px-2.5 py-1 rounded-md bg-blue-800/70 hover:bg-blue-700 text-blue-200 text-xs font-medium transition">İncele</button>
                                <button
                                  onClick={async () => { const s = kontrolSonucu(k); await durumuGuncelle(k.id, { durum: s.ok ? 'gonderim' : 'kontrol', mesaj: s.ok ? 'Kontrol tamam.' : 'Eksikler: ' + s.eksikler.join(', ') }); await kayitlariYukle() }}
                                  className="px-2.5 py-1 rounded-md bg-amber-800/70 hover:bg-amber-700 text-amber-200 text-xs font-medium transition"
                                >Kontrol et</button>
                                {k.durum !== 'gonderildi_test' && k.durum !== 'gonderildi' && (
                                  <button
                                    onClick={async () => { await testGonder(k); await kayitlariYukle() }}
                                    className="px-2.5 py-1 rounded-md bg-violet-800/70 hover:bg-violet-700 text-violet-200 text-xs font-medium transition"
                                  >Gönder</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Onizleme modali */}
      {onizleme && (
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setOnizleme(null)}>
          <div className="bg-blue-950 border border-blue-700/50 rounded-2xl shadow-2xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-bold text-lg mb-1">Beyanname Önizleme</h3>
            <p className="text-gray-400 text-xs mb-4">Gönderilecek beyanname özeti — XML önizleme GİB entegrasyonu sonrası eklenecek.</p>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-gray-400">Mükellef</dt><dd className="text-white">{onizleme.ad}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-400">VKN/TCKN</dt><dd className="text-white tabular-nums">{onizleme.kimlikNo || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-400">Beyanname Türü</dt><dd className="text-white">{turEtiket(onizleme.beyanname_tur)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-400">Dönem</dt><dd className="text-white">{String(onizleme.ay).padStart(2, '0')}/{onizleme.yil}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-400">Durum</dt><dd className={DURUMLAR[onizleme.durum]?.renk || ''}>{DURUMLAR[onizleme.durum]?.ad || onizleme.durum}</dd></div>
              {onizleme.gib_referans && <div className="flex justify-between"><dt className="text-gray-400">Referans</dt><dd className="text-gray-300 font-mono text-xs">{onizleme.gib_referans}</dd></div>}
            </dl>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setOnizleme(null)} className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-4 py-2 text-sm font-medium transition">Kapat</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
