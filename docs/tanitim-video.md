# MUBiS ERP — Tanıtım Videosu Prodüksiyon Paketi

**Format:** 60–75 saniye · Ekran kaydı + Türkçe seslendirme · Genel tanıtım
**Çözünürlük:** 1920×1080 · 30 fps · MP4 (H.264)
**Kullanım yerleri:** Ana sayfa, Instagram/Youtube Shorts (dikey kopya sonradan), LinkedIn

---

## 1) Sahne Sahne Senaryo (Storyboard)

| # | Süre | Ekranda Ne Olur | Seslendirme Metni |
|---|------|-----------------|-------------------|
| 1 | 0–5 sn | Beyaz/mavi ekranda logo animasyonu → `mubiserp.com` ana sayfası | "Mali müşavirin dijital çalışma masası: MUBiS." |
| 2 | 5–12 sn | Giriş ekranı → admin masası açılır, sol menü ve kartlar görünür | "Müvekkilleriniz, beyanlarınız, faturalarınız ve raporlarınız — hepsi tek ekranda." |
| 3 | 12–20 sn | **Otomatik Borç Sorgu**: "Sorgula" tıklaması → sonuç kartları dolar | "SGK ve vergi borçlarını tek tıkla sorgular, sonucu raporlar." |
| 4 | 20–27 sn | **Aylık Beyan Takip**: takvim görünümü, beyan durumu yeşillenen satırlar | "Aylık beyan takibiyle hiç bir beyanı kaçırmazsınız." |
| 5 | 27–34 sn | **E-Fatura İşlemleri**: liste yüklenir, bir fatura detay açılır | "e-Fatura, e-Arşiv ve duyru ükr fatura okuma — otomatik." |
| 6 | 34–41 sn | **MÜBİS Asistan**: asistan penceresi açılır, bir soru yazılır, yanıt gelir | "Yapay zeka asistanınız MÜBİS Asistan, her adımda yanınızda." |
| 7 | 41–48 sn | **Belge merkezi**: belge yükleme (sürükle-bırak) → OCR/Drive ikonu | "Belgeleriniz bulutta, Google Drive ile asla kaybolmaz." |
| 8 | 48–55 sn | **Müşteri portalı**: müşteri görünümüne geçiş, tebligat/belge ekranı | "Müvekkilleriniz kendi portalından belgelerine ve beyanlarına ulaşır." |
| 9 | 55–62 sn | **Hesaplama araçları**: bir hesaplama aracı hızlıca kullanılır | "Kira stopajından damga vergisine — yüzlerce hesaplama aracı hazır." |
| 10 | 62–72 sn | Logo + slogan + web adresi + iletişim | "MUBiS — maliyetinizi değil, zamanınızı düşürelim. mubiserp.com" |

> Toplam seslendirme ~70 sn. Metin tonu: sakin, güven veren, kısa cümleler.

## 2) Tek Parça Seslendirme Metni (kopyalayıp TTS'e verebilirsiniz)

> Mali müşavirin dijital çalışma masası: MUBiS.
> Müvekkilleriniz, beyanlarınız, faturalarınız ve raporlarınız — hepsi tek ekranda.
> SGK ve vergi borçlarını tek tıkla sorgular, sonucu raporlar.
> Aylık beyan takibiyle hiç bir beyanı kaçırmazsınız.
> e-Fatura, e-Arşiv ve e-Duyru; fatura okuma tamamen otomatik.
> Yapay zeka asistanınız MÜBİS Asistan her adımda yanınızda.
> Belgeleriniz bulutta; Google Drive entegrasyonuyla asla kaybolmaz.
> Müvekkilleriniz kendi portalından belgelerine ve beyanlarına ulaşır.
> Kira stopajından damga vergisine, yüzlerce hesaplama aracı hazır.
> MUBiS — maliyetinizi değil, zamanınızı düşürelim.
> mubiserp.com

*(Düzeltme notu: sahne 5 metnini uygulama ekranınıza göre "e-SMM" vb. olarak değiştirin.)*

## 3) Kayıt Rehberi (OBS Studio — ücretsiz)

**Kurulum:**
1. OBS Studio indirin → ilk kurulumda "Ekran kaydı" seçin
2. Ayarlar → Video: Çözünürlük **1920×1080**, FPS **30**
3. Ayarlar → Çıktı → Kayıt Formatı **MP4** (veya MKV → MP4'e çevirin), Bitrate **8000**
4. Kaynak: **Ekran yakalama** (Display Capture) + tarayıcı tam ekran (F11)

**Kayıt öncesi kontrol listesi:**
- [ ] Tarayıcıda gereksiz sekmeler kapalı, yer imleri çubuğu gizli
- [ ] Demo verisi kullanın — gerçek müvekkil bilgisi ekranı geçmesin (KVKK!)
- [ ] İmleci büyütün: Windows Ayarları → Erişilebilirlik → Fare imleci boyut 3-4
- [ ] Bildirimleri kapatın: Odaklanma Yardımı (Focus Assist) açık
- [ ] Her sahneyi ayrı ayrı kaydedin (tek uzun kayıt yerine — kesme kolaylaşır)
- [ ] Her sahneden önce 1 sn durun, işlemi yavaş yapın

**Sahne sırası (kayıt planı):**
1. Ana sayfa (logo zaten açılışta görünüyor) → F5 ile yenileyip açılış alın
2. Giriş → admin masası yükleme
3. Sol menü → "Otomatik Borç Sorgu" → sorgulama
4. "Aylık Beyan Takip" → bir ay seç, durum değişimi
5. "E-Fatura İşlemleri" → liste → detay
6. MÜBİS Asistan → bir soru sor (ör. "Bu ay hangi beyanlar zorunlu?")
7. Belge merkezi → sürükle-bırak yükleme
8. Müşteri portalı (varsa demo müşteri hesabıyla)
9. Hesaplama araçları → bir araç kullan
10. Kapanış kartı (OBS'de değil, editörde ekleyin)

## 4) Seslendirme Seçenekleri

| Yöntem | Neden | Not |
|--------|-------|-----|
| **ElevenLabs** (önerilen) | En doğal Türkçe AI ses | "multilingual-v2", ses: Adam/Nadia tarzı; metni 1. bölümdeki tek parça metin olarak yapıştırın |
| **Microsoft Clipchamp / Edge TTS** | Ücretsiz, Türkçe sesler | Kalite orta, hızlı |
| **Kendi sesiniz** | Güven verir | Mikrofonu yastıkla çevirin (eko azaltın), sakin konuşun |

Seslendirme önce kaydedilir; ekran kaydını sesin süresine göre kesersiniz.

## 5) Müzik

- **YouTube Audio Library** (ücretsiz, telifsiz): "Technology" / "Corporate" kategorisi, düşük tempo
- Öneri: "Cyborg" veya "Mission" benzeri parçalar; ses seviyesi seslendirmenin **%20'sini** geçmesin

## 6) Düzenleme (ücretsiz araçlar)

- **CapCut Desktop** (kolay) veya **DaVinci Resolve** (profesyonel)
- Sıra: seslendirme şeridini ortaya koy → ekran görüntülerini senaryoya göre hizala
- Geçişler: basit **çapraz erime (dissolve)** 0.3 sn — başka efektle uğraşmayın
- Sahne 10: mavi arka plan + logo + `mubiserp.com` yazısı (CapCut'ta hazır şablon)
- Alt yazı: CapCut "Otomatik altyazı" (Türkçe) — ses duymayan izleyiciler için + Shorts'ta okunur

## 7) Yerleştirme

Ana sayfaya koymak için:
- Videoyu Cloudflare R2 veya YouTube'a (liste dışı) yükleyin
- Ana sayfa hero bölümüne `<video autoplay muted loop>` (sessiz döngü!) veya YouTube embed ekleyin
- Sosyal medya için dikey 9:16 kopya: CapCut'ta aynı klipleri dikey şablona yerleştirin

## 8) Süre Planı Özeti

| İş | Süre |
|----|------|
| Ekran kayıtları (10 sahne) | ~45 dk |
| Seslendirme (TTS ile) | ~15 dk |
| Kurgu + müzik + altyazı | ~1-2 saat |
| **Toplam** | **~3 saat** |
