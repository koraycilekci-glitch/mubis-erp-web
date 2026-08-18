# MUBiS Automation

Mükelleflerin e-Tebligat (e-Devlet / Dijital Vergi Dairesi) ve SGK e-Bildirge/e-SGK portallarına otomatik giriş yaparak belgeleri indirmesini sağlayan ayrık sunucu servisi.

## Mimari

```
MUBiS ERP (Vercel)  ──HTTP+X-API-Key──►  MUBiS Automation (Linux VPS)
                                               │
                                               ├── FastAPI (api/)
                                               ├── Celery Worker (worker/)
                                               ├── Celery Beat (scheduler/)
                                               ├── Redis (kuyruk)
                                               ├── PostgreSQL (yerel log)
                                               └── Playwright (tarayıcı)
```

## Kurulum

### 1. Sunucu gereksinimleri

- Ubuntu 24.04 LTS
- Docker + Docker Compose
- En az 2 CPU / 4 GB RAM

### 2. Kaynak kodu sunucuya kopyalayın

```bash
git clone <repo-url> /opt/mubis-automation
cd /opt/mubis-automation
```

### 3. Ortam değişkenlerini ayarlayın

```bash
cp .env.example .env
nano .env
```

Mutlaka doldurulması gerekenler:

- `API_KEY` — Vercel'deki `VITE_AUTOMATION_API_KEY` ile aynı olmalı
- `SUPABASE_URL` — MUBiS ERP'nin Supabase URL'si
- `SUPABASE_SERVICE_KEY` — Supabase service_role key
- `PORTAL_CRYPTO_KEY` — Vercel'deki `VITE_PORTAL_CRYPTO_KEY` ile aynı olmalı

### 4. Docker servislerini başlatın

```bash
docker compose up -d --build
```

### 5. Sağlık kontrolü

```bash
curl https://<sunucu-ip>:8000/health
```

## Vercel Tarafında Yapılacaklar

1. **Ortam değişkenleri ekle:**

```
VITE_AUTOMATION_API_URL=https://auto.mubiserp.com.tr
VITE_AUTOMATION_API_KEY=<API_KEY ile aynı>
```

2. **DNS / SSL:**
   - `auto.mubiserp.com.tr` veya `api.mubiserp.com.tr` A kaydını sunucu IP'sine yönlendir.
   - Reverse proxy olarak Nginx veya Traefik kullan.

## Port Detayları

| Port | Açıklama |
|------|----------|
| 8000 | FastAPI HTTP API |
| 6379 | Redis |
| 5432 | PostgreSQL (dışarı açılmasına gerek yok) |

## Güvenlik

- `X-API-Key` header'ı olmadan hiçbir endpoint çalışmaz.
- `SUPABASE_SERVICE_KEY` ve `PORTAL_CRYPTO_KEY` asla kaynak koda yazılmaz.
- Robotlar sadece Supabase'den okunan şifreli kimlik bilgilerini kullanır.

## Geliştirme

```bash
# Lokal (Docker olmadan) çalıştırma
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
playwright install chromium
cp .env.example .env
uvicorn api.main:app --reload
```

## Robotların Gerçek Portallara Uyarlanması

`worker/browsers/edevlet.py` ve `worker/browsers/sgk.py` dosyalarındaki
login URL'leri ve CSS selector'ları hedef portalların güncel yapısına göre
düzenlenmelidir. Mevcut haliyle iskelet (placeholder) fonksiyonlardır.
