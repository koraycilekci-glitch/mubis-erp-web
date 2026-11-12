# e-Beyan Yeni Sistem Prosedürü (ebeyan.gib.gov.tr)

> Kayıt: 30.10.2026 — Kullanıcının canlı gösterimiyle adım adım alındı.
> Bu yeni sistem, defterbeyan.gov.tr (İVD) yerine geçiyor. Bundan sonra TÜM
> beyannameler (KDV1, KDV2, Geçici, Damga vb.) bu yol üzerinden verilecek.

## 1. Dijital Vergi Dairesi'nden geçiş

- **dijital.gib.gov.tr** ana sayfası → sol altta "Geçiş Yapılabilecek Uygulamalar"
  kutusundan **e-Beyan** uygulamasına tıklanır (daire içinde işaretli kutucuk).
- Yeni sekmede **ebeyan.gib.gov.tr** açılır. Oturum Dijital VD'den taşınır
  (ayrı giriş gerekmez).

## 2. Mükellef seçimi

- Sağ üstte **HIZLI MENÜ** → arama kutusuna mükellef adı/VKN yazılır →
  listeden mükellef seçilir (örn. "AHMET ATEŞ | 1000173429").
- Seçilen mükellef sağ üstte "Seçilen Mükellef" kutusunda görünür.

## 3. Beyanname türü seçimi (tüm türler için aynı yol)

- **YENİ BEYANNAME** düğmesine tıklanır → açılır listeden tür seçilir:
  - **0015 - KDV1**
  - **0032 - GGECICI** (Geçici Vergi — gelir VE kurum, ikisi de buradan)
  - **4017 - KDV2**
  - **9015 - KDV9015**
  - **9047 - DAMGAKK** (Damga Vergisi)
- Bu yol artık tüm beyannamelerde kullanılacak (defterbeyan akışları
  buraya taşınacak).

## 4. İdari Bilgiler (0032 - Geçici Vergi)

Mükellef tipine göre sistem formu kendisi belirler:
- Gerçek kişi (1. sınıf bilanço dahil): **"Gelir Geçici Vergi Beyannamesi
  (Gelir Vergisi Mükellefleri İçin)"**
- Şirket: **"Geçici Vergi Beyannamesi (Kurumlar Vergisi Mükellefleri İçin)"**
  (URL: `ebeyan.gib.gov.tr/kurumlar-gecid/tr/idari-bilgiler`)

Ekran alanları:
- **Vergi Dönemi Tipi:** Her zaman **"Geçici Vergi Dönemi (Normal Dönem)"**
  seçili kalır — "Geçici Vergi Özel Hesap Dönemi" HİÇBİR ZAMAN seçilmez.
- **Yıl:** MUBiS'ten seçilen yıl yazılır (örn. 2026).
- **Dönem:** MUBiS'ten seçilen çeyrek yazılır (örn. 3. Dönem).
- **Vergi Dairesi:** OTOMATİK gelir — dokunulmaz.
- **TASLAK OLUŞTUR** düğmesiyle ilerlenir.

## 5. Sonrası (henüz kayıt edilmedi)

TASLAK OLUŞTUR sonrasındaki ekranlar (bilgi girişi, hesap özeti değerlerinin
nereye yazılacağı, onay/gönderim adımları) kullanıcıdan alınacak.

## Uygulanacak yerler

- MUBiS **Beyanname Gönderim > e-Beyanname** bölümü bu yola göre düzenlenecek.
- Yardımcı programın (gib-yardimci) beyanname adımları e-Beyan sistemine
  taşınacak — önce Geçici Vergi (bilanço + kurum), sonra diğer türler.
- Defterbeyan'daki mevcut akışlar (hesap özeti, geçici vergi) yeni sisteme
  göre yeniden yazılacak.
