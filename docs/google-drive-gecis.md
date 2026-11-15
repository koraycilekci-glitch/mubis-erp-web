# Google Drive Belge Depolama — Kurulum ve Geçiş

MUBİS ERP'de müşteri belgeleri artık **Google Drive**'da saklanıyor.
Supabase'de yalnızca dosya kimliği, adı, yolu ve bağlantısı tutuluyor.

```
Google Drive  →  dosyaların kendisi (PDF, XML, Excel, ZIP, görsel)
Supabase      →  clients, belge kayıtları, drive_belgeler (referanslar)
Vercel        →  /api/drive-auth, /api/drive (güvenli token + klasör işlemleri)
MUBİS ERP     →  mevcut ekranlar (değişmeden çalışır)
```

Drive klasör düzeni:

```
MUBIS ERP/
  └── <Müşteri>/
      └── <Yıl>/
          └── <AY>/
              ├── GELEN/
              └── GIDEN/
```

Beyanname/tahakkuk gibi belgeler `belge_turu` ile işaretlenir; fatura ve
e-Defter belgeleri yıl/ay/GELEN-GIDEN düzenine otomatik yerleşir.

---

## 1. Supabase tablosu

Supabase → **SQL Editor** → `supabase/google_drive_documents.sql` içeriğini çalıştır.

Oluşanlar:
- `drive_belgeler` tablosu (dosya referansları)
- `borc_sonuclari` üzerine `drive_file_id`, `google_drive_link`, `drive_status`

---

## 2. Google Cloud yetkilendirmesi

1. Google Cloud Console → **APIs & Services** → **Library** → *Google Drive API* → **Enable**
2. **Credentials** → OAuth 2.0 Client (Web application) → **Authorized redirect URIs**:
   ```
   https://<alan-adiniz>/api/drive-auth
   ```
   Bu değer Vercel'deki `GOOGLE_REDIRECT_URI` ile **birebir** aynı olmalı.
3. Vercel → Settings → Environment Variables:
   | Değişken | Açıklama |
   |---|---|
   | `GOOGLE_CLIENT_ID` | OAuth client id |
   | `GOOGLE_CLIENT_SECRET` | OAuth client secret |
   | `GOOGLE_REDIRECT_URI` | `https://<alan-adınız>/api/drive-auth` |
   | `GOOGLE_DRIVE_FOLDER_ID` | *(opsiyonel)* kök klasör id; boşsa `MUBIS ERP` klasörü otomatik açılır |

---

## 3. Bağlantıyı kur

MUBİS ERP → **Ayarlar** → **Belge Depolama (Drive)**:

1. **Google Drive Bağla** → Google izin ekranı → onayla
2. Dönüşte durum **Bağlı** olmalı
3. **Bağlantıyı Test Et** → `MUBIS ERP` kök klasörü Drive'da görünür

Bağlantı `app_settings` tablosunda `google_drive_refresh_token` olarak saklanır.
**Bağlantıyı Kes** yalnızca anahtarı siler; Drive'daki dosyalar silinmez.

---

## 4. Geçiş (mevcut Supabase dosyaları)

> Kural: **Eski Supabase dosyaları Drive'a aktarılıp doğrulanmadan silinmez.**

```bash
# 1) Sadece listele — hiçbir şey yazılmaz
node scripts/drive-gecis.mjs --dry-run

# 2) Küçük bir grupla dene (50 dosya)
node scripts/drive-gecis.mjs --limit 50

# 3) Tümünü taşı (dosyalar KOPYALANIR, silinmez)
node scripts/drive-gecis.mjs

# 4) Doğrulama raporu
node scripts/drive-gecis.mjs --rapor

# 5) Doğrulanmışları Storage'dan sil (yalnızca --onay ile)
node scripts/drive-gecis.mjs --sil --onay
```

Gerekli ortam değişkenleri (`.env.local` veya kabuk):

```
VITE_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
```

> `GOOGLE_REFRESH_TOKEN` değeri bağlantı kurulduktan sonra Supabase'de
> `app_settings` → `google_drive_refresh_token` satırından alınabilir.

### Doğrulama mantığı

| Kontrol | Sonuç |
|---|---|
| Drive `sha1` = yerel `sha1` | `durum = aktif` → silinebilir |
| `sha1` farklı / boş | `durum = supheli` → **silinmez**, elle bakılır |
| Drive'da dosya yok | silinmez, hata loglanır |

Her kayıt `kaynak = supabase-storage` ve `eski_storage_path = "<bucket>/<yol>"`
alarak izlenebilir kalır.

---

## 5. Hata durumları

| Durum | Davranış |
|---|---|
| Drive bağlı değil | Yükleme eskisi gibi Supabase Storage'a düşer (sistem durmaz) |
| Drive yükleme başarısız | Supabase Storage'a düşer, konsola uyarı yazılır |
| Token süresi bitti | İstemci otomatik yeniler (`/api/drive` kısa ömürlü token verir) |
| Drive bağlantısı kesildi | Dosyalar Drive'da kalır; yeniden bağlanınca erişim geri gelir |

Bu sayede **Drive kesintisi belge kaybına yol açmaz**.

---

## 6. Dosya boyutu notu

Vercel serverless gövde limiti ~4.5 MB'dır. Bu yüzden yükleme/indirme
**tarayıcıdan doğrudan Google'a** yapılır; `/api/drive` yalnızca kısa ömürlü
access token ve klasör işlemleri için kullanılır. 100 MB'lık bir e-Defter ZIP'i
de sorunsuz yüklenir.
