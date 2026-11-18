# MUBiS ERP vs Exe Helper: Fatura Sorgulama ve Yükleme Karşılaştırması

## Genel Fark

| Özellik | MUBiS ERP Web Uygulaması | Exe Helper Programı |
|---------|-------------------------|---------------------|
| Mimari | React + Vite + Supabase (cloud-first) | Electron + Chromium + Node.js (desktop) |
| Dağıtım | Web (pages.dev), VPS/YBS only | Masaüstü uygulaması (port 8765) |
| Kaynak erişimi | `app.asar` üzerinden semantik okunur | Dosyalar doğrudan erişilebilir |
| Lisans/ politika | Third-party exe code copy yapilmaz; reimplemented independently | Electron app, semantics from app.asar |

## Fatura Sorgulama (Query)

### MUBiS ERP Web

**Kapalı modüller (mevcut):**
- `efatura-sorgula` — Luca Baglanti Merkezi üzerinden (mali musavir girişi)
- `vergi-etebligat-sorgula` — SGK/vergi borç sorgulama
- `dvs-sorgula` — DVS sorgulaması
- `efatura-gib-sorgula` — GIB e-Arsiv porta sorgulama

**Veri kaynağı:**
- Supabase'den `efatura_faturalar` tablosu
- SayfaliGetir() ile 1000 satır limiti aşılma
- KDV2 (tevkifatlı alış): `yon='gelen'` + `fatura_turu` containing `TEVKIFAT`, excluding `IADE`
- e-SMM list: `tur='esmm'`, `yon='gelen'`; şirkete göre grup bazlı

**Özellikler:**
- Çoklu KDV oranları (`efatura_kdv_detay` tablosu)
- Dinamik kolonlar
- "Okuma Durumu" bilgisi
- Excel export (fatura Excel)
- PDF/XML toplu ZIP indirme (4 paralel işçi, ilerleme bandı)

### Exe Helper Programı

**Kapalı modüller:**
- `efatura-sorgula` — Luca Baglanti Merkezi entegrasyonu
- `luca-giris` / `luca-oturumu-kapat` — Oturum yönetimi
- `luca-belgeleri-indir` — Belge indirme akışı
- `vergi-etebligat-sorgula` — SGK/vergi borçları
- `dvs-sorgula` — DVS sorgulama

**Veri akışı:**
- Chrome/Edge (puppeteer) ile GIB sayfalarını açar
- PDF/XML indirme ve kaydetme
- `sayfalariIndir` ile sayfalama (arsiviDogrula + sayfalariIndir)
- `lucaDogrulanmisZipKaydet` ile ZIP doğrulama
- ZIP fd argümanı hatası (2.8.344): `fs.readSync(ifd, imza, 0, 2, 0)` düzeltmesi

**Özellikler:**
- 2.8.344 sürümü aktif
- `parsePara` negatif sayılar
- `donem` yıl/ay formatı
- PDF parser satır sonundan bağımsız global regex (2.8.342+)
- ZIP indirme `fd` argümanı hatası (2.8.344): düzeltildi
- Beyan zorunluluk matrisi ve finansman kısıtlaması (2.8.344+)
- 1000 satır Supabase limiti `sayfaliGetir()` ile çözülüyor

## Fatura Yükleme (Loading/Import)

### MUBiS ERP Web

**Desteklenen kaynaklar:**
- XML dosyaları (ULB formatı)
- PDF'ler (izleyici ile resmi A4 PDF'ye çevrilir)
- e-Arşiv alış, e-SMM alış, UTTS alış tipleri

**Akış:**
1. Fatura XML'leri yüklenir
2. XML'ler `ublAyikla` ile ayrıştırılır
3. Fatura HTML'leri oluşturulur (`faturaHtmlOlustur`)
4. İndirilen XML'ler aynı isimle `.pdf` olarak çevrilir
5. Web tarafı izleyici `.pdf`'i Storage'a yükler
6. Web goruntuleme ekranı doğrudan gerçek PDF açar

**Desteklenen klasörler:**
- `G:\Drive'ım\BEYANNAME` (beyanname klasörü)
- `G:\Drive'ım\EDEFTER` (fatura gelen/giden)

### Exe Helper Programı

**Desteklenen kaynaklar:**
- ZIP toplu indirme (4 paralel işçi)
- PDF/XML ayrıştırma
- `belge-sec-indir` adımı: PDF'ler indiriliyor
- Fatura tipleri: e-Arşiv alış, e-SMM alış, UTTS alış

**Akış (belge-sec-indir):**
1. PDF'ler GIB üzerinden indirilir → klasöre koyulur
2. PDF parse edilir (`parsePara`, `donem` yıl/ay formatı)
3. Yıllık veri otomatik doldurulur

**Sorunlar (belge bulunamadı):**
- `e-Arşiv (Alış)` — "belge bulunamadı" hatası
- `e-SMM (Alış)` — "belge bulunamadı" hatası
- `UTTS (Alış)` — "belge bulunamadı" hatası

**Düzeltilen sorunlar:**
- ZIP indirme `fd` argümanı hatası 2.8.344 ile düzeltildi
- PDF parser satır sonundan bağımsız global regex (2.8.342+)
- 28 kalem OK, toplam 3.454.692,06 TL

## Ortak Noktalar ve Uyum

| Özellik | MUBiS ERP | Exe Helper | Durum |
|---------|-----------|------------|-------|
| GIB bağlantısı | Luca Baglanti Merkezi | Luca Baglanti Merkezi | ✅ Uyumlu |
| PDF/XML parsing | `ublAyikla`, `faturaHtmlOlustur` | `parsePara`, global regex | ✅ Independently implemented |
| ZIP indirme | 4 parallel worker, progress bandı | 4 parallel worker, fd argümani | ✅ Uyumlu (fd fix 2.8.344) |
| SayfaliGetir | Supabase 1000 satır limiti | Destekleniyor | ✅ Aynı pattern |
| Tevkifat (KDV2) | `fatura_turu` containing TEVKIFAT | Benzer logic | ✅ Uyumlu |
| e-SMM listesi | `tur='esmm'`, `yon='gelen'` | `tur='esmm'`, `yon='gelen'` | ✅ Uyumlu |
| Beyan parse | `e-Beyanname PDF parse` | Benzer parsing logic | ✅ Reimplemented |
| ZIP fd hatası | Ekli değil | 2.8.344 ile fixed | ✅ Ayırt edilebilir |

## Farklar (Why Independent Implementation)

1. **Exe kopyalanmaz** — Third-party exe code projeye kopyalanmaz
2. **Semantics from app.asar** — Sadece semantik okunur, kopyalanmaz
3. **Web mimarisi farklı** — React + Supabase, Electron + Node ayrılımları
4. **VPS/YBS only** — SGK, vergi borcı ve e-Tebligat sorgulamaları VPS/YBS'de
5. **Source parity** — Kaynak değişiklikler commit edilir, untracked `mubis-asistan/` commit edilmez

## Özet

| İşlem | MUBiS ERP Web | Exe Helper | Karşılaştırma |
|-------|---------------|------------|--------------|
| **Sorgulama** | Supabase + Luca API | Chromium + Luca API | Web: DB-first, Exe: Browser-first |
| **PDF/XML parse** | `faturaGorunum.js` modülü | `app.asar` extract + regex | Her ikisi de `TEVKIFAT` patternini destekler |
| **ZIP indirme** | 4 worker + progress bar | 4 worker + fd argümani | Web daha modern UI, Exe daha veciz |
| **1000 satır limit** | `sayfaliGetir()` | `sayfaliGetir()` | Aynı çözüm |
| **KDV2 / Tevkifat** | `fatura_turu` filtreleme | Benzer filtre | Logic uyumlu |
| **e-SMM listesi** | Şirkete göre group + Excel | `tur='esmm'`, `yon='gelen'` | Aynı veri modeli |

**Sonuç:** MUBiS ERP web uygulaması ve exe helper programı aynı verileri (GIB, Luca, Supabase) kullanır ancak mimariler farklıdır. Web uygulaması features independently reimplements (kopyalanmaz), aynı deseni ve logic patterns kullanarak uyumluluk sağlar. Exe 2.8.344 sürümü ZIP fd hatası ve PDF parser güncellemesiyle desteklenirken, web uygulaması aynı fonksiyonluluğu kendi modülleriyle sağlar.