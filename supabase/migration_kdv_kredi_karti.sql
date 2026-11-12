-- KDV Dökümleri ve Kredi Kartı Hasılatı tabloları
-- 2.7.400: Müşteri DVS'den sorgulanan KDV 109/110 ve kredi kartı tahsilatı kayıtları

-- Kredi kartı ile tahsil edilen aylık toplam (DVS sorgulamalar/doğrulamalar)
CREATE TABLE IF NOT EXISTS kredi_karti_hasilat (
  id BIGSERIAL PRIMARY KEY,
  office_id BIGINT REFERENCES offices(id) ON DELETE CASCADE,
  client_id BIGINT REFERENCES clients(id) ON DELETE CASCADE,
  yil INT NOT NULL,
  ay INT NOT NULL CHECK (ay BETWEEN 1 AND 12),
  banka_pos_tutar NUMERIC(15,2) DEFAULT 0,
  odeme_para_tutar NUMERIC(15,2) DEFAULT 0,
  toplam_tutar NUMERIC(15,2) GENERATED ALWAYS AS (COALESCE(banka_pos_tutar,0) + COALESCE(odeme_para_tutar,0)) STORED,
  sorgu_tarihi DATE,
  kaynak TEXT DEFAULT 'manuel', -- manuel | otomatik
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(office_id, client_id, yil, ay)
);

-- KDV dökümleri: 109 sorumlu sıfatıyla ödenen KDV, 110 ithalde ödenen KDV
-- detaylar: her satır için tarih, beyanname_no, matrah, kdv vb. JSONB dizisi
CREATE TABLE IF NOT EXISTS kdv_dokumleri (
  id BIGSERIAL PRIMARY KEY,
  office_id BIGINT REFERENCES offices(id) ON DELETE CASCADE,
  client_id BIGINT REFERENCES clients(id) ON DELETE CASCADE,
  yil INT NOT NULL,
  ay INT NOT NULL CHECK (ay BETWEEN 1 AND 12),
  tur TEXT NOT NULL CHECK (tur IN ('109','110')),
  toplam_tutar NUMERIC(15,2) DEFAULT 0,
  detaylar JSONB DEFAULT '[]'::jsonb,
  sorgu_tarihi DATE,
  kaynak TEXT DEFAULT 'manuel',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(office_id, client_id, yil, ay, tur)
);

-- Otomatik sorgu ve retry takibi
CREATE TABLE IF NOT EXISTS dvs_sorgu_loglari (
  id BIGSERIAL PRIMARY KEY,
  office_id BIGINT REFERENCES offices(id) ON DELETE CASCADE,
  client_id BIGINT REFERENCES clients(id) ON DELETE CASCADE,
  yil INT NOT NULL,
  ay INT NOT NULL CHECK (ay BETWEEN 1 AND 12),
  tur TEXT NOT NULL CHECK (tur IN ('pos','109','110')),
  durum TEXT NOT NULL DEFAULT 'bekliyor', -- bekliyor | basarili | hata | sifir
  hata TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Aylık KDV hesap özeti (devreden / ödeme)
CREATE TABLE IF NOT EXISTS kdv_durum_kartlari (
  id BIGSERIAL PRIMARY KEY,
  office_id BIGINT REFERENCES offices(id) ON DELETE CASCADE,
  client_id BIGINT REFERENCES clients(id) ON DELETE CASCADE,
  yil INT NOT NULL,
  ay INT NOT NULL CHECK (ay BETWEEN 1 AND 12),
  devreden_giris NUMERIC(15,2) DEFAULT 0,
  alinan_kdv NUMERIC(15,2) DEFAULT 0,
  kdv_109 NUMERIC(15,2) DEFAULT 0,
  kdv_110 NUMERIC(15,2) DEFAULT 0,
  indirilebilir_toplam NUMERIC(15,2) DEFAULT 0,
  kesilen_kdv NUMERIC(15,2) DEFAULT 0,
  odeme NUMERIC(15,2) DEFAULT 0,
  devreden_sonraki NUMERIC(15,2) DEFAULT 0,
  beyan_url TEXT,
  kaynak TEXT DEFAULT 'manuel',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(office_id, client_id, yil, ay)
);

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_kredi_karti_hasilat_client ON kredi_karti_hasilat(client_id);
CREATE INDEX IF NOT EXISTS idx_kredi_karti_hasilat_donem ON kredi_karti_hasilat(yil, ay);
CREATE INDEX IF NOT EXISTS idx_kdv_dokumleri_client ON kdv_dokumleri(client_id);
CREATE INDEX IF NOT EXISTS idx_kdv_dokumleri_donem ON kdv_dokumleri(yil, ay);
CREATE INDEX IF NOT EXISTS idx_dvs_sorgu_loglari_client ON dvs_sorgu_loglari(client_id);
CREATE INDEX IF NOT EXISTS idx_dvs_sorgu_loglari_donem ON dvs_sorgu_loglari(yil, ay, tur);
CREATE INDEX IF NOT EXISTS idx_kdv_durum_kartlari_client ON kdv_durum_kartlari(client_id);
CREATE INDEX IF NOT EXISTS idx_kdv_durum_kartlari_donem ON kdv_durum_kartlari(yil, ay);

-- updated_at otomatik güncelleme
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kredi_karti_hasilat_updated ON kredi_karti_hasilat;
CREATE TRIGGER trg_kredi_karti_hasilat_updated
  BEFORE UPDATE ON kredi_karti_hasilat
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_kdv_dokumleri_updated ON kdv_dokumleri;
CREATE TRIGGER trg_kdv_dokumleri_updated
  BEFORE UPDATE ON kdv_dokumleri
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_dvs_sorgu_loglari_updated ON dvs_sorgu_loglari;
CREATE TRIGGER trg_dvs_sorgu_loglari_updated
  BEFORE UPDATE ON dvs_sorgu_loglari
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_kdv_durum_kartlari_updated ON kdv_durum_kartlari;
CREATE TRIGGER trg_kdv_durum_kartlari_updated
  BEFORE UPDATE ON kdv_durum_kartlari
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS etkinleştir
ALTER TABLE kredi_karti_hasilat ENABLE ROW LEVEL SECURITY;
ALTER TABLE kdv_dokumleri ENABLE ROW LEVEL SECURITY;
ALTER TABLE dvs_sorgu_loglari ENABLE ROW LEVEL SECURITY;
ALTER TABLE kdv_durum_kartlari ENABLE ROW LEVEL SECURITY;

-- Mevcut politikaları temizle
DROP POLICY IF EXISTS kredi_karti_hasilat_office ON kredi_karti_hasilat;
DROP POLICY IF EXISTS kdv_dokumleri_office ON kdv_dokumleri;
DROP POLICY IF EXISTS dvs_sorgu_loglari_office ON dvs_sorgu_loglari;
DROP POLICY IF EXISTS kdv_durum_kartlari_office ON kdv_durum_kartlari;

-- Ofis bazlı erişim
CREATE POLICY kredi_karti_hasilat_office ON kredi_karti_hasilat
  FOR ALL USING (office_id = my_office_id() OR is_super_admin());

CREATE POLICY kdv_dokumleri_office ON kdv_dokumleri
  FOR ALL USING (office_id = my_office_id() OR is_super_admin());

CREATE POLICY dvs_sorgu_loglari_office ON dvs_sorgu_loglari
  FOR ALL USING (office_id = my_office_id() OR is_super_admin());

CREATE POLICY kdv_durum_kartlari_office ON kdv_durum_kartlari
  FOR ALL USING (office_id = my_office_id() OR is_super_admin());
