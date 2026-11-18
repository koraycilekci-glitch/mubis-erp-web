-- ============================================================
-- MUBiS Mevzuat & AI Asistan — Veri Altyapısı (Faz 1)
-- ============================================================
-- Tablolar: mevzuat_kaynaklar, mevzuat_kayitlari, mevzuat_tarama_loglari,
--           mevzuat_kurallar (onaylanan), mevzuat_gorevler,
--           mevzuat_inceleme_kararlari, mevzuat_mukellef_eslesmeleri
-- RLS: ofis bazlı izolasyon (mevcut MUBiS pattern'ine uyumlu)
-- ============================================================

-- 1) Kaynaklar (taranacak resmi kaynaklar)
CREATE TABLE IF NOT EXISTS mevzuat_kaynaklar (
  id BIGSERIAL PRIMARY KEY,
  office_id BIGINT NOT NULL DEFAULT 1,
  ad TEXT NOT NULL,
  kurum TEXT NOT NULL,            -- GIB, Resmi Gazete, SGK, TURMOB, ISKUR
  url TEXT NOT NULL,
  tip TEXT NOT NULL DEFAULT 'html', -- html | rss | api | pdf
  erisim_yontemi TEXT NOT NULL DEFAULT 'scrape', -- scrape | api | rss | manual
  aktif BOOLEAN NOT NULL DEFAULT TRUE,
  tarama_araligi_dakika INT NOT NULL DEFAULT 1440, -- varsayilan gunluk
  son_tarama TIMESTAMPTZ,
  son_basari TIMESTAMPTZ,
  hata_sayisi INT NOT NULL DEFAULT 0,
  aciklama TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mevzuat_kaynaklar_office_idx ON mevzuat_kaynaklar (office_id);
CREATE INDEX IF NOT EXISTS mevzuat_kaynaklar_aktif_idx ON mevzuat_kaynaklar (aktif);

-- 2) Mevzuat kayitlari (taranan yayinlar/duyurular/tebligler)
CREATE TABLE IF NOT EXISTS mevzuat_kayitlari (
  id BIGSERIAL PRIMARY KEY,
  office_id BIGINT NOT NULL DEFAULT 1,
  kaynak_id BIGINT REFERENCES mevzuat_kaynaklar(id) ON DELETE SET NULL,
  baslik TEXT NOT NULL,
  kurum TEXT NOT NULL,
  yayin_tarihi DATE,
  yururluk_tarihi DATE,
  gecis_hukmu TEXT,
  ozet TEXT,
  onemli_degisiklikler JSONB,      -- AI cikarimi (aday)
  tarih_adaylari JSONB,            -- { beyan, odeme, sgk, basvuru, ... }
  yukumluluk_adaylari JSONB,
  kaynak_url TEXT NOT NULL,
  kaynak_bolum TEXT,               -- ilgili bolum/baslik
  ham_metin TEXT,                  -- okunabilen metin (varsa)
  metin_okunamadi BOOLEAN NOT NULL DEFAULT FALSE,
  tarama_hatasi TEXT,
  inceleme_durumu TEXT NOT NULL DEFAULT 'bekliyor', -- bekliyor | incelendi | onaylandi | reddedildi
  onaylayan_user_id UUID,
  onay_tarihi TIMESTAMPTZ,
  onceki_surum_id BIGINT REFERENCES mevzuat_kayitlari(id) ON DELETE SET NULL,
  karsilastirma TEXT,              -- AI fark analizi (aday)
  olusturma_ts TIMESTAMPTZ DEFAULT NOW(),
  guncelleme_ts TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mevzuat_kayitlari_office_idx ON mevzuat_kayitlari (office_id);
CREATE INDEX IF NOT EXISTS mevzuat_kayitlari_kaynak_idx ON mevzuat_kayitlari (kaynak_id);
CREATE INDEX IF NOT EXISTS mevzuat_kayitlari_inceleme_idx ON mevzuat_kayitlari (inceleme_durumu);
CREATE INDEX IF NOT EXISTS mevzuat_kayitlari_yayin_idx ON mevzuat_kayitlari (yayin_tarihi DESC);

-- 3) Tarama loglari (her tarama denemesi)
CREATE TABLE IF NOT EXISTS mevzuat_tarama_loglari (
  id BIGSERIAL PRIMARY KEY,
  office_id BIGINT NOT NULL DEFAULT 1,
  kaynak_id BIGINT REFERENCES mevzuat_kaynaklar(id) ON DELETE CASCADE,
  baslangic_ts TIMESTAMPTZ DEFAULT NOW(),
  bitis_ts TIMESTAMPTZ,
  durum TEXT NOT NULL DEFAULT 'calisiyor', -- calisiyor | basarili | hata | kismi
  yeni_kayit_sayisi INT NOT NULL DEFAULT 0,
  degisen_kayit_sayisi INT NOT NULL DEFAULT 0,
  hata_mesaji TEXT,
  http_status INT,
  sure_ms INT
);
CREATE INDEX IF NOT EXISTS mevzuat_tarama_loglari_kaynak_idx ON mevzuat_tarama_loglari (kaynak_id);
CREATE INDEX IF NOT EXISTS mevzuat_tarama_loglari_baslangic_idx ON mevzuat_tarama_loglari (baslangic_ts DESC);

-- 4) Onaylanan kurallar (mevzuat kaydindan cikarilan ve musavirce onaylanan)
CREATE TABLE IF NOT EXISTS mevzuat_kurallar (
  id BIGSERIAL PRIMARY KEY,
  office_id BIGINT NOT NULL DEFAULT 1,
  mevzuat_kayit_id BIGINT REFERENCES mevzuat_kayitlari(id) ON DELETE CASCADE,
  baslik TEXT NOT NULL,
  kural_tipi TEXT NOT NULL DEFAULT 'tarih', -- tarih | yukumluluk | basvuru | teşvik
  konu TEXT,
  ilgili_kurum TEXT,
  tarih DATE,
  son_basvuru_tarihi DATE,
  dayanak_url TEXT,
  dayanak_bolum TEXT,
  onaylayan_user_id UUID,
  onay_tarihi TIMESTAMPTZ DEFAULT NOW(),
  durum TEXT NOT NULL DEFAULT 'aktif', -- aktif | iptal | suresi_doldu
  aciklama TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mevzuat_kurallar_office_idx ON mevzuat_kurallar (office_id);
CREATE INDEX IF NOT EXISTS mevzuat_kurallar_tarih_idx ON mevzuat_kurallar (tarih);
CREATE INDEX IF NOT EXISTS mevzuat_kurallar_durum_idx ON mevzuat_kurallar (durum);

-- 5) Mükellef eşleşmeleri (aday — kesin uygunluk degil)
CREATE TABLE IF NOT EXISTS mevzuat_mukellef_eslesmeleri (
  id BIGSERIAL PRIMARY KEY,
  office_id BIGINT NOT NULL DEFAULT 1,
  mevzuat_kural_id BIGINT REFERENCES mevzuat_kurallar(id) ON DELETE CASCADE,
  client_id BIGINT NOT NULL,
  eslesme_tipi TEXT NOT NULL DEFAULT 'aday', -- aday | kontrol_gerekli | uygun | uygun_degil
  gerekce TEXT,
  eksik_bilgiler JSONB,            -- eksik/eski bilgi listesi
  kontrol_gerekli BOOLEAN NOT NULL DEFAULT FALSE,
  onaylayan_user_id UUID,
  onay_tarihi TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (mevzuat_kural_id, client_id)
);
CREATE INDEX IF NOT EXISTS mevzuat_mukellef_eslesmeleri_office_idx ON mevzuat_mukellef_eslesmeleri (office_id);
CREATE INDEX IF NOT EXISTS mevzuat_mukellef_eslesmeleri_client_idx ON mevzuat_mukellef_eslesmeleri (client_id);
CREATE INDEX IF NOT EXISTS mevzuat_mukellef_eslesmeleri_tip_idx ON mevzuat_mukellef_eslesmeleri (eslesme_tipi);

-- 6) Gorevler
CREATE TABLE IF NOT EXISTS mevzuat_gorevler (
  id BIGSERIAL PRIMARY KEY,
  office_id BIGINT NOT NULL DEFAULT 1,
  mevzuat_kural_id BIGINT REFERENCES mevzuat_kurallar(id) ON DELETE SET NULL,
  client_id BIGINT,
  baslik TEXT NOT NULL,
  aciklama TEXT,
  sorumlu_user_id UUID,
  son_tarih DATE,
  durum TEXT NOT NULL DEFAULT 'bekliyor', -- bekliyor | devam | tamamlandi | iptal
  oncelik TEXT NOT NULL DEFAULT 'normal', -- dusuk | normal | yuksek | acil
  dayanak_url TEXT,
  olusturan_user_id UUID,
  olusturma_ts TIMESTAMPTZ DEFAULT NOW(),
  guncelleme_ts TIMESTAMPTZ DEFAULT NOW(),
  tamamlanma_ts TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS mevzuat_gorevler_office_idx ON mevzuat_gorevler (office_id);
CREATE INDEX IF NOT EXISTS mevzuat_gorevler_sorumlu_idx ON mevzuat_gorevler (sorumlu_user_id);
CREATE INDEX IF NOT EXISTS mevzuat_gorevler_durum_idx ON mevzuat_gorevler (durum);
CREATE INDEX IF NOT EXISTS mevzuat_gorevler_son_tarih_idx ON mevzuat_gorevler (son_tarih);
-- Tekrarlayan gorev onleme: ayni kaynak + musteri icin tek aktif gorev
CREATE UNIQUE INDEX IF NOT EXISTS mevzuat_gorevler_tekrar_idx
  ON mevzuat_gorevler (office_id, mevzuat_kural_id, client_id)
  WHERE durum IN ('bekliyor', 'devam');

-- 7) Inceleme kararlari (audit trail)
CREATE TABLE IF NOT EXISTS mevzuat_inceleme_kararlari (
  id BIGSERIAL PRIMARY KEY,
  office_id BIGINT NOT NULL DEFAULT 1,
  mevzuat_kayit_id BIGINT REFERENCES mevzuat_kayitlari(id) ON DELETE CASCADE,
  karar TEXT NOT NULL, -- onay | red | ertele | duzenle
  yorum TEXT,
  kullanici_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mevzuat_inceleme_kararlari_kayit_idx ON mevzuat_inceleme_kararlari (mevzuat_kayit_id);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE mevzuat_kaynaklar ENABLE ROW LEVEL SECURITY;
ALTER TABLE mevzuat_kayitlari ENABLE ROW LEVEL SECURITY;
ALTER TABLE mevzuat_tarama_loglari ENABLE ROW LEVEL SECURITY;
ALTER TABLE mevzuat_kurallar ENABLE ROW LEVEL SECURITY;
ALTER TABLE mevzuat_mukellef_eslesmeleri ENABLE ROW LEVEL SECURITY;
ALTER TABLE mevzuat_gorevler ENABLE ROW LEVEL SECURITY;
ALTER TABLE mevzuat_inceleme_kararlari ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['mevzuat_kaynaklar','mevzuat_kayitlari','mevzuat_tarama_loglari','mevzuat_kurallar','mevzuat_mukellef_eslesmeleri','mevzuat_gorevler','mevzuat_inceleme_kararlari']) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_select_authenticated') THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)', t || '_select_authenticated', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_insert_authenticated') THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (true)', t || '_insert_authenticated', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_update_authenticated') THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t || '_update_authenticated', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_delete_authenticated') THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (true)', t || '_delete_authenticated', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
