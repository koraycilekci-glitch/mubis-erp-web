-- ============================================================
-- Luca'dan Önerilen Özellikler — Veri Altyapısı
-- ============================================================
-- 1. Gider Fişi Sınıflandırma (gider_fisleri, gider_fisi_kdv_kirilimi)
-- 2. Defter-Beyan Uyumu (defter_beyan_kontrol)
-- 3. Vergi Deneme Bilançosu (vergi_deneme_bilancosu)
-- 4. Toplu Belge İşlemleri (toplu_belge_islemleri)
-- 5. Finansman Gider Kısıtlaması (finansman_gider_kisitlamasi)
-- 6. Stopaj/Tevkifat Kanıtları (stopaj_kanitlari)
-- 7. İşletme Giderleri Takibi (isletme_giderleri)
-- 8. Belge Arşiv Karşılaştırma (belge_arsiv_karsilastirma)
-- 9. Raporlama/Export (raporlar)
-- 10. E-SMM Geçmişi (esmm_gecmisi)
-- 11. Beyanname-Tahakkuk Eşleştirme (beyanname_tahakkuk_eslestirme)
-- ============================================================

-- 1) Gider Fişi Sınıflandırma
CREATE TABLE IF NOT EXISTS gider_fisleri (
  id BIGSERIAL PRIMARY KEY,
  office_id BIGINT NOT NULL DEFAULT 1,
  client_id BIGINT,
  fis_no TEXT,
  fis_tarihi DATE,
  satici TEXT,
  tutar NUMERIC(15,2),
  kdv_toplam NUMERIC(15,2),
  matrah_toplam NUMERIC(15,2),
  kdv_oranlari JSONB,          -- [{ oran: 1, matrah, kdv }, { oran: 10, ... }, { oran: 20, ... }]
  siniflandirma_durumu TEXT DEFAULT 'bekliyor', -- bekliyor | siniflandirildi | hata
  fis_detay_uyari TEXT,
  url TEXT,                     -- dosya URL (Storage/Drive)
  kaynak TEXT DEFAULT 'manuel', -- manuel | ocr | ai
  olusturma_ts TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gider_fisleri_office_idx ON gider_fisleri (office_id);
CREATE INDEX IF NOT EXISTS gider_fisleri_client_idx ON gider_fisleri (client_id);
CREATE INDEX IF NOT EXISTS gider_fisleri_tarih_idx ON gider_fisleri (fis_tarihi);

-- 2) Defter-Beyan Uyumu
CREATE TABLE IF NOT EXISTS defter_beyan_kontrol (
  id BIGSERIAL PRIMARY KEY,
  office_id BIGINT NOT NULL DEFAULT 1,
  client_id BIGINT NOT NULL,
  yil INT NOT NULL,
  ay INT,
  donem TEXT,                    -- '2026-01' gibi
  beyan_turu TEXT NOT NULL,      -- kdv, kdv2, muhtasar, sgk, gecici_vergi, kurumlar, gelir
  defter_tutar NUMERIC(15,2),
  beyan_tutar NUMERIC(15,2),
  fark NUMERIC(15,2),
  uyumlu BOOLEAN,
  kontrol_tarihi TIMESTAMPTZ DEFAULT NOW(),
  aciklama TEXT,
  UNIQUE (office_id, client_id, yil, ay, beyan_turu)
);
CREATE INDEX IF NOT EXISTS defter_beyan_kontrol_office_idx ON defter_beyan_kontrol (office_id);
CREATE INDEX IF NOT EXISTS defter_beyan_kontrol_client_idx ON defter_beyan_kontrol (client_id);

-- 3) Vergi Deneme Bilançosu
CREATE TABLE IF NOT EXISTS vergi_deneme_bilancosu (
  id BIGSERIAL PRIMARY KEY,
  office_id BIGINT NOT NULL DEFAULT 1,
  client_id BIGINT NOT NULL,
  donem TEXT NOT NULL,           -- '2026-Q1', '2026-06' gibi
  yil INT NOT NULL,
  ay INT,
  aktif_toplam NUMERIC(15,2),
  pasif_toplam NUMERIC(15,2),
  gelir_toplam NUMERIC(15,2),
  gider_toplam NUMERIC(15,2),
  vergi_matrahi NUMERIC(15,2),
  hesaplanan_vergi NUMERIC(15,2),
  durum TEXT DEFAULT 'taslak',   -- taslak | tamamlandi | onaylandi
  olusturma_ts TIMESTAMPTZ DEFAULT NOW(),
  guncelleme_ts TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS vergi_deneme_bilancosu_office_idx ON vergi_deneme_bilancosu (office_id);
CREATE INDEX IF NOT EXISTS vergi_deneme_bilancosu_client_idx ON vergi_deneme_bilancosu (client_id);

-- 4) Toplu Belge İşlemleri
CREATE TABLE IF NOT EXISTS toplu_belge_islemleri (
  id BIGSERIAL PRIMARY KEY,
  office_id BIGINT NOT NULL DEFAULT 1,
  client_id BIGINT,
  islem_tipi TEXT NOT NULL,      -- indirme | yukleme | paylasma | arsiv
  dosya_listesi JSONB,           -- [{ ad, url, boyut, tur }]
  durum TEXT DEFAULT 'bekliyor', -- bekliyor | calisiyor | tamamlandi | hata
  islenen_sayisi INT DEFAULT 0,
  toplam_sayisi INT DEFAULT 0,
  hata_mesaji TEXT,
  olusturma_ts TIMESTAMPTZ DEFAULT NOW(),
  tamamlanma_ts TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS toplu_belge_islemleri_office_idx ON toplu_belge_islemleri (office_id);

-- 5) Finansman Gider Kısıtlaması
CREATE TABLE IF NOT EXISTS finansman_gider_kisitlamasi (
  id BIGSERIAL PRIMARY KEY,
  office_id BIGINT NOT NULL DEFAULT 1,
  client_id BIGINT NOT NULL,
  yil INT NOT NULL,
  donem TEXT,
  toplam_finansman_gideri NUMERIC(15,2),
  kisitlanan_tutar NUMERIC(15,2),
  indirilebilir_tutar NUMERIC(15,2),
  hesaplama_detayi JSONB,
  durum TEXT DEFAULT 'taslak',
  olusturma_ts TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS finansman_gider_kisitlamasi_office_idx ON finansman_gider_kisitlamasi (office_id);
CREATE INDEX IF NOT EXISTS finansman_gider_kisitlamasi_client_idx ON finansman_gider_kisitlamasi (client_id);

-- 6) Stopaj/Tevkifat Kanıtları
CREATE TABLE IF NOT EXISTS stopaj_kanitlari (
  id BIGSERIAL PRIMARY KEY,
  office_id BIGINT NOT NULL DEFAULT 1,
  client_id BIGINT NOT NULL,
  yil INT NOT NULL,
  ay INT,
  stopaj_turu TEXT NOT NULL,     -- kira_stopaji, serbest_meslek, diger
  kanit_turu TEXT,               -- banka_dekontu, makbuz, diger
  tutar NUMERIC(15,2),
  tarih DATE,
  url TEXT,                      -- dosya URL (Storage/Drive)
  durum TEXT DEFAULT 'bekliyor', -- bekliyor | dogrulandi | reddedildi
  olusturma_ts TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS stopaj_kanitlari_office_idx ON stopaj_kanitlari (office_id);
CREATE INDEX IF NOT EXISTS stopaj_kanitlari_client_idx ON stopaj_kanitlari (client_id);

-- 7) İşletme Giderleri Takibi
CREATE TABLE IF NOT EXISTS isletme_giderleri (
  id BIGSERIAL PRIMARY KEY,
  office_id BIGINT NOT NULL DEFAULT 1,
  client_id BIGINT,
  gider_turu TEXT NOT NULL,      -- kirtasiye, yakit, telefon, internet, kira, diger
  aciklama TEXT,
  tutar NUMERIC(15,2),
  tarih DATE,
  kdv_orani INT,
  kdv_tutari NUMERIC(15,2),
  url TEXT,                      -- fis/fatura URL
  durum TEXT DEFAULT 'bekliyor', -- bekliyor | onaylandi | reddedildi
  olusturma_ts TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS isletme_giderleri_office_idx ON isletme_giderleri (office_id);
CREATE INDEX IF NOT EXISTS isletme_giderleri_client_idx ON isletme_giderleri (client_id);
CREATE INDEX IF NOT EXISTS isletme_giderleri_tarih_idx ON isletme_giderleri (tarih);

-- 8) Belge Arşiv Karşılaştırma
CREATE TABLE IF NOT EXISTS belge_arsiv_karsilastirma (
  id BIGSERIAL PRIMARY KEY,
  office_id BIGINT NOT NULL DEFAULT 1,
  client_id BIGINT,
  karsilastirma_tarihi TIMESTAMPTZ DEFAULT NOW(),
  toplam_belge INT DEFAULT 0,
  eslesen_belge INT DEFAULT 0,
  eksik_belge INT DEFAULT 0,
  fazla_belge INT DEFAULT 0,
  detay JSONB,                   -- [{ dosya, durum: 'eslesen'|'eksik'|'fazla' }]
  durum TEXT DEFAULT 'tamamlandi' -- tamamlandi | hata
);
CREATE INDEX IF NOT EXISTS belge_arsiv_karsilastirma_office_idx ON belge_arsiv_karsilastirma (office_id);

-- 9) Raporlama/Export
CREATE TABLE IF NOT EXISTS raporlar (
  id BIGSERIAL PRIMARY KEY,
  office_id BIGINT NOT NULL DEFAULT 1,
  rapor_tipi TEXT NOT NULL,      -- kdv_muavin | defter_beyan | vergi_deneme | gider_siniflandirma | genel
  rapor_adi TEXT NOT NULL,
  parametreler JSONB,
  sonuc_ozeti JSONB,
  olusturan_user_id UUID,
  olusturma_ts TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS raporlar_office_idx ON raporlar (office_id);
CREATE INDEX IF NOT EXISTS raporlar_tip_idx ON raporlar (rapor_tipi);

-- 10) E-SMM Geçmişi
CREATE TABLE IF NOT EXISTS esmm_gecmisi (
  id BIGSERIAL PRIMARY KEY,
  office_id BIGINT NOT NULL DEFAULT 1,
  client_id BIGINT NOT NULL,
  makbuz_no TEXT,
  makbuz_tarihi DATE,
  tutar NUMERIC(15,2),
  kdv NUMERIC(15,2),
  kdv_orani INT,
  alici_unvan TEXT,
  alici_vkn TEXT,
  url TEXT,                      -- dosya URL
  durum TEXT DEFAULT 'kayitli',  -- kayitli | iptal | gonderildi
  olusturma_ts TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS esmm_gecmisi_office_idx ON esmm_gecmisi (office_id);
CREATE INDEX IF NOT EXISTS esmm_gecmisi_client_idx ON esmm_gecmisi (client_id);

-- 11) Beyanname-Tahakkuk Eşleştirme
CREATE TABLE IF NOT EXISTS beyanname_tahakkuk_eslestirme (
  id BIGSERIAL PRIMARY KEY,
  office_id BIGINT NOT NULL DEFAULT 1,
  client_id BIGINT NOT NULL,
  yil INT NOT NULL,
  ay INT NOT NULL,
  beyan_turu TEXT NOT NULL,      -- kdv, kdv2, muhtasar, sgk, gecici_vergi, kurumlar, gelir
  beyanname_url TEXT,
  tahakkuk_url TEXT,
  beyan_tutar NUMERIC(15,2),
  tahakkuk_tutar NUMERIC(15,2),
  fark NUMERIC(15,2),
  uyumlu BOOLEAN,
  eslestirme_tarihi TIMESTAMPTZ DEFAULT NOW(),
  aciklama TEXT,
  UNIQUE (office_id, client_id, yil, ay, beyan_turu)
);
CREATE INDEX IF NOT EXISTS beyanname_tahakkuk_eslestirme_office_idx ON beyanname_tahakkuk_eslestirme (office_id);
CREATE INDEX IF NOT EXISTS beyanname_tahakkuk_eslestirme_client_idx ON beyanname_tahakkuk_eslestirme (client_id);

-- ============================================================
-- RLS (tum tablolar icin)
-- ============================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'gider_fisleri','defter_beyan_kontrol','vergi_deneme_bilancosu',
    'toplu_belge_islemleri','finansman_gider_kisitlamasi','stopaj_kanitlari',
    'isletme_giderleri','belge_arsiv_karsilastirma','raporlar',
    'esmm_gecmisi','beyanname_tahakkuk_eslestirme'
  ]) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
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