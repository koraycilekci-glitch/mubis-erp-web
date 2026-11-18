# MUBiS Mevzuat & AI Asistan

Mevzuat & AI Asistan, mali müşavirin **resmî yayınları, süreleri, mükellefleri ve ofis görevlerini tek yerden takip etmesini** amaçlayan bir modüldür. Temel çalışma ilkesi şu olacak: Sistem bilgi ve görev **önerir**; mevzuatın yorumlanması, kritik tarihler ve müşteriyle iletişim için **yetkili kişinin kontrolü ve onayı** esas alınır.

> **Mevcut durum:** Şu anda projede yalnızca **Resmî Mevzuat Kaynakları** ekranı hazırlanmış durumda. Aşağıda anlatılan otomatik tarama, yapay zekâ analizi, mükellef eşleştirme, görev ve bildirim özellikleri henüz tamamlanmış ve çalışır durumda değildir.

## 1. Hangi bölümleri kapsayacak?

### 1. Yeni Tebliğler ve Mevzuat

GİB, Resmî Gazete ve diğer kurumlarda yayımlanan ilgili duyuru ve düzenlemeler tek listede gösterilecek.

Her kayıt için, erişilebildiği ölçüde:

- Başlık, kurum ve yayın tarihi
- Resmî kaynak bağlantısı
- Yürürlük tarihi ve varsa geçiş hükümleri
- Kısa açıklama ve inceleme durumu
- Önceki sürüm veya düzenlemeyle karşılaştırma

Sistem bir kaynağa erişemez ya da metni okuyamazsa bunu **tarama hatası** olarak gösterecek; taramayı başarılı olmuş gibi sunmayacak.

### 2. Otomatik Vergi Takvimi

Resmî takvimlerden, duyurulardan ve onaylanmış mevzuat kayıtlarından vergiyle ilgili süreler takip edilecek.

Örneğin beyan, ödeme, e-Defter ve başvuru tarihleri; **dönem, son gün, dayanak bağlantısı ve doğrulama durumuyla** gösterilecek. Süre uzatımı tespit edildiğinde değişiklik incelemeye sunulacak.

Mevcut MUBİS vergi takvimi değerlendirilecek; yeni kayıtların mevcut tarihlerle çelişmesi veya çift bildirim oluşturması engellenecek. Kaynağı olmayan veya birbiriyle çelişen tarihler kesin tarih olarak gösterilmeyecek.

### 3. Beyanname Son Günleri

Beyannameler için yaklaşan son günler, dönemler ve ofis iş durumu takip edilecek. Uygun olduğunda mevcut beyan takip ekranına bağlanılacak; aynı iş için iki ayrı takip sistemi oluşturulmamaya çalışılacak.

Personel, örneğin yaklaşan beyannameleri ve tamamlanması gereken işleri görebilecek. Gerçek beyanın verilip verilmediği ise ancak MUBİS'te bu bilgiyi doğrulayacak güvenilir veri varsa gösterilecek.

### 4. SGK Süre Takibi

SGK duyurularından doğrulanabilen süreler, işverenlerle ilgili yükümlülükler ve başvuru tarihleri takip edilecek.

Bir teşvik veya yükümlülüğün hangi müşterileri ilgilendirebileceği aday olarak gösterilecek. **Aday eşleşme, müşterinin teşvike kesin hak kazandığı anlamına gelmeyecek.**

### 5. Başvuru ve Teşvik Takibi

Vergi, SGK, İŞKUR ve erişilebilen diğer resmî kaynaklardaki başvuru ve teşvik duyuruları listelenecek.

Bir kayıtta şu bilgiler bulunabilecek:

- Başvuru konusu ve ilgili kurum
- Şartlar ve resmî dayanak
- Başlangıç ve son başvuru tarihi
- İlgili olabilecek mükellefler
- Eksik bilgi veya kontrol gerektiren koşullar
- Sorumlu personel ve görev durumu

### 6. Yapay Zekâ Mevzuat Analizi

Yapay zekâ, erişilebilen resmî metinleri inceleyerek:

- Uzun metinleri özetleyebilecek,
- Önemli değişiklikleri aday olarak çıkarabilecek,
- Varsa önceki düzenlemeyle karşılaştırma hazırlayabilecek,
- Tarih ve yükümlülük adaylarını belirleyebilecek,
- İncelenmesi gereken belirsizlikleri işaretleyebilecek.

Yanıtlarda **kaynak bağlantısı ve mümkün olduğunda ilgili bölüm** gösterilecek. Önceki düzenlemeye ulaşılamazsa farklar tahmin edilmeyecek.

Yapay zekânın yanıtı, resmî mevzuatın veya mali müşavirin kararının yerine geçmeyecek.

### 7. Mükellef Etki Analizi

Onaylanmış kurallar ile MUBİS'teki mevcut müşteri bilgileri karşılaştırılarak hangi mükelleflerin bir düzenlemeden etkilenebileceği belirlenecek.

Örneğin sistem şunlara bakabilecek:

- Şirket veya mükellef türü
- Faaliyet kodu
- Mevcut beyan profili
- MUBİS'te gerçekten mevcut ve erişilebilir olan işveren/SGK bilgileri

Eksik veya eski bilgi varsa sonuç **"kontrol gerekli"** olarak gösterilecek. Sistem, elinde bulunmayan bilgileri varsayarak kesin uygunluk kararı vermeyecek.

### 8. Personel Görev Atama

Mevzuat veya süre takibinden doğan işler görev olarak önerilebilecek ya da müşavirce onaylanan kurallara göre oluşturulabilecek.

Görevlerde şu alanlar planlanıyor:

- İlgili müşteri ve konu
- Sorumlu personel
- Son tarih ve durum
- Açıklama ve resmî dayanak
- İşlem ve durum değişikliği geçmişi

Aynı kaynak ve müşteri için tekrar tekrar aynı görevin oluşması önlenecek.

### 9. WhatsApp Bildirimleri

İlk aşamada **MUBİS içi bildirimler** hazırlanacak. WhatsApp sağlayıcısı daha sonra seçilecek.

WhatsApp bağlantısı kurulmadan ve gerekli onaylar alınmadan müşteriye otomatik mesaj gönderilmeyecek. İleride entegrasyon yapıldığında yönetici onayı, alıcı izni ve gönderim durumunun takibi dikkate alınacak.

### 10. Yönetici Kontrol Paneli

Yönetici için özet bir ekran planlanıyor:

- İnceleme bekleyen mevzuat
- Yaklaşan ve geciken süreler
- Personel görevleri
- Müşavir onayı bekleyen öneriler
- Kaynak tarama hataları
- Kontrol gerektiren müşteri eşleşmeleri

Panel, otomasyonun çalışıp çalışmadığını ve hangi işlerin insan kontrolü beklediğini açıkça göstermeli.

---

## 2. Sistem günlük olarak nasıl çalışacak?

Planlanan akış şu şekilde:

1. **Kaynak taraması:** Sistem, erişim yöntemleri doğrulanmış resmî kaynakları belirlenen zamanlarda kontrol eder.
2. **Yeni kayıt tespiti:** Yeni yayınlar veya daha önce görülen yayınlardaki değişiklikler belirlenir.
3. **Analiz:** Okunabilen metinden özet, tarih ve yükümlülük adayları çıkarılır.
4. **Doğrulama:** Belirsiz bilgiler ve yeni/değişen tarihler yetkili kişinin incelemesine sunulur.
5. **Mükellef eşleştirme:** Onaylanan kurallar, yetki dahilindeki müşteri kayıtlarıyla karşılaştırılır.
6. **Görev ve bildirim:** Gerekli iş için personele görev veya MUBİS içi bildirim hazırlanır.
7. **Takip:** Yönetici, bekleyen onayları, hataları ve yaklaşan işleri panelden görür.

Örneğin yeni bir SGK teşvik duyurusu yayımlandığında sistem önce kaynağı ve şartları gösterir; ardından mevcut bilgilere göre ilgili olabilecek müşterileri listeler. Müşavir şartları kontrol edip onayladıktan sonra personele başvuru hazırlığı görevi atanabilir.

## 3. Nerelere bağlantı kurulacak?

### Resmî kaynaklar

Planlanan başlangıç kaynakları:

| Kaynak | Kullanım amacı |
|---|---|
| [GİB](https://www.gib.gov.tr/) | Vergi duyuruları, takvim ve ilgili yayınlar |
| [Resmî Gazete](https://www.resmigazete.gov.tr/) | Kanun, yönetmelik ve tebliğlerin resmî metinleri |
| [SGK](https://www.sgk.gov.tr/) | İşveren duyuruları, süreler ve teşvik bilgileri |
| [TÜRMOB](https://www.turmob.org.tr/) | Meslekle ilgili duyuru ve bilgilendirmeler |
| [İŞKUR](https://www.iskur.gov.tr/) | Erişilebilen işveren ve teşvik duyuruları |

**Önemli:** Her kurumun hazır ve açık bir API’si olduğu varsayılmıyor. Hangi sayfaların, formatların ve otomatik erişim yöntemlerinin kullanılabileceği; erişim koşulları ve kapsamı kurum bazında doğrulanacak. Bu nedenle ilk sürümde bütün kaynakların eşit kapsamda çalışacağına şimdiden söz verilemez.

### MUBİS içindeki bağlantılar

Modül, mevcut yapıyı yeniden kullanacak şekilde tasarlanıyor:

- **Müşteri kayıtları:** Mükellef etki analizi için.
- **Personel ve yetkiler:** Görev atama ve hangi kullanıcının neyi görebileceği için.
- **Vergi takvimi:** Doğrulanmış süreleri mevcut takvimle ilişkilendirmek için.
- **Beyan takibi:** İlgili dönem ve işlerin takibi için.
- **Bildirim merkezi:** MUBİS içi hatırlatmalar için.
- **Mevcut sohbet altyapısı:** Uygun yerlerde kaynaklı asistan deneyimi için.

Mevcut müşteri, personel ve yetki düzeninin korunması hedefleniyor.

### Teknik servisler

- **Supabase:** Mevzuat kayıtları, görevler, inceleme kararları, yetkiler ve geçmişin güvenli saklanması.
- **Cloudflare:** Sunucu tarafı işlemler ve doğrulanmış kaynakların zamanlanmış taranması.
- **Yapay zekâ servisi:** Kaynaklı özet ve analiz üretimi. Hangi servis ve modelin kullanılacağı yapılandırma ve kullanım koşullarıyla netleştirilecek.
- **WhatsApp sağlayıcısı:** Daha sonraki aşamada seçilecek; şu anda belirlenmiş bir bağlantı olarak kabul edilmiyor.

Mevcut MUBİS altyapısı **Supabase ve Cloudflare** kullandığı için ayrıca Firebase kurulması planlanmıyor.

## 4. Hatırlatmalar nasıl çalışacak?

Onaylanmış son tarihler için hedeflenen MUBİS içi uyarı düzeni:

| Zaman | Bildirim |
|---|---|
| 7 gün önce | Ön bilgilendirme |
| 3 gün önce | Personel uyarısı |
| 1 gün önce | Yönetici uyarısı |
| Son gün | Acil bildirim |
| Süre geçince | Gecikme alarmı |

Bildirimler kullanıcı bazında okunmuş/okunmamış takip edilecek. Aynı işlem tekrar çalıştığında gereksiz kopyalar oluşmaması ve süre uzatıldığında ilgili uyarıların güncellenmesi planlanıyor.

Mobil bildirim de istenen kapsamda bulunuyor; ancak mevcut mobil uygulamanın, izinlerin ve teknik yapılandırmanın durumu doğrulanmadan çalıştığı varsayılmayacak.

## 5. Yapay zekâ sohbetine neler sorulabilecek?

Örneğin:

- "Bu hafta hangi beyannamelerin son günü?"
- "Son yayımlanan vergi tebliğlerini özetle."
- "Bu ay süresi yaklaşan müşteri başvuruları neler?"
- "Yeni SGK teşvikinin şartları neler?"
- "Bu düzenlemeden etkilenebilecek müşterilerim hangileri?"
- "Yarın personele hangi işleri dağıtmalıyım?"

Yanıtlar, erişilebilen resmî kaynaklara ve kullanıcının **görmeye yetkili olduğu** MUBİS kayıtlarına dayanacak. Bilgi eksikse sistem bunu belirtecek; emin olmadığı bir tarihi veya müşteri uygunluğunu kesinmiş gibi sunmayacak.

## 6. Güvenlik ve müşteri verileri

Mükellef bilgilerinin yapay zekâ servisine gönderilmesi için daha önce belirlediğiniz tercih esas alınacak: **erişim yetkisi, gerekli veriyle sınırlama ve kayıtlı açık onay**.

- Personel yalnızca yetkili olduğu ofis ve müşteri verilerine erişebilecek.
- AI servisine iş için gerekli olmayan kişisel veriler gönderilmeyecek.
- Şifreler ve gizli anahtarlar yapay zekâya gönderilmeyecek.
- İnceleme, onay ve önemli işlemler kayıt altına alınacak.
- Model çıktısı doğrudan dış başvuru, müşteri mesajı veya kesin uygunluk kararı oluşturmayacak.

## 7. Tamamlanması için hangi aşamalar var?

1. **Veri ve yetki altyapısı:** Tablolar, ofis ayrımı ve erişim güvenliği.
2. **Kaynak tarama:** Resmî kaynakların erişim yöntemlerinin doğrulanması ve hata takibi.
3. **Takvim:** Kaynaklı tarih adayları, müşavir onayı ve mevcut takvimle uyum.
4. **AI analizi ve sohbet:** Kaynak gösteren, yetkili ve onaylı veri kullanan yanıtlar.
5. **Mükellef eşleştirme ve görevler:** Eksik veriyi belirten aday eşleşmeler ve personel takibi.
6. **MUBİS içi bildirimler ve yönetim paneli.**
7. **Daha sonra WhatsApp ve uygunluğu doğrulanırsa mobil bildirim bağlantıları.**

Her aşamada mevcut işlevleri korumak için güvenlik, tekrar çalıştırma ve mevcut ekranlarla uyumluluk testleri yapılması planlanıyor. Otomasyonlar önce kontrollü ve varsayılan olarak kapalı şekilde devreye alınacak.