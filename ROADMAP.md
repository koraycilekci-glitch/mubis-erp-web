# 🚀 MUBİS ERP 1.0 Yol Haritası

## Genel Vizyon
MUBİS ERP sadece bir muhasebe programı değil; **AI destekli bir muhasebe operasyon platformu** olacak.

```
Müşteri PDF yükledi
    ↓
AI okudu
    ↓
Tahakkuk oluştu
    ↓
WhatsApp hazırlandı
    ↓
Mail gönderildi
    ↓
Portal güncellendi
    ↓
Ödeme geldi
    ↓
Dekont okundu
    ↓
Borç kapandı
    ↓
Muhasebeciye sadece onay kaldı
```

---

## 🔵 Faz 1 – Çekirdek Sistem (Öncelik: Çok Yüksek)

Bunlar tamamlanmadan diğer modüllere geçilmeyecek.

### 1. Müşteri Portalı
- [x] Giriş sistemi (AuthContext, Supabase Auth)
- [x] Dashboard (ClientPortal.jsx)
- [x] Vergi Takvimi (VergiTakvimi.jsx)
- [x] Tahakkuk görüntüleme
- [x] Borç Takibi (BorcTakibi.jsx)
- [x] Muhasebe ücretleri
- [x] Dosya indirme

**Durum:** ✅ Tamamlandı

---

### 2. Belge Analiz Motoru (AI)
İlk geliştirilecek AI modülü.

**Desteklenecek Belgeler:**
- [x] KDV Tahakkuku
- [x] Muhtasar Tahakkuku
- [x] SGK Tahakkuku
- [x] Geçici Vergi
- [x] Kurumlar Vergisi

**Çıktı Formatı:**
```json
{
  "document_type": "TAHAKKUK",
  "tax_type": "KDV",
  "period": "2026/07",
  "amount": 12540.32,
  "tax_base": 10000.00,
  "due_date": "2026-08-28",
  "company": "ABC LTD",
  "vkn": "6060018150",
  "accrual_no": "202607000123"
}
```

**Teknoloji Stack:**
- Client: `pdfjs-dist` (PDF metin çıkarma)
- Server: Regex Parser (hızlı, ücretsiz)
- Yedek: Groq AI (`llama-3.1-8b-instant`)
- Database: `document_analysis` tablosu

**Dosyalar:**
- `src/services/documentIntelligenceEngine.js`
- `api/analyze-document.js`
- `supabase/migrations/20250806_document_intelligence.sql`

**Durum:** ✅ Tamamlandı

---

### 3. İletişim Merkezi
Tek merkezden tüm iletişim kanalları.

**Kanallar:**
- [ ] WhatsApp Business API
- [ ] E-posta (SMTP)
- [ ] Portal Bildirimi
- [ ] SMS (isteğe bağlı)

**Özellikler:**
- [ ] Toplu duyuru gönderimi
- [ ] Borç hatırlatma mesajları
- [ ] Gönderim geçmişi
- [ ] Şablon yönetimi

**Teknoloji Stack:**
- `src/services/whatsappService.js`
- `src/services/emailService.js`
- `src/services/notificationService.js`
- `src/pages/DuyuruMerkezi.jsx`
- `src/pages/BorcBildirim.jsx`

**Durum:** ⏳ Planlandı

---

## 🟢 Faz 2 – AI Modülleri

### 🤖 Beyan Intelligence
Muhasebecinin günlük işini kolaylaştıracak.

**Özellikler:**
- [ ] Aylık beyan takvimi otomatik kontrol
- [ ] Eksik beyan tespiti
- [ ] Riskli müşteri analizi
- [ ] Son tarih uyarıları

**Örnek Kullanım:**
```
> Ağustos ayında verilmesi gereken beyannameler
↓
AI cevap verecek
↓
Eksik beyanları tespit edecek
↓
Riskli müşterileri gösterecek
```

**Durum:** ⏳ Planlandı

---

### 📄 Document Intelligence
Her belgeyi okuyacak.

**Desteklenecek Belgeler:**
- [x] Tahakkuk (KDV, Muhtasar, SGK, vb.)
- [ ] Vergi Levhası
- [ ] Faaliyet Belgesi
- [ ] Ticaret Sicili
- [ ] İmza Sirküsü
- [ ] e-Tebligat
- [ ] SGK Yazıları

**Durum:** 🔄 Kısmen Tamamlandı (Tahakkuk tamamlandı, diğer belgeler planlandı)

---

### 🧾 XML Intelligence
XML'den muhasebe fişine dönüşüm.

```
XML
    ↓
AI
    ↓
Muhasebe Fişi
    ↓
LUCA Excel
    ↓
İçe Aktar
```

**Özellikler:**
- [ ] XML parse etme
- [ ] Hesap kodu eşleştirme
- [ ] LUCA formatına dönüştürme
- [ ] Otomatik kaydetme

**Durum:** ⏳ Planlandı

---

### 💰 Finans Intelligence
Şirket için finansal analiz.

**Özellikler:**
- [ ] Kasa analizi
- [ ] Cari analiz
- [ ] Karlılık raporu
- [ ] Nakit akışı
- [ ] Tahsilat performansı

**Örnek Kullanım:**
```
> Son üç ayda tahsilat oranınız %12 düştü.
> Öneri: X müşterisine hatırlatma gönderin.
```

**Durum:** ⏳ Planlandı

---

### 💬 WhatsApp Intelligence
Akıllı mesajlaşma sistemi.

**Özellikler:**
- [ ] Müşteri mesajlarını anlama
- [ ] Dekont otomatik eşleştirme
- [ ] Borç durumu otomatik yanıt
- [ ] AI destekli müşteri hizmetleri

**Örnek Kullanım:**
```
Müşteri: "Dekont ektedir."
    ↓
AI: Dekontu okuyor
    ↓
Borçla eşleştiriyor
    ↓
Dashboard: 🟢 Ödendi
```

**Durum:** ⏳ Planlandı

---

## 🟠 Faz 3 – MUBİS AI Asistanı

### Genel AI Asistan
Doğal dil ile muhasebe sorguları.

**Örnek Kullanımlar:**
```
> Ahmet Kürel'in son 6 ay KDV toplamı nedir?
↓
AI: 75.240,50 TL

> En fazla geciken müşteriler hangileri?
↓
AI: Liste verir

> Bu ay toplam tahsil edilecek vergi ne kadar?
↓
AI: Rapor oluşturur
```

**Teknoloji:**
- RAG (Retrieval Augmented Generation)
- Supabase Vector Store
- OpenAI/Groq API

**Durum:** ⏳ Planlandı

---

## 🟣 Faz 4 – İmza ve E-Defter

### MUBİS Sign Center
- [ ] E-imza entegrasyonu
- [ ] Mali Mühür yönetimi
- [ ] USB Token yönetimi
- [ ] Bulut İmza (Mobil İmza)
- [ ] İmza Kuyruğu

### E-Defter Intelligence
- [ ] AI eksikleri bulacak
- [ ] Hataları raporlayacak
- [ ] Otomatik düzeltme önerileri

### e-Fatura Intelligence
- [ ] Fatura analizi
- [ ] Riskli faturaları gösterme
- [ ] Otomatik kategorilendirme

**Durum:** ⏳ Planlandı

---

## ⚫ Faz 5 – Yönetim Paneli

### Muhasebeci Dashboard
- [ ] Tüm müşteriler özet görünüm
- [ ] Beyan durumu genel rapor
- [ ] Tahsilat performansı
- [ ] İletişim geçmişi
- [ ] AI önerileri

**Durum:** ⏳ Planlandı

---

## 🌍 Faz 6 – MUBİS Marketplace

### Entegrasyonlar
Diğer yazılımlar bağlanabilecek.

**Planlanan Entegrasyonlar:**
- [ ] Logo
- [ ] LUCA
- [ ] Mikro
- [ ] Nebim
- [ ] Eta
- [ ] SAP
- [ ] Özel web servisleri

**Durum:** ⏳ Planlandı

---

## 🏗️ Mimari Prensipler

### Bağımsız Servisler
Her modül bağımsız servis olarak tasarlanacak:

```
📁 src/services/
├── document-service/         # Belge işlemleri
├── communication-service/    # WhatsApp, Email, SMS
├── ai-service/              # AI modülleri
├── finance-service/         # Finansal analiz
├── sign-service/            # İmza işlemleri
└── integration-service/     # Dış sistem entegrasyonları
```

### Teknoloji Stack
```
Frontend:     React + Vite + Tailwind CSS
Backend:      Vercel Serverless Functions
Database:     Supabase (PostgreSQL)
Storage:      Supabase Storage
Auth:         Supabase Auth
AI:           Groq/OpenAI API
PDF:          pdfjs-dist
WhatsApp:     WhatsApp Business API
Email:        SMTP/Nodemailer
```

---

## 📅 Öncelik Sırası

1. ✅ Belge Analiz Motoru (Faz 1.2)
2. ⏳ İletişim Merkezi (Faz 1.3)
3. ⏳ XML → LUCA Intelligence (Faz 2.3)
4. ⏳ Beyan Intelligence (Faz 2.1)
5. ⏳ Finans Intelligence (Faz 2.4)
6. ⏳ MUBİS AI Asistanı (Faz 3)
7. ⏳ MUBİS Sign Center (Faz 4.1)
8. ⏳ E-Defter Intelligence (Faz 4.2)

---

## 📊 Mevcut Durum Özeti

| Faz | Modül | Durum | Tamamlanma |
|-----|-------|-------|------------|
| Faz 1 | Müşteri Portalı | ✅ Tamamlandı | %100 |
| Faz 1 | Belge Analiz Motoru | ✅ Tamamlandı | %100 |
| Faz 1 | İletişim Merkezi | ⏳ Planlandı | %0 |
| Faz 2 | Beyan Intelligence | ⏳ Planlandı | %0 |
| Faz 2 | Document Intelligence | 🔄 Kısmen | %30 |
| Faz 2 | XML Intelligence | ⏳ Planlandı | %0 |
| Faz 2 | Finans Intelligence | ⏳ Planlandı | %0 |
| Faz 2 | WhatsApp Intelligence | ⏳ Planlandı | %0 |
| Faz 3 | MUBİS AI Asistanı | ⏳ Planlandı | %0 |
| Faz 4 | Sign Center | ⏳ Planlandı | %0 |
| Faz 4 | E-Defter Intelligence | ⏳ Planlandı | %0 |
| Faz 4 | e-Fatura Intelligence | ⏳ Planlandı | %0 |
| Faz 5 | Yönetim Paneli | ⏳ Planlandı | %0 |
| Faz 6 | Marketplace | ⏳ Planlandı | %0 |

---

## 🎯 Sonraki Adımlar

1. **Build & Deploy** - Mevcut değişiklikleri deploy et
2. **Faz 1.3** - İletişim Merkezi'ni başlat
3. **Test** - Belge Analiz Motoru'nu gerçek PDF'lerle test et
4. **Dokümantasyon** - API dokümantasyonu oluştur

---

*Son güncelleme: 6 Ağustos 2026*
*Versiyon: 1.0-Draft*